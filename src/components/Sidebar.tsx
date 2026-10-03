import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Plus,
  Search,
  MessageSquare,
  MoreVertical,
  Edit2,
  Trash2,
  Check,
  X,
  Settings,
  SidebarClose,
  Download,
  FileText,
  Pin,
  Star,
  Archive,
  Folder,
  ShieldCheck,
  Zap,
  Scale,
  Sparkles,
  ChevronDown,
  Crown,
} from "lucide-react";
import { useChat } from "../context/ChatContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { Conversation, ModelTier } from "../types";
import { ConfirmModal } from "./ConfirmModal";
import { exportToTxt, exportToMarkdown, exportToPdf } from "../utils/exportUtils";
import { DailyUsageIndicator } from "./DailyUsageIndicator";

interface SidebarProps {
  isOpen: boolean;
  onCloseMobile: () => void;
  onOpenSettings: () => void;
  onOpenDataPrivacy: () => void;
  onOpenGlobalSearch: () => void;
}

const SidebarComponent: React.FC<SidebarProps> = ({
  isOpen,
  onCloseMobile,
  onOpenSettings,
  onOpenDataPrivacy,
  onOpenGlobalSearch,
}) => {
  const {
    conversations,
    currentConversationId,
    selectConversation,
    createNewChat,
    renameConversation,
    deleteConversation,
    clearAllConversations,
    togglePinConversation,
    toggleFavoriteConversation,
    toggleArchiveConversation,
    isGenerating,
  } = useChat();

  const { activeWorkspace, openWorkspaceModal } = useWorkspace();

  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    if (menuOpenId) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpenId]);

  // Filter conversations for the current workspace
  const workspaceConversations = useMemo(() => {
    return conversations.filter(
      (c) => !c.workspaceId || c.workspaceId === activeWorkspace.id
    );
  }, [conversations, activeWorkspace.id]);

  // Filter by search query and archive state
  const filteredConversations = useMemo(() => {
    let list = workspaceConversations;

    if (!showArchived) {
      list = list.filter((c) => !c.isArchived);
    } else {
      list = list.filter((c) => c.isArchived);
    }

    if (!searchQuery.trim()) return list;
    const query = searchQuery.toLowerCase();
    return list.filter(
      (c) =>
        c.title.toLowerCase().includes(query) ||
        c.messages.some((m) => m.content.toLowerCase().includes(query))
    );
  }, [workspaceConversations, searchQuery, showArchived]);

  // Separate pinned vs standard
  const pinnedConversations = useMemo(() => {
    return filteredConversations.filter((c) => c.isPinned);
  }, [filteredConversations]);

  const unpinnedConversations = useMemo(() => {
    return filteredConversations.filter((c) => !c.isPinned);
  }, [filteredConversations]);

  // Group unpinned conversations by time periods
  const grouped = useMemo(() => {
    const today: Conversation[] = [];
    const yesterday: Conversation[] = [];
    const last7Days: Conversation[] = [];
    const older: Conversation[] = [];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;
    const startOf7Days = startOfToday - 7 * 86400000;

    for (const conv of unpinnedConversations) {
      const time = conv.updatedAt || conv.createdAt;
      if (time >= startOfToday) {
        today.push(conv);
      } else if (time >= startOfYesterday) {
        yesterday.push(conv);
      } else if (time >= startOf7Days) {
        last7Days.push(conv);
      } else {
        older.push(conv);
      }
    }

    return [
      { label: "Today", items: today },
      { label: "Yesterday", items: yesterday },
      { label: "Previous 7 Days", items: last7Days },
      { label: "Older", items: older },
    ].filter((group) => group.items.length > 0);
  }, [unpinnedConversations]);

  const handleStartRename = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitle(conv.title);
    setMenuOpenId(null);
  };

  const handleSaveRename = (id: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    renameConversation(id, editTitle);
    setEditingId(null);
  };

  const handleCancelRename = () => {
    setEditingId(null);
  };

  const handleNewChat = () => {
    createNewChat();
    onCloseMobile();
  };

  const handleSelectConv = (id: string) => {
    selectConversation(id);
    onCloseMobile();
  };

  const renderTierIcon = (tier?: ModelTier) => {
    switch (tier) {
      case "fast":
        return <Zap className="w-2.5 h-2.5 text-amber-500" />;
      case "advanced":
        return <Sparkles className="w-2.5 h-2.5 text-purple-500" />;
      default:
        return <Scale className="w-2.5 h-2.5 text-blue-500" />;
    }
  };

  const renderConvItem = (conv: Conversation) => {
    const isSelected = conv.id === currentConversationId;
    const isEditing = conv.id === editingId;
    const isMenuOpen = conv.id === menuOpenId;

    if (isEditing) {
      return (
        <form
          key={conv.id}
          onSubmit={(e) => handleSaveRename(conv.id, e)}
          className="flex items-center gap-1 px-2 py-1 bg-white dark:bg-[#1a1e27] rounded-xl border border-neutral-300 dark:border-neutral-700"
        >
          <input
            autoFocus
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") handleCancelRename();
            }}
            className="flex-1 text-xs bg-transparent text-neutral-900 dark:text-neutral-100 focus:outline-hidden px-1 py-0.5"
          />
          <button
            type="submit"
            className="p-1 text-emerald-500 hover:text-emerald-600 rounded-sm cursor-pointer"
            title="Save"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleCancelRename}
            className="p-1 text-neutral-400 hover:text-neutral-600 rounded-sm cursor-pointer"
            title="Cancel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </form>
      );
    }

    return (
      <div
        key={conv.id}
        id={`conv-item-${conv.id}`}
        onClick={() => handleSelectConv(conv.id)}
        className={`group relative flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 cursor-pointer ${
          isSelected
            ? "bg-white dark:bg-[#181c24] text-neutral-900 dark:text-neutral-100 border border-neutral-200/90 dark:border-neutral-750 shadow-2xs"
            : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/50 dark:hover:bg-[#141720] hover:text-neutral-900 dark:hover:text-neutral-200 border border-transparent"
        }`}
      >
        <div className="flex items-center gap-2 truncate pr-2 flex-1">
          {conv.isPinned ? (
            <Pin className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
          ) : conv.isFavorite ? (
            <Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          ) : (
            <MessageSquare className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500 flex-shrink-0" />
          )}

          <span className="truncate">{conv.title}</span>
          {renderTierIcon(conv.modelTier)}
        </div>

        {/* Options Context Menu Trigger */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpenId(isMenuOpen ? null : conv.id);
            }}
            className={`p-1 rounded-lg transition-opacity ${
              isMenuOpen
                ? "opacity-100 bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-white"
                : "opacity-0 group-hover:opacity-100 hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
            }`}
            title="Conversation Options"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Context Menu Dropdown */}
        {isMenuOpen && (
          <div
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
            className="absolute right-2 top-8 z-50 w-44 py-1.5 rounded-xl bg-white dark:bg-[#1c212c] border border-neutral-200 dark:border-neutral-800 shadow-xl text-xs text-neutral-700 dark:text-neutral-300 animate-in fade-in duration-100"
          >
            {/* Pin Toggle */}
            <button
              onClick={() => {
                togglePinConversation(conv.id);
                setMenuOpenId(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left transition-colors cursor-pointer"
            >
              <Pin className="w-3.5 h-3.5 text-blue-500" />
              <span>{conv.isPinned ? "Unpin Chat" : "Pin to Top"}</span>
            </button>

            {/* Favorite Toggle */}
            <button
              onClick={() => {
                toggleFavoriteConversation(conv.id);
                setMenuOpenId(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left transition-colors cursor-pointer"
            >
              <Star className="w-3.5 h-3.5 text-amber-500" />
              <span>{conv.isFavorite ? "Remove Favorite" : "Favorite Chat"}</span>
            </button>

            {/* Archive Toggle */}
            <button
              onClick={() => {
                toggleArchiveConversation(conv.id);
                setMenuOpenId(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left transition-colors cursor-pointer"
            >
              <Archive className="w-3.5 h-3.5 text-neutral-400" />
              <span>{conv.isArchived ? "Unarchive Chat" : "Archive Chat"}</span>
            </button>

            <div className="my-1 border-t border-neutral-100 dark:border-neutral-800/80" />

            {/* Rename */}
            <button
              onClick={(e) => handleStartRename(conv, e)}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left transition-colors cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Rename</span>
            </button>

            {/* Exports */}
            <button
              onClick={() => {
                exportToMarkdown(conv);
                setMenuOpenId(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export Markdown</span>
            </button>

            <button
              onClick={() => {
                exportToPdf(conv);
                setMenuOpenId(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Text</span>
            </button>

            <div className="my-1 border-t border-neutral-100 dark:border-neutral-800/80" />

            {/* Delete */}
            <button
              onClick={() => {
                setDeleteTargetId(conv.id);
                setMenuOpenId(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-left transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-neutral-950/60 backdrop-blur-xs md:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-72 flex-shrink-0 flex flex-col bg-neutral-50 dark:bg-[#0e1117] border-r border-neutral-200/90 dark:border-neutral-800/80 transition-transform duration-200 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full md:hidden"
        }`}
      >
        {/* Workspace Pill Header */}
        <div className="p-3 border-b border-neutral-200/90 dark:border-neutral-800/80 space-y-2">
          {/* Mobile close button */}
          <div className="flex items-center justify-between md:hidden">
            <span className="font-semibold text-xs tracking-wider uppercase text-neutral-500">
              Navigation
            </span>
            <button
              onClick={onCloseMobile}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
            >
              <SidebarClose className="w-4 h-4" />
            </button>
          </div>

          {/* Active Workspace Button */}
          <button
            onClick={() => {
              openWorkspaceModal();
              onCloseMobile();
            }}
            className="w-full flex items-center justify-between p-2 rounded-xl bg-white dark:bg-[#161a22] border border-neutral-200/90 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 text-left transition-all shadow-2xs cursor-pointer group"
          >
            <div className="flex items-center gap-2 truncate">
              <div className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                <Folder className="w-3.5 h-3.5" />
              </div>
              <div className="truncate">
                <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate block">
                  {activeWorkspace.name}
                </span>
                <span className="text-[10px] text-neutral-400">
                  {workspaceConversations.length} chats
                </span>
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition-colors" />
          </button>

          {/* New Chat Button */}
          <button
            id="sidebar-new-chat-btn"
            onClick={handleNewChat}
            disabled={isGenerating}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 font-medium text-xs hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              <span>New Conversation</span>
            </div>
            <kbd className="hidden sm:inline-block text-[10px] opacity-60 font-mono">
              ⌘⇧O
            </kbd>
          </button>

          {/* Global Search Trigger */}
          <button
            onClick={() => {
              onOpenGlobalSearch();
              onCloseMobile();
            }}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-[#161a22] border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-neutral-400" />
              <span>Search everything...</span>
            </div>
            <kbd className="text-[10px] px-1 py-0.2 rounded-sm bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 font-mono text-neutral-400">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          {/* Pinned Section */}
          {pinnedConversations.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                <Pin className="w-3 h-3" />
                <span>Pinned</span>
              </div>
              {pinnedConversations.map(renderConvItem)}
            </div>
          )}

          {/* Grouped Recent Conversations */}
          {grouped.length === 0 && pinnedConversations.length === 0 ? (
            <div className="text-center py-10 px-4 text-neutral-400 text-xs">
              {showArchived ? "No archived chats" : "No conversation history yet"}
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.label} className="space-y-1">
                <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  {group.label}
                </div>
                {group.items.map(renderConvItem)}
              </div>
            ))
          )}
        </div>

        {/* Bottom Sidebar Footer */}
        <div className="p-3 border-t border-neutral-200/90 dark:border-neutral-800/80 space-y-2">
          {/* Daily Quota Indicator */}
          <DailyUsageIndicator />

          {/* Archive Toggle Button */}
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer ${
              showArchived
                ? "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 font-medium"
                : "text-neutral-500 hover:bg-neutral-200/50 dark:hover:bg-[#141720]"
            }`}
          >
            <div className="flex items-center gap-2">
              <Archive className="w-3.5 h-3.5" />
              <span>{showArchived ? "Viewing Archived" : "Archived Chats"}</span>
            </div>
          </button>

          {/* Plans & Subscriptions Button */}
          <button
            onClick={() => {
              window.dispatchEvent(new CustomEvent("rsr:open-subscription"));
              onCloseMobile();
            }}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/50 dark:hover:bg-[#141720] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Crown className="w-3.5 h-3.5 text-indigo-500" />
              <span>Plans & Subscriptions</span>
            </div>
            <span className="text-[10px] font-medium text-indigo-500 dark:text-indigo-400">Plans</span>
          </button>

          {/* Data & Privacy Center Button */}
          <button
            onClick={() => {
              onOpenDataPrivacy();
              onCloseMobile();
            }}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/50 dark:hover:bg-[#141720] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Data & Privacy</span>
            </div>
          </button>

          {/* Settings Button */}
          <button
            onClick={() => {
              onOpenSettings();
              onCloseMobile();
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-2xl text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/50 dark:hover:bg-[#141720] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Settings className="w-3.5 h-3.5 text-neutral-500" />
              <span>Settings</span>
            </div>
            <span className="text-[10px] font-mono text-neutral-400">RSR Nexora</span>
          </button>
        </div>
      </aside>

      {/* Delete Single Conversation Confirmation */}
      <ConfirmModal
        isOpen={!!deleteTargetId}
        title="Delete Conversation?"
        description="Are you sure you want to delete this conversation thread? This action cannot be reversed."
        confirmLabel="Delete"
        isDestructive={true}
        onConfirm={() => {
          if (deleteTargetId) {
            deleteConversation(deleteTargetId);
            setDeleteTargetId(null);
          }
        }}
        onCancel={() => setDeleteTargetId(null)}
      />

      {/* Clear All Confirmation */}
      <ConfirmModal
        isOpen={showClearConfirm}
        title="Clear All Conversations?"
        description="Permanently clear all chat history? This will delete all current conversations."
        confirmLabel="Clear All"
        isDestructive={true}
        onConfirm={() => {
          clearAllConversations();
          setShowClearConfirm(false);
        }}
        onCancel={() => setShowClearConfirm(false)}
      />
    </>
  );
};

export const Sidebar = React.memo(SidebarComponent);
