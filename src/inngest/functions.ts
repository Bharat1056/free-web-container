import { Sandbox } from "@e2b/code-interpreter";
import { NonRetriableError, RetryAfterError } from "inngest";
import { inngest } from "./client";
import { getSandbox, sanitizeFragmentTitle } from "@/inngest/utils";
import { isRateLimitError, throwIfRateLimited } from "@/inngest/rate-limit";
import { runCodeToolLoop } from "@/inngest/code-tool-loop";
import {
  classifyMessageIntent,
  decideRoute,
  enhanceDesignSpec,
  formatDesignSpecForCode,
  resolveEditIntent,
  resolveEffectivePrompt,
} from "@/inngest/prep-agents";
import prisma from "@/lib/db";
import { createMessage, getRelevantMessages } from "@/lib/message-context";
import { getModelChain } from "@/constants";
import { SANDBOX_TIMEOUT } from "@/types";

interface PrepState {
  summary: string;
  files: { [path: string]: string };
  validated: boolean;
  sandboxId?: string;
  enhancedPrompt?: string;
  enhancementRetryCount: number;
  maxEnhancementRetries: number;
  needsEnhancement?: boolean;
  decisionMade: boolean;
  decisionError: boolean;
  resolvedEditPrompt?: string;
}

const MAX_ENHANCEMENT_RETRIES = 2;
const CREATE_WEBSITE_FUNCTION_ID = "create-website";

function createInitialPrepState(input: {
  files: { [path: string]: string };
  sandboxId: string;
}): PrepState {
  return {
    summary: "",
    files: input.files,
    validated: false,
    sandboxId: input.sandboxId,
    enhancedPrompt: undefined,
    enhancementRetryCount: 0,
    maxEnhancementRetries: MAX_ENHANCEMENT_RETRIES,
    needsEnhancement: undefined,
    decisionMade: false,
    decisionError: false,
    resolvedEditPrompt: undefined,
  };
}

async function markProjectStatus(
  projectId: string,
  generationStatus: "IDLE" | "FAILED" | "CANCELLED",
) {
  await prisma.project.update({
    where: { id: projectId },
    data: { generationStatus },
  });
}

function extractOriginalProjectId(eventData: unknown): string | null {
  if (!eventData || typeof eventData !== "object") return null;
  const data = eventData as {
    event?: { data?: { projectId?: string } };
    function_id?: string;
  };
  const projectId = data.event?.data?.projectId;
  return typeof projectId === "string" && projectId.length > 0
    ? projectId
    : null;
}

// because we have 3 workers create-website, failed worker and cancelled worker so we need to check the function id is create-website
function isCreateWebsiteFailure(eventData: unknown): boolean {
  if (!eventData || typeof eventData !== "object") return false;
  const functionId = (eventData as { function_id?: string }).function_id;
  return (
    typeof functionId === "string" &&
    functionId.includes(CREATE_WEBSITE_FUNCTION_ID)
  );
}

export const codeAgentFunction = inngest.createFunction(
  {
    id: CREATE_WEBSITE_FUNCTION_ID,
    // Allow TPM / transient provider failures to recover via RetryAfterError
    retries: 5,
  },
  { event: "test/create.website" },
  async ({ event, step }) => {
    try {
      const sandboxId = await step.run("get-sandbox-id", async () => {
        const sandbox = await Sandbox.create("vibe-three");
        await sandbox.setTimeout(SANDBOX_TIMEOUT);
        return sandbox.sandboxId;
      });

      const rawValue = event.data.value;

      const priorUserMessageCount = await step.run(
        "count-user-messages",
        async () =>
          prisma.message.count({
            where: { projectId: event.data.projectId, role: "USER" },
          }),
      );

      const messageIntent = await step.run(
        "classify-message-intent",
        async () =>
          classifyMessageIntent({
            message: rawValue,
            hasPriorMessages: priorUserMessageCount > 0,
          }),
      );

      const isContinuation = messageIntent?.intent === "CONTINUATION";

      // Continuation messages carry no instruction on their own. Resolve the
      // substantive prompt from history via a small structured LLM call.
      const effectiveValue = await step.run(
        "resolve-effective-prompt",
        async () => {
          if (!isContinuation) return rawValue;

          const userMessages = await prisma.message.findMany({
            where: { projectId: event.data.projectId, role: "USER" },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: { content: true },
          });

          const resolved = await resolveEffectivePrompt({
            latestMessage: rawValue,
            userMessagesNewestFirst: userMessages.map((m) => m.content),
          });

          return resolved?.effectivePrompt?.trim() || rawValue;
        },
      );

      // get the previous messages (both user and assistant) from the project
      const previousMessages = await step.run(
        "get-previous-messages",
        async () => {
          return getRelevantMessages(event.data.projectId, effectiveValue);
        },
      );

      // get the existing files from the project
      const existingFiles = await step.run("load-existing-files", async () => {
        const existingFragment = await prisma.fragment.findFirst({
          where: {
            message: {
              projectId: event.data.projectId,
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        if (existingFragment?.files) {
          return existingFragment.files as { [path: string]: string };
        }
        return {};
      });

      // An edit is any run where the project already has generated files.
      // Edits must stay incremental: never expand scope via design enhancement.
      const isEdit = Object.keys(existingFiles).length > 0;

      if (isEdit) {
        // Write prior project files into the fresh sandbox so the code model can
        // readFiles and apply minimal edits instead of rebuilding from scratch.
        await step.run("hydrate-sandbox", async () => {
          const sandbox = await getSandbox(sandboxId);
          for (const [path, content] of Object.entries(existingFiles)) {
            await sandbox.files.write(path, content);
          }
          return { hydrated: Object.keys(existingFiles).length };
        });
      }

      let prepState = createInitialPrepState({
        files: existingFiles,
        sandboxId,
      });

      // Edits: structured edit-intent resolution (LangChain + Zod).
      // New builds: structured decision + optional design enhancement.
      if (isEdit) {
        try {
          const editIntent = await step.run("resolve-edit-intent", async () =>
            resolveEditIntent({
              latestMessage: rawValue,
              historyMessages: previousMessages as Array<{
                role?: string;
                content?: unknown;
              }>,
            }),
          );

          if (editIntent?.instruction) {
            prepState.resolvedEditPrompt = editIntent.instruction.trim();
          }

          prepState.validated = true;
          prepState.needsEnhancement = false;
        } catch (error) {
          throwIfRateLimited(error);
          console.error(
            "Edit intent prep failed; continuing with raw prompt:",
            error,
          );
          prepState.validated = true;
          prepState.needsEnhancement = false;
        }
      } else {
        try {
          const decision = await step.run("decide-route", async () =>
            decideRoute({
              userPrompt: effectiveValue,
              hasHistory: previousMessages.length > 0,
            }),
          );

          prepState.decisionMade = true;

          if (decision) {
            prepState.decisionError = false;
            prepState.needsEnhancement = decision.route === "ENHANCE";
            prepState.validated = decision.route === "CODE";
          } else {
            prepState.decisionError = true;
            prepState.needsEnhancement = false;
            prepState.validated = true;
          }

          if (prepState.needsEnhancement && !prepState.validated) {
            for (
              let attempt = 0;
              attempt <= prepState.maxEnhancementRetries;
              attempt++
            ) {
              const spec = await step.run(
                `enhance-design-${attempt}`,
                async () => enhanceDesignSpec(effectiveValue),
              );

              if (spec) {
                prepState.enhancedPrompt = formatDesignSpecForCode(spec);
                prepState.validated = true;
                break;
              }

              prepState.enhancementRetryCount = attempt + 1;

              if (attempt >= prepState.maxEnhancementRetries) {
                prepState.validated = true;
                prepState.enhancedPrompt = undefined;
              }
            }
          }
        } catch (error) {
          throwIfRateLimited(error);
          console.error(
            "Structured prep failed; continuing without enhancement:",
            error,
          );
          prepState.decisionMade = true;
          prepState.validated = true;
          prepState.needsEnhancement = false;
          prepState.enhancedPrompt = undefined;
        }

        if (!prepState.validated && !prepState.needsEnhancement) {
          prepState.validated = true;
        }
      }

      const resolvedUserPrompt = isEdit
        ? prepState.resolvedEditPrompt
        : effectiveValue;

      const codeModelIds = getModelChain("code");
      let codeResult;
      try {
        codeResult = await runCodeToolLoop({
          step,
          sandboxId,
          files: prepState.files || existingFiles,
          historyMessages: previousMessages as Array<{
            type?: string;
            role?: string;
            content?: unknown;
          }>,
          userPrompt: resolvedUserPrompt,
          // Never feed a redesign spec into an edit; it causes full rewrites.
          enhancedPrompt: isEdit ? undefined : prepState.enhancedPrompt,
          modelIds: codeModelIds,
        });
      } catch (error) {
        // TPM: RetryAfterError from continuation exhaustion or tool steps
        throwIfRateLimited(error);
        throw error;
      }

      prepState.summary = codeResult.summary;
      prepState.files = codeResult.files;

      const isError =
        !codeResult.summary || Object.keys(codeResult.files || {}).length === 0;

      const sandboxUrl = await step.run("get-sandbox-url", async () => {
        const sandbox = await getSandbox(sandboxId);
        const host = sandbox.getHost(3000);
        return `https://${host}`;
      });

      await step.run("save-result", async () => {
        if (isError) {
          await markProjectStatus(event.data.projectId, "FAILED");
          return await createMessage({
            content: "Something went wrong. Please try again",
            role: "ASSISTANT",
            type: "ERROR",
            projectId: event.data.projectId,
          });
        }

        await markProjectStatus(event.data.projectId, "IDLE");
        return await createMessage({
          projectId: event.data.projectId,
          // Show only what the coding loop reports; no extra response model.
          content: codeResult.summary,
          role: "ASSISTANT",
          type: "RESULT",
          fragment: {
            sandboxUrl,
            // Fragment still backs the right-side preview/code panel, but its
            // internal title is derived locally (no title-model API call).
            title: sanitizeFragmentTitle(codeResult.summary),
            files: codeResult.files,
          },
        });
      });

      return {
        url: sandboxUrl,
        title: sanitizeFragmentTitle(codeResult.summary),
        files: codeResult.files,
        summary: codeResult.summary,
      };
    } catch (error) {
      // Soft TPM retries — rethrow as RetryAfterError so Inngest backs off.
      // Hard failures (NonRetriableError from exhausted continuations) must NOT
      // be converted back into RetryAfterError or memoized steps storm 500s.
      if (error instanceof NonRetriableError) {
        throw error;
      }
      if (error instanceof RetryAfterError || isRateLimitError(error)) {
        throwIfRateLimited(error);
        throw error;
      }

      console.error("Complete function failure:", error);

      await step.run("save-error-message", async () => {
        await markProjectStatus(event.data.projectId, "FAILED");
        return await createMessage({
          content: "Something went wrong. Please try again",
          role: "ASSISTANT",
          type: "ERROR",
          projectId: event.data.projectId,
        });
      });

      throw error;
    }
  },
);

/**
 * Push handler: when create-website exhausts retries, mark the project FAILED
 * so the UI can offer Retry (no continuous Inngest polling).
 */
export const handleGenerationFailed = inngest.createFunction(
  { id: "generation-failed" },
  { event: "inngest/function.failed" },
  async ({ event, step }) => {
    if (!isCreateWebsiteFailure(event.data)) return;

    const projectId = extractOriginalProjectId(event.data);
    if (!projectId) return;

    // Status only — the UI renders a Retry button from generationStatus.
    // Persisting a chat message here would leave stale red text after retry.
    await step.run("mark-failed", async () => {
      await markProjectStatus(projectId, "FAILED");
    });
  },
);

/**
 * Push handler: when create-website is cancelled, mark CANCELLED so the UI
 * can offer Continue (resume via edit-intent resolver).
 */
export const handleGenerationCancelled = inngest.createFunction(
  { id: "generation-cancelled" },
  { event: "inngest/function.cancelled" },
  async ({ event, step }) => {
    if (!isCreateWebsiteFailure(event.data)) return;

    const projectId = extractOriginalProjectId(event.data);
    if (!projectId) return;

    // Status only — the UI renders a Continue button from generationStatus.
    await step.run("mark-cancelled", async () => {
      await markProjectStatus(projectId, "CANCELLED");
    });
  },
);
