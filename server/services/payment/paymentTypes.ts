/**
 * RSR Nexora - Modular Payment Provider Abstraction
 * Supports INR recurring subscriptions with pluggable payment gateways (Razorpay/Stripe).
 */

import { SubscriptionStatus, SubscriptionRecord } from "../../db/database";

export type PaidPlan = "plus" | "pro" | "ultra";

export interface CheckoutSessionOptions {
  userId: string;
  userEmail: string;
  userName: string;
  plan: PaidPlan;
  priceInr: number;
  currency: "INR";
  returnUrl?: string;
  cancelUrl?: string;
}

export interface CheckoutSessionResult {
  provider: string;
  orderId?: string;
  subscriptionId?: string;
  checkoutUrl?: string;
  amount: number;
  currency: string;
  keyId?: string;
  plan: PaidPlan;
  notes?: Record<string, string>;
}

export interface PaymentVerificationResult {
  success: boolean;
  providerSubscriptionId?: string;
  providerCustomerId?: string;
  plan?: PaidPlan;
  status: SubscriptionStatus;
  periodStart?: number;
  periodEnd?: number;
  error?: string;
}

export interface WebhookEventResult {
  eventId: string;
  eventType: string;
  handled: boolean;
  userId?: string;
  plan?: PaidPlan;
  status?: SubscriptionStatus;
  providerSubscriptionId?: string;
  providerCustomerId?: string;
  periodStart?: number;
  periodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  message: string;
}

export interface PaymentProvider {
  readonly name: string;
  isConfigured(): boolean;
  createCheckout(options: CheckoutSessionOptions): Promise<CheckoutSessionResult>;
  verifyPayment(payload: Record<string, any>): Promise<PaymentVerificationResult>;
  getSubscription(providerSubscriptionId: string): Promise<any>;
  cancelSubscription(
    providerSubscriptionId: string,
    cancelAtPeriodEnd?: boolean
  ): Promise<{ success: boolean; cancelAtPeriodEnd: boolean }>;
  handleWebhook(
    rawBody: string | Buffer,
    signature: string,
    headers?: Record<string, any>
  ): Promise<WebhookEventResult>;
}
