import React, { useState, useEffect, useMemo, useRef } from "react";
import { Search, X, MessageSquare, FileText, Folder, ArrowRight } from "lucide-react";
import { useChat } from "../context/ChatContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { GlobalSearchResult } from "../types";

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ isOpen, onClose }) => {
  const { conversations, selectConversation } = useChat();
  const { workspaces, setActiveWorkspaceId } = useWorkspace();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const results: GlobalSearchResult[] = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];

    const found: GlobalSearchResult[] = [];

    // Search Workspaces
    workspaces.forEach((ws) => {
      if (ws.name.toLowerCase().includes(trimmed) || ws.description?.toLowerCase().includes(trimmed)) {
        found.push({
          id: `ws-${ws.id}`,
          type: "workspace",
          title: ws.name,
          subtitle: ws.description || "Workspace",
          workspaceId: ws.id,
        });
      }

      // Search Workspace Files
      ws.files?.forEach((f) => {
        if (f.name.toLowerCase().includes(trimmed)) {
          found.push({
            id: `file-${f.id}`,
            type: "file",
            title: f.name,
            subtitle: `File in ${ws.name}`,
            workspaceId: ws.id,
          });
        }
      });
    });

    // Search Conversations & Messages
    conversations.forEach((conv) => {
      if (conv.title.toLowerCase().includes(trimmed)) {
        found.push({
          id: `conv-${conv.id}`,
          type: "conversation",
          title: conv.title,
          subtitle: `Conversation • ${conv.messages?.length || 0} messages`,
          conversationId: conv.id,
        });
      }

      // Check messages
      conv.messages?.forEach((msg) => {
        const text = msg.content.toLowerCase();
        const matchIdx = text.indexOf(trimmed);
        if (matchIdx !== -1) {
          const start = Math.max(0, matchIdx - 30);
          const end = Math.min(msg.content.length, matchIdx + trimmed.length + 40);
          const snippet = (start > 0 ? "..." : "") + msg.content.slice(start, end) + (end < msg.content.length ? "..." : "");

          found.push({
            id: `msg-${msg.id}`,
            type: "message",
            title: conv.title,
            subtitle: `${msg.role === "user" ? "You" : "RSR Nexora"} message`,
            previewSnippet: snippet,
            conversationId: conv.id,
          });
        }
      });
    });

    return found.slice(0, 20);
  }, [query, conversations, workspaces]);

  if (!isOpen) return null;

  const handleSelect = (item: GlobalSearchResult) => {
    if (item.conversationId) {
      selectConversation(item.conversationId);
    }
    if (item.workspaceId) {
      setActiveWorkspaceId(item.workspaceId);
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  const getIcon = (type: GlobalSearchResult["type"]) => {
    switch (type) {
      case "conversation":
        return <MessageSquare className="w-3.5 h-3.5 text-blue-500" />;
      case "message":
        return <MessageSquare className="w-3.5 h-3.5 text-neutral-400" />;
      case "file":
        return <FileText className="w-3.5 h-3.5 text-amber-500" />;
      case "workspace":
        return <Folder className="w-3.5 h-3.5 text-purple-500" />;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="global-search-title"
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl flex flex-col rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#11141a] text-neutral-900 dark:text-neutral-100 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-neutral-200 dark:border-neutral-800">
          <Search className="w-4 h-4 text-neutral-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search conversations, messages, files, and workspaces..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 text-sm bg-transparent border-0 focus:outline-hidden text-neutral-900 dark:text-neutral-100 placeholder-neutral-400"
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded-sm border border-neutral-200 dark:border-neutral-700 text-neutral-400 font-mono">
              ESC
            </span>
          )}
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2">
          {query.trim() && results.length === 0 && (
            <div className="py-8 text-center text-xs text-neutral-500 dark:text-neutral-400">
              No results found for "{query}".
            </div>
          )}

          {!query.trim() && (
            <div className="py-8 text-center text-xs text-neutral-400">
              Type keywords to search across all conversations, files, and workspaces.
            </div>
          )}

          {results.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={item.id}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`flex items-start gap-3 p-2.5 rounded-xl cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    : "hover:bg-neutral-50 dark:hover:bg-neutral-850 text-neutral-700 dark:text-neutral-300"
                }`}
              >
                <div className="mt-0.5">{getIcon(item.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold truncate">{item.title}</span>
                    <span className="text-[10px] text-neutral-400 capitalize">{item.type}</span>
                  </div>
                  {item.previewSnippet ? (
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-1 font-mono mt-0.5">
                      {item.previewSnippet}
                    </p>
                  ) : (
                    <p className="text-[11px] text-neutral-400 mt-0.5">{item.subtitle}</p>
                  )}
                </div>
                {isSelected && (
                  <ArrowRight className="w-3.5 h-3.5 text-neutral-400 self-center" />
                )}
              </div>
            );
          })}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-neutral-50 dark:bg-neutral-900/60 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-[11px] text-neutral-400">
          <span>Use ↑↓ to navigate, Enter to select</span>
          <span>{results.length} results</span>
        </div>
      </div>
    </div>
  );
};
