import { Router } from "express";
import { paymentService } from "../services/payment/paymentService";
import { authenticateSession } from "../middleware/authMiddleware";
import { logger } from "../logger/logger";

export const paymentRouter = Router();

/**
 * POST /api/payment/webhook - Centralized Webhook Endpoint
 * Validates HMAC-SHA256 signature, prevents replay attacks with idempotency,
 * and securely updates subscription lifecycle states.
 */
paymentRouter.post("/webhook", async (req, res) => {
  try {
    const signature =
      (req.headers["x-razorpay-signature"] as string) ||
      (req.headers["x-signature"] as string) ||
      (req.headers["stripe-signature"] as string) ||
      "";

    // Use rawBody buffer if captured by express.json({ verify: ... }) or serialize req.body
    const rawBody =
      (req as any).rawBody ||
      (typeof req.body === "string" ? req.body : JSON.stringify(req.body));

    const result = await paymentService.handleWebhook(rawBody, signature, req.headers);

    res.status(200).json({
      received: true,
      eventId: result.eventId,
      message: result.message,
    });
  } catch (err: any) {
    const status = err.statusCode || 400;
    logger.warn("Webhook processing rejected", {
      status,
      error: err.message,
    });

    res.status(status).json({
      error: {
        code: "WEBHOOK_VERIFICATION_FAILED",
        message: err.message || "Webhook signature validation failed.",
      },
    });
  }
});

/**
 * POST /api/payment/verify - Optional client-side payment verification (for redirect/modal checkout flows)
 */
paymentRouter.post("/verify", authenticateSession, async (req, res, next) => {
  try {
    const user = req.user;
    if (!user || user.isGuest) {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Authentication required." },
      });
      return;
    }

    const provider = paymentService.getProvider();
    const result = await provider.verifyPayment({
      ...req.body,
      userId: user.userId,
    });

    if (!result.success) {
      res.status(400).json({
        error: {
          code: "PAYMENT_VERIFICATION_FAILED",
          message: result.error || "Payment verification failed.",
        },
      });
      return;
    }

    res.json({
      success: true,
      subscriptionId: result.providerSubscriptionId,
      status: result.status,
    });
  } catch (err) {
    next(err);
  }
});
