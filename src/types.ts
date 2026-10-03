export type ThemeMode = "light" | "dark" | "system";

export type MessageRole = "user" | "assistant";

export type ModelTier = "fast" | "balanced" | "advanced";

export type SmartMode =
  | "chat"
  | "research"
  | "coding"
  | "writing"
  | "image"
  | "voice"
  | "filemaker"
  | "document";

export interface ModelOption {
  id: string;
  name: string;
  tier: ModelTier;
  description: string;
  isAvailable: boolean;
  supportsVision?: boolean;
  supportsWebSearch?: boolean;
}

export interface GroundingSource {
  title: string;
  uri: string;
  snippet?: string;
  domain?: string;
}

export type FileCategory = "image" | "pdf" | "code" | "text" | "other";

export interface MessageAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
  textContent?: string;
  mimeType: string;
  fileCategory: FileCategory;
  headings?: string[];
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  attachments?: MessageAttachment[];
  sources?: GroundingSource[];
  imageUrl?: string;
  imagePrompt?: string;
  imageAspectRatio?: string;
  feedback?: "like" | "dislike" | null;
  isError?: boolean;
  status?: "streaming" | "complete" | "error";
  mode?: SmartMode;
  generatedFile?: {
    id: string;
    filename: string;
    fileType: string;
    mimeType: string;
    sizeBytes: number;
    downloadUrl: string;
  };
  // Branching support: alternate generated responses
  versions?: string[];
  currentVersionIndex?: number;
}

export interface WorkspaceFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  fileCategory: FileCategory;
  textContent?: string;
  dataUrl?: string;
  createdAt: number;
}

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  icon: string;
  color?: string;
  customInstructions?: string;
  files: WorkspaceFile[];
  createdAt: number;
  updatedAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  modelTier?: ModelTier;
  workspaceId?: string | null;
  isPinned?: boolean;
  isFavorite?: boolean;
  isArchived?: boolean;
  mode?: SmartMode;
}

export type MemoryCategory = "preference" | "context" | "instruction" | "workspace" | "other";

export interface MemoryItem {
  id: string;
  content: string;
  category: MemoryCategory;
  workspaceId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  aspectRatio: string;
  createdAt: number;
}

export interface UserProfile {
  id: string;
  email?: string;
  name: string;
  isGuest: boolean;
  avatarUrl?: string;
  syncEnabled: boolean;
  createdAt: number;
}

export interface AppSettings {
  theme: ThemeMode;
  systemInstruction: string;
  temperature: number;
  streamResponse: boolean;
  fontSize: "compact" | "normal" | "relaxed";
  selectedModel: ModelTier;
  webSearchEnabled: boolean;
  voiceEnabled: boolean;
  voiceSpeed: number;
  voicePitch: number;
  voiceAutoplay: boolean;
  voiceLanguage?: string;
  voiceName?: string;
  voiceConversationMode?: boolean;
  memoryEnabled: boolean;
  activeMode: SmartMode;
}

export interface GlobalSearchResult {
  id: string;
  type: "conversation" | "message" | "file" | "workspace";
  title: string;
  subtitle: string;
  previewSnippet?: string;
  conversationId?: string;
  workspaceId?: string;
}
