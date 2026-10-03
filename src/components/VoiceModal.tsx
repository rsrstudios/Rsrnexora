import React, { useState, useEffect, useRef } from "react";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  X,
  AlertCircle,
  Play,
  Pause,
  Square,
  Settings2,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { useChat } from "../context/ChatContext";

interface VoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VoiceModal: React.FC<VoiceModalProps> = ({ isOpen, onClose }) => {
  const { sendMessage, currentConversation, isGenerating, settings, updateSettings } = useChat();

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);

  // Voice selection & preferences
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState(settings.voiceLanguage || "en-IN");
  const [selectedVoiceURI, setSelectedVoiceURI] = useState(settings.voiceName || "");
  const [voiceSpeed, setVoiceSpeed] = useState(settings.voiceSpeed || 1.0);
  const [conversationMode, setConversationMode] = useState(
    settings.voiceConversationMode ?? false
  );
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);

  const recognitionRef = useRef<any>(null);
  const lastSpokenMsgIdRef = useRef<string | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Check speech recognition support
  const isSpeechSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  // Load available system/browser voices
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setAvailableVoices(voices);
      }
    };

    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
  }, []);

  // Initialize Speech Recognition
  useEffect(() => {
    if (!isOpen || !isSpeechSupported) return;

    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRec();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = selectedLanguage === "hi-IN" ? "hi-IN" : "en-IN";

    recognition.onstart = () => {
      setIsListening(true);
      setErrorMessage(null);
    };

    recognition.onresult = (event: any) => {
      let currentTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        currentTranscript += event.results[i][0].transcript;
      }
      setTranscript(currentTranscript);
    };

    recognition.onerror = (event: any) => {
      console.warn("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        setErrorMessage("Microphone access was denied. Please allow microphone permissions.");
      } else if (event.error !== "no-speech") {
        setErrorMessage(`Microphone error: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {}
      recognitionRef.current = null;
    };
  }, [isOpen, isSpeechSupported, selectedLanguage]);

  // Clean text strictly adhering to voice assistant guidelines
  const sanitizeTextForSpeech = (raw: string): string => {
    return raw
      // Replace code blocks with clean audio cue
      .replace(/```[\s\S]*?```/g, "Code block omitted.")
      // Replace inline code snippets
      .replace(/`([^`]+)`/g, "$1")
      // Replace URLs with brief cue instead of spelling out character by character
      .replace(/https?:\/\/[^\s]+/g, "link")
      // Strip markdown headers, bold, italics, strikethroughs, blockquotes
      .replace(/[*#_~>]/g, "")
      // Convert markdown links [Label](url) into "Label"
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Remove system tags
      .replace(/<[^>]*>/g, "")
      // Remove file card markup if present
      .replace(/:::file-card[\s\S]*?:::/g, "Downloadable file prepared.")
      // Normalize whitespace
      .replace(/\s+/g, " ")
      .trim();
  };

  // Play text via SpeechSynthesis
  const speakText = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !audioEnabled) return;

    window.speechSynthesis.cancel();
    setIsPaused(false);

    const cleanText = sanitizeTextForSpeech(text);
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = voiceSpeed;
    utterance.pitch = settings.voicePitch || 1.0;

    // Pick suitable voice
    if (selectedVoiceURI) {
      const match = availableVoices.find((v) => v.voiceURI === selectedVoiceURI);
      if (match) utterance.voice = match;
    } else {
      // Auto-match preferred language
      const langMatch = availableVoices.find((v) =>
        v.lang.toLowerCase().startsWith(selectedLanguage.toLowerCase())
      );
      if (langMatch) utterance.voice = langMatch;
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
      setIsPaused(false);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setIsPaused(false);
      currentUtteranceRef.current = null;

      // In continuous voice conversation mode, auto-listen after speech concludes
      if (conversationMode && isSpeechSupported && recognitionRef.current) {
        setTimeout(() => {
          try {
            recognitionRef.current?.start();
          } catch {}
        }, 400);
      }
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
      setIsPaused(false);
      currentUtteranceRef.current = null;
    };

    currentUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  // Speak assistant message as it completes
  useEffect(() => {
    if (!isOpen || !audioEnabled) return;

    const messages = currentConversation?.messages || [];
    if (messages.length === 0) return;

    const lastMsg = messages[messages.length - 1];
    if (
      lastMsg.role === "assistant" &&
      !isGenerating &&
      lastMsg.content &&
      lastMsg.id !== lastSpokenMsgIdRef.current
    ) {
      lastSpokenMsgIdRef.current = lastMsg.id;
      speakText(lastMsg.content);
    }
  }, [currentConversation?.messages, isGenerating, isOpen, audioEnabled]);

  // Audio Playback Controls
  const handlePause = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  };

  const handleResume = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  };

  const handleStopSpeech = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setIsPaused(false);
      currentUtteranceRef.current = null;
    }
  };

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      // Stop speech when user begins speaking
      handleStopSpeech();
      setTranscript("");
      setErrorMessage(null);
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.warn("Failed to start speech recognition:", err);
      }
    }
  };

  const handleSendTranscript = () => {
    if (!transcript.trim() || isGenerating) return;
    sendMessage(transcript.trim());
    setTranscript("");
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const handleClose = () => {
    handleStopSpeech();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#12161f] border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden flex flex-col items-center text-center relative p-5 md:p-7">
        {/* Top Header */}
        <div className="w-full flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs font-bold tracking-wider uppercase text-neutral-600 dark:text-neutral-400">
              RSR Nexora Voice Assistant
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Settings Toggle */}
            <button
              onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                showSettingsDrawer
                  ? "bg-blue-500/10 text-blue-500"
                  : "text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
              title="Voice Settings"
            >
              <Settings2 className="w-4 h-4" />
            </button>

            {/* Audio Mute/Unmute */}
            <button
              onClick={() => {
                const nextState = !audioEnabled;
                setAudioEnabled(nextState);
                if (!nextState) handleStopSpeech();
              }}
              className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              title={audioEnabled ? "Mute voice response" : "Enable voice response"}
            >
              {audioEnabled ? (
                <Volume2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <VolumeX className="w-4 h-4 text-rose-500" />
              )}
            </button>

            {/* Close */}
            <button
              onClick={handleClose}
              className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Collapsible Voice Settings Drawer */}
        {showSettingsDrawer && (
          <div className="w-full mb-4 p-4 rounded-2xl bg-neutral-50 dark:bg-[#181d28] border border-neutral-200 dark:border-neutral-800 text-left space-y-3 animate-in slide-in-from-top-2 duration-150 text-xs">
            <div className="font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              Voice Settings
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Language Preset */}
              <div>
                <label className="block text-neutral-600 dark:text-neutral-400 font-medium mb-1">
                  Accent & Language:
                </label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => {
                    setSelectedLanguage(e.target.value);
                    updateSettings({ voiceLanguage: e.target.value });
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white"
                >
                  <option value="en-IN">Indian English / Hinglish (en-IN)</option>
                  <option value="hi-IN">Hindi / हिन्दी (hi-IN)</option>
                  <option value="en-US">English (US)</option>
                  <option value="en-GB">English (UK)</option>
                </select>
              </div>

              {/* Speed Control */}
              <div>
                <label className="block text-neutral-600 dark:text-neutral-400 font-medium mb-1">
                  Speaking Speed ({voiceSpeed}x):
                </label>
                <div className="flex items-center gap-1.5">
                  {[0.75, 1.0, 1.25, 1.5].map((spd) => (
                    <button
                      key={spd}
                      onClick={() => {
                        setVoiceSpeed(spd);
                        updateSettings({ voiceSpeed: spd });
                      }}
                      className={`flex-1 py-1 rounded-md text-[11px] font-semibold transition-all ${
                        voiceSpeed === spd
                          ? "bg-blue-600 text-white shadow-2xs"
                          : "bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Conversation Mode Toggle */}
            <div className="flex items-center justify-between pt-1">
              <div>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200 block">
                  Continuous Conversation Mode
                </span>
                <span className="text-[11px] text-neutral-400">
                  Automatically listens after Nexora finishes speaking
                </span>
              </div>
              <input
                type="checkbox"
                checked={conversationMode}
                onChange={(e) => {
                  setConversationMode(e.target.checked);
                  updateSettings({ voiceConversationMode: e.target.checked });
                }}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* Animated Speaking / Listening Orb */}
        <div className="relative my-4 flex items-center justify-center">
          {/* Audio Wave Visualizer Rings */}
          {(isListening || isSpeaking) && (
            <>
              <div
                className={`absolute w-36 h-36 rounded-full opacity-25 animate-ping ${
                  isSpeaking ? "bg-purple-500" : "bg-blue-500"
                }`}
              />
              <div
                className={`absolute w-44 h-44 rounded-full opacity-15 animate-pulse ${
                  isSpeaking ? "bg-purple-500" : "bg-blue-500"
                }`}
              />
            </>
          )}

          {/* Central orb */}
          <div
            className={`w-28 h-28 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${
              isSpeaking
                ? "bg-purple-600 text-white scale-105 ring-8 ring-purple-500/20"
                : isListening
                ? "bg-blue-600 text-white scale-105 ring-8 ring-blue-500/20"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
            }`}
          >
            {isSpeaking ? (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-6 bg-white rounded-full animate-bounce" />
                <span className="w-1.5 h-10 bg-white rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="w-1.5 h-7 bg-white rounded-full animate-bounce [animation-delay:0.3s]" />
              </div>
            ) : (
              <Mic className={`w-10 h-10 ${isListening ? "animate-pulse" : ""}`} />
            )}
          </div>
        </div>

        {/* Status label */}
        <div className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 mb-1">
          {isSpeaking
            ? isPaused
              ? "RSR Nexora is paused"
              : "RSR Nexora is speaking..."
            : isListening
            ? "Listening to you..."
            : isGenerating
            ? "Thinking & generating response..."
            : "Tap microphone to speak"}
        </div>

        {/* Live speech-to-text transcript card */}
        <div className="min-h-[55px] max-h-[100px] w-full overflow-y-auto px-4 py-2.5 my-3 rounded-2xl bg-neutral-50 dark:bg-[#181d28] border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-700 dark:text-neutral-300 italic text-center leading-relaxed">
          {transcript ? `"${transcript}"` : "Speak clearly in Indian English, Hinglish, or Hindi..."}
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="flex items-center gap-1.5 text-xs text-rose-500 mb-3 text-left">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {!isSpeechSupported && (
          <div className="text-xs text-amber-500 mb-3">
            Live Speech Recognition is not supported in this browser. Please use Chrome or Edge.
          </div>
        )}

        {/* Playback Controls (when speaking) */}
        {isSpeaking && (
          <div className="flex items-center gap-2 mb-3">
            {isPaused ? (
              <button
                onClick={handleResume}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs font-semibold hover:bg-neutral-300 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                Resume
              </button>
            ) : (
              <button
                onClick={handlePause}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs font-semibold hover:bg-neutral-300 transition-colors"
              >
                <Pause className="w-3.5 h-3.5" />
                Pause
              </button>
            )}

            <button
              onClick={handleStopSpeech}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 text-xs font-semibold hover:bg-rose-200 transition-colors"
            >
              <Square className="w-3.5 h-3.5" />
              Stop
            </button>
          </div>
        )}

        {/* Bottom Actions */}
        <div className="w-full flex items-center justify-center gap-2.5 mt-2">
          <button
            id="voice-mic-toggle-btn"
            disabled={!isSpeechSupported}
            onClick={toggleListening}
            className={`px-5 py-2.5 rounded-2xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-xs ${
              isListening
                ? "bg-rose-600 hover:bg-rose-700 text-white"
                : "bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 hover:bg-neutral-800 dark:hover:bg-neutral-100"
            }`}
          >
            {isListening ? (
              <>
                <MicOff className="w-4 h-4" />
                <span>Stop Listening</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" />
                <span>Start Listening</span>
              </>
            )}
          </button>

          {transcript && (
            <button
              onClick={handleSendTranscript}
              disabled={isGenerating}
              className="px-4 py-2.5 rounded-2xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer shadow-xs"
            >
              Send Message
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
