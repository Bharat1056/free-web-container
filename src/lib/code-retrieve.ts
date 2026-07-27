import {
  CODE_BASENAME_MATCH_SCORE,
  CODE_CONTENT_TOKEN_BOOST_CAP,
  CODE_EXACT_PATH_PIN_SCORE,
  CODE_GRAPH_EXPAND_FILES,
  CODE_KEYWORD_WEIGHT,
  CODE_PATH_TOKEN_SCORE_CAP,
  CODE_SIMILARITY_FLOOR,
  CODE_TOP_CHUNKS,
  CODE_TOP_FILES,
  CODE_VECTOR_WEIGHT,
  EDIT_CONTEXT_CHAR_BUDGET,
  EDIT_CONTEXT_PER_FILE_LIMIT,
} from "@/constants";
import prisma from "@/lib/db";
import { embedText } from "@/lib/embeddings";
import {
  clampNumber,
  countTokenOverlap,
  getFileBasename,
  normalizeProjectPath,
  tokenizeForCodeSearch,
  tokenizePromptForCodeSearch,
} from "@/lib/code-utils";
import { cosineSimilarity, hasEmbedding } from "@/lib/rag-utils";

/** A ranked code snippet ready to inject into the edit prompt. */
export type RetrievedCodeSnippet = {
  path: string;
  startLine: number;
  endLine: number;
  content: string;
  score: number;
};

/** Result of hybrid retrieval for one edit prompt. */
export type RetrievedCodeContext = {
  allPaths: string[];
  selectedSnippets: RetrievedCodeSnippet[];
  omittedPaths: string[];
};

type RankedChunk = {
  path: string;
  startLine: number;
  endLine: number;
  content: string;
  keywordScore: number;
  vectorScore: number;
  score: number;
  isPinned: boolean;
};

/**
 * Scores how well a file path matches prompt tokens (deterministic).
 *
 * Exact full-path mention pins at {@link CODE_EXACT_PATH_PIN_SCORE}.
 * Basename hits use {@link CODE_BASENAME_MATCH_SCORE}. Otherwise token overlap
 * against path segments is capped by {@link CODE_PATH_TOKEN_SCORE_CAP}.
 *
 * @param filePath - Project-relative path
 * @param promptText - Raw user prompt (for exact substring checks)
 * @param promptTokens - Stopword-filtered prompt tokens
 * @returns Keyword score in `[0, 1]` plus whether the path is hard-pinned
 *
 * @example
 * ```ts
 * scorePathAgainstPrompt("src/navbar.tsx", "fix navbar.tsx", ["navbar", "tsx"]);
 * ```
 */
export function scorePathAgainstPrompt(
  filePath: string,
  promptText: string,
  promptTokens: string[]
): { keywordScore: number; isPinned: boolean } {
  const normalizedPath = normalizeProjectPath(filePath).toLowerCase();
  const basename = getFileBasename(filePath).toLowerCase();
  const promptLower = promptText.toLowerCase();

  if (
    promptLower.includes(normalizedPath) ||
    promptLower.includes(basename)
  ) {
    const isExactPath = promptLower.includes(normalizedPath);
    return {
      keywordScore: isExactPath
        ? CODE_EXACT_PATH_PIN_SCORE
        : CODE_BASENAME_MATCH_SCORE,
      isPinned: true,
    };
  }

  if (promptTokens.length === 0) {
    return { keywordScore: 0, isPinned: false };
  }

  const pathTokens = new Set(tokenizeForCodeSearch(normalizedPath));
  const overlap = countTokenOverlap(pathTokens, promptTokens);
  const ratio = overlap / promptTokens.length;
  return {
    keywordScore: clampNumber(ratio, 0, CODE_PATH_TOKEN_SCORE_CAP),
    isPinned: false,
  };
}

/**
 * Adds a small boost when prompt tokens appear inside chunk content.
 *
 * @param content - Chunk text
 * @param promptTokens - Stopword-filtered prompt tokens
 * @returns Boost in `[0, CODE_CONTENT_TOKEN_BOOST_CAP]`
 *
 * @example
 * ```ts
 * scoreContentTokenBoost("export function Navbar", ["navbar"]);
 * ```
 */
export function scoreContentTokenBoost(
  content: string,
  promptTokens: string[]
): number {
  if (promptTokens.length === 0) {
    return 0;
  }
  const contentTokens = new Set(tokenizeForCodeSearch(content));
  const overlap = countTokenOverlap(contentTokens, promptTokens);
  const ratio = overlap / promptTokens.length;
  return clampNumber(ratio * CODE_CONTENT_TOKEN_BOOST_CAP, 0, CODE_CONTENT_TOKEN_BOOST_CAP);
}

/**
 * Combines keyword and vector scores with fixed production weights.
 *
 * @param keywordScore - Path/content keyword score in `[0, 1]`
 * @param vectorScore - Cosine similarity clamped to `[0, 1]`
 * @param isPinned - When true, score is raised to the pin band
 * @returns Final hybrid score used for sorting
 *
 * @example
 * ```ts
 * computeHybridCodeScore(0.7, 0.5, false);
 * ```
 */
export function computeHybridCodeScore(
  keywordScore: number,
  vectorScore: number,
  isPinned: boolean
): number {
  const mixed =
    CODE_KEYWORD_WEIGHT * keywordScore + CODE_VECTOR_WEIGHT * vectorScore;
  if (isPinned) {
    return Math.max(mixed, CODE_EXACT_PATH_PIN_SCORE);
  }
  return mixed;
}

/**
 * Stable sort for ranked chunks: score desc, then path, then startLine.
 *
 * @param left - First chunk
 * @param right - Second chunk
 * @returns Comparator result for `Array.sort`
 *
 * @example
 * ```ts
 * ranked.sort(compareRankedChunksStable);
 * ```
 */
export function compareRankedChunksStable(
  left: Pick<RankedChunk, "score" | "path" | "startLine">,
  right: Pick<RankedChunk, "score" | "path" | "startLine">
): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  if (left.path !== right.path) {
    return left.path.localeCompare(right.path);
  }
  return left.startLine - right.startLine;
}

/**
 * Loads 1-hop import neighbors for the given paths from `CodeEdge`.
 *
 * @param projectId - Project scope
 * @param seedPaths - Paths already selected by hybrid ranking
 * @returns Neighbor paths sorted alphabetically (capped)
 *
 * @example
 * ```ts
 * await findImportNeighborPaths(projectId, ["src/login-form.tsx"]);
 * ```
 */
async function findImportNeighborPaths(
  projectId: string,
  seedPaths: string[]
): Promise<string[]> {
  if (seedPaths.length === 0) {
    return [];
  }

  const edges = await prisma.codeEdge.findMany({
    where: {
      projectId,
      OR: [
        { fromPath: { in: seedPaths } },
        { toPath: { in: seedPaths } },
      ],
    },
    select: { fromPath: true, toPath: true },
  });

  const seedSet = new Set(seedPaths.map(normalizeProjectPath));
  const neighbors = new Set<string>();

  for (const edge of edges) {
    const fromPath = normalizeProjectPath(edge.fromPath);
    const toPath = normalizeProjectPath(edge.toPath);
    if (seedSet.has(fromPath) && !seedSet.has(toPath)) {
      neighbors.add(toPath);
    }
    if (seedSet.has(toPath) && !seedSet.has(fromPath)) {
      neighbors.add(fromPath);
    }
  }

  return Array.from(neighbors)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, CODE_GRAPH_EXPAND_FILES);
}

/**
 * Ranks files by path keywords when the chunk index is empty.
 *
 * @param files - Current fragment file map
 * @param prompt - User edit prompt
 * @returns Ranked snippets built from full files (budgeted later)
 *
 * @example
 * ```ts
 * rankFilesByPromptKeywords(files, "fix navbar");
 * ```
 */
function rankFilesByPromptKeywords(
  files: { [path: string]: string },
  prompt: string
): RetrievedCodeSnippet[] {
  const promptTokens = tokenizePromptForCodeSearch(prompt);
  const ranked = Object.keys(files)
    .map((filePath) => {
      const normalizedPath = normalizeProjectPath(filePath);
      const content = files[filePath] ?? "";
      const pathScore = scorePathAgainstPrompt(
        normalizedPath,
        prompt,
        promptTokens
      );
      const contentBoost = scoreContentTokenBoost(content, promptTokens);
      const keywordScore = clampNumber(
        pathScore.keywordScore + contentBoost,
        0,
        1
      );
      return {
        path: normalizedPath,
        startLine: 1,
        endLine: Math.max(content.split("\n").length, 1),
        content,
        score: pathScore.isPinned
          ? Math.max(keywordScore, CODE_EXACT_PATH_PIN_SCORE)
          : keywordScore,
      };
    })
    .sort(compareRankedChunksStable);

  return ranked.slice(0, CODE_TOP_CHUNKS);
}

/**
 * Fills the edit-context budget with highest-ranked snippets first.
 *
 * @param allPaths - Full project path list for the tree section
 * @param rankedSnippets - Snippets sorted by score
 * @returns Selected snippets plus paths not inlined
 *
 * @example
 * ```ts
 * selectSnippetsWithinBudget(allPaths, ranked);
 * ```
 */
export function selectSnippetsWithinBudget(
  allPaths: string[],
  rankedSnippets: RetrievedCodeSnippet[]
): Pick<RetrievedCodeContext, "selectedSnippets" | "omittedPaths"> {
  const selectedSnippets: RetrievedCodeSnippet[] = [];
  const selectedPaths = new Set<string>();
  let usedCharacters = 0;

  for (const snippet of rankedSnippets) {
    if (selectedPaths.size >= CODE_TOP_FILES && !selectedPaths.has(snippet.path)) {
      continue;
    }

    const truncatedContent =
      snippet.content.length > EDIT_CONTEXT_PER_FILE_LIMIT
        ? `${snippet.content.slice(0, EDIT_CONTEXT_PER_FILE_LIMIT)}\n/* ... truncated ... */`
        : snippet.content;

    const blockLength =
      truncatedContent.length + snippet.path.length + 64;
    if (
      selectedSnippets.length > 0 &&
      usedCharacters + blockLength > EDIT_CONTEXT_CHAR_BUDGET
    ) {
      continue;
    }

    selectedSnippets.push({
      ...snippet,
      content: truncatedContent,
    });
    selectedPaths.add(snippet.path);
    usedCharacters += blockLength;
  }

  const omittedPaths = allPaths
    .filter((filePath) => !selectedPaths.has(normalizeProjectPath(filePath)))
    .sort((left, right) => left.localeCompare(right));

  return { selectedSnippets, omittedPaths };
}

/**
 * Retrieves project-scoped code context for an edit prompt.
 *
 * Uses hybrid keyword + exact cosine ranking, then expands one hop through
 * madge-derived `CodeEdge` links. Falls back to filename ranking when the
 * chunk index is empty (e.g. first edit before reindex finishes).
 *
 * @param projectId - Project to search (never crosses tenants)
 * @param prompt - Current user edit request
 * @param files - Latest fragment files (for tree + fallback)
 * @returns Paths, selected snippets, and omitted paths for the edit message
 *
 * @example
 * ```ts
 * const context = await retrieveCodeContext(projectId, userPrompt, files);
 * ```
 */
export async function retrieveCodeContext(
  projectId: string,
  prompt: string,
  files: { [path: string]: string }
): Promise<RetrievedCodeContext> {
  const allPaths = Object.keys(files)
    .map(normalizeProjectPath)
    .sort((left, right) => left.localeCompare(right));

  const storedChunks = await prisma.codeChunk.findMany({
    where: { projectId },
    select: {
      path: true,
      startLine: true,
      endLine: true,
      content: true,
      embedding: true,
    },
  });

  const promptTokens = tokenizePromptForCodeSearch(prompt);
  let ranked: RetrievedCodeSnippet[] = [];

  if (storedChunks.length === 0) {
    ranked = rankFilesByPromptKeywords(files, prompt);
  } else {
    const promptEmbedding = await embedText(prompt);
    const rankedChunks: RankedChunk[] = storedChunks.map((chunk) => {
      const pathScore = scorePathAgainstPrompt(
        chunk.path,
        prompt,
        promptTokens
      );
      const contentBoost = scoreContentTokenBoost(chunk.content, promptTokens);
      const keywordScore = clampNumber(
        pathScore.keywordScore + contentBoost,
        0,
        1
      );
      const rawVector = hasEmbedding(promptEmbedding) && hasEmbedding(chunk.embedding)
        ? cosineSimilarity(promptEmbedding, chunk.embedding)
        : 0;
      const vectorScore = clampNumber(rawVector, 0, 1);
      const score = computeHybridCodeScore(
        keywordScore,
        vectorScore,
        pathScore.isPinned
      );

      return {
        path: chunk.path,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        content: chunk.content,
        keywordScore,
        vectorScore,
        score,
        isPinned: pathScore.isPinned,
      };
    });

    rankedChunks.sort(compareRankedChunksStable);

    const aboveFloor = rankedChunks.filter(
      (chunk) => chunk.score >= CODE_SIMILARITY_FLOOR || chunk.isPinned
    );
    const primaryPool =
      aboveFloor.length > 0 ? aboveFloor : rankedChunks.slice(0, CODE_TOP_CHUNKS);
    const primary = primaryPool.slice(0, CODE_TOP_CHUNKS);

    const seedPaths = Array.from(new Set(primary.map((chunk) => chunk.path)));
    const neighborPaths = await findImportNeighborPaths(projectId, seedPaths);
    const selectedPathSet = new Set([...seedPaths, ...neighborPaths]);

    const byPath = new Map<string, RankedChunk[]>();
    for (const chunk of rankedChunks) {
      if (!selectedPathSet.has(chunk.path)) {
        continue;
      }
      const list = byPath.get(chunk.path) ?? [];
      list.push(chunk);
      byPath.set(chunk.path, list);
    }

    const expanded: RetrievedCodeSnippet[] = [];
    for (const filePath of Array.from(selectedPathSet).sort()) {
      const fileChunks = (byPath.get(filePath) ?? []).sort(
        compareRankedChunksStable
      );
      for (const chunk of fileChunks) {
        expanded.push({
          path: chunk.path,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          content: chunk.content,
          score: chunk.score,
        });
      }
    }

    expanded.sort(compareRankedChunksStable);
    ranked = expanded;
  }

  const { selectedSnippets, omittedPaths } = selectSnippetsWithinBudget(
    allPaths,
    ranked
  );

  return {
    allPaths,
    selectedSnippets,
    omittedPaths,
  };
}
