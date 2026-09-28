import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { ProvenanceBadge } from "@/components/dashboard/provenance-badge";
import { useT } from "@/lib/i18n";
import type { ChartDatum, MacroEvent } from "@/lib/series";
import { formatDayMonth, formatInr, formatSignedPercent } from "@/lib/utils";

interface IndexChartProps {
  history: ChartDatum[];
  forecast: ChartDatum[];
  events: Array<{ date: string; event: MacroEvent }>;
  forecastMeta?: {
    family: string;
    order: { p: number; d: number; q: number };
    aic: number;
    nObs: number;
    source: "backend" | "client";
  } | null;
  baseYear: string;
  scopeLabel: string;
  theme?: "dark" | "light";
}

/** Full merged series: history + forecast (forecast rows carry `forecast`). */
const EVENT_COLOR: Record<MacroEvent["kind"], string> = {
  festival: "#f59e0b", // amber-500
  fuel: "#f43f5e", // rose-500
  demand: "#a78bfa", // violet-400
};

interface BadgePayload {
  date: string;
  event: MacroEvent;
}

/**
 * Custom SVG event badge rendered at the top of each ReferenceLine. Recharts
 * mounts label elements at the line's x position, so the badge only needs to
 * draw centered geometry; the event identity arrives via a per-line closure.
 */
function EventBadge({ badge }: { badge: BadgePayload }) {
  const color = EVENT_COLOR[badge.event.kind];
  // Anchored to the right of the line so the badge never clips at the
  // chart's left edge (macro events never fall in the forecast zone).
  return (
    <g>
      <rect
        x={6}
        y={2}
        width={92}
        height={22}
        rx={6}
        fill="rgba(10,15,30,0.94)"
        stroke={color}
        strokeWidth={1}
      />
      <g transform="translate(17, 13)">
        <circle r={5.5} fill={color} opacity={0.28} />
        <path
          d={
            badge.event.kind === "fuel"
              ? "M-3 -1.5 L0 -1.5 L-1 1 L2.5 1"
              : badge.event.kind === "festival"
                ? "M-3 1.5 L-1 -2 L1 1 L3 -2"
                : "M-2.5 -2 L-2.5 2 M1 -2 L1 2 M-0.75 -2 L-0.75 2"
          }
          stroke={color}
          strokeWidth={1.4}
          fill="none"
          strokeLinecap="round"
        />
      </g>
      <text x={30} y={17} fontSize={9.5} fontWeight={700} letterSpacing={0.6} fill={color}>
        {badge.event.short}
      </text>
    </g>
  );
}

interface TooltipEntry {
  payload: ChartDatum & { forecast?: number };
}

function ScopeTooltip({
  active,
  payload,
  baseYear,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  baseYear: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const isForecast = Boolean(row.forecast);
  // Forecast plot rows carry apix: null (so the observed line stops there) —
  // their value lives on the `forecast` key instead.
  const shownValue = typeof row.apix === "number" ? row.apix : row.forecast ?? 0;
  return (
    <div className="glass-panel rounded-xl px-4 py-3 text-xs shadow-2xl">
      <div className="flex items-center justify-between gap-6">
        <p className="font-semibold text-white">{formatDayMonth(row.date)}</p>
        {isForecast && (
          <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
            Forecast
          </span>
        )}
      </div>
      <div className="mt-2 space-y-1.5">
        <div className="flex items-center gap-2">
          <span
            className={
              isForecast
                ? "h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.6)]"
                : "h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_8px_2px_rgba(56,189,248,0.6)]"
            }
          />
          <span className="text-slate-300">APIx ({baseYear}=100)</span>
          <span className={`ml-auto font-bold ${isForecast ? "text-emerald-300" : "text-sky-300"}`}>
            {shownValue.toFixed(2)}
          </span>
        </div>
        {isForecast && (
          <div className="mt-1 border-t border-slate-700/60 pt-1.5 text-[11px] text-slate-400">
            95% interval{" "}
            <span className="font-semibold text-emerald-300">
              {typeof row.lower95 === "number" && typeof row.upper95 === "number"
                ? `${row.lower95.toFixed(1)} – ${row.upper95.toFixed(1)}`
                : "—"}
            </span>
          </div>
        )}
        {!isForecast && (
          <>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-slate-500" />
              <span className="text-slate-300">Official CPI</span>
              <span className="ml-auto font-bold text-slate-200">{row.cpiBenchmark.toFixed(1)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Weighted basket</span>
              <span className="ml-auto font-semibold text-indigo-300">{formatInr(row.fare)}</span>
            </div>
            <div className="flex items-center gap-2 border-t border-slate-700/60 pt-1.5 text-[11px]">
              <span className="text-slate-400">DoD shift</span>
              <span
                className={`ml-auto font-bold ${
                  row.dodPct >= 0 ? "text-amber-300" : "text-emerald-300"
                }`}
              >
                {formatSignedPercent(row.dodPct)}
              </span>
            </div>
            {row.events.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1 border-t border-slate-700/60 pt-1.5">
                {row.events.map((event) => (
                  <span
                    key={event.id}
                    className="rounded-md bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{ color: EVENT_COLOR[event.kind] }}
                  >
                    {event.label}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function IndexChart({ history, forecast, events, forecastMeta, baseYear, scopeLabel, theme: themeProp }: IndexChartProps) {
  // Follow the page theme so grid/axis colors stay readable in both modes.
  const [theme, setTheme] = useState(themeProp ?? "dark");
  useEffect(() => {
    if (themeProp) {
      setTheme(themeProp);
      return;
    }
    const read = () => setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [themeProp]);
  const gridColor = theme === "dark" ? "#1e293b" : "#dbe2f0";
  const axisTick = theme === "dark" ? "#64748b" : "#5b6b93";
  const axisLine = theme === "dark" ? "#1e293b" : "#c9d3e8";
  // Merged plot data: observed rows carry `apix`, forecast rows carry only
  // `forecast` (so the solid line stops and the dashed segment takes over).
  // The bridge row joins both segments and tapers the 95% band to zero width
  // at the anchor date. band95 is a [lower, upper] tuple — Recharts 2 renders
  // tuple-valued dataKeys as a true range band between the two bounds.
  type PlotRow = Omit<ChartDatum, "apix"> & { apix: number | null; isForecast?: boolean; band95?: [number, number] };
  const lastObserved = history[history.length - 1]?.apix ?? null;
  const merged: PlotRow[] = [
    ...history.map((d) => ({ ...d, apix: d.apix })),
    ...forecast.map((f, i) =>
      i === 0
        ? {
            ...f,
            apix: null as number | null,
            forecast: lastObserved ?? f.forecast,
            band95: lastObserved !== null ? ([lastObserved, lastObserved] as [number, number]) : undefined,
            isForecast: true,
          }
        : {
            ...f,
            apix: null as number | null,
            band95: [f.lower95 ?? f.forecast ?? 0, f.upper95 ?? f.forecast ?? 0] as [number, number],
            isForecast: true,
          },
    ),
  ];

  // Anchor the y-domain to observed + point forecast; the 95% band may
  // overflow gracefully (allowDataOverflow clips it at the plot edge).
  const yValues = [
    ...history.map((d) => d.apix),
    ...forecast.map((f) => f.apix),
  ].filter((v) => Number.isFinite(v));
  const yDomain: [number, number] = [
    Math.floor(Math.min(...yValues) - 4),
    Math.ceil(Math.max(...yValues) + 6),
  ];

  const orderLabel = forecastMeta ? `ARIMA(${forecastMeta.order.p},${forecastMeta.order.d},${forecastMeta.order.q})` : "ARIMA";
  const sourceLabel = forecastMeta?.source === "backend" ? "fitted on data_master.csv" : "client fit (offline demo)";
  const tr = useT();

  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.6, ease: "easeOut" }}
      className="glass-panel flex h-full flex-col rounded-2xl p-5"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-white">
            {tr("chartTitle")} · {scopeLabel}
            {forecastMeta && (
              <span
                title={`AIC ${forecastMeta.aic.toFixed(1)} · n=${forecastMeta.nObs} · ${sourceLabel}`}
                className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300"
              >
                {orderLabel}
              </span>
            )}
          </h2>
          <p className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>
              {tr("chartSub")} {baseYear}=100 · {tr("chartEventAnnotated")} · {forecastMeta ? `${forecastMeta.family} ${tr("chartProjection7d")}` : tr("chartForward")}
            </span>
            <ProvenanceBadge subject="Index chart" />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="h-0.5 w-5 rounded-full bg-sky-400 shadow-[0_0_8px_2px_rgba(56,189,248,0.6)]" />
            {tr("legendObserved")}
          </span>
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="h-0.5 w-5 rounded-full border-t-2 border-dashed border-emerald-400" />
            {tr("legendForecast")}
          </span>
          {merged.some((d) => d.isForecast) && (
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="h-2.5 w-3 rounded-[2px] border border-emerald-400/50 bg-emerald-500/20" />
              {tr("legendBand")}
            </span>
          )}
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="h-2.5 w-2.5 rounded-[3px] border border-amber-400/80 bg-amber-400/20" />
            {tr("legendEvents")}
          </span>
        </div>
      </div>

      <div className="h-80 w-full shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={merged} margin={{ top: 34, right: 14, bottom: 4, left: -8 }}>
            <defs>
              <linearGradient id="apixObservedFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="apixForecastFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke={gridColor} strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDayMonth}
              tick={{ fill: axisTick, fontSize: 11 }}
              axisLine={{ stroke: axisLine }}
              tickLine={false}
              minTickGap={30}
            />
            <YAxis
              domain={yDomain}
              allowDataOverflow
              tick={{ fill: axisTick, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip
              content={<ScopeTooltip baseYear={baseYear} />}
              cursor={{ stroke: "#475569", strokeDasharray: "4 4" }}
            />

            {/* Macro-event annotation lines with SVG badges (event identity
                captured per line via closure — Recharts injects viewBox). */}
            {events.map(({ date, event }) => {
              const LineBadge = () => <EventBadge badge={{ date, event }} />;
              return (
                <ReferenceLine
                  key={`${event.id}-${date}`}
                  x={date}
                  stroke={EVENT_COLOR[event.kind]}
                  strokeDasharray="4 4"
                  strokeOpacity={0.75}
                  label={<LineBadge />}
                  ifOverflow="extendDomain"
                />
              );
            })}

            {/* 95% ARIMA prediction band — tuple dataKey renders a true
                lower–upper range area with a zero-width taper at the anchor */}
            <Area
              type="monotone"
              dataKey="band95"
              stroke="none"
              fill="#34d399"
              fillOpacity={0.15}
              isAnimationActive={false}
              connectNulls
            />

            {/* Observed area under the glowing line */}
            <Area
              type="monotone"
              dataKey="apix"
              stroke="#38bdf8"
              strokeWidth={3}
              fill="url(#apixObservedFill)"
              dot={false}
              activeDot={{ r: 5, fill: "#38bdf8", stroke: "#0c4a6e", strokeWidth: 2 }}
              animationDuration={1100}
              connectNulls={false}
              style={{ filter: "drop-shadow(0 0 6px rgba(56, 189, 248, 0.6))" }}
              isAnimationActive
            />

            {/* Forecast segment — dashed emerald, one point joined to history */}
            <Area
              type="monotone"
              dataKey="forecast"
              stroke="#34d399"
              strokeWidth={2.5}
              strokeDasharray="5 5"
              fill="url(#apixForecastFill)"
              dot={{ r: 2.5, fill: "#34d399", stroke: "#064e3b", strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: "#6ee7b7", stroke: "#064e3b", strokeWidth: 2 }}
              animationDuration={900}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
        <TrendingUp className="h-3 w-3 text-emerald-400" />
        {forecastMeta
          ? `${orderLabel} ${tr("chartFootAic")}`
          : tr("chartFootPlain")}
      </p>
    </motion.div>
  );
}

export default IndexChart;
