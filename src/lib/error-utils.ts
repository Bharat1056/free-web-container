/**
 * Error utility functions for consistent error handling
 */

export interface ErrorInfo {
  message: string;
  code?: string;
  statusCode?: number;
  timestamp: string;
  path?: string;
}

export interface UserFriendlyError {
  title: string;
  description: string;
  action?: string;
  showRetry?: boolean;
}

/**
 * Maps internal error codes to user-friendly messages
 */
const ERROR_MESSAGES: Record<string, UserFriendlyError> = {
  // Authentication errors
  UNAUTHORIZED: {
    title: "Access Denied",
    description: "You need to sign in to access this page.",
    action: "Sign In",
  },
  FORBIDDEN: {
    title: "Access Restricted",
    description: "You don't have permission to access this resource.",
    action: "Go Back",
  },

  // Network errors
  NETWORK_ERROR: {
    title: "Connection Problem",
    description:
      "Unable to connect to our servers. Please check your internet connection.",
    showRetry: true,
  },
  TIMEOUT: {
    title: "Request Timeout",
    description: "The request took too long to complete. Please try again.",
    showRetry: true,
  },

  // Server errors
  INTERNAL_ERROR: {
    title: "Something went wrong",
    description:
      "We encountered an unexpected error. Our team has been notified.",
    showRetry: true,
  },
  SERVICE_UNAVAILABLE: {
    title: "Service Unavailable",
    description:
      "Our service is temporarily unavailable. Please try again later.",
    showRetry: true,
  },

  // Validation errors
  VALIDATION_ERROR: {
    title: "Invalid Input",
    description: "Please check your input and try again.",
    action: "Go Back",
  },
  NOT_FOUND: {
    title: "Page Not Found",
    description: "The page you're looking for doesn't exist.",
    action: "Go Home",
  },

  // Rate limiting
  RATE_LIMITED: {
    title: "Too Many Requests",
    description:
      "You've made too many requests. Please wait a moment before trying again.",
    showRetry: true,
  },

  // Default fallback
  UNKNOWN: {
    title: "Unexpected Error",
    description:
      "Something unexpected happened. Please try again or contact support if the problem persists.",
    showRetry: true,
  },
};

/**
 * Sanitizes error information to prevent exposing internal details
 */
export function sanitizeError(error: unknown): ErrorInfo {
  const timestamp = new Date().toISOString();

  // Handle different error types
  if (error instanceof Error) {
    return {
      message: error.message,
      code: getErrorCode(error),
      timestamp,
    };
  }

  if (typeof error === "string") {
    return {
      message: error,
      code: "UNKNOWN",
      timestamp,
    };
  }

  if (typeof error === "object" && error !== null) {
    const errorObj = error as Record<string, unknown>;
    return {
      message: String(errorObj.message || "An unknown error occurred"),
      code: getErrorCode(errorObj),
      statusCode:
        typeof errorObj.statusCode === "number"
          ? errorObj.statusCode
          : undefined,
      timestamp,
    };
  }

  return {
    message: "An unknown error occurred",
    code: "UNKNOWN",
    timestamp,
  };
}

/**
 * Extracts error code from error object
 */
function getErrorCode(error: unknown): string {
  if (error instanceof Error) {
    // Check for common error patterns
    if (
      error.message.includes("401") ||
      error.message.includes("unauthorized")
    ) {
      return "UNAUTHORIZED";
    }
    if (error.message.includes("403") || error.message.includes("forbidden")) {
      return "FORBIDDEN";
    }
    if (error.message.includes("404") || error.message.includes("not found")) {
      return "NOT_FOUND";
    }
    if (error.message.includes("timeout")) {
      return "TIMEOUT";
    }
    if (error.message.includes("network") || error.message.includes("fetch")) {
      return "NETWORK_ERROR";
    }
    if (
      error.message.includes("validation") ||
      error.message.includes("invalid")
    ) {
      return "VALIDATION_ERROR";
    }
    if (error.message.includes("rate limit")) {
      return "RATE_LIMITED";
    }
  }

  if (typeof error === "object" && error !== null) {
    const errorObj = error as Record<string, unknown>;
    if (typeof errorObj.code === "string") {
      return errorObj.code.toUpperCase();
    }
    if (typeof errorObj.statusCode === "number") {
      return getStatusCodeError(errorObj.statusCode);
    }
  }

  return "UNKNOWN";
}

/**
 * Maps HTTP status codes to error codes
 */
function getStatusCodeError(statusCode: number): string {
  switch (statusCode) {
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 408:
      return "TIMEOUT";
    case 422:
      return "VALIDATION_ERROR";
    case 429:
      return "RATE_LIMITED";
    case 500:
    case 502:
    case 503:
    case 504:
      return "SERVICE_UNAVAILABLE";
    default:
      return "UNKNOWN";
  }
}

/**
 * Gets user-friendly error information
 */
export function getUserFriendlyError(error: unknown): UserFriendlyError {
  const sanitizedError = sanitizeError(error);
  const errorCode = sanitizedError.code || "UNKNOWN";

  return ERROR_MESSAGES[errorCode] || ERROR_MESSAGES["UNKNOWN"];
}

/**
 * Logs error for debugging (only in development)
 */
export function logError(error: unknown, context?: string): void {
  if (process.env.NODE_ENV === "development") {
    console.error(`[Error${context ? ` - ${context}` : ""}]:`, error);
  }

  // In production, you might want to send this to an error tracking service
  // like Sentry, LogRocket, etc.
}

/**
 * Creates a standardized error response
 */
export function createErrorResponse(error: unknown, context?: string) {
  const sanitizedError = sanitizeError(error);
  const userFriendlyError = getUserFriendlyError(error);

  logError(error, context);

  return {
    error: sanitizedError,
    userFriendly: userFriendlyError,
  };
}
