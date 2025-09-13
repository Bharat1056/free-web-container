"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ErrorDisplay } from "@/components/error-display";

/**
 * Component that reads search parameters and displays error information
 */
function ErrorPageContent() {
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
    <ErrorDisplay
      error={error}
      title={errorTitle || undefined}
      description={errorDescription || undefined}
      showRetry={true}
      showGoHome={true}
      showGoBack={true}
    />
  );
}

/**
 * Loading fallback component
 */
function ErrorPageLoading() {
  return (
    <ErrorDisplay
      error={undefined}
      title="Loading..."
      description="Please wait while we load the error information."
      showRetry={false}
      showGoHome={true}
      showGoBack={true}
    />
  );
}

/**
 * Dedicated error page that can be redirected to when errors occur
 * This page reads error information from URL search parameters
 */
export default function ErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Suspense fallback={<ErrorPageLoading />}>
        <ErrorPageContent />
      </Suspense>
    </div>
  );
}
