/**
 * RSR Nexora - AI Provider Adapter Interface
 * Common abstraction contract for all 10 provider slots.
 */

import {
  ChatCompletionRequest,
  ChatStreamChunk,
  GroundingSource,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ContentAnalysisRequest,
  ContentAnalysisResponse,
} from "../types";

export interface AIProviderAdapter {
  readonly slotId: string;
  readonly providerName: string;
  readonly model: string;

  isAvailable(): boolean;

  streamResponse(
    request: ChatCompletionRequest,
    onChunk: (chunk: ChatStreamChunk) => void,
    signal?: AbortSignal
  ): Promise<void>;

  generateResponse(
    request: ChatCompletionRequest,
    signal?: AbortSignal
  ): Promise<{ text: string; sources?: GroundingSource[] }>;

  generateImage?(
    request: ImageGenerationRequest,
    signal?: AbortSignal
  ): Promise<ImageGenerationResponse>;

  analyzeContent?(
    request: ContentAnalysisRequest,
    signal?: AbortSignal
  ): Promise<ContentAnalysisResponse>;

  healthCheck?(): Promise<boolean>;
}
