import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Mic, MicOff, Send, Sparkles, Trash2, Volume2, VolumeX, X } from "lucide-react";

import { respondTo, splitBold, type AssistantAction, type AssistantContext } from "@/lib/assistant";
import { respondToHindi } from "@/lib/assistantHi";
import { cn } from "@/lib/utils";
import {
  createRecognizer,
  getSpeechSupport,
  sanitizeForSpeech,
  speak,
  stopSpeaking,
  type RecognizerHandle,
  type SpeechLang,
} from "@/lib/voice";

interface ApixAssistantProps {
  buildContext: () => AssistantContext;
  onAction: (action: AssistantAction) => void;
}

interface Message {
  id: number;
  role: "user" | "assistant";
  /** Segments from splitBold — **bold** spans render as <strong>. */
  segments: Array<{ text: string; bold: boolean }>;
  chips?: string[];
}

const GREETING = `I'm the APIx analyst assistant. Ask me anything about the index — levels, forecasts, corridor heat, methodology — or drive the dashboard directly (\"show DEL-BOM\", \"switch to 2012 base\", \"show 7-day view\").`;

let nextId = 1;

const VOICE_MUTED_KEY = "apix.voiceMuted";
const VOICE_LANG_KEY = "apix.voiceLang";

/** Human-readable copy for recognizer error codes. */
function voiceErrorCopy(code: string): string {
  if (code === "not-allowed" || code === "service-not-allowed")
    return "Mic permission denied — allow microphone access and try again.";
  if (code === "no-speech") return "Didn't catch that — tap the mic and speak again.";
  if (code === "audio-capture") return "No microphone found on this device.";
  if (code === "network") return "Speech service unreachable — check your connection.";
  return `Voice input error (${code}).`;
}

export function ApixAssistant({ buildContext, onAction }: ApixAssistantProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: nextId++, role: "assistant", segments: splitBold(GREETING) },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<((text: string) => void) | null>(null);

  // Voice mode (Voxsentinals) — speech in, spoken replies out.
  const support = getSpeechSupport();
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [muted, setMuted] = useState(() => {
    try {
      return window.localStorage.getItem(VOICE_MUTED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [lang, setLang] = useState<SpeechLang>(() => {
    try {
      return window.localStorage.getItem(VOICE_LANG_KEY) === "hi-IN" ? "hi-IN" : "en-IN";
    } catch {
      return "en-IN";
    }
  });
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognizerRef = useRef<RecognizerHandle | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const langRef = useRef(lang);
  langRef.current = lang;

  // (Re)create the recognizer whenever the language flips — different acoustic
  // model. Callbacks read refs so they never go stale.
  useEffect(() => {
    recognizerRef.current = createRecognizer({
      onPartial: (text) => setInterim(text),
      onFinal: (text) => {
        setInterim("");
        sendRef.current?.(text);
      },
      onError: (code) => setVoiceError(voiceErrorCopy(code)),
      onEnd: () => {
        setListening(false);
        setInterim("");
      },
    }, lang);
    return () => recognizerRef.current?.stop();
  }, [lang]);

  // The tools rail can summon the assistant (apix:open-assistant event).
  useEffect(() => {
    const open = () => setOpen(true);
    window.addEventListener("apix:open-assistant", open);
    return () => window.removeEventListener("apix:open-assistant", open);
  }, []);

  // Autoscroll to the newest message whenever the transcript changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, typing, open]);

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || typing) return;
    setInput("");

    setMessages((prev) => [...prev, { id: nextId++, role: "user", segments: [{ text, bold: false }] }]);
    setTyping(true);

    // Simulated analyst "thinking" latency keeps the interaction feel alive
    // while the reply itself is computed synchronously from dashboard state.
    window.setTimeout(() => {
      const hi = langRef.current === "hi-IN";
      const reply = hi ? respondToHindi(text, buildContext()) : respondTo(text, buildContext());
      setMessages((prev) => [
        ...prev,
        { id: nextId++, role: "assistant", segments: splitBold(reply.text), chips: reply.chips },
      ]);
      setTyping(false);
      if (reply.action) onAction(reply.action);
      // Voxsentinals: read the reply aloud unless the user muted spoken answers.
      if (!mutedRef.current) {
        const spoken = sanitizeForSpeech(reply.text, hi ? "hi-IN" : "en-IN");
        speak(spoken, hi ? "hi-IN" : "en-IN");
      }
    }, 480);
  };
  // Recognizer finals arrive as user events after mount — route through a ref.
  sendRef.current = send;

  const reset = () => {
    stopSpeaking();
    setVoiceError(null);
    setMessages([{ id: nextId++, role: "assistant", segments: splitBold(GREETING) }]);
  };

  // Closing the panel ends any listening session and silences in-flight speech.
  useEffect(() => {
    if (!open) {
      recognizerRef.current?.stop();
      setListening(false);
      setInterim("");
      stopSpeaking();
      setVoiceError(null);
    }
  }, [open]);

  const toggleListening = () => {
    if (listening) {
      recognizerRef.current?.stop();
      setListening(false);
      setInterim("");
      return;
    }
    setVoiceError(null);
    setInterim("");
    recognizerRef.current?.start();
    setListening(true);
  };

  const toggleMuted = () => {
    setMuted((m) => {
      const next = !m;
      try {
        window.localStorage.setItem(VOICE_MUTED_KEY, next ? "1" : "0");
      } catch {
        /* private mode — mute just won't persist */
      }
      if (next) stopSpeaking();
      return next;
    });
  };

  const toggleLang = () => {
    setLang((cur) => {
      const next: SpeechLang = cur === "en-IN" ? "hi-IN" : "en-IN";
      try {
        window.localStorage.setItem(VOICE_LANG_KEY, next);
      } catch {
        /* private mode — language just won't persist */
      }
      return next;
    });
  };

  return (
    <>
      {/* Floating action button */}
      <motion.button
        type="button"
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        aria-label={open ? "Close APIx assistant" : "Open APIx assistant"}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-blue-500 to-sky-400 shadow-xl shadow-indigo-950/60 ring-2 ring-white/10 transition-shadow hover:shadow-2xl hover:shadow-indigo-900/70"
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X className="h-6 w-6 text-white" strokeWidth={2.4} />
            </motion.span>
          ) : (
            <motion.span
              key="bot"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Bot className="h-6 w-6 text-white" strokeWidth={2.2} />
            </motion.span>
          )}
        </AnimatePresence>
        {/* Online pulse — mirrors the telemetry feed's uptime dot */}
        {!open && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-slate-950 bg-emerald-400" />
          </span>
        )}
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.section
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            aria-label="APIx assistant chat"
            className="glass-panel keep-dark fixed bottom-24 right-6 z-50 flex h-[540px] w-[min(92vw,400px)] flex-col overflow-hidden rounded-2xl shadow-2xl shadow-slate-950/70"
          >
            {/* Header */}
            <header className="flex items-center gap-3 border-b border-slate-700/60 bg-slate-900/70 px-4 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-400 shadow-md shadow-indigo-950/50">
                <Sparkles className="h-4.5 w-4.5 text-white" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-white">APIx Analyst Assistant</h2>
                <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                  Grounded in live index state · {lang === "hi-IN" ? "हिंदी" : "English"} voice
                </p>
              </div>
              {support.recognition && (
                <button
                  type="button"
                  onClick={toggleLang}
                  aria-label={lang === "hi-IN" ? "Switch voice to English" : "Switch voice to Hindi"}
                  title={lang === "hi-IN" ? "Switch to English voice" : "हिंदी आवाज़ पर जाएँ"}
                  className={cn(
                    "rounded-lg px-2 py-1 text-[11px] font-bold transition-colors hover:bg-slate-800/70",
                    lang === "hi-IN" ? "text-amber-300 hover:text-amber-200" : "text-slate-400 hover:text-slate-200",
                  )}
                >
                  {lang === "hi-IN" ? "हिं" : "EN"}
                </button>
              )}
              <button
                type="button"
                onClick={reset}
                aria-label="Reset conversation"
                title="Reset conversation"
                className="ml-auto rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800/70 hover:text-slate-200"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              {support.synthesis && (
                <button
                  type="button"
                  onClick={toggleMuted}
                  aria-label={muted ? "Unmute spoken replies" : "Mute spoken replies"}
                  aria-pressed={muted}
                  title={muted ? "Spoken replies muted" : "Spoken replies on"}
                  className={cn(
                    "rounded-lg p-1.5 transition-colors hover:bg-slate-800/70",
                    muted ? "text-slate-600 hover:text-slate-400" : "text-sky-300 hover:text-sky-200",
                  )}
                >
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
              )}
            </header>

            {/* Transcript */}
            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className={cn("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}
                >
                  <div
                    className={cn(
                      "max-w-[88%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
                      msg.role === "user"
                        ? "rounded-br-md bg-gradient-to-br from-indigo-600 to-sky-500 font-medium text-white shadow-md shadow-indigo-950/40"
                        : "rounded-bl-md border border-slate-700/60 bg-slate-900/80 text-slate-200",
                    )}
                  >
                    {msg.segments.map((seg, i) =>
                      seg.bold ? (
                        <strong key={i} className="font-bold text-white">
                          {seg.text}
                        </strong>
                      ) : (
                        <span key={i}>{seg.text}</span>
                      ),
                    )}
                  </div>

                  {/* Suggested follow-ups (assistant messages only) */}
                  {msg.role === "assistant" && msg.chips && msg.chips.length > 0 && (
                    <div className="mt-2 flex max-w-full flex-wrap gap-1.5">
                      {msg.chips.map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => send(chip)}
                          className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-300 transition-all hover:border-indigo-400/60 hover:bg-indigo-500/20 hover:text-indigo-200"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}

              {/* Typing indicator */}
              {typing && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start">
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-slate-700/60 bg-slate-900/80 px-4 py-3">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15 }}
                        className="h-1.5 w-1.5 rounded-full bg-sky-400"
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="border-t border-slate-700/60 bg-slate-900/70 px-3 py-3"
            >
              {/* Live interim transcript while the mic is open */}
              {listening && (
                <div className="mb-2 flex items-center gap-2 text-[11.5px] text-rose-300" aria-live="polite">
                  <Mic className="h-3.5 w-3.5 shrink-0 animate-pulse" />
                  <span className="truncate italic">{interim || "Listening… speak now"}</span>
                </div>
              )}
              {/* Voice input errors (permission, no mic, no speech) */}
              {voiceError && (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11.5px] text-amber-300">
                  <span className="truncate">{voiceError}</span>
                  <button
                    type="button"
                    onClick={() => setVoiceError(null)}
                    aria-label="Dismiss voice error"
                    className="shrink-0 text-amber-400 transition-colors hover:text-amber-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                {support.recognition && (
                  <motion.button
                    type="button"
                    onClick={toggleListening}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    aria-label={listening ? "Stop voice input" : "Start voice input"}
                    aria-pressed={listening}
                    title={listening ? "Stop listening" : "Ask by voice"}
                    className={cn(
                      "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors",
                      listening
                        ? "border-rose-400/60 bg-gradient-to-br from-rose-600 to-rose-500 text-white shadow-lg shadow-rose-950/50"
                        : "border-slate-700/80 bg-slate-950/60 text-slate-300 hover:border-sky-400/60 hover:text-sky-300",
                    )}
                  >
                    {listening ? <MicOff className="h-4 w-4" strokeWidth={2.2} /> : <Mic className="h-4 w-4" strokeWidth={2.2} />}
                    {listening && <span className="absolute inset-0 animate-ping rounded-xl ring-2 ring-rose-400/60" />}
                  </motion.button>
                )}
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder='Ask e.g. "forecast for DEL-BOM"…'
                  aria-label="Message the APIx assistant"
                  className="min-w-0 flex-1 rounded-xl border border-slate-700/80 bg-slate-950/60 px-3.5 py-2.5 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                />
                <motion.button
                  type="submit"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  disabled={!input.trim() || typing}
                  aria-label="Send message"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-400 text-white shadow-lg shadow-indigo-950/50 transition-opacity disabled:opacity-40"
                >
                  <Send className="h-4 w-4" strokeWidth={2.2} />
                </motion.button>
              </div>
            </form>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}

export default ApixAssistant;
