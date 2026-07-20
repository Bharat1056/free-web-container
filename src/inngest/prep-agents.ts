import { ChatOpenAI } from "@langchain/openai";
import { getModelChain } from "@/constants";
import {
  DECISION_PROMPT,
  EDIT_INTENT_PROMPT,
  EFFECTIVE_PROMPT_PROMPT,
  MESSAGE_INTENT_PROMPT,
  WEBSITE_DESIGN_ENHANCEMENT_PROMPT,
} from "@/prompt";
import {
  DecisionSchema,
  EditIntentSchema,
  EffectivePromptSchema,
  MessageIntentSchema,
  WebsiteDesignSpecSchema,
  type DecisionResult,
  type EditIntentResult,
  type EffectivePromptResult,
  type MessageIntentResult,
  type WebsiteDesignSpec,
} from "@/inngest/prep-schemas";

type HistoryMessage = {
  role?: string;
  content?: unknown;
};

function extractMessageText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "object" &&
        part !== null &&
        "text" in part &&
        typeof (part as { text: unknown }).text === "string"
          ? (part as { text: string }).text
          : "",
      )
      .join("")
      .trim();
  }
  return "";
}

function formatHistoryForEditIntent(messages: HistoryMessage[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    const text = extractMessageText(message.content);
    if (!text) continue;
    const role =
      message.role === "assistant" ? "ASSISTANT" : "USER";
    lines.push(`[${role}]: ${text}`);
  }
  return lines.length > 0 ? lines.join("\n\n") : "(no prior messages)";
}

function formatUserMessageList(messages: string[]): string {
  if (messages.length === 0) return "(no prior user messages)";
  return messages
    .map((content, index) => `${index + 1}. ${content.trim()}`)
    .join("\n\n");
}

async function invokeStructured<T>(input: {
  role: "messageIntent" | "decision" | "enhancement" | "editIntent";
  schema: unknown;
  schemaName: string;
  temperature: number;
  messages: Array<{ role: "system" | "user"; content: string }>;
}): Promise<T | null> {
  for (const modelId of getModelChain(input.role)) {
    try {
      const model = new ChatOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        model: modelId,
        temperature: input.temperature,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- LangChain Zod interop vs Zod 4
      const structured = model.withStructuredOutput(input.schema as any, {
        name: input.schemaName,
        strict: true,
      });

      return (await structured.invoke(input.messages)) as T;
    } catch (error) {
      console.error(`${input.schemaName} model "${modelId}" failed:`, error);
    }
  }

  return null;
}

/**
 * Renders a validated design spec as plain text for the code agent.
 */
export function formatDesignSpecForCode(spec: WebsiteDesignSpec): string {
  const lines = [
    `Goal: ${spec.goal}`,
    "",
    "Sections:",
    ...spec.sections.flatMap((section) => [
      `- ${section.name}`,
      ...section.requirements.map((req) => `  - ${req}`),
    ]),
    "",
    "UX principles:",
    ...spec.uxPrinciples.map((item) => `- ${item}`),
    "Accessibility:",
    ...spec.accessibility.map((item) => `- ${item}`),
    "Responsive:",
    ...spec.responsive.map((item) => `- ${item}`),
  ];

  if (spec.performance?.length) {
    lines.push("Performance:", ...spec.performance.map((item) => `- ${item}`));
  }

  return lines.join("\n");
}

/**
 * Classifies whether the latest user message is a bare continuation or a real instruction.
 * Uses a small model with temperature 0 for deterministic routing.
 */
export async function classifyMessageIntent(input: {
  message: string;
  hasPriorMessages: boolean;
}): Promise<MessageIntentResult | null> {
  return invokeStructured<MessageIntentResult>({
    role: "messageIntent",
    schema: MessageIntentSchema,
    schemaName: "message_intent",
    temperature: 0,
    messages: [
      { role: "system", content: MESSAGE_INTENT_PROMPT },
      {
        role: "user",
        content: `Latest user message:\n${input.message}\n\nProject has prior user messages: ${input.hasPriorMessages}`,
      },
    ],
  });
}

/**
 * Resolves the substantive prompt to continue from when the user sent a continuation.
 * Uses recent user message history (newest first) and strict JSON output.
 */
export async function resolveEffectivePrompt(input: {
  latestMessage: string;
  userMessagesNewestFirst: string[];
}): Promise<EffectivePromptResult | null> {
  return invokeStructured<EffectivePromptResult>({
    role: "messageIntent",
    schema: EffectivePromptSchema,
    schemaName: "effective_prompt",
    temperature: 0,
    messages: [
      { role: "system", content: EFFECTIVE_PROMPT_PROMPT },
      {
        role: "user",
        content: `Latest user message:\n${input.latestMessage}\n\nRecent user messages (newest first):\n${formatUserMessageList(input.userMessagesNewestFirst)}`,
      },
    ],
  });
}

/**
 * Routes a new-build request to design enhancement or direct coding.
 * Uses OpenAI strict JSON schema via LangChain structured output.
 */
export async function decideRoute(input: {
  userPrompt: string;
  hasHistory: boolean;
}): Promise<DecisionResult | null> {
  for (const modelId of getModelChain("decision")) {
    try {
      const model = new ChatOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        model: modelId,
        temperature: 0,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- LangChain Zod interop vs Zod 4
      const structured = model.withStructuredOutput(DecisionSchema as any, {
        name: "route_decision",
        strict: true,
      });

      return (await structured.invoke([
        { role: "system", content: DECISION_PROMPT },
        {
          role: "user",
          content: `User request:\n${input.userPrompt}\n\nHas prior chat history: ${input.hasHistory}`,
        },
      ])) as DecisionResult;
    } catch (error) {
      console.error(`Decision model "${modelId}" failed:`, error);
    }
  }

  return null;
}

/**
 * Expands a user prompt into a validated UI/UX design specification.
 * Uses OpenAI strict JSON schema via LangChain structured output.
 */
export async function enhanceDesignSpec(
  userPrompt: string,
): Promise<WebsiteDesignSpec | null> {
  for (const modelId of getModelChain("enhancement")) {
    try {
      const model = new ChatOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        model: modelId,
        temperature: 0.3,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- LangChain Zod interop vs Zod 4
      const structured = model.withStructuredOutput(
        WebsiteDesignSpecSchema as any,
        {
          name: "website_design_spec",
          strict: true,
        },
      );

      return (await structured.invoke([
        { role: "system", content: WEBSITE_DESIGN_ENHANCEMENT_PROMPT },
        { role: "user", content: userPrompt },
      ])) as WebsiteDesignSpec;
    } catch (error) {
      console.error(`Enhancement model "${modelId}" failed:`, error);
    }
  }

  return null;
}

/**
 * Rewrites a follow-up or continue message into a concrete coding instruction.
 * Uses OpenAI strict JSON schema via LangChain structured output.
 */
export async function resolveEditIntent(input: {
  latestMessage: string;
  historyMessages: HistoryMessage[];
}): Promise<EditIntentResult | null> {
  const historyText = formatHistoryForEditIntent(input.historyMessages);

  for (const modelId of getModelChain("editIntent")) {
    try {
      const model = new ChatOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        model: modelId,
        temperature: 0,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- LangChain Zod interop vs Zod 4
      const structured = model.withStructuredOutput(EditIntentSchema as any, {
        name: "edit_intent",
        strict: true,
      });

      return (await structured.invoke([
        { role: "system", content: EDIT_INTENT_PROMPT },
        {
          role: "user",
          content: `Recent chat history:\n${historyText}\n\nLatest user message:\n${input.latestMessage}`,
        },
      ])) as EditIntentResult;
    } catch (error) {
      console.error(`Edit intent model "${modelId}" failed:`, error);
    }
  }

  return null;
}
