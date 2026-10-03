import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { securityHeadersMiddleware } from "./server/middleware/securityHeaders";
import { corsMiddleware } from "./server/middleware/cors";
import { requestLoggerMiddleware } from "./server/logger/logger";
import { generalApiRateLimiter } from "./server/middleware/rateLimiter";
import { errorHandlerMiddleware } from "./server/middleware/errorHandler";
import { healthRouter } from "./server/routes/health";
import { authRouter } from "./server/routes/auth";
import { chatRouter } from "./server/routes/chat";
import { imageRouter } from "./server/routes/image";
import { searchRouter } from "./server/routes/search";
import { filesRouter } from "./server/routes/files";
import { workspaceRouter } from "./server/routes/workspace";
import { memoryRouter } from "./server/routes/memory";
import { backupRouter } from "./server/routes/backup";
import { modelsRouter } from "./server/routes/models";
import { usageRouter } from "./server/routes/usage";
import { subscriptionRouter } from "./server/routes/subscription";
import { paymentRouter } from "./server/routes/payment";
import { timeRouter } from "./server/routes/time";
import { adminRouter } from "./server/routes/admin";

dotenv.config();

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const app = express();

// Disable X-Powered-By header
app.disable("x-powered-by");

// 1. Security Headers (CSP, Nosniff, Frameguard, Referrer)
app.use(securityHeadersMiddleware);

// 2. Production-safe CORS
app.use(corsMiddleware);

// 3. Structured Request Logger & ID Tracing
app.use(requestLoggerMiddleware);

// 4. General Rate Limiter on /api routes
app.use("/api", generalApiRateLimiter);

// 5. Secure JSON Payload Limits (Up to 25MB for document/image processing)
// Captures rawBody for cryptographically verified webhook signatures
app.use(
  express.json({
    limit: "25mb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// 6. Hardened API Routers
app.use("/api/admin", adminRouter);
app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/chat", chatRouter);
app.use("/api/image", imageRouter);
app.use("/api/search", searchRouter);
app.use("/api/files", filesRouter);
app.use("/api/workspace", workspaceRouter);
app.use("/api/workspaces", workspaceRouter);
app.use("/api/memory", memoryRouter);
app.use("/api/memories", memoryRouter);
app.use("/api/backup", backupRouter);
app.use("/api/models", modelsRouter);
app.use("/api/usage", usageRouter);
app.use("/api/subscription", subscriptionRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/time", timeRouter);

// 7. Centralized Safe Error Handling Middleware
app.use(errorHandlerMiddleware);

async function startServer() {
  // Vite middleware in development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`RSR Nexora V7 Production Server active on http://0.0.0.0:${PORT}`);
  });
}

startServer();

export { app };

