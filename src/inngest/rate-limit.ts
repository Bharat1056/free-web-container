import { NonRetriableError, RetryAfterError } from "inngest";

/**
 * Best-effort extraction of a retry delay (ms) from OpenAI / provider errors.
 * Prefers "Please try again in X.XXXs" when present.
 *
 * @param error - Thrown provider or SDK error (any shape)
 * @returns Delay in milliseconds, or `null` when the error is not a rate limit
 */
export function getRateLimitDelayMs(error: unknown): number | null {
  // Exhaustion / intentional hard-fail must not be treated as a soft retry.
  if (error instanceof NonRetriableError) return null;

  const chunks: string[] = [];

  /**
   * Walks nested error objects collecting stringifiable message fields.
   *
   * @param value - Current node to inspect
   * @param depth - Recursion depth (capped to avoid cycles)
   */
  const visit = (value: unknown, depth = 0) => {
    if (value == null || depth > 5) return;
    if (typeof value === "string") {
      chunks.push(value);
      return;
    }
    if (value instanceof Error) {
      chunks.push(value.message);
      visit((value as Error & { cause?: unknown }).cause, depth + 1);
      return;
    }
    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      for (const key of [
        "message",
        "code",
        "type",
        "status",
        "error",
        "body",
        "retry-after",
      ]) {
        if (key in record) visit(record[key], depth + 1);
      }
    }
  };

  visit(error);
  const text = chunks.join("\n");

  const isRateLimited =
    /\b429\b/.test(text) ||
    /rate.?limit/i.test(text) ||
    /rate_limit_exceeded/i.test(text) ||
    /rate limit reached/i.test(text) ||
    /tokens per min/i.test(text) ||
    /\bTPM\b/.test(text);

  if (!isRateLimited) return null;

  const secondsMatch = text.match(/try again in\s+(\d+(?:\.\d+)?)\s*s/i);
  if (secondsMatch) {
    const seconds = Number(secondsMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      // Small buffer so the window has fully reset
      return Math.ceil(seconds * 1000) + 1000;
    }
  }

  // Default backoff when the provider didn't include a delay
  return 20_000;
}

/**
 * Throws an Inngest `RetryAfterError` when `error` is a provider rate limit.
 * No-ops for non-rate-limit errors so callers can rethrow or handle normally.
 * Already-thrown `RetryAfterError` instances are rethrown as-is (no nesting).
 *
 * @param error - Caught error from a model or tool call
 */
export function throwIfRateLimited(error: unknown): never | void {
  if (error instanceof RetryAfterError) {
    throw error;
  }
  if (error instanceof NonRetriableError) {
    return;
  }

  const delayMs = getRateLimitDelayMs(error);
  if (delayMs == null) return;

  throw new RetryAfterError(
    `Model rate limit hit; retrying in ${Math.ceil(delayMs / 1000)}s`,
    delayMs,
    { cause: error }
  );
}

/**
 * Returns whether an error looks like a TPM / rate-limit failure.
 *
 * @param error - Caught error from a model or tool call
 * @returns `true` when {@link getRateLimitDelayMs} finds a rate-limit signal
 */
export function isRateLimitError(error: unknown): boolean {
  return getRateLimitDelayMs(error) != null;
}

/**
 * Sanitizes a string for use as an Inngest step id (alphanumeric, `_`, `-`).
 *
 * @param value - Raw model id or label
 * @returns Safe step-id fragment
 */
export function sanitizeStepId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}
