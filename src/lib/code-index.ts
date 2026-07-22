import prisma from "@/lib/db";
import { chunkProjectFiles, type CodeFileChunk } from "@/lib/code-chunker";
import { buildProjectImportEdgesWithMadge } from "@/lib/code-graph";
import { embedText } from "@/lib/embeddings";
import { hasEmbedding } from "@/lib/rag-utils";
import { CODE_EDGE_KIND_IMPORTS } from "@/constants";

export type ReindexProjectFilesResult = {
  chunkCount: number;
  embeddedCount: number;
  reusedCount: number;
  edgeCount: number;
};

/**
 * Builds a stable lookup key for a chunk's identity in the project index.
 *
 * @param chunk - Chunk path and line range
 * @returns Key used to match existing DB rows
 *
 * @example
 * ```ts
 * buildChunkIdentityKey({ path: "a.ts", startLine: 1, endLine: 10 });
 * // "a.ts:1:10"
 * ```
 */
function buildChunkIdentityKey(chunk: {
  path: string;
  startLine: number;
  endLine: number;
}): string {
  return `${chunk.path}:${chunk.startLine}:${chunk.endLine}`;
}

/**
 * Replaces all import edges for a project with the latest madge result.
 *
 * @param projectId - Owning project id
 * @param files - Current file map used to derive edges
 * @returns Number of edges written
 *
 * @example
 * ```ts
 * await replaceProjectImportEdges(projectId, files);
 * ```
 */
async function replaceProjectImportEdges(
  projectId: string,
  files: { [path: string]: string }
): Promise<number> {
  const edges = await buildProjectImportEdgesWithMadge(files);

  await prisma.$transaction(async (tx) => {
    await tx.codeEdge.deleteMany({ where: { projectId } });
    if (edges.length > 0) {
      await tx.codeEdge.createMany({
        data: edges.map((edge) => ({
          projectId,
          fromPath: edge.fromPath,
          toPath: edge.toPath,
          kind: edge.kind ?? CODE_EDGE_KIND_IMPORTS,
        })),
      });
    }
  });

  return edges.length;
}

/**
 * Deduplicates chunks that share the same project path + line range.
 *
 * AST splitters can occasionally emit overlapping pieces that resolve to the
 * same `(path, startLine, endLine)`. Keeping the last occurrence avoids unique
 * constraint violations on upsert.
 *
 * @param chunks - Raw chunks from the file map
 * @returns Chunks with unique identity keys, stable path/line order
 *
 * @example
 * ```ts
 * dedupeCodeChunksByIdentity(chunkProjectFiles(files));
 * ```
 */
export function dedupeCodeChunksByIdentity(
  chunks: CodeFileChunk[]
): CodeFileChunk[] {
  const byIdentity = new Map<string, CodeFileChunk>();
  for (const chunk of chunks) {
    byIdentity.set(buildChunkIdentityKey(chunk), chunk);
  }
  return Array.from(byIdentity.values()).sort((left, right) => {
    if (left.path !== right.path) {
      return left.path.localeCompare(right.path);
    }
    return left.startLine - right.startLine;
  });
}

/**
 * Upserts code chunks for a project, embedding only new or changed hashes.
 *
 * Fresh projects (no rows yet) embed every chunk. Later saves reuse embeddings
 * when `contentHash` matches so Gemini is not called for unchanged code.
 *
 * @param projectId - Owning project id
 * @param nextChunks - Chunks from the latest file map
 * @returns Counts of embedded vs reused chunks
 *
 * @example
 * ```ts
 * await upsertProjectCodeChunks(projectId, chunkProjectFiles(files));
 * ```
 */
async function upsertProjectCodeChunks(
  projectId: string,
  nextChunks: CodeFileChunk[]
): Promise<{ embeddedCount: number; reusedCount: number }> {
  const uniqueChunks = dedupeCodeChunksByIdentity(nextChunks);

  const existingChunks = await prisma.codeChunk.findMany({
    where: { projectId },
    select: {
      id: true,
      path: true,
      startLine: true,
      endLine: true,
      contentHash: true,
      embedding: true,
    },
  });

  const existingByIdentity = new Map(
    existingChunks.map((chunk) => [buildChunkIdentityKey(chunk), chunk])
  );
  const nextIdentityKeys = new Set(
    uniqueChunks.map((chunk) => buildChunkIdentityKey(chunk))
  );

  const staleIds = existingChunks
    .filter((chunk) => !nextIdentityKeys.has(buildChunkIdentityKey(chunk)))
    .map((chunk) => chunk.id);

  if (staleIds.length > 0) {
    await prisma.codeChunk.deleteMany({
      where: { id: { in: staleIds } },
    });
  }

  let embeddedCount = 0;
  let reusedCount = 0;

  for (const chunk of uniqueChunks) {
    const identityKey = buildChunkIdentityKey(chunk);
    const existing = existingByIdentity.get(identityKey);
    const canReuseEmbedding =
      existing &&
      existing.contentHash === chunk.contentHash &&
      hasEmbedding(existing.embedding);

    let embedding: number[] = [];
    if (canReuseEmbedding) {
      embedding = existing.embedding;
      reusedCount += 1;
    } else {
      embedding = await embedText(chunk.content);
      embeddedCount += 1;
    }

    const saved = await prisma.codeChunk.upsert({
      where: {
        projectId_path_startLine_endLine: {
          projectId,
          path: chunk.path,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
        },
      },
      create: {
        projectId,
        path: chunk.path,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        content: chunk.content,
        contentHash: chunk.contentHash,
        embedding,
      },
      update: {
        content: chunk.content,
        contentHash: chunk.contentHash,
        embedding,
      },
      select: {
        id: true,
        path: true,
        startLine: true,
        endLine: true,
        contentHash: true,
        embedding: true,
      },
    });

    existingByIdentity.set(identityKey, saved);
  }

  return { embeddedCount, reusedCount };
}

/**
 * Indexes the latest project files into `CodeChunk` + `CodeEdge`.
 *
 * Call after a successful generation/edit save. Safe to retry: content hashes
 * make embedding idempotent, and edges are fully replaced each run.
 *
 * Soft-fails individual concerns via logging inside helpers; this function
 * still returns counts so Inngest steps can record progress.
 *
 * @param projectId - Project whose latest snapshot should be indexed
 * @param files - Fragment `path → content` map from the successful run
 * @returns Indexing stats for logs / step output
 *
 * @example
 * ```ts
 * await reindexProjectFiles(projectId, codeResult.files);
 * ```
 */
export async function reindexProjectFiles(
  projectId: string,
  files: { [path: string]: string }
): Promise<ReindexProjectFilesResult> {
  const chunks = dedupeCodeChunksByIdentity(chunkProjectFiles(files));
  const { embeddedCount, reusedCount } = await upsertProjectCodeChunks(
    projectId,
    chunks
  );
  const edgeCount = await replaceProjectImportEdges(projectId, files);

  return {
    chunkCount: chunks.length,
    embeddedCount,
    reusedCount,
    edgeCount,
  };
}
