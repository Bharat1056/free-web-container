"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ErrorDisplay } from "@/components/error-display";

function ErrorPageContent() {
  const searchParams = useSearchParams();

  const errorCode = searchParams.get("code");
  const errorMessage = searchParams.get("message");
  const errorTitle = searchParams.get("title");
  const errorDescription = searchParams.get("description");

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

export default function ErrorPage() {
  return (
    <div className="bg-atmosphere flex min-h-screen items-center justify-center p-4">
      <Suspense fallback={<ErrorPageLoading />}>
        <ErrorPageContent />
      </Suspense>
    </div>
  );
}
