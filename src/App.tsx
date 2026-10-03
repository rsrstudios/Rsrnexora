/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, Suspense, lazy } from "react";
import { ThemeProvider } from "./context/ThemeContext";
import { MemoryProvider } from "./context/MemoryContext";
import { AuthProvider } from "./context/AuthContext";
import { WorkspaceProvider } from "./context/WorkspaceContext";
import { ChatProvider, useChat } from "./context/ChatContext";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { MessageList } from "./components/MessageList";
import { MessageComposer, MessageComposerHandle } from "./components/MessageComposer";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { WifiOff } from "lucide-react";

// Lazy-loaded modal dialogs to split bundle and eliminate idle DOM/listener overhead
const SettingsModal = lazy(() =>
  import("./components/SettingsModal").then((m) => ({ default: m.SettingsModal }))
);
const VoiceModal = lazy(() =>
  import("./components/VoiceModal").then((m) => ({ default: m.VoiceModal }))
);
const ImageGenModal = lazy(() =>
  import("./components/ImageGenModal").then((m) => ({ default: m.ImageGenModal }))
);
const WorkspaceModal = lazy(() =>
  import("./components/WorkspaceModal").then((m) => ({ default: m.WorkspaceModal }))
);
const GlobalSearchModal = lazy(() =>
  import("./components/GlobalSearchModal").then((m) => ({ default: m.GlobalSearchModal }))
);
const DataPrivacyModal = lazy(() =>
  import("./components/DataPrivacyModal").then((m) => ({ default: m.DataPrivacyModal }))
);
const AuthModal = lazy(() =>
  import("./components/AuthModal").then((m) => ({ default: m.AuthModal }))
);
const SubscriptionModal = lazy(() =>
  import("./components/SubscriptionModal").then((m) => ({ default: m.SubscriptionModal }))
);
const FileMakerModal = lazy(() =>
  import("./components/FileMakerModal").then((m) => ({ default: m.FileMakerModal }))
);
const AdminApp = lazy(() =>
  import("./components/admin/AdminApp").then((m) => ({ default: m.AdminApp }))
);

function MainApp() {
  const {
    currentConversation,
    sendMessage,
    regenerateResponse,
    continueResponse,
    switchMessageVersion,
    stopGenerating,
    isGenerating,
    setFeedback,
    createNewChat,
    settings,
  } = useChat();

  const isOnline = useOnlineStatus();
  const composerRef = useRef<MessageComposerHandle>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth >= 1024;
    }
    return true;
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [isDataPrivacyOpen, setIsDataPrivacyOpen] = useState(false);
  const [isSubscriptionOpen, setIsSubscriptionOpen] = useState(false);
  const [isFileMakerModalOpen, setIsFileMakerModalOpen] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState<string>("");

  // Handle subscription opening event from any component
  useEffect(() => {
    const handleOpenSub = () => setIsSubscriptionOpen(true);
    const handleOpenFileMaker = () => setIsFileMakerModalOpen(true);
    window.addEventListener("rsr:open-subscription", handleOpenSub);
    window.addEventListener("rsr:open-filemaker", handleOpenFileMaker);
    return () => {
      window.removeEventListener("rsr:open-subscription", handleOpenSub);
      window.removeEventListener("rsr:open-filemaker", handleOpenFileMaker);
    };
  }, []);

  // Handle global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Shift + O: New Chat
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        createNewChat();
      }

      // Cmd/Ctrl + K: Global Search Modal
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsGlobalSearchOpen(true);
      }

      // Escape: close open modals
      if (e.key === "Escape") {
        if (isGlobalSearchOpen) setIsGlobalSearchOpen(false);
        if (isDataPrivacyOpen) setIsDataPrivacyOpen(false);
        if (isVoiceModalOpen) setIsVoiceModalOpen(false);
        if (isImageModalOpen) setIsImageModalOpen(false);
        if (isSettingsOpen) setIsSettingsOpen(false);
        if (isSubscriptionOpen) setIsSubscriptionOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    createNewChat,
    isGlobalSearchOpen,
    isDataPrivacyOpen,
    isSettingsOpen,
    isVoiceModalOpen,
    isImageModalOpen,
    isSubscriptionOpen,
  ]);

  const handleSelectStarterPrompt = (prompt: string) => {
    setInitialPrompt(prompt);
  };

  const handleTriggerFileUpload = () => {
    composerRef.current?.triggerFileInput();
  };

  // Font scale class
  const fontScaleClass =
    settings.fontSize === "compact"
      ? "text-[14px]"
      : settings.fontSize === "relaxed"
      ? "text-[16px]"
      : "text-[15px]";

  return (
    <div
      className={`flex h-screen w-screen overflow-hidden bg-[#f9fafb] dark:bg-[#0b0d12] text-neutral-900 dark:text-neutral-100 ${fontScaleClass}`}
    >
      {/* History Sidebar & Navigation Drawer */}
      <Sidebar
        isOpen={isSidebarOpen}
        onCloseMobile={() => setIsSidebarOpen(false)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenDataPrivacy={() => setIsDataPrivacyOpen(true)}
        onOpenGlobalSearch={() => setIsGlobalSearchOpen(true)}
      />

      {/* Main Conversation Container */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        {/* Offline notification banner */}
        {!isOnline && (
          <div className="bg-amber-500 text-neutral-950 px-4 py-1.5 text-xs font-medium flex items-center justify-center gap-2 shadow-xs z-40 animate-in slide-in-from-top">
            <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              You are currently offline. Saved local chats remain accessible, but new AI generations require an internet connection.
            </span>
          </div>
        )}

        {/* Top Header */}
        <Header
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenVoiceModal={() => setIsVoiceModalOpen(true)}
          onOpenGlobalSearch={() => setIsGlobalSearchOpen(true)}
        />

        {/* Conversation Stream & Message List */}
        <MessageList
          messages={currentConversation?.messages || []}
          isGenerating={isGenerating}
          onRegenerate={regenerateResponse}
          onContinue={continueResponse}
          onSwitchVersion={switchMessageVersion}
          onFeedback={setFeedback}
          onSelectPrompt={handleSelectStarterPrompt}
          onOpenVoiceModal={() => setIsVoiceModalOpen(true)}
          onOpenImageModal={() => setIsImageModalOpen(true)}
          onOpenFileMakerModal={() => setIsFileMakerModalOpen(true)}
          onTriggerFileUpload={handleTriggerFileUpload}
        />

        {/* Bottom Message Composer */}
        <MessageComposer
          ref={composerRef}
          onSend={sendMessage}
          isGenerating={isGenerating}
          onStop={stopGenerating}
          initialPrompt={initialPrompt}
          onClearInitialPrompt={() => setInitialPrompt("")}
          onOpenVoiceModal={() => setIsVoiceModalOpen(true)}
          onOpenImageModal={() => setIsImageModalOpen(true)}
        />
      </div>

      {/* Lazy-Loaded Modals mounted on-demand */}
      <Suspense fallback={null}>
        {isSettingsOpen && (
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            onOpenDataPrivacy={() => {
              setIsSettingsOpen(false);
              setIsDataPrivacyOpen(true);
            }}
          />
        )}

        {isVoiceModalOpen && (
          <VoiceModal
            isOpen={isVoiceModalOpen}
            onClose={() => setIsVoiceModalOpen(false)}
          />
        )}

        {isImageModalOpen && (
          <ImageGenModal
            isOpen={isImageModalOpen}
            onClose={() => setIsImageModalOpen(false)}
          />
        )}

        {isGlobalSearchOpen && (
          <GlobalSearchModal
            isOpen={isGlobalSearchOpen}
            onClose={() => setIsGlobalSearchOpen(false)}
          />
        )}

        <WorkspaceModal />

        {isDataPrivacyOpen && (
          <DataPrivacyModal
            isOpen={isDataPrivacyOpen}
            onClose={() => setIsDataPrivacyOpen(false)}
          />
        )}

        <AuthModal />
        {isSubscriptionOpen && (
          <SubscriptionModal
            isOpen={isSubscriptionOpen}
            onClose={() => setIsSubscriptionOpen(false)}
          />
        )}

        {isFileMakerModalOpen && (
          <FileMakerModal
            isOpen={isFileMakerModalOpen}
            onClose={() => setIsFileMakerModalOpen(false)}
          />
        )}
      </Suspense>
    </div>
  );
}

export default function App() {
  const [isAdminRoute, setIsAdminRoute] = useState(() => {
    if (typeof window !== "undefined") {
      return (
        window.location.pathname.startsWith("/admin") ||
        window.location.hash.startsWith("#/admin")
      );
    }
    return false;
  });

  useEffect(() => {
    const handleLocationChange = () => {
      setIsAdminRoute(
        window.location.pathname.startsWith("/admin") ||
        window.location.hash.startsWith("#/admin")
      );
    };
    window.addEventListener("popstate", handleLocationChange);
    return () => window.removeEventListener("popstate", handleLocationChange);
  }, []);

  if (isAdminRoute) {
    return (
      <ThemeProvider>
        <Suspense fallback={<div className="min-h-screen bg-neutral-950" />}>
          <AdminApp
            onBackToChat={() => {
              window.history.pushState({}, "", "/");
              setIsAdminRoute(false);
            }}
          />
        </Suspense>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <MemoryProvider>
        <AuthProvider>
          <WorkspaceProvider>
            <ChatProvider>
              <MainApp />
            </ChatProvider>
          </WorkspaceProvider>
        </AuthProvider>
      </MemoryProvider>
    </ThemeProvider>
  );
}
