/**
 * RSR Nexora - 10-API Automatic Fallback Orchestration Engine
 * Implements the priority chain: API 01 -> API 02 -> ... -> API 10.
 * Handles automatic failovers, bounded retries, cooldowns, and safe SSE streaming.
 */

import { loadProviderConfigs, ProviderSlotConfig } from "../config/providerConfig";
import { ProviderHealthRegistry } from "./providerHealthRegistry";
import { classifyProviderError, NormalizedProviderError } from "./errorClassifier";
import { AIProviderAdapter } from "./adapters/baseAdapter";
import { GeminiAdapter } from "./adapters/geminiAdapter";
import { OpenAICompatibleAdapter } from "./adapters/openaiCompatibleAdapter";
import {
  ChatCompletionRequest,
  ChatStreamChunk,
  GroundingSource,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ContentAnalysisRequest,
  ContentAnalysisResponse,
} from "./types";
import { logger } from "../logger/logger";
import { resolveOfficialIdentityAnswer } from "../security/promptDefense";

export class AIOrchestrator {
  private slotConfigs: ProviderSlotConfig[] = [];
  private adapters: Map<string, AIProviderAdapter> = new Map();
  public healthRegistry: ProviderHealthRegistry;

  constructor() {
    this.slotConfigs = loadProviderConfigs();
    this.healthRegistry = new ProviderHealthRegistry(this.slotConfigs);
    this.initDefaultAdapters();
  }

  /**
   * Initializes adapters for all configured slots based on environment variables.
   */
  private initDefaultAdapters(): void {
    for (const cfg of this.slotConfigs) {
      if (!cfg.isConfigured) continue;

      if (cfg.provider === "gemini") {
        this.adapters.set(cfg.slotId, new GeminiAdapter(cfg.slotId, cfg.model, cfg.apiKey));
      } else {
        this.adapters.set(
          cfg.slotId,
          new OpenAICompatibleAdapter(
            cfg.slotId,
            cfg.model,
            cfg.apiKey,
            cfg.baseUrl,
            cfg.name
          )
        );
      }
    }
  }

  /**
   * Resets all provider slot configurations, adapters, and health registry to original environment settings.
   */
  public resetDefaults(): void {
    this.slotConfigs = loadProviderConfigs();
    this.adapters.clear();
    this.healthRegistry = new ProviderHealthRegistry(this.slotConfigs);
    this.initDefaultAdapters();
  }

  /**
   * Allows registering custom or mock adapters for a specific slot (used in tests/plugins).
   */
  public registerAdapter(slotId: string, adapter: AIProviderAdapter): void {
    this.adapters.set(slotId, adapter);
    const cfg = this.slotConfigs.find((s) => s.slotId === slotId);
    if (cfg) {
      cfg.isConfigured = true;
      this.healthRegistry.initSlots(this.slotConfigs);
    }
  }

  /**
   * Retrieves the adapter for a slot.
   */
  public getAdapter(slotId: string): AIProviderAdapter | undefined {
    return this.adapters.get(slotId);
  }

  /**
   * Priority-ordered list of slot IDs: API_01 down to API_10.
   */
  private getPrioritySlots(): string[] {
    return this.slotConfigs.map((s) => s.slotId);
  }

  /**
   * Executes a single attempt on a provider with timeout and error classification.
   */
  private async executeWithTimeout<T>(
    slotId: string,
    operation: (adapter: AIProviderAdapter, signal: AbortSignal) => Promise<T>,
    parentSignal?: AbortSignal,
    customTimeoutMs?: number
  ): Promise<T> {
    const adapter = this.adapters.get(slotId);
    if (!adapter) {
      throw new Error(`No adapter available for slot ${slotId}`);
    }

    const slotConfig = this.slotConfigs.find((s) => s.slotId === slotId);
    const timeoutMs = customTimeoutMs || slotConfig?.timeoutMs || 30000;

    const controller = new AbortController();
    let timeoutId: NodeJS.Timeout | null = null;

    // Link parent abort signal if present
    const abortHandler = () => controller.abort();
    if (parentSignal) {
      if (parentSignal.aborted) {
        controller.abort();
      } else {
        parentSignal.addEventListener("abort", abortHandler, { once: true });
      }
    }

    // Set bounded timeout
    timeoutId = setTimeout(() => {
      const err = new Error(`Provider slot ${slotId} execution timed out after ${timeoutMs}ms.`);
      err.name = "TimeoutError";
      controller.abort();
    }, timeoutMs);

    const startTime = Date.now();

    try {
      const result = await operation(adapter, controller.signal);
      const latencyMs = Date.now() - startTime;
      this.healthRegistry.recordSuccess(slotId, latencyMs);
      return result;
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const normalized = classifyProviderError(err);
      this.healthRegistry.recordFailure(slotId, normalized.category, normalized.retryAfterMs);
      throw normalized;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (parentSignal) {
        parentSignal.removeEventListener("abort", abortHandler);
      }
    }
  }

  /**
   * Production SSE Streaming with Automatic Fallback.
   * - If failure occurs BEFORE tokens are sent: fails over cleanly to next provider slot.
   * - If failure occurs AFTER meaningful output began: stops and safely terminates stream without duplicating output.
   */
  public async streamResponse(
    request: ChatCompletionRequest,
    onChunk: (chunk: ChatStreamChunk) => void,
    parentSignal?: AbortSignal
  ): Promise<void> {
    const prioritySlots = this.getPrioritySlots();
    let lastError: NormalizedProviderError | null = null;
    let attemptedCount = 0;

    for (let i = 0; i < prioritySlots.length; i++) {
      const slotId = prioritySlots[i];

      // Check slot eligibility (must be configured, not in cooldown)
      if (!this.healthRegistry.isEligible(slotId)) {
        continue;
      }

      attemptedCount++;
      let hasSentContent = false;
      const slotConfig = this.slotConfigs.find((s) => s.slotId === slotId);
      const isPrimaryOrSingle = slotId === "API_01" || prioritySlots.filter((s) => this.healthRegistry.isEligible(s)).length <= 1;
      const maxRetries = slotConfig?.maxRetries ?? (isPrimaryOrSingle ? 2 : 1);

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (parentSignal?.aborted) {
          return;
        }

        try {
          await this.executeWithTimeout(
            slotId,
            async (adapter, signal) => {
              await adapter.streamResponse(
                request,
                (chunk) => {
                  if (chunk.text && chunk.text.length > 0) {
                    hasSentContent = true;
                  }
                  onChunk(chunk);
                },
                signal
              );
            },
            parentSignal,
            slotConfig?.timeoutMs
          );

          // Stream completed successfully!
          return;
        } catch (err: any) {
          const normError: NormalizedProviderError =
            err && err.category ? err : classifyProviderError(err);
          lastError = normError;

          // If client aborted, stop immediately
          if (parentSignal?.aborted) {
            return;
          }

          // Rule: DO NOT fall back on permanent user errors (e.g. malformed conversation)
          if (!normError.isFailoverEligible) {
            throw new Error(normError.message);
          }

          // Rule: If tokens were ALREADY sent to the client, DO NOT restart stream with next provider.
          // That would duplicate text and corrupt the user's chat context.
          if (hasSentContent) {
            logger.warn(
              `[AIOrchestrator] Provider ${slotId} failed mid-stream after emitting content. Aborting stream without failover to prevent duplicate output.`,
              {
                slotId,
                category: normError.category,
              }
            );
            throw new Error("Generation stream was interrupted by provider. Please retry.");
          }

          // If retry within the same slot is allowed for transient error
          if (attempt < maxRetries && normError.category !== "TRANSIENT_RATE_LIMIT") {
            const backoffMs = 250 * Math.pow(2, attempt) + Math.random() * 80;
            logger.info(
              `[AIOrchestrator] Slot ${slotId} transient condition (${normError.category}): ${normError.message}. Backoff retry in ${Math.round(backoffMs)}ms...`,
              { slotId, category: normError.category, details: normError.message }
            );
            await new Promise((r) => setTimeout(r, backoffMs));
            continue;
          }

          // Slot failed and cannot retry further: trigger failover to next eligible slot
          const nextSlotId = prioritySlots[i + 1] || "None";
          this.healthRegistry.recordFailover(slotId, nextSlotId, normError.category);
          break; // Move to next provider in outer loop
        }
      }
    }

    // Check if the user prompt is an official identity / brand inquiry
    const lastUserMsg = request.messages[request.messages.length - 1]?.content || "";
    const isShubhamAuthorized = Boolean(
      request.userProfile?.name?.toLowerCase().includes("shubham rajput") ||
      request.userProfile?.email?.toLowerCase().includes("rashimc7117") ||
      request.userProfile?.email?.toLowerCase().includes("shubham") ||
      request.systemInstruction?.toLowerCase().includes("shubham rajput")
    );
    const identityAnswer = resolveOfficialIdentityAnswer(lastUserMsg, { isShubhamAuthorized });
    if (identityAnswer) {
      onChunk({ text: identityAnswer });
      return;
    }

    // If no provider succeeded
    logger.error("[AIOrchestrator] All configured provider slots failed or in cooldown.", {
      attemptedCount,
      lastError: lastError?.message,
    });

    throw new Error("AI service is temporarily unavailable. Please try again in a moment.");
  }

  /**
   * Non-streaming Chat Completion with Automatic Fallback.
   */
  public async generateResponse(
    request: ChatCompletionRequest,
    parentSignal?: AbortSignal
  ): Promise<{ text: string; sources?: GroundingSource[] }> {
    const prioritySlots = this.getPrioritySlots();
    let lastError: NormalizedProviderError | null = null;
    let attemptedCount = 0;

    for (let i = 0; i < prioritySlots.length; i++) {
      const slotId = prioritySlots[i];

      if (!this.healthRegistry.isEligible(slotId)) {
        continue;
      }

      attemptedCount++;
      const slotConfig = this.slotConfigs.find((s) => s.slotId === slotId);
      const isPrimaryOrSingle = slotId === "API_01" || prioritySlots.filter((s) => this.healthRegistry.isEligible(s)).length <= 1;
      const maxRetries = slotConfig?.maxRetries ?? (isPrimaryOrSingle ? 2 : 1);

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (parentSignal?.aborted) {
          throw new Error("Operation aborted by client");
        }

        try {
          const result = await this.executeWithTimeout(
            slotId,
            async (adapter, signal) => {
              return await adapter.generateResponse(request, signal);
            },
            parentSignal,
            slotConfig?.timeoutMs
          );

          return result;
        } catch (err: any) {
          const normError: NormalizedProviderError =
            err && err.category ? err : classifyProviderError(err);
          lastError = normError;

          if (parentSignal?.aborted) {
            throw new Error("Operation aborted by client");
          }

          // Do NOT fall back for permanent user errors
          if (!normError.isFailoverEligible) {
            throw new Error(normError.message);
          }

          // Bounded retry
          if (attempt < maxRetries && normError.category !== "TRANSIENT_RATE_LIMIT") {
            const backoffMs = 250 * Math.pow(2, attempt) + Math.random() * 80;
            await new Promise((r) => setTimeout(r, backoffMs));
            continue;
          }

          // Failover to next slot
          const nextSlotId = prioritySlots[i + 1] || "None";
          this.healthRegistry.recordFailover(slotId, nextSlotId, normError.category);
          break;
        }
      }
    }

    // Check if the user prompt is an official identity / brand inquiry
    const lastUserMsg = request.messages[request.messages.length - 1]?.content || "";
    const isShubhamAuthorized = Boolean(
      request.userProfile?.name?.toLowerCase().includes("shubham rajput") ||
      request.userProfile?.email?.toLowerCase().includes("rashimc7117") ||
      request.userProfile?.email?.toLowerCase().includes("shubham") ||
      request.systemInstruction?.toLowerCase().includes("shubham rajput")
    );
    const identityAnswer = resolveOfficialIdentityAnswer(lastUserMsg, { isShubhamAuthorized });
    if (identityAnswer) {
      return { text: identityAnswer };
    }

    logger.error("[AIOrchestrator] All configured provider slots failed or in cooldown.", {
      attemptedCount,
      lastError: lastError?.message,
    });

    throw new Error("AI service is temporarily unavailable. Please try again in a moment.");
  }

  /**
   * Generates images using primary image-capable provider (Gemini).
   */
  public async generateImage(
    request: ImageGenerationRequest,
    parentSignal?: AbortSignal
  ): Promise<ImageGenerationResponse> {
    const primaryAdapter = this.adapters.get("API_01");
    if (primaryAdapter && typeof primaryAdapter.generateImage === "function") {
      return await primaryAdapter.generateImage(request, parentSignal);
    }
    throw new Error("Image generation provider is not available.");
  }

  /**
   * Analyzes document content using primary intelligent provider (Gemini).
   */
  public async analyzeContent(
    request: ContentAnalysisRequest,
    parentSignal?: AbortSignal
  ): Promise<ContentAnalysisResponse> {
    const primaryAdapter = this.adapters.get("API_01");
    if (primaryAdapter && typeof primaryAdapter.analyzeContent === "function") {
      return await primaryAdapter.analyzeContent(request, parentSignal);
    }
    // Fallback using general generateResponse
    const prompt = `Analyze the following content based on: "${request.instruction}". Provide summary, key findings, and action items.\n\n${request.content.slice(0, 30000)}`;
    const response = await this.generateResponse(
      {
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      },
      parentSignal
    );
    return {
      summary: response.text.slice(0, 300),
      keyPoints: ["Detailed content analysis completed."],
      suggestedActions: ["Review findings"],
    };
  }

  /**
   * Available models list for UI selection.
   */
  public getAvailableModels(): Array<{
    id: string;
    name: string;
    tier: "fast" | "balanced" | "advanced";
    description: string;
    isAvailable: boolean;
    supportsVision: boolean;
    supportsWebSearch: boolean;
  }> {
    const summary = this.healthRegistry.getHealthSummary();
    const hasActiveProviders = summary.healthyProviders > 0;

    return [
      {
        id: "fast",
        name: "Fast (Automatic Orchestration)",
        tier: "fast",
        description: "Ultra-low latency routed across active healthy provider slots",
        isAvailable: hasActiveProviders,
        supportsVision: true,
        supportsWebSearch: true,
      },
      {
        id: "balanced",
        name: "Balanced (Automatic Orchestration)",
        tier: "balanced",
        description: "Versatile reasoning with multi-provider automatic failover",
        isAvailable: hasActiveProviders,
        supportsVision: true,
        supportsWebSearch: true,
      },
      {
        id: "advanced",
        name: "Advanced (Deep Reasoning)",
        tier: "advanced",
        description: "High-capability reasoning and multimodal synthesis",
        isAvailable: hasActiveProviders,
        supportsVision: true,
        supportsWebSearch: true,
      },
    ];
  }
}

export const aiOrchestrator = new AIOrchestrator();
