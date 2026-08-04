import { ChatOpenAI } from "@langchain/openai";
import OpenAI from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { getModelChain, type ModelRole } from "@/constants";
import { isProdMode } from "@/lib/app-mode";
import { getGeminiApiKeyFromContext } from "@/lib/gemini-key-context";

/** Google Generative Language OpenAI-compatible base URL. */
export const GEMINI_OPENAI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";

type LlmChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * - prod: user Gemini key from AsyncLocalStorage ({@link runWithGeminiKey})
 * - non-prod: server `OPENAI_API_KEY`
 */
function resolveApiKey(): string | undefined {
  if (isProdMode()) {
    return getGeminiApiKeyFromContext();
  }
  return process.env.OPENAI_API_KEY;
}

/**
 * Shared chat client. In prod BYOK mode uses Gemini's OpenAI-compatible API
 * with the per-user key from AsyncLocalStorage.
 */
export function createOpenAiClient(): OpenAI {
  const apiKey = resolveApiKey();

  if (isProdMode()) {
    if (!apiKey) {
      throw new Error("User Gemini API key is not available");
    }
    return new OpenAI({
      apiKey,
      baseURL: GEMINI_OPENAI_BASE_URL,
    });
  }

  return new OpenAI({
    apiKey,
  });
}

/**
 * LangChain ChatOpenAI configured for the active provider (OpenAI or Gemini).
 */
export function createChatOpenAI(input: {
  modelId: string;
  temperature: number;
}): ChatOpenAI {
  const apiKey = resolveApiKey();

  if (isProdMode()) {
    if (!apiKey) {
      throw new Error("User Gemini API key is not available");
    }
    return new ChatOpenAI({
      apiKey,
      model: input.modelId,
      temperature: input.temperature,
      configuration: {
        baseURL: GEMINI_OPENAI_BASE_URL,
      },
    });
  }

  return new ChatOpenAI({
    apiKey,
    model: input.modelId,
    temperature: input.temperature,
  });
}

/**
 * Single entry for LangChain structured (Zod) LLM calls with model-chain fallback.
 *
 * Used by prompt validation and any future structured prep steps.
 */
export async function callStructuredLlm<T>(input: {
  role: ModelRole;
  schema: unknown;
  schemaName: string;
  temperature: number;
  messages: LlmChatMessage[];
}): Promise<T | null> {
  for (const modelId of getModelChain(input.role)) {
    try {
      const model = createChatOpenAI({
        modelId,
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
 * Raw OpenAI-compatible chat completion with an explicit model id.
 */
export async function callOpenAiChatCompletion(input: {
  modelId: string;
  messages: ChatCompletionMessageParam[];
  tools?: ChatCompletionCreateParamsNonStreaming["tools"];
  temperature?: number;
  stream?: boolean;
}) {
  const client = createOpenAiClient();

  return client.chat.completions.create({
    model: input.modelId,
    messages: input.messages,
    tools: input.tools,
    temperature: input.temperature,
    stream: input.stream,
  });
}
