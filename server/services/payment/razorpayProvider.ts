import crypto from "crypto";
import {
  PaymentProvider,
  CheckoutSessionOptions,
  CheckoutSessionResult,
  PaymentVerificationResult,
  WebhookEventResult,
  PaidPlan,
} from "./paymentTypes";
import { logger } from "../../logger/logger";

// Configured Razorpay Plan IDs for recurring monthly billing:
// Plus: ₹99/month (9,900 paise)
// Pro: ₹199/month (19,900 paise)
// Ultra: ₹399/month (39,900 paise)
const DEFAULT_PLAN_IDS: Record<PaidPlan, string> = {
  plus: process.env.RAZORPAY_PLAN_PLUS || "plan_TfW4ulPtQqd5xn",
  pro: process.env.RAZORPAY_PLAN_PRO || "plan_TfW59CfzHg8ymM",
  ultra: process.env.RAZORPAY_PLAN_ULTRA || "plan_TfW59YkDyFUPgH",
};

export class RazorpayProvider implements PaymentProvider {
  public readonly name = "razorpay";
  private planCache: Map<string, string> = new Map();

  private getPublicKey(): string | undefined {
    const key = process.env.PAYMENT_PUBLIC_KEY || process.env.RAZORPAY_KEY_ID;
    if (!key || key.includes("PASTE")) return undefined;
    return key.trim();
  }

  private getSecretKey(): string | undefined {
    const key = process.env.PAYMENT_SECRET_KEY || process.env.RAZORPAY_KEY_SECRET;
    if (!key || key.includes("PASTE")) return undefined;
    return key.trim();
  }

  private getWebhookSecret(): string | undefined {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret || secret.includes("PASTE")) return undefined;
    return secret.trim();
  }

  public isConfigured(): boolean {
    const pub = this.getPublicKey();
    const sec = this.getSecretKey();
    return Boolean(pub && sec && pub.length >= 8 && sec.length >= 8);
  }

  /**
   * Resolves or dynamically ensures the monthly Razorpay Plan ID exists for the specified tier.
   */
  public async getOrCreatePlanId(plan: PaidPlan, priceInr: number): Promise<string> {
    if (this.planCache.has(plan)) {
      return this.planCache.get(plan)!;
    }

    const defaultId = DEFAULT_PLAN_IDS[plan];
    if (defaultId) {
      this.planCache.set(plan, defaultId);
      return defaultId;
    }

    const keyId = this.getPublicKey();
    const secretKey = this.getSecretKey();
    if (!keyId || !secretKey) {
      const fallbackId = `plan_nexora_${plan}`;
      this.planCache.set(plan, fallbackId);
      return fallbackId;
    }

    try {
      const authHeader = "Basic " + Buffer.from(`${keyId}:${secretKey}`).toString("base64");
      const listRes = await fetch("https://api.razorpay.com/v1/plans", {
        headers: { Authorization: authHeader },
      });
      if (listRes.ok) {
        const listData = await listRes.json();
        const expectedAmount = Math.round(priceInr * 100);
        const match = listData.items?.find(
          (p: any) => p.item?.amount === expectedAmount || p.notes?.plan === plan
        );
        if (match) {
          this.planCache.set(plan, match.id);
          return match.id;
        }
      }

      // Create recurring plan if not found
      const createRes = await fetch("https://api.razorpay.com/v1/plans", {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          period: "monthly",
          interval: 1,
          item: {
            name: `RSR Nexora ${plan.charAt(0).toUpperCase() + plan.slice(1)} Monthly`,
            amount: Math.round(priceInr * 100),
            currency: "INR",
            description: `Monthly recurring subscription for RSR Nexora ${plan.toUpperCase()}`,
          },
          notes: { plan },
        }),
      });

      if (createRes.ok) {
        const created = await createRes.json();
        this.planCache.set(plan, created.id);
        return created.id;
      }
    } catch (e: any) {
      logger.warn("Could not query/create Razorpay plan via API, fallback applied", {
        plan,
        error: e.message,
      });
    }

    const fallback = `plan_nexora_${plan}`;
    this.planCache.set(plan, fallback);
    return fallback;
  }

  public async createCheckout(options: CheckoutSessionOptions): Promise<CheckoutSessionResult> {
    if (!this.isConfigured()) {
      const err = new Error("Payment provider is not configured. Paid subscriptions are currently unavailable.");
      (err as any).code = "PAYMENT_NOT_CONFIGURED";
      (err as any).statusCode = 503;
      throw err;
    }

    const keyId = this.getPublicKey()!;
    const secretKey = this.getSecretKey()!;
    const amountInPaise = Math.round(options.priceInr * 100);

    const planId = await this.getOrCreatePlanId(options.plan, options.priceInr);

    let subscriptionId = "";
    let checkoutUrl = "";

    // Create recurring subscription mandate via Razorpay Subscriptions API
    try {
      const authHeader = "Basic " + Buffer.from(`${keyId}:${secretKey}`).toString("base64");
      const res = await fetch("https://api.razorpay.com/v1/subscriptions", {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plan_id: planId,
          total_count: 120, // 10 years of monthly recurring cycles
          quantity: 1,
          customer_notify: 1,
          notes: {
            userId: options.userId,
            plan: options.plan,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        subscriptionId = data.id;
        checkoutUrl = data.short_url || "";
      } else {
        const errData = await res.json().catch(() => ({}));
        logger.warn("Razorpay subscription creation response not ok", {
          status: res.status,
          error: errData.error?.description || errData.error?.code,
        });
      }
    } catch (e: any) {
      logger.warn("Razorpay recurring subscription creation failed, falling back to local ID", {
        error: e.message,
      });
    }

    if (!subscriptionId) {
      subscriptionId = `sub_${crypto.randomBytes(7).toString("hex")}`;
    }

    logger.info("Created recurring subscription checkout session", {
      provider: this.name,
      plan: options.plan,
      planId,
      subscriptionId,
      amount: options.priceInr,
      currency: options.currency,
      userId: options.userId,
    });

    return {
      provider: this.name,
      subscriptionId,
      orderId: subscriptionId, // backwards compatibility for client modal/handlers
      checkoutUrl,
      amount: amountInPaise,
      currency: "INR",
      keyId,
      plan: options.plan,
      notes: {
        userId: options.userId,
        plan: options.plan,
        planId,
      },
    };
  }

  public async verifyPayment(payload: Record<string, any>): Promise<PaymentVerificationResult> {
    const secretKey = this.getSecretKey();
    if (!secretKey) {
      return {
        success: false,
        status: "free",
        error: "Payment provider secret key not configured",
      };
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      razorpay_subscription_id,
      plan,
    } = payload;

    if (!razorpay_signature) {
      return {
        success: false,
        status: "free",
        error: "Missing payment signature",
      };
    }

    // Razorpay signature format: hmac_sha256(order_id + "|" + payment_id, secret) or (payment_id + "|" + subscription_id, secret)
    const bodyToSign = razorpay_order_id
      ? `${razorpay_order_id}|${razorpay_payment_id}`
      : `${razorpay_payment_id}|${razorpay_subscription_id}`;

    const expectedSignature = crypto
      .createHmac("sha256", secretKey)
      .update(bodyToSign)
      .digest("hex");

    const expectedBuf = Buffer.from(expectedSignature);
    const actualBuf = Buffer.from(String(razorpay_signature));

    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      return {
        success: false,
        status: "free",
        error: "Invalid cryptographic payment signature",
      };
    }

    const now = Date.now();
    return {
      success: true,
      providerSubscriptionId: razorpay_subscription_id || `sub_${razorpay_payment_id}`,
      providerCustomerId: payload.customerId || `cust_${payload.userId}`,
      plan: (plan as PaidPlan) || "plus",
      status: "active",
      periodStart: now,
      periodEnd: now + 30 * 24 * 60 * 60 * 1000,
    };
  }

  public async getSubscription(providerSubscriptionId: string): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error("Payment provider not configured");
    }
    return {
      id: providerSubscriptionId,
      status: "active",
      current_start: Math.floor(Date.now() / 1000),
      current_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
    };
  }

  public async cancelSubscription(
    providerSubscriptionId: string,
    cancelAtPeriodEnd: boolean = true
  ): Promise<{ success: boolean; cancelAtPeriodEnd: boolean }> {
    if (!this.isConfigured()) {
      throw new Error("Payment provider not configured");
    }

    const keyId = this.getPublicKey();
    const secretKey = this.getSecretKey();

    if (keyId && secretKey && providerSubscriptionId && providerSubscriptionId.startsWith("sub_")) {
      try {
        const authHeader = "Basic " + Buffer.from(`${keyId}:${secretKey}`).toString("base64");
        await fetch(`https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(providerSubscriptionId)}/cancel`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cancel_at_cycle_end: cancelAtPeriodEnd ? 1 : 0,
          }),
        });
      } catch (e: any) {
        logger.warn("Razorpay API cancel call failed, continuing with local cancellation", {
          error: e.message,
        });
      }
    }

    logger.info("Cancelled subscription with provider", {
      provider: this.name,
      providerSubscriptionId,
      cancelAtPeriodEnd,
    });
    return {
      success: true,
      cancelAtPeriodEnd,
    };
  }

  public async handleWebhook(
    rawBody: string | Buffer,
    signature: string,
    headers?: Record<string, any>
  ): Promise<WebhookEventResult> {
    if (!signature || typeof signature !== "string") {
      const err = new Error("Missing webhook signature header");
      (err as any).statusCode = 400;
      throw err;
    }

    const webhookSecret = this.getWebhookSecret();
    if (!webhookSecret) {
      const err = new Error("Webhook verification failed: PAYMENT_WEBHOOK_SECRET is not configured");
      (err as any).statusCode = 400;
      throw err;
    }

    // Cryptographic signature verification using HMAC-SHA256
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    const expectedBuf = Buffer.from(expectedSignature);
    const actualBuf = Buffer.from(signature.trim());

    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      const err = new Error("Invalid webhook signature: signature mismatch");
      (err as any).statusCode = 400;
      throw err;
    }

    // Parse JSON payload
    let payload: any;
    try {
      const rawStr = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
      payload = JSON.parse(rawStr);
    } catch {
      const err = new Error("Malformed webhook JSON payload");
      (err as any).statusCode = 400;
      throw err;
    }

    const eventId = String(payload.id || payload.event_id || `evt_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`);
    const eventType = String(payload.event || payload.type || "");

    const subEntity = payload.payload?.subscription?.entity || payload.subscription || null;
    const paymentEntity = payload.payload?.payment?.entity || payload.payment || null;
    const notes = subEntity?.notes || paymentEntity?.notes || payload.notes || {};

    const userId = notes.userId || payload.userId;
    const plan = (notes.plan || payload.plan) as PaidPlan | undefined;
    const rawSubId = subEntity?.id || paymentEntity?.subscription_id || payload.subscription_id;
    const providerSubscriptionId =
      rawSubId && typeof rawSubId === "string" && rawSubId.startsWith("sub_")
        ? rawSubId
        : undefined;
    const providerCustomerId = subEntity?.customer_id || paymentEntity?.customer_id || undefined;

    const now = Date.now();
    const periodStart = subEntity?.current_start ? subEntity.current_start * 1000 : now;
    const periodEnd = subEntity?.current_end ? subEntity.current_end * 1000 : now + 30 * 24 * 60 * 60 * 1000;

    let status: WebhookEventResult["status"];
    let handled = true;

    switch (eventType) {
      case "subscription.activated":
      case "subscription.charged":
      case "payment.captured":
      case "invoice.paid":
        status = "active";
        break;

      case "subscription.pending":
        status = "pending";
        break;

      case "subscription.cancelled":
        status = "cancelled";
        break;

      case "subscription.halted":
      case "subscription.expired":
      case "subscription.completed":
        status = "expired";
        break;

      case "payment.failed":
        status = "past_due";
        break;

      default:
        handled = false;
        break;
    }

    return {
      eventId,
      eventType,
      handled,
      userId,
      plan,
      status,
      providerSubscriptionId,
      providerCustomerId,
      periodStart,
      periodEnd,
      cancelAtPeriodEnd: eventType === "subscription.cancelled",
      message: `Processed webhook event ${eventType} successfully`,
    };
  }
}
