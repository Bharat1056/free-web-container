"use client";

import React from "react";
import {
  ErrorBoundary as ReactErrorBoundary,
  FallbackProps,
} from "react-error-boundary";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { getUserFriendlyError, logError } from "@/lib/error-utils";

interface ErrorFallbackProps extends FallbackProps {
  resetErrorBoundary: () => void;
}

/**
 * Fallback component displayed when an error occurs
 */
function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  const router = useRouter();
  const userFriendlyError = getUserFriendlyError(error);

  // Log the error for debugging
  React.useEffect(() => {
    logError(error, "ErrorBoundary");
  }, [error]);

  const handleGoHome = () => {
    router.push("/");
  };

  const handleRetry = () => {
    resetErrorBoundary();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-xl">{userFriendlyError.title}</CardTitle>
          <CardDescription className="text-muted-foreground">
            {userFriendlyError.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2">
            {userFriendlyError.showRetry && (
              <Button onClick={handleRetry} className="w-full">
                <RefreshCw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
            )}

            {userFriendlyError.action && (
              <Button
                variant="outline"
                onClick={
                  userFriendlyError.action === "Go Home"
                    ? handleGoHome
                    : () => router.back()
                }
                className="w-full"
              >
                {userFriendlyError.action === "Go Home" ? (
                  <>
                    <Home className="mr-2 h-4 w-4" />
                    Go Home
                  </>
                ) : (
                  userFriendlyError.action
                )}
              </Button>
            )}

            {!userFriendlyError.showRetry && !userFriendlyError.action && (
              <Button onClick={handleGoHome} className="w-full">
                <Home className="mr-2 h-4 w-4" />
                Go Home
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<ErrorFallbackProps>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

/**
 * Error boundary component that catches JavaScript errors anywhere in the child component tree
 */
export function ErrorBoundary({
  children,
  fallback: FallbackComponent = ErrorFallback,
  onError,
}: ErrorBoundaryProps) {
  const handleError = (error: Error, errorInfo: React.ErrorInfo) => {
    logError(error, "ErrorBoundary");
    onError?.(error, errorInfo);
  };

  return (
    <ReactErrorBoundary
      FallbackComponent={FallbackComponent}
      onError={handleError}
      onReset={() => {
        // Optionally clear any error state or redirect
        window.location.reload();
      }}
    >
      {children}
    </ReactErrorBoundary>
  );
}

/**
 * Hook for manually triggering error boundary
 */
export function useErrorHandler() {
  return (error: Error) => {
    throw error;
  };
}
