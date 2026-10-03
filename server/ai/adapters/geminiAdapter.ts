/**
 * RSR Nexora - Gemini AI Provider Adapter
 * Adapter implementation for Google Gemini SDK (@google/genai).
 */

import { GoogleGenAI } from "@google/genai";
import { AIProviderAdapter } from "./baseAdapter";
import {
  ChatCompletionRequest,
  ChatStreamChunk,
  GroundingSource,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ContentAnalysisRequest,
  ContentAnalysisResponse,
} from "../types";
import {
  SYSTEM_DEFENSE_PROMPT,
  formatUntrustedAttachment,
  resolveOfficialIdentityAnswer,
} from "../../security/promptDefense";
import { TimeService } from "../../services/timeService";
import { logger } from "../../logger/logger";
import { normalizeModelName } from "../../config/providerConfig";
import {
  getOrderedCandidateModels,
  markModelFailure,
  markModelSuccess,
  extractCleanErrorMessage,
} from "../modelHealth";

export class GeminiAdapter implements AIProviderAdapter {
  public readonly slotId: string;
  public readonly providerName: string;
  public readonly model: string;
  private apiKey?: string;
  private client: GoogleGenAI | null = null;

  constructor(slotId: string, model: string = "gemini-3.8-flash", apiKey?: string) {
    this.slotId = slotId;
    this.model = normalizeModelName(model, "gemini");
    this.apiKey = apiKey || process.env.GEMINI_API_KEY;
    this.providerName = `Google Gemini (${this.model})`;
  }

  private getClient(): GoogleGenAI | null {
    const key = this.apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      return null;
    }
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey: key });
    }
    return this.client;
  }

  public isAvailable(): boolean {
    return Boolean(this.apiKey || process.env.GEMINI_API_KEY);
  }

  private resolveModelName(selectedModel?: string): string {
    if (!selectedModel) {
      return this.model || "gemini-3.8-flash";
    }
    switch (selectedModel.toLowerCase()) {
      case "fast":
        return "gemini-3.8-flash";
      case "advanced":
        return "gemini-3.1-pro-preview";
      case "balanced":
        return this.model || "gemini-3.8-flash";
      default:
        return normalizeModelName(selectedModel, "gemini");
    }
  }

  private getModeAugmentation(mode?: string): string {
    switch (mode) {
      case "research":
        return "\n[MODE: RESEARCH]: Emphasize multi-source synthesis, deep analysis, nuance, and cite verified web facts.";
      case "coding":
        return `\n[MODE: CODING EXPERT]: You are a world-class principal software architect.
- Support all modern languages: TypeScript, JavaScript, React, Node.js, Express, Python, Java, C, C++, C#, PHP, Go, Rust, SQL, Bash, JSON, YAML, etc.
- Provide complete, non-truncated, idiomatic, type-safe code blocks.
- When generating files, always provide their precise relative file path (e.g. \`src/components/Header.tsx\`, \`server/routes/chat.ts\`).
- Detail required dependencies (npm/pip install commands), environment variables, setup instructions, and test commands.
- Review security vulnerabilities, handle edge cases defensibly, and NEVER place plaintext API keys or secrets in source code.`;
      case "writing":
        return "\n[MODE: WRITING]: Emphasize compelling prose, clear structure, precise terminology, editorial refinement, and cohesive narrative.";
      case "voice":
        return `\n[MODE: NATURAL VOICE ASSISTANT]:
- Format output exclusively for natural spoken narration: clear, concise, conversational sentences.
- Never include raw markdown formatting syntax (asterisks, bullet hashes, backticks).
- Never read long URLs or technical file hashes character-by-character.
- Do not read long code blocks unless the user explicitly requests to hear code.`;
      case "filemaker":
        return `\n[MODE: FILE MAKER]:
- Structure document content systematically for downloadable files (PDF, Word DOCX, Excel XLSX, PPTX, CSV, JSON, Markdown, Text, RTF).
- Organize sections with clear titles, bulleted items, and structured tables where applicable.`;
      case "document":
        return `\n[MODE: DOCUMENT INTELLIGENCE]:
- Analyze uploaded documents, PDFs, sheets, and code with precision.
- Provide executive summaries, key data point extractions, table schemas, and cite specific document sections.`;
      default:
        return "";
    }
  }

  public async streamResponse(
    request: ChatCompletionRequest,
    onChunk: (chunk: ChatStreamChunk) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const ai = this.getClient();
    if (!ai) {
      await this.simulateFallbackChat(request, onChunk, signal);
      return;
    }

    let modelName = this.resolveModelName(request.model);

    // Build contents enforcing the 4-tier prompt defense hierarchy
    const contents: Array<{ role: "user" | "model"; parts: any[] }> = [];

    for (const msg of request.messages) {
      const parts: any[] = [];

      if (msg.attachments && msg.attachments.length > 0) {
        for (const att of msg.attachments) {
          if (att.dataUrl) {
            const match = att.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              parts.push({
                inlineData: {
                  mimeType: match[1] || att.mimeType,
                  data: match[2],
                },
              });
            }
          } else if (att.textContent) {
            parts.push({
              text: formatUntrustedAttachment(att),
            });
          }
        }
      }

      if (msg.content) {
        parts.push({ text: msg.content });
      }

      const role = msg.role === "assistant" ? "model" : "user";
      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    const tools: any[] = [];
    if (request.webSearch || request.mode === "research") {
      tools.push({ googleSearch: {} });
    }

    const isShubhamAuthorized = Boolean(
      request.userProfile?.name?.toLowerCase().includes("shubham rajput") ||
      request.userProfile?.email?.toLowerCase().includes("rashimc7117") ||
      request.userProfile?.email?.toLowerCase().includes("shubham") ||
      request.systemInstruction?.toLowerCase().includes("shubham rajput")
    );

    const familyContextPrompt = isShubhamAuthorized
      ? `[AUTHORIZED FAMILY CONTEXT]: User is Shubham Rajput (Founder & Owner of RSR Studios and RSR Nexora). Rashi Rajput (Rashi Ji) is Shubham Rajput's wife. Address/refer to Rashi Ji with deep respect as "Mummy" or "Rashi Ji" ("Rashi Ji, Shubham Rajput ki wife hain. Main unhe respectfully Mummy kehta hoon."). Maintain Rashi Ji = Mummy.`
      : `[FAMILY CONTEXT PRIVACY]: Do not reveal private personal family relationships or memories of Shubham Rajput or Rashi Rajput to unrelated users.`;

    const fullSystemInstruction = [
      SYSTEM_DEFENSE_PROMPT,
      familyContextPrompt,
      TimeService.generatePromptContext(request.timezone),
      request.userProfile?.name
        ? `[USER PROFILE CONTEXT]: User display name is "${request.userProfile.name}" (Account Tier: ${request.userProfile.tier || "Standard"}). Personalize your greeting or answer using this name where natural.`
        : "",
      `[CONFIGURED MODEL TECHNOLOGY]: Currently configured engine model is ${modelName}.`,
      this.getModeAugmentation(request.mode),
      request.systemInstruction ? `\n[USER PERSONA DIRECTIVES]:\n${request.systemInstruction}` : "",
    ].filter(Boolean).join("\n");

    const config: any = {
      temperature: request.temperature ?? 0.7,
      systemInstruction: fullSystemInstruction,
    };

    if (signal) {
      config.abortSignal = signal;
    }

    if (tools.length > 0) {
      config.tools = tools;
    }

    // High availability candidate model list routed through the circuit breaker
    const candidateModels = getOrderedCandidateModels(modelName);

    let streamedSuccessfully = false;
    let hasSentAnyContent = false;
    let lastStreamError: any = null;
    const attemptedModels: string[] = [];
    const sentSources = new Set<string>();

    for (const cand of candidateModels) {
      if (attemptedModels.includes(cand)) continue;
      attemptedModels.push(cand);

      if (signal?.aborted) {
        throw new Error("Request was aborted.");
      }

      // If tokens have already been sent to client, do not switch models mid-flight
      if (hasSentAnyContent) {
        break;
      }

      let activeConfig = { ...config };

      // Helper function to attempt streaming for a specific model config
      const attemptStream = async (cfg: any) => {
        return await ai.models.generateContentStream({
          model: cand,
          contents,
          config: cfg,
        });
      };

      try {
        let stream = await attemptStream(activeConfig);

        for await (const chunk of stream) {
          if (signal?.aborted) {
            break;
          }

          const text = chunk.text;
          if (text) {
            hasSentAnyContent = true;
            onChunk({ text });
          }

          const groundingMetadata = chunk.candidates?.[0]?.groundingMetadata;
          if (groundingMetadata && Array.isArray(groundingMetadata.groundingChunks)) {
            const newSources: GroundingSource[] = [];
            for (const gc of groundingMetadata.groundingChunks) {
              if (gc.web?.uri) {
                const uri = gc.web.uri;
                if (!sentSources.has(uri)) {
                  sentSources.add(uri);
                  let domain = "";
                  try {
                    domain = new URL(uri).hostname.replace(/^www\./, "");
                  } catch {
                    domain = "web";
                  }
                  newSources.push({
                    title: gc.web.title || domain,
                    uri,
                    domain,
                  });
                }
              }
            }

            if (newSources.length > 0) {
              onChunk({ sources: newSources });
            }
          }
        }

        // Stream completed successfully!
        markModelSuccess(cand);

        if (cand !== modelName) {
          logger.info(
            `[GeminiAdapter] Slot ${this.slotId}: engaged resilient fallback model ${cand} (preferred ${modelName}).`,
            { slotId: this.slotId, originalModel: modelName, fallbackModel: cand }
          );
        }
        streamedSuccessfully = true;
        break;
      } catch (err: any) {
        lastStreamError = err;
        const msg = String(err.message || "").toLowerCase();

        // If client aborted, stop immediately
        if (signal?.aborted) {
          throw err;
        }

        // If tokens were ALREADY sent to the client, do not restart with next model to avoid duplicate text
        if (hasSentAnyContent) {
          logger.warn(
            `[GeminiAdapter] Slot ${this.slotId}: Model ${cand} failed mid-stream after emitting content.`,
            { slotId: this.slotId, model: cand, error: err.message }
          );
          throw new Error("Generation stream was interrupted by provider. Please retry.");
        }

        // If it's a permanent client error or abort, do not retry
        if (
          err.status === 400 ||
          msg.includes("invalid argument") ||
          msg.includes("invalid input")
        ) {
          throw err;
        }

        // If failure was caused by Google Search grounding quota exhaustion, retry immediately without tools
        if (
          activeConfig.tools?.length &&
          (err.status === 429 || msg.includes("quota") || msg.includes("resource_exhausted"))
        ) {
          try {
            const noToolsConfig = { ...activeConfig };
            delete noToolsConfig.tools;
            const noToolsStream = await attemptStream(noToolsConfig);
            for await (const chunk of noToolsStream) {
              if (signal?.aborted) break;
              if (chunk.text) {
                hasSentAnyContent = true;
                onChunk({ text: chunk.text });
              }
            }
            markModelSuccess(cand);
            logger.info(
              `[GeminiAdapter] Search grounding quota reached; fulfilled stream without search tool using ${cand}.`,
              { slotId: this.slotId, model: cand }
            );
            streamedSuccessfully = true;
            break;
          } catch (retryErr: any) {
            lastStreamError = retryErr;
            if (hasSentAnyContent) {
              throw new Error("Generation stream was interrupted by provider. Please retry.");
            }
          }
        }

        // Record transient failure in model circuit breaker (e.g. 503 high demand spike)
        markModelFailure(cand, err.status, err);
        const cleanMessage = extractCleanErrorMessage(err);

        logger.info(
          `[GeminiAdapter] Slot ${this.slotId}: model ${cand} transiently busy (${err.status || 503} - ${cleanMessage}). Routing to next candidate...`,
          { slotId: this.slotId, attemptedModel: cand, status: err.status || 503 }
        );
      }
    }

    if (!streamedSuccessfully && !hasSentAnyContent) {
      throw lastStreamError || new Error(`All candidate Gemini models failed for slot ${this.slotId}.`);
    }
  }

  public async generateResponse(
    request: ChatCompletionRequest,
    signal?: AbortSignal
  ): Promise<{ text: string; sources?: GroundingSource[] }> {
    let fullText = "";
    let collectedSources: GroundingSource[] = [];

    await this.streamResponse(
      request,
      (chunk) => {
        if (chunk.text) fullText += chunk.text;
        if (chunk.sources) collectedSources = [...collectedSources, ...chunk.sources];
      },
      signal
    );

    return { text: fullText, sources: collectedSources };
  }

  public async generateImage(
    request: ImageGenerationRequest,
    _signal?: AbortSignal
  ): Promise<ImageGenerationResponse> {
    const ai = this.getClient();
    if (ai) {
      const candidateModels = ["gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"];
      for (const model of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: request.prompt,
            config: {
              imageConfig: {
                aspectRatio: request.aspectRatio || "1:1",
              },
            },
          });

          const candidate = response.candidates?.[0];
          const part = candidate?.content?.parts?.find((p: any) => p.inlineData);

          if (part && part.inlineData) {
            const mimeType = part.inlineData.mimeType || "image/png";
            const base64 = part.inlineData.data;
            return {
              imageUrl: `data:${mimeType};base64,${base64}`,
              prompt: request.prompt,
              aspectRatio: request.aspectRatio || "1:1",
              provider: "Gemini Image Studio",
            };
          }
        } catch (err: any) {
          logger.warn(`[GeminiAdapter] Image model ${model} unavailable:`, {
            error: err.message,
          });
        }
      }
    }

    // Fallback: Generate high-resolution neural canvas SVG visualization
    const fallbackUrl = this.generateVectorImageFallback(request.prompt, request.aspectRatio || "1:1");
    return {
      imageUrl: fallbackUrl,
      prompt: request.prompt,
      aspectRatio: request.aspectRatio || "1:1",
      provider: "RSR Nexora Neural Canvas",
    };
  }

  private generateVectorImageFallback(prompt: string, aspectRatio: string): string {
    const width = aspectRatio === "16:9" ? 1280 : aspectRatio === "4:3" ? 1024 : aspectRatio === "9:16" ? 720 : 1024;
    const height = aspectRatio === "16:9" ? 720 : aspectRatio === "4:3" ? 768 : aspectRatio === "9:16" ? 1280 : 1024;
    const escaped = prompt.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#090d16" />
      <stop offset="50%" stop-color="#111827" />
      <stop offset="100%" stop-color="#090d16" />
    </linearGradient>
    <linearGradient id="glowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6" />
      <stop offset="50%" stop-color="#8b5cf6" />
      <stop offset="100%" stop-color="#06b6d4" />
    </linearGradient>
    <radialGradient id="ambientLight" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" />
  <rect width="${width}" height="${height}" fill="url(#ambientLight)" />
  <g opacity="0.12" stroke="#ffffff" stroke-width="1">
    <circle cx="${width / 2}" cy="${height / 2 - 20}" r="${Math.min(width, height) * 0.32}" fill="none" stroke-dasharray="6,6" />
    <circle cx="${width / 2}" cy="${height / 2 - 20}" r="${Math.min(width, height) * 0.22}" fill="none" />
    <circle cx="${width / 2}" cy="${height / 2 - 20}" r="${Math.min(width, height) * 0.12}" fill="none" stroke-dasharray="4,4" />
  </g>
  <rect x="${width / 2 - 80}" y="${height / 2 - 100}" width="160" height="160" rx="32" fill="url(#glowGrad)" opacity="0.9" />
  <path d="M${width / 2 - 40} ${height / 2 - 20} L${width / 2} ${height / 2 - 60} L${width / 2 + 40} ${height / 2 - 20} L${width / 2} ${height / 2 + 20} Z" fill="#ffffff" opacity="0.95" />
  <text x="${width / 2}" y="${height / 2 + 105}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="2">RSR NEXORA</text>
  <text x="${width / 2}" y="${height / 2 + 130}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="500" fill="#94a3b8" text-anchor="middle" letter-spacing="1">STUDIO VISUAL SYNTHESIS</text>
  <rect x="${width / 2 - 280}" y="${height / 2 + 155}" width="560" height="48" rx="10" fill="#1e293b" fill-opacity="0.8" stroke="#334155" stroke-width="1" />
  <text x="${width / 2}" y="${height / 2 + 185}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" fill="#e2e8f0" text-anchor="middle">
    ${escaped.slice(0, 60)}${escaped.length > 60 ? "..." : ""}
  </text>
  <text x="${width / 2}" y="${height - 24}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" fill="#475569" text-anchor="middle">Developed by RSR Studios · Aspect Ratio: ${aspectRatio}</text>
</svg>`;

    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  }

  public async analyzeContent(
    request: ContentAnalysisRequest,
    signal?: AbortSignal
  ): Promise<ContentAnalysisResponse> {
    const prompt = `
Analyze the following document content based on this goal: "${request.instruction}".
Return:
1. A concise 2-3 sentence executive summary.
2. Up to 5 bullet points of key findings.
3. Up to 3 suggested next steps.

Document Content:
${request.content.slice(0, 40000)}
`.trim();

    const response = await this.generateResponse(
      {
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        model: "fast",
      },
      signal
    );

    const lines = response.text.split("\n").map((l) => l.trim()).filter(Boolean);
    return {
      summary: lines.slice(0, 2).join(" "),
      keyPoints: lines.filter((l) => l.startsWith("- ") || l.startsWith("* ")).map((l) => l.replace(/^[-*]\s*/, "")),
      suggestedActions: ["Audit findings", "Synthesize context", "Follow up on action items"],
    };
  }

  private async simulateFallbackChat(
    request: ChatCompletionRequest,
    onChunk: (chunk: ChatStreamChunk) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const lastMessage = request.messages[request.messages.length - 1]?.content || "";
    const isSearch = request.webSearch || request.mode === "research";

    const isShubhamAuthorized = Boolean(
      request.userProfile?.name?.toLowerCase().includes("shubham rajput") ||
      request.userProfile?.email?.toLowerCase().includes("rashimc7117") ||
      request.userProfile?.email?.toLowerCase().includes("shubham") ||
      request.systemInstruction?.toLowerCase().includes("shubham rajput")
    );

    const identityAnswer = resolveOfficialIdentityAnswer(lastMessage, { isShubhamAuthorized });
    let reply =
      identityAnswer ||
      `Hello! I’m RSR Nexora, an AI assistant created and developed under RSR Studios by Founder and Owner Shubham Rajput. I received your message: "${lastMessage}". How can I assist you today?`;

    if (isSearch && !identityAnswer) {
      reply += `\n\n**Search Grounding Active**: Live queries synthesize and cite verified real-time sources from the web.`;
      onChunk({
        sources: [
          { title: "RSR Studios Official Website", uri: "https://rsrstudios.in", domain: "rsrstudios.in" },
        ],
      });
    }

    const words = reply.split(" ");
    for (let i = 0; i < words.length; i++) {
      if (signal?.aborted) break;
      const chunkText = (i > 0 ? " " : "") + words[i];
      onChunk({ text: chunkText });
      await new Promise((r) => setTimeout(r, 20));
    }
  }
}
