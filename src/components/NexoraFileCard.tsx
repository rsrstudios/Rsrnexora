import React, { useState } from "react";
import {
  Download,
  Check,
  FileText,
  Table,
  Presentation,
  Code2,
  FileCode,
  File,
  ExternalLink,
  Sparkles,
} from "lucide-react";

export interface NexoraFileCardProps {
  id?: string;
  filename: string;
  fileType: string;
  mimeType?: string;
  sizeBytes?: number;
  downloadUrl?: string;
  createdAt?: number;
  compact?: boolean;
}

export const NexoraFileCard: React.FC<NexoraFileCardProps> = ({
  id,
  filename,
  fileType,
  mimeType,
  sizeBytes,
  downloadUrl,
  createdAt,
  compact = false,
}) => {
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const cleanExt = (fileType || filename.split(".").pop() || "file").toLowerCase();

  const formatSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return "Ready";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFormatTheme = () => {
    switch (cleanExt) {
      case "pdf":
        return {
          icon: FileText,
          bg: "bg-red-500/10 dark:bg-red-500/20",
          border: "border-red-500/30",
          text: "text-red-600 dark:text-red-400",
          badgeBg: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
          label: "PDF Document",
        };
      case "docx":
      case "doc":
      case "rtf":
        return {
          icon: FileText,
          bg: "bg-blue-500/10 dark:bg-blue-500/20",
          border: "border-blue-500/30",
          text: "text-blue-600 dark:text-blue-400",
          badgeBg: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
          label: cleanExt === "rtf" ? "RTF Document" : "Word Document",
        };
      case "xlsx":
      case "xls":
      case "csv":
        return {
          icon: Table,
          bg: "bg-emerald-500/10 dark:bg-emerald-500/20",
          border: "border-emerald-500/30",
          text: "text-emerald-600 dark:text-emerald-400",
          badgeBg: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
          label: cleanExt === "csv" ? "CSV Table" : "Excel Sheet",
        };
      case "pptx":
      case "ppt":
        return {
          icon: Presentation,
          bg: "bg-amber-500/10 dark:bg-amber-500/20",
          border: "border-amber-500/30",
          text: "text-amber-600 dark:text-amber-400",
          badgeBg: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
          label: "PowerPoint Deck",
        };
      case "json":
        return {
          icon: FileCode,
          bg: "bg-purple-500/10 dark:bg-purple-500/20",
          border: "border-purple-500/30",
          text: "text-purple-600 dark:text-purple-400",
          badgeBg: "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300",
          label: "JSON File",
        };
      case "md":
        return {
          icon: FileText,
          bg: "bg-indigo-500/10 dark:bg-indigo-500/20",
          border: "border-indigo-500/30",
          text: "text-indigo-600 dark:text-indigo-400",
          badgeBg: "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300",
          label: "Markdown File",
        };
      default:
        return {
          icon: File,
          bg: "bg-neutral-500/10 dark:bg-neutral-500/20",
          border: "border-neutral-500/30",
          text: "text-neutral-600 dark:text-neutral-400",
          badgeBg: "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300",
          label: "Text File",
        };
    }
  };

  const theme = getFormatTheme();
  const Icon = theme.icon;

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);

    try {
      const url = downloadUrl || (id ? `/api/files/download/${id}` : `/api/files/${encodeURIComponent(filename)}`);
      
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2500);
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className={`my-2.5 rounded-xl border ${theme.border} bg-white dark:bg-[#141820] shadow-xs overflow-hidden transition-all duration-150 hover:shadow-md ${
        compact ? "p-2.5" : "p-3.5"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Left: Icon & File Meta */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-lg ${theme.bg} ${theme.border} border flex items-center justify-center flex-shrink-0`}
          >
            <Icon className={`w-5 h-5 ${theme.text}`} />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs md:text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate block">
                {filename}
              </span>
              <span
                className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded font-semibold ${theme.badgeBg}`}
              >
                {cleanExt}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
              <span>{theme.label}</span>
              <span>•</span>
              <span>{formatSize(sizeBytes)}</span>
              <span>•</span>
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Sparkles className="w-2.5 h-2.5" />
                RSR Nexora File Maker
              </span>
            </div>
          </div>
        </div>

        {/* Right: Download Action Button */}
        <button
          onClick={handleDownload}
          disabled={downloading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex-shrink-0 ${
            downloaded
              ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
              : "bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:hover:bg-neutral-100 dark:text-neutral-900 shadow-2xs"
          }`}
          title={`Download ${filename}`}
          aria-label={`Download ${filename}`}
        >
          {downloaded ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Saved</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
