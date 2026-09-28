/**
 * methodology-panel.tsx — formal methodology drawer for FAIR FLIGHT.
 *
 * The About panel explains concepts in prose; this drawer is the *formal*
 * companion: rendered formulas (Laspeyres aggregation, ψ window-weights,
 * ARIMA notation, CPI pass-through), the COICOP-2018 mapping table, weight
 * tables, and the fuel-channel documentation — the "NSO methodology page"
 * a statistician would ask for.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Landmark, ScrollText, Sigma, X } from "lucide-react";

import { LogoAeroTrend } from "@/components/logo-aero-trend";
import { fetchProvenance, type ProvenancePayload } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Custom event fired by the tools flyout to open this panel. */
export const METHODOLOGY_OPEN_EVENT = "apix:open-methodology";

export function openMethodology(): void {
  window.dispatchEvent(new CustomEvent(METHODOLOGY_OPEN_EVENT));
}

interface Formula {
  title: string;
  latexish: string;
  note: string;
}

const FORMULAS: Formula[] = [
  {
    title: "1 · Laspeyres aggregation",
    latexish: "APIx_t = 100 × ( Σᵢ Σ_w  Wᵢ · ψ_w · P_{i,w,t} )  /  ( Σᵢ Σ_w  Wᵢ · ψ_w · P_{i,w,0} )",
    note: "Wᵢ = DGCA traffic share of corridor i (0.35/0.25/0.20/0.10/0.10); ψ_w = booking-window weight (T+1: 0.15, T+7: 0.35, T+15: 0.50). The denominator is frozen at the 2024 base period, so the basket never drifts with behaviour.",
  },
  {
    title: "2 · Base-year anchoring",
    latexish: "APIx_{2024 avg} ≡ 100.00",
    note: "Anchor set exactly to MoSPI's Base Year 2024 = 100 mandate (COICOP-2018 revision). The 2012=100 view is a chained re-index: APIx_t^{2012} = APIx_t × (CPI_{2012 anchor} / 100), applied for comparability with legacy series.",
  },
  {
    title: "3 · Window-weight system (ψ)",
    latexish: "ψ = (0.15, 0.35, 0.50)  for  w ∈ {T+1, T+7, T+15}",
    note: "Weights reflect observed advance-purchase mix on Indian trunk routes: half the basket buys two weeks out, a third buys within a week, and 15% buys next-day (distress/late demand). Fixed ψ keeps the Laspeyres quantity frame intact.",
  },
  {
    title: "4 · ARIMA forecast model",
    latexish: "(1 − B)¹ y_t = c + (1 − θ₁B) ε_t ,   θ₁ chosen by AIC grid (p ≤ 3, q ≤ 2)",
    note: "Fitted by Hannan–Rissanen two-stage estimation on the published series; 95% prediction bands from the MA(1) innovation variance. Walk-forward backtest (12 folds × 7 days) scores it against the naive persistence forecast.",
  },
  {
    title: "5 · CPI pass-through",
    latexish: "ΔCPI_bps = ΔAPIx% × ω_air × 100,   ω_air = 0.0061",
    note: "Air passenger transport weighs 0.61% of the CPI-2024 basket (COICOP 07.3.1.2 within Division 07). A +1% APIx move ≈ +0.61 basis points of headline CPI — the policy simulator applies this to scenario shocks.",
  },
  {
    title: "6 · Fuel channel (ATF)",
    latexish: "ATF_t^{notify} = f( avg jet-fuel spot, USD/INR )  —  notified 1st of month",
    note: "Real feed: IOCL/BPCL/HPCL monthly notifications (Delhi depot benchmark) as published via PPAC (MoPNG). Daily values are piecewise-constant between notifications; the correlation panel reports the honest frequencies rather than inventing daily variation.",
  },
];

const COICOP_MAP = [
  { code: "07", label: "Transport", level: "Division" },
  { code: "07.3", label: "Transport services", level: "Group" },
  { code: "07.3.1", label: "Long-distance land, air & water passenger transport", level: "Class" },
  { code: "07.3.1.2", label: "Passenger transport by air", level: "Sub-class" },
];

const ROUTE_TABLE = [
  { corridor: "DEL–BOM", route: "Delhi → Mumbai", weight: "35%" },
  { corridor: "DEL–BLR", route: "Delhi → Bengaluru", weight: "25%" },
  { corridor: "BOM–BLR", route: "Mumbai → Bengaluru", weight: "20%" },
  { corridor: "BLR–HYD", route: "Bengaluru → Hyderabad", weight: "10%" },
  { corridor: "DEL–CCU", route: "Delhi → Kolkata", weight: "10%" },
];

const WINDOW_TABLE = [
  { window: "T+1", meaning: "Departure next day (distress demand)", weight: "15%" },
  { window: "T+7", meaning: "Departure in one week", weight: "35%" },
  { window: "T+15", meaning: "Departure in two weeks", weight: "50%" },
];

export function MethodologyPanel({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [prov, setProv] = useState<ProvenancePayload | null>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(METHODOLOGY_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(METHODOLOGY_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open || prov) return;
    fetchProvenance()
      .then(setProv)
      .catch(() => setProv(null));
  }, [open, prov]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="methodology-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}
      {open && (
        <motion.aside
          key="methodology-panel"
          initial={{ x: "-100%" }}
          animate={{ x: 0 }}
          exit={{ x: "-100%" }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          className={cn(
            "fixed left-0 top-0 z-[71] flex h-full w-full max-w-2xl flex-col overflow-y-auto",
            "border-r border-slate-700/60 bg-slate-950/95 p-6 shadow-2xl backdrop-blur-xl",
            className,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <LogoAeroTrend className="h-10 w-10 logo-shimmer" />
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                    <ScrollText className="h-4.5 w-4.5 text-sky-400" /> Methodology
                  </h2>
                  <p className="text-[11px] text-slate-400">Formal definitions — the NSO methods page for APIx</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                aria-label="Close methodology"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Formulas */}
            <div className="space-y-3">
              {FORMULAS.map((f) => (
                <div key={f.title} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <Sigma className="h-3 w-3 text-indigo-400" /> {f.title}
                  </p>
                  <p className="overflow-x-auto rounded-lg bg-slate-950/80 px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-sky-200">
                    {f.latexish}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{f.note}</p>
                </div>
              ))}
            </div>

            {/* COICOP mapping */}
            <div className="mt-5">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <Landmark className="h-3 w-3 text-amber-400" /> COICOP-2018 classification path
              </p>
              <div className="overflow-hidden rounded-xl border border-slate-800">
                <table className="w-full text-left text-[11.5px]">
                  <tbody>
                    {COICOP_MAP.map((row, i) => (
                      <tr key={row.code} className={cn("border-slate-800/70", i > 0 && "border-t")}>
                        <td className="px-3 py-2 font-mono font-bold text-sky-300">{row.code}</td>
                        <td className="px-3 py-2 text-slate-200">{row.label}</td>
                        <td className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-slate-500">{row.level}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Weight tables */}
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Route weights (Wᵢ)</p>
                <div className="overflow-hidden rounded-xl border border-slate-800">
                  <table className="w-full text-left text-[11px]">
                    <tbody>
                      {ROUTE_TABLE.map((r, i) => (
                        <tr key={r.corridor} className={cn("border-slate-800/70", i > 0 && "border-t")}>
                          <td className="px-2.5 py-1.5 font-mono text-slate-300">{r.corridor}</td>
                          <td className="px-2.5 py-1.5 text-slate-400">{r.route}</td>
                          <td className="px-2.5 py-1.5 text-right font-bold text-emerald-400">{r.weight}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Window weights (ψ_w)</p>
                <div className="overflow-hidden rounded-xl border border-slate-800">
                  <table className="w-full text-left text-[11px]">
                    <tbody>
                      {WINDOW_TABLE.map((w, i) => (
                        <tr key={w.window} className={cn("border-slate-800/70", i > 0 && "border-t")}>
                          <td className="px-2.5 py-1.5 font-mono font-bold text-sky-300">{w.window}</td>
                          <td className="px-2.5 py-1.5 text-slate-400">{w.meaning}</td>
                          <td className="px-2.5 py-1.5 text-right font-bold text-emerald-400">{w.weight}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Live provenance chain */}
            {prov && (
              <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <BookOpen className="h-3 w-3 text-violet-400" /> Current provenance chain
                </p>
                <ul className="space-y-1 text-[11px] leading-relaxed text-slate-400">
                  <li>
                    <b className="text-slate-200">Series:</b> {prov.seriesMeta.name} — {prov.seriesMeta.method}, Base {prov.seriesMeta.baseYear}=100
                  </li>
                  <li>
                    <b className="text-slate-200">Index coverage:</b> {prov.seriesMeta.indexCoverage?.first} → {prov.seriesMeta.indexCoverage?.last} ({prov.seriesMeta.indexCoverage?.rows} daily prints)
                  </li>
                  <li>
                    <b className="text-slate-200">Model:</b>{" "}
                    {prov.model?.order ? `ARIMA(${prov.model.order.p},${prov.model.order.d},${prov.model.order.q})` : "n/a"} · AIC {prov.model?.aic?.toFixed(2) ?? "n/a"} · {prov.model?.estimator}
                  </li>
                  <li>
                    <b className="text-slate-200">Code:</b> {prov.code.sha ? `rev ${prov.code.sha}${prov.code.dirty ? " (dirty tree)" : ""}` : prov.code.note}
                  </li>
                  <li>
                    <b className="text-slate-200">Fuel:</b> {prov.atfFeed.series}
                  </li>
                  <li>
                    <b className="text-slate-200">Artifacts:</b>{" "}
                    {Object.entries(prov.dataVintages)
                      .map(([name, v]) => `${name}${v.sha256Head ? ` ·sha ${v.sha256Head.slice(0, 8)}` : ""}`)
                      .join("  •  ")}
                  </li>
                </ul>
              </div>
            )}

            <p className="mt-4 border-t border-slate-800 pt-3 text-[10px] leading-relaxed text-slate-500">
              Convention notes: fares are best-economy quotes for the travel date, captured once daily (05:30 IST publication);
              taxes &amp; fees included; outlier protection at ₹25,000. The 2012=100 view is a chained re-index for legacy comparability.
              All formulas are implemented in <span className="font-mono text-slate-400">backend/index_engine.py</span> and{" "}
              <span className="font-mono text-slate-400">backend/forecast_engine.py</span>, reproducible from committed artifacts.
            </p>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

export default MethodologyPanel;
