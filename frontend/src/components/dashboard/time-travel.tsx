import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, History, Link2, Radio } from "lucide-react";
import { getRouteSeries, getNationalSeries, type SectorScope } from "@/lib/series";
import { useT } from "@/lib/i18n";
import { cn, formatFullDate } from "@/lib/utils";

interface TimeTravelProps {
  scope: SectorScope;
  /** ISO date or null for live. */
  asOf: string | null;
  onAsOfChange: (date: string | null) => void;
  className?: string;
}

/**
 * Time-travel scrubber — drag to any observed date and the dashboard recomputes
 * "as of" that day. Implementation note: series are generated deterministically
 * with `endDate` fixed at today, so scrubbing slices the *existing* series
 * rather than regenerating it — KPIs, forecast anchors and heatmaps all re-derive
 * instantly with zero refetch.
 */
export function TimeTravel({ scope, asOf, onAsOfChange, className }: TimeTravelProps) {
  const [copied, setCopied] = useState(false);
  const tr = useT();

  const dates = useMemo(() => {
    const series = scope === "NATIONAL" ? getNationalSeries() : getRouteSeries(scope);
    return series.map((p) => p.date);
  }, [scope]);

  // Snapshot the series tail once per scope so the slider never re-renders loops.
  const lastIndex = dates.length - 1;
  const activeIndex = asOf ? Math.max(0, dates.indexOf(asOf)) : lastIndex;

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      // Clipboard unavailable (permissions) — the URL bar still shows the hash.
      setCopied(true);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.5 }}
      className={cn("glass-panel flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-4 py-3", className)}
    >
      <span className={cn("flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider", asOf ? "text-amber-400" : "text-emerald-400")}>
        {asOf ? <History className="h-3.5 w-3.5" /> : <Radio className="h-3.5 w-3.5 animate-apix-pulse" />}
        {asOf ? tr("timeTravel") : tr("live")}
      </span>

      <div className="flex min-w-52 flex-1 items-center gap-3">
        <input
          type="range"
          min={0}
          max={lastIndex}
          step={1}
          value={activeIndex}
          onChange={(e) => {
            const idx = Number(e.target.value);
            onAsOfChange(idx >= lastIndex ? null : dates[idx]);
          }}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-indigo-400"
          aria-label="Scrub dashboard to a past date"
        />
        <span className={cn("w-24 shrink-0 text-right text-[11px] font-semibold", asOf ? "text-amber-300" : "text-slate-400")}>
          {asOf ? formatFullDate(asOf) : tr("today")}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onAsOfChange(null)}
        disabled={!asOf}
        className={cn(
          "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-all",
          asOf
            ? "border-amber-400/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
            : "cursor-not-allowed border-slate-800 bg-slate-900/40 text-slate-600",
        )}
      >
        {tr("backToLive")}
      </button>

      <button
        type="button"
        onClick={() => void share()}
        title="Copy a shareable permalink of the current dashboard state"
        className="flex items-center gap-1.5 rounded-lg border border-slate-700/70 bg-slate-900/50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 transition-all hover:border-indigo-400/60 hover:text-indigo-300"
      >
        {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Link2 className="h-3 w-3" />}
        {copied ? tr("linkCopied") : tr("shareView")}
      </button>
    </motion.div>
  );
}

export default TimeTravel;
