import { PaymentProvider, PaidPlan, CheckoutSessionResult } from "./paymentTypes";
import { RazorpayProvider } from "./razorpayProvider";
import { db, SubscriptionRecord, SubscriptionStatus } from "../../db/database";
import { SUBSCRIPTION_PLANS, UserPlan } from "../../config/dailyLimitsConfig";
import { logger } from "../../logger/logger";
import { AuthenticatedUser } from "../../middleware/authMiddleware";

export class PaymentService {
  private provider: PaymentProvider;

  constructor(provider?: PaymentProvider) {
    this.provider = provider || new RazorpayProvider();
  }

  public setProvider(provider: PaymentProvider): void {
    this.provider = provider;
  }

  public getProvider(): PaymentProvider {
    return this.provider;
  }

  public isConfigured(): boolean {
    return this.provider.isConfigured();
  }

  public getPublicConfig(): {
    provider: string;
    isConfigured: boolean;
    currency: string;
  } {
    return {
      provider: this.provider.name,
      isConfigured: this.isConfigured(),
      currency: "INR",
    };
  }

  public async createCheckout(
    user: AuthenticatedUser,
    requestedPlan: string
  ): Promise<CheckoutSessionResult> {
    // 1. Strict guest prevention
    if (user.isGuest) {
      const err = new Error("Guest accounts cannot purchase a subscription. Please create an account first.");
      (err as any).statusCode = 403;
      (err as any).code = "GUEST_SUBSCRIPTION_FORBIDDEN";
      throw err;
    }

    // 2. Validate plan selection
    if (requestedPlan !== "plus" && requestedPlan !== "pro" && requestedPlan !== "ultra") {
      const err = new Error(`Invalid plan: ${requestedPlan}. Valid subscription plans are: plus, pro, ultra.`);
      (err as any).statusCode = 400;
      (err as any).code = "INVALID_PLAN";
      throw err;
    }

    const plan = requestedPlan as PaidPlan;

    // 3. Strict server-controlled price enforcement (never trust client amounts)
    const planMeta = SUBSCRIPTION_PLANS[plan];
    if (!planMeta || planMeta.priceInr <= 0) {
      const err = new Error(`Pricing not configured for plan: ${plan}`);
      (err as any).statusCode = 400;
      throw err;
    }
    const verifiedPriceInr = planMeta.priceInr;

    // 4. Check if payment provider is configured
    if (!this.provider.isConfigured()) {
      const err = new Error("Paid subscriptions are currently unavailable.");
      (err as any).code = "PAYMENT_NOT_CONFIGURED";
      (err as any).statusCode = 503;
      throw err;
    }

    // 5. Create checkout session via modular provider
    const checkout = await this.provider.createCheckout({
      userId: user.userId,
      userEmail: user.email || "",
      userName: user.name,
      plan,
      priceInr: verifiedPriceInr,
      currency: "INR",
    });

    // 6. Record pending subscription in database
    await db.createOrUpdateSubscription({
      userId: user.userId,
      plan,
      status: "pending",
      provider: this.provider.name,
      providerSubscriptionId: checkout.subscriptionId || "",
    });

    return checkout;
  }

  public async handleWebhook(
    rawBody: string | Buffer,
    signature: string,
    headers?: Record<string, any>
  ): Promise<{ success: boolean; eventId: string; message: string; eventType?: string }> {
    // 1. Cryptographically verify signature and parse event
    const event = await this.provider.handleWebhook(rawBody, signature, headers);

    // 2. Replay attack and idempotency check
    if (db.isWebhookEventProcessed(event.eventId)) {
      logger.info("Ignoring duplicate webhook event", {
        eventId: event.eventId,
        eventType: event.eventType,
      });
      return {
        success: true,
        eventId: event.eventId,
        message: "Event already processed (idempotent)",
        eventType: event.eventType,
      };
    }

    db.markWebhookEventProcessed(event.eventId);

    // 3. Handle state updates
    if (event.userId) {
      const user = await db.findUserById(event.userId);
      if (user) {
        if (event.status) {
          const updatedSub = await db.createOrUpdateSubscription({
            userId: user.id,
            plan: event.plan || undefined,
            status: event.status,
            provider: this.provider.name,
            providerSubscriptionId: event.providerSubscriptionId || undefined,
            providerCustomerId: event.providerCustomerId || undefined,
            currentPeriodStart: event.periodStart,
            currentPeriodEnd: event.periodEnd,
            cancelAtPeriodEnd: Boolean(event.cancelAtPeriodEnd),
          });

          logger.info("Subscription state updated from webhook", {
            userId: user.id,
            plan: updatedSub.plan,
            status: updatedSub.status,
            eventType: event.eventType,
          });
        }
      }
    } else if (event.providerSubscriptionId) {
      // Find subscription by provider ID
      const existingSub = await db.getSubscriptionByProviderSubId(event.providerSubscriptionId);
      if (existingSub && event.status) {
        await db.createOrUpdateSubscription({
          userId: existingSub.userId,
          plan: event.plan || existingSub.plan,
          status: event.status,
          cancelAtPeriodEnd: Boolean(event.cancelAtPeriodEnd),
          currentPeriodStart: event.periodStart,
          currentPeriodEnd: event.periodEnd,
          providerSubscriptionId: event.providerSubscriptionId,
          providerCustomerId: event.providerCustomerId || existingSub.providerCustomerId,
        });
      }
    }

    return {
      success: true,
      eventId: event.eventId,
      message: event.message,
      eventType: event.eventType,
    };
  }

  public async cancelSubscription(userId: string): Promise<SubscriptionRecord> {
    const sub = await db.getSubscriptionByUserId(userId);
    if (!sub || (sub.status !== "active" && sub.status !== "pending")) {
      const err = new Error("No active paid subscription found to cancel.");
      (err as any).statusCode = 404;
      (err as any).code = "SUBSCRIPTION_NOT_FOUND";
      throw err;
    }

    // Call provider if subscription has provider reference
    if (sub.providerSubscriptionId && this.provider.isConfigured()) {
      try {
        await this.provider.cancelSubscription(sub.providerSubscriptionId, true);
      } catch (e: any) {
        logger.warn("Provider cancellation failed, proceeding with server-side cancellation", {
          error: e.message,
        });
      }
    }

    // Set cancellation at period end
    const updated = await db.cancelSubscriptionForUser(userId, true);
    if (!updated) {
      throw new Error("Failed to update subscription cancellation state");
    }

    logger.info("User requested subscription cancellation at period end", {
      userId,
      subscriptionId: sub.subscriptionId,
      currentPeriodEnd: sub.currentPeriodEnd,
    });

    return updated;
  }
}

export const paymentService = new PaymentService();
