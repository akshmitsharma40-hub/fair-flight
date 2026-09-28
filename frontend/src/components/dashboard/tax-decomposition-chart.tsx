import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useState } from "react";
import { formatInr } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { buildTaxDecomposition } from "@/lib/apixData";
import type { SectorScope } from "@/lib/series";
import { ROUTES } from "@/lib/series";
import type { ThemeName } from "@/lib/theme";

interface TaxDecompositionChartProps {
  scope: SectorScope;
  theme: ThemeName;
  className?: string;
}

interface BarPayloadEntry {
  payload: {
    route: string;
    baseFare: number;
    taxesFees: number;
    total: number;
    taxShare: number;
  };
}

function TaxTooltip({ active, payload }: { active?: boolean; payload?: BarPayloadEntry[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="glass-panel rounded-xl px-4 py-3 text-xs shadow-2xl">
      <p className="font-semibold text-white">{row.route}</p>
      <div className="mt-2 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-indigo-500" />
          <span className="text-slate-300">Base fare</span>
          <span className="ml-auto font-bold text-indigo-300">{formatInr(row.baseFare)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-sky-400" />
          <span className="text-slate-300">Taxes & fees</span>
          <span className="ml-auto font-bold text-sky-300">{formatInr(row.taxesFees)}</span>
        </div>
        <div className="mt-1 flex items-center gap-2 border-t border-slate-700/60 pt-1.5 text-[11px] text-slate-400">
          <span>All-in fare {formatInr(row.total)}</span>
          <span className="ml-auto font-semibold text-amber-300">
            levy {row.taxShare.toFixed(1)}% of fare
          </span>
        </div>
      </div>
    </div>
  );
}

export function TaxDecompositionChart({ scope, theme, className }: TaxDecompositionChartProps) {
  const [hoveredRoute, setHoveredRoute] = useState<string | null>(null);
  const tr = useT();

  // Theme-aware chart chrome (matches the index chart's palette).
  const gridColor = theme === "dark" ? "#1e293b" : "#dbe2f0";
  const axisTick = theme === "dark" ? "#94a3b8" : "#5b6b93";
  const axisTickMuted = theme === "dark" ? "#64748b" : "#6b7aa4";
  const axisLine = theme === "dark" ? "#1e293b" : "#c9d3e8";
  const hoverCursor = theme === "dark" ? "rgba(99,102,241,0.06)" : "rgba(79,70,229,0.07)";

  // Scope-aware ordering + emphasis: the isolated corridor leads the axis.
  const ordered =
    scope === "NATIONAL"
      ? buildTaxDecomposition()
      : [...buildTaxDecomposition()].sort((a, b) =>
          a.route === scope ? -1 : b.route === scope ? 1 : 0,
        );

  const data = ordered.map((row) => ({
    ...row,
    total: row.baseFare + row.taxesFees,
    taxShare: (row.taxesFees / (row.baseFare + row.taxesFees)) * 100,
    isolated: scope !== "NATIONAL" && row.route === scope,
  }));

  const scopeLabel =
    scope === "NATIONAL"
      ? "All Corridors (Weighted Average)"
      : `${ROUTES.find((r) => r.id === scope)!.corridor} · isolated`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45, duration: 0.6, ease: "easeOut" }}
      className={`glass-panel rounded-2xl p-5 ${className ?? ""}`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">{tr("decomposition")} · {scopeLabel}</h2>
          <p className="text-xs text-slate-400">
            {tr("decompSub")}
          </p>
        </div>
        <span className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-300">
          COICOP 07.3.1.2
        </span>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }} barCategoryGap="28%">
            <CartesianGrid stroke={gridColor} strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey="route"
              tick={{ fill: axisTick, fontSize: 11, fontWeight: 600 }}
              axisLine={{ stroke: axisLine }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: axisTickMuted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={56}
              tickFormatter={(value: number) => `₹${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<TaxTooltip />} cursor={{ fill: hoverCursor }} />
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              iconSize={8}
              formatter={(value) => <span className="text-xs text-slate-300">{value}</span>}
            />
            {/* Base fare — indigo-600; isolated corridor stays vivid, others dim */}
            <Bar
              dataKey="baseFare"
              name="Base fare"
              stackId="fare"
              fill="#4f46e5"
              radius={[0, 0, 0, 0]}
              opacity={hoveredRoute === null || hoveredRoute === "baseFare" ? 1 : 0.45}
              onMouseEnter={() => setHoveredRoute("baseFare")}
              onMouseLeave={() => setHoveredRoute(null)}
              animationDuration={900}
            />
            {/* Taxes & fees — sky-400 */}
            <Bar
              dataKey="taxesFees"
              name="Taxes & fees"
              stackId="fare"
              fill="#38bdf8"
              radius={[6, 6, 0, 0]}
              opacity={hoveredRoute === null || hoveredRoute === "taxesFees" ? 1 : 0.45}
              onMouseEnter={() => setHoveredRoute("taxesFees")}
              onMouseLeave={() => setHoveredRoute(null)}
              animationDuration={900}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {scope !== "NATIONAL" && (
        <p className="mt-2 text-[11px] text-indigo-300">
          Isolated view: {scope} leads the axis · remaining corridors dimmed for comparison ·
          clear the sector filter to restore the weighted national decomposition
        </p>
      )}
    </motion.div>
  );
}

export default TaxDecompositionChart;
