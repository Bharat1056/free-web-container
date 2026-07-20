import type { Prisma } from "@prisma/client";

/**
 * Retry semantics for generation failures.
 *
 * Used by:
 * - `messages.create` when `retry: true` (no new USER message; reuse last prompt)
 * - Inngest `codeAgentFunction` when `event.data.retry` is true (`isContinuation`)
 * - FE Retry button when `generationStatus === FAILED`
 *
 * RETRY assistant messages store user-facing `content` plus `errorDetails` Json
 * for later frequency analysis. They are not embedded for RAG.
 */

/**
 * Short chat copy on ASSISTANT RETRY messages.
 * The FE also shows a Retry button (composer is hidden) — this string is not the only UI.
 */
export const RETRY_USER_FACING_CONTENT =
  "Something went wrong. Please try again";

/** Max characters kept from an error stack in `errorDetails`. */
export const ERROR_DETAILS_MAX_STACK_CHARS = 4000;

/**
 * Flexible analytics payload stored on ASSISTANT RETRY messages.
 * Extra keys are allowed so we can extend without migrations.
 */
export type ErrorDetailsForAnalytics = {
  message: string;
  name?: string;
  code?: string;
  step?: string;
  stack?: string;
  at?: string;
  [key: string]: unknown;
};

/**
 * Returns true when the tRPC / Inngest payload requests a retry of the last
 * real USER prompt (no new chat row).
 */
export function isRetryPayload(retry: boolean | undefined): boolean {
  return retry === true;
}

/**
 * Serializes an unknown failure into Json-safe error details for analytics.
 *
 * @param error - Caught value or synthetic failure description
 * @param extras - Optional fields (e.g. Inngest step id)
 */
export function toErrorDetails(
  error: unknown,
  extras?: { code?: string; step?: string },
): ErrorDetailsForAnalytics {
  const at = new Date().toISOString();

  if (error instanceof Error) {
    const stack =
      typeof error.stack === "string" && error.stack.length > 0
        ? error.stack.slice(0, ERROR_DETAILS_MAX_STACK_CHARS)
        : undefined;

    return {
      message: error.message || "Unknown error",
      name: error.name,
      code: extras?.code,
      step: extras?.step,
      stack,
      at,
    };
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return {
      message: error.trim(),
      code: extras?.code,
      step: extras?.step,
      at,
    };
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message =
      typeof record.message === "string"
        ? record.message
        : JSON.stringify(error);

    return {
      message,
      name: typeof record.name === "string" ? record.name : undefined,
      code:
        extras?.code ??
        (typeof record.code === "string" ? record.code : undefined),
      step: extras?.step,
      at,
    };
  }

  return {
    message: "Unknown error",
    code: extras?.code,
    step: extras?.step,
    at,
  };
}

/** Prisma Json value for `Message.errorDetails`. */
export function errorDetailsAsPrismaJson(
  details: ErrorDetailsForAnalytics,
): Prisma.InputJsonValue {
  return details as Prisma.InputJsonValue;
}
