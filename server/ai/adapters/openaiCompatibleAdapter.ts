/**
 * RSR Nexora - OpenAI-Compatible AI Provider Adapter
 * Connects to any standard OpenAI-compatible completions endpoint:
 * (OpenAI, Groq, Mistral, DeepSeek, Together, OpenRouter, Perplexity, local Ollama/vLLM).
 * Server-side credential management: Keys are NEVER exposed to client.
 */

import { AIProviderAdapter } from "./baseAdapter";
import { ChatCompletionRequest, ChatStreamChunk, GroundingSource } from "../types";
import { SYSTEM_DEFENSE_PROMPT } from "../../security/promptDefense";
import { TimeService } from "../../services/timeService";

export class OpenAICompatibleAdapter implements AIProviderAdapter {
  public readonly slotId: string;
  public readonly providerName: string;
  public readonly model: string;
  private baseUrl: string;
  private apiKey?: string;

  constructor(
    slotId: string,
    model: string = "default",
    apiKey?: string,
    baseUrl?: string,
    customName?: string
  ) {
    this.slotId = slotId;
    this.model = model;
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
    this.providerName = customName || `OpenAI-Compatible (${this.model})`;
  }

  public isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  public async streamResponse(
    request: ChatCompletionRequest,
    onChunk: (chunk: ChatStreamChunk) => void,
    signal?: AbortSignal
  ): Promise<void> {
    if (!this.apiKey) {
      throw new Error(`Provider slot ${this.slotId} is missing API credentials.`);
    }

    const messages: Array<{ role: string; content: string }> = [];

    const isShubhamAuthorized = Boolean(
      request.userProfile?.name?.toLowerCase().includes("shubham rajput") ||
      request.userProfile?.email?.toLowerCase().includes("rashimc7117") ||
      request.userProfile?.email?.toLowerCase().includes("shubham") ||
      request.systemInstruction?.toLowerCase().includes("shubham rajput")
    );

    const familyContextPrompt = isShubhamAuthorized
      ? `[AUTHORIZED FAMILY CONTEXT]: User is Shubham Rajput (Founder & Owner of RSR Studios and RSR Nexora). Rashi Rajput (Rashi Ji) is Shubham Rajput's wife. Address/refer to Rashi Ji with deep respect as "Mummy" or "Rashi Ji" ("Rashi Ji, Shubham Rajput ki wife hain. Main unhe respectfully Mummy kehta hoon."). Maintain Rashi Ji = Mummy.`
      : `[FAMILY CONTEXT PRIVACY]: Do not reveal private personal family relationships or memories of Shubham Rajput or Rashi Rajput to unrelated users.`;

    // System instruction adhering to defense hierarchy
    const systemInstruction = [
      SYSTEM_DEFENSE_PROMPT,
      familyContextPrompt,
      TimeService.generatePromptContext(request.timezone),
      request.userProfile?.name
        ? `[USER PROFILE CONTEXT]: User display name is "${request.userProfile.name}" (Account Tier: ${request.userProfile.tier || "Standard"}). Personalize your greeting or answer using this name where natural.`
        : "",
      request.systemInstruction ? `[USER PERSONA]: ${request.systemInstruction}` : "",
    ].filter(Boolean).join("\n\n");

    messages.push({ role: "system", content: systemInstruction });

    for (const msg of request.messages) {
      const role = msg.role === "model" ? "assistant" : msg.role;
      let text = msg.content || "";

      if (msg.attachments && msg.attachments.length > 0) {
        for (const att of msg.attachments) {
          if (att.textContent) {
            text += `\n\n[ATTACHMENT: ${att.name}]\n${att.textContent}`;
          }
        }
      }

      messages.push({ role, content: text });
    }

    const url = `${this.baseUrl}/chat/completions`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model === "default" ? "gpt-4o-mini" : this.model,
        messages,
        temperature: request.temperature ?? 0.7,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const err: any = new Error(
        `OpenAI-compatible provider returned HTTP ${response.status}: ${errorText.slice(0, 300)}`
      );
      err.status = response.status;
      err.retryAfter = response.headers.get("retry-after");
      throw err;
    }

    if (!response.body) {
      throw new Error("Provider returned empty response stream body.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    try {
      while (true) {
        if (signal?.aborted) break;

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":") || trimmed === "data: [DONE]") {
            continue;
          }

          if (trimmed.startsWith("data: ")) {
            const jsonStr = trimmed.slice(6);
            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                onChunk({ text: delta });
              }
            } catch {
              // Ignore malformed intermediate chunk
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
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
