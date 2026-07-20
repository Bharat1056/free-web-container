import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionAssistantMessageParam,
} from "openai/resources/chat/completions";
import { NonRetriableError } from "inngest";
import { PROMPT } from "@/prompt";
import {
  getRateLimitDelayMs,
  throwIfRateLimited,
} from "@/inngest/rate-limit";
import {
  OPENAI_CODE_TOOLS,
  executeSandboxTool,
  writePartialsToSandbox,
  type SandboxFileMap,
} from "@/inngest/sandbox-tools";
import {
  buildGroundedContinuationMessage,
  extractSalvageablePartials,
} from "@/inngest/partial-salvage";
import {
  MAX_CODE_CONTINUATION_ATTEMPTS,
  MAX_CODE_ITERS,
} from "@/constants";

/** Inngest step subset — kept loose because step.run Jsonifies return values. */
type StepTools = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (id: string, fn: () => Promise<any>) => Promise<any>;
  sleep: (id: string, duration: string | number) => Promise<unknown>;
};

type AgentKitTextMessage = {
  type?: string;
  role?: string;
  content?: unknown;
};

type FunctionToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type CompleteInference = {
  status: "complete";
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: FunctionToolCall[];
  };
};

type RateLimitedInference = {
  status: "rate_limited";
  partialText: string;
  partialToolArgs: Array<{
    name: string;
    argumentsSoFar: string;
  }>;
  retryAfter: number;
};

type InferenceResult = CompleteInference | RateLimitedInference;

export type CodeToolLoopResult = {
  summary: string;
  files: SandboxFileMap;
};

/**
 * Converts agent-kit history messages into OpenAI chat message params.
 * Supports string content or arrays of `{ text }` parts.
 *
 * @param messages - Prior agent-kit / RAG messages
 * @returns OpenAI-compatible user/assistant messages (empty content skipped)
 */
function agentKitMessagesToOpenAI(
  messages: AgentKitTextMessage[]
): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [];
  for (const msg of messages) {
    if (msg.type && msg.type !== "text") continue;
    const role = msg.role === "assistant" ? "assistant" : "user";
    let content = "";
    if (typeof msg.content === "string") {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      content = msg.content
        .map((part) =>
          typeof part === "object" &&
          part !== null &&
          "text" in part &&
          typeof (part as { text: unknown }).text === "string"
            ? (part as { text: string }).text
            : ""
        )
        .join("");
    }
    if (!content.trim()) continue;
    out.push({ role, content });
  }
  return out;
}

/**
 * Formats a millisecond delay as an Inngest `step.sleep` duration string.
 *
 * @param ms - Delay in milliseconds
 * @returns Duration like `"30s"` (minimum 1 second)
 */
function formatRetryAfter(ms: number): string {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  return `${seconds}s`;
}

/**
 * Streams one OpenAI chat completion with tools.
 * Tries the configured model chain for failures that happen before any output,
 * while preserving same-model continuation after a mid-stream rate limit.
 * On TPM/429 mid-stream, returns accumulated partials instead of throwing.
 *
 * @param input.modelIds - Ordered OpenAI model ids (primary, then fallbacks)
 * @param input.messages - Full chat history for this inference
 * @returns Complete assistant message, or a rate-limited partial checkpoint
 */
async function streamCompletion(input: {
  modelIds: string[];
  messages: ChatCompletionMessageParam[];
}): Promise<InferenceResult> {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  let lastError: unknown;

  for (const modelId of input.modelIds) {
    let partialText = "";
    const toolAccum = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();

    try {
      const stream = await client.chat.completions.create({
        model: modelId,
        messages: input.messages,
        tools: OPENAI_CODE_TOOLS,
        tool_choice: "auto",
        stream: true,
      });

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;
        if (typeof delta.content === "string") {
          partialText += delta.content;
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const existing = toolAccum.get(idx) ?? {
              id: "",
              name: "",
              arguments: "",
            };
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name += tc.function.name;
            if (tc.function?.arguments) {
              existing.arguments += tc.function.arguments;
            }
            toolAccum.set(idx, existing);
          }
        }
      }

      const toolCalls: FunctionToolCall[] = [...toolAccum.entries()]
        .sort(([a], [b]) => a - b)
        .filter(([, t]) => t.id && t.name)
        .map(([, t]) => ({
          id: t.id,
          type: "function" as const,
          function: {
            name: t.name,
            arguments: t.arguments,
          },
        }));

      return {
        status: "complete",
        message: {
          role: "assistant",
          content: partialText || null,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
      };
    } catch (error) {
      lastError = error;
      const delayMs = getRateLimitDelayMs(error);
      const hasPartial = Boolean(partialText) || toolAccum.size > 0;

      // Rate limit (TPM/429): return so the caller's step.sleep actually waits,
      // then retries. Do NOT switch models here — org TPM is shared, so the
      // fallback would likely 429 too and we'd burn attempts with no wait.
      // Any salvaged partials ride along for grounded continuation.
      if (delayMs != null) {
        const partialToolArgs = [...toolAccum.values()]
          .filter((t) => t.name)
          .map((t) => ({
            name: t.name,
            argumentsSoFar: t.arguments,
          }));

        return {
          status: "rate_limited",
          partialText,
          partialToolArgs,
          retryAfter: delayMs,
        };
      }

      // Genuine (non-rate-limit) failure. Switching models after receiving
      // output can duplicate or corrupt a partial tool call, so only fall back
      // when this model produced nothing.
      if (hasPartial) {
        throw error;
      }
      console.error(
        `OpenAI code model "${modelId}" failed; trying fallback:`,
        error
      );
    }
  }

  throw lastError ?? new Error("No OpenAI code model is configured");
}

/**
 * Detects a finished coding turn and extracts only the `<task_summary>` text.
 * Prevents any inline code/prose the model emitted from leaking into the
 * saved summary, title, and user-facing response.
 *
 * @param content - Assistant message text
 * @returns The trimmed summary text, or null when no task summary is present
 */
function extractTaskSummary(content: string | null | undefined): string | null {
  if (!content) return null;

  // Models sometimes wrap the mandated tags in a markdown fence.
  const normalized = content
    .replace(/```(?:xml|html|text)?\s*\n?/gi, "")
    .replace(/```/g, "")
    .trim();

  const match = normalized.match(/<task_summary>([\s\S]*?)<\/task_summary>/i);
  if (match) {
    const inner = match[1].trim();
    return inner.length > 0 ? inner : null;
  }
  // Tolerate a missing closing tag: take everything after the opening tag.
  const openIdx = normalized.toLowerCase().indexOf("<task_summary>");
  if (openIdx !== -1) {
    const tagLen = "<task_summary>".length;
    const inner = normalized.slice(openIdx + tagLen).trim();
    return inner.length > 0 ? inner : null;
  }
  return null;
}

/**
 * Builds a user-facing summary when the model finished writing files but
 * never emitted a valid `<task_summary>` block.
 */
function fallbackSummary(
  content: string | null | undefined,
  files: SandboxFileMap
): string {
  if (content) {
    const cleaned = content
      .replace(/```[\s\S]*?```/g, "")
      .replace(/<\/?task_summary>/gi, "")
      .replace(/^\s*#{1,6}\s+/gm, "")
      .trim();
    const looksLikeCode =
      /\b(export\s+(default\s+)?function|const\s+\w+\s*=\s*\(|import\s+.+from)\b/.test(
        cleaned
      );
    if (
      cleaned.length >= 20 &&
      cleaned.length <= 800 &&
      !looksLikeCode
    ) {
      return cleaned
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 6)
        .join(" ")
        .slice(0, 500);
    }
  }

  const paths = Object.keys(files);
  if (paths.length === 0) {
    return "Completed the request.";
  }
  return `Updated ${paths.length} file${paths.length === 1 ? "" : "s"} based on your request.`;
}

/** Max characters of existing file content inlined into the edit context. */
const EDIT_CONTEXT_CHAR_BUDGET = 48_000;
/** Files larger than this are shown as a path-only stub to save budget. */
const EDIT_CONTEXT_PER_FILE_LIMIT = 12_000;

/**
 * Builds the edit-context message for a run against an existing project.
 *
 * Instead of only listing file paths (which lets the model regenerate files
 * from imagination), this inlines the actual current file contents so the
 * model edits from ground truth. Content is bounded by a total char budget;
 * oversized or overflow files are listed as paths for the model to readFiles.
 *
 * @param files - Current path -> content map from the sandbox/DB.
 * @returns A user message instructing a minimal, grounded edit.
 */
function buildEditContextMessage(files: SandboxFileMap): string {
  const entries = Object.entries(files);
  const included: string[] = [];
  const omitted: string[] = [];
  let used = 0;

  for (const [path, content] of entries) {
    const text = typeof content === "string" ? content : String(content ?? "");
    const block = `\n----- FILE: ${path} -----\n${text}\n`;
    if (text.length > EDIT_CONTEXT_PER_FILE_LIMIT || used + block.length > EDIT_CONTEXT_CHAR_BUDGET) {
      omitted.push(path);
      continue;
    }
    included.push(block);
    used += block.length;
  }

  const omittedNote = omitted.length
    ? `\n\nThese existing files were not inlined (too large). Use readFiles to read them before editing: ${omitted.join(", ")}.`
    : "";

  return `CONTEXT: This is an EDIT to an existing project. The current contents of the project files are below. Treat these as the source of truth — this is the app as it exists right now.
${included.join("")}${omittedNote}

Rules for this edit:
- Base every change on the file contents shown above (or read them with readFiles). Do NOT invent a new version of a file from scratch.
- When you call createOrUpdateFiles, the file content you provide REPLACES the whole file. So you must reproduce the existing file verbatim and apply ONLY the change the user asked for.
- Change ONLY what the user's request requires. Do not rewrite, restructure, restyle, rename, or "improve" unrelated files, components, copy, or layout.
- Preserve existing text content, layout, structure, class names, and design unless the request explicitly asks to change them.
- Only include a file in createOrUpdateFiles if it actually needs to change for this request.
- Apply the smallest diff that satisfies the request.`;
}

/**
 * Manual coding loop with durable Inngest steps per inference and tool call.
 * On mid-stream rate limits, checkpoints salvageable files to the sandbox,
 * sleeps, then continues the same model grounded via readFiles + full-file writes.
 *
 * @param input.step - Inngest step tools (`run`, `sleep`)
 * @param input.sandboxId - Active E2B sandbox id
 * @param input.files - Starting file map (existing fragment files)
 * @param input.historyMessages - Prior project chat for context
 * @param input.userPrompt - Current user request
 * @param input.enhancedPrompt - Optional design-enhancement brief
 * @param input.modelIds - Ordered OpenAI code model ids
 * @param input.maxIters - Max infer/tool rounds (default {@link MAX_CODE_ITERS})
 * @param input.maxContinuationAttempts - Max same-model TPM continues per infer
 * @returns Task summary text and final file map
 */
export async function runCodeToolLoop(input: {
  step: StepTools;
  sandboxId: string;
  files: SandboxFileMap;
  historyMessages: AgentKitTextMessage[];
  userPrompt: string;
  enhancedPrompt?: string;
  modelIds: string[];
  maxIters?: number;
  maxContinuationAttempts?: number;
}): Promise<CodeToolLoopResult> {
  const maxIters = input.maxIters ?? MAX_CODE_ITERS;
  const maxContinuationAttempts =
    input.maxContinuationAttempts ?? MAX_CODE_CONTINUATION_ATTEMPTS;

  let files = { ...input.files };
  /** Paths written by a completed createOrUpdateFiles tool call (not checkpoints). */
  const knownCompletePaths = new Set(Object.keys(files));
  let nudgedForSummary = false;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: PROMPT },
    ...agentKitMessagesToOpenAI(input.historyMessages),
    { role: "user", content: input.userPrompt },
  ];

  if (input.enhancedPrompt) {
    messages.push({
      role: "user",
      content: `ENHANCED DESIGN REQUIREMENTS:\n${input.enhancedPrompt}\n\nPlease implement this enhanced design specification.`,
    });
  }

  if (Object.keys(files).length > 0) {
    messages.push({
      role: "user",
      content: buildEditContextMessage(files),
    });
  }

  for (let iter = 0; iter < maxIters; iter++) {
    let completion: CompleteInference | null = null;

    for (let attempt = 0; attempt < maxContinuationAttempts; attempt++) {
      const inference = await input.step.run(
        `code-infer-${iter}-attempt-${attempt}`,
        async () => streamCompletion({ modelIds: input.modelIds, messages })
      );

      if (inference.status === "rate_limited") {
        const salvage = extractSalvageablePartials(inference);

        if (salvage.files.length > 0) {
          files = await input.step.run(
            `code-checkpoint-${iter}-${attempt}`,
            async () =>
              writePartialsToSandbox(input.sandboxId, files, salvage.files)
          );
          for (const path of salvage.paths) {
            knownCompletePaths.delete(path);
          }
        }

        messages.push({
          role: "user",
          content: buildGroundedContinuationMessage({
            incompletePaths: salvage.paths,
            completedPaths: [...knownCompletePaths],
            lastLinesByPath: salvage.lastLinesByPath,
          }),
        });

        await input.step.sleep(
          `code-infer-wait-${iter}-${attempt}`,
          formatRetryAfter(inference.retryAfter)
        );
        continue;
      }

      completion = inference;
      break;
    }

    if (!completion) {
      // Do NOT throw RetryAfterError here. Every infer/sleep step is already
      // memoized as rate_limited, so an outer Inngest retry would instantly
      // re-exhaust and storm 500s. Fail the run so the UI can show Retry.
      throw new NonRetriableError(
        `Model rate limit hit after ${maxContinuationAttempts} continuation attempts. Tap Retry in a minute.`
      );
    }

    const assistantMsg = completion.message;
    const assistantParam: ChatCompletionAssistantMessageParam = {
      role: "assistant",
      content: assistantMsg.content,
      ...(assistantMsg.tool_calls?.length
        ? { tool_calls: assistantMsg.tool_calls }
        : {}),
    };
    messages.push(assistantParam);

    const toolCalls = assistantMsg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const summary = extractTaskSummary(assistantMsg.content);
      if (summary) {
        return { summary, files };
      }

      if (!nudgedForSummary) {
        nudgedForSummary = true;
        messages.push({
          role: "user",
          content:
            "Stop using tools now. Reply with ONLY a <task_summary>...</task_summary> block describing what you built or changed — no markdown fences, no code, no other text.",
        });
        continue;
      }

      // Model often finishes the work but still omits the mandated tags.
      // Prefer salvaging a fragment over failing the whole run.
      if (Object.keys(files).length > 0) {
        console.warn(
          "Code tool loop: missing <task_summary> after nudge; salvaging fallback summary"
        );
        return {
          summary: fallbackSummary(assistantMsg.content, files),
          files,
        };
      }

      break;
    }

    for (let i = 0; i < toolCalls.length; i++) {
      const call = toolCalls[i];
      const toolName = call.function.name;
      const toolArgs = call.function.arguments;

      const previousPaths = new Set(Object.keys(files));
      const toolResult = await input.step.run(
        `code-tool-${iter}-${toolName}-${i}`,
        async () => {
          try {
            return await executeSandboxTool(
              toolName,
              toolArgs,
              input.sandboxId,
              files
            );
          } catch (error) {
            throwIfRateLimited(error);
            throw error;
          }
        }
      );

      files = toolResult.fileMap;
      if (toolName === "createOrUpdateFiles") {
        try {
          const parsed = JSON.parse(toolArgs) as {
            files?: Array<{ path?: string }>;
          };
          for (const file of parsed.files ?? []) {
            if (file.path) knownCompletePaths.add(file.path);
          }
        } catch {
          // Args weren't parseable — mark only paths that are newly present
          // (i.e. created by this call) as complete.
          for (const path of Object.keys(files)) {
            if (!previousPaths.has(path)) {
              knownCompletePaths.add(path);
            }
          }
        }
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: toolResult.content,
      });
    }
  }

  // Exhausted iters (or empty response path) without a tagged summary.
  if (Object.keys(files).length > 0) {
    const lastAssistant = [...messages]
      .reverse()
      .find(
        (m): m is ChatCompletionAssistantMessageParam =>
          m.role === "assistant" && typeof m.content === "string"
      );
    console.warn(
      "Code tool loop ended without <task_summary>; salvaging with fallback summary"
    );
    const summaryContent =
      typeof lastAssistant?.content === "string" ? lastAssistant.content : null;
    return {
      summary: fallbackSummary(summaryContent, files),
      files,
    };
  }

  throw new NonRetriableError(
    "Code tool loop ended without a task summary or any written files"
  );
}
