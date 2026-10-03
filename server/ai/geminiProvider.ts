import { GoogleGenAI } from "@google/genai";
import {
  AIProvider,
  ChatCompletionRequest,
  ChatStreamChunk,
  ContentAnalysisRequest,
  ContentAnalysisResponse,
  GroundingSource,
  ImageGenerationRequest,
  ImageGenerationResponse,
} from "./types";
import {
  SYSTEM_DEFENSE_PROMPT,
  formatUntrustedAttachment,
  resolveOfficialIdentityAnswer,
} from "../security/promptDefense";
import { TimeService } from "../services/timeService";
import { logger } from "../logger/logger";
import { normalizeModelName } from "../config/providerConfig";
import {
  getOrderedCandidateModels,
  markModelFailure,
  markModelSuccess,
  extractCleanErrorMessage,
} from "./modelHealth";

export class GeminiProvider implements AIProvider {
  public name = "Gemini AI Provider";
  private client: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI | null {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return null;
    }
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey: key });
    }
    return this.client;
  }

  public isAvailable(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  private resolveModelName(selectedModel?: string): string {
    if (!selectedModel) {
      return "gemini-3.8-flash";
    }
    switch (selectedModel.toLowerCase()) {
      case "fast":
        return "gemini-3.8-flash";
      case "advanced":
        return "gemini-3.1-pro-preview";
      case "balanced":
        return "gemini-3.8-flash";
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

      // Untrusted attachments are isolated with explicit boundaries
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
            // Textual attachments formatted inside untrusted delimiter blocks
            parts.push({
              text: formatUntrustedAttachment(att),
            });
          }
        }
      }

      // Add user/assistant message text
      if (msg.content) {
        parts.push({ text: msg.content });
      }

      const role = msg.role === "assistant" ? "model" : "user";
      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    // Tools configuration (Google Search Grounding)
    const tools: any[] = [];
    if (request.webSearch || request.mode === "research") {
      tools.push({ googleSearch: {} });
    }

    // Compose system instruction adhering to Trust Hierarchy
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

    try {
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

        // If tokens were already sent to client, do not switch models mid-stream
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

            // Extract grounded sources
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

          // Mark model success in circuit breaker
          markModelSuccess(cand);

          if (cand !== modelName) {
            logger.info(
              `[GeminiProvider] Engaged resilient fallback model ${cand} (preferred ${modelName}).`,
              { originalModel: modelName, fallbackModel: cand }
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

          // If tokens were ALREADY sent, do not restart to prevent duplicate output
          if (hasSentAnyContent) {
            logger.warn(
              `[GeminiProvider] Model ${cand} failed mid-stream after emitting content.`,
              { model: cand, error: err.message }
            );
            throw new Error("Generation stream was interrupted by provider. Please retry.");
          }

          // If it's a permanent user input error (e.g. bad request 400), don't retry with other models
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
                `[GeminiProvider] Search grounding quota reached; fulfilled stream without search tool using ${cand}.`,
                { model: cand }
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
            `[GeminiProvider] Model ${cand} transiently busy (${err.status || 503} - ${cleanMessage}). Routing to next candidate...`,
            { attemptedModel: cand, status: err.status || 503 }
          );
        }
      }

      if (!streamedSuccessfully && !hasSentAnyContent) {
        throw lastStreamError || new Error("All candidate Gemini models failed.");
      }
    } catch (error: any) {
      logger.error("Gemini provider streaming execution failure:", {
        message: error.message,
        model: modelName,
      });

      // Mask sensitive error messages
      const safeMessage = error.message?.includes("API key")
        ? "AI service credential error. Please verify the server configuration."
        : "Failed to stream AI completion. Please try again.";

      throw new Error(safeMessage);
    }
  }

  public async generateResponse(
    request: ChatCompletionRequest
  ): Promise<{ text: string; sources?: GroundingSource[] }> {
    let fullText = "";
    let collectedSources: GroundingSource[] = [];

    await this.streamResponse(request, (chunk) => {
      if (chunk.text) fullText += chunk.text;
      if (chunk.sources) collectedSources = [...collectedSources, ...chunk.sources];
    });

    return { text: fullText, sources: collectedSources };
  }

  public async generateImage(
    request: ImageGenerationRequest
  ): Promise<ImageGenerationResponse> {
    const ai = this.getClient();
    if (!ai) {
      throw new Error("Server AI credentials are not configured.");
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-image",
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

      throw new Error("The image service returned no image output for this prompt.");
    } catch (error: any) {
      logger.error("Gemini image generation failure:", { message: error.message });
      throw new Error("Image generation failed. Please try a different prompt or aspect ratio.");
    }
  }

  public async analyzeContent(
    request: ContentAnalysisRequest
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

    const response = await this.generateResponse({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      model: "fast",
    });

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
