import React from "react";
import {
  Menu,
  Plus,
  Settings as SettingsIcon,
  Sun,
  Moon,
  Laptop,
  SidebarClose,
  SidebarOpen,
  Download,
  User,
  Mic,
  Search,
  Folder,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useChat } from "../context/ChatContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useAuth } from "../context/AuthContext";
import { usePWAInstall } from "../hooks/usePWAInstall";
import { ModelSelector } from "./ModelSelector";
import { RSRLogo } from "./RSRLogo";

interface HeaderProps {
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
  onOpenSettings: () => void;
  onOpenVoiceModal: () => void;
  onOpenGlobalSearch: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  isSidebarOpen,
  onOpenSettings,
  onOpenVoiceModal,
  onOpenGlobalSearch,
}) => {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { createNewChat, isGenerating, activeMode } = useChat();
  const { activeWorkspace, openWorkspaceModal } = useWorkspace();
  const { user, openAuthModal } = useAuth();
  const { isInstallable, install } = usePWAInstall();

  const cycleTheme = () => {
    if (theme === "system") {
      setTheme("light");
    } else if (theme === "light") {
      setTheme("dark");
    } else {
      setTheme("system");
    }
  };

  const getThemeIcon = () => {
    if (theme === "system") {
      return <Laptop className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />;
    }
    return resolvedTheme === "dark" ? (
      <Moon className="w-4 h-4 text-neutral-300" />
    ) : (
      <Sun className="w-4 h-4 text-neutral-600" />
    );
  };

  return (
    <header className="h-14 flex-shrink-0 flex items-center justify-between px-3 md:px-5 border-b border-neutral-200/80 dark:border-neutral-800/80 bg-white/85 dark:bg-[#11141a]/90 backdrop-blur-md sticky top-0 z-30 transition-colors">
      {/* Left side: Sidebar Toggle, Brand, Workspace & Model Selector */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Toggle Sidebar Button */}
        <button
          id="toggle-sidebar-btn"
          onClick={onToggleSidebar}
          className="p-2 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500 focus:outline-none transition-colors cursor-pointer"
          title={isSidebarOpen ? "Hide sidebar" : "Show sidebar"}
          aria-label="Toggle history sidebar"
        >
          {isSidebarOpen ? (
            <SidebarClose className="w-4 h-4 hidden md:block" />
          ) : (
            <SidebarOpen className="w-4 h-4 hidden md:block" />
          )}
          <Menu className="w-5 h-5 md:hidden" />
        </button>

        {/* Brand Insignia */}
        <RSRLogo size="sm" showText={false} />

        {/* Active Workspace Indicator */}
        <button
          onClick={openWorkspaceModal}
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/80 border border-neutral-200/60 dark:border-neutral-700/60 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500 focus:outline-none transition-colors cursor-pointer"
          title={`Active Workspace: ${activeWorkspace.name} (Click to switch)`}
          aria-label={`Active Workspace: ${activeWorkspace.name}`}
        >
          <Folder className="w-3.5 h-3.5 text-blue-500" />
          <span className="max-w-[120px] truncate">{activeWorkspace.name}</span>
        </button>

        {/* Model Selector near top */}
        <div className="ml-0.5">
          <ModelSelector />
        </div>

        {/* Active Mode Pill (if special mode) */}
        {activeMode && activeMode !== "chat" && (
          <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-mono uppercase tracking-wider bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/50">
            {activeMode}
          </span>
        )}
      </div>

      {/* Right side: Global Search, Voice, New Chat, Account, Theme, Settings */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        {/* Global Search Button */}
        <button
          onClick={onOpenGlobalSearch}
          className="p-2 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500 focus:outline-none transition-colors cursor-pointer"
          title="Search everything (⌘K)"
          aria-label="Global search"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* Voice Conversation Mode Button */}
        <button
          onClick={onOpenVoiceModal}
          className="p-2 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500 focus:outline-none transition-colors cursor-pointer"
          title="Start Voice Mode"
          aria-label="Start Voice Mode"
        >
          <Mic className="w-4 h-4" />
        </button>

        {/* PWA Install Button if available */}
        {isInstallable && (
          <button
            onClick={() => install()}
            className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/40 border border-blue-200 dark:border-blue-800/60 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500 focus:outline-none transition-colors cursor-pointer"
            title="Install RSR Nexora as PWA App"
            aria-label="Install RSR Nexora"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Install</span>
          </button>
        )}

        {/* New Chat Button */}
        <button
          id="header-new-chat-btn"
          onClick={() => createNewChat()}
          disabled={isGenerating}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500 focus:outline-none transition-colors cursor-pointer"
          title="Start new conversation"
          aria-label="Start new conversation"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden md:inline">New Chat</span>
        </button>

        {/* User Account / Guest Button */}
        <button
          onClick={openAuthModal}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500 focus:outline-none transition-colors cursor-pointer"
          title={user.isGuest ? "Guest (Local Storage)" : user.email}
          aria-label={`User account: ${user.isGuest ? "Guest" : user.name}`}
        >
          <div className="w-5 h-5 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-neutral-600 dark:text-neutral-300">
            <User className="w-3 h-3" />
          </div>
          <span className="hidden lg:inline text-[11px] max-w-[90px] truncate">
            {user.isGuest ? "Guest" : user.name}
          </span>
        </button>

        {/* Quick Theme Cycle Button */}
        <button
          id="header-theme-toggle-btn"
          onClick={cycleTheme}
          className="p-2 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500 focus:outline-none transition-colors cursor-pointer"
          title={`Theme: ${theme} (click to cycle)`}
          aria-label="Cycle theme"
        >
          {getThemeIcon()}
        </button>

        {/* Settings Button */}
        <button
          id="header-settings-btn"
          onClick={onOpenSettings}
          className="p-2 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500 focus:outline-none transition-colors cursor-pointer"
          title="Settings"
          aria-label="Open settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
