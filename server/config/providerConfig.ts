/**
 * RSR Nexora - 10-API Fallback System Configuration
 * Defines and validates the 10 provider slots (API 01 - API 10).
 * Server-side only: Credentials are NEVER exported or sent to client.
 */

export type ProviderType = "gemini" | "openai-compatible" | "anthropic" | "custom" | "mock";

export interface ProviderSlotConfig {
  slotId: string; // "API_01" to "API_10"
  slotNumber: number; // 1 to 10
  name: string;
  isPrimary: boolean;
  provider: ProviderType;
  baseUrl?: string;
  model: string;
  apiKey?: string;
  timeoutMs: number;
  maxRetries: number;
  isConfigured: boolean;
}

export interface SafeProviderSlotInfo {
  slotId: string;
  slotNumber: number;
  name: string;
  isPrimary: boolean;
  provider: ProviderType;
  baseUrl?: string;
  model: string;
  timeoutMs: number;
  isConfigured: boolean;
}

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RETRIES = 1;

/**
 * Normalizes user-entered model names/display names into valid API model identifiers.
 * E.g., "Gemini 3.8 Flash" -> "gemini-3.8-flash"
 */
export function normalizeModelName(rawModel?: string, provider?: ProviderType): string {
  if (!rawModel || !rawModel.trim()) {
    return provider === "gemini" ? "gemini-3.8-flash" : "default";
  }

  const trimmed = rawModel.trim();
  const lower = trimmed.toLowerCase();

  // If already in kebab-case standard format
  if (lower === "gemini-3.8-flash" || lower === "gemini-3.1-pro-preview" || lower === "gemini-3.1-flash-lite") {
    return lower;
  }

  // Common user-friendly / display name mappings for Gemini
  if (provider === "gemini" || lower.includes("gemini")) {
    if (lower.includes("3.8") && lower.includes("flash")) {
      return "gemini-3.8-flash";
    }
    if (lower.includes("3.1") && lower.includes("pro")) {
      return "gemini-3.1-pro-preview";
    }
    if (lower.includes("3.1") && (lower.includes("lite") || lower.includes("flash"))) {
      return "gemini-3.1-flash-lite";
    }
    if (lower.includes("pro")) {
      return "gemini-3.1-pro-preview";
    }
    if (lower.includes("flash")) {
      return "gemini-3.8-flash";
    }
    // Generic fallback: replace spaces with hyphens and lowercase
    return lower.replace(/\s+/g, "-");
  }

  return trimmed;
}

/**
 * Loads and validates the 10 provider slots from environment variables.
 * Preserves seamless backward compatibility with GEMINI_API_KEY.
 */
export function loadProviderConfigs(): ProviderSlotConfig[] {
  const slots: ProviderSlotConfig[] = [];

  for (let i = 1; i <= 10; i++) {
    const numStr = i.toString().padStart(2, "0");
    const slotId = `API_${numStr}`;
    const isPrimary = i === 1;

    const envProvider = process.env[`${slotId}_PROVIDER`]?.trim().toLowerCase();
    const envBaseUrl = process.env[`${slotId}_BASE_URL`]?.trim();
    const envModel = process.env[`${slotId}_MODEL`]?.trim();
    const envKey = process.env[`${slotId}_KEY`]?.trim();

    const providerType = (envProvider as ProviderType) || (isPrimary ? "gemini" : "openai-compatible");
    const normalizedModel = normalizeModelName(envModel, providerType);

    // Default configuration for API 01 (Primary) fallback to GEMINI_API_KEY
    if (isPrimary) {
      const geminiKey = envKey || process.env.GEMINI_API_KEY?.trim();
      const hasKey = Boolean(geminiKey);

      slots.push({
        slotId,
        slotNumber: i,
        name: `API ${numStr} (Primary - Gemini)`,
        isPrimary: true,
        provider: "gemini",
        baseUrl: envBaseUrl || undefined,
        model: normalizedModel,
        apiKey: geminiKey || undefined,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        maxRetries: DEFAULT_MAX_RETRIES,
        isConfigured: hasKey,
      });
      continue;
    }

    // Slots 02 to 10
    const hasKey = Boolean(envKey && envKey !== "PASTE API KEY HERE");
    const hasProvider = Boolean(envProvider);
    const isConfigured = Boolean(hasKey && (hasProvider || envModel));

    slots.push({
      slotId,
      slotNumber: i,
      name: `API ${numStr} (Backup${envProvider ? ` - ${envProvider}` : ""})`,
      isPrimary: false,
      provider: providerType,
      baseUrl: envBaseUrl || undefined,
      model: normalizedModel,
      apiKey: envKey || undefined,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      maxRetries: DEFAULT_MAX_RETRIES,
      isConfigured,
    });
  }

  return slots;
}

/**
 * Redacts sensitive API keys and secrets for safe telemetry or client inspection.
 */
export function sanitizeSlotConfig(slot: ProviderSlotConfig): SafeProviderSlotInfo {
  return {
    slotId: slot.slotId,
    slotNumber: slot.slotNumber,
    name: slot.name,
    isPrimary: slot.isPrimary,
    provider: slot.provider,
    baseUrl: slot.baseUrl,
    model: slot.model,
    timeoutMs: slot.timeoutMs,
    isConfigured: slot.isConfigured,
  };
}
