import { Router } from "express";
import { aiService } from "../ai/aiService";
import { ChatCompletionRequest } from "../ai/types";
import { chatRateLimiter } from "../middleware/rateLimiter";
import { authenticateSession } from "../middleware/authMiddleware";
import { logger } from "../logger/logger";
import { db } from "../db/database";

export const chatRouter = Router();

const MAX_TOTAL_CHARACTERS = 100000;
const MAX_MESSAGES_COUNT = 150;
const STREAM_TIMEOUT_MS = 90000; // 90 seconds

chatRouter.use(chatRateLimiter);
chatRouter.use(authenticateSession);

// POST /api/chat/stream - Production Hardened SSE Streaming
chatRouter.post("/stream", async (req, res) => {
  const {
    messages,
    systemInstruction,
    temperature,
    model,
    webSearch,
    mode,
    timezone,
  } = req.body;

  // Validate messages array
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({
      error: {
        code: "INVALID_MESSAGES",
        message: "Missing or invalid 'messages' array in request body.",
      },
    });
    return;
  }

  if (messages.length > MAX_MESSAGES_COUNT) {
    res.status(400).json({
      error: {
        code: "CONVERSATION_TOO_LONG",
        message: `Conversation history exceeds maximum of ${MAX_MESSAGES_COUNT} messages.`,
      },
    });
    return;
  }

  // Validate content length
  let totalChars = 0;
  for (const m of messages) {
    if (!m || typeof m !== "object" || typeof m.role !== "string") {
      res.status(400).json({
        error: {
          code: "MALFORMED_MESSAGE",
          message: "Each message must include a valid 'role' and 'content'.",
        },
      });
      return;
    }
    if (typeof m.content === "string") {
      totalChars += m.content.length;
    }
  }

  if (totalChars > MAX_TOTAL_CHARACTERS) {
    res.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Total conversation text exceeds maximum allowable limits.",
      },
    });
    return;
  }

  const user = req.user;
  if (!user) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication session required.",
      },
    });
    return;
  }

  // Atomic reservation of message usage before contacting any AI provider
  const reservation = await db.reserveUsage(user.userId, user.tier, "messages");
  if (!reservation.allowed) {
    res.status(429).json({
      error: {
        code: "DAILY_LIMIT_REACHED",
        message: "You've reached today's limit. Your limit will reset tomorrow.",
        resource: "messages",
        limit: reservation.limit,
        remaining: 0,
      },
    });
    return;
  }

  // Set SSE Headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof (res as any).flushHeaders === "function") {
    (res as any).flushHeaders();
  }
  res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

  const abortController = new AbortController();
  let emittedAnyTokens = false;

  // Handle client disconnects safely
  req.on("close", () => {
    if (!res.writableEnded) {
      if (!emittedAnyTokens) {
        db.rollbackUsage(user.userId, "messages").catch(() => {});
      }
      abortController.abort();
      res.end();
    }
  });

  // Enforce stream timeout
  const timeoutId = setTimeout(() => {
    if (!res.writableEnded) {
      if (!emittedAnyTokens) {
        db.rollbackUsage(user.userId, "messages").catch(() => {});
      }
      abortController.abort();
      res.write(
        `data: ${JSON.stringify({
          error: {
            code: "STREAM_TIMEOUT",
            message: "Generation timed out before completion.",
          },
        })}\n\n`
      );
      res.end();
    }
  }, STREAM_TIMEOUT_MS);

  const sanitizedTemp =
    typeof temperature === "number" && !isNaN(temperature)
      ? Math.max(0, Math.min(1.5, temperature))
      : 0.7;

  const validModes = ["chat", "research", "coding", "writing", "image", "voice", "filemaker", "document"];
  const safeMode = validModes.includes(mode) ? mode : "chat";
  const userTimezone =
    typeof timezone === "string" && timezone.trim()
      ? timezone.trim()
      : typeof req.headers["x-timezone"] === "string"
      ? (req.headers["x-timezone"] as string).trim()
      : "Asia/Kolkata";

  const requestPayload: ChatCompletionRequest = {
    messages,
    systemInstruction: typeof systemInstruction === "string" ? systemInstruction.slice(0, 4000) : undefined,
    temperature: sanitizedTemp,
    model: typeof model === "string" ? model : "balanced",
    webSearch: safeMode === "research" ? true : Boolean(webSearch),
    mode: safeMode,
    timezone: userTimezone,
    userProfile: {
      name: user.name,
      tier: user.tier,
      email: user.email,
    },
  };

  try {
    await aiService.streamResponse(
      requestPayload,
      (chunk) => {
        if (!res.writableEnded) {
          if (chunk.text) {
            emittedAnyTokens = true;
          }
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      },
      abortController.signal
    );

    clearTimeout(timeoutId);

    if (!res.writableEnded) {
      res.write("data: [DONE]\n\n");
      res.end();
    }
  } catch (err: any) {
    clearTimeout(timeoutId);

    if (!emittedAnyTokens) {
      await db.rollbackUsage(user.userId, "messages");
    }

    if (abortController.signal.aborted) {
      if (!res.writableEnded) res.end();
      return;
    }

    logger.error("Chat SSE stream failed:", {
      error: err.message,
      requestId: (req as any).id,
    });

    if (!res.headersSent) {
      res.status(500).json({
        error: {
          code: "AI_GENERATION_FAILED",
          message: "Failed to generate AI response. Please try again.",
        },
      });
    } else if (!res.writableEnded) {
      res.write(
        `data: ${JSON.stringify({
          error: {
            code: "AI_STREAM_ERROR",
            message: err.message || "An error occurred while streaming response.",
          },
        })}\n\n`
      );
      res.end();
    }
  }
});

// POST /api/chat - Non-streaming standard response
chatRouter.post("/", async (req, res, next) => {
  try {
    const {
      messages,
      systemInstruction,
      temperature,
      model,
      webSearch,
      mode,
      timezone,
    } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({
        error: {
          code: "INVALID_MESSAGES",
          message: "Missing or invalid 'messages' array.",
        },
      });
      return;
    }

    if (messages.length > MAX_MESSAGES_COUNT) {
      res.status(400).json({
        error: {
          code: "CONVERSATION_TOO_LONG",
          message: `Conversation history exceeds maximum of ${MAX_MESSAGES_COUNT} messages.`,
        },
      });
      return;
    }

    let totalChars = 0;
    for (const m of messages) {
      if (!m || typeof m !== "object" || typeof m.role !== "string") {
        res.status(400).json({
          error: {
            code: "MALFORMED_MESSAGE",
            message: "Each message must include a valid 'role' and 'content'.",
          },
        });
        return;
      }
      const content = typeof m.content === "string" ? m.content : "";
      totalChars += content.length;
      if (content.length > 32000) {
        res.status(400).json({
          error: {
            code: "MESSAGE_TOO_LONG",
            message: "Single message exceeds maximum allowed limit of 32,000 characters.",
          },
        });
        return;
      }
    }

    if (totalChars > MAX_TOTAL_CHARACTERS) {
      res.status(400).json({
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: `Total prompt length exceeds maximum limit of ${MAX_TOTAL_CHARACTERS} characters.`,
        },
      });
      return;
    }

    const user = req.user;
    if (!user) {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication session required.",
        },
      });
      return;
    }

    const reservation = await db.reserveUsage(user.userId, user.tier, "messages");
    if (!reservation.allowed) {
      res.status(429).json({
        error: {
          code: "DAILY_LIMIT_REACHED",
          message: "You've reached today's limit. Your limit will reset tomorrow.",
          resource: "messages",
          limit: reservation.limit,
          remaining: 0,
        },
      });
      return;
    }

    try {
      const validModes = ["chat", "research", "coding", "writing", "image", "voice", "filemaker", "document"];
      const safeMode = validModes.includes(mode) ? mode : "chat";
      const userTimezone =
        typeof timezone === "string" && timezone.trim()
          ? timezone.trim()
          : typeof req.headers["x-timezone"] === "string"
          ? (req.headers["x-timezone"] as string).trim()
          : "Asia/Kolkata";

      const response = await aiService.generateResponse({
        messages,
        systemInstruction: typeof systemInstruction === "string" ? systemInstruction.slice(0, 4000) : undefined,
        temperature: typeof temperature === "number" ? Math.max(0, Math.min(1.5, temperature)) : 0.7,
        model: typeof model === "string" ? model : "balanced",
        webSearch: safeMode === "research" ? true : Boolean(webSearch),
        mode: safeMode,
        timezone: userTimezone,
        userProfile: {
          name: user.name,
          tier: user.tier,
        },
      });

      res.json({
        role: "assistant",
        content: response.text,
        sources: response.sources || [],
        timestamp: Date.now(),
      });
    } catch (err) {
      await db.rollbackUsage(user.userId, "messages");
      throw err;
    }
  } catch (err) {
    next(err);
  }
});
