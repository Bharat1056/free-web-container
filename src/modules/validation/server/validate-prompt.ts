import { ChatGroq } from "@langchain/groq";
import { z } from "zod";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { PROMPT_VALIDATION_PROMPT } from "@/prompt";

const ValidationSchema = z.object({
  isValid: z
    .boolean()
    .describe("Whether the prompt is valid for building a website"),
});

type ValidationResult = z.infer<typeof ValidationSchema>;

const parser = StructuredOutputParser.fromZodSchema(ValidationSchema);

const promptTemplate = PromptTemplate.fromTemplate(PROMPT_VALIDATION_PROMPT);

const model = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "openai/gpt-oss-20b",
  temperature: 0.4,
});

export async function validatePrompt(
  prompt: string
): Promise<ValidationResult> {
  try {
    const chain = promptTemplate.pipe(model).pipe(parser);

    const formatInstructions = parser.getFormatInstructions();

    const result = await chain.invoke({
      prompt: prompt,
      format_instructions: formatInstructions,
    });

    return result as ValidationResult;
  } catch (error) {
    return {
      isValid: false,
    };
  }
}
