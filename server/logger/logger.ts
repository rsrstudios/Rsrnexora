import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "authorization",
  "cookie",
  "secret",
  "apikey",
  "api_key",
  "gemini_api_key",
  "access_token",
  "refresh_token",
  "api_01_key",
  "api_02_key",
  "api_03_key",
  "api_04_key",
  "api_05_key",
  "api_06_key",
  "api_07_key",
  "api_08_key",
  "api_09_key",
  "api_10_key",
]);

export function redactStringSecrets(str: string): string {
  if (typeof str !== "string") return str;
  return str
    .replace(/(Bearer\s+)[a-zA-Z0-9_\-\.]{6,}/gi, "$1[REDACTED]")
    .replace(/(API_KEY\s*=\s*)[^\s&]+/gi, "$1[REDACTED]")
    .replace(/(API_\d+_KEY\s*=\s*)[^\s&]+/gi, "$1[REDACTED]")
    .replace(/(key=)[a-zA-Z0-9_\-]{10,}/gi, "$1[REDACTED]");
}

export function redactSensitive(obj: any): any {
  if (!obj) return obj;
  if (typeof obj === "string") return redactStringSecrets(obj);
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitive);

  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (
      SENSITIVE_KEYS.has(lowerKey) ||
      lowerKey.includes("password") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("apikey") ||
      (lowerKey.startsWith("api_") && lowerKey.endsWith("_key"))
    ) {
      cleaned[key] = "[REDACTED]";
    } else if (typeof value === "string") {
      cleaned[key] = redactStringSecrets(value);
    } else if (typeof value === "object" && value !== null) {
      cleaned[key] = redactSensitive(value);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export class StructuredLogger {
  private formatLog(level: LogLevel, message: string, meta?: Record<string, any>) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message: redactStringSecrets(message),
      ...(meta ? redactSensitive(meta) : {}),
    };
    return JSON.stringify(logEntry);
  }


  public info(message: string, meta?: Record<string, any>) {
    console.log(this.formatLog("info", message, meta));
  }

  public warn(message: string, meta?: Record<string, any>) {
    console.warn(this.formatLog("warn", message, meta));
  }

  public error(message: string, meta?: Record<string, any>) {
    console.error(this.formatLog("error", message, meta));
  }

  public debug(message: string, meta?: Record<string, any>) {
    if (process.env.NODE_ENV !== "production") {
      console.debug(this.formatLog("debug", message, meta));
    }
  }
}

export const logger = new StructuredLogger();

// Express Request ID & Structured Logging Middleware
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.headers["x-request-id"] as string) || `req_${crypto.randomBytes(8).toString("hex")}`;
  (req as any).id = requestId;
  res.setHeader("X-Request-Id", requestId);

  const startMs = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startMs;
    const statusCode = res.statusCode;

    // Do not log static assets or noisy health check pollings repeatedly unless error
    if (req.path.startsWith("/api") && req.path !== "/api/health") {
      const level: LogLevel = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";
      logger[level](`HTTP ${req.method} ${req.path}`, {
        requestId,
        method: req.method,
        path: req.path,
        statusCode,
        durationMs,
        ip: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "unknown",
      });
    }
  });

  next();
}
