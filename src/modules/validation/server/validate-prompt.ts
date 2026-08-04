import { ChatOpenAI } from "@langchain/openai";
// LangChain StructuredOutputParser still expects Zod 3 shapes
import { z } from "zod/v3";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { getModelChain } from "@/constants";
import { createChatOpenAI } from "@/lib/llm";
import { PROMPT_VALIDATION_PROMPT } from "@/prompt";

const ValidationSchema = z.object({
  isValid: z
    .boolean()
    .describe("Whether the prompt is valid for building a website"),
});

type ValidationResult = z.infer<typeof ValidationSchema>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- LangChain Zod interop vs Zod 4
const parser = StructuredOutputParser.fromZodSchema(ValidationSchema as any);

const promptTemplate = PromptTemplate.fromTemplate(PROMPT_VALIDATION_PROMPT);

/**
 * Validates a user prompt for website/app building.
 * Tries each model in the `promptValidation` chain until one succeeds.
 * In prod BYOK, uses the Gemini key from AsyncLocalStorage.
 */
export async function validatePrompt(
  prompt: string,
): Promise<ValidationResult> {
  const formatInstructions = parser.getFormatInstructions();

  for (const modelId of getModelChain("promptValidation")) {
    try {
      const model: ChatOpenAI = createChatOpenAI({
        modelId,
        temperature: 0.4,
      });

      const chain = promptTemplate.pipe(model).pipe(parser);
      const result = await chain.invoke({
        prompt: prompt,
        format_instructions: formatInstructions,
      });

      return result as ValidationResult;
    } catch (error) {
      console.error(
        `Prompt validation model "${modelId}" failed, trying next:`,
        error,
      );
    }
  }

  return {
    isValid: false,
  };
}
