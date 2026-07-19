"use client";

import React from "react";
import { ErrorDisplay } from "@/components/error-display";

/**
 * Global error page that catches all unhandled errors in the app
 * This is a Next.js special file that handles errors at the root level
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
          <ErrorDisplay
            error={error}
            showRetry={true}
            showGoHome={true}
            customAction={{
              label: "Reset",
              onClick: reset,
            }}
          />
        </div>
      </body>
    </html>
  );
}
