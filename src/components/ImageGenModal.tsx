import React, { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  Download,
  Share2,
  Copy,
  RotateCcw,
  Check,
  Image as ImageIcon,
  Loader2,
  History,
  Layers,
} from "lucide-react";
import { useChat } from "../context/ChatContext";
import { StorageService } from "../services/storageService";
import { GeneratedImage } from "../types";

interface ImageGenModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImageGenModal: React.FC<ImageGenModalProps> = ({ isOpen, onClose }) => {
  const { generateImageMessage } = useChat();

  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "16:9" | "4:3" | "9:16">("1:1");
  const [copied, setCopied] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingVariation, setIsGeneratingVariation] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string>("Analyzing prompt...");
  const [generatedResult, setGeneratedResult] = useState<{
    url: string;
    prompt: string;
    aspectRatio: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<GeneratedImage[]>([]);

  useEffect(() => {
    if (isOpen) {
      setHistory(StorageService.getImageGallery());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!prompt.trim() || isGeneratingImage) return;

    setErrorMsg(null);
    setIsGeneratingImage(true);
    setCurrentStatus("Synthesizing visual pixels with Gemini...");

    try {
      const res = await fetch("/api/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), aspectRatio }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        const errorText =
          (typeof data.error === "object" && data.error?.message)
            ? data.error.message
            : typeof data.error === "string"
            ? data.error
            : "Image generation failed.";
        throw new Error(errorText);
      }

      const result = {
        url: data.imageUrl,
        prompt: prompt.trim(),
        aspectRatio,
      };

      setGeneratedResult(result);

      // Save to gallery
      const newImg: GeneratedImage = {
        id: "img_" + Date.now().toString(36),
        url: data.imageUrl,
        prompt: prompt.trim(),
        aspectRatio,
        createdAt: Date.now(),
      };
      const updatedGallery = [newImg, ...StorageService.getImageGallery()];
      StorageService.saveImageGallery(updatedGallery);
      setHistory(updatedGallery);

      // Also append to conversation
      generateImageMessage(prompt.trim(), aspectRatio);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to generate image.");
    } finally {
      setIsGeneratingImage(false);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("rsr:refresh-usage"));
      }
    }
  };

  const handleGenerateVariation = async () => {
    if (!generatedResult || isGeneratingVariation) return;

    setErrorMsg(null);
    setIsGeneratingVariation(true);
    setCurrentStatus("Crafting visual variation...");

    try {
      const res = await fetch("/api/image/variation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: generatedResult.prompt,
          aspectRatio: generatedResult.aspectRatio,
          imageUrl: generatedResult.url,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        const errorText =
          (typeof data.error === "object" && data.error?.message)
            ? data.error.message
            : typeof data.error === "string"
            ? data.error
            : "Failed to create image variation.";
        throw new Error(errorText);
      }

      const result = {
        url: data.imageUrl,
        prompt: `${generatedResult.prompt} (Variation)`,
        aspectRatio: generatedResult.aspectRatio,
      };

      setGeneratedResult(result);

      const newImg: GeneratedImage = {
        id: "img_" + Date.now().toString(36),
        url: data.imageUrl,
        prompt: result.prompt,
        aspectRatio: (generatedResult.aspectRatio as any) || "1:1",
        createdAt: Date.now(),
      };
      const updatedGallery = [newImg, ...StorageService.getImageGallery()];
      StorageService.saveImageGallery(updatedGallery);
      setHistory(updatedGallery);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to generate variation.");
    } finally {
      setIsGeneratingVariation(false);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("rsr:refresh-usage"));
      }
    }
  };

  const handleDownload = () => {
    if (!generatedResult) return;
    const a = document.createElement("a");
    a.href = generatedResult.url;
    a.download = `rsr-ai-image-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleShare = async () => {
    if (!generatedResult) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Generated with RSR Nexora",
          text: generatedResult.prompt,
          url: window.location.href,
        });
        return;
      } catch {}
    }
    handleCopyPrompt();
  };

  const handleCopyPrompt = () => {
    if (!generatedResult) return;
    navigator.clipboard.writeText(generatedResult.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-studio-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/65 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl bg-white dark:bg-[#11141a] border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden text-neutral-900 dark:text-neutral-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 id="image-studio-title" className="text-sm font-semibold tracking-tight">
                AI Image Studio
              </h2>
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Visual generation, aspect ratio controls & variations
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            aria-label="Close image studio"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {/* Prompt Input */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
              Visual Prompt
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want to create (e.g. 'A sleek architectural villa in the misty hills, warm evening interior lighting, minimalist aesthetic, 8k photography')..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-hidden focus:ring-1 focus:ring-purple-500 resize-none leading-relaxed transition-colors text-xs"
            />
          </div>

          {/* Quick Creative Presets */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
              Quick Creation Presets
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: "Logo", prompt: "Minimal modern vector logo design for a tech company, clean lines, flat aesthetic, white background" },
                { label: "Poster", prompt: "Cinematic minimalist event poster, bold typography, futuristic aesthetic, dynamic composition" },
                { label: "Thumbnail", prompt: "Eye-catching YouTube video thumbnail, vibrant colors, expressive focal element, high contrast" },
                { label: "Illustration", prompt: "Hand-crafted digital vector illustration, pastel palette, whimsical atmosphere, high detail" },
                { label: "Character", prompt: "Full-body sci-fi cyberpunk character concept art, neon rim lighting, detailed outfit" },
                { label: "Background", prompt: "Ambient desktop wallpaper background, serene gradient landscape, moody lighting, 4k" },
                { label: "Social Media", prompt: "High-engagement social media square artwork, aesthetic product photography, soft shadows" },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setPrompt(p.prompt)}
                  className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-100/70 dark:bg-neutral-800/60 hover:bg-purple-50 dark:hover:bg-purple-950/40 hover:text-purple-600 dark:hover:text-purple-400 text-[11px] font-medium transition-colors cursor-pointer"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
              Aspect Ratio
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  { id: "1:1", label: "1:1 Square" },
                  { id: "16:9", label: "16:9 Landscape" },
                  { id: "4:3", label: "4:3 Classic" },
                  { id: "9:16", label: "9:16 Portrait / Story" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAspectRatio(opt.id)}
                  className={`py-2 px-3 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                    aspectRatio === opt.id
                      ? "border-purple-600 dark:border-purple-400 bg-purple-50/50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 font-semibold"
                      : "border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-600 dark:text-rose-400">
              {errorMsg}
            </div>
          )}

          {/* Active Generating Loading State */}
          {(isGeneratingImage || isGeneratingVariation) && (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-900/30">
              <Loader2 className="w-8 h-8 text-purple-600 dark:text-purple-400 animate-spin" />
              <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                {currentStatus}
              </div>
              <div className="text-[11px] text-neutral-400">
                Generating high-resolution AI visuals...
              </div>
            </div>
          )}

          {/* Generated Result Preview */}
          {generatedResult && !isGeneratingImage && !isGeneratingVariation && (
            <div className="space-y-3 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-3 bg-neutral-50/60 dark:bg-[#151921]/60">
              <div className="relative rounded-xl overflow-hidden bg-neutral-950 flex items-center justify-center max-h-[360px]">
                <img
                  src={generatedResult.url}
                  alt={generatedResult.prompt}
                  className="w-full h-auto object-contain max-h-[360px]"
                />
              </div>

              {/* Action Bar */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-neutral-500 truncate max-w-xs">
                  "{generatedResult.prompt}"
                </span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={handleGenerate}
                    disabled={isGeneratingImage}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-medium transition-colors cursor-pointer"
                    title="Regenerate image"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Regenerate</span>
                  </button>

                  <button
                    onClick={handleGenerateVariation}
                    disabled={isGeneratingVariation}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-medium transition-colors cursor-pointer"
                    title="Generate alternate variation"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Variation</span>
                  </button>

                  <button
                    onClick={() => {
                      if (generatedResult) {
                        generateImageMessage(generatedResult.prompt, generatedResult.aspectRatio);
                        onClose();
                      }
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-xs font-medium hover:bg-purple-100 transition-colors cursor-pointer"
                    title="Save into conversation"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                    <span>Save to Chat</span>
                  </button>

                  <button
                    onClick={handleCopyPrompt}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                    title="Copy prompt"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>

                  <button
                    onClick={handleShare}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                    title="Share image"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Gallery History Strip */}
          {history.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                <History className="w-3.5 h-3.5" />
                <span>Recent Studio Generations ({history.length})</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {history.map((img) => (
                  <div
                    key={img.id}
                    onClick={() => {
                      setGeneratedResult({
                        url: img.url,
                        prompt: img.prompt,
                        aspectRatio: img.aspectRatio,
                      });
                      setPrompt(img.prompt);
                    }}
                    className="w-20 h-20 rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 flex-shrink-0 cursor-pointer hover:border-purple-500 transition-colors relative group"
                  >
                    <img src={img.url} alt={img.prompt} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#151921]/50">
          <span className="text-[11px] text-neutral-400">
            Powered by server-side Gemini image generation
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              id="image-generate-submit-btn"
              onClick={handleGenerate}
              disabled={!prompt.trim() || isGeneratingImage || isGeneratingVariation}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-xs cursor-pointer"
            >
              {isGeneratingImage ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>{generatedResult ? "Generate Another" : "Generate Image"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
