export type TreeItem = string | [string, ...TreeItem[]];

/** E2B sandbox keep-alive duration (30 minutes). */
export const SANDBOX_TIMEOUT_MS = 60_000 * 10 * 3;

/** @deprecated Use SANDBOX_TIMEOUT_MS */
export const SANDBOX_TIMEOUT = SANDBOX_TIMEOUT_MS;

/** E2B template id used for project sandboxes. */
export const E2B_SANDBOX_TEMPLATE = "vibe-three";

/** Port exposed for the Next.js preview host inside the sandbox. */
export const SANDBOX_PREVIEW_PORT = 3000;
