import { CodeSplitter } from "@llamaindex/node-parser/code";
import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import {
  CODE_AST_EXTENSIONS,
  CODE_FALLBACK_CHUNK_LINES,
  CODE_FALLBACK_CHUNK_OVERLAP_LINES,
  CODE_SPLITTER_MAX_CHARS,
} from "@/constants";
import {
  buildCodeChunkContentHash,
  getFileExtension,
  locateChunkLineRange,
  normalizeProjectPath,
  shouldSkipCodePath,
} from "@/lib/code-utils";

/** One embeddable slice of a project file. */
export type CodeFileChunk = {
  path: string;
  startLine: number;
  endLine: number;
  content: string;
  contentHash: string;
};

type AstLanguage = "typescript" | "tsx";

let typescriptSplitter: CodeSplitter | null = null;
let tsxSplitter: CodeSplitter | null = null;
let treeSitterLoadFailed = false;

/**
 * Lazily builds a LlamaIndex CodeSplitter for TypeScript or TSX.
 *
 * Parsers are cached for the process lifetime. If native tree-sitter fails to
 * load (common on some serverless images), returns `null` so callers can use
 * the line-window fallback without crashing the index job.
 *
 * @param language - Grammar to use (`typescript` for .ts/.js, `tsx` for JSX)
 * @returns Configured splitter, or `null` when tree-sitter is unavailable
 *
 * @example
 * ```ts
 * const splitter = getAstCodeSplitter("tsx");
 * const parts = splitter?.splitText(source) ?? [];
 * ```
 */
function getAstCodeSplitter(language: AstLanguage): CodeSplitter | null {
  if (treeSitterLoadFailed) {
    return null;
  }

  try {
    if (language === "tsx") {
      if (!tsxSplitter) {
        const parser = new Parser();
        parser.setLanguage(TypeScript.tsx);
        tsxSplitter = new CodeSplitter({
          getParser: () => parser,
          maxChars: CODE_SPLITTER_MAX_CHARS,
        });
      }
      return tsxSplitter;
    }

    if (!typescriptSplitter) {
      const parser = new Parser();
      parser.setLanguage(TypeScript.typescript);
      typescriptSplitter = new CodeSplitter({
        getParser: () => parser,
        maxChars: CODE_SPLITTER_MAX_CHARS,
      });
    }
    return typescriptSplitter;
  } catch (error) {
    treeSitterLoadFailed = true;
    console.error("tree-sitter CodeSplitter unavailable; using line fallback:", error);
    return null;
  }
}

/**
 * Picks the AST grammar for a file extension, if supported.
 *
 * @param filePath - Project-relative path
 * @returns Language key, or `null` when the file should use line fallback
 *
 * @example
 * ```ts
 * resolveAstLanguage("src/page.tsx"); // "tsx"
 * resolveAstLanguage("styles.css"); // null
 * ```
 */
function resolveAstLanguage(filePath: string): AstLanguage | null {
  const extension = getFileExtension(filePath);
  if (!(CODE_AST_EXTENSIONS as readonly string[]).includes(extension)) {
    return null;
  }
  if (extension === ".tsx" || extension === ".jsx") {
    return "tsx";
  }
  return "typescript";
}

/**
 * Splits a file into fixed line windows with overlap.
 *
 * Used when AST splitting is unsupported or fails. Same inputs always produce
 * the same windows (deterministic).
 *
 * @param filePath - Project-relative path stored on each chunk
 * @param fileContent - Full file text
 * @returns Ordered chunks covering the file
 *
 * @example
 * ```ts
 * chunkFileByLineWindows("readme.md", longMarkdown);
 * ```
 */
export function chunkFileByLineWindows(
  filePath: string,
  fileContent: string
): CodeFileChunk[] {
  const normalizedPath = normalizeProjectPath(filePath);
  const lines = fileContent.split("\n");
  if (lines.length === 0) {
    return [];
  }

  const windowSize = CODE_FALLBACK_CHUNK_LINES;
  const overlap = Math.min(
    CODE_FALLBACK_CHUNK_OVERLAP_LINES,
    Math.max(windowSize - 1, 0)
  );
  const step = Math.max(windowSize - overlap, 1);
  const chunks: CodeFileChunk[] = [];

  for (let startIndex = 0; startIndex < lines.length; startIndex += step) {
    const endIndex = Math.min(startIndex + windowSize, lines.length);
    const startLine = startIndex + 1;
    const endLine = endIndex;
    const content = lines.slice(startIndex, endIndex).join("\n");
    if (!content.trim()) {
      if (endIndex >= lines.length) {
        break;
      }
      continue;
    }

    chunks.push({
      path: normalizedPath,
      startLine,
      endLine,
      content,
      contentHash: buildCodeChunkContentHash({
        path: normalizedPath,
        startLine,
        endLine,
        content,
      }),
    });

    if (endIndex >= lines.length) {
      break;
    }
  }

  return chunks;
}

/**
 * Splits source with LlamaIndex CodeSplitter and maps pieces back to lines.
 *
 * @param filePath - Project-relative path
 * @param fileContent - Full file text
 * @param language - tree-sitter language to use
 * @returns AST chunks, or `null` when splitting fails
 *
 * @example
 * ```ts
 * chunkFileWithAstSplitter("src/button.tsx", source, "tsx");
 * ```
 */
function chunkFileWithAstSplitter(
  filePath: string,
  fileContent: string,
  language: AstLanguage
): CodeFileChunk[] | null {
  const splitter = getAstCodeSplitter(language);
  if (!splitter) {
    return null;
  }

  try {
    const parts = splitter.splitText(fileContent);
    if (!Array.isArray(parts) || parts.length === 0) {
      return null;
    }

    const normalizedPath = normalizeProjectPath(filePath);
    const chunks: CodeFileChunk[] = [];
    const seenIdentityKeys = new Set<string>();
    let searchFromIndex = 0;

    for (const part of parts) {
      const content = typeof part === "string" ? part : String(part ?? "");
      if (!content.trim()) {
        continue;
      }

      const located = locateChunkLineRange(
        fileContent,
        content,
        searchFromIndex
      );
      if (!located) {
        continue;
      }
      searchFromIndex = located.nextSearchIndex;

      const identityKey = `${normalizedPath}:${located.startLine}:${located.endLine}`;
      if (seenIdentityKeys.has(identityKey)) {
        continue;
      }
      seenIdentityKeys.add(identityKey);

      chunks.push({
        path: normalizedPath,
        startLine: located.startLine,
        endLine: located.endLine,
        content,
        contentHash: buildCodeChunkContentHash({
          path: normalizedPath,
          startLine: located.startLine,
          endLine: located.endLine,
          content,
        }),
      });
    }

    return chunks.length > 0 ? chunks : null;
  } catch (error) {
    console.warn(
      `CodeSplitter failed for "${filePath}"; falling back to line windows:`,
      error
    );
    return null;
  }
}

/**
 * Chunks a single project file using AST splitting when possible.
 *
 * Prefer LlamaIndex CodeSplitter + tree-sitter for TS/JS. Falls back to
 * overlapping line windows for other languages or parse failures.
 *
 * @param filePath - Project-relative path
 * @param fileContent - Full file text
 * @returns Ordered chunks for indexing (may be empty for blank/skipped files)
 *
 * @example
 * ```ts
 * chunkProjectFile("src/app/page.tsx", pageSource);
 * ```
 */
export function chunkProjectFile(
  filePath: string,
  fileContent: string
): CodeFileChunk[] {
  const normalizedPath = normalizeProjectPath(filePath);
  if (shouldSkipCodePath(normalizedPath)) {
    return [];
  }

  const content = typeof fileContent === "string" ? fileContent : "";
  if (!content.trim()) {
    return [];
  }

  const language = resolveAstLanguage(normalizedPath);
  if (language) {
    const astChunks = chunkFileWithAstSplitter(
      normalizedPath,
      content,
      language
    );
    if (astChunks) {
      return astChunks;
    }
  }

  return chunkFileByLineWindows(normalizedPath, content);
}

/**
 * Chunks every file in a project file map into a stable sorted list.
 *
 * Output is sorted by path then startLine so indexing diffs stay deterministic.
 *
 * @param files - Latest fragment `path → content` map
 * @returns All embeddable chunks for the project snapshot
 *
 * @example
 * ```ts
 * const chunks = chunkProjectFiles(fragment.files);
 * ```
 */
export function chunkProjectFiles(files: {
  [path: string]: string;
}): CodeFileChunk[] {
  const paths = Object.keys(files).map(normalizeProjectPath).sort();
  const allChunks: CodeFileChunk[] = [];

  for (const filePath of paths) {
    const rawPath = Object.keys(files).find(
      (candidate) => normalizeProjectPath(candidate) === filePath
    );
    if (!rawPath) {
      continue;
    }
    allChunks.push(...chunkProjectFile(filePath, files[rawPath] ?? ""));
  }

  return allChunks.sort((left, right) => {
    if (left.path !== right.path) {
      return left.path.localeCompare(right.path);
    }
    return left.startLine - right.startLine;
  });
}
