/**
 * RSR Nexora - AI Provider Health Registry
 * In-memory concurrency-safe state tracking for the 10 API provider slots.
 * Manages health checks, cooldowns, latencies, failure counters, and failover metrics.
 */

import { ProviderSlotConfig, SafeProviderSlotInfo } from "../config/providerConfig";
import { ErrorCategory } from "./errorClassifier";
import { logger } from "../logger/logger";

export type ProviderHealthStatus = "healthy" | "unhealthy" | "cooldown" | "unconfigured";

export interface ProviderHealthState {
  slotId: string;
  slotNumber: number;
  name: string;
  provider: string;
  model: string;
  isPrimary: boolean;
  isConfigured: boolean;
  status: ProviderHealthStatus;
  consecutiveFailures: number;
  lastSuccess: number | null;
  lastFailure: number | null;
  cooldownUntil: number | null;
  latencyMs: number | null;
  lastErrorCategory: ErrorCategory | null;
  successCount: number;
  failureCount: number;
}

export interface SafeHealthSummary {
  fallbackEnabled: boolean;
  totalSlots: number;
  configuredProviders: number;
  healthyProviders: number;
  cooldownProviders: number;
  unconfiguredProviders: number;
  primarySlot: string;
  primaryStatus: ProviderHealthStatus;
  totalFailovers: number;
}

const DEFAULT_COOLDOWN_MS = 30000; // 30 seconds
const MAX_CONSECUTIVE_FAILURES_BEFORE_COOLDOWN = 2;

export class ProviderHealthRegistry {
  private slots: Map<string, ProviderHealthState> = new Map();
  private totalFailovers: number = 0;

  constructor(configs?: ProviderSlotConfig[]) {
    if (configs) {
      this.initSlots(configs);
    }
  }

  public initSlots(configs: ProviderSlotConfig[]): void {
    this.slots.clear();
    for (const cfg of configs) {
      this.slots.set(cfg.slotId, {
        slotId: cfg.slotId,
        slotNumber: cfg.slotNumber,
        name: cfg.name,
        provider: cfg.provider,
        model: cfg.model,
        isPrimary: cfg.isPrimary,
        isConfigured: cfg.isConfigured,
        status: cfg.isConfigured ? "healthy" : "unconfigured",
        consecutiveFailures: 0,
        lastSuccess: null,
        lastFailure: null,
        cooldownUntil: null,
        latencyMs: null,
        lastErrorCategory: null,
        successCount: 0,
        failureCount: 0,
      });
    }
  }

  /**
   * Checks if a provider slot is eligible for receiving traffic.
   * Concurrency-safe: Auto-recovers slots whose cooldown period has passed.
   */
  public isEligible(slotId: string): boolean {
    const state = this.slots.get(slotId);
    if (!state || !state.isConfigured) {
      return false;
    }

    const now = Date.now();

    // Check if slot was in cooldown and has now expired
    if (state.status === "cooldown" && state.cooldownUntil && now >= state.cooldownUntil) {
      // Cooldown expired: allow an exploratory attempt
      state.status = "healthy";
      state.cooldownUntil = null;
      logger.info(`[ProviderHealth] Slot ${slotId} cooldown expired; restored to eligible status.`, {
        slotId,
        event: "cooldown_recovery",
      });
      return true;
    }

    return state.status === "healthy";
  }

  /**
   * Records a successful completion from a provider slot.
   */
  public recordSuccess(slotId: string, latencyMs: number): void {
    const state = this.slots.get(slotId);
    if (!state) return;

    state.status = "healthy";
    state.consecutiveFailures = 0;
    state.lastSuccess = Date.now();
    state.cooldownUntil = null;
    state.latencyMs = Math.round(latencyMs);
    state.lastErrorCategory = null;
    state.successCount++;
  }

  /**
   * Records a failure from a provider slot and calculates cooldown windows.
   */
  public recordFailure(slotId: string, category: ErrorCategory, retryAfterMs?: number): void {
    const state = this.slots.get(slotId);
    if (!state) return;

    state.consecutiveFailures++;
    state.failureCount++;
    state.lastFailure = Date.now();
    state.lastErrorCategory = category;

    // Rate limits immediately enter cooldown using retry-after or default
    if (category === "TRANSIENT_RATE_LIMIT") {
      const cooldownDuration = retryAfterMs || DEFAULT_COOLDOWN_MS;
      state.status = "cooldown";
      state.cooldownUntil = Date.now() + cooldownDuration;
      logger.warn(`[ProviderHealth] Slot ${slotId} rate-limited. Entering cooldown for ${cooldownDuration}ms.`, {
        slotId,
        category,
        cooldownDuration,
      });
      return;
    }

    // Config errors (e.g. invalid key for that slot) enter longer cooldown
    if (category === "PERMANENT_CONFIG_ERROR") {
      state.status = "cooldown";
      state.cooldownUntil = Date.now() + 120000; // 2 minutes
      logger.error(`[ProviderHealth] Slot ${slotId} configuration error. Entering cooldown.`, {
        slotId,
        category,
      });
      return;
    }

    // Consecutive failure threshold trigger
    if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES_BEFORE_COOLDOWN) {
      // Exponential backoff cooldown based on failures
      const multiplier = Math.min(4, state.consecutiveFailures - 1);
      const cooldownDuration = (retryAfterMs || DEFAULT_COOLDOWN_MS) * multiplier;
      state.status = "cooldown";
      state.cooldownUntil = Date.now() + cooldownDuration;
      logger.warn(`[ProviderHealth] Slot ${slotId} reached ${state.consecutiveFailures} consecutive failures. Cooldown for ${cooldownDuration}ms.`, {
        slotId,
        consecutiveFailures: state.consecutiveFailures,
        cooldownDuration,
      });
    }
  }

  /**
   * Records a failover event from one provider slot to another.
   */
  public recordFailover(fromSlotId: string, toSlotId: string, reason: string): void {
    this.totalFailovers++;
    logger.info(`[ProviderHealth] Automatic failover routing from ${fromSlotId} to ${toSlotId}`, {
      event: "provider_failover",
      from: fromSlotId,
      to: toSlotId,
      reason,
      totalFailovers: this.totalFailovers,
    });
  }

  /**
   * Retrieves safe telemetry summary for the public health check.
   */
  public getHealthSummary(): SafeHealthSummary {
    let configured = 0;
    let healthy = 0;
    let cooldown = 0;
    let unconfigured = 0;

    const primaryState = this.slots.get("API_01");

    for (const state of this.slots.values()) {
      if (!state.isConfigured) {
        unconfigured++;
      } else if (state.status === "healthy") {
        configured++;
        healthy++;
      } else if (state.status === "cooldown") {
        configured++;
        cooldown++;
      } else {
        configured++;
      }
    }

    return {
      fallbackEnabled: true,
      totalSlots: 10,
      configuredProviders: configured,
      healthyProviders: healthy,
      cooldownProviders: cooldown,
      unconfiguredProviders: unconfigured,
      primarySlot: "API_01",
      primaryStatus: primaryState ? primaryState.status : "unconfigured",
      totalFailovers: this.totalFailovers,
    };
  }

  /**
   * Retrieves sanitized list of all 10 slots for protected developer view.
   * Absolutely zero secrets or API keys are exposed.
   */
  public getAllSlotStatuses(): Array<Omit<ProviderHealthState, never>> {
    return Array.from(this.slots.values()).map((s) => ({
      slotId: s.slotId,
      slotNumber: s.slotNumber,
      name: s.name,
      provider: s.provider,
      model: s.model,
      isPrimary: s.isPrimary,
      isConfigured: s.isConfigured,
      status: s.status,
      consecutiveFailures: s.consecutiveFailures,
      lastSuccess: s.lastSuccess,
      lastFailure: s.lastFailure,
      cooldownUntil: s.cooldownUntil,
      latencyMs: s.latencyMs,
      lastErrorCategory: s.lastErrorCategory,
      successCount: s.successCount,
      failureCount: s.failureCount,
    }));
  }

  /**
   * Retrieves a single slot's state.
   */
  public getSlotState(slotId: string): ProviderHealthState | undefined {
    return this.slots.get(slotId);
  }

  public getSlotStatus(slotId: string): ProviderHealthState {
    const slot = this.slots.get(slotId);
    if (!slot) {
      throw new Error(`Slot ${slotId} not found`);
    }
    return slot;
  }


  /**
   * Sets slot status directly (useful in automated tests).
   */
  public setSlotStatus(
    slotId: string,
    status: ProviderHealthStatus,
    cooldownUntil?: number | null
  ): void {
    const state = this.slots.get(slotId);
    if (state) {
      state.status = status;
      if (cooldownUntil !== undefined) {
        state.cooldownUntil = cooldownUntil;
      }
    }
  }

  /**
   * Resets registry state.
   */
  public resetMetrics(): void {
    this.totalFailovers = 0;
    for (const state of this.slots.values()) {
      state.status = state.isConfigured ? "healthy" : "unconfigured";
      state.consecutiveFailures = 0;
      state.cooldownUntil = null;
      state.lastErrorCategory = null;
      state.latencyMs = null;
      state.successCount = 0;
      state.failureCount = 0;
    }
  }
}
