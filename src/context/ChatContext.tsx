import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  Conversation,
  Message,
  MessageAttachment,
  AppSettings,
  ModelTier,
  GroundingSource,
  SmartMode,
} from "../types";
import { useMemory } from "./MemoryContext";
import { useWorkspace } from "./WorkspaceContext";
import { StorageService, DEFAULT_SETTINGS } from "../services/storageService";

interface ChatContextType {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  currentConversationId: string | null;
  isGenerating: boolean;
  settings: AppSettings;
  activeMode: SmartMode;
  setActiveMode: (mode: SmartMode) => void;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  createNewChat: (modelTier?: ModelTier, mode?: SmartMode) => string;
  selectConversation: (id: string) => void;
  renameConversation: (id: string, newTitle: string) => void;
  deleteConversation: (id: string) => void;
  clearAllConversations: () => void;
  togglePinConversation: (id: string) => void;
  toggleFavoriteConversation: (id: string) => void;
  toggleArchiveConversation: (id: string) => void;
  sendMessage: (content: string, attachments?: MessageAttachment[]) => Promise<void>;
  generateImageMessage: (prompt: string, aspectRatio?: "1:1" | "16:9" | "4:3" | "9:16" | string) => Promise<void>;
  regenerateResponse: (messageId: string) => Promise<void>;
  continueResponse: (messageId: string) => Promise<void>;
  switchMessageVersion: (messageId: string, versionIndex: number) => void;
  stopGenerating: () => void;
  setFeedback: (messageId: string, feedback: "like" | "dislike" | null) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

function generateId(): string {
  return "rsr_" + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { getFormattedMemoryContext } = useMemory();
  const { activeWorkspace } = useWorkspace();

  const [conversations, setConversations] = useState<Conversation[]>(() => {
    StorageService.init();
    return StorageService.getConversations();
  });

  const [currentConversationId, setCurrentConversationId] = useState<string | null>(() => {
    const convs = StorageService.getConversations();
    return convs.length > 0 ? convs[0].id : null;
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    return StorageService.getSettings();
  });

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync conversations to storage
  useEffect(() => {
    StorageService.saveConversations(conversations);
  }, [conversations]);

  // Sync settings to storage
  useEffect(() => {
    StorageService.saveSettings(settings);
  }, [settings]);

  const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  }, []);

  const setActiveMode = useCallback(
    (mode: SmartMode) => {
      updateSettings({
        activeMode: mode,
        webSearchEnabled: mode === "research" ? true : settings.webSearchEnabled,
      });
      // Also update mode of active conversation
      if (currentConversationId) {
        setConversations((prev) =>
          prev.map((c) => (c.id === currentConversationId ? { ...c, mode } : c))
        );
      }
    },
    [currentConversationId, settings.webSearchEnabled, updateSettings]
  );

  const createNewChat = useCallback(
    (modelTier?: ModelTier, mode?: SmartMode): string => {
      const newId = generateId();
      const selectedMode = mode || settings.activeMode || "chat";
      const newConv: Conversation = {
        id: newId,
        title: "New Chat",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        modelTier: modelTier || settings.selectedModel,
        workspaceId: activeWorkspace.id,
        isPinned: false,
        isFavorite: false,
        isArchived: false,
        mode: selectedMode,
      };
      setConversations((prev) => [newConv, ...prev]);
      setCurrentConversationId(newId);
      return newId;
    },
    [settings.selectedModel, settings.activeMode, activeWorkspace.id]
  );

  const selectConversation = useCallback(
    (id: string) => {
      if (isGenerating) {
        abortControllerRef.current?.abort();
        setIsGenerating(false);
      }
      setCurrentConversationId(id);
      // Sync active mode from conversation
      const conv = conversations.find((c) => c.id === id);
      if (conv?.mode) {
        setSettings((prev) => ({ ...prev, activeMode: conv.mode! }));
      }
    },
    [isGenerating, conversations]
  );

  const renameConversation = useCallback((id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: trimmed, updatedAt: Date.now() } : c))
    );
  }, []);

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const filtered = prev.filter((c) => c.id !== id);
        if (currentConversationId === id) {
          setCurrentConversationId(filtered.length > 0 ? filtered[0].id : null);
        }
        return filtered;
      });
    },
    [currentConversationId]
  );

  const clearAllConversations = useCallback(() => {
    if (isGenerating) {
      abortControllerRef.current?.abort();
      setIsGenerating(false);
    }
    setConversations([]);
    setCurrentConversationId(null);
  }, [isGenerating]);

  const togglePinConversation = useCallback((id: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isPinned: !c.isPinned, updatedAt: Date.now() } : c))
    );
  }, []);

  const toggleFavoriteConversation = useCallback((id: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isFavorite: !c.isFavorite, updatedAt: Date.now() } : c))
    );
  }, []);

  const toggleArchiveConversation = useCallback((id: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isArchived: !c.isArchived, updatedAt: Date.now() } : c))
    );
  }, []);

  const currentConversation =
    conversations.find((c) => c.id === currentConversationId) || null;

  const stopGenerating = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
  }, []);

  const setFeedback = useCallback((messageId: string, feedback: "like" | "dislike" | null) => {
    setConversations((prev) =>
      prev.map((conv) => ({
        ...conv,
        messages: conv.messages.map((m) =>
          m.id === messageId ? { ...m, feedback: m.feedback === feedback ? null : feedback } : m
        ),
      }))
    );
  }, []);

  const switchMessageVersion = useCallback((messageId: string, versionIndex: number) => {
    setConversations((prev) =>
      prev.map((conv) => ({
        ...conv,
        messages: conv.messages.map((m) => {
          if (m.id !== messageId || !m.versions || !m.versions[versionIndex]) return m;
          return {
            ...m,
            content: m.versions[versionIndex],
            currentVersionIndex: versionIndex,
          };
        }),
      }))
    );
  }, []);

  // Internal streaming runner
  const streamAIResponse = async (
    targetConvId: string,
    historyMessages: Message[],
    assistantMessageId: string,
    alternateVersion: boolean = false
  ) => {
    setIsGenerating(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Compose system instruction with workspace instructions, memories, and workspace files
    let combinedInstruction = settings.systemInstruction;

    if (activeWorkspace.customInstructions) {
      combinedInstruction += `\n[Workspace: ${activeWorkspace.name}]: ${activeWorkspace.customInstructions}`;
    }

    if (activeWorkspace.files && activeWorkspace.files.length > 0) {
      combinedInstruction += `\n[Workspace Reference Files]:`;
      activeWorkspace.files.forEach((f) => {
        if (f.textContent) {
          combinedInstruction += `\n--- File: ${f.name} ---\n${f.textContent.slice(0, 1500)}`;
        }
      });
    }

    if (settings.memoryEnabled) {
      const memoryContext = getFormattedMemoryContext();
      if (memoryContext) {
        combinedInstruction += `\n${memoryContext}`;
      }
    }

    const currentMode = settings.activeMode || "chat";

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: historyMessages.map((m) => ({
            role: m.role,
            content: m.content,
            attachments: m.attachments,
          })),
          systemInstruction: combinedInstruction,
          temperature: settings.temperature,
          model: settings.selectedModel,
          webSearch: currentMode === "research" || settings.webSearchEnabled,
          mode: currentMode,
          timezone:
            typeof Intl !== "undefined"
              ? Intl.DateTimeFormat().resolvedOptions().timeZone
              : "Asia/Kolkata",
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorMsg = `Server error: HTTP ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson?.error?.message) {
            errorMsg = errJson.error.message;
          }
        } catch {
          // Ignore json parse error
        }
        throw new Error(errorMsg);
      }

      if (!response.body) {
        throw new Error("No response stream body received");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let accumulatedText = "";
      let accumulatedSources: GroundingSource[] = [];

      // Frame-throttled batch updates to maintain smooth 60fps rendering without React thrashing
      let lastFlushTime = 0;
      let flushTimer: any = null;

      const flushStateUpdate = (force = false, isFinal = false, isErr = false, errMsg?: any) => {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }

        const now = performance.now();
        if (!force && now - lastFlushTime < 24) {
          if (!flushTimer) {
            flushTimer = setTimeout(() => {
              flushStateUpdate(true, isFinal, isErr, errMsg);
            }, 24);
          }
          return;
        }

        lastFlushTime = now;

        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id !== targetConvId) return conv;
            return {
              ...conv,
              updatedAt: Date.now(),
              messages: conv.messages.map((m) => {
                if (m.id !== assistantMessageId) return m;

                let versions = m.versions && m.versions.length > 0 ? [...m.versions] : [m.content || ""];
                let versionIndex = m.currentVersionIndex ?? 0;

                if (alternateVersion) {
                  const newVersions = [...versions];
                  newVersions[newVersions.length - 1] = accumulatedText;
                  versions = newVersions;
                  versionIndex = newVersions.length - 1;
                } else {
                  const newVersions = [...versions];
                  newVersions[versionIndex] = accumulatedText;
                  versions = newVersions;
                }

                const formattedError =
                  typeof errMsg === "string"
                    ? errMsg
                    : errMsg?.message || (errMsg ? JSON.stringify(errMsg) : "An unexpected AI error occurred.");

                const finalContent = isErr
                  ? (accumulatedText ? `${accumulatedText}\n\n[Error: ${formattedError}]` : `Error: ${formattedError}`)
                  : accumulatedText;

                return {
                  ...m,
                  content: finalContent,
                  sources:
                    accumulatedSources.length > 0
                      ? accumulatedSources
                      : m.sources,
                  versions,
                  currentVersionIndex: versionIndex,
                  isError: isErr ? true : m.isError,
                  status: isErr ? "error" : isFinal ? "complete" : "streaming",
                };
              }),
            };
          })
        );

        if (isFinal) {
          // Immediately persist final response to storage
          setTimeout(() => {
            const current = StorageService.getConversations();
            StorageService.saveConversations(current, true);
          }, 50);
        }
      };

      let streamErrorOccurred = false;
      let streamErrorMessage = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;

          const dataContent = trimmed.substring(5).trim();
          if (dataContent === "[DONE]") {
            break;
          }

          try {
            const parsed = JSON.parse(dataContent);

            if (parsed.text) {
              accumulatedText += parsed.text;
              flushStateUpdate(false, false, false);
            }

            if (parsed.sources && Array.isArray(parsed.sources)) {
              accumulatedSources = [...accumulatedSources, ...parsed.sources];
              flushStateUpdate(true, false, false);
            }

            if (parsed.error) {
              streamErrorOccurred = true;
              const errStr =
                typeof parsed.error === "string"
                  ? parsed.error
                  : parsed.error?.message || parsed.error?.code || JSON.stringify(parsed.error);
              streamErrorMessage = errStr;
              flushStateUpdate(true, false, true, errStr);
            }
          } catch {
            // Ignore non-json
          }
        }
      }

      // Mark completion and flush any remaining buffer
      if (streamErrorOccurred) {
        flushStateUpdate(true, true, true, streamErrorMessage);
      } else if (!accumulatedText || accumulatedText.trim().length === 0) {
        flushStateUpdate(
          true,
          true,
          true,
          "No response was received from the AI provider. Please verify your connection or try again."
        );
      } else {
        flushStateUpdate(true, true, false);
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        // Preserved aborted state
      } else {
        console.error("Chat stream error:", err);
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id !== targetConvId) return conv;
            return {
              ...conv,
              updatedAt: Date.now(),
              messages: conv.messages.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      content:
                        m.content ||
                        err.message ||
                        "Unable to complete request. Please verify your connection or try again later.",
                      isError: true,
                      status: "error",
                    }
                  : m
              ),
            };
          })
        );
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("rsr:refresh-usage"));
      }
    }
  };

  const sendMessage = useCallback(
    async (content: string, attachments?: MessageAttachment[]) => {
      const trimmedContent = content.trim();
      if (!trimmedContent && (!attachments || attachments.length === 0)) return;

      let convId = currentConversationId;
      let isNew = false;

      if (!convId || !conversations.some((c) => c.id === convId)) {
        convId = createNewChat();
        isNew = true;
      }

      const userMsg: Message = {
        id: generateId(),
        role: "user",
        content: trimmedContent,
        timestamp: Date.now(),
        attachments: attachments && attachments.length > 0 ? [...attachments] : undefined,
        mode: settings.activeMode,
      };

      const assistantMsgId = generateId();
      const assistantMsg: Message = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        mode: settings.activeMode,
        versions: [""],
        currentVersionIndex: 0,
      };

      const smartTitle =
        trimmedContent.length > 32
          ? trimmedContent.substring(0, 32) + "..."
          : trimmedContent || (attachments ? `Attachment (${attachments[0]?.name})` : "Conversation");

      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== convId) return conv;
          const shouldUpdateTitle = conv.title === "New Chat" || isNew;
          return {
            ...conv,
            title: shouldUpdateTitle ? smartTitle : conv.title,
            updatedAt: Date.now(),
            messages: [...conv.messages, userMsg, assistantMsg],
          };
        })
      );

      const historyToPass = [...(currentConversation?.messages || []), userMsg];
      await streamAIResponse(convId, historyToPass, assistantMsgId, false);
    },
    [
      currentConversationId,
      conversations,
      currentConversation,
      createNewChat,
      settings,
      activeWorkspace,
      getFormattedMemoryContext,
    ]
  );

  const generateImageMessage = useCallback(
    async (prompt: string, aspectRatio: "1:1" | "16:9" | "4:3" | "9:16" = "1:1") => {
      if (!prompt.trim()) return;

      let convId = currentConversationId;
      if (!convId || !conversations.some((c) => c.id === convId)) {
        convId = createNewChat(undefined, "image");
      }

      const userMsg: Message = {
        id: generateId(),
        role: "user",
        content: `Generate image: "${prompt.trim()}" (Aspect Ratio: ${aspectRatio})`,
        timestamp: Date.now(),
      };

      const assistantMsgId = generateId();
      const assistantMsg: Message = {
        id: assistantMsgId,
        role: "assistant",
        content: "Generating your image with RSR Nexora...",
        timestamp: Date.now(),
      };

      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== convId) return conv;
          return {
            ...conv,
            title: conv.title === "New Chat" ? `Image: ${prompt.slice(0, 24)}...` : conv.title,
            updatedAt: Date.now(),
            messages: [...conv.messages, userMsg, assistantMsg],
          };
        })
      );

      setIsGenerating(true);

      try {
        const res = await fetch("/api/image/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, aspectRatio }),
        });

        const data = await res.json();

        if (!res.ok || data.error) {
          throw new Error(data.error || "Failed to generate image.");
        }

        // Save to image gallery in storage
        const currentGallery = StorageService.getImageGallery();
        StorageService.saveImageGallery([
          {
            id: generateId(),
            url: data.imageUrl,
            prompt,
            aspectRatio,
            createdAt: Date.now(),
          },
          ...currentGallery,
        ]);

        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id !== convId) return conv;
            return {
              ...conv,
              updatedAt: Date.now(),
              messages: conv.messages.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: `Here is your generated image for: "${prompt}"`,
                      imageUrl: data.imageUrl,
                      imagePrompt: prompt,
                      imageAspectRatio: aspectRatio,
                    }
                  : m
              ),
            };
          })
        );
      } catch (err: any) {
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id !== convId) return conv;
            return {
              ...conv,
              updatedAt: Date.now(),
              messages: conv.messages.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: `Image generation error: ${err.message}`,
                      isError: true,
                    }
                  : m
              ),
            };
          })
        );
      } finally {
        setIsGenerating(false);
      }
    },
    [currentConversationId, conversations, createNewChat]
  );

  const regenerateResponse = useCallback(
    async (messageId: string) => {
      if (!currentConversation || isGenerating) return;

      const msgIndex = currentConversation.messages.findIndex((m) => m.id === messageId);
      if (msgIndex === -1) return;

      const targetAssistantMsg = currentConversation.messages[msgIndex];
      if (targetAssistantMsg.role !== "assistant") return;

      const historyBefore = currentConversation.messages.slice(0, msgIndex);
      if (historyBefore.length === 0) return;

      // Add a new version branch
      const existingVersions = targetAssistantMsg.versions || [targetAssistantMsg.content];
      const updatedVersions = [...existingVersions, ""];

      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== currentConversation.id) return conv;
          return {
            ...conv,
            messages: conv.messages.map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    content: "",
                    sources: undefined,
                    isError: false,
                    versions: updatedVersions,
                    currentVersionIndex: updatedVersions.length - 1,
                  }
                : m
            ),
          };
        })
      );

      await streamAIResponse(currentConversation.id, historyBefore, messageId, true);
    },
    [currentConversation, isGenerating, settings, activeWorkspace, getFormattedMemoryContext]
  );

  const continueResponse = useCallback(
    async (messageId: string) => {
      if (!currentConversation || isGenerating) return;

      const msgIndex = currentConversation.messages.findIndex((m) => m.id === messageId);
      if (msgIndex === -1) return;

      const targetMsg = currentConversation.messages[msgIndex];
      const continueUserMsg: Message = {
        id: generateId(),
        role: "user",
        content: "Please continue directly from where you stopped.",
        timestamp: Date.now(),
      };

      const continueAssistantMsgId = generateId();
      const continueAssistantMsg: Message = {
        id: continueAssistantMsgId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };

      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== currentConversation.id) return conv;
          return {
            ...conv,
            updatedAt: Date.now(),
            messages: [...conv.messages, continueUserMsg, continueAssistantMsg],
          };
        })
      );

      const historyToPass = [
        ...currentConversation.messages.slice(0, msgIndex + 1),
        continueUserMsg,
      ];
      await streamAIResponse(currentConversation.id, historyToPass, continueAssistantMsgId, false);
    },
    [currentConversation, isGenerating, settings, activeWorkspace, getFormattedMemoryContext]
  );

  return (
    <ChatContext.Provider
      value={{
        conversations,
        currentConversation,
        currentConversationId,
        isGenerating,
        settings,
        activeMode: settings.activeMode || "chat",
        setActiveMode,
        updateSettings,
        createNewChat,
        selectConversation,
        renameConversation,
        deleteConversation,
        clearAllConversations,
        togglePinConversation,
        toggleFavoriteConversation,
        toggleArchiveConversation,
        sendMessage,
        generateImageMessage,
        regenerateResponse,
        continueResponse,
        switchMessageVersion,
        stopGenerating,
        setFeedback,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}
