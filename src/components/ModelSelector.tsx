import React, { useState, useEffect, useRef } from "react";
import { Zap, Scale, Sparkles, ChevronDown, Check } from "lucide-react";
import { useChat } from "../context/ChatContext";
import { ModelTier, ModelOption } from "../types";

const FALLBACK_MODELS: ModelOption[] = [
  {
    id: "fast",
    name: "Fast",
    tier: "fast",
    description: "Ultra-low latency for quick answers and summaries",
    isAvailable: true,
  },
  {
    id: "balanced",
    name: "Balanced",
    tier: "balanced",
    description: "Standard model optimized for general conversation and coding",
    isAvailable: true,
  },
  {
    id: "advanced",
    name: "Advanced",
    tier: "advanced",
    description: "Deep reasoning and complex multimodal problem solving",
    isAvailable: true,
  },
];

export const ModelSelector: React.FC = () => {
  const { settings, updateSettings, isGenerating } = useChat();
  const [isOpen, setIsOpen] = useState(false);
  const [models, setModels] = useState<ModelOption[]>(FALLBACK_MODELS);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/models")
      .then((res) => res.json())
      .then((data) => {
        if (data.models && Array.isArray(data.models)) {
          setModels(data.models);
        }
      })
      .catch(() => {
        // use fallback models
      });
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleOutside);
    }
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [isOpen]);

  const currentModel =
    models.find((m) => m.tier === settings.selectedModel) || models[1] || FALLBACK_MODELS[1];

  const getTierIcon = (tier: ModelTier) => {
    switch (tier) {
      case "fast":
        return <Zap className="w-3.5 h-3.5 text-amber-500" />;
      case "balanced":
        return <Scale className="w-3.5 h-3.5 text-blue-500" />;
      case "advanced":
        return <Sparkles className="w-3.5 h-3.5 text-purple-500" />;
    }
  };

  const handleSelect = (tier: ModelTier, isAvailable: boolean) => {
    if (!isAvailable) return;
    updateSettings({ selectedModel: tier });
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        id="model-selector-btn"
        type="button"
        disabled={isGenerating}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium bg-neutral-100/90 dark:bg-neutral-800/90 hover:bg-neutral-200/80 dark:hover:bg-neutral-750 text-neutral-800 dark:text-neutral-200 border border-neutral-200/80 dark:border-neutral-700/60 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
      >
        {getTierIcon(currentModel.tier)}
        <span className="font-medium tracking-tight">{currentModel.name}</span>
        <ChevronDown className={`w-3 h-3 text-neutral-400 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-1.5 left-0 z-50 w-64 rounded-2xl bg-white dark:bg-[#161a22] border border-neutral-200 dark:border-neutral-800 shadow-xl overflow-hidden p-1.5 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 border-b border-neutral-100 dark:border-neutral-800/60 mb-1">
            Intelligence Tier
          </div>

          <div className="space-y-1">
            {models.map((opt) => {
              const isSelected = opt.tier === settings.selectedModel;
              return (
                <button
                  key={opt.id}
                  disabled={!opt.isAvailable}
                  onClick={() => handleSelect(opt.tier, opt.isAvailable)}
                  className={`w-full flex items-start gap-2.5 p-2 rounded-xl text-left transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-neutral-100 dark:bg-neutral-800/80 text-neutral-900 dark:text-neutral-100"
                      : opt.isAvailable
                      ? "hover:bg-neutral-50 dark:hover:bg-neutral-850 text-neutral-700 dark:text-neutral-300"
                      : "opacity-40 cursor-not-allowed text-neutral-400"
                  }`}
                >
                  <div className="mt-0.5">{getTierIcon(opt.tier)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                        {opt.name}
                      </span>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-blue-500" />
                      )}
                      {!opt.isAvailable && (
                        <span className="text-[10px] text-amber-500 font-mono">
                          API Key Required
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-tight mt-0.5">
                      {opt.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
