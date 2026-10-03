import React, { useState } from "react";
import Markdown from "react-markdown";
import { Check, Copy, Download, Maximize2, ChevronDown, ChevronUp } from "lucide-react";
import { CodeInspectorModal } from "./CodeInspectorModal";

interface MarkdownRendererProps {
  content: string;
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);

  const lines = code.split("\n");
  const isLong = lines.length > 16;
  const displayCode = isLong && !isExpanded ? lines.slice(0, 14).join("\n") : code;

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
    };
    const ext = extensionMap[language.toLowerCase()] || "txt";
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rsr-${language || "code"}-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="relative my-3 rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-[#0d0f14] text-neutral-100 text-xs shadow-xs">
        {/* Code Header Bar */}
        <div className="flex items-center justify-between px-3.5 py-2 bg-neutral-900/90 border-b border-neutral-800 text-neutral-300 font-mono text-[11px]">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-200 lowercase tracking-wide">
              {language || "code"}
            </span>
            <span className="text-neutral-400">• {lines.length} lines</span>
          </div>

          <div className="flex items-center gap-1">
            {/* Open Inspector */}
            <button
              onClick={() => setIsInspectorOpen(true)}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
              title="Open in Code Inspector"
              aria-label="Open in Code Inspector"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>

            {/* Download File */}
            <button
              onClick={handleDownload}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
              title="Download code file"
              aria-label="Download code file"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            {/* Copy Button */}
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
              title="Copy code"
              aria-label="Copy code to clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-sans">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="font-sans">Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Code Content */}
        <pre className="p-4 overflow-x-auto font-mono text-[13px] leading-relaxed text-neutral-200">
          <code>{displayCode}</code>
        </pre>

        {/* Expand / Collapse Button if long */}
        {isLong && (
          <div className="border-t border-neutral-800/80 bg-neutral-900/60 p-1.5 text-center">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-400 hover:text-white transition-colors cursor-pointer"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  <span>Collapse code</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  <span>Show all {lines.length} lines</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Code Inspector Full View Modal */}
      <CodeInspectorModal
        isOpen={isInspectorOpen}
        onClose={() => setIsInspectorOpen(false)}
        language={language}
        code={code}
      />
    </>
  );
}

const MarkdownRendererComponent: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className="markdown-body space-y-3 leading-relaxed text-[15px]">
      <Markdown
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !match && !String(children).includes("\n");
            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded text-[13px] font-mono bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700/60"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <CodeBlock
                language={match ? match[1] : ""}
                code={String(children).replace(/\n$/, "")}
              />
            );
          },
          p({ children }) {
            return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>;
          },
          ul({ children }) {
            return <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>;
          },
          li({ children }) {
            return <li className="leading-relaxed">{children}</li>;
          },
          h1({ children }) {
            return <h1 className="text-xl font-semibold mt-4 mb-2 tracking-tight">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-lg font-semibold mt-3 mb-2 tracking-tight">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-base font-semibold mt-2.5 mb-1.5">{children}</h3>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-neutral-300 dark:border-neutral-700 pl-3.5 py-0.5 my-2 italic text-neutral-600 dark:text-neutral-400">
                {children}
              </blockquote>
            );
          },
          a({ href, children }) {
            // Strict URI sanitization to block javascript: and XSS vectors
            const safeHref =
              typeof href === "string" &&
              (href.startsWith("https://") || href.startsWith("http://") || href.startsWith("mailto:"))
                ? href
                : "#";

            return (
              <a
                href={safeHref}
                target={safeHref !== "#" ? "_blank" : undefined}
                rel="noreferrer noopener"
                className="text-blue-600 dark:text-blue-400 hover:underline underline-offset-2 font-medium"
              >
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-3 border border-neutral-200 dark:border-neutral-800 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  {children}
                </table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="p-2.5 font-semibold bg-neutral-100 dark:bg-neutral-800/80 border-b border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="p-2.5 border-b border-neutral-200 dark:border-neutral-800 last:border-0">
                {children}
              </td>
            );
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
};

export const MarkdownRenderer = React.memo(MarkdownRendererComponent);
