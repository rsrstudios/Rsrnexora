import React, { useRef, useState, useEffect, useImperativeHandle, forwardRef } from "react";
import {
  ArrowUp,
  Paperclip,
  Mic,
  Square,
  X,
  FileText,
  FileCode,
  File,
  Sparkles,
  Globe,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { MessageAttachment } from "../types";
import { processUploadFile } from "../utils/fileUtils";
import { useChat } from "../context/ChatContext";
import { DocumentContextBadge } from "./DocumentContextBadge";

export interface MessageComposerHandle {
  triggerFileInput: () => void;
  setPromptContent: (text: string) => void;
}

interface MessageComposerProps {
  onSend: (content: string, attachments?: MessageAttachment[]) => void;
  isGenerating: boolean;
  onStop: () => void;
  initialPrompt?: string;
  onClearInitialPrompt?: () => void;
  onOpenVoiceModal: () => void;
  onOpenImageModal: () => void;
}

export const MessageComposer = forwardRef<MessageComposerHandle, MessageComposerProps>(
  (
    {
      onSend,
      isGenerating,
      onStop,
      initialPrompt,
      onClearInitialPrompt,
      onOpenVoiceModal,
      onOpenImageModal,
    },
    ref
  ) => {
    const { settings, updateSettings, activeMode } = useChat();

    const [content, setContent] = useState("");
    const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
    const [isProcessingFiles, setIsProcessingFiles] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      triggerFileInput: () => {
        fileInputRef.current?.click();
      },
      setPromptContent: (text: string) => {
        setContent(text);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            adjustHeight();
          }
        }, 50);
      },
    }));

    useEffect(() => {
      if (initialPrompt) {
        setContent(initialPrompt);
        if (onClearInitialPrompt) onClearInitialPrompt();
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            adjustHeight();
          }
        }, 50);
      }
    }, [initialPrompt, onClearInitialPrompt]);

    const adjustHeight = () => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.style.height = "auto";
      const maxHeight = 200;
      const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${nextHeight}px`;
    };

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setContent(e.target.value);
      adjustHeight();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    };

    const handleSubmit = () => {
      if (isGenerating || isProcessingFiles) return;
      const trimmed = content.trim();
      if (!trimmed && attachments.length === 0) return;

      onSend(trimmed, attachments);
      setContent("");
      setAttachments([]);
      setErrorMessage(null);

      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    };

    const handleFiles = async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;

      setErrorMessage(null);
      setIsProcessingFiles(true);

      try {
        const processed: MessageAttachment[] = [];
        for (const file of Array.from(fileList)) {
          const att = await processUploadFile(file);
          processed.push(att);
        }
        setAttachments((prev) => [...prev, ...processed]);
      } catch (err: any) {
        setErrorMessage(err.message || "Failed to process attached files.");
      } finally {
        setIsProcessingFiles(false);
      }
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files) {
        handleFiles(e.dataTransfer.files);
      }
    };

    const removeAttachment = (id: string) => {
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    };

    const canSend = (content.trim().length > 0 || attachments.length > 0) && !isGenerating;

    return (
      <div className="w-full max-w-3xl mx-auto px-4 pb-4 md:pb-6 relative">
        {/* Document Intelligence Context Badge */}
        {attachments.length > 0 && (
          <DocumentContextBadge
            attachments={attachments}
            onQuickPrompt={(promptText) => {
              setContent(promptText);
              if (textareaRef.current) {
                textareaRef.current.focus();
                adjustHeight();
              }
            }}
          />
        )}

        {/* Error message banner */}
        {errorMessage && (
          <div className="mb-2 p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-600 dark:text-rose-400 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Composer Card */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative rounded-3xl border transition-all duration-200 shadow-sm ${
            isDragging
              ? "border-blue-500 bg-blue-50/20 dark:bg-blue-950/20 ring-2 ring-blue-500/20"
              : "border-neutral-200/90 dark:border-neutral-800/90 bg-neutral-50/80 dark:bg-[#151921]/80 hover:border-neutral-300 dark:hover:border-neutral-700"
          } backdrop-blur-md`}
        >
          {/* Attachment Previews */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pt-3">
              {attachments.map((att) => {
                const isImg = att.fileCategory === "image" || att.mimeType.startsWith("image/");
                const isPdf = att.fileCategory === "pdf" || att.name.endsWith(".pdf");
                const isCode = att.fileCategory === "code";

                return (
                  <div
                    key={att.id}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs bg-white dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700/80 text-neutral-800 dark:text-neutral-200 shadow-2xs"
                  >
                    {isImg && att.dataUrl ? (
                      <img
                        src={att.dataUrl}
                        alt={att.name}
                        className="w-5 h-5 object-cover rounded-sm flex-shrink-0"
                      />
                    ) : isPdf ? (
                      <FileText className="w-4 h-4 text-rose-500 flex-shrink-0" />
                    ) : isCode ? (
                      <FileCode className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    ) : (
                      <File className="w-4 h-4 text-neutral-500 flex-shrink-0" />
                    )}
                    <span className="max-w-[130px] truncate">{att.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.id)}
                      className="p-0.5 ml-0.5 rounded-sm hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}

              {isProcessingFiles && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/60 dark:bg-neutral-800/60 text-xs text-neutral-500 animate-pulse">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                  <span>Processing attachment...</span>
                </div>
              )}
            </div>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            id="composer-textarea"
            value={content}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={
              activeMode === "coding"
                ? "Ask code architecture, debugging, or optimization questions..."
                : activeMode === "research"
                ? "Search verified web sources, analyze current topics..."
                : activeMode === "writing"
                ? "Draft executive memos, polish text, or structure essays..."
                : activeMode === "image"
                ? "Describe an image to generate with AI..."
                : "Ask RSR Nexora anything, drop files, or synthesize ideas..."
            }
            rows={1}
            className="w-full px-4 pt-3.5 pb-2 text-[15px] bg-transparent text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-hidden resize-none leading-relaxed min-h-[48px]"
          />

          {/* Action Buttons Bar */}
          <div className="flex items-center justify-between px-3 pb-3 pt-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.txt,.md,.json,.js,.ts,.tsx,.jsx,.html,.css,.py"
                onChange={handleFileInputChange}
                className="hidden"
                id="composer-file-input"
              />

              {/* Attachment Trigger */}
              <button
                id="composer-attachment-btn"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 rounded-xl text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/80 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500 focus:outline-none transition-colors cursor-pointer"
                title="Attach files (Images, PDFs, Documents, Code)"
                aria-label="Attach files"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              {/* Web Search Toggle */}
              <button
                id="composer-web-search-toggle"
                type="button"
                onClick={() =>
                  updateSettings({ webSearchEnabled: !settings.webSearchEnabled })
                }
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium transition-colors cursor-pointer border focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500 focus:outline-none ${
                  settings.webSearchEnabled || activeMode === "research"
                    ? "bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30 font-semibold"
                    : "bg-transparent text-neutral-500 dark:text-neutral-400 border-transparent hover:bg-neutral-200/60 dark:hover:bg-neutral-800/60"
                }`}
                title="Toggle Google Web Search Grounding"
                aria-label="Toggle Google Web Search Grounding"
              >
                <Globe className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Web Search</span>
              </button>

              {/* AI Image Generation Trigger */}
              <button
                id="composer-image-btn"
                type="button"
                onClick={onOpenImageModal}
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500 focus:outline-none transition-colors cursor-pointer"
                title="Generate AI Image with Gemini"
                aria-label="Generate AI Image with Gemini"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                <span className="hidden sm:inline">Image</span>
              </button>

              {/* Voice Mode Trigger */}
              <button
                id="composer-voice-mode-btn"
                type="button"
                onClick={onOpenVoiceModal}
                className="p-2 rounded-xl text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/80 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500 focus:outline-none transition-colors cursor-pointer"
                title="Open Voice Conversation Mode"
                aria-label="Open Voice Conversation Mode"
              >
                <Mic className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {/* Stop Generating Button */}
              {isGenerating ? (
                <button
                  id="composer-stop-btn"
                  type="button"
                  onClick={onStop}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium text-xs hover:bg-neutral-800 dark:hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500 focus:outline-none transition-colors shadow-2xs cursor-pointer"
                  title="Stop generating"
                  aria-label="Stop generating response"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop</span>
                </button>
              ) : (
                /* Send Button */
                <button
                  id="composer-send-btn"
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSend}
                  className="p-2.5 rounded-2xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-800 dark:hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500 focus:outline-none transition-all shadow-2xs cursor-pointer"
                  title="Send message"
                  aria-label="Send message"
                >
                  <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="text-center mt-2 flex items-center justify-center gap-2">
          <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
            RSR Nexora Intelligence • Confidential & Local-First
          </span>
        </div>
      </div>
    );
  }
);
