/**
 * RSR Nexora - Mock AI Provider Adapter (for Automated QA Verification)
 * Allows deterministic testing of timeout, rate-limiting, server-error,
 * and failover behaviors across the 10-slot orchestration engine.
 */

import { AIProviderAdapter } from "./baseAdapter";
import { ChatCompletionRequest, ChatStreamChunk, GroundingSource } from "../types";
import { resolveOfficialIdentityAnswer } from "../../security/promptDefense";

export interface MockAdapterOptions {
  shouldFail?: boolean;
  failStatus?: number;
  failMessage?: string;
  delayMs?: number;
  tokensToSendBeforeFail?: number;
  responsePrefix?: string;
  retryAfterSeconds?: number;
}

export class MockAdapter implements AIProviderAdapter {
  public readonly slotId: string;
  public readonly providerName: string;
  public readonly model: string;
  public options: MockAdapterOptions;
  public callCount: number = 0;

  constructor(slotId: string, model: string = "mock-model", options: MockAdapterOptions = {}) {
    this.slotId = slotId;
    this.model = model;
    this.options = options;
    this.providerName = `Mock Provider (${slotId})`;
  }

  public isAvailable(): boolean {
    return true;
  }

  public async streamResponse(
    request: ChatCompletionRequest,
    onChunk: (chunk: ChatStreamChunk) => void,
    signal?: AbortSignal
  ): Promise<void> {
    this.callCount++;

    if (this.options.delayMs && this.options.delayMs > 0) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, this.options.delayMs);
        if (signal) {
          signal.addEventListener("abort", () => {
            clearTimeout(timer);
            const err = new Error("Operation aborted");
            err.name = "AbortError";
            reject(err);
          });
        }
      });
    }

    if (signal?.aborted) {
      const err = new Error("Operation aborted by client");
      err.name = "AbortError";
      throw err;
    }

    // If configured to emit some tokens before failing
    if (this.options.tokensToSendBeforeFail && this.options.tokensToSendBeforeFail > 0) {
      for (let i = 0; i < this.options.tokensToSendBeforeFail; i++) {
        onChunk({ text: `token_${i} ` });
      }
    }

    if (this.options.shouldFail) {
      const err: any = new Error(this.options.failMessage || "Simulated provider failure");
      err.status = this.options.failStatus || 500;
      if (this.options.retryAfterSeconds) {
        err.retryAfter = String(this.options.retryAfterSeconds);
      }
      throw err;
    }

    const prefix = this.options.responsePrefix || `[${this.slotId}]`;
    const lastMsg = request.messages[request.messages.length - 1]?.content || "Hello";

    const isShubhamAuthorized = Boolean(
      request.userProfile?.name?.toLowerCase().includes("shubham rajput") ||
      request.userProfile?.email?.toLowerCase().includes("rashimc7117") ||
      request.userProfile?.email?.toLowerCase().includes("shubham") ||
      request.systemInstruction?.toLowerCase().includes("shubham rajput")
    );

    const identityAnswer = resolveOfficialIdentityAnswer(lastMsg, { isShubhamAuthorized });
    const fullText = identityAnswer || `${prefix} Handled by ${this.slotId}: ${lastMsg}`;

    const words = fullText.split(" ");
    for (let i = 0; i < words.length; i++) {
      if (signal?.aborted) break;
      onChunk({ text: (i > 0 ? " " : "") + words[i] });
      await new Promise((r) => setTimeout(r, 5));
    }
  }

  public async generateResponse(
    request: ChatCompletionRequest,
    signal?: AbortSignal
  ): Promise<{ text: string; sources?: GroundingSource[] }> {
    let fullText = "";
    await this.streamResponse(
      request,
      (chunk) => {
        if (chunk.text) fullText += chunk.text;
      },
      signal
    );
    return { text: fullText };
  }
}
