import { ChatOpenAI } from "@langchain/openai";
import OpenAI from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { getModelChain, type ModelRole } from "@/constants";

type LlmChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

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
 * Shared OpenAI client for the code tool loop (and other raw chat completions).
 */
export function createOpenAiClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

/**
 * Raw OpenAI chat completion with an explicit model id (used inside tool loops).
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
