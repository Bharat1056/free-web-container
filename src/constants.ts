import { isProdMode } from "@/lib/app-mode";

/** How many of the most recent messages to always keep for conversational continuity. */
export const RECENT_ANCHOR = 2;

/** Max older messages to pull via semantic similarity. */
export const TOP_K = 4;

/** Minimum cosine similarity required to include a message as relevant. */
export const SIMILARITY_THRESHOLD = 0.7;

/** Hard cap on total messages sent to the agent as context. */
export const MAX_CONTEXT_MESSAGES = 6;

/** Max characters embedded per message (avoids oversized API payloads). */
export const MAX_EMBED_CHARS = 8000;

/** Max characters per AST chunk from LlamaIndex CodeSplitter. */
export const CODE_SPLITTER_MAX_CHARS = 1500;

/** Fallback line-window size when AST parsing is unavailable. */
export const CODE_FALLBACK_CHUNK_LINES = 80;

/** Overlap between fallback line windows so boundary context is preserved. */
export const CODE_FALLBACK_CHUNK_OVERLAP_LINES = 20;

/** Max code chunks kept after hybrid ranking (before graph expand). */
export const CODE_TOP_CHUNKS = 12;

/** Max distinct files represented in retrieved code context. */
export const CODE_TOP_FILES = 8;

/** Minimum hybrid score to keep a chunk (unless it is in the top-N). */
export const CODE_SIMILARITY_FLOOR = 0.35;

/** Weight of path/keyword score in hybrid retrieval (must sum to 1 with vector). */
export const CODE_KEYWORD_WEIGHT = 0.55;

/** Weight of embedding cosine score in hybrid retrieval. */
export const CODE_VECTOR_WEIGHT = 0.45;

/** Max extra files pulled in via 1-hop import edges. */
export const CODE_GRAPH_EXPAND_FILES = 6;

/**
 * Extra attempts after the first failed code reindex.
 * Total tries = 1 + {@link CODE_REINDEX_MAX_RETRIES}.
 */
export const CODE_REINDEX_MAX_RETRIES = 2;

/** Score forced when the prompt names an exact file path. */
export const CODE_EXACT_PATH_PIN_SCORE = 0.99;

/** Score for basename match (e.g. prompt mentions `navbar.tsx`). */
export const CODE_BASENAME_MATCH_SCORE = 0.85;

/** Cap for path-segment / token overlap keyword score. */
export const CODE_PATH_TOKEN_SCORE_CAP = 0.7;

/** Extra boost from content token overlap (added to keyword score, capped). */
export const CODE_CONTENT_TOKEN_BOOST_CAP = 0.15;

/** Total characters of code allowed in the edit-context message. */
export const EDIT_CONTEXT_CHAR_BUDGET = 48_000;

/** Per-file / per-chunk character cap inside edit context. */
export const EDIT_CONTEXT_PER_FILE_LIMIT = 12_000;

/** Edge kind stored for madge import links. */
export const CODE_EDGE_KIND_IMPORTS = "IMPORTS";

/** File extensions chunked with web-tree-sitter / CodeSplitter. */
export const CODE_AST_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
] as const;

/** Path segments that are never indexed. */
export const CODE_SKIP_PATH_SEGMENTS = [
  "node_modules",
  ".next",
  "dist",
  "build",
  ".git",
] as const;

/** Exact basenames that are never indexed. */
export const CODE_SKIP_BASENAMES = [
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
] as const;

/** Max infer/tool iterations in the manual code tool loop. */
export const MAX_CODE_ITERS = 15;

/** Max same-model continuation attempts after a mid-stream rate limit. */
export const MAX_CODE_CONTINUATION_ATTEMPTS = 5;

/**
 * How long a project may stay GENERATING before we treat it as dead when the
 * run cannot be verified via Inngest (no event id, or the REST API is
 * unreachable). Authoritative "Running" REST responses are still trusted.
 */
export const GENERATION_STALE_MS = 5 * 60 * 1000;

/**
 * Model registry keyed by responsibility.
 *
 * - Non-prod (`APP_MODE` unset): OpenAI for text generation, Gemini embeddings.
 * - Prod (`APP_MODE=prod`): Gemini for code + validation + embeddings (BYOK).
 * - Override any role at deploy time with `MODEL_<ROLE>` env vars, e.g.
 *   `MODEL_CODE=gpt-4.1`.
 */
export const MODELS = {
  /** Writes Next.js / Tailwind / shadcn code in the sandbox. */
  code: {
    provider: "openai",
    primary: "gpt-4.1",
    fallbacks: ["gpt-4.1-mini"],
  },
  /** Validates that a prompt is a website/app build request. */
  promptValidation: {
    provider: "openai",
    primary: "gpt-4.1-mini",
    fallbacks: ["gpt-4.1"],
  },
  /** Vector embeddings for RAG message retrieval. */
  embedding: {
    provider: "gemini",
    primary: "gemini-embedding-001",
    fallbacks: ["gemini-embedding-2", "gemini-embedding-2-preview"],
  },
} as const;

/** Prod BYOK model chains (Gemini). */
export const PROD_MODELS = {
  code: {
    provider: "gemini",
    primary: "gemini-2.5-pro",
    fallbacks: ["gemini-2.5-flash"],
  },
  promptValidation: {
    provider: "gemini",
    primary: "gemini-2.5-flash",
    fallbacks: ["gemini-2.5-pro"],
  },
  embedding: {
    provider: "gemini",
    primary: "gemini-embedding-001",
    fallbacks: ["gemini-embedding-2", "gemini-embedding-2-preview"],
  },
} as const;

export type ModelRole = keyof typeof MODELS;

/** Env var name for a given model role, e.g. `decision` → `MODEL_DECISION`. */
export function modelEnvKey(role: ModelRole): string {
  return `MODEL_${role.replace(/([A-Z])/g, "_$1").toUpperCase()}`;
}

/**
 * Ordered model ids for a role: optional env override first, then primary, then fallbacks.
 * Uses {@link PROD_MODELS} when `APP_MODE=prod`.
 */
export function getModelChain(role: ModelRole): string[] {
  const registry = isProdMode() ? PROD_MODELS : MODELS;
  const { primary, fallbacks } = registry[role];
  const override = process.env[modelEnvKey(role)]?.trim();

  if (override) {
    return [override, primary, ...fallbacks].filter(
      // prevents duplicates by checking the first occurrence of the id is same as the current index of that id in the array
      (id, index, all) => all.indexOf(id) === index,
    );
  }

  return [primary, ...fallbacks];
}

/**
 * returns the 1st chain active model id for a role.
 */
export function getModelId(role: ModelRole): string {
  return getModelChain(role)[0] ?? "";
}
