import React, { createContext, useContext, useState, useEffect } from "react";
import { MemoryItem } from "../types";

const MEMORY_STORAGE_KEY = "rsr_ai_memories_v2";

interface MemoryContextType {
  memories: MemoryItem[];
  addMemory: (content: string, category?: MemoryItem["category"]) => void;
  updateMemory: (id: string, content: string, category?: MemoryItem["category"]) => void;
  deleteMemory: (id: string) => void;
  clearAllMemories: () => void;
  getFormattedMemoryContext: () => string;
}

const MemoryContext = createContext<MemoryContextType | undefined>(undefined);

const DEFAULT_MEMORIES: MemoryItem[] = [
  {
    id: "mem_welcome_1",
    content: "Prefers clean, modular code with concise technical explanations.",
    category: "preference",
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now() - 3600000,
  },
];

export const MemoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [memories, setMemories] = useState<MemoryItem[]>(() => {
    if (typeof window === "undefined") return DEFAULT_MEMORIES;
    try {
      const saved = localStorage.getItem(MEMORY_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to load memories from localStorage:", e);
    }
    return DEFAULT_MEMORIES;
  });

  useEffect(() => {
    try {
      localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(memories));
    } catch (e) {
      console.error("Failed to persist memories to localStorage:", e);
    }
  }, [memories]);

  const addMemory = (content: string, category: MemoryItem["category"] = "preference") => {
    if (!content.trim()) return;
    const newMemory: MemoryItem = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      content: content.trim(),
      category,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setMemories((prev) => [newMemory, ...prev]);
  };

  const updateMemory = (
    id: string,
    content: string,
    category?: MemoryItem["category"]
  ) => {
    setMemories((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              content: content.trim(),
              category: category || m.category,
              updatedAt: Date.now(),
            }
          : m
      )
    );
  };

  const deleteMemory = (id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
  };

  const clearAllMemories = () => {
    setMemories([]);
  };

  const getFormattedMemoryContext = (): string => {
    if (memories.length === 0) return "";
    const list = memories.map((m) => `- [${m.category}] ${m.content}`).join("\n");
    return `\nUser Preferences & Custom Memories (explicitly saved by user):\n${list}\n`;
  };

  return (
    <MemoryContext.Provider
      value={{
        memories,
        addMemory,
        updateMemory,
        deleteMemory,
        clearAllMemories,
        getFormattedMemoryContext,
      }}
    >
      {children}
    </MemoryContext.Provider>
  );
};

export const useMemory = () => {
  const context = useContext(MemoryContext);
  if (!context) {
    throw new Error("useMemory must be used within a MemoryProvider");
  }
  return context;
};
