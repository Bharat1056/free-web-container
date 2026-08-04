import { getModelChain } from "@/constants";
import { isProdMode } from "@/lib/app-mode";
import { getGeminiApiKeyFromContext } from "@/lib/gemini-key-context";
import { normalizeText } from "@/lib/rag-utils";

/**
 * Creates a vector embedding for text via Gemini.
 *
 * - prod: user key from AsyncLocalStorage ({@link runWithGeminiKey})
 * - non-prod: server `GEMINI_API_KEY`
 *
 * Tries each model in the `embedding` fallback chain. Failures (missing key,
 * network errors, empty responses) return `[]` so message creation and
 * retrieval never block on embedding outages.
 *
 * @param text - Content to embed (trimmed and length-capped before the API call)
 * @returns Embedding vector, or an empty array when embedding is skipped/failed
 */
export async function embedText(text: string): Promise<number[]> {
  const content = normalizeText(text);
  if (!content) {
    return [];
  }

  const apiKey = isProdMode()
    ? getGeminiApiKeyFromContext()
    : process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error(
      isProdMode()
        ? "User Gemini API key is not available; skipping embedding"
        : "GEMINI_API_KEY is not available; skipping embedding",
    );
    return [];
  }

  for (const modelId of getModelChain("embedding")) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:embedContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: `models/${modelId}`,
            content: {
              parts: [{ text: content }],
            },
          }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        console.error(
          `Gemini embedding model "${modelId}" failed (${response.status}): ${errorBody}`,
        );
        continue;
      }

      const data = (await response.json()) as {
        embedding?: { values?: number[] };
      };
      const values = data.embedding?.values;
      if (!Array.isArray(values) || values.length === 0) {
        console.error(
          `Gemini embedding model "${modelId}" returned an empty vector`,
        );
        continue;
      }
      return values;
    } catch (error) {
      console.error(
        `Gemini embedding model "${modelId}" request failed:`,
        error,
      );
    }
  }

  return [];
}
