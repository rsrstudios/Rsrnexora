/**
 * RSR Nexora - Daily User Limits Centralized Configuration
 * Defines strict server-side daily allowances per user tier.
 * 
 * Rules:
 * - Strictly DAILY limits (never monthly).
 * - Centralized values: Do not duplicate across the codebase.
 * - Server-authoritative: Frontend counters and headers are untrusted.
 */

// FREE USER (Nexora Free - ₹0/month)
export const FREE_DAILY_MESSAGES = 20;
export const FREE_DAILY_IMAGES = 3;
export const FREE_DAILY_SEARCHES = 10;
export const FREE_DAILY_FILES = 5;

// PRO USER (100 msgs in existing limit system)
export const PRO_DAILY_MESSAGES = 100;
export const PRO_DAILY_IMAGES = 15;
export const PRO_DAILY_SEARCHES = 50;
export const PRO_DAILY_FILES = 20;

// PLUS USER (Nexora Plus - ₹99/month)
export const PLUS_DAILY_MESSAGES = 100;
export const PLUS_DAILY_IMAGES = 15;
export const PLUS_DAILY_SEARCHES = 50;
export const PLUS_DAILY_FILES = 20;

// PREMIUM USER (300 msgs in existing limit system / Nexora Pro tier quota)
export const PREMIUM_DAILY_MESSAGES = 300;
export const PREMIUM_DAILY_IMAGES = 30;
export const PREMIUM_DAILY_SEARCHES = 100;
export const PREMIUM_DAILY_FILES = 50;

// ULTRA USER (Nexora Ultra - ₹399/month)
export const ULTRA_DAILY_MESSAGES = 600;
export const ULTRA_DAILY_IMAGES = 60;
export const ULTRA_DAILY_SEARCHES = 200;
export const ULTRA_DAILY_FILES = 100;

// GUEST USER
export const GUEST_DAILY_MESSAGES = 5;
export const GUEST_DAILY_IMAGES = 1;
export const GUEST_DAILY_SEARCHES = 3;
export const GUEST_DAILY_FILES = 1;

export type UserPlan = "free" | "plus" | "pro" | "ultra" | "premium" | "guest";
export type LimitResource = "messages" | "images" | "searches" | "files";

export interface PlanLimits {
  messages: number;
  images: number;
  searches: number;
  files: number;
}

export const PLAN_DAILY_LIMITS: Record<UserPlan, PlanLimits> = {
  free: {
    messages: FREE_DAILY_MESSAGES,
    images: FREE_DAILY_IMAGES,
    searches: FREE_DAILY_SEARCHES,
    files: FREE_DAILY_FILES,
  },
  plus: {
    messages: PLUS_DAILY_MESSAGES,
    images: PLUS_DAILY_IMAGES,
    searches: PLUS_DAILY_SEARCHES,
    files: PLUS_DAILY_FILES,
  },
  pro: {
    messages: PRO_DAILY_MESSAGES,
    images: PRO_DAILY_IMAGES,
    searches: PRO_DAILY_SEARCHES,
    files: PRO_DAILY_FILES,
  },
  premium: {
    messages: PREMIUM_DAILY_MESSAGES,
    images: PREMIUM_DAILY_IMAGES,
    searches: PREMIUM_DAILY_SEARCHES,
    files: PREMIUM_DAILY_FILES,
  },
  ultra: {
    messages: ULTRA_DAILY_MESSAGES,
    images: ULTRA_DAILY_IMAGES,
    searches: ULTRA_DAILY_SEARCHES,
    files: ULTRA_DAILY_FILES,
  },
  guest: {
    messages: GUEST_DAILY_MESSAGES,
    images: GUEST_DAILY_IMAGES,
    searches: GUEST_DAILY_SEARCHES,
    files: GUEST_DAILY_FILES,
  },
};

export interface PlanMetadata {
  id: "free" | "plus" | "pro" | "ultra";
  name: string;
  priceInr: number;
  priceDisplay: string;
  billingPeriod: string;
  limits: PlanLimits;
  features: string[];
  highlight?: boolean;
}

export const SUBSCRIPTION_PLANS: Record<"free" | "plus" | "pro" | "ultra", PlanMetadata> = {
  free: {
    id: "free",
    name: "Nexora Free",
    priceInr: 0,
    priceDisplay: "₹0",
    billingPeriod: "/month",
    limits: PLAN_DAILY_LIMITS.free,
    features: [
      "Basic AI Chat",
      "Basic Search",
      "Basic File Analysis",
      "Standard Priority",
      "20 Messages / day",
      "3 Images / day",
      "10 Searches / day",
      "5 Files / day",
    ],
  },
  plus: {
    id: "plus",
    name: "Nexora Plus",
    priceInr: 99,
    priceDisplay: "₹99",
    billingPeriod: "/month",
    limits: PLAN_DAILY_LIMITS.plus,
    features: [
      "Higher daily limits",
      "Advanced AI features",
      "More file analysis",
      "Faster priority",
      "100 Messages / day",
      "15 Images / day",
      "50 Searches / day",
      "20 Files / day",
    ],
  },
  pro: {
    id: "pro",
    name: "Nexora Pro",
    priceInr: 199,
    priceDisplay: "₹199",
    billingPeriod: "/month",
    limits: PLAN_DAILY_LIMITS.premium,
    features: [
      "High daily limits",
      "Advanced file/data analysis",
      "Image generation",
      "Higher priority",
      "300 Messages / day",
      "30 Images / day",
      "100 Searches / day",
      "50 Files / day",
    ],
    highlight: true,
  },
  ultra: {
    id: "ultra",
    name: "Nexora Ultra",
    priceInr: 399,
    priceDisplay: "₹399",
    billingPeriod: "/month",
    limits: PLAN_DAILY_LIMITS.ultra,
    features: [
      "Highest daily limits",
      "All available AI features",
      "Maximum file/data usage",
      "Highest priority",
      "600 Messages / day",
      "60 Images / day",
      "200 Searches / day",
      "100 Files / day",
    ],
  },
};


export function getDailyLimitsForPlan(plan: UserPlan): PlanLimits {
  return PLAN_DAILY_LIMITS[plan] || PLAN_DAILY_LIMITS.free;
}

