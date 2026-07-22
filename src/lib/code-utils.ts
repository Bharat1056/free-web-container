import { createHash } from "crypto";
import path from "path";
import {
  CODE_SKIP_BASENAMES,
  CODE_SKIP_PATH_SEGMENTS,
} from "@/constants";

/**
 * Builds a stable SHA-256 fingerprint for a code chunk.
 *
 * Use this before embedding so unchanged chunks can skip the embedding API.
 * Changing any of path, line range, or content produces a new hash.
 *
 * @param input.path - Project-relative file path
 * @param input.startLine - 1-based start line of the chunk
 * @param input.endLine - 1-based end line of the chunk
 * @param input.content - Exact chunk text
 * @returns Hex-encoded SHA-256 digest
 *
 * @example
 * ```ts
 * const hash = buildCodeChunkContentHash({
 *   path: "src/navbar.tsx",
 *   startLine: 1,
 *   endLine: 40,
 *   content: "export function Navbar() {}",
 * });
 * ```
 */
export function buildCodeChunkContentHash(input: {
  path: string;
  startLine: number;
  endLine: number;
  content: string;
}): string {
  const payload = `${input.path}|${input.startLine}|${input.endLine}|${input.content}`;
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Normalizes a file path to forward-slash, project-relative form.
 *
 * Strips leading `./` and collapses Windows backslashes so madge paths and
 * fragment keys compare equal.
 *
 * @param filePath - Raw path from the filesystem or madge
 * @returns Normalized relative path using `/` separators
 *
 * @example
 * ```ts
 * normalizeProjectPath(".\\src\\app.tsx"); // "src/app.tsx"
 * ```
 */
export function normalizeProjectPath(filePath: string): string {
  return filePath
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

/**
 * Returns the basename of a project path (last segment).
 *
 * @param filePath - Project-relative path
 * @returns File name including extension
 *
 * @example
 * ```ts
 * getFileBasename("src/components/navbar.tsx"); // "navbar.tsx"
 * ```
 */
export function getFileBasename(filePath: string): string {
  const normalized = normalizeProjectPath(filePath);
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? normalized;
}

/**
 * Lowercases and extracts alphanumeric tokens from text for keyword scoring.
 *
 * Drops empty tokens. Callers may filter stopwords separately.
 *
 * @param text - Prompt or file content
 * @returns Ordered list of tokens (may contain duplicates)
 *
 * @example
 * ```ts
 * tokenizeForCodeSearch("Make the Navbar dark!");
 * // ["make", "the", "navbar", "dark"]
 * ```
 */
export function tokenizeForCodeSearch(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 0);
}

/** Common English / prompt filler words ignored during keyword ranking. */
const CODE_SEARCH_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "please",
  "make",
  "change",
  "update",
  "fix",
  "add",
  "set",
  "be",
  "is",
  "are",
  "it",
  "this",
  "that",
  "my",
  "me",
  "i",
  "can",
  "you",
  "we",
]);

/**
 * Tokenizes text and removes stopwords used in code retrieval prompts.
 *
 * Prefer this over {@link tokenizeForCodeSearch} when ranking against a user
 * prompt so filler words do not dilute path matches.
 *
 * @param text - User prompt or free-form query
 * @returns Deduped meaningful tokens in first-seen order
 *
 * @example
 * ```ts
 * tokenizePromptForCodeSearch("please make the navbar dark");
 * // ["navbar", "dark"]
 * ```
 */
export function tokenizePromptForCodeSearch(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const token of tokenizeForCodeSearch(text)) {
    if (CODE_SEARCH_STOPWORDS.has(token) || seen.has(token)) {
      continue;
    }
    seen.add(token);
    result.push(token);
  }

  return result;
}

/**
 * Decides whether a path should be skipped during code indexing.
 *
 * Skips dependency folders, build output, lockfiles, and empty paths.
 * Extend {@link CODE_SKIP_PATH_SEGMENTS} / {@link CODE_SKIP_BASENAMES} to
 * exclude more patterns without changing call sites.
 *
 * @param filePath - Project-relative path
 * @returns `true` when the file must not be chunked or embedded
 *
 * @example
 * ```ts
 * shouldSkipCodePath("node_modules/lodash/index.js"); // true
 * shouldSkipCodePath("src/app/page.tsx"); // false
 * ```
 */
export function shouldSkipCodePath(filePath: string): boolean {
  const normalized = normalizeProjectPath(filePath);
  if (!normalized) {
    return true;
  }

  const segments = normalized.split("/");
  const basename = segments[segments.length - 1] ?? "";

  if (
    (CODE_SKIP_BASENAMES as readonly string[]).includes(basename)
  ) {
    return true;
  }

  return segments.some((segment) =>
    (CODE_SKIP_PATH_SEGMENTS as readonly string[]).includes(segment)
  );
}

/**
 * Returns the lowercase file extension including the dot.
 *
 * @param filePath - Project-relative path
 * @returns Extension such as `.tsx`, or `""` when missing
 *
 * @example
 * ```ts
 * getFileExtension("src/page.tsx"); // ".tsx"
 * ```
 */
export function getFileExtension(filePath: string): string {
  const basename = getFileBasename(filePath);
  const dotIndex = basename.lastIndexOf(".");
  if (dotIndex <= 0) {
    return "";
  }
  return basename.slice(dotIndex).toLowerCase();
}

/**
 * Converts a character offset in source text into a 1-based line number.
 *
 * @param source - Full file contents
 * @param characterOffset - Zero-based index into `source`
 * @returns 1-based line number
 *
 * @example
 * ```ts
 * getLineNumberAtOffset("a\nb\nc", 2); // 2
 * ```
 */
export function getLineNumberAtOffset(
  source: string,
  characterOffset: number
): number {
  if (characterOffset <= 0) {
    return 1;
  }
  const clamped = Math.min(characterOffset, source.length);
  let lineNumber = 1;
  for (let i = 0; i < clamped; i++) {
    if (source[i] === "\n") {
      lineNumber += 1;
    }
  }
  return lineNumber;
}

/**
 * Locates a chunk string inside a file and returns its 1-based line range.
 *
 * Searches forward from `searchFromIndex` so successive chunks from the same
 * splitter stay in document order. If the exact chunk is missing, falls back
 * to a trimmed search. Returns `null` when the chunk cannot be found so callers
 * can skip it instead of inventing duplicate line ranges.
 *
 * @param source - Full file contents
 * @param chunkText - Chunk text returned by the splitter
 * @param searchFromIndex - Character offset to start searching from
 * @returns Line range plus the next search index, or `null` if not found
 *
 * @example
 * ```ts
 * const located = locateChunkLineRange("line1\nline2\n", "line2", 0);
 * // { startLine: 2, endLine: 2, nextSearchIndex: ... }
 * ```
 */
export function locateChunkLineRange(
  source: string,
  chunkText: string,
  searchFromIndex: number
): {
  startLine: number;
  endLine: number;
  nextSearchIndex: number;
} | null {
  let matchIndex = source.indexOf(chunkText, searchFromIndex);
  let matchedText = chunkText;

  if (matchIndex < 0) {
    const trimmed = chunkText.trim();
    if (trimmed) {
      matchIndex = source.indexOf(trimmed, searchFromIndex);
      matchedText = trimmed;
    }
  }

  if (matchIndex < 0 && searchFromIndex > 0) {
    matchIndex = source.indexOf(chunkText);
    matchedText = chunkText;
    if (matchIndex < 0) {
      const trimmed = chunkText.trim();
      matchIndex = trimmed ? source.indexOf(trimmed) : -1;
      matchedText = trimmed;
    }
  }

  if (matchIndex < 0) {
    return null;
  }

  const startLine = getLineNumberAtOffset(source, matchIndex);
  const endLine = getLineNumberAtOffset(
    source,
    matchIndex + Math.max(matchedText.length - 1, 0)
  );

  return {
    startLine,
    endLine,
    nextSearchIndex: matchIndex + matchedText.length,
  };
}

/**
 * Clamps a number into an inclusive `[min, max]` range.
 *
 * @param value - Raw score or measurement
 * @param min - Lower bound
 * @param max - Upper bound
 * @returns Value restricted to the range
 *
 * @example
 * ```ts
 * clampNumber(1.4, 0, 1); // 1
 * ```
 */
export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Counts how many of `needles` appear in `haystackTokens` (set membership).
 *
 * @param haystackTokens - Token list or set to search in
 * @param needles - Tokens to look for
 * @returns Count of needles found at least once
 *
 * @example
 * ```ts
 * countTokenOverlap(["nav", "bar"], ["nav", "dark"]); // 1
 * ```
 */
export function countTokenOverlap(
  haystackTokens: Iterable<string>,
  needles: string[]
): number {
  const haystack = haystackTokens instanceof Set
    ? haystackTokens
    : new Set(haystackTokens);
  let overlap = 0;
  for (const needle of needles) {
    if (haystack.has(needle)) {
      overlap += 1;
    }
  }
  return overlap;
}

/**
 * Joins a temp directory with a project-relative path safely.
 *
 * Prevents path traversal by normalizing and rejecting `..` segments.
 *
 * @param tempRootAbsolute - Absolute temp root created for indexing
 * @param projectRelativePath - Path from the fragment file map
 * @returns Absolute path under `tempRootAbsolute`
 * @throws If the path escapes the temp root
 *
 * @example
 * ```ts
 * resolveTempFilePath("/tmp/abc", "src/page.tsx");
 * // "/tmp/abc/src/page.tsx"
 * ```
 */
export function resolveTempFilePath(
  tempRootAbsolute: string,
  projectRelativePath: string
): string {
  const normalized = normalizeProjectPath(projectRelativePath);
  if (
    !normalized ||
    normalized.split("/").some((segment) => segment === "..")
  ) {
    throw new Error(`Unsafe project path for temp write: ${projectRelativePath}`);
  }

  const absolutePath = path.resolve(tempRootAbsolute, normalized);
  const rootWithSep = tempRootAbsolute.endsWith(path.sep)
    ? tempRootAbsolute
    : `${tempRootAbsolute}${path.sep}`;

  if (
    absolutePath !== tempRootAbsolute &&
    !absolutePath.startsWith(rootWithSep)
  ) {
    throw new Error(`Temp path escaped root: ${projectRelativePath}`);
  }

  return absolutePath;
}
