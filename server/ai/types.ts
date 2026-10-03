export interface ChatAttachment {
  name: string;
  mimeType: string;
  dataUrl?: string;
  textContent?: string;
  size?: number;
}

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant" | "model";
  content: string;
  attachments?: ChatAttachment[];
}

export interface GroundingSource {
  title: string;
  uri: string;
  domain?: string;
}

export interface ChatStreamChunk {
  text?: string;
  sources?: GroundingSource[];
  error?: {
    code: string;
    message: string;
  };
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  systemInstruction?: string;
  temperature?: number;
  model?: string;
  webSearch?: boolean;
  mode?: string;
  timezone?: string;
  userProfile?: {
    name?: string;
    tier?: string;
    email?: string;
  };
}

export interface ImageGenerationRequest {
  prompt: string;
  aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
}

export interface ImageGenerationResponse {
  imageUrl: string;
  prompt: string;
  aspectRatio?: string;
  provider: string;
}

export interface ContentAnalysisRequest {
  content: string;
  instruction: string;
  mimeType?: string;
}

export interface ContentAnalysisResponse {
  summary: string;
  keyPoints: string[];
  suggestedActions: string[];
}

export interface AIProvider {
  name: string;
  isAvailable(): boolean;
  streamResponse(
    request: ChatCompletionRequest,
    onChunk: (chunk: ChatStreamChunk) => void,
    signal?: AbortSignal
  ): Promise<void>;
  generateResponse(request: ChatCompletionRequest): Promise<{ text: string; sources?: GroundingSource[] }>;
  generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse>;
  analyzeContent(request: ContentAnalysisRequest): Promise<ContentAnalysisResponse>;
}
