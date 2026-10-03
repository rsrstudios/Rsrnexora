import { Request, Response, NextFunction } from "express";
import { logger } from "../logger/logger";

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
}

export function createError(statusCode: number, code: string, message: string): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.code = code;
  err.isOperational = true;
  return err;
}

export function errorHandlerMiddleware(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const statusCode = typeof err.statusCode === "number" && err.statusCode >= 400 && err.statusCode < 600
    ? err.statusCode
    : 500;

  const code = err.code || (statusCode === 400 ? "BAD_REQUEST" : statusCode === 404 ? "NOT_FOUND" : "INTERNAL_SERVER_ERROR");

  // Mask internal error messages for 500s unless explicitly operational
  const clientMessage =
    err.isOperational || statusCode < 500
      ? err.message || "An error occurred processing your request."
      : "An unexpected server error occurred. Please try again later.";

  // Log full error details securely on server side
  logger.error("Request Error Handler Caught:", {
    requestId: (req as any).id,
    path: req.path,
    method: req.method,
    statusCode,
    errorCode: code,
    errorMessage: err.message,
    stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
  });

  if (res.headersSent) {
    if (!res.writableEnded) {
      res.end();
    }
    return;
  }

  res.status(statusCode).json({
    error: {
      code,
      message: clientMessage,
    },
  });
}
