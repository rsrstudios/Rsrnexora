import { Router } from "express";
import { authenticateSession } from "../middleware/authMiddleware";
import { db } from "../db/database";
import { getDailyLimitsForPlan } from "../config/dailyLimitsConfig";

export const usageRouter = Router();

usageRouter.use(authenticateSession);

/**
 * GET /api/usage - Secure daily usage telemetry endpoint
 * Returns user plan, server UTC date, and current resource usage and remaining allowance.
 * Strictly prevents cross-user access and credential leakage.
 */
usageRouter.get("/", async (req, res, next) => {
  try {
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

    const todayUtc = db.getTodayUtcDate();
    const usage = await db.getDailyUsage(user.userId, todayUtc);
    const plan = user.tier;
    const limits = getDailyLimitsForPlan(plan);

    res.json({
      plan,
      date: todayUtc,
      messages: {
        used: usage.messagesUsed,
        limit: limits.messages,
        remaining: Math.max(0, limits.messages - usage.messagesUsed),
      },
      images: {
        used: usage.imagesUsed,
        limit: limits.images,
        remaining: Math.max(0, limits.images - usage.imagesUsed),
      },
      searches: {
        used: usage.searchesUsed,
        limit: limits.searches,
        remaining: Math.max(0, limits.searches - usage.searchesUsed),
      },
      files: {
        used: usage.filesUsed,
        limit: limits.files,
        remaining: Math.max(0, limits.files - usage.filesUsed),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Ephemeral test synchronization endpoint (test runner only, never enabled in production)
if (process.env.NODE_ENV !== "production") {
  usageRouter.post("/test-override", async (req, res, next) => {
    try {
      if (req.headers["x-test-runner"] !== "rsr-qa") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const { userId, resource, count, date, tier } = req.body;
      if (userId && tier) {
        await db.setUserTier(userId, tier);
      }
      if (userId && resource && count !== undefined) {
        await db.setDailyUsageForTest(userId, resource, count, date);
      }
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });
}
