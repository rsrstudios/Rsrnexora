import React, { useState, useEffect } from "react";
import {
  X,
  Sun,
  Moon,
  Laptop,
  MessageSquare,
  ShieldCheck,
  Trash2,
  Info,
  Brain,
  Plus,
  Volume2,
  Lock,
  User,
  ExternalLink,
  Folder,
  Database,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useChat } from "../context/ChatContext";
import { useMemory } from "../context/MemoryContext";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { ThemeMode, MemoryCategory } from "../types";
import { ConfirmModal } from "./ConfirmModal";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDataPrivacy?: () => void;
}

type TabType = "general" | "chat" | "memory" | "voice" | "security" | "about";

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onOpenDataPrivacy,
}) => {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { settings, updateSettings, clearAllConversations, conversations } = useChat();
  const { memories, addMemory, deleteMemory, clearAllMemories } = useMemory();
  const { user, openAuthModal } = useAuth();
  const { activeWorkspace, openWorkspaceModal } = useWorkspace();

  const [activeTab, setActiveTab] = useState<TabType>("general");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showClearMemoriesConfirm, setShowClearMemoriesConfirm] = useState(false);

  // New memory input state
  const [newMemoryContent, setNewMemoryContent] = useState("");
  const [newMemoryCategory, setNewMemoryCategory] = useState<MemoryCategory>("preference");

  if (!isOpen) return null;

  const handleAddMemory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryContent.trim()) return;
    addMemory(newMemoryContent.trim(), newMemoryCategory);
    setNewMemoryContent("");
  };

  const THEME_OPTIONS: Array<{
    mode: ThemeMode;
    label: string;
    description: string;
    icon: any;
  }> = [
    {
      mode: "light",
      label: "Light Mode",
      description: "Clean surfaces with crisp neutral contrast",
      icon: Sun,
    },
    {
      mode: "dark",
      label: "Dark Mode",
      description: "Deep neutral background with layered elevation",
      icon: Moon,
    },
    {
      mode: "system",
      label: "System / Auto",
      description: "Syncs dynamically with your operating system",
      icon: Laptop,
    },
  ];

  const PERSONA_PRESETS = [
    {
      name: "Default Assistant",
      prompt:
        "You are RSR Nexora, an intelligent, professional, and helpful AI assistant created and developed under RSR Studios by Founder and Owner Shubham Rajput. Provide concise, clear, and well-structured answers.",
    },
    {
      name: "Senior Software Engineer",
      prompt:
        "You are RSR Nexora, created under RSR Studios by Founder and Owner Shubham Rajput, acting as an expert software architect. Output clean, modular code with concise technical explanations and best practices.",
    },
    {
      name: "Concise & Direct",
      prompt:
        "You are RSR Nexora, developed under RSR Studios by Founder and Owner Shubham Rajput. Be as concise as possible. Avoid pleasantries and provide direct, factual, and actionable answers.",
    },
    {
      name: "Academic Researcher",
      prompt:
        "You are RSR Nexora, developed under RSR Studios by Founder and Owner Shubham Rajput, acting as a rigorous researcher. Present arguments analytically with clear nuance, evidence, and structured reasoning.",
    },
  ];

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/65 backdrop-blur-xs animate-in fade-in duration-150"
      >
        <div
          className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl bg-white dark:bg-[#11141a] border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden text-neutral-900 dark:text-neutral-100"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800">
            <div>
              <h2 id="settings-modal-title" className="text-sm font-semibold tracking-tight">
                Settings & Preferences
              </h2>
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Configure theme, intelligence persona, memory, and voice
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              aria-label="Close settings"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-neutral-200 dark:border-neutral-800 px-6 gap-5 text-xs font-medium overflow-x-auto">
            {(
              [
                { id: "general", label: "General" },
                { id: "chat", label: "Intelligence" },
                { id: "memory", label: "Memory" },
                { id: "voice", label: "Voice" },
                { id: "security", label: "Security & Hardening" },
                { id: "about", label: "About" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === tab.id
                    ? "border-neutral-900 dark:border-white text-neutral-900 dark:text-white font-semibold"
                    : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
            {/* GENERAL TAB */}
            {activeTab === "general" && (
              <>
                {/* Account card */}
                <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-[#161a22] border border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-xs text-neutral-900 dark:text-neutral-100">
                        {user.isGuest ? "Guest Mode" : user.name}
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        {user.isGuest
                          ? "Using local-first storage on this device."
                          : user.email}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      onClose();
                      openAuthModal();
                    }}
                    className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                  >
                    {user.isGuest ? "Account Setup" : "Manage"}
                  </button>
                </div>

                {/* Active Workspace */}
                <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-[#161a22] border border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                      <Folder className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-xs text-neutral-900 dark:text-neutral-100">
                        Workspace: {activeWorkspace.name}
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        Manage workspaces and project directories.
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      onClose();
                      openWorkspaceModal();
                    }}
                    className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                  >
                    Manage Workspaces
                  </button>
                </div>

                {/* Theme Selector */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3">
                    Theme Mode
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {THEME_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const isSelected = theme === opt.mode;
                      return (
                        <button
                          key={opt.mode}
                          id={`theme-btn-${opt.mode}`}
                          onClick={() => setTheme(opt.mode)}
                          className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                            isSelected
                              ? "border-neutral-900 dark:border-white bg-neutral-100/80 dark:bg-[#1a1e27] shadow-xs"
                              : "border-neutral-200 dark:border-neutral-800 bg-transparent hover:bg-neutral-50 dark:hover:bg-[#161a22]"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <Icon
                              className={`w-4 h-4 ${
                                isSelected
                                  ? "text-blue-600 dark:text-blue-400"
                                  : "text-neutral-400"
                              }`}
                            />
                            {isSelected && (
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-xs text-neutral-900 dark:text-neutral-100 mb-0.5">
                              {opt.label}
                            </div>
                            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-tight">
                              {opt.description}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Data & Privacy Shortcut */}
                {onOpenDataPrivacy && (
                  <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-[#161a22] border border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-xs text-neutral-900 dark:text-neutral-100">
                          Data & Privacy Center
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          JSON backup export, import data, and storage inspection.
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        onClose();
                        onOpenDataPrivacy();
                      }}
                      className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                    >
                      Open Center
                    </button>
                  </div>
                )}

                {/* Clear Chat Data */}
                <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-neutral-900 dark:text-neutral-100 text-xs">
                        Clear All Conversations
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        Permanently delete all {conversations.length} conversation(s) from this device.
                      </div>
                    </div>
                    <button
                      onClick={() => setShowClearConfirm(true)}
                      disabled={conversations.length === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear History</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* CHAT / INTELLIGENCE TAB */}
            {activeTab === "chat" && (
              <>
                {/* System Instructions */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
                    System Persona & Tone
                  </label>

                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    {PERSONA_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        onClick={() => updateSettings({ systemInstruction: preset.prompt })}
                        className="px-2.5 py-1 rounded-lg text-xs bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>

                  <textarea
                    rows={4}
                    value={settings.systemInstruction}
                    onChange={(e) => updateSettings({ systemInstruction: e.target.value })}
                    placeholder="Instructions guiding RSR Nexora's personality and tone..."
                    className="w-full px-3 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-[#161a22] border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-hidden focus:ring-1 focus:ring-blue-500 resize-none leading-relaxed"
                  />
                </div>

                {/* Temperature / Creativity */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      Creativity (Temperature): {settings.temperature.toFixed(1)}
                    </label>
                    <span className="text-[11px] text-neutral-400">
                      {settings.temperature < 0.4
                        ? "Precise & Focused"
                        : settings.temperature > 0.8
                        ? "Creative & Divergent"
                        : "Balanced"}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.1"
                    value={settings.temperature}
                    onChange={(e) =>
                      updateSettings({ temperature: parseFloat(e.target.value) })
                    }
                    className="w-full accent-neutral-900 dark:accent-white cursor-pointer"
                  />
                </div>

                {/* Web Search Grounding Default */}
                <div className="flex items-center justify-between pt-2">
                  <div>
                    <div className="font-medium text-xs text-neutral-900 dark:text-neutral-100">
                      Google Search Grounding
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      Retrieve up-to-date web facts and citations automatically
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.webSearchEnabled}
                    onChange={(e) => updateSettings({ webSearchEnabled: e.target.checked })}
                    className="w-4 h-4 rounded-sm accent-blue-600 cursor-pointer"
                  />
                </div>
              </>
            )}

            {/* MEMORY TAB */}
            {activeTab === "memory" && (
              <div className="space-y-5">
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-900/40">
                  <div className="flex items-center gap-2.5">
                    <Brain className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    <div>
                      <div className="font-semibold text-xs text-neutral-900 dark:text-neutral-100">
                        Adaptive Memory System
                      </div>
                      <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        Allow RSR Nexora to remember your preferences and key context across chats.
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.memoryEnabled}
                    onChange={(e) => updateSettings({ memoryEnabled: e.target.checked })}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                </div>

                <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#161a22] border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed flex items-start gap-2">
                  <Lock className="w-4 h-4 text-neutral-400 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>User-Controlled Privacy:</strong> RSR Nexora never silently saves sensitive
                    information. You have full oversight to view, edit, or remove any memory at
                    any time.
                  </span>
                </div>

                {/* Add New Memory */}
                <form onSubmit={handleAddMemory} className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Add Explicit Memory
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newMemoryContent}
                      onChange={(e) => setNewMemoryContent(e.target.value)}
                      placeholder="e.g. 'Always write TypeScript with strict null checks'..."
                      className="flex-1 px-3 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-[#161a22] border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                    />
                    <select
                      value={newMemoryCategory}
                      onChange={(e) => setNewMemoryCategory(e.target.value as MemoryCategory)}
                      className="px-2.5 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-[#161a22] border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300"
                    >
                      <option value="preference">Preference</option>
                      <option value="fact">Fact</option>
                      <option value="instruction">Instruction</option>
                    </select>
                    <button
                      type="submit"
                      disabled={!newMemoryContent.trim()}
                      className="px-3.5 py-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-medium hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-40 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                </form>

                {/* Memories List */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      Saved Memories ({memories.length})
                    </span>
                    {memories.length > 0 && (
                      <button
                        onClick={() => setShowClearMemoriesConfirm(true)}
                        className="text-[11px] text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                      >
                        Clear All Memories
                      </button>
                    )}
                  </div>

                  {memories.length === 0 ? (
                    <div className="py-8 text-center text-xs text-neutral-400 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl">
                      No memories stored yet. Add custom instructions above or save answers from chat.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {memories.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-[#161a22] border border-neutral-200 dark:border-neutral-800 text-xs"
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                            <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-semibold uppercase bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
                              {m.category}
                            </span>
                            <span className="text-neutral-800 dark:text-neutral-200 truncate">
                              {m.content}
                            </span>
                          </div>
                          <button
                            onClick={() => deleteMemory(m.id)}
                            className="p-1 rounded-sm text-neutral-400 hover:text-rose-600 transition-colors cursor-pointer"
                            title="Delete memory"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* VOICE TAB */}
            {activeTab === "voice" && (
              <div className="space-y-5">
                <div className="flex items-center justify-between p-3 rounded-2xl bg-neutral-50 dark:bg-[#161a22] border border-neutral-200 dark:border-neutral-800">
                  <div className="flex items-center gap-2.5">
                    <Volume2 className="w-5 h-5 text-blue-500" />
                    <div>
                      <div className="font-semibold text-xs text-neutral-900 dark:text-neutral-100">
                        Spoken Response Audio
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        Enable browser speech synthesis playback for AI responses
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.voiceEnabled}
                    onChange={(e) => updateSettings({ voiceEnabled: e.target.checked })}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                </div>

                {/* Voice Speed */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      Speech Speed: {settings.voiceSpeed}x
                    </label>
                  </div>
                  <input
                    type="range"
                    min="0.7"
                    max="1.5"
                    step="0.1"
                    value={settings.voiceSpeed}
                    onChange={(e) =>
                      updateSettings({ voiceSpeed: parseFloat(e.target.value) })
                    }
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                </div>

                {/* Voice Pitch */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      Voice Pitch: {settings.voicePitch}
                    </label>
                  </div>
                  <input
                    type="range"
                    min="0.8"
                    max="1.3"
                    step="0.1"
                    value={settings.voicePitch}
                    onChange={(e) =>
                      updateSettings({ voicePitch: parseFloat(e.target.value) })
                    }
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                </div>

                {/* Voice Language & Accent */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
                    Voice Language &amp; Accent
                  </label>
                  <select
                    value={settings.voiceLanguage || "en-IN"}
                    onChange={(e) => updateSettings({ voiceLanguage: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white"
                  >
                    <option value="en-IN">Indian English / Hinglish (en-IN)</option>
                    <option value="hi-IN">Hindi / हिन्दी (hi-IN)</option>
                    <option value="en-US">English (US)</option>
                    <option value="en-GB">English (UK)</option>
                  </select>
                </div>

                {/* Auto-Play Speech Response */}
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-50 dark:bg-[#161a22] border border-neutral-200 dark:border-neutral-800">
                  <div>
                    <div className="font-semibold text-xs text-neutral-900 dark:text-neutral-100">
                      Auto-play Response
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      Automatically narrate assistant responses in Voice Mode
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.voiceAutoplay}
                    onChange={(e) => updateSettings({ voiceAutoplay: e.target.checked })}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                </div>

                {/* Voice Conversation Mode */}
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-50 dark:bg-[#161a22] border border-neutral-200 dark:border-neutral-800">
                  <div>
                    <div className="font-semibold text-xs text-neutral-900 dark:text-neutral-100">
                      Continuous Conversation Mode
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      Auto-listen after speech completes for hands-free dialogue
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.voiceConversationMode ?? false}
                    onChange={(e) => updateSettings({ voiceConversationMode: e.target.checked })}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* SECURITY & HARDENING TAB */}
            {activeTab === "security" && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-[#161a22] border border-neutral-200 dark:border-neutral-800">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                        <Lock className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-xs text-neutral-900 dark:text-neutral-100">
                          Production Security &amp; QA Posture
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          Audited backend architecture, data isolation &amp; QA verified
                        </div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full border border-emerald-500/20">
                      v5.0 QA Verified
                    </span>
                  </div>

                  <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                    RSR Nexora has been rigorously tested across unit, integration, authorization,
                    and end-to-end user journeys. Real-time security guarantees are enforced server-side.
                  </p>
                </div>

                {/* Specific Security Status Grid */}
                <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151921] space-y-3">
                  <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 border-b border-neutral-100 dark:border-neutral-800/60 pb-2">
                    System Security Status
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center justify-between py-1 border-b border-neutral-100 dark:border-neutral-800/40">
                      <span className="text-neutral-600 dark:text-neutral-400 font-medium">API Keys:</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded text-[11px]">
                        Protected server-side
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1 border-b border-neutral-100 dark:border-neutral-800/40">
                      <span className="text-neutral-600 dark:text-neutral-400 font-medium">Memory:</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded text-[11px]">
                        User controlled (explicit opt-in)
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1 border-b border-neutral-100 dark:border-neutral-800/40">
                      <span className="text-neutral-600 dark:text-neutral-400 font-medium">Chat History:</span>
                      <span className="font-mono text-neutral-800 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded text-[11px]">
                        {user.isGuest ? "Local session (Guest)" : "User-isolated cloud store"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1 border-b border-neutral-100 dark:border-neutral-800/40">
                      <span className="text-neutral-600 dark:text-neutral-400 font-medium">Encryption &amp; Auth:</span>
                      <span className="font-mono text-neutral-800 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded text-[11px]">
                        scrypt + 16B salt &amp; timingSafeEqual
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1">
                      <span className="text-neutral-600 dark:text-neutral-400 font-medium">Session:</span>
                      <span className={`font-mono px-2 py-0.5 rounded text-[11px] ${
                        user.isGuest
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      }`}>
                        {user.isGuest ? "Guest Mode" : `Active (${user.email || user.name})`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151921] space-y-1.5">
                    <div className="flex items-center gap-2 text-neutral-900 dark:text-neutral-100 font-medium text-xs">
                      <ShieldCheck className="w-4 h-4 text-blue-500" />
                      <span>Server-Side Credentials</span>
                    </div>
                    <p className="text-[11px] text-neutral-500 leading-relaxed">
                      API keys and provider secrets are strictly restricted to the Node.js runtime and never shipped to frontend bundles or exposed in JSON responses.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151921] space-y-1.5">
                    <div className="flex items-center gap-2 text-neutral-900 dark:text-neutral-100 font-medium text-xs">
                      <Lock className="w-4 h-4 text-emerald-500" />
                      <span>Cryptographic Auth</span>
                    </div>
                    <p className="text-[11px] text-neutral-500 leading-relaxed">
                      Passwords hashed using native Node scrypt with per-user cryptographic salts and timing-safe equality comparison against timing attacks.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151921] space-y-1.5">
                    <div className="flex items-center gap-2 text-neutral-900 dark:text-neutral-100 font-medium text-xs">
                      <Brain className="w-4 h-4 text-purple-500" />
                      <span>Prompt Injection Defense</span>
                    </div>
                    <p className="text-[11px] text-neutral-500 leading-relaxed">
                      4-tier trust hierarchy: system directives &gt; app modes &gt; user prompts &gt; untrusted attachments. Untrusted files cannot override safety constraints.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151921] space-y-1.5">
                    <div className="flex items-center gap-2 text-neutral-900 dark:text-neutral-100 font-medium text-xs">
                      <Database className="w-4 h-4 text-amber-500" />
                      <span>User-Isolated Data</span>
                    </div>
                    <p className="text-[11px] text-neutral-500 leading-relaxed">
                      Every database query enforces authenticated ownership checks. Users cannot view or modify other users' conversations or workspaces by altering IDs.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#161a22] flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-xs text-neutral-900 dark:text-neutral-100">
                      View Data Privacy Center
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      Audit local storage, sync preferences, and export full JSON archive
                    </div>
                  </div>
                  {onOpenDataPrivacy && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenDataPrivacy();
                      }}
                      className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                    >
                      Open Privacy Center
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ABOUT TAB */}
            {activeTab === "about" && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#161a22]">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 flex items-center justify-center font-bold text-xs">
                      RSR
                    </div>
                    <div>
                      <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                        RSR Nexora
                      </div>
                      <div className="text-xs text-neutral-500 font-mono">v7.0.0 Pro • RSR Studios</div>
                    </div>
                  </div>
                  <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                    RSR Nexora was created and developed under RSR Studios by its Founder and Owner, Shubham Rajput.
                    It features a production-hardened intelligence foundation with approximately 2 years of continuous
                    architectural development.
                  </p>
                </div>

                {/* Official Identity & Attribution Card */}
                <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151921] space-y-3">
                  <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 border-b border-neutral-100 dark:border-neutral-800/60 pb-2">
                    Official Product &amp; Organization Identity
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between py-1 border-b border-neutral-100 dark:border-neutral-800/40">
                      <span className="text-neutral-500 dark:text-neutral-400">Product:</span>
                      <span className="font-medium text-neutral-900 dark:text-neutral-100">RSR Nexora</span>
                    </div>

                    <div className="flex items-center justify-between py-1 border-b border-neutral-100 dark:border-neutral-800/40">
                      <span className="text-neutral-500 dark:text-neutral-400">Studio:</span>
                      <span className="font-medium text-neutral-900 dark:text-neutral-100">RSR Studios</span>
                    </div>

                    <div className="flex items-center justify-between py-1 border-b border-neutral-100 dark:border-neutral-800/40">
                      <span className="text-neutral-500 dark:text-neutral-400">Founder &amp; Owner:</span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400">Shubham Rajput</span>
                    </div>

                    <div className="flex items-center justify-between py-1 border-b border-neutral-100 dark:border-neutral-800/40">
                      <span className="text-neutral-500 dark:text-neutral-400">Official Website:</span>
                      <a
                        href="https://rsrstudios.in"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        <span>rsrstudios.in</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    <div className="flex items-center justify-between py-1">
                      <span className="text-neutral-500 dark:text-neutral-400">Development History:</span>
                      <span className="font-medium text-neutral-700 dark:text-neutral-300">Approximately 2 years</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-start gap-2.5 p-3 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#161a22]/50">
                    <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium text-xs text-neutral-900 dark:text-neutral-100">
                        Local-First &amp; Confidential
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                        API keys stay exclusively on the server. Your conversation trees, workspaces,
                        and memories remain strictly user-isolated and completely private.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-6 py-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#11141a]">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-2xs cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation modal for clearing all conversations */}
      <ConfirmModal
        isOpen={showClearConfirm}
        title="Clear Conversation History?"
        description="This will permanently delete all conversation threads from your local browser storage. This action cannot be undone."
        confirmLabel="Clear All"
        isDestructive={true}
        onConfirm={() => {
          clearAllConversations();
          setShowClearConfirm(false);
        }}
        onCancel={() => setShowClearConfirm(false)}
      />

      {/* Confirmation modal for clearing all memories */}
      <ConfirmModal
        isOpen={showClearMemoriesConfirm}
        title="Clear All Saved Memories?"
        description="This will remove all stored preferences and facts from RSR Nexora's long-term memory."
        confirmLabel="Clear Memories"
        isDestructive={true}
        onConfirm={() => {
          clearAllMemories();
          setShowClearMemoriesConfirm(false);
        }}
        onCancel={() => setShowClearMemoriesConfirm(false)}
      />
    </>
  );
};
