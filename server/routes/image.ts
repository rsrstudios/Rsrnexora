import { Router } from "express";
import { aiService } from "../ai/aiService";
import { imageRateLimiter } from "../middleware/rateLimiter";
import { authenticateSession } from "../middleware/authMiddleware";
import { sanitizeUntrustedText } from "../security/sanitizer";
import { db } from "../db/database";

export const imageRouter = Router();

imageRouter.use(imageRateLimiter);
imageRouter.use(authenticateSession);

const VALID_ASPECT_RATIOS = new Set(["1:1", "16:9", "4:3", "9:16", "3:2"]);

imageRouter.post("/generate", async (req, res, next) => {
  try {
    const { prompt, aspectRatio } = req.body;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      res.status(400).json({
        error: {
          code: "MISSING_PROMPT",
          message: "A prompt description is required for image generation.",
        },
      });
      return;
    }

    const cleanPrompt = sanitizeUntrustedText(prompt.trim(), 2000);
    if (cleanPrompt.length === 0) {
      res.status(400).json({
        error: {
          code: "INVALID_PROMPT",
          message: "The provided prompt is invalid or empty.",
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

    // Atomic reservation of image usage before contacting provider
    const reservation = await db.reserveUsage(user.userId, user.tier, "images");
    if (!reservation.allowed) {
      res.status(429).json({
        error: {
          code: "DAILY_LIMIT_REACHED",
          message: "You've reached today's limit. Your limit will reset tomorrow.",
          resource: "images",
          limit: reservation.limit,
          remaining: 0,
        },
      });
      return;
    }

    const safeRatio = (typeof aspectRatio === "string" && VALID_ASPECT_RATIOS.has(aspectRatio))
      ? aspectRatio
      : "1:1";

    try {
      const result = await aiService.generateImage({
        prompt: cleanPrompt,
        aspectRatio: safeRatio as any,
      });

      res.json({
        imageUrl: result.imageUrl,
        prompt: result.prompt,
        aspectRatio: safeRatio,
        createdAt: Date.now(),
      });
    } catch (err) {
      await db.rollbackUsage(user.userId, "images");
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

imageRouter.post("/variations", async (req, res, next) => {
  try {
    const { basePrompt, variationStyle, aspectRatio } = req.body;

    if (!basePrompt || typeof basePrompt !== "string" || !basePrompt.trim()) {
      res.status(400).json({
        error: {
          code: "MISSING_PROMPT",
          message: "Base prompt is required for generating variations.",
        },
      });
      return;
    }

    const cleanBase = sanitizeUntrustedText(basePrompt.trim(), 1500);
    const cleanStyle = typeof variationStyle === "string" ? sanitizeUntrustedText(variationStyle.trim(), 100) : "";

    const stylePrefix = cleanStyle
      ? `A high-fidelity variation in ${cleanStyle} style of: `
      : "An alternate creative artistic variation of: ";

    const modifiedPrompt = `${stylePrefix}${cleanBase}`;

    const safeRatio = (typeof aspectRatio === "string" && VALID_ASPECT_RATIOS.has(aspectRatio))
      ? aspectRatio
      : "1:1";

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

    // Atomic reservation of image usage before contacting provider
    const reservation = await db.reserveUsage(user.userId, user.tier, "images");
    if (!reservation.allowed) {
      res.status(429).json({
        error: {
          code: "DAILY_LIMIT_REACHED",
          message: "You've reached today's limit. Your limit will reset tomorrow.",
          resource: "images",
          limit: reservation.limit,
          remaining: 0,
        },
      });
      return;
    }

    try {
      const result = await aiService.generateImage({
        prompt: modifiedPrompt,
        aspectRatio: safeRatio as any,
      });

      res.json({
        imageUrl: result.imageUrl,
        prompt: modifiedPrompt,
        originalPrompt: cleanBase,
        aspectRatio: safeRatio,
        createdAt: Date.now(),
      });
    } catch (err) {
      await db.rollbackUsage(user.userId, "images");
      throw err;
    }
  } catch (err) {
    next(err);
  }
});
