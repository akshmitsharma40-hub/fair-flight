import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Award, Fuel, Sigma, TrendingUp } from "lucide-react";
import {
  fetchAtfCorrelation,
  fetchBacktest,
  fetchCompanionIndices,
  fetchSeasonal,
  type AtfCorrelationPayload,
} from "@/lib/api";
import { clientBacktest, clientCompanion, clientSeasonal } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { ProvenanceBadge } from "@/components/dashboard/provenance-badge";
import type { ThemeName } from "@/lib/theme";
import type { SectorScope } from "@/lib/series";

interface ResearchPanelProps {
  scope: SectorScope;
  theme: ThemeName;
  className?: string;
}

interface BacktestView {
  mae: number;
  rmse: number;
  mape: number;
  coverage95: number;
  naiveMae: number;
  skillVsNaive: number;
  folds: number;
  source: "backend" | "client";
}

interface SeasonalView {
  strength: number;
  interpretation: string;
  weekdayProfile: Array<{ day: string; effect: number }>;
  source: "backend" | "client";
}

interface CompanionView {
  dates: string[];
  laspeyres: number[];
  paasche: number[];
  fisher: number[];
  substitutionBiasPts: number;
  source: "backend" | "client";
}

function ScoreTile({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: "good" | "mid" | "info" }) {
  return (
    <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 px-3 py-2">
      <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p
        className={cn(
          "text-base font-bold",
          tone === "good" ? "text-emerald-400" : tone === "mid" ? "text-amber-400" : "text-sky-300",
        )}
      >
        {value}
      </p>
      <p className="text-[9.5px] text-slate-500">{hint}</p>
    </div>
  );
}

export function ResearchPanel({ scope, theme, className }: ResearchPanelProps) {
  const [backtest, setBacktest] = useState<BacktestView | null>(null);
  const [seasonal, setSeasonal] = useState<SeasonalView | null>(null);
  const tr = useT();
  const [companion, setCompanion] = useState<CompanionView | null>(null);
  const [atf, setAtf] = useState<AtfCorrelationPayload | null>(null);
  const [apiUp, setApiUp] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [bt, sd, comp, fuel] = await Promise.all([
          fetchBacktest(scope),
          fetchSeasonal(scope),
          fetchCompanionIndices(90),
          fetchAtfCorrelation(scope),
        ]);
        if (cancelled) return;
        setBacktest({ ...bt, source: "backend" });
        setSeasonal({ strength: sd.strength, interpretation: sd.interpretation, weekdayProfile: sd.weekdayProfile, source: "backend" });
        setCompanion({ ...comp, source: "backend" });
        setAtf(fuel);
        setApiUp(true);
      } catch {
        if (cancelled) return;
        setBacktest(clientBacktest(scope));
        setSeasonal(clientSeasonal(scope));
        setCompanion(clientCompanion(90));
        setAtf(null);
        setApiUp(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const gridColor = theme === "dark" ? "#1e293b" : "#dbe2f0";
  const axisTick = theme === "dark" ? "#64748b" : "#5b6b93";

  const weekdayData = useMemo(
    () => (seasonal?.weekdayProfile ?? []).map((w) => ({ ...w, abs: Math.abs(w.effect) })),
    [seasonal],
  );

  const companionData = useMemo(
    () =>
      (companion?.dates ?? []).map((date, i) => ({
        date: date.slice(5),
        laspeyres: companion!.laspeyres[i],
        paasche: companion!.paasche[i],
        fisher: companion!.fisher[i],
      })),
    [companion],
  );

  const sourceTag = (source: "backend" | "client") => (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[9px] font-bold",
        source === "backend" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400",
      )}
    >
      {source === "backend" ? "API" : "CLIENT"}
    </span>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.6, ease: "easeOut" }}
      className={`glass-panel flex h-full flex-col rounded-2xl p-5 ${className ?? ""}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <Award className="h-4 w-4 text-emerald-400" /> {tr("researchTitle")}
          </h2>
          <p className="text-xs text-slate-400">{tr("researchSub")}</p>
        </div>
        {!apiUp && <span className="text-[10px] text-amber-400">API offline — client estimates</span>}
      </div>

      {/* Backtest scoreboard */}
      {backtest && (
        <div>
          <p className="mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Walk-forward backtest · ARIMA {backtest.source === "backend" ? "(server)" : "(client port)"} {sourceTag(backtest.source)}
            <ProvenanceBadge subject="Backtest" />
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ScoreTile label="MAE" value={backtest.mae.toFixed(2)} hint={`${backtest.folds} folds × 7d`} tone="info" />
            <ScoreTile label="MAPE" value={`${backtest.mape.toFixed(1)}%`} hint="mean abs % error" tone={backtest.mape < 5 ? "good" : "mid"} />
            <ScoreTile
              label="Skill vs naive"
              value={`${(backtest.skillVsNaive * 100).toFixed(0)}%`}
              hint={`persistence MAE ${backtest.naiveMae.toFixed(1)}`}
              tone={backtest.skillVsNaive > 0.3 ? "good" : "mid"}
            />
            <ScoreTile label="95% coverage" value={`${backtest.coverage95.toFixed(0)}%`} hint="actuals inside band" tone="info" />
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Weekday seasonality */}
        {seasonal && (
          <div className="min-w-0">
            <p className="mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              <TrendingUp className="h-3 w-3" /> Weekly seasonality · strength {(seasonal.strength * 100).toFixed(0)}% {sourceTag(seasonal.source)}
            </p>
            <div className="h-28">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekdayData} margin={{ top: 2, right: 4, bottom: 0, left: -22 }}>
                  <CartesianGrid stroke={gridColor} strokeDasharray="2 5" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: axisTick, fontSize: 9 }} axisLine={{ stroke: gridColor }} tickLine={false} />
                  <YAxis tick={{ fill: axisTick, fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v.toFixed(1)} />
                  <Tooltip
                    cursor={{ fill: "rgba(99,102,241,0.08)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0].payload as { day: string; effect: number };
                      return (
                        <div className="glass-panel rounded-lg px-3 py-2 text-[11px] shadow-xl">
                          <span className="font-semibold text-white">{row.day}</span>{" "}
                          <span className={row.effect >= 0 ? "text-amber-300" : "text-emerald-300"}>
                            {row.effect >= 0 ? "+" : ""}{row.effect.toFixed(2)} idx pts
                          </span>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="effect" radius={[3, 3, 0, 0]}>
                    {weekdayData.map((w, i) => (
                      <Cell key={i} fill={w.effect >= 0 ? "#fbbf24" : "#34d399"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-0.5 text-[10px] text-slate-500">{seasonal.interpretation} · Fri/Sun leisure peaks vs midweek troughs</p>
          </div>
        )}

        {/* Companion indices */}
        {companion && (
          <div className="min-w-0">
            <p className="mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              <Sigma className="h-3 w-3" /> Index family · Laspeyres vs Paasche vs Fisher {sourceTag(companion.source)}
            </p>
            <div className="h-28">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={companionData} margin={{ top: 2, right: 4, bottom: 0, left: -22 }}>
                  <CartesianGrid stroke={gridColor} strokeDasharray="2 5" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: axisTick, fontSize: 9 }} axisLine={{ stroke: gridColor }} tickLine={false} interval={20} />
                  <YAxis tick={{ fill: axisTick, fontSize: 9 }} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0].payload as { date: string; laspeyres: number; paasche: number; fisher: number };
                      return (
                        <div className="glass-panel rounded-lg px-3 py-2 text-[11px] shadow-xl">
                          <p className="font-semibold text-white">{row.date}</p>
                          <p className="text-slate-300">L {row.laspeyres.toFixed(1)} · P {row.paasche.toFixed(1)} · F {row.fisher.toFixed(1)}</p>
                        </div>
                      );
                    }}
                  />
                  <Line type="monotone" dataKey="laspeyres" stroke="#818cf8" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="paasche" stroke="#34d399" strokeWidth={1.4} strokeDasharray="4 3" dot={false} />
                  <Line type="monotone" dataKey="fisher" stroke="#fbbf24" strokeWidth={1.4} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-0.5 text-[10px] text-slate-500">
              Substitution bias (L−P): <span className="font-bold text-amber-400">{companion.substitutionBiasPts.toFixed(2)} pts</span> — Fisher halves it
            </p>
          </div>
        )}
      </div>

      {/* Real ATF feed · PPAC/IOCL Delhi notified prices */}
      {atf && (
        <div className="mt-4">
          <p className="mb-1.5 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            <Fuel className="h-3 w-3" /> ATF × APIx · real notified fuel prices
            <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-bold text-sky-400">REAL FEED</span>
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ScoreTile
              label="Latest notified"
              value={`₹${atf.atfLatest.toFixed(0)}/kl`}
              hint={`${atf.atfLatestDate} · OMC notification`}
              tone="info"
            />
            <ScoreTile
              label="Revision → fare r"
              value={atf.revisionCorrelation.pearsonR.toFixed(2)}
              hint={`${atf.revisionCorrelation.n} monthly notifications`}
              tone={Math.abs(atf.revisionCorrelation.pearsonR) >= 0.2 ? "good" : "mid"}
            />
            <ScoreTile label="Daily-return r" value={atf.pearsonR.toFixed(2)} hint="monthly price @ daily freq" tone="mid" />
            <ScoreTile label="OLS β" value={atf.ols.beta.toFixed(2)} hint="ΔAPIx% per ΔATF%" tone="info" />
          </div>
          {atf.monthlyRevisions.length > 0 && (
            <div className="mt-2 overflow-x-auto rounded-xl border border-slate-800/70">
              <table className="w-full text-left text-[10.5px]">
                <thead>
                  <tr className="text-[9px] uppercase tracking-wider text-slate-500">
                    <th className="px-2.5 py-1.5 font-bold">Notified</th>
                    <th className="px-2.5 py-1.5 font-bold">Δ ATF</th>
                    <th className="px-2.5 py-1.5 font-bold">Delhi ₹/kl</th>
                    <th className="px-2.5 py-1.5 font-bold">APIx ±30d</th>
                    <th className="px-2.5 py-1.5 font-bold">Source</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  {atf.monthlyRevisions.slice(-5).reverse().map((m) => (
                    <tr key={m.date} className="border-t border-slate-800/60">
                      <td className="px-2.5 py-1.5 font-semibold text-white">{m.date}</td>
                      <td
                        className={cn(
                          "px-2.5 py-1.5 font-bold",
                          (m.atfPctChange ?? 0) > 0 ? "text-red-400" : (m.atfPctChange ?? 0) < 0 ? "text-emerald-400" : "text-slate-400",
                        )}
                      >
                        {(m.atfPctChange ?? 0) > 0 ? "+" : ""}
                        {(m.atfPctChange ?? 0).toFixed(1)}%
                      </td>
                      <td className="px-2.5 py-1.5">₹{m.atfPerKl.toFixed(0)}</td>
                      <td className={cn("px-2.5 py-1.5", m.apixDelta30dPct >= 0 ? "text-red-400" : "text-emerald-400")}>
                        {m.apixDelta30dPct >= 0 ? "+" : ""}
                        {m.apixDelta30dPct.toFixed(1)}%
                      </td>
                      <td className="max-w-[220px] truncate px-2.5 py-1.5 text-slate-500" title={`${m.source} — ${m.outlet}`}>
                        {m.outlet}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-1 text-[10px] text-slate-500">
            {atf.provenance.series} · {atf.provenance.coverage} · verified {atf.provenance.lastVerified} · overlap {atf.overlap.start} → {atf.overlap.end} ({atf.overlap.nDays}d). {atf.provenance.caveat}
          </p>
        </div>
      )}
    </motion.div>
  );
}

export default ResearchPanel;
