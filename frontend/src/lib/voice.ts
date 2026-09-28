/**
 * voice.ts — Web Speech API layer for the APIx assistant (Voxsentinals voice mode).
 *
 * Two halves:
 *  - Speech recognition (mic → text): createRecognizer() wraps SpeechRecognition
 *    (including Chromium's webkitSpeechRecognition) into a tiny start/stop handle.
 *  - Speech synthesis (text → speaker): speak()/stopSpeaking() with an en-IN voice
 *    preference, plus sanitizeForSpeech() so index notation — "₹6,504 · Δ +3.75% ·
 *    2.3 bps · ×1.038" — is pronounced the way an analyst would say it.
 */

export interface SpeechSupport {
  recognition: boolean;
  synthesis: boolean;
}

export function getSpeechSupport(): SpeechSupport {
  if (typeof window === "undefined") return { recognition: false, synthesis: false };
  const w = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
    speechSynthesis?: unknown;
  };
  return {
    recognition: Boolean(w.SpeechRecognition || w.webkitSpeechRecognition),
    synthesis: typeof w.speechSynthesis !== "undefined",
  };
}

/* ------------------------------------------------------------------------- */
/* Minimal structural types — SpeechRecognition is not in lib.dom for all    */
/* TS versions, and module-local names shadow any global safely.             */
/* ------------------------------------------------------------------------- */

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface RecognizerCallbacks {
  /** Interim (still-being-said) transcript — drives the live ghost line. */
  onPartial?: (text: string) => void;
  /** Final utterance — feed this into the normal send() pipeline. */
  onFinal?: (text: string) => void;
  /** Recognition error codes: "not-allowed", "no-speech", "audio-capture", … */
  onError?: (code: string) => void;
  /** Recognition session ended (silence, stop(), or error). */
  onEnd?: () => void;
}

/** BCP-47 locale for recognition — "en-IN" (default) or "hi-IN". */
export type SpeechLang = "en-IN" | "hi-IN";

export interface RecognizerHandle {
  supported: boolean;
  start: () => void;
  stop: () => void;
}

/**
 * Push-to-talk recognizer: one utterance per start(), interim results on so
 * the UI can show the live transcript. `lang` switches the acoustic model
 * ("en-IN" English / "hi-IN" Hindi) — recreate the handle when it changes.
 */
export function createRecognizer(cb: RecognizerCallbacks, lang: SpeechLang = "en-IN"): RecognizerHandle {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return { supported: false, start: () => {}, stop: () => {} };

  let rec: SpeechRecognitionLike | null = null;
  let active = false;

  return {
    supported: true,
    start: () => {
      if (active) return;
      stopSpeaking(); // never talk over the user — echo into the mic
      const r = new Ctor();
      r.lang = lang;
      r.continuous = false;
      r.interimResults = true;
      r.maxAlternatives = 1;
      r.onresult = (event) => {
        let partial = "";
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const transcript = res[0]?.transcript ?? "";
          if (res.isFinal) final += transcript;
          else partial += transcript;
        }
        if (partial.trim()) cb.onPartial?.(partial.trim());
        if (final.trim()) cb.onFinal?.(final.trim());
      };
      r.onerror = (event) => cb.onError?.(event.error);
      r.onend = () => {
        active = false;
        cb.onEnd?.();
      };
      rec = r;
      active = true;
      try {
        r.start();
      } catch {
        active = false; // InvalidStateError — already started
      }
    },
    stop: () => {
      if (!rec || !active) return;
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    },
  };
}

/* ------------------------------------------------------------------------- */
/* Speech synthesis                                                          */
/* ------------------------------------------------------------------------- */

let cachedVoice: SpeechSynthesisVoice | null = null;
let voicePickedFor: string | null = null;

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  if (voicePickedFor !== lang) {
    voicePickedFor = lang;
    const voices = window.speechSynthesis.getVoices();
    // Prefer a native narrator for the requested locale; fall back sensibly.
    const fallbacks = lang.startsWith("hi") ? ["en-IN", "en-GB"] : ["en-GB", "en-IN"];
    cachedVoice =
      voices.find((v) => v.lang === lang && v.localService) ??
      voices.find((v) => v.lang === lang) ??
      voices.find((v) => fallbacks.includes(v.lang)) ??
      voices.find((v) => v.lang.startsWith(lang.split("-")[0])) ??
      voices.find((v) => v.lang.startsWith("en")) ??
      null;
  }
  return cachedVoice;
}

// Voice lists load asynchronously in most engines — re-pick when they arrive.
if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    voicePickedFor = null;
  };
}

/** Speak `text` aloud in `lang`, cancelling anything already in flight. */
export function speak(text: string, lang: SpeechLang = "en-IN"): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const clean = text.trim();
  if (!clean) return;
  stopSpeaking();
  const utter = new SpeechSynthesisUtterance(clean);
  const voice = pickVoice(lang);
  if (voice) utter.voice = voice;
  utter.lang = lang;
  utter.rate = 1.02;
  utter.pitch = 1;
  utter.volume = 1;
  // Some engines need a beat after cancel() before speak() will register.
  window.setTimeout(() => window.speechSynthesis.speak(utter), 60);
}

/** Immediately stop any in-flight spoken reply. */
export function stopSpeaking(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}

/* ------------------------------------------------------------------------- */
/* Demo-safe speech sanitizer                                                */
/* ------------------------------------------------------------------------- */

/**
 * Turn dashboard notation into something TTS reads like a human analyst:
 * "**102.16** · ₹6,504 · Δ +3.75% · +2.3 bps · ×1.038" becomes
 * "102.16, 6,504 rupees, change of +3.75 percent, +2.3 basis points, times 1.038".
 * Hindi replies keep Devanagari script (TTS handles it) but normalize units,
 * Indic digit forms, and the currency word ("रुपये").
 */
export function sanitizeForSpeech(raw: string, lang: SpeechLang = "en-IN"): string {
  let t = raw;
  const hi = lang.startsWith("hi");
  t = t.replace(/\*\*(.+?)\*\*/g, "$1"); // **bold** → bold
  // Devanagari digits → ASCII so engines without Indic digit support cope.
  t = t.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)));
  const currency = hi ? "रुपये" : "rupees";
  t = t.replace(/₹\s?([\d,]+(?:\.\d+)?)/g, `$1 ${currency}`);
  t = t.replace(/₹/g, currency);
  const percent = hi ? "प्रतिशत" : "percent";
  t = t.replace(/([\d,]+(?:\.\d+)?)\s?(?:%|％)/g, `$1 ${percent}`);
  if (hi) {
    t = t.replace(/\bbps\b/gi, "आधार अंक");
    t = t.replace(/एपीआईएक्स/g, "ए-पी-आई-एक्स"); // spell the acronym so TTS won't garble it
  } else {
    t = t.replace(/\bbps\b/gi, "basis points");
  }
  t = t.replace(/Δ/g, hi ? "बदलाव" : "change of");
  t = t.replace(/×/g, hi ? " गुना " : " times ");
  t = t.replace(/·/g, ", ");
  t = t.replace(/[→⇒]/g, hi ? " से " : " to ");
  t = t.replace(/[–—]/g, " ");
  t = t.replace(/…/g, " ");
  t = t.replace(/[""]/g, "");
  t = t.replace(/\s{2,}/g, " ");
  return t.trim();
}

/* Dev-only debug hook — lets the live preview verify the voice pipeline
   without a real microphone: window.__apixVoice.sanitizeForSpeech("…"). */
if (import.meta.env.DEV) {
  (window as unknown as { __apixVoice?: unknown }).__apixVoice = {
    sanitizeForSpeech,
    speak,
    stopSpeaking,
    getSpeechSupport,
  };
}
