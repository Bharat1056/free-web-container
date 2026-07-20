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
 * - `primary` is the default model used in production.
 * - `fallbacks` are tried in order when the primary fails (where runtime
 *   fallback is supported), or used as a known-good list for ops overrides.
 * - All text-generation roles use OpenAI. Embeddings alone use Gemini.
 * - Override any role at deploy time with `MODEL_<ROLE>` env vars, e.g.
 *   `MODEL_CODE=gpt-4.1`.
 */
export const MODELS = {
  /** Decides ENHANCE vs CODE before generation. */
  decision: {
    provider: "openai",
    primary: "gpt-4.1-mini",
    fallbacks: ["gpt-4.1"],
  },
  /** Expands the user prompt into a UI/UX design spec. */
  enhancement: {
    provider: "openai",
    primary: "gpt-4.1",
    fallbacks: ["gpt-4.1-mini"],
  },
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
  /** Resolves edit/continue messages into a concrete coding instruction. */
  editIntent: {
    provider: "openai",
    primary: "gpt-4.1-mini",
    fallbacks: ["gpt-4.1"],
  },
  /** Classifies continuation vs real instruction; resolves effective prompts. */
  messageIntent: {
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

export type ModelRole = keyof typeof MODELS;

/** Env var name for a given model role, e.g. `decision` → `MODEL_DECISION`. */
export function modelEnvKey(role: ModelRole): string {
  return `MODEL_${role.replace(/([A-Z])/g, "_$1").toUpperCase()}`;
}

/**
 * Ordered model ids for a role: optional env override first, then primary, then fallbacks.
 */
export function getModelChain(role: ModelRole): string[] {
  const { primary, fallbacks } = MODELS[role];
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
