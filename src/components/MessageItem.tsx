import React, { useState } from "react";
import {
  Copy,
  Check,
  RotateCw,
  Share2,
  ThumbsUp,
  ThumbsDown,
  FileText,
  FileCode,
  File,
  AlertCircle,
  ExternalLink,
  Download,
  BookmarkPlus,
  Globe,
  ChevronLeft,
  ChevronRight,
  ArrowDownRight,
  Volume2,
  Square,
} from "lucide-react";
import { Message } from "../types";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { useMemory } from "../context/MemoryContext";
import { RSRLogo } from "./RSRLogo";
import { NexoraFileCard } from "./NexoraFileCard";

interface MessageItemProps {
  message: Message;
  isLatestAssistant: boolean;
  isGenerating: boolean;
  onRegenerate: () => void;
  onContinue?: () => void;
  onSwitchVersion?: (messageId: string, versionIndex: number) => void;
  onFeedback: (type: "like" | "dislike") => void;
}

const MessageItemComponent: React.FC<MessageItemProps> = ({
  message,
  isLatestAssistant,
  isGenerating,
  onRegenerate,
  onContinue,
  onSwitchVersion,
  onFeedback,
}) => {
  const { addMemory } = useMemory();

  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [savedToMemory, setSavedToMemory] = useState(false);
  const [isSpeakingThis, setIsSpeakingThis] = useState(false);

  const isUser = message.role === "user";
  const isStreamingThis = isLatestAssistant && isGenerating;

  const versions = message.versions || (message.content ? [message.content] : []);
  const currentVersionIdx = message.currentVersionIndex ?? Math.max(0, versions.length - 1);
  const totalVersions = versions.length;

  const handleSpeak = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    if (isSpeakingThis) {
      window.speechSynthesis.cancel();
      setIsSpeakingThis(false);
      return;
    }

    window.speechSynthesis.cancel();

    // Clean text strictly: no markdown syntax, omit code blocks, omit raw URLs
    const clean = message.content
      .replace(/```[\s\S]*?```/g, "Code block omitted.")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/https?:\/\/[^\s]+/g, "link")
      .replace(/[*#_~>]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/<[^>]*>/g, "")
      .trim();

    if (!clean) return;

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.0;
    utterance.onstart = () => setIsSpeakingThis(true);
    utterance.onend = () => setIsSpeakingThis(false);
    utterance.onerror = () => setIsSpeakingThis(false);

    window.speechSynthesis.speak(utterance);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "RSR Nexora Response",
          text: message.content,
        });
      } else {
        await navigator.clipboard.writeText(message.content);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
    } catch {}
  };

  const handleSaveToMemory = () => {
    if (!message.content.trim()) return;
    const excerpt =
      message.content.length > 180
        ? message.content.slice(0, 180) + "..."
        : message.content;
    addMemory(excerpt, "preference");
    setSavedToMemory(true);
    setTimeout(() => setSavedToMemory(false), 2500);
  };

  const handleDownloadImage = (url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `rsr-image-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const renderAttachmentBadge = (att: any) => {
    const isImg = att.fileCategory === "image" || att.mimeType?.startsWith("image/");
    const isPdf = att.fileCategory === "pdf" || att.name.endsWith(".pdf");
    const isCode = att.fileCategory === "code";

    if (isImg && att.dataUrl) {
      return (
        <div
          key={att.id}
          className="rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800/70 p-1 flex items-center gap-2 max-w-[220px]"
        >
          <img
            src={att.dataUrl}
            alt={att.name}
            className="w-10 h-10 object-cover rounded-lg flex-shrink-0"
          />
          <div className="min-w-0 pr-1">
            <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate">
              {att.name}
            </p>
            <p className="text-[10px] text-neutral-500 font-mono">
              {(att.size / 1024).toFixed(0)} KB
            </p>
          </div>
        </div>
      );
    }

    return (
      <div
        key={att.id}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800/70 text-xs text-neutral-800 dark:text-neutral-200 max-w-[260px]"
      >
        {isPdf ? (
          <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
        ) : isCode ? (
          <FileCode className="w-4 h-4 text-emerald-500 flex-shrink-0" />
        ) : (
          <File className="w-4 h-4 text-blue-500 flex-shrink-0" />
        )}
        <div className="min-w-0 truncate">
          <p className="font-medium truncate">{att.name}</p>
          <span className="text-[10px] text-neutral-400 font-mono">
            {(att.size / 1024).toFixed(0)} KB
          </span>
        </div>
      </div>
    );
  };

  // User Message
  if (isUser) {
    return (
      <div className="flex flex-col items-end my-4 animate-in fade-in duration-150 group">
        <div className="max-w-[85%] md:max-w-[75%] rounded-2xl rounded-tr-xs bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-4 py-3 shadow-xs">
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2 pb-2 border-b border-white/20 dark:border-neutral-200">
              {message.attachments.map(renderAttachmentBadge)}
            </div>
          )}
          <div className="text-[15px] whitespace-pre-wrap leading-relaxed select-text">
            {message.content}
          </div>
        </div>

        {/* Timestamp */}
        <div className="mt-1 mr-1 text-[10px] text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    );
  }

  // Assistant Message
  return (
    <div className="flex items-start gap-3 my-6 animate-in fade-in duration-150 group">
      {/* Insignia Avatar */}
      <div className="w-8 h-8 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-xs mt-0.5">
        <span>RSR</span>
      </div>

      <div className="flex-1 min-w-0">
        {/* Header line: Role + Model / Mode info + Branch Version Navigation */}
        <div className="flex items-center justify-between mb-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-800 dark:text-neutral-200">RSR Nexora</span>
            {message.mode && message.mode !== "chat" && (
              <span className="px-1.5 py-0.2 rounded-md text-[10px] uppercase font-mono tracking-wider bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                {message.mode}
              </span>
            )}
          </div>

          {/* Branching Response Switcher (1 / 3) */}
          {totalVersions > 1 && onSwitchVersion && (
            <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800/80 px-2 py-0.5 rounded-lg text-[11px] font-mono select-none">
              <button
                disabled={currentVersionIdx === 0}
                onClick={() => onSwitchVersion(message.id, currentVersionIdx - 1)}
                className="hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed p-0.5"
                title="Previous version"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <span>
                {currentVersionIdx + 1} / {totalVersions}
              </span>
              <button
                disabled={currentVersionIdx === totalVersions - 1}
                onClick={() => onSwitchVersion(message.id, currentVersionIdx + 1)}
                className="hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed p-0.5"
                title="Next version"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Message Content */}
        <div className="text-neutral-800 dark:text-neutral-200 text-[15px] leading-relaxed space-y-3">
          {message.content ? (
            <MarkdownRenderer content={message.content} />
          ) : isStreamingThis ? (
            <div className="flex items-center gap-1.5 py-2">
              <span className="w-2 h-2 rounded-full bg-neutral-400 dark:bg-neutral-600 animate-bounce" />
              <span
                className="w-2 h-2 rounded-full bg-neutral-400 dark:bg-neutral-600 animate-bounce"
                style={{ animationDelay: "150ms" }}
              />
              <span
                className="w-2 h-2 rounded-full bg-neutral-400 dark:bg-neutral-600 animate-bounce"
                style={{ animationDelay: "300ms" }}
              />
            </div>
          ) : (
            <div className="text-neutral-400 italic text-sm">No response received</div>
          )}

          {/* Generated Image Result if attached to message */}
          {message.imageUrl && (
            <div className="mt-3 rounded-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-neutral-950 inline-block max-w-md shadow-md">
              <img
                src={message.imageUrl}
                alt={message.imagePrompt || "Generated image"}
                className="w-full h-auto object-cover max-h-[360px]"
              />
              <div className="p-2.5 bg-white dark:bg-[#181c24] flex items-center justify-between border-t border-neutral-100 dark:border-neutral-800">
                <span className="text-[11px] text-neutral-500 truncate max-w-[200px]">
                  {message.imagePrompt}
                </span>
                <button
                  onClick={() => handleDownloadImage(message.imageUrl!)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
              </div>
            </div>
          )}

          {/* Generated Downloadable File Card if attached to message */}
          {message.generatedFile && (
            <div className="mt-3 max-w-md">
              <NexoraFileCard
                id={message.generatedFile.id}
                filename={message.generatedFile.filename}
                fileType={message.generatedFile.fileType}
                mimeType={message.generatedFile.mimeType}
                sizeBytes={message.generatedFile.sizeBytes}
                downloadUrl={message.generatedFile.downloadUrl}
              />
            </div>
          )}

          {/* Web Search Sources Cards */}
          {message.sources && message.sources.length > 0 && (
            <div className="mt-3.5 pt-3 border-t border-neutral-200/60 dark:border-neutral-800">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                <Globe className="w-3.5 h-3.5 text-blue-500" />
                <span>Web Sources Consulted ({message.sources.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {message.sources.map((source, idx) => {
                  let hostname = "";
                  try {
                    hostname = new URL(source.uri).hostname.replace(/^www\./, "");
                  } catch {
                    hostname = "source";
                  }

                  return (
                    <a
                      key={idx}
                      href={source.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 p-2.5 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-850/60 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200/80 dark:border-neutral-800 transition-colors group/src"
                    >
                      <Globe className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-neutral-800 dark:text-neutral-200 truncate group-hover/src:text-blue-500 transition-colors">
                          {source.title || hostname}
                        </p>
                        <span className="text-[10px] text-neutral-400 truncate block">
                          {hostname}
                        </span>
                      </div>
                      <ExternalLink className="w-3 h-3 text-neutral-400 opacity-0 group-hover/src:opacity-100 transition-opacity flex-shrink-0" />
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* Streaming blinking cursor */}
          {isStreamingThis && message.content && (
            <span className="inline-block w-1.5 h-4 ml-0.5 bg-neutral-500 dark:bg-neutral-400 animate-pulse align-middle" />
          )}

          {/* Error notice */}
          {message.isError && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-500 dark:text-rose-400">
              <AlertCircle className="w-4 h-4" />
              <span>Generation failed. You can retry the request.</span>
            </div>
          )}
        </div>

        {/* Action Bar Under AI Messages */}
        {(!isStreamingThis || message.content.length > 0) && (
          <div className="flex items-center justify-between mt-3 pt-2 text-neutral-400 dark:text-neutral-500">
            <div className="flex items-center gap-1">
              {/* Listen / Voice Output Button */}
              <button
                id={`speak-msg-btn-${message.id}`}
                onClick={handleSpeak}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isSpeakingThis
                    ? "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40"
                    : "hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
                title={isSpeakingThis ? "Stop speaking" : "Read response aloud"}
                aria-label={isSpeakingThis ? "Stop speaking" : "Read response aloud"}
              >
                {isSpeakingThis ? (
                  <Square className="w-4 h-4 fill-current text-purple-600 dark:text-purple-400" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>

              {/* Copy Button */}
              <button
                id={`copy-msg-btn-${message.id}`}
                onClick={handleCopy}
                className="p-1.5 rounded-lg hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                title="Copy response"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>

              {/* Regenerate Button */}
              <button
                id={`regenerate-btn-${message.id}`}
                disabled={isGenerating}
                onClick={onRegenerate}
                className="p-1.5 rounded-lg hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 transition-colors cursor-pointer"
                title="Regenerate alternative response branch"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* Continue Generation Button (if latest assistant) */}
              {isLatestAssistant && !isGenerating && onContinue && message.content && (
                <button
                  id={`continue-btn-${message.id}`}
                  onClick={onContinue}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                  title="Continue response where it stopped"
                >
                  <ArrowDownRight className="w-3.5 h-3.5" />
                  <span>Continue</span>
                </button>
              )}

              {/* Share Button */}
              <button
                id={`share-btn-${message.id}`}
                onClick={handleShare}
                className="p-1.5 rounded-lg hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                title="Share response"
              >
                {shared ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Share2 className="w-4 h-4" />
                )}
              </button>

              {/* Save to Memory */}
              <button
                onClick={handleSaveToMemory}
                className="p-1.5 rounded-lg hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                title="Save to RSR Nexora Memory"
              >
                {savedToMemory ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <BookmarkPlus className="w-4 h-4" />
                )}
              </button>

              {/* Feedback Thumbs Up */}
              <button
                id={`thumb-up-${message.id}`}
                onClick={() => onFeedback("like")}
                className={`p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer ${
                  message.feedback === "like"
                    ? "text-blue-600 dark:text-blue-400 bg-neutral-100 dark:bg-neutral-800"
                    : "hover:text-neutral-800 dark:hover:text-neutral-200"
                }`}
                title="Helpful response"
              >
                <ThumbsUp className="w-4 h-4" />
              </button>

              {/* Feedback Thumbs Down */}
              <button
                id={`thumb-down-${message.id}`}
                onClick={() => onFeedback("dislike")}
                className={`p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer ${
                  message.feedback === "dislike"
                    ? "text-rose-600 dark:text-rose-400 bg-neutral-100 dark:bg-neutral-800"
                    : "hover:text-neutral-800 dark:hover:text-neutral-200"
                }`}
                title="Not helpful"
              >
                <ThumbsDown className="w-4 h-4" />
              </button>
            </div>

            {/* Timestamp */}
            <span className="text-[10px] text-neutral-400">
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export const MessageItem = React.memo(MessageItemComponent, (prev, next) => {
  // If message reference changed (e.g. streaming update, feedback, version switch)
  if (prev.message !== next.message) return false;
  // If role or index position changed
  if (prev.isLatestAssistant !== next.isLatestAssistant) return false;
  // Only the latest assistant message cares about isGenerating state changes
  if (prev.isLatestAssistant && prev.isGenerating !== next.isGenerating) return false;
  return true;
});
