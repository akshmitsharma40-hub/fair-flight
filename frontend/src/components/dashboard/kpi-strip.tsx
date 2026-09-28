import { motion } from "framer-motion";
import {
  Activity,
  CalendarCheck2,
  Gauge,
  Route,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn, formatSignedPercent, formatInr } from "@/lib/utils";
import { ProvenanceBadge } from "@/components/dashboard/provenance-badge";
import { useT } from "@/lib/i18n";
import type { LatestIndex } from "@/lib/api";
import type { SectorScope, SliceKpis, BaseYear } from "@/lib/series";
import { ROUTES } from "@/lib/series";

interface KpiStripProps {
  latest: LatestIndex;
  kpis: SliceKpis;
  scope: SectorScope;
  baseYear: BaseYear;
  horizonLabel: string;
}

interface KpiCardSpec {
  label: string;
  value: string;
  sub: string;
  icon: typeof Gauge;
  accent: string;
  glow: string;
  trend?: "up" | "down";
  valueSuffix?: string;
}

const CONTAINER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.08 } },
};

const CARD = {
  hidden: { opacity: 0, y: 22, scale: 0.96 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 180, damping: 20 },
  },
};

export function KpiStrip({ latest, kpis, scope, baseYear, horizonLabel }: KpiStripProps) {
  const dodPositive = kpis.dodPct >= 0;
  const national = scope === "NATIONAL";
  const tr = useT();

  // Track the page theme so cards can repaint their accent with the aurora
  // palette when the user flips between dark and light modes.
  const [theme, setTheme] = useState("dark");
  useEffect(() => {
    const read = () => setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const cards: KpiCardSpec[] = national
    ? [
        {
          label: `${tr("kpiCurrent")} · ${horizonLabel}`,
          value: kpis.apix.toFixed(2),
          sub: `${tr("kpiBasket")} ${formatInr(kpis.basketInr)} · ${tr("kpiVsCpi")} ${latest.cpiBenchmark.toFixed(1)}`,
          icon: Gauge,
          accent: "from-indigo-500 to-violet-500",
          glow: "hover:ring-indigo-400/40",
        },
        {
          label: tr("kpiDod"),
          value: formatSignedPercent(kpis.dodPct),
          sub: dodPositive ? tr("kpiFirmingDod") : tr("kpiSofteningDod"),
          icon: dodPositive ? TrendingUp : TrendingDown,
          accent: dodPositive ? "from-amber-500 to-orange-500" : "from-emerald-500 to-teal-500",
          glow: dodPositive ? "hover:ring-amber-400/40" : "hover:ring-emerald-400/40",
          trend: dodPositive ? "up" : "down",
        },
        {
          label: `${tr("kpiBaseYear")} (${baseYear}=100)`,
          value: baseYear === "2024" ? "100.00" : "118.00",
          valueSuffix: undefined,
          sub: `${tr("kpiMospiAnchor")} · ${tr("kpiCoicopDiv")} ${latest.coicop.division}`,
          icon: CalendarCheck2,
          accent: "from-sky-500 to-blue-600",
          glow: "hover:ring-sky-400/40",
        },
        {
          label: `${tr("kpiWindowTrend")} · ${horizonLabel}`,
          value: formatSignedPercent(kpis.trendPct),
          sub: `${tr("kpiPeak")} ${kpis.peak.apix.toFixed(1)} · ${tr("kpiTrough")} ${kpis.trough.apix.toFixed(1)} · 5 ${tr("kpiCorridors")}`,
          icon: Activity,
          accent: "from-fuchsia-500 to-pink-500",
          glow: "hover:ring-fuchsia-400/40",
          trend: kpis.trendPct >= 0 ? "up" : "down",
        },
      ]
    : [
        {
          label: `${scope} ${tr("kpiApixShort")} · ${horizonLabel}`,
          value: kpis.apix.toFixed(2),
          sub: `${tr("kpiAvgFare")} ${formatInr(kpis.basketInr)} · ${tr("kpiIsolatedView")}`,
          icon: Gauge,
          accent: "from-indigo-500 to-violet-500",
          glow: "hover:ring-indigo-400/40",
        },
        {
          label: tr("kpiDod"),
          value: formatSignedPercent(kpis.dodPct),
          sub: dodPositive ? tr("kpiCorridorFirming") : tr("kpiCorridorSoftening"),
          icon: dodPositive ? TrendingUp : TrendingDown,
          accent: dodPositive ? "from-amber-500 to-orange-500" : "from-emerald-500 to-teal-500",
          glow: dodPositive ? "hover:ring-amber-400/40" : "hover:ring-emerald-400/40",
          trend: dodPositive ? "up" : "down",
        },
        {
          label: `${tr("kpiBaseYear")} (${baseYear}=100)`,
          value: baseYear === "2024" ? "100.00" : "118.00",
          sub: `${tr("kpiReindexed")} · ${tr("kpiCoicopDiv")} 07`,
          icon: CalendarCheck2,
          accent: "from-sky-500 to-blue-600",
          glow: "hover:ring-sky-400/40",
        },
        {
          label: tr("kpiBasketWeight"),
          value: `${(ROUTES.find((r) => r.id === scope)!.weight * 100).toFixed(0)}%`,
          sub: `${ROUTES.find((r) => r.id === scope)!.corridor} · ${tr("kpiOfNationalBasket")}`,
          icon: Route,
          accent: "from-fuchsia-500 to-pink-500",
          glow: "hover:ring-fuchsia-400/40",
        },
      ];

  return (
    <motion.div
      variants={CONTAINER}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {cards.map((card) => (
        <motion.div key={card.label} variants={CARD}>
          <div
            className={cn(
              "glass-panel accent-glow-card group relative h-full overflow-hidden rounded-2xl p-5",
              "transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-xl",
              theme === "dark" ? "hover:shadow-indigo-950/60" : "hover:shadow-indigo-200/60",
              "hover:ring-1",
              card.glow,
            )}
          >
            <div
              className={cn(
                "pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-20 blur-2xl",
                "bg-gradient-to-br transition-opacity duration-300 group-hover:opacity-40",
                card.accent,
              )}
            />
            {/* Palette-reactive sheen sweeping across the top edge on hover */}
            <div className="accent-sheen pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  {card.label}
                </p>
                <p
                  className={cn(
                    "mt-2 font-display text-3xl font-bold tracking-tight",
                    theme === "dark" ? "text-white" : "text-slate-900",
                  )}
                >
                  {card.value}
                </p>
              </div>
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg",
                  card.accent,
                )}
              >
                <card.icon className="h-5 w-5" strokeWidth={2.2} />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
              {card.trend === "up" && <TrendingUp className="h-3.5 w-3.5 shrink-0 text-amber-400" />}
              {card.trend === "down" && <TrendingDown className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
              {card.trend === undefined && <Activity className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
              <span className="truncate">{card.sub}</span>
              {card.trend === undefined && <ProvenanceBadge subject="KPI strip" className="ml-auto" />}
            </div>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

export default KpiStrip;
