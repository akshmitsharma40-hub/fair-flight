/**
 * provenance-badge.tsx — NSO-grade provenance stamp for charts & panels.
 *
 * Fetches /api/v1/apix/provenance once per session (module cache) and renders
 * a one-line, hover-expandable chain: model order + AIC · data vintage · code
 * revision · LIVE/EMBEDDED source. When the API is offline the badge hides
 * itself — the dashboard never fakes provenance.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Fingerprint } from "lucide-react";

import { fetchProvenance, type ProvenancePayload } from "@/lib/api";
import { cn } from "@/lib/utils";

let cached: ProvenancePayload | null = null;
let inflight: Promise<ProvenancePayload> | null = null;

async function loadProvenance(): Promise<ProvenancePayload | null> {
  if (cached) return cached;
  try {
    inflight = inflight ?? fetchProvenance();
    cached = await inflight;
    return cached;
  } catch {
    inflight = null;
    return null;
  }
}

interface ProvenanceBadgeProps {
  /** What this badge is stamping, e.g. "Index chart" — shown in the popover. */
  subject?: string;
  /** Compact = icon + tiny text inline; otherwise icon-only until hover. */
  compact?: boolean;
  className?: string;
}

export function ProvenanceBadge({ subject, compact = true, className }: ProvenanceBadgeProps) {
  const [prov, setProv] = useState<ProvenancePayload | null>(cached);

  useEffect(() => {
    let cancelled = false;
    void loadProvenance().then((p) => {
      if (!cancelled) setProv(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!prov) return null;

  const order = prov.model?.order ? `ARIMA(${prov.model.order.p},${prov.model.order.d},${prov.model.order.q})` : null;
  const aic = prov.model?.aic != null ? `AIC ${prov.model.aic.toFixed(1)}` : null;
  const vintage = prov.seriesMeta.indexCoverage?.last
    ? new Date(prov.seriesMeta.indexCoverage.last).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : null;
  const sha = prov.code.sha ? prov.code.sha.slice(0, 10) : null;

  const summary = [order, aic, vintage ? `data ${vintage}` : null, sha ? `rev ${sha}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <span className={cn("group relative inline-flex", className)}>
      <span
        className={cn(
          "inline-flex cursor-help items-center gap-1 rounded-md border border-slate-700/60 bg-slate-900/50 px-1.5 py-0.5",
          "text-[9px] font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:border-sky-600/60 hover:text-sky-300",
        )}
      >
        <Fingerprint className="h-3 w-3" />
        {compact && <span className="normal-case tracking-normal">{summary}</span>}
      </span>
      <motion.span
        initial={{ opacity: 0, y: 4 }}
        whileHover={{ opacity: 1, y: 0 }}
        className="pointer-events-none absolute bottom-full left-0 z-40 mb-1.5 hidden w-72 rounded-xl border border-slate-700/70 bg-slate-900/95 p-3 text-[10px] leading-relaxed text-slate-300 shadow-2xl backdrop-blur group-hover:block"
      >
        <span className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-sky-400">
          <Fingerprint className="h-3 w-3" /> Provenance{subject ? ` · ${subject}` : ""}
        </span>
        <span className="block">
          <b className="text-slate-100">Model:</b> {order ?? "n/a"} {aic ? `(${aic})` : ""} · {prov.model?.estimator ?? "n/a"} estimator
        </span>
        <span className="block">
          <b className="text-slate-100">Data vintage:</b> {vintage ?? "n/a"} ({prov.seriesMeta.indexCoverage?.rows ?? "?"} obs) · sha {prov.dataVintages["daily_index.csv"]?.sha256Head ?? "?"}
        </span>
        <span className="block">
          <b className="text-slate-100">Code:</b> {sha ? `rev ${sha}${prov.code.dirty ? " (dirty)" : ""}` : prov.code.note ?? "revision unavailable"}
        </span>
        <span className="block">
          <b className="text-slate-100">Method:</b> {prov.seriesMeta.method}, Base {prov.seriesMeta.baseYear}=100 · {prov.seriesMeta.coicop}
        </span>
        <span className="block">
          <b className="text-slate-100">Fuel channel:</b> {prov.atfFeed.publisher}
        </span>
        <span className="mt-1 block text-slate-500">Generated {new Date(prov.generatedAtUtc).toLocaleString("en-IN")} IST-approx · every figure reproducible from committed artifacts</span>
      </motion.span>
    </span>
  );
}

export default ProvenanceBadge;
