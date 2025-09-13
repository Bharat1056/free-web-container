"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertTriangle,
  Home,
  RefreshCw,
  ArrowLeft,
  Bug,
  Wifi,
  Shield,
  FileX,
} from "lucide-react";
import { getUserFriendlyError, UserFriendlyError } from "@/lib/error-utils";

interface ErrorDisplayProps {
  error?: unknown;
  title?: string;
  description?: string;
  showRetry?: boolean;
  showGoHome?: boolean;
  showGoBack?: boolean;
  customAction?: {
    label: string;
    onClick: () => void;
  };
  variant?: "card" | "alert" | "inline";
  className?: string;
}

/**
 * Icon mapping for different error types
 */
const getErrorIcon = (error: UserFriendlyError) => {
  if (error.title.includes("Access") || error.title.includes("Permission")) {
    return <Shield className="h-6 w-6 text-destructive" />;
  }
  if (error.title.includes("Connection") || error.title.includes("Network")) {
    return <Wifi className="h-6 w-6 text-destructive" />;
  }
  if (error.title.includes("Not Found")) {
    return <FileX className="h-6 w-6 text-destructive" />;
  }
  if (error.title.includes("Invalid") || error.title.includes("Validation")) {
    return <Bug className="h-6 w-6 text-destructive" />;
  }
  return <AlertTriangle className="h-6 w-6 text-destructive" />;
};

/**
 * Reusable error display component
 */
export function ErrorDisplay({
  error,
  title,
  description,
  showRetry = false,
  showGoHome = true,
  showGoBack = false,
  customAction,
  variant = "card",
  className = "",
}: ErrorDisplayProps) {
  const router = useRouter();

  // Get user-friendly error information
  const userFriendlyError = error
    ? getUserFriendlyError(error)
    : {
        title: title || "Something went wrong",
        description: description || "An unexpected error occurred",
        showRetry: showRetry,
      };

  const handleGoHome = () => {
    router.push("/");
  };

  const handleGoBack = () => {
    router.back();
  };

  const handleRetry = () => {
    window.location.reload();
  };

  // Alert variant
  if (variant === "alert") {
    return (
      <Alert variant="destructive" className={className}>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <div className="space-y-2">
            <div className="font-medium">{userFriendlyError.title}</div>
            <div>{userFriendlyError.description}</div>
            {(userFriendlyError.showRetry ||
              showRetry ||
              showGoHome ||
              showGoBack ||
              customAction) && (
              <div className="flex gap-2 pt-2">
                {userFriendlyError.showRetry && (
                  <Button size="sm" variant="outline" onClick={handleRetry}>
                    <RefreshCw className="mr-1 h-3 w-3" />
                    Retry
                  </Button>
                )}
                {showGoBack && (
                  <Button size="sm" variant="outline" onClick={handleGoBack}>
                    <ArrowLeft className="mr-1 h-3 w-3" />
                    Go Back
                  </Button>
                )}
                {showGoHome && (
                  <Button size="sm" variant="outline" onClick={handleGoHome}>
                    <Home className="mr-1 h-3 w-3" />
                    Home
                  </Button>
                )}
                {customAction && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={customAction.onClick}
                  >
                    {customAction.label}
                  </Button>
                )}
              </div>
            )}
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  // Inline variant
  if (variant === "inline") {
    return (
      <div className={`flex items-center gap-2 text-destructive ${className}`}>
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <div className="flex-1">
          <div className="font-medium">{userFriendlyError.title}</div>
          <div className="text-sm text-muted-foreground">
            {userFriendlyError.description}
          </div>
        </div>
        {(userFriendlyError.showRetry || showRetry) && (
          <Button size="sm" variant="outline" onClick={handleRetry}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  }

  // Card variant (default)
  return (
    <Card className={`w-full max-w-md mx-auto ${className}`}>
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          {getErrorIcon(userFriendlyError)}
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
                  : handleGoBack
              }
              className="w-full"
            >
              {userFriendlyError.action === "Go Home" ? (
                <>
                  <Home className="mr-2 h-4 w-4" />
                  Go Home
                </>
              ) : (
                <>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {userFriendlyError.action}
                </>
              )}
            </Button>
          )}

          {showGoBack && !userFriendlyError.action && (
            <Button variant="outline" onClick={handleGoBack} className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
          )}

          {showGoHome && !userFriendlyError.action && (
            <Button variant="outline" onClick={handleGoHome} className="w-full">
              <Home className="mr-2 h-4 w-4" />
              Go Home
            </Button>
          )}

          {customAction && (
            <Button
              variant="outline"
              onClick={customAction.onClick}
              className="w-full"
            >
              {customAction.label}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Hook for displaying errors in a consistent way
 */
export function useErrorDisplay() {
  const router = useRouter();

  const showError = (error: unknown, options?: Partial<ErrorDisplayProps>) => {
    // This could be used with a toast notification system
    // For now, we'll just log the error
    console.error("Error displayed:", error);
  };

  return {
    showError,
    ErrorDisplay,
  };
}
