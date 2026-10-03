/**
 * RSR Nexora - AI Provider Error Classifier & Normalizer
 * Categorizes errors to distinguish transient failover conditions from permanent user errors.
 */

export type ErrorCategory =
  | "TRANSIENT_TIMEOUT"
  | "TRANSIENT_RATE_LIMIT"
  | "TRANSIENT_SERVER_ERROR"
  | "TRANSIENT_NETWORK"
  | "PERMANENT_USER_ERROR"
  | "PERMANENT_CONFIG_ERROR"
  | "UNKNOWN_ERROR";

export interface NormalizedProviderError {
  category: ErrorCategory;
  isFailoverEligible: boolean;
  message: string;
  statusCode?: number;
  retryAfterMs?: number;
  originalError?: any;
}

/**
 * Normalizes provider error objects into classified failover decisions.
 */
export function classifyProviderError(err: any): NormalizedProviderError {
  if (!err) {
    return {
      category: "UNKNOWN_ERROR",
      isFailoverEligible: true,
      message: "An unknown AI provider error occurred.",
    };
  }

  const message = String(err.message || err.toString() || "");
  const lowerMsg = message.toLowerCase();
  const status = err.status || err.statusCode || err.response?.status;

  // 1. Timeouts & Aborts
  if (
    err.name === "AbortError" ||
    err.name === "TimeoutError" ||
    lowerMsg.includes("timed out") ||
    lowerMsg.includes("timeout") ||
    lowerMsg.includes("deadline exceeded")
  ) {
    return {
      category: "TRANSIENT_TIMEOUT",
      isFailoverEligible: true,
      statusCode: 504,
      message: "Provider request timed out.",
      originalError: err,
    };
  }

  // 2. Rate Limits & Quotas (429 / Resource Exhausted)
  if (
    status === 429 ||
    lowerMsg.includes("rate limit") ||
    lowerMsg.includes("429") ||
    lowerMsg.includes("resource_exhausted") ||
    lowerMsg.includes("quota exceeded") ||
    lowerMsg.includes("too many requests")
  ) {
    // Extract Retry-After header if present
    let retryAfterMs: number | undefined;
    const retryHeader = err.response?.headers?.get?.("retry-after") || err.retryAfter;
    if (retryHeader) {
      const parsedSeconds = parseInt(retryHeader, 10);
      if (!isNaN(parsedSeconds) && parsedSeconds > 0) {
        retryAfterMs = parsedSeconds * 1000;
      }
    }

    return {
      category: "TRANSIENT_RATE_LIMIT",
      isFailoverEligible: true,
      statusCode: 429,
      retryAfterMs: retryAfterMs || 30000, // Default 30s cooldown for rate limits
      message: "Provider rate limit or quota exceeded.",
      originalError: err,
    };
  }

  // 3. Temporary Server Errors (500, 502, 503, 504, Overloaded, High Demand)
  if (
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    lowerMsg.includes("service unavailable") ||
    lowerMsg.includes("server error") ||
    lowerMsg.includes("bad gateway") ||
    lowerMsg.includes("overloaded") ||
    lowerMsg.includes("high demand") ||
    lowerMsg.includes("unavailable") ||
    lowerMsg.includes("internal error")
  ) {
    return {
      category: "TRANSIENT_SERVER_ERROR",
      isFailoverEligible: true,
      statusCode: status || 503,
      message: "Provider server temporarily unavailable or overloaded.",
      originalError: err,
    };
  }

  // 4. Network & Connection Failures
  if (
    lowerMsg.includes("econnreset") ||
    lowerMsg.includes("econnrefused") ||
    lowerMsg.includes("enotfound") ||
    lowerMsg.includes("fetch failed") ||
    lowerMsg.includes("socket hang up") ||
    lowerMsg.includes("network error")
  ) {
    return {
      category: "TRANSIENT_NETWORK",
      isFailoverEligible: true,
      message: "Network connection failure reaching provider endpoint.",
      originalError: err,
    };
  }

  // 5. Permanent User Errors (400 Bad Request, Input formatting, prompt policy specific to input)
  if (
    status === 400 ||
    lowerMsg.includes("invalid input") ||
    lowerMsg.includes("conversation_too_long") ||
    lowerMsg.includes("payload_too_large") ||
    lowerMsg.includes("invalid_messages") ||
    (lowerMsg.includes("bad request") && !lowerMsg.includes("key"))
  ) {
    return {
      category: "PERMANENT_USER_ERROR",
      isFailoverEligible: false, // DO NOT fall back on user-induced payload errors!
      statusCode: 400,
      message: message.includes("API key") ? "Invalid request format." : message,
      originalError: err,
    };
  }

  // 6. Provider Configuration / Key Errors (401 Unauthorized, 403 Forbidden)
  if (
    status === 401 ||
    status === 403 ||
    lowerMsg.includes("unauthorized") ||
    lowerMsg.includes("api key") ||
    lowerMsg.includes("forbidden") ||
    lowerMsg.includes("permission denied")
  ) {
    return {
      category: "PERMANENT_CONFIG_ERROR",
      isFailoverEligible: true, // Failover to backup provider so app remains usable!
      statusCode: status || 401,
      message: "Provider authentication or configuration error.",
      originalError: err,
    };
  }

  // Fallback default
  return {
    category: "UNKNOWN_ERROR",
    isFailoverEligible: true,
    message: "AI provider encountered an unclassified error.",
    originalError: err,
  };
}
