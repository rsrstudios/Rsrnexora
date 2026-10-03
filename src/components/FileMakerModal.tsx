import React, { useState } from "react";
import {
  X,
  Sparkles,
  Download,
  FileText,
  Table,
  Presentation,
  Code2,
  FileCode,
  File,
  Check,
  Loader2,
  Layers,
  ArrowRight,
} from "lucide-react";
import { useChat } from "../context/ChatContext";
import { NexoraFileCard } from "./NexoraFileCard";

interface FileMakerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type FileMakerFormat = "pdf" | "docx" | "xlsx" | "pptx" | "csv" | "json" | "rtf" | "md" | "txt";

interface FormatOption {
  id: FileMakerFormat;
  label: string;
  ext: string;
  icon: React.ElementType;
  badgeColor: string;
  description: string;
  defaultTitle: string;
  defaultContent: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    id: "pdf",
    label: "PDF Report",
    ext: ".pdf",
    icon: FileText,
    badgeColor: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
    description: "Portable Document Format for formal reports & summaries",
    defaultTitle: "Executive Summary & Strategy Report",
    defaultContent: "1. Executive Overview\n2. Key Performance Indicators\n3. Strategic Roadmap\n4. Risk Mitigation & Compliance\n5. Next Quarter Milestones",
  },
  {
    id: "docx",
    label: "Word Document",
    ext: ".docx",
    icon: FileText,
    badgeColor: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
    description: "Standard Microsoft Word OpenXML document with formatted headings",
    defaultTitle: "Project Scope & Proposal Document",
    defaultContent: "Project Title: Next-Generation Enterprise AI Platform\n\nBackground & Objectives:\nThis document details the architectural specifications, milestones, and deliverable timelines for RSR Nexora integration.\n\nKey Requirements:\n- High-availability multi-provider orchestration\n- Native voice synthesis and streaming tokens\n- Enterprise cryptographic audit logging",
  },
  {
    id: "xlsx",
    label: "Excel Spreadsheet",
    ext: ".xlsx",
    icon: Table,
    badgeColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    description: "Standard Microsoft Excel OpenXML workbook with multi-cell grid",
    defaultTitle: "Monthly Operating Budget & Analytics",
    defaultContent: "Item,Category,Budget (INR),Actual (INR),Variance\nCloud Infrastructure,Engineering,15000,14200,+800\nAPI Intelligence Quota,AI Services,25000,23400,+1600\nSecurity Auditing,Compliance,10000,9500,+500\nTotal,All Operations,50000,47100,+2900",
  },
  {
    id: "pptx",
    label: "PowerPoint Deck",
    ext: ".pptx",
    icon: Presentation,
    badgeColor: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    description: "Microsoft PowerPoint presentation slides with slide layout",
    defaultTitle: "RSR Nexora — AI Platform Overview",
    defaultContent: "Key Highlights: Advanced Orchestration, Sub-second Latency, Multi-model Fallbacks, Strict Privacy Controls.",
  },
  {
    id: "csv",
    label: "CSV Dataset",
    ext: ".csv",
    icon: Table,
    badgeColor: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30",
    description: "Comma-separated tabular data universally readable by any database",
    defaultTitle: "Customer Accounts & Status",
    defaultContent: "User ID,Name,Tier,Status,Last Active\nusr_101,Rahul Sharma,Pro,Active,2026-09-25\nusr_102,Priya Patel,Plus,Active,2026-09-24\nusr_103,Amit Verma,Ultra,Active,2026-09-25",
  },
  {
    id: "json",
    label: "JSON Configuration",
    ext: ".json",
    icon: FileCode,
    badgeColor: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
    description: "Formatted JSON schema for configurations, APIs, and data storage",
    defaultTitle: "Application Configuration Schema",
    defaultContent: '{\n  "appName": "RSR Nexora",\n  "version": "7.0.0",\n  "features": {\n    "voiceAssistant": true,\n    "fileMaker": true,\n    "codeInspector": true,\n    "liveSearch": true\n  },\n  "environment": "production"\n}',
  },
  {
    id: "rtf",
    label: "Rich Text Format",
    ext: ".rtf",
    icon: FileText,
    badgeColor: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
    description: "Rich text format supported across macOS, Windows, and Linux",
    defaultTitle: "Official Announcement & Release Notes",
    defaultContent: "RSR Nexora 7.0 Release Notes:\n- Integrated File Maker engine (PDF, Word, Excel, PowerPoint, CSV, JSON, RTF)\n- Natural Indian-English & Hindi Voice Assistant\n- Enterprise project-aware coding mode",
  },
  {
    id: "md",
    label: "Markdown File",
    ext: ".md",
    icon: FileText,
    badgeColor: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
    description: "Structured markdown file ready for GitHub, Notion, or documentation",
    defaultTitle: "Documentation & Architecture Guide",
    defaultContent: "# System Architecture\n\n## Overview\nRSR Nexora utilizes a 10-tier fallback orchestrator with server-authoritative state.\n\n## Getting Started\nClone the repository and run `npm run dev`.",
  },
  {
    id: "txt",
    label: "Plain Text",
    ext: ".txt",
    icon: File,
    badgeColor: "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border-neutral-500/30",
    description: "Simple UTF-8 text file compatible with any editor",
    defaultTitle: "Notes & Task Log",
    defaultContent: "Task List:\n[x] Upgrade Voice Assistant with Hinglish/Hindi accents\n[x] Implement File Maker with 9 downloadable formats\n[x] Verify server-authoritative live clock",
  },
];

export const FileMakerModal: React.FC<FileMakerModalProps> = ({ isOpen, onClose }) => {
  const { currentConversation, sendMessage } = useChat();

  const [selectedFormat, setSelectedFormat] = useState<FileMakerFormat>("pdf");
  const [filename, setFilename] = useState("nexora_report");
  const [title, setTitle] = useState("Executive Summary & Strategy Report");
  const [content, setContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdFile, setCreatedFile] = useState<{
    id: string;
    filename: string;
    fileType: string;
    mimeType: string;
    sizeBytes: number;
    downloadUrl: string;
  } | null>(null);

  if (!isOpen) return null;

  const currentOption =
    FORMAT_OPTIONS.find((f) => f.id === selectedFormat) || FORMAT_OPTIONS[0];

  const handleSelectFormat = (fmt: FileMakerFormat) => {
    setSelectedFormat(fmt);
    const opt = FORMAT_OPTIONS.find((f) => f.id === fmt);
    if (opt) {
      setFilename(`nexora_${fmt}_document`);
      setTitle(opt.defaultTitle);
      setContent(opt.defaultContent);
      setCreatedFile(null);
      setErrorMsg(null);
    }
  };

  const handleCreateFile = async () => {
    setErrorMsg(null);
    setIsGenerating(true);

    try {
      const payload = {
        fileType: selectedFormat,
        filename: filename.trim() || `nexora_${selectedFormat}`,
        title: title.trim(),
        content: content.trim() || currentOption.defaultContent,
      };

      const res = await fetch("/api/files/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error?.message || "Failed to generate file.");
      }

      setCreatedFile(data.file);

      // Trigger usage refresh
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("rsr:refresh-usage"));
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create file.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveToChat = () => {
    if (!createdFile) return;
    const msgText = `I have generated the requested **${currentOption.label}**: **${createdFile.filename}** (${(
      createdFile.sizeBytes / 1024
    ).toFixed(1)} KB).\n\nYou can download it directly: [Download ${createdFile.filename}](${createdFile.downloadUrl})`;
    sendMessage(msgText);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#11141b] rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
                RSR Nexora File Maker
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Generate downloadable PDF, Word, Excel, PowerPoint, CSV, JSON, and text files
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Container */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Format Picker */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
              Select Output Format:
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {FORMAT_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSel = selectedFormat === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleSelectFormat(opt.id)}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      isSel
                        ? "border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 shadow-xs"
                        : "border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/60"
                    }`}
                  >
                    <Icon className="w-4 h-4 mb-1" />
                    <span className="text-xs font-bold uppercase">{opt.id}</span>
                    <span className="text-[10px] opacity-75">{opt.ext}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Format Description Banner */}
          <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs">
            <span className="text-neutral-600 dark:text-neutral-300">
              {currentOption.description}
            </span>
            <span
              className={`px-2 py-0.5 rounded font-mono font-semibold text-[10px] ${currentOption.badgeColor}`}
            >
              {currentOption.label}
            </span>
          </div>

          {/* Filename & Document Title */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Filename:
              </label>
              <div className="flex items-center">
                <input
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  placeholder="document_name"
                  className="flex-1 px-3 py-2 text-xs rounded-l-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-hidden focus:border-blue-500"
                />
                <span className="px-2.5 py-2 text-xs font-mono font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-l-0 border-neutral-200 dark:border-neutral-700 rounded-r-lg">
                  {currentOption.ext}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Document / Header Title:
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Q3 Strategic Planning"
                className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-hidden focus:border-blue-500"
              />
            </div>
          </div>

          {/* Content Editor */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                File Content / Data:
              </label>
              <span className="text-[11px] text-neutral-400">
                {selectedFormat === "csv" || selectedFormat === "xlsx"
                  ? "Comma-separated rows"
                  : selectedFormat === "json"
                  ? "Standard JSON format"
                  : "Formatted lines & paragraphs"}
              </span>
            </div>
            <textarea
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter document text or data..."
              className="w-full p-3 text-xs font-mono rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-hidden focus:border-blue-500 resize-none leading-relaxed"
            />
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
              {errorMsg}
            </div>
          )}

          {/* Successfully Generated File Card */}
          {createdFile && (
            <div className="space-y-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                File Generated Successfully:
              </span>
              <NexoraFileCard
                id={createdFile.id}
                filename={createdFile.filename}
                fileType={createdFile.fileType}
                mimeType={createdFile.mimeType}
                sizeBytes={createdFile.sizeBytes}
                downloadUrl={createdFile.downloadUrl}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 flex items-center justify-between">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            Powered by RSR Studios
          </span>

          <div className="flex items-center gap-2">
            {createdFile && (
              <button
                onClick={handleSaveToChat}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Send to Chat
              </button>
            )}

            <button
              onClick={handleCreateFile}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:hover:bg-neutral-100 dark:text-neutral-900 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Creating File...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate File</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
