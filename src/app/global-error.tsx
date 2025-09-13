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
    <html>
      <body>
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
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
