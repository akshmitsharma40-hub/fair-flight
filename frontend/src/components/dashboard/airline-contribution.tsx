import { motion } from "framer-motion";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Crown, Plane } from "lucide-react";
import { AIRLINE_SHARE, airlineMovements, type ChartDatum, type SectorScope } from "@/lib/series";
import { useT } from "@/lib/i18n";
import { formatSignedPercent } from "@/lib/utils";

interface AirlineContributionProps {
  scope: SectorScope;
  history: ChartDatum[];
  className?: string;
}

interface TooltipEntry {
  payload: {
    name: string;
    share: number;
    movement: number;
    color: string;
  };
}

function MovementTooltip({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="glass-panel rounded-xl px-3.5 py-2.5 text-xs shadow-2xl">
      <p className="font-semibold text-white">
        {row.name} <span className="text-slate-400">· {row.share}% share</span>
      </p>
      <p className="mt-1 text-slate-300">
        Fare movement:{" "}
        <span className={row.movement >= 0 ? "font-bold text-amber-300" : "font-bold text-emerald-300"}>
          {formatSignedPercent(row.movement)}
        </span>
      </p>
    </div>
  );
}

export function AirlineContribution({ scope, history, className }: AirlineContributionProps) {
  const movements = airlineMovements(scope, history);
  const dominant = movements.reduce((max, m) => (m.movement > max.movement ? m : max), movements[0]);
  const tr = useT();

  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.6, ease: "easeOut" }}
      className={`glass-panel flex h-full flex-col rounded-2xl p-5 ${className ?? ""}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-white">{tr("airlinesTitle")}</h2>
          <p className="text-xs text-slate-400">{tr("airlinesSub")}</p>
        </div>
        <span className="flex items-center gap-1 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2 py-1 text-[10px] font-bold text-indigo-300">
          <Plane className="h-3 w-3" /> 6E · AI · QP · SG
        </span>
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<MovementTooltip />} cursor={false} />
            <Pie
              data={movements}
              dataKey="share"
              nameKey="name"
              innerRadius="66%"
              outerRadius="92%"
              paddingAngle={3}
              cornerRadius={6}
              stroke="var(--donut-stroke, rgba(10,15,30,0.9))"
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              animationDuration={950}
            >
              {movements.map((m) => (
                <Cell key={m.code} fill={m.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Dominant price mover — center metric */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <Crown className="h-3 w-3 text-amber-400" /> {tr("airlinesTopMover")}
          </span>
          <span className="mt-1 text-lg font-bold leading-tight text-white">{dominant.name}</span>
          <span
            className={`text-sm font-bold ${
              dominant.movement >= 0 ? "text-amber-400" : "text-emerald-400"
            }`}
          >
            {formatSignedPercent(dominant.movement)}
          </span>
          <span className="mt-0.5 text-[10px] text-slate-500">{dominant.share}% {tr("airlinesMarketShare")}</span>
        </div>
      </div>

      {/* Legend badges with movement bars */}
      <div className="mt-3 space-y-1.5">
        {movements.map((m, i) => (
          <motion.div
            key={m.code}
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 + i * 0.06, duration: 0.35 }}
            className="flex items-center gap-2.5 rounded-lg border border-slate-800/70 bg-slate-900/40 px-2.5 py-1.5"
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: m.color }} />
            <span className="w-24 shrink-0 truncate text-xs font-semibold text-slate-200">{m.name}</span>
            <span className="w-9 shrink-0 rounded-md bg-slate-800/80 px-1 text-center text-[10px] font-bold text-slate-400">
              {m.code}
            </span>
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-800">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: m.color }}
                initial={{ width: 0 }}
                animate={{ width: `${(m.share / 56) * 100}%` }}
                transition={{ delay: 0.6 + i * 0.06, duration: 0.6, ease: "easeOut" }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-[11px] font-bold text-slate-300">{m.share}%</span>
          </motion.div>
        ))}
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        {tr("airlinesFoot")} ({AIRLINE_SHARE.length} {tr("airlinesCarriers")})
      </p>
    </motion.div>
  );
}

export default AirlineContribution;
