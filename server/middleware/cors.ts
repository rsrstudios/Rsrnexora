import { Request, Response, NextFunction } from "express";
import { config } from "../config/env";

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;

  // Determine allowed origin
  if (origin) {
    if (config.allowedOrigins.includes("*")) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    } else if (config.allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, X-Request-Id, Accept"
  );
  res.setHeader("Access-Control-Max-Age", "86400"); // 24 hours preflight cache

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}
