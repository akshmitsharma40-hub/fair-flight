import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, CircleHelp, X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { TOUR_STEPS_HI, TOUR_CHROME_HI } from "@/lib/tourHi";
import { cn } from "@/lib/utils";

interface TourStep {
  title: string;
  body: string;
  /** Selector of the element to spotlight; falls back to screen center. */
  target: string;
  /** Where to anchor the card relative to the target. */
  placement: "right" | "left" | "top" | "center";
}

const STEPS: TourStep[] = [
  {
    title: "Welcome to APIx",
    body: "India's real-time airfare price index — a Laspeyres basket over five DGCA trunk corridors, built for CPI augmentation under COICOP-2018 Division 07. This 40-second tour hits the highlights.",
    target: "h1",
    placement: "bottom" as unknown as "right",
  },
  {
    title: "Command everything with ⌘K",
    body: "Press ⌘K (or Ctrl+K) anywhere to open the command palette: isolate a corridor, flip the base year, switch horizons, change theme, or jump between sections.",
    target: "button[title*='command palette']",
    placement: "bottom" as unknown as "right",
  },
  {
    title: "Controls cascade everywhere",
    body: "The base-year toggle, horizon pills, and sector filter re-derive every KPI, chart, and heatmap row from one shared state — try isolating DEL-BOM.",
    target: "#sec-controls",
    placement: "right",
  },
  {
    title: "The annotated index chart",
    body: "Observed APIx (glowing line) vs the official CPI benchmark (dashed), with macro-event badges, an ARIMA(p,1,q) 7-day forecast, and a 95% prediction band.",
    target: "#sec-chart",
    placement: "right",
  },
  {
    title: "Research-grade models",
    body: "The research panel scores the ARIMA engine with a walk-forward backtest, decomposes weekly seasonality, and compares Laspeyres vs Paasche vs Fisher index families.",
    target: "#sec-research",
    placement: "right",
  },
  {
    title: "Ask the analyst assistant",
    body: "The floating chatbot answers questions grounded in the live series — and can drive the dashboard for you. Try 'forecast for DEL-BOM' or 'switch to 2012 base'.",
    target: "[aria-label*='analyst assistant']",
    placement: "left",
  },
  {
    title: "Institutional plumbing",
    body: "Behind the UI: a FastAPI backend with HMAC-signed webhooks, SSE live ticks, rate-limited API keys, and a one-click PDF bulletin — e-Sankhyiki-style publishing.",
    target: "#sec-telemetry",
    placement: "top" as unknown as "right",
  },
];

interface GuidedTourProps {
  open: boolean;
  onClose: () => void;
}

export function GuidedTour({ open, onClose }: GuidedTourProps) {
  const [step, setStep] = useState(0);
  const { lang } = useLang();
  const hi = lang === "hi";

  const target = STEPS[step];
  const stepHi = TOUR_STEPS_HI[step];
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const measure = useCallback(() => {
    if (!open) return;
    try {
      const el = document.querySelector(STEPS[step].target);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ x: r.left, y: r.top + window.scrollY, w: r.width, h: r.height });
    } catch {
      setRect(null);
    }
  }, [step, open]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  useEffect(() => {
    if (!open) setStep(0);
  }, [open]);

  if (!open) return null;

  const cardPos = (() => {
    if (!rect) return { left: "50%", top: "38%", transform: "translate(-50%, -50%)" };
    const gap = 14;
    switch (target.placement) {
      case "right":
        return { left: rect.x + rect.w + gap, top: rect.y, transform: "none" };
      case "left":
        return { left: Math.max(12, rect.x - 340 - gap), top: rect.y, transform: "none" };
      case "top":
        return { left: rect.x, top: rect.y - 150 - gap, transform: "none" };
      default:
        return { left: rect.x, top: rect.y + rect.h + gap, transform: "none" };
    }
  })();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[95]"
        role="dialog"
        aria-label={hi ? TOUR_CHROME_HI.dialogLabel : "Guided tour"}
      >
        {/* Spotlight cut-out (four shade rectangles around the target box). */}
        {rect && (
          <>
            <div className="absolute inset-x-0 top-0 bg-slate-950/70 backdrop-blur-[2px]" style={{ height: rect.y - window.scrollY }} />
            <div className="absolute inset-x-0 bottom-0 bg-slate-950/70 backdrop-blur-[2px]" style={{ top: rect.y - window.scrollY + rect.h }} />
            <div className="absolute left-0 bg-slate-950/70 backdrop-blur-[2px]" style={{ top: rect.y - window.scrollY, width: rect.x, height: rect.h }} />
            <div className="absolute right-0 bg-slate-950/70 backdrop-blur-[2px]" style={{ top: rect.y - window.scrollY, left: rect.x + rect.w, height: rect.h }} />
            <motion.div
              layoutId="tour-spotlight"
              className="pointer-events-none absolute rounded-2xl ring-2 ring-indigo-400/80 shadow-[0_0_0_9999px_rgba(2,6,23,0)]"
              style={{ left: rect.x, top: rect.y - window.scrollY, width: rect.w, height: rect.h }}
            />
          </>
        )}

        {/* Click-anywhere backdrop advances (skip) the tour. */}
        <button type="button" aria-label={hi ? TOUR_CHROME_HI.skipLabel : "Skip tour"} className="absolute inset-0 cursor-default" onClick={onClose} />

        {/* Tour card */}
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="glass-panel absolute w-[330px] rounded-2xl p-5 shadow-2xl"
          style={cardPos}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-300">
              {hi ? TOUR_CHROME_HI.stepOf(step + 1, STEPS.length) : `Step ${step + 1} of ${STEPS.length}`}
            </p>
            <button type="button" onClick={onClose} aria-label={hi ? TOUR_CHROME_HI.endLabel : "End tour"} className="rounded p-1 text-slate-500 hover:text-slate-200">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <h3 className="mt-1.5 text-base font-bold text-white">{hi && stepHi ? stepHi.title : target.title}</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{hi && stepHi ? stepHi.body : target.body}</p>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex gap-1">
              {STEPS.map((_, i) => (
                <span key={i} className={cn("h-1.5 rounded-full transition-all", i === step ? "w-5 bg-indigo-400" : "w-1.5 bg-slate-600")} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:border-slate-500"
                >
                  <ChevronLeft className="h-3 w-3" /> {hi ? TOUR_CHROME_HI.back : "Back"}
                </button>
              )}
              <button
                type="button"
                onClick={() => (step === STEPS.length - 1 ? onClose() : setStep((s) => s + 1))}
                className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-indigo-600 to-sky-500 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg"
              >
                {step === STEPS.length - 1 ? (hi ? TOUR_CHROME_HI.finish : "Finish") : hi ? TOUR_CHROME_HI.next : "Next"} <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/** Floating help button that launches the tour (mounted near the chatbot FAB). */
export function TourLauncher({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Start the guided tour"
      title="Guided tour"
      className="fixed bottom-6 left-6 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-slate-700/70 bg-slate-900/80 text-slate-400 shadow-xl backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-indigo-400/60 hover:text-indigo-300"
    >
      <CircleHelp className="h-5 w-5" />
    </button>
  );
}

export default GuidedTour;
