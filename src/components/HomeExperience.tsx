import React from "react";
import {
  Globe,
  Image as ImageIcon,
  Mic,
  FileText,
  Terminal,
  Lightbulb,
  Sparkles,
  BookOpen,
  ArrowRight,
  Clock,
  Code2,
  PenTool,
  Table,
} from "lucide-react";
import { useChat } from "../context/ChatContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { RSRLogo } from "./RSRLogo";
import { SmartModeSelector } from "./SmartModeSelector";
import { SmartMode } from "../types";

interface HomeExperienceProps {
  onSelectPrompt: (prompt: string) => void;
  onOpenVoiceModal: () => void;
  onOpenImageModal: () => void;
  onOpenFileMakerModal?: () => void;
  onTriggerFileUpload: () => void;
}

// Curated prompt suggestions based on selected mode
const MODE_PROMPTS: Record<
  SmartMode,
  Array<{ title: string; prompt: string; icon: React.ElementType }>
> = {
  chat: [
    {
      title: "Explain intuitive concepts",
      prompt: "Explain how neural networks learn patterns in intuitive, plain English.",
      icon: Lightbulb,
    },
    {
      title: "Clean architecture principles",
      prompt: "What are the 5 core tenets of writing maintainable, decoupled software systems?",
      icon: BookOpen,
    },
    {
      title: "Current real-time check",
      prompt: "What time is it right now, and what is today's full date?",
      icon: Clock,
    },
    {
      title: "Creative ideation",
      prompt: "Brainstorm 5 innovative, minimal product concepts for developer productivity.",
      icon: Terminal,
    },
  ],
  research: [
    {
      title: "Current tech developments",
      prompt: "What are the latest verified developments in multimodal AI architectures this month?",
      icon: Globe,
    },
    {
      title: "Comparative analysis",
      prompt: "Compare modern frontend build engines: Vite vs Turbopack vs Rspack benchmarks and adoption.",
      icon: BookOpen,
    },
    {
      title: "Market trends synthesis",
      prompt: "Synthesize current energy efficiency trends in enterprise data center computing.",
      icon: Lightbulb,
    },
    {
      title: "Scientific literature digest",
      prompt: "Summarize the latest findings in quantum error correction and practical coherence times.",
      icon: Sparkles,
    },
  ],
  coding: [
    {
      title: "Type-safe utilities",
      prompt: "Write a high-performance TypeScript debounce and throttle implementation with generics and cancel methods.",
      icon: Code2,
    },
    {
      title: "Database schema design",
      prompt: "Design a high-throughput, indexed PostgreSQL schema for real-time collaboration with revision logs.",
      icon: Terminal,
    },
    {
      title: "Algorithm optimization",
      prompt: "Optimize an LRU cache in TypeScript with O(1) get and put operations using a doubly linked list.",
      icon: Lightbulb,
    },
    {
      title: "Code review & refactoring",
      prompt: "Provide a rigorous code review checklist for asynchronous error handling in Node.js services.",
      icon: BookOpen,
    },
  ],
  filemaker: [
    {
      title: "Create PDF Report",
      prompt: "Create a PDF report on clean architecture best practices for modern web apps.",
      icon: FileText,
    },
    {
      title: "Create Excel Sheet",
      prompt: "Create an Excel sheet tracking monthly cloud infrastructure expenses with formulas.",
      icon: Table,
    },
    {
      title: "Make Word Document",
      prompt: "Generate a Word document containing a formal client project proposal.",
      icon: BookOpen,
    },
    {
      title: "PowerPoint Presentation",
      prompt: "Create a PowerPoint presentation outlining the future of AI operating systems.",
      icon: Sparkles,
    },
  ],
  document: [
    {
      title: "Document synthesis",
      prompt: "Summarize the key sections, executive takeaways, and action items from this document.",
      icon: BookOpen,
    },
    {
      title: "Extract data tables",
      prompt: "Extract all financial figures and tabular data into a structured format.",
      icon: Table,
    },
    {
      title: "Contract review",
      prompt: "Review this document for potential compliance risks, liabilities, and ambiguous clauses.",
      icon: Sparkles,
    },
    {
      title: "Multi-document compare",
      prompt: "Compare the specifications in these uploaded files and highlight discrepancies.",
      icon: FileText,
    },
  ],
  writing: [
    {
      title: "Executive brief",
      prompt: "Draft a concise 2-paragraph executive summary proposing a transition to zero-trust architecture.",
      icon: PenTool,
    },
    {
      title: "Product announcement",
      prompt: "Write a clear, professional release notes announcement for RSR Nexora V7.",
      icon: Sparkles,
    },
    {
      title: "Technical documentation",
      prompt: "Draft a developer-friendly API integration guide with authentication and webhook best practices.",
      icon: FileText,
    },
    {
      title: "Editorial polish",
      prompt: "Review this text to improve clarity, remove passive voice, and strengthen sentence cadence.",
      icon: BookOpen,
    },
  ],
  image: [
    {
      title: "Minimalist architecture",
      prompt: "A minimalist concrete modern pavilion at twilight surrounded by still water and bamboo, 8k architectural photography",
      icon: ImageIcon,
    },
    {
      title: "Clean geometric abstract",
      prompt: "Geometric abstraction with matte black, brushed titanium, and subtle electric blue accent lines, studio lighting",
      icon: Sparkles,
    },
    {
      title: "Editorial portrait",
      prompt: "Cinematic portrait with soft studio rim lighting, neutral palette, clean depth of field",
      icon: ImageIcon,
    },
    {
      title: "Futuristic interface",
      prompt: "Sleek translucent holographic HUD interface displaying telemetry graphs, dark aesthetic",
      icon: Terminal,
    },
  ],
  voice: [
    {
      title: "Conversational briefing",
      prompt: "Give me a quick 60-second verbal briefing on today's agenda and focus tasks.",
      icon: Mic,
    },
    {
      title: "Mock interview practice",
      prompt: "Act as an engineering manager and conduct a 5-minute interactive behavioral interview with me.",
      icon: Lightbulb,
    },
    {
      title: "Language pronunciation",
      prompt: "Help me practice conversational dialogue with natural spoken feedback.",
      icon: BookOpen,
    },
    {
      title: "Spoken brainstorming",
      prompt: "Let's brainstorm names and value propositions out loud for a new developer tool.",
      icon: Sparkles,
    },
  ],
};

export const HomeExperience: React.FC<HomeExperienceProps> = ({
  onSelectPrompt,
  onOpenVoiceModal,
  onOpenImageModal,
  onOpenFileMakerModal,
  onTriggerFileUpload,
}) => {
  const { conversations, selectConversation, activeMode, setActiveMode } = useChat();
  const { activeWorkspace } = useWorkspace();

  const currentPrompts = MODE_PROMPTS[activeMode] || MODE_PROMPTS.chat;
  const recentConversations = conversations.slice(0, 3);

  const handleQuickAction = (action: "search" | "image" | "voice" | "filemaker" | "file") => {
    if (action === "search") {
      setActiveMode("research");
    } else if (action === "image") {
      setActiveMode("image");
      onOpenImageModal();
    } else if (action === "voice") {
      setActiveMode("voice");
      onOpenVoiceModal();
    } else if (action === "filemaker") {
      setActiveMode("filemaker");
      if (onOpenFileMakerModal) {
        onOpenFileMakerModal();
      }
    } else if (action === "file") {
      onTriggerFileUpload();
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start text-center py-6 md:py-10 max-w-3xl mx-auto w-full px-2">
      {/* Insignia & Welcome */}
      <div className="mb-4">
        <RSRLogo size="lg" />
      </div>

      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100 mb-2">
        How can RSR Nexora help you today?
      </h1>

      <p className="text-neutral-500 dark:text-neutral-400 text-xs md:text-sm max-w-lg mb-6 leading-relaxed">
        Created under{" "}
        <a
          href="https://rsrstudios.in"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-neutral-800 dark:text-neutral-200 hover:text-blue-500 underline decoration-neutral-300 dark:decoration-neutral-700 underline-offset-2 transition-colors"
        >
          RSR Studios
        </a>{" "}
        by Founder &amp; Owner Shubham Rajput in{" "}
        <span className="font-medium text-neutral-700 dark:text-neutral-300">
          {activeWorkspace.name}
        </span>
        . Select a mode or start with an action below.
      </p>

      {/* Smart Mode Selector */}
      <div className="mb-6">
        <SmartModeSelector
          onOpenVoiceModal={onOpenVoiceModal}
          onOpenImageModal={onOpenImageModal}
          onOpenFileMakerModal={onOpenFileMakerModal}
        />
      </div>

      {/* Quick Action Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full mb-6">
        <button
          id="quick-action-search"
          onClick={() => handleQuickAction("search")}
          className="flex flex-col items-center justify-center p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151921] hover:bg-neutral-50 dark:hover:bg-[#1c212c] hover:border-neutral-300 dark:hover:border-neutral-700 transition-all cursor-pointer group shadow-2xs"
        >
          <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-2 group-hover:text-blue-500 transition-colors">
            <Globe className="w-4 h-4 text-neutral-600 dark:text-neutral-300 group-hover:text-blue-500" />
          </div>
          <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            Web Search
          </span>
          <span className="text-[10px] text-neutral-400 mt-0.5">Live Grounding</span>
        </button>

        <button
          id="quick-action-image"
          onClick={() => handleQuickAction("image")}
          className="flex flex-col items-center justify-center p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151921] hover:bg-neutral-50 dark:hover:bg-[#1c212c] hover:border-neutral-300 dark:hover:border-neutral-700 transition-all cursor-pointer group shadow-2xs"
        >
          <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-2 group-hover:text-blue-500 transition-colors">
            <ImageIcon className="w-4 h-4 text-neutral-600 dark:text-neutral-300 group-hover:text-blue-500" />
          </div>
          <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            Image Studio
          </span>
          <span className="text-[10px] text-neutral-400 mt-0.5">Visual AI Gen</span>
        </button>

        <button
          id="quick-action-voice"
          onClick={() => handleQuickAction("voice")}
          className="flex flex-col items-center justify-center p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151921] hover:bg-neutral-50 dark:hover:bg-[#1c212c] hover:border-neutral-300 dark:hover:border-neutral-700 transition-all cursor-pointer group shadow-2xs"
        >
          <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-2 group-hover:text-blue-500 transition-colors">
            <Mic className="w-4 h-4 text-neutral-600 dark:text-neutral-300 group-hover:text-blue-500" />
          </div>
          <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            Voice Mode
          </span>
          <span className="text-[10px] text-neutral-400 mt-0.5">Speech Assistant</span>
        </button>

        <button
          id="quick-action-filemaker"
          onClick={() => handleQuickAction("filemaker")}
          className="flex flex-col items-center justify-center p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151921] hover:bg-neutral-50 dark:hover:bg-[#1c212c] hover:border-neutral-300 dark:hover:border-neutral-700 transition-all cursor-pointer group shadow-2xs"
        >
          <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-2 group-hover:text-blue-500 transition-colors">
            <FileText className="w-4 h-4 text-neutral-600 dark:text-neutral-300 group-hover:text-blue-500" />
          </div>
          <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            File Maker
          </span>
          <span className="text-[10px] text-neutral-400 mt-0.5">PDF, Word, Excel</span>
        </button>
      </div>

      {/* Suggested Prompts Section */}
      <div className="w-full text-left mb-6">
        <div className="flex items-center justify-between mb-2.5 px-1">
          <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
            Suggested Prompts ({activeMode})
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {currentPrompts.map((item, idx) => {
            const PromptIcon = item.icon;
            return (
              <button
                key={idx}
                id={`home-prompt-${idx}`}
                onClick={() => onSelectPrompt(item.prompt)}
                className="p-3 rounded-xl text-left border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151921] hover:bg-neutral-50 dark:hover:bg-[#1c212c] hover:border-neutral-300 dark:hover:border-neutral-700 transition-all group cursor-pointer shadow-2xs"
              >
                <div className="flex items-center gap-2 mb-1 text-neutral-700 dark:text-neutral-300 font-medium text-xs">
                  <PromptIcon className="w-3.5 h-3.5 text-neutral-500 group-hover:text-blue-500 transition-colors" />
                  <span>{item.title}</span>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed line-clamp-2">
                  {item.prompt}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent Conversations Preview (if any exist) */}
      {recentConversations.length > 0 && (
        <div className="w-full text-left">
          <div className="flex items-center gap-1.5 mb-2.5 px-1 text-neutral-500 dark:text-neutral-400 text-xs font-semibold uppercase tracking-wider">
            <Clock className="w-3.5 h-3.5" />
            <span>Recent Conversations</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {recentConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                className="flex items-center justify-between p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-[#151921]/60 hover:bg-neutral-50 dark:hover:bg-[#1c212c] text-left transition-colors cursor-pointer group"
              >
                <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate max-w-[170px]">
                  {conv.title}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
