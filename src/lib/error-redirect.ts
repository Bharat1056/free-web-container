/**
 * Utility functions for redirecting to error pages
 */

import { getUserFriendlyError, sanitizeError } from "./error-utils";

/**
 * Redirects to the error page with error information
 */
export function redirectToErrorPage(
  error: unknown,
  options?: {
    title?: string;
    description?: string;
    code?: string;
    message?: string;
  }
) {
  const sanitizedError = sanitizeError(error);
  const userFriendlyError = getUserFriendlyError(error);

  // Create URL search parameters
  const params = new URLSearchParams();

  if (options?.title) {
    params.set("title", options.title);
  } else {
    params.set("title", userFriendlyError.title);
  }

  if (options?.description) {
    params.set("description", options.description);
  } else {
    params.set("description", userFriendlyError.description);
  }

  if (options?.code) {
    params.set("code", options.code);
  } else if (sanitizedError.code) {
    params.set("code", sanitizedError.code);
  }

  if (options?.message) {
    params.set("message", options.message);
  } else if (sanitizedError.message) {
    params.set("message", sanitizedError.message);
  }

  // Add timestamp for debugging
  params.set("timestamp", sanitizedError.timestamp);

  // Redirect to error page
  const errorUrl = `/error?${params.toString()}`;

  if (typeof window !== "undefined") {
    window.location.href = errorUrl;
  } else {
    // Server-side redirect (for Next.js)
    throw new Error(`Redirect to error page: ${errorUrl}`);
  }
}

/**
 * Creates an error redirect URL without actually redirecting
 */
export function createErrorRedirectUrl(
  error: unknown,
  options?: {
    title?: string;
    description?: string;
    code?: string;
    message?: string;
  }
): string {
  const sanitizedError = sanitizeError(error);
  const userFriendlyError = getUserFriendlyError(error);

  const params = new URLSearchParams();

  if (options?.title) {
    params.set("title", options.title);
  } else {
    params.set("title", userFriendlyError.title);
  }

  if (options?.description) {
    params.set("description", options.description);
  } else {
    params.set("description", userFriendlyError.description);
  }

  if (options?.code) {
    params.set("code", options.code);
  } else if (sanitizedError.code) {
    params.set("code", sanitizedError.code);
  }

  if (options?.message) {
    params.set("message", options.message);
  } else if (sanitizedError.message) {
    params.set("message", sanitizedError.message);
  }

  params.set("timestamp", sanitizedError.timestamp);

  return `/error?${params.toString()}`;
}

/**
 * Hook for client-side error redirection
 */
export function useErrorRedirect() {
  const redirectToError = (
    error: unknown,
    options?: Parameters<typeof redirectToErrorPage>[1]
  ) => {
    redirectToErrorPage(error, options);
  };

  const createErrorUrl = (
    error: unknown,
    options?: Parameters<typeof createErrorRedirectUrl>[1]
  ) => {
    return createErrorRedirectUrl(error, options);
  };

  return {
    redirectToError,
    createErrorUrl,
  };
}
