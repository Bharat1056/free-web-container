"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { ErrorDisplay } from "@/components/error-display";

/**
 * Dedicated error page that can be redirected to when errors occur
 * This page reads error information from URL search parameters
 */
export default function ErrorPage() {
  const searchParams = useSearchParams();

  // Extract error information from URL parameters
  const errorCode = searchParams.get("code");
  const errorMessage = searchParams.get("message");
  const errorTitle = searchParams.get("title");
  const errorDescription = searchParams.get("description");

  // Create error object from URL parameters
  const error =
    errorCode || errorMessage
      ? {
          code: errorCode,
          message: errorMessage,
        }
      : undefined;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <ErrorDisplay
        error={error}
        title={errorTitle || undefined}
        description={errorDescription || undefined}
        showRetry={true}
        showGoHome={true}
        showGoBack={true}
      />
    </div>
  );
}
