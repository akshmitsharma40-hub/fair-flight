import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";

interface AnomalyAlertProps {
  dodPct: number;
  threshold?: number;
}

/**
 * Dynamic anomaly alert — drops down a bright red/orange warning banner with a
 * spring animation whenever the Day-over-Day APIx shift breaches ±5%.
 */
export function AnomalyAlert({ dodPct, threshold = 5 }: AnomalyAlertProps) {
  const [dismissed, setDismissed] = useState(false);
  const breached = Math.abs(dodPct) > threshold;
  const direction = dodPct >= 0 ? "surge" : "drop";

  return (
    <AnimatePresence>
      {breached && !dismissed && (
        <motion.div
          key="volatility-banner"
          initial={{ opacity: 0, y: -56, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -40, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          className="sticky top-3 z-40"
        >
          <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl border border-orange-400/50 bg-gradient-to-r from-red-600/90 via-orange-500/90 to-amber-500/90 px-4 py-3 shadow-2xl shadow-orange-950/50 backdrop-blur-md">
            {/* animated pulse sheen */}
            <motion.div
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
              initial={{ x: "-100%" }}
              animate={{ x: "160%" }}
              transition={{ repeat: Infinity, repeatDelay: 2.6, duration: 1.6, ease: "easeInOut" }}
            />
            <motion.span
              animate={{ rotate: [0, -12, 10, -8, 0] }}
              transition={{ repeat: Infinity, repeatDelay: 1.8, duration: 0.7 }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20"
            >
              <AlertTriangle className="h-5 w-5 text-white" strokeWidth={2.4} />
            </motion.span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold tracking-wide text-white">
                ⚠️ HIGH VOLATILITY DETECTED: APIx shifted by {dodPct >= 0 ? "+" : ""}
                {dodPct.toFixed(2)}%
              </p>
              <p className="mt-0.5 truncate text-xs text-orange-100">
                Day-over-day {direction} breaches the ±{threshold}% MoSPI editorial-review threshold ·
                flagged for COICOP 07.3.1.2 validation
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss volatility alert"
              className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default AnomalyAlert;
