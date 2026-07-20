"use client";

import { toast } from "sonner";
import { isTRPCClientError } from "@trpc/client";
import { getUserFriendlyError } from "@/lib/error-utils";

type ShowMutationErrorToastOptions = {
  /** Opens sign-in when the error is an auth failure. */
  onSignIn?: () => void;
};

function isUnauthorizedError(error: unknown): boolean {
  if (isTRPCClientError(error) && error.data?.code === "UNAUTHORIZED") {
    return true;
  }
  if (error instanceof Error) {
    return /not authenticated|unauthorized/i.test(error.message);
  }
  return false;
}

/**
 * Shows a user-friendly toast for mutation/query failures.
 * Auth failures get a clear message plus an optional Sign in action
 * instead of the raw "Not authenticated" API string.
 */
export function showMutationErrorToast(
  error: unknown,
  options?: ShowMutationErrorToastOptions
): void {
  if (isUnauthorizedError(error)) {
    const friendly = getUserFriendlyError(error);
    toast.error(friendly.title, {
      description: friendly.description,
      duration: 10_000,
      action: options?.onSignIn
        ? {
            label: friendly.action ?? "Sign In",
            onClick: options.onSignIn,
          }
        : undefined,
    });
    return;
  }

  const message =
    error instanceof Error && error.message
      ? error.message
      : "Something went wrong. Please try again.";

  toast.error(message);
}
