import React, { useState } from "react";
import { X, Copy, Check, Download, Hash, Code2 } from "lucide-react";

interface CodeInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: string;
  code: string;
}

export const CodeInspectorModal: React.FC<CodeInspectorModalProps> = ({
  isOpen,
  onClose,
  language,
  code,
}) => {
  const [copied, setCopied] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);

  if (!isOpen) return null;

  const lines = code.split("\n");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleDownload = () => {
    const extensionMap: Record<string, string> = {
      typescript: "ts",
      javascript: "js",
      tsx: "tsx",
      jsx: "jsx",
      python: "py",
      html: "html",
      css: "css",
      json: "json",
      sql: "sql",
      markdown: "md",
      bash: "sh",
      shell: "sh",
      yaml: "yml",
      rust: "rs",
      go: "go",
    };

    const ext = extensionMap[language.toLowerCase()] || "txt";
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rsr-code-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="code-inspector-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/65 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        className="w-full max-w-4xl h-[80vh] flex flex-col rounded-2xl border border-neutral-800 bg-neutral-950 text-neutral-100 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-neutral-900 border-b border-neutral-800 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-neutral-800 flex items-center justify-center text-blue-400">
              <Code2 className="w-4 h-4" />
            </div>
            <div>
              <h2 id="code-inspector-title" className="text-sm font-semibold tracking-tight text-white">
                Code Inspector
              </h2>
              <span className="text-[11px] text-neutral-400 font-mono lowercase">
                {language || "plain text"} • {lines.length} lines • {code.length} chars
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Toggle Line Numbers */}
            <button
              id="toggle-inspector-lines-btn"
              onClick={() => setShowLineNumbers(!showLineNumbers)}
              className={`p-2 rounded-xl text-xs flex items-center gap-1 transition-colors cursor-pointer ${
                showLineNumbers
                  ? "bg-neutral-800 text-white"
                  : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
              }`}
              title="Toggle line numbers"
            >
              <Hash className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lines</span>
            </button>

            {/* Download Button */}
            <button
              id="download-inspector-code-btn"
              onClick={handleDownload}
              className="p-2 rounded-xl text-xs flex items-center gap-1 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
              title="Download code file"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>

            {/* Copy Button */}
            <button
              id="copy-inspector-code-btn"
              onClick={handleCopy}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer"
              title="Copy all code"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>

            {/* Close Button */}
            <button
              id="close-inspector-btn"
              onClick={onClose}
              className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer ml-1"
              aria-label="Close code inspector"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Code Content View */}
        <div className="flex-1 overflow-auto p-4 font-mono text-[13px] leading-relaxed select-text bg-[#0d0f14]">
          <div className="table w-full border-collapse">
            {lines.map((line, idx) => (
              <div key={idx} className="table-row hover:bg-neutral-900/60">
                {showLineNumbers && (
                  <span className="table-cell text-right pr-4 pl-1 text-neutral-400 select-none text-[11px] w-10 border-r border-neutral-800/80">
                    {idx + 1}
                  </span>
                )}
                <span className="table-cell pl-4 whitespace-pre font-mono text-neutral-200">
                  {line || " "}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
