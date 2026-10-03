import React from "react";
import { FileText, FileCode, CheckCircle2, Sparkles, BookOpen, ChevronRight } from "lucide-react";
import { MessageAttachment } from "../types";

interface DocumentContextBadgeProps {
  attachments: MessageAttachment[];
  onQuickPrompt?: (prompt: string) => void;
}

export const DocumentContextBadge: React.FC<DocumentContextBadgeProps> = ({
  attachments,
  onQuickPrompt,
}) => {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="mb-2 p-2.5 rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 bg-neutral-50/90 dark:bg-[#151921]/90 backdrop-blur-xs text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-medium text-neutral-800 dark:text-neutral-200">
          <FileText className="w-3.5 h-3.5 text-blue-500" />
          <span>Active Document Intelligence ({attachments.length} attached)</span>
        </div>
        <span className="text-[10px] text-neutral-400 font-mono">Parsed & Indexed</span>
      </div>

      {/* Attachment Pills */}
      <div className="flex flex-wrap gap-1.5">
        {attachments.map((att) => {
          const isCode = att.fileCategory === "code";
          const isPdf = att.fileCategory === "pdf";

          return (
            <div
              key={att.id}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200/60 dark:border-neutral-700/60 text-[11px] text-neutral-700 dark:text-neutral-300 shadow-2xs"
            >
              {isCode ? (
                <FileCode className="w-3 h-3 text-emerald-500" />
              ) : (
                <FileText className="w-3 h-3 text-blue-500" />
              )}
              <span className="font-medium max-w-[140px] truncate">{att.name}</span>
              <span className="text-[9px] text-neutral-400 font-mono">
                {(att.size / 1024).toFixed(0)}KB
              </span>
              {att.headings && att.headings.length > 0 && (
                <span className="text-[9px] px-1 py-0.2 rounded-sm bg-neutral-100 dark:bg-neutral-700 text-neutral-500 font-mono">
                  {att.headings.length} sections
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick Analysis Actions */}
      {onQuickPrompt && (
        <div className="flex items-center gap-1.5 pt-1 border-t border-neutral-200/40 dark:border-neutral-800/40 text-[11px]">
          <span className="text-neutral-400">Quick actions:</span>
          <button
            onClick={() =>
              onQuickPrompt(
                `Provide an executive summary of the attached document(s) with key points and implications.`
              )
            }
            className="px-2 py-0.5 rounded-md bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer"
          >
            Summarize
          </button>
          <button
            onClick={() =>
              onQuickPrompt(
                `Extract the top 5 key takeaways, facts, and actionable insights from the attached file(s).`
              )
            }
            className="px-2 py-0.5 rounded-md bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer"
          >
            Key Takeaways
          </button>
          <button
            onClick={() =>
              onQuickPrompt(
                `Outline the structure and identify any potential contradictions or ambiguities in this document.`
              )
            }
            className="px-2 py-0.5 rounded-md bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer"
          >
            Structure & Audit
          </button>
        </div>
      )}
    </div>
  );
};
