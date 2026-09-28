import { motion } from "framer-motion";
import { Flame, MousePointerClick, Thermometer } from "lucide-react";
import { buildHeatmap, HEAT_STYLES, getRouteSeries, type RouteId, type SectorScope } from "@/lib/series";
import { useT } from "@/lib/i18n";
import { cn, formatInr, formatSignedPercent } from "@/lib/utils";

interface SectorHeatmapProps {
  scope: SectorScope;
  onSelectRoute: (route: SectorScope) => void;
  className?: string;
}

/** Tiny inline SVG sparkline of the trailing 14-day index for a route. */
function Sparkline({ routeId }: { routeId: RouteId }) {
  const series = getRouteSeries(routeId).slice(-14);
  const values = series.map((p) => p.apix2024);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / range) * 24}`)
    .join(" ");
  const rising = values[values.length - 1] >= values[0];

  return (
    <svg viewBox="0 0 100 28" className="h-7 w-24" preserveAspectRatio="none" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={rising ? "#34d399" : "#f87171"}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SectorHeatmap({ scope, onSelectRoute, className }: SectorHeatmapProps) {
  const { cells, routes, windows } = buildHeatmap();
  const tr = useT();

  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.6, ease: "easeOut" }}
      className={`glass-panel rounded-2xl p-5 ${className ?? ""}`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">{tr("heatTitle")}</h2>
          <p className="text-xs text-slate-400">
            {tr("heatSub")}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <Thermometer className="h-3.5 w-3.5 text-red-400" />
          hot &gt; +2% · warm &gt; +0.5% · cool &gt; −1% · cold ≤ −1%
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-160 text-left text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500">
              <th className="pb-2 pl-1 font-medium">Corridor</th>
              {windows.map((w) => (
                <th key={w} className="pb-2 text-center font-medium">
                  {w}
                </th>
              ))}
              <th className="pb-2 pr-1 text-right font-medium">14-day trend</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((routeId, rowIdx) => {
              const routeCells = cells.filter((c) => c.route === routeId);
              const selected = scope === routeId;
              return (
                <motion.tr
                  key={routeId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.55 + rowIdx * 0.06, duration: 0.35 }}
                  onClick={() => onSelectRoute(selected ? "NATIONAL" : routeId)}
                  className={cn(
                    "cursor-pointer border-t border-slate-800/60 transition-colors hover:bg-indigo-500/5",
                    selected && "bg-indigo-500/10 ring-1 ring-inset ring-indigo-400/30",
                  )}
                  title={`Click to ${selected ? "deselect" : "isolate"} ${routeId}`}
                >
                  <td className="py-2.5 pl-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                          selected ? "bg-indigo-500/30 text-indigo-200" : "bg-slate-800 text-slate-300",
                        )}
                      >
                        {routeId}
                      </span>
                      {selected && <MousePointerClick className="h-3 w-3 text-indigo-300" />}
                    </div>
                  </td>
                  {routeCells.map((cell) => (
                    <td key={cell.window} className="px-1.5 py-2 text-center">
                      <div
                        className={cn(
                          "mx-auto min-w-24 rounded-lg border px-2 py-1.5 transition-transform hover:scale-[1.04]",
                          HEAT_STYLES[cell.level].bg,
                          HEAT_STYLES[cell.level].text,
                        )}
                      >
                        <div className="text-[11px] font-bold">{formatInr(cell.fare)}</div>
                        <div className="text-[10px] opacity-90">{formatSignedPercent(cell.dodPct)}</div>
                      </div>
                    </td>
                  ))}
                  <td className="py-2 pr-1 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Sparkline routeId={routeId} />
                      <Flame
                        className={cn(
                          "h-3.5 w-3.5",
                          routeCells.some((c) => c.level === "hot") ? "text-red-400" : "text-slate-700",
                        )}
                      />
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

export default SectorHeatmap;
