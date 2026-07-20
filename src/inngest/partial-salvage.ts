import type { FilePartial } from "@/inngest/sandbox-tools";

export type RateLimitedInference = {
  status: "rate_limited";
  partialText: string;
  partialToolArgs: Array<{
    name: string;
    argumentsSoFar: string;
  }>;
  retryAfter: number;
};

export type SalvageResult = {
  files: FilePartial[];
  paths: string[];
  lastLinesByPath: Record<string, string>;
};

const LAST_LINES = 20;

/**
 * Returns the trailing lines of a string for continue-prompt grounding.
 *
 * @param content - Full file or text content
 * @param count - Number of trailing lines to keep (default 20)
 * @returns The last `count` lines joined with newlines
 */
function lastLines(content: string, count = LAST_LINES): string {
  const lines = content.split("\n");
  return lines.slice(-count).join("\n");
}

/**
 * Best-effort extraction of path + content pairs from truncated
 * `createOrUpdateFiles` argument JSON. Outer JSON may be incomplete.
 *
 * @param argumentsSoFar - Accumulated tool-call argument string from the stream
 * @returns Salvaged file partials (may be empty if nothing recoverable)
 */
export function extractFilesFromCreateOrUpdateArgs(
  argumentsSoFar: string
): FilePartial[] {
  const found: FilePartial[] = [];
  const seen = new Set<string>();

  // Match path then content (common streaming order)
  const pathThenContent =
    /"path"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"content"\s*:\s*"((?:\\.|[^"\\])*)/g;
  // Match content then path
  const contentThenPath =
    /"content"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"path"\s*:\s*"((?:\\.|[^"\\])*)"/g;

  let match: RegExpExecArray | null;
  while ((match = pathThenContent.exec(argumentsSoFar)) !== null) {
    const path = unescapeJsonString(match[1]);
    const content = unescapeJsonString(match[2]);
    if (path && content.length > 0 && !seen.has(path)) {
      seen.add(path);
      found.push({ path, content });
    }
  }

  while ((match = contentThenPath.exec(argumentsSoFar)) !== null) {
    const content = unescapeJsonString(match[1]);
    const path = unescapeJsonString(match[2]);
    if (path && content.length > 0 && !seen.has(path)) {
      seen.add(path);
      found.push({ path, content });
    }
  }

  // Truncated content after a path — capture longest recoverable string
  if (found.length === 0) {
    const truncated =
      /"path"\s*:\s*"((?:\\.|[^"\\])*)"[\s\S]*?"content"\s*:\s*"((?:\\.|[^"\\])*)$/;
    const truncMatch = argumentsSoFar.match(truncated);
    if (truncMatch) {
      const path = unescapeJsonString(truncMatch[1]);
      const content = unescapeJsonString(truncMatch[2]);
      if (path && content.length > 0) {
        found.push({ path, content });
      }
    }
  }

  // Also try full JSON parse when args happen to be complete
  try {
    const parsed = JSON.parse(argumentsSoFar) as {
      files?: Array<{ path?: string; content?: string }>;
    };
    if (Array.isArray(parsed.files)) {
      for (const file of parsed.files) {
        if (
          file?.path &&
          typeof file.content === "string" &&
          file.content.length > 0 &&
          !seen.has(file.path)
        ) {
          seen.add(file.path);
          found.push({ path: file.path, content: file.content });
        }
      }
    }
  } catch {
    // incomplete JSON — ignore
  }

  return found;
}

/**
 * Converts an escaped JSON string fragment into plain text.
 *
 * @param value - Raw capture from a regex (may include `\\n`, `\\"` etc.)
 * @returns Unescaped string content
 */
function unescapeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\r/g, "\r")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
}

/**
 * Extracts path-labeled fenced code blocks from assistant prose.
 * Example: ` ```tsx path=src/app/page.tsx ... ``` ` or ` ```src/app/page.tsx `
 *
 * @param partialText - Streamed assistant content before a rate limit
 * @returns Salvaged file partials when a path label is present
 */
export function extractFilesFromPartialText(partialText: string): FilePartial[] {
  const found: FilePartial[] = [];
  const seen = new Set<string>();

  const labeledFence =
    /```(?:[\w.+-]+)?\s*(?:path\s*=\s*)?([^\s\n`]+\.[a-zA-Z0-9]+)\s*\n([\s\S]*?)(?:```|$)/g;

  let match: RegExpExecArray | null;
  while ((match = labeledFence.exec(partialText)) !== null) {
    const path = match[1].trim().replace(/^["']|["']$/g, "");
    const content = match[2];
    if (path && content.length > 0 && !seen.has(path)) {
      seen.add(path);
      found.push({ path, content });
    }
  }

  return found;
}

/**
 * Combines truncated tool args and labeled prose into salvageable file partials.
 *
 * @param inference - Rate-limited stream result with partial text and tool args
 * @returns Files to checkpoint, their paths, and trailing-line snippets
 */
export function extractSalvageablePartials(
  inference: RateLimitedInference
): SalvageResult {
  const byPath = new Map<string, string>();

  for (const tool of inference.partialToolArgs) {
    if (tool.name !== "createOrUpdateFiles") continue;
    for (const file of extractFilesFromCreateOrUpdateArgs(tool.argumentsSoFar)) {
      const existing = byPath.get(file.path);
      // Keep the longest content for a path
      if (!existing || file.content.length > existing.length) {
        byPath.set(file.path, file.content);
      }
    }
  }

  for (const file of extractFilesFromPartialText(inference.partialText)) {
    const existing = byPath.get(file.path);
    if (!existing || file.content.length > existing.length) {
      byPath.set(file.path, file.content);
    }
  }

  const files: FilePartial[] = [...byPath.entries()].map(([path, content]) => ({
    path,
    content,
  }));

  const lastLinesByPath: Record<string, string> = {};
  for (const file of files) {
    lastLinesByPath[file.path] = lastLines(file.content);
  }

  return {
    files,
    paths: files.map((f) => f.path),
    lastLinesByPath,
  };
}

/**
 * Builds the user message that tells the model to continue from sandbox state
 * via readFiles + full-file createOrUpdateFiles (not freeform half-code).
 *
 * @param input.incompletePaths - Paths checkpointed as incomplete
 * @param input.completedPaths - Paths already fully written
 * @param input.lastLinesByPath - Trailing lines per incomplete path for grounding
 * @returns Continuation instruction text for the next inference
 */
export function buildGroundedContinuationMessage(input: {
  incompletePaths: string[];
  completedPaths: string[];
  lastLinesByPath: Record<string, string>;
}): string {
  const completed =
    input.completedPaths.length > 0
      ? input.completedPaths.map((p) => `- ${p}`).join("\n")
      : "- (none)";

  const incomplete =
    input.incompletePaths.length > 0
      ? input.incompletePaths
          .map((p) => {
            const tail = input.lastLinesByPath[p];
            return tail
              ? `- ${p} (incomplete; last lines:\n${tail}\n)`
              : `- ${p} (incomplete)`;
          })
          .join("\n")
      : "- (none newly checkpointed; continue remaining work from sandbox state)";

  return `Rate limit interrupted generation. Sandbox is the source of truth.

Already complete files (do not recreate unless fixing a clear bug):
${completed}

Incomplete files already checkpointed on disk (must finish these):
${incomplete}

Required next actions:
1. Call readFiles on every incomplete path listed above (if any).
2. Call createOrUpdateFiles with the FULL final content for each incomplete file.
   Preserve existing structure, imports, components, and naming from the checkpoint
   unless fixing a clear syntax break from the truncation.
3. Do not paste the remaining half as freeform chat text.
4. Continue the overall task after those files are complete.`;
}
