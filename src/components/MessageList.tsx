import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { ArrowDown, History, ChevronUp } from "lucide-react";
import { Message } from "../types";
import { MessageItem } from "./MessageItem";
import { HomeExperience } from "./HomeExperience";

interface MessageListProps {
  messages: Message[];
  isGenerating: boolean;
  onRegenerate: (messageId: string) => void;
  onContinue?: (messageId: string) => void;
  onSwitchVersion?: (messageId: string, versionIndex: number) => void;
  onFeedback: (messageId: string, feedback: "like" | "dislike") => void;
  onSelectPrompt: (prompt: string) => void;
  onOpenVoiceModal: () => void;
  onOpenImageModal: () => void;
  onOpenFileMakerModal?: () => void;
  onTriggerFileUpload: () => void;
}

// Memoized single message container with stable handler bindings
const MemoizedMessageRow = React.memo<{
  message: Message;
  isLatestAssistant: boolean;
  isGenerating: boolean;
  onRegenerate: (messageId: string) => void;
  onContinue?: (messageId: string) => void;
  onSwitchVersion?: (messageId: string, versionIndex: number) => void;
  onFeedback: (messageId: string, feedback: "like" | "dislike") => void;
}>(({
  message,
  isLatestAssistant,
  isGenerating,
  onRegenerate,
  onContinue,
  onSwitchVersion,
  onFeedback,
}) => {
  const handleRegenerate = useCallback(() => {
    onRegenerate(message.id);
  }, [onRegenerate, message.id]);

  const handleContinue = useCallback(() => {
    onContinue?.(message.id);
  }, [onContinue, message.id]);

  const handleFeedback = useCallback((type: "like" | "dislike") => {
    onFeedback(message.id, type);
  }, [onFeedback, message.id]);

  return (
    <MessageItem
      message={message}
      isLatestAssistant={isLatestAssistant}
      isGenerating={isGenerating}
      onRegenerate={handleRegenerate}
      onContinue={onContinue ? handleContinue : undefined}
      onSwitchVersion={onSwitchVersion}
      onFeedback={handleFeedback}
    />
  );
});

MemoizedMessageRow.displayName = "MemoizedMessageRow";

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isGenerating,
  onRegenerate,
  onContinue,
  onSwitchVersion,
  onFeedback,
  onSelectPrompt,
  onOpenVoiceModal,
  onOpenImageModal,
  onOpenFileMakerModal,
  onTriggerFileUpload,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  
  // Virtualized slice window for very large conversations (> 50 messages)
  const INITIAL_WINDOW_SIZE = 50;
  const [visibleCount, setVisibleCount] = useState<number>(INITIAL_WINDOW_SIZE);

  // If messages count shrinks (new chat or deletion), reset visible window
  useEffect(() => {
    if (messages.length <= INITIAL_WINDOW_SIZE) {
      setVisibleCount(INITIAL_WINDOW_SIZE);
    }
  }, [messages.length]);

  const hasHiddenOlder = messages.length > visibleCount;
  const hiddenCount = Math.max(0, messages.length - visibleCount);

  // Active slice of messages to render
  const visibleMessages = useMemo(() => {
    if (!hasHiddenOlder) return messages;
    return messages.slice(messages.length - visibleCount);
  }, [messages, hasHiddenOlder, visibleCount]);

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(messages.length, prev + 50));
  }, [messages.length]);

  const handleLoadAll = useCallback(() => {
    setVisibleCount(messages.length);
  }, [messages.length]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  // Auto-scroll when messages change or while streaming
  useEffect(() => {
    if (!showScrollBottom) {
      scrollToBottom(isGenerating ? "auto" : "smooth");
    }
  }, [messages, isGenerating, showScrollBottom, scrollToBottom]);

  // Handle scroll detection to show/hide "Scroll to bottom" floating button
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setShowScrollBottom(distanceFromBottom > 160);

    // Auto-reveal older messages when scrolling near the top
    if (scrollTop < 80 && hasHiddenOlder) {
      setVisibleCount((prev) => Math.min(messages.length, prev + 25));
    }
  }, [hasHiddenOlder, messages.length]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-4 md:px-8 relative"
    >
      <div className="max-w-3xl mx-auto min-h-full flex flex-col justify-between">
        {messages.length === 0 ? (
          // RSR Nexora Home Experience
          <HomeExperience
            onSelectPrompt={onSelectPrompt}
            onOpenVoiceModal={onOpenVoiceModal}
            onOpenImageModal={onOpenImageModal}
            onOpenFileMakerModal={onOpenFileMakerModal}
            onTriggerFileUpload={onTriggerFileUpload}
          />
        ) : (
          // Conversation messages
          <div className="w-full pb-2">
            {/* Windowed load banner for 50+ message histories */}
            {hasHiddenOlder && (
              <div className="py-2.5 mb-4 text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-600 dark:text-neutral-400">
                  <History className="w-3.5 h-3.5 text-neutral-500" />
                  <span>{hiddenCount} earlier messages hidden for performance</span>
                  <button
                    onClick={handleLoadMore}
                    className="ml-1 text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
                  >
                    Load 50 more
                  </button>
                  <span className="text-neutral-300 dark:text-neutral-600">•</span>
                  <button
                    onClick={handleLoadAll}
                    className="text-neutral-700 dark:text-neutral-300 hover:underline font-medium cursor-pointer"
                  >
                    Show all
                  </button>
                </div>
              </div>
            )}

            {visibleMessages.map((message, index) => {
              const isLatestAssistant =
                message.role === "assistant" &&
                index === visibleMessages.length - 1 &&
                (!hasHiddenOlder || visibleMessages.length === messages.length);

              return (
                <MemoizedMessageRow
                  key={message.id}
                  message={message}
                  isLatestAssistant={isLatestAssistant}
                  isGenerating={isGenerating}
                  onRegenerate={onRegenerate}
                  onContinue={onContinue}
                  onSwitchVersion={onSwitchVersion}
                  onFeedback={onFeedback}
                />
              );
            })}
          </div>
        )}

        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Floating Scroll to Bottom Button */}
      {showScrollBottom && (
        <button
          id="scroll-to-bottom-btn"
          onClick={() => scrollToBottom("smooth")}
          className="fixed bottom-28 right-6 md:right-10 z-20 p-2.5 rounded-full bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 shadow-md hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-all cursor-pointer"
          title="Scroll to latest message"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
