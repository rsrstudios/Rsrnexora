import { Request, Response, NextFunction } from "express";

/**
 * Production-grade HTTP security headers middleware.
 */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Prevent cross-site scripting filter bypasses
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Strict Referrer Policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Allow iframe embedding only from same origin or Cloud Run AI Studio preview wrapper
  res.setHeader("X-Frame-Options", "SAMEORIGIN");

  // Content Security Policy
  // Allow scripts and assets needed by Vite/React, Web Workers for PWA, and inline styling
  const isDev = process.env.NODE_ENV !== "production";
  const cspDirectives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://fonts.googleapis.com ${isDev ? "http://localhost:* http://0.0.0.0:*" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' data: blob: https: wss: ws:",
    "media-src 'self' blob: data:",
    "worker-src 'self' blob:",
    "frame-ancestors 'self' https://ai.studio https://*.google.com https://*.run.app",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  res.setHeader("Content-Security-Policy", cspDirectives);

  // Cross-Origin Resource Policy
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  next();
}
