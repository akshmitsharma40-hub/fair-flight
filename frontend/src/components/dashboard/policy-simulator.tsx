import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FlaskConical, Landmark, Loader2, RotateCcw, Scale } from "lucide-react";
import { fetchPolicySim, type PolicySimPayload } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ThemeName } from "@/lib/theme";

interface PolicySimulatorProps {
  scope: string;
  theme: ThemeName;
  className?: string;
}

interface Scenario {
  atfPct: number;
  demandPct: number;
  gstPp: number;
}

const fmtInr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

const PRESETS: Array<{ labelKey: "policyPresetAtf" | "policyPresetFestive" | "policyPresetGst" | "policyPresetCombined" | "policyPresetRelief"; scenario: Scenario }> = [
  { labelKey: "policyPresetAtf", scenario: { atfPct: 15, demandPct: 0, gstPp: 0 } },
  { labelKey: "policyPresetFestive", scenario: { atfPct: 0, demandPct: 8, gstPp: 0 } },
  { labelKey: "policyPresetGst", scenario: { atfPct: 0, demandPct: 0, gstPp: 2 } },
  { labelKey: "policyPresetCombined", scenario: { atfPct: 15, demandPct: 8, gstPp: 2 } },
  { labelKey: "policyPresetRelief", scenario: { atfPct: -10, demandPct: 0, gstPp: -1 } },
];

interface SimDatum {
  date: string;
  label: string;
  baseline: number;
  shocked: number;
  lower: number;
  upper: number;
}

function SimTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: SimDatum }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const delta = row.shocked - row.baseline;
  return (
    <div className="glass-panel rounded-xl px-4 py-3 text-xs shadow-2xl">
      <p className="font-semibold text-white">{row.label}</p>
      <p className="mt-1.5 text-slate-300">
        Baseline <span className="font-bold text-sky-300">{row.baseline.toFixed(2)}</span>
        {" · "}Shocked <span className={cn("font-bold", delta >= 0 ? "text-amber-300" : "text-emerald-300")}>{row.shocked.toFixed(2)}</span>
      </p>
      <p className="mt-0.5 text-[11px] text-slate-400">
        Δ {delta >= 0 ? "+" : ""}{delta.toFixed(2)} pts · band {row.lower.toFixed(1)}–{row.upper.toFixed(1)}
      </p>
    </div>
  );
}

export function PolicySimulator({ scope, theme, className }: PolicySimulatorProps) {
  const [scenario, setScenario] = useState<Scenario>({ atfPct: 15, demandPct: 0, gstPp: 0 });
  const [payload, setPayload] = useState<PolicySimPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tr = useT();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(async () => {
      try {
        const result = await fetchPolicySim(scenario, 14, scope);
        if (!cancelled) setPayload(result);
      } catch {
        if (!cancelled) setError("Simulator API offline — start uvicorn api:app to enable live simulation");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250); // debounce slider drags
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [scenario, scope]);

  const data = useMemo<SimDatum[]>(() => {
    if (!payload) return [];
    return payload.baseline.dates.map((date, i) => ({
      date,
      label: date.slice(5),
      baseline: payload.baseline.point[i],
      shocked: payload.shocked.point[i],
      lower: payload.shocked.lower95[i],
      upper: payload.shocked.upper95[i],
    }));
  }, [payload]);

  const gridColor = theme === "dark" ? "#1e293b" : "#dbe2f0";
  const axisTick = theme === "dark" ? "#64748b" : "#5b6b93";

  const sliders = [
    { key: "atfPct" as const, label: tr("policyAtfShock"), min: -50, max: 50, unit: "%", color: "accent-rose-400" },
    { key: "demandPct" as const, label: tr("policyDemand"), min: -50, max: 50, unit: "%", color: "accent-amber-400" },
    { key: "gstPp" as const, label: tr("policyGst"), min: -10, max: 10, unit: "pp", color: "accent-sky-400" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.6, ease: "easeOut" }}
      className={`glass-panel flex h-full flex-col rounded-2xl p-5 ${className ?? ""}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <FlaskConical className="h-4 w-4 text-fuchsia-400" /> {tr("policyTitle")}
          </h2>
          <p className="text-xs text-slate-400">{tr("policySub")}</p>
        </div>
        <button
          type="button"
          onClick={() => setScenario({ atfPct: 0, demandPct: 0, gstPp: 0 })}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700/70 bg-slate-900/50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200"
        >
          <RotateCcw className="h-3 w-3" /> {tr("policyReset")}
        </button>
      </div>

      {/* Sliders + presets */}
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 lg:grid-cols-2">
        {sliders.map((s) => (
          <div key={s.key}>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="font-semibold uppercase tracking-wider text-slate-500">{s.label}</span>
              <span className={cn("rounded-md bg-slate-800/70 px-1.5 py-0.5 font-bold text-slate-200")}>
                {scenario[s.key] > 0 ? "+" : ""}{scenario[s.key]}{s.unit}
              </span>
            </div>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={1}
              value={scenario[s.key]}
              onChange={(e) => setScenario((prev) => ({ ...prev, [s.key]: Number(e.target.value) }))}
              className={cn("h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700", s.color)}
              aria-label={s.label}
            />
            {s.key === "atfPct" && payload?.fuel && scenario.atfPct !== 0 && (
              <p className="mt-1 text-[9.5px] leading-tight text-slate-500">
                {tr("policyNotified")} ₹{fmtInr.format(payload.fuel.currentPerKl)}/kl → ₹{fmtInr.format(payload.fuel.impliedPerKl)}/kl · {payload.fuel.notifiedOn} · {payload.fuel.publisher}
              </p>
            )}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
          {PRESETS.map((p) => {
            const active =
              p.scenario.atfPct === scenario.atfPct &&
              p.scenario.demandPct === scenario.demandPct &&
              p.scenario.gstPp === scenario.gstPp;
            return (
              <button
                key={p.labelKey}
                type="button"
                onClick={() => setScenario(p.scenario)}
                className={cn(
                  "rounded-lg border px-2 py-1 text-[10.5px] font-semibold transition-all",
                  active
                    ? "border-fuchsia-400/60 bg-fuchsia-500/15 text-fuchsia-300"
                    : "border-slate-700/70 bg-slate-900/40 text-slate-400 hover:border-slate-500 hover:text-slate-200",
                )}
              >
                {tr(p.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Impact headline */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 px-3 py-2">
          <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">{tr("policyApixDelta")}</p>
          <p className={cn("text-lg font-bold", (payload?.impact.indexDeltaPct ?? 0) >= 0 ? "text-amber-400" : "text-emerald-400")}>
            {payload ? `${payload.impact.indexDeltaPct >= 0 ? "+" : ""}${payload.impact.indexDeltaPct}%` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 px-3 py-2">
          <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">{tr("policyCpiPass")}</p>
          <p className="text-lg font-bold text-sky-300">{payload ? `${payload.impact.cpiBps >= 0 ? "+" : ""}${payload.impact.cpiBps} bps` : "—"}</p>
        </div>
        <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 px-3 py-2">
          <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">{tr("policyFareMult")}</p>
          <p className="text-lg font-bold text-indigo-300">{payload ? `×${payload.fareMultiplier.toFixed(3)}` : "—"}</p>
        </div>
      </div>

      {/* Projection chart */}
      <div className="mt-3 h-44 min-h-0 w-full flex-1">
        {loading && (
          <div className="flex h-full items-center justify-center text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {!loading && error && (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center text-xs text-slate-500">
            <Landmark className="h-5 w-5 text-slate-600" />
            {error}
          </div>
        )}
        {!loading && !error && data.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
              <CartesianGrid stroke={gridColor} strokeDasharray="3 6" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: axisTick, fontSize: 10 }} axisLine={{ stroke: gridColor }} tickLine={false} interval={3} />
              <YAxis tick={{ fill: axisTick, fontSize: 10 }} axisLine={false} tickLine={false} domain={["auto", "auto"]} tickFormatter={(v: number) => v.toFixed(0)} />
              <Tooltip content={<SimTooltip />} cursor={{ stroke: gridColor }} />
              <Legend verticalAlign="top" align="right" iconType="circle" iconSize={7} formatter={(v) => <span className="text-[10px] text-slate-400">{v}</span>} />
              <Area type="monotone" dataKey="upper" stroke="none" fill="rgba(192,132,252,0.10)" isAnimationActive={false} name="95% band" />
              <Area type="monotone" dataKey="lower" stroke="none" fill="var(--sim-bg, #0b1120)" isAnimationActive={false} />
              <Area type="monotone" dataKey="shocked" stroke="#c084fc" strokeWidth={2.4} fill="rgba(192,132,252,0.12)" name="Shocked path" />
              <Line type="monotone" dataKey="baseline" stroke="#38bdf8" strokeWidth={1.8} strokeDasharray="5 4" dot={false} name="Baseline" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
        <Scale className="h-3 w-3" />
        {payload?.impact.note ?? tr("policyFoot")}
      </p>
    </motion.div>
  );
}

export default PolicySimulator;
