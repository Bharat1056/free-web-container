import type { Message as AgentMessage } from "@inngest/agent-kit";
import type { Message, MessageRole, MessageType, Prisma } from "@prisma/client";
import {
  MAX_CONTEXT_MESSAGES,
  RECENT_ANCHOR,
  SIMILARITY_THRESHOLD,
  TOP_K,
} from "@/constants";
import prisma from "@/lib/db";
import { embedText } from "@/lib/embeddings";
import {
  cosineSimilarity,
  hasEmbedding,
  toAgentMessage,
} from "@/lib/rag-utils";

type MessageWithEmbedding = Pick<
  Message,
  "id" | "role" | "content" | "createdAt" | "embedding"
>;

/**
 * Lazily backfills missing embeddings for project messages and persists them.
 *
 * Messages that already have a vector are left unchanged. Messages that fail
 * to embed stay without a vector and are skipped during similarity ranking.
 *
 * @param messages - Project messages that may or may not already be embedded
 * @returns The same messages with embeddings filled in where possible
 */
async function ensureEmbeddings(
  messages: MessageWithEmbedding[]
): Promise<MessageWithEmbedding[]> {
  const updated = await Promise.all(
    messages.map(async (message) => {
      if (hasEmbedding(message.embedding)) {
        return message;
      }

      const embedding = await embedText(message.content);
      if (!hasEmbedding(embedding)) {
        return message;
      }

      await prisma.message.update({
        where: { id: message.id },
        data: { embedding },
      });

      return { ...message, embedding };
    })
  );

  return updated;
}

/**
 * Builds a compact, relevant chat context for the coding agents.
 *
 * Selection strategy:
 * 1. Drop the current user turn when it matches `query` (already the live prompt).
 * 2. Always keep the most recent {@link RECENT_ANCHOR} messages for continuity.
 * 3. Rank older messages by cosine similarity to `query` and keep up to {@link TOP_K}
 *    above {@link SIMILARITY_THRESHOLD}.
 * 4. Merge, dedupe, sort chronologically, and cap at {@link MAX_CONTEXT_MESSAGES}.
 *
 * Falls back to recent older messages when the query cannot be embedded.
 *
 * @param projectId - Project whose message history should be searched
 * @param query - Current user prompt used as the retrieval query
 * @returns Agent-kit messages ready to inject into network state
 */
export async function getRelevantMessages(
  projectId: string,
  query: string
): Promise<AgentMessage[]> {
  const messages = await prisma.message.findMany({
    where: { projectId },
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
      embedding: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (messages.length === 0) {
    return [];
  }

  // Exclude the current user message (just created) from context selection
  // by treating everything except the last user turn as history when the
  // last message content matches the query.
  let history = messages;
  const last = messages[messages.length - 1];
  if (
    last &&
    last.role === "USER" &&
    last.content.trim() === query.trim()
  ) {
    history = messages.slice(0, -1);
  }

  if (history.length === 0) {
    return [];
  }

  const withEmbeddings = await ensureEmbeddings(history);

  // Split history into two buckets:
  // - recentAnchors: last RECENT_ANCHOR messages, always kept for continuity
  // - candidates: older messages, ranked by similarity to the current query
  // Example with [A, B, C, D, E] and RECENT_ANCHOR=2:
  //   recentAnchors = [D, E], candidates = [A, B, C]
  const recentAnchors = withEmbeddings.slice(-RECENT_ANCHOR);
  const recentIds = new Set(recentAnchors.map((m) => m.id));
  const candidates = withEmbeddings.filter((m) => !recentIds.has(m.id));

  const queryEmbedding = await embedText(query);
  let relevant: MessageWithEmbedding[] = [];

  if (hasEmbedding(queryEmbedding) && candidates.length > 0) {
    // If the query can be embedded, rank candidates by similarity and keep the top N
    // that meet the similarity threshold
    // Example with [A(0.8), B(0.7), C(0.6)] and SIMILARITY_THRESHOLD=0.7:
    //   relevant = [A, B]
    relevant = candidates
      .map((message) => ({
        message,
        score: hasEmbedding(message.embedding)
          ? cosineSimilarity(queryEmbedding, message.embedding)
          : 0,
      }))
      .filter(({ score }) => score >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K)
      .map(({ message }) => message);
  } else if (candidates.length > 0) {
    // Fallback: if embedding failed, pull a few older recent messages
    relevant = candidates.slice(-TOP_K);
  }

  const selectedById = new Map<string, MessageWithEmbedding>();
  for (const message of [...relevant, ...recentAnchors]) {
    selectedById.set(message.id, message);
  }

  const selected = Array.from(selectedById.values())
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(-MAX_CONTEXT_MESSAGES);

  return selected.map(toAgentMessage);
}

type CreateMessageInput = {
  content: string;
  role: MessageRole;
  type: MessageType;
  projectId: string;
  embedding?: number[];
  errorDetails?: Prisma.InputJsonValue | null;
  fragment?: Prisma.FragmentCreateWithoutMessageInput;
};

/**
 * Persists a chat message and indexes its content for later RAG retrieval.
 *
 * `RESULT` messages are embedded (unless `embedding` is already provided).
 * `RETRY` messages are stored with an empty embedding and skipped by ranking.
 *
 * @param input - Message fields, optional precomputed embedding, and optional fragment
 * @returns The created Prisma `Message` row
 */
export async function createMessage(
  input: CreateMessageInput
): Promise<Message> {
  const shouldEmbed = input.type !== "RETRY";
  let embedding: number[];
  if (input.embedding !== undefined && input.embedding !== null) {
    embedding = input.embedding;
  } else if (shouldEmbed) {
    embedding = await embedText(input.content);
  } else {
    embedding = [];
  }

  return prisma.message.create({
    data: {
      content: input.content,
      role: input.role,
      type: input.type,
      projectId: input.projectId,
      embedding,
      ...(input.errorDetails != null
        ? { errorDetails: input.errorDetails }
        : {}),
      ...(input.fragment
        ? {
            fragment: {
              create: input.fragment,
            },
          }
        : {}),
    },
  });
}
