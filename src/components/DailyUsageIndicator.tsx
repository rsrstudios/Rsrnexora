import React, { useState, useEffect, useCallback } from "react";
import { Zap, AlertCircle, ChevronDown, ChevronUp, Clock, MessageSquare, Image, Search, FileText, Sparkles, Crown } from "lucide-react";

interface ResourceUsage {
  used: number;
  limit: number;
  remaining: number;
}

interface UsageData {
  plan: "free" | "plus" | "pro" | "ultra" | "premium" | "guest";
  date: string;
  messages: ResourceUsage;
  images: ResourceUsage;
  searches: ResourceUsage;
  files: ResourceUsage;
}

export const DailyUsageIndicator: React.FC = () => {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchUsage = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/usage", {
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setUsage(data);
      }
    } catch {
      // Gracefully ignore fetch errors
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();

    const handleRefresh = () => {
      fetchUsage();
    };

    window.addEventListener("rsr:refresh-usage", handleRefresh);
    window.addEventListener("focus", handleRefresh);
    const interval = setInterval(fetchUsage, 60000);

    return () => {
      window.removeEventListener("rsr:refresh-usage", handleRefresh);
      window.removeEventListener("focus", handleRefresh);
      clearInterval(interval);
    };
  }, [fetchUsage]);

  const handleOpenPlans = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent("rsr:open-subscription"));
  };

  if (!usage) return null;

  const planLabel = {
    free: "Nexora Free",
    plus: "Nexora Plus",
    pro: "Nexora Pro",
    ultra: "Nexora Ultra",
    premium: "Nexora Ultra",
    guest: "Guest Mode",
  }[usage.plan] || "Standard";

  const isLimitReached =
    usage.messages.remaining <= 0 ||
    usage.images.remaining <= 0 ||
    usage.searches.remaining <= 0 ||
    usage.files.remaining <= 0;

  const isMaxTier = usage.plan === "ultra" || usage.plan === "premium";

  const messagesPercent = Math.min(100, Math.round((usage.messages.used / usage.messages.limit) * 100));
  const imagesPercent = Math.min(100, Math.round((usage.images.used / usage.images.limit) * 100));
  const searchesPercent = Math.min(100, Math.round((usage.searches.used / usage.searches.limit) * 100));
  const filesPercent = Math.min(100, Math.round((usage.files.used / usage.files.limit) * 100));

  return (
    <div
      id="daily-usage-indicator"
      className="w-full bg-neutral-100/80 dark:bg-[#121620] border border-neutral-200/80 dark:border-neutral-800/80 rounded-2xl p-2.5 transition-all text-neutral-800 dark:text-neutral-200"
    >
      {/* Header bar */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-left cursor-pointer hover:opacity-90 transition-opacity"
        aria-expanded={isExpanded}
        aria-label="Toggle daily usage breakdown"
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <Zap className="w-3 h-3" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold">{planLabel}</span>
              {isLimitReached && (
                <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  Limit Reached
                </span>
              )}
            </div>
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
              {usage.messages.remaining} msg{usage.messages.remaining === 1 ? "" : "s"} left today
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-neutral-400">
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {/* Progress meter for primary messages quota */}
      <div className="mt-2 w-full bg-neutral-200 dark:bg-neutral-800 h-1.5 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            messagesPercent >= 100
              ? "bg-amber-500"
              : messagesPercent >= 80
              ? "bg-orange-500"
              : "bg-indigo-500"
          }`}
          style={{ width: `${messagesPercent}%` }}
        />
      </div>

      {/* Expanded breakdown */}
      {isExpanded && (
        <div className="mt-3 pt-2.5 border-t border-neutral-200/60 dark:border-neutral-800/60 space-y-2 text-xs">
          {/* Messages */}
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
              <MessageSquare className="w-3 h-3 text-indigo-500" />
              Messages
            </span>
            <span className="font-mono text-[10px] font-medium">
              {usage.messages.used} / {usage.messages.limit}
            </span>
          </div>
          <div className="w-full bg-neutral-200 dark:bg-neutral-800 h-1 rounded-full overflow-hidden">
            <div
              className={`h-full ${messagesPercent >= 100 ? "bg-amber-500" : "bg-indigo-500"}`}
              style={{ width: `${messagesPercent}%` }}
            />
          </div>

          {/* Images */}
          <div className="flex items-center justify-between text-[11px] pt-1">
            <span className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
              <Image className="w-3 h-3 text-pink-500" />
              Images
            </span>
            <span className="font-mono text-[10px] font-medium">
              {usage.images.used} / {usage.images.limit}
            </span>
          </div>
          <div className="w-full bg-neutral-200 dark:bg-neutral-800 h-1 rounded-full overflow-hidden">
            <div
              className={`h-full ${imagesPercent >= 100 ? "bg-amber-500" : "bg-pink-500"}`}
              style={{ width: `${imagesPercent}%` }}
            />
          </div>

          {/* Searches */}
          <div className="flex items-center justify-between text-[11px] pt-1">
            <span className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
              <Search className="w-3 h-3 text-emerald-500" />
              Searches
            </span>
            <span className="font-mono text-[10px] font-medium">
              {usage.searches.used} / {usage.searches.limit}
            </span>
          </div>
          <div className="w-full bg-neutral-200 dark:bg-neutral-800 h-1 rounded-full overflow-hidden">
            <div
              className={`h-full ${searchesPercent >= 100 ? "bg-amber-500" : "bg-emerald-500"}`}
              style={{ width: `${searchesPercent}%` }}
            />
          </div>

          {/* Files */}
          <div className="flex items-center justify-between text-[11px] pt-1">
            <span className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
              <FileText className="w-3 h-3 text-cyan-500" />
              Files
            </span>
            <span className="font-mono text-[10px] font-medium">
              {usage.files.used} / {usage.files.limit}
            </span>
          </div>
          <div className="w-full bg-neutral-200 dark:bg-neutral-800 h-1 rounded-full overflow-hidden">
            <div
              className={`h-full ${filesPercent >= 100 ? "bg-amber-500" : "bg-cyan-500"}`}
              style={{ width: `${filesPercent}%` }}
            />
          </div>

          {/* Limit Reached Notice if applicable */}
          {isLimitReached && (
            <div className="mt-2.5 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] flex flex-col gap-1.5">
              <div className="flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>You&apos;ve reached today&apos;s limit. Your limit will reset tomorrow.</span>
              </div>
              {!isMaxTier && (
                <button
                  type="button"
                  onClick={handleOpenPlans}
                  className="mt-1 w-full py-1 px-2 rounded-lg bg-amber-500 text-white dark:text-neutral-900 font-medium text-[10px] flex items-center justify-center gap-1 hover:bg-amber-600 transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  Upgrade for higher daily limits
                </button>
              )}
            </div>
          )}

          {/* Upgrade CTA if not reached limit but not max tier */}
          {!isLimitReached && !isMaxTier && (
            <button
              type="button"
              onClick={handleOpenPlans}
              className="mt-2.5 w-full py-1.5 px-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/15 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-medium text-[10px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Crown className="w-3 h-3" />
              View Nexora Plans & Upgrades
            </button>
          )}

          {/* Reset Indicator */}
          <div className="pt-2 flex items-center justify-between text-[9px] text-neutral-400 dark:text-neutral-500">
            <span className="flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              Resets daily at 00:00 UTC
            </span>
            <span>Date: {usage.date}</span>
          </div>
        </div>
      )}
    </div>
  );
};
