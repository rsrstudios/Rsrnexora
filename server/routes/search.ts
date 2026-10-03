import { Router } from "express";
import { aiService } from "../ai/aiService";
import { searchRateLimiter } from "../middleware/rateLimiter";
import { authenticateSession } from "../middleware/authMiddleware";
import { sanitizeUntrustedText } from "../security/sanitizer";
import { GroundingSource } from "../ai/types";
import { db } from "../db/database";

export const searchRouter = Router();

searchRouter.use(searchRateLimiter);
searchRouter.use(authenticateSession);

searchRouter.post("/", async (req, res, next) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== "string" || !query.trim()) {
      res.status(400).json({
        error: {
          code: "MISSING_QUERY",
          message: "A search query string is required.",
        },
      });
      return;
    }

    const cleanQuery = sanitizeUntrustedText(query.trim(), 500);
    if (cleanQuery.length === 0) {
      res.status(400).json({
        error: {
          code: "INVALID_QUERY",
          message: "The search query is invalid or empty.",
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

    // Atomic reservation of search usage before contacting provider
    const reservation = await db.reserveUsage(user.userId, user.tier, "searches");
    if (!reservation.allowed) {
      res.status(429).json({
        error: {
          code: "DAILY_LIMIT_REACHED",
          message: "You've reached today's limit. Your limit will reset tomorrow.",
          resource: "searches",
          limit: reservation.limit,
          remaining: 0,
        },
      });
      return;
    }

    let resultText = "";
    let verifiedSources: GroundingSource[] = [];

    try {
      await aiService.streamResponse(
        {
          messages: [
            {
              role: "user",
              content: `Perform verified web research on: "${cleanQuery}". Return a concise, accurate factual overview citing real sources.`,
            },
          ],
          systemInstruction:
            "You are RSR Nexora Search Engine. Provide accurate, synthesized facts grounded in verified current web data. Only refer to real, verified sources.",
          temperature: 0.2,
          model: "fast",
          webSearch: true,
          mode: "research",
        },
        (chunk) => {
          if (chunk.text) resultText += chunk.text;
          if (chunk.sources && Array.isArray(chunk.sources)) {
            for (const s of chunk.sources) {
              // Verify URL is a valid http/https address
              try {
                const parsed = new URL(s.uri);
                if (parsed.protocol === "http:" || parsed.protocol === "https:") {
                  verifiedSources.push({
                    title: sanitizeUntrustedText(s.title || parsed.hostname, 150),
                    uri: s.uri,
                    domain: parsed.hostname.replace(/^www\./, ""),
                  });
                }
              } catch {
                // Ignore invalid/malformed URIs
              }
            }
          }
        }
      );

      res.json({
        query: cleanQuery,
        summary: resultText,
        sources: verifiedSources,
        timestamp: Date.now(),
      });
    } catch (err) {
      await db.rollbackUsage(user.userId, "searches");
      throw err;
    }
  } catch (err) {
    next(err);
  }
});
