import { Router } from "express";
import { authenticateSession } from "../middleware/authMiddleware";
import { db } from "../db/database";
import { paymentService } from "../services/payment/paymentService";
import { SUBSCRIPTION_PLANS, getDailyLimitsForPlan } from "../config/dailyLimitsConfig";

export const subscriptionRouter = Router();

/**
 * GET /api/subscription/plans - Public endpoint listing available plans and quotas
 */
subscriptionRouter.get("/plans", (_req, res) => {
  res.json({
    plans: Object.values(SUBSCRIPTION_PLANS),
    paymentConfig: paymentService.getPublicConfig(),
  });
});

// Authenticated routes
subscriptionRouter.use(authenticateSession);

/**
 * GET /api/subscription and /api/subscription/me - Retrieve current user subscription and quota entitlements
 */
const getSubscriptionHandler = async (req: any, res: any, next: any) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Authentication required." },
      });
      return;
    }

    if (user.isGuest) {
      res.json({
        plan: "guest",
        planDetails: SUBSCRIPTION_PLANS.free,
        status: "free",
        isGuest: true,
        limits: getDailyLimitsForPlan("guest"),
        subscription: null,
      });
      return;
    }

    const effectiveTier = await db.getUserEffectiveTier(user.userId);
    const sub = await db.getSubscriptionByUserId(user.userId);
    const limits = getDailyLimitsForPlan(effectiveTier);
    const planKey = (effectiveTier === "guest" ? "free" : (effectiveTier === "premium" ? "pro" : effectiveTier)) as keyof typeof SUBSCRIPTION_PLANS;
    const planDetails = SUBSCRIPTION_PLANS[planKey] || SUBSCRIPTION_PLANS.free;

    const activePlan = (sub && sub.status === "active") ? sub.plan : (effectiveTier === "premium" ? "pro" : effectiveTier);

    res.json({
      plan: activePlan,
      planDetails,
      status: sub ? sub.status : "free",
      isGuest: false,
      limits,
      subscription: sub
        ? {
            subscriptionId: sub.subscriptionId,
            plan: sub.plan,
            status: sub.status,
            currentPeriodStart: sub.currentPeriodStart,
            currentPeriodEnd: sub.currentPeriodEnd,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
            provider: sub.provider,
          }
        : null,
      paymentConfig: paymentService.getPublicConfig(),
    });
  } catch (err) {
    next(err);
  }
};

subscriptionRouter.get("/", getSubscriptionHandler);
subscriptionRouter.get("/me", getSubscriptionHandler);

/**
 * GET /api/subscription/status - Lightweight subscription status
 */
subscriptionRouter.get("/status", async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Authentication required." },
      });
      return;
    }

    const effectiveTier = user.isGuest ? "guest" : (await db.getUserEffectiveTier(user.userId));
    const sub = user.isGuest ? null : (await db.getSubscriptionByUserId(user.userId));

    const activePlan = (sub && sub.status === "active") ? sub.plan : (effectiveTier === "premium" ? "pro" : effectiveTier);

    res.json({
      plan: activePlan,
      status: sub ? sub.status : (user.isGuest ? "guest" : "free"),
      isPaid: effectiveTier === "plus" || effectiveTier === "pro" || effectiveTier === "ultra" || effectiveTier === "premium",
      cancelAtPeriodEnd: sub ? sub.cancelAtPeriodEnd : false,
      currentPeriodEnd: sub ? sub.currentPeriodEnd : null,
      isConfigured: paymentService.isConfigured(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/subscription/checkout & /api/subscription/create-order
 * Initiate checkout / create order for a paid subscription tier.
 * Strictly validates plan, server-enforces pricing, and rejects guests.
 */
const checkoutHandler = async (req: any, res: any, next: any) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Authentication required." },
      });
      return;
    }

    const plan = req.body?.plan || req.body?.planId;

    if (!plan || typeof plan !== "string") {
      res.status(400).json({
        error: {
          code: "INVALID_PLAN",
          message: "Please specify a plan ('plus', 'pro', or 'ultra').",
        },
      });
      return;
    }

    const checkout = await paymentService.createCheckout(user, plan);
    res.status(200).json({
      success: true,
      checkout,
      order: checkout,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      error: {
        code: err.code || "CHECKOUT_ERROR",
        message: err.message || "Failed to initiate subscription checkout.",
      },
    });
  }
};

subscriptionRouter.post("/checkout", checkoutHandler);
subscriptionRouter.post("/create-order", checkoutHandler);

/**
 * POST /api/subscription/cancel - Cancel active subscription at period end
 */
subscriptionRouter.post("/cancel", async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Authentication required." },
      });
      return;
    }

    if (user.isGuest) {
      res.status(403).json({
        error: { code: "GUEST_FORBIDDEN", message: "Guests do not have subscriptions." },
      });
      return;
    }

    const updated = await paymentService.cancelSubscription(user.userId);
    res.json({
      success: true,
      message: "Subscription will remain active until the end of the current billing period.",
      subscription: {
        subscriptionId: updated.subscriptionId,
        status: updated.status,
        cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
        currentPeriodEnd: updated.currentPeriodEnd,
      },
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      error: {
        code: err.code || "CANCEL_ERROR",
        message: err.message || "Failed to cancel subscription.",
      },
    });
  }
});
