import React, { useState, useEffect, useRef } from "react";
import {
  X,
  ShieldCheck,
  HardDrive,
  Download,
  Upload,
  Trash2,
  Lock,
  Cpu,
  RefreshCw,
  AlertTriangle,
  FileText,
  Check,
} from "lucide-react";
import { StorageService } from "../services/storageService";
import { useChat } from "../context/ChatContext";
import { useMemory } from "../context/MemoryContext";
import { useAuth } from "../context/AuthContext";

interface DataPrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DataPrivacyModal: React.FC<DataPrivacyModalProps> = ({ isOpen, onClose }) => {
  const { clearAllConversations, settings } = useChat();
  const { memories, clearAllMemories } = useMemory();
  const { user } = useAuth();

  const [storageStats, setStorageStats] = useState<any>(null);
  const [importSuccess, setImportSuccess] = useState<boolean | null>(null);
  const [confirmAction, setConfirmAction] = useState<"clearConvs" | "clearAll" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshStats = () => {
    setStorageStats(StorageService.calculateStorageUsage());
  };

  useEffect(() => {
    if (isOpen) {
      refreshStats();
      setConfirmAction(null);
      setImportSuccess(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleExport = () => {
    const json = StorageService.exportAllData();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rsr-ai-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const success = StorageService.importData(content);
        setImportSuccess(success);
        if (success) {
          refreshStats();
          setTimeout(() => {
            window.location.reload();
          }, 1200);
        }
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteConfirm = () => {
    if (confirmAction === "clearConvs") {
      clearAllConversations();
      refreshStats();
    } else if (confirmAction === "clearAll") {
      StorageService.clearAllData();
      clearAllMemories();
      clearAllConversations();
      refreshStats();
      setTimeout(() => window.location.reload(), 500);
    }
    setConfirmAction(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#11141a] text-neutral-900 dark:text-neutral-100 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 id="privacy-modal-title" className="text-sm font-semibold tracking-tight">
                Data & Privacy Center
              </h2>
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Transparent local storage, memory governance, and data autonomy
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs">
          {/* Privacy Guarantee Card */}
          <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-[#151921]/80 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-neutral-100 text-xs">
              <Lock className="w-3.5 h-3.5 text-emerald-500" />
              <span>Zero Silent Tracking & Local-First Philosophy</span>
            </div>
            <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed text-[11px]">
              RSR Nexora operates on strict privacy principles. Your conversation history, workspaces,
              and memories remain in your browser's persistent storage by default. Conversations are
              only forwarded to the AI provider during active generation over encrypted server-side channels.
            </p>
          </div>

          {/* Storage & Usage Metrics */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5" />
              <span>Storage Metrics</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151921]">
                <span className="text-[10px] text-neutral-400 uppercase font-mono">Storage Used</span>
                <p className="text-base font-bold text-neutral-900 dark:text-neutral-100 mt-1">
                  {storageStats?.formattedSize || "0 KB"}
                </p>
              </div>

              <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151921]">
                <span className="text-[10px] text-neutral-400 uppercase font-mono">Conversations</span>
                <p className="text-base font-bold text-neutral-900 dark:text-neutral-100 mt-1">
                  {storageStats?.conversationCount || 0}
                </p>
                <span className="text-[10px] text-neutral-400">
                  {storageStats?.messageCount || 0} messages
                </span>
              </div>

              <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151921]">
                <span className="text-[10px] text-neutral-400 uppercase font-mono">Workspaces</span>
                <p className="text-base font-bold text-neutral-900 dark:text-neutral-100 mt-1">
                  {storageStats?.workspaceCount || 1}
                </p>
              </div>

              <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151921]">
                <span className="text-[10px] text-neutral-400 uppercase font-mono">Memories</span>
                <p className="text-base font-bold text-neutral-900 dark:text-neutral-100 mt-1">
                  {storageStats?.memoryCount || 0}
                </p>
                <span className="text-[10px] text-neutral-400">
                  {settings.memoryEnabled ? "Active" : "Disabled"}
                </span>
              </div>
            </div>
          </div>

          {/* Connected Infrastructure Overview */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" />
              <span>Connected Infrastructure</span>
            </h3>

            <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151921] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-neutral-600 dark:text-neutral-400">AI Model Provider:</span>
                <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                  Google Gemini (Server-Side Proxy)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-600 dark:text-neutral-400">Search Grounding:</span>
                <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                  Google Web Search Grounding
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-600 dark:text-neutral-400">Account Mode:</span>
                <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                  {user.isGuest ? "Guest (Local Storage)" : `Logged In (${user.email})`}
                </span>
              </div>
            </div>
          </div>

          {/* Backup & Portability Actions */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3 flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" />
              <span>Data Portability & Backup</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                id="privacy-export-btn"
                onClick={handleExport}
                className="flex items-center justify-center gap-2 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151921] hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors font-medium cursor-pointer"
              >
                <Download className="w-4 h-4 text-blue-500" />
                <span>Export Full Backup (JSON)</span>
              </button>

              <button
                id="privacy-import-btn"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151921] hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors font-medium cursor-pointer"
              >
                <Upload className="w-4 h-4 text-emerald-500" />
                <span>Restore Backup (JSON)</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportFile}
                className="hidden"
              />
            </div>

            {importSuccess !== null && (
              <div
                className={`mt-2 p-2.5 rounded-lg text-[11px] flex items-center gap-2 ${
                  importSuccess
                    ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
                    : "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400"
                }`}
              >
                {importSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Backup restored successfully! Reloading workspace...</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Failed to parse backup JSON file. Please verify format.</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Danger Zone */}
          <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-red-500 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Danger Zone</span>
            </h3>

            {confirmAction ? (
              <div className="p-4 rounded-xl border border-red-300 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20 space-y-2.5">
                <p className="font-semibold text-red-600 dark:text-red-400">
                  {confirmAction === "clearConvs"
                    ? "Are you sure you want to delete all conversations?"
                    : "Are you sure you want to reset all local data?"}
                </p>
                <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                  This action is permanent and cannot be undone. Consider exporting a backup first.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleExecuteConfirm}
                    className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium text-xs cursor-pointer"
                  >
                    Yes, proceed
                  </button>
                  <button
                    onClick={() => setConfirmAction(null)}
                    className="px-3 py-1.5 rounded-lg bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  id="privacy-clear-convs-btn"
                  onClick={() => setConfirmAction("clearConvs")}
                  className="flex-1 p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:border-red-300 dark:hover:border-red-900/60 text-neutral-700 dark:text-neutral-300 hover:text-red-600 transition-colors cursor-pointer text-left flex items-center justify-between"
                >
                  <span>Clear All Conversations</span>
                  <Trash2 className="w-3.5 h-3.5 opacity-60" />
                </button>

                <button
                  id="privacy-clear-all-btn"
                  onClick={() => setConfirmAction("clearAll")}
                  className="flex-1 p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:border-red-300 dark:hover:border-red-900/60 text-neutral-700 dark:text-neutral-300 hover:text-red-600 transition-colors cursor-pointer text-left flex items-center justify-between"
                >
                  <span>Reset All Local Data</span>
                  <Trash2 className="w-3.5 h-3.5 opacity-60" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-neutral-50 dark:bg-neutral-900/60 border-t border-neutral-200 dark:border-neutral-800 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
