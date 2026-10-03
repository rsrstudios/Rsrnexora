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
import { GeminiProvider } from "./geminiProvider";
import { aiOrchestrator, AIOrchestrator } from "./aiOrchestrator";

class AIService {
  private providers: Map<string, AIProvider> = new Map();
  private defaultProviderName: string = "gemini";
  public readonly orchestrator: AIOrchestrator = aiOrchestrator;

  constructor() {
    this.registerProvider("gemini", new GeminiProvider());
  }

  public registerProvider(key: string, provider: AIProvider): void {
    this.providers.set(key.toLowerCase(), provider);
  }

  public getProvider(key?: string): AIProvider {
    const requested = key?.toLowerCase() || this.defaultProviderName;
    const provider = this.providers.get(requested);
    if (!provider) {
      const fallback = this.providers.get(this.defaultProviderName);
      if (!fallback) {
        throw new Error("No AI provider available.");
      }
      return fallback;
    }
    return provider;
  }

  public getAvailableModels(): Array<{
    id: string;
    name: string;
    tier: "fast" | "balanced" | "advanced";
    description: string;
    isAvailable: boolean;
    supportsVision: boolean;
    supportsWebSearch: boolean;
  }> {
    return this.orchestrator.getAvailableModels();
  }

  public async streamResponse(
    request: ChatCompletionRequest,
    onChunk: (chunk: ChatStreamChunk) => void,
    signal?: AbortSignal
  ): Promise<void> {
    await this.orchestrator.streamResponse(request, onChunk, signal);
  }

  public async generateResponse(
    request: ChatCompletionRequest,
    signal?: AbortSignal
  ): Promise<{ text: string; sources?: GroundingSource[] }> {
    return await this.orchestrator.generateResponse(request, signal);
  }

  public async generateImage(
    request: ImageGenerationRequest
  ): Promise<ImageGenerationResponse> {
    return await this.orchestrator.generateImage(request);
  }

  public async analyzeContent(
    request: ContentAnalysisRequest
  ): Promise<ContentAnalysisResponse> {
    return await this.orchestrator.analyzeContent(request);
  }
}

export const aiService = new AIService();

