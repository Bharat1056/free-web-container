import { AsyncLocalStorage } from "async_hooks";

type GeminiKeyStore = {
  geminiApiKey?: string;
};

const geminiKeyStorage = new AsyncLocalStorage<GeminiKeyStore>();

/**
 * Runs `fn` with a Gemini API key available to nested helpers
 * ({@link getGeminiApiKeyFromContext}).
 *
 * Inngest `step.run` callbacks lose outer AsyncLocalStorage — wrap each step
 * body that calls LLM/embeddings with this again (pass the key into the step).
 */
export function runWithGeminiKey<T>(
  geminiApiKey: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return geminiKeyStorage.run({ geminiApiKey }, fn);
}

export function getGeminiApiKeyFromContext(): string | undefined {
  return geminiKeyStorage.getStore()?.geminiApiKey;
}
