import type { Message as AgentMessage } from "@inngest/agent-kit";
import type { MessageRole } from "@prisma/client";
import { MAX_EMBED_CHARS } from "@/constants";

/**
 * Trims whitespace and caps length so embedding requests stay within model limits.
 *
 * @param text - Raw message or query text
 * @returns Normalized text, at most {@link MAX_EMBED_CHARS} characters
 */
export function normalizeText(text: string): string {
  return text.trim().slice(0, MAX_EMBED_CHARS);
}

/**
 * Checks whether a stored vector is usable for similarity search.
 *
 * @param embedding - Embedding array from the database (may be empty or missing)
 * @returns `true` when the array has at least one dimension
 */
export function hasEmbedding(
  embedding: number[] | null | undefined
): boolean {
  return Array.isArray(embedding) && embedding.length > 0;
}

/**
 * Computes cosine similarity between two equal-length embedding vectors.
 *
 * @param a - First embedding vector
 * @param b - Second embedding vector
 * @returns Score in roughly `[-1, 1]`, or `0` when inputs are empty or mismatched
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Maps a Prisma message role/content pair into an agent-kit text message.
 *
 * @param message - Database message fields needed for the agent conversation
 * @returns Agent-kit `Message` with `type: "text"` and a mapped role
 */
export function toAgentMessage(message: {
  role: MessageRole;
  content: string;
}): AgentMessage {
  return {
    type: "text",
    role: message.role === "ASSISTANT" ? "assistant" : "user",
    content: message.content,
  };
}
