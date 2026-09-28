import { useMemo } from "react";
import { motion } from "framer-motion";
import { MapPin, MousePointerClick, Plane } from "lucide-react";
import { getRouteSeries, ROUTES, type RouteId, type SectorScope } from "@/lib/series";
import { useT } from "@/lib/i18n";
import { cn, formatInr, formatSignedPercent } from "@/lib/utils";

interface CorridorMapProps {
  scope: SectorScope;
  onSelectScope: (scope: SectorScope) => void;
  className?: string;
}

/** City nodes with real coordinates; routes render between endpoint cities. */
const CITIES: Record<string, { name: string; lat: number; lon: number }> = {
  DEL: { name: "Delhi", lat: 28.61, lon: 77.21 },
  BOM: { name: "Mumbai", lat: 19.09, lon: 72.87 },
  BLR: { name: "Bengaluru", lat: 12.97, lon: 77.59 },
  HYD: { name: "Hyderabad", lat: 17.39, lon: 78.49 },
  CCU: { name: "Kolkata", lat: 22.57, lon: 88.36 },
};

function routeCities(routeId: RouteId): [string, string] {
  const [a, b] = routeId.split("-");
  return [a, b];
}

// viewBox space — India spans roughly lon 68–97, lat 8–37.
const VB_W = 320;
const VB_H = 340;
const LON_MIN = 68;
const LON_MAX = 97;
const LAT_MIN = 6;
const LAT_MAX = 37.5;

function project(lat: number, lon: number): { x: number; y: number } {
  const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * VB_W;
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * VB_H;
  return { x, y };
}

function quadraticArc(a: { x: number; y: number }, b: { x: number; y: number }, bend = 0.18): string {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // Perpendicular offset for the arc's control point (curves "up" on screen).
  const cx = mx - dy * bend;
  const cy = my + dx * bend;
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

interface ArcSpec {
  id: RouteId;
  path: string;
  weight: number;
  dodPct: number;
  fare: number;
  selected: boolean;
}

export function CorridorMap({ scope, onSelectScope, className }: CorridorMapProps) {
  const tr = useT();
  const arcs = useMemo<ArcSpec[]>(
    () =>
      ROUTES.map((route) => {
        const [a, b] = routeCities(route.id);
        const pa = project(CITIES[a].lat, CITIES[a].lon);
        const pb = project(CITIES[b].lat, CITIES[b].lon);
        const series = getRouteSeries(route.id);
        const last = series[series.length - 1];
        return {
          id: route.id,
          path: quadraticArc(pa, pb),
          weight: route.weight,
          dodPct: last.dodPct,
          fare: last.fare,
          selected: scope === route.id,
        };
      }),
    [scope],
  );

  const activeCount = scope === "NATIONAL" ? arcs.length : 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.55, duration: 0.6, ease: "easeOut" }}
      className={`glass-panel flex h-full flex-col rounded-2xl p-5 ${className ?? ""}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">{tr("mapTitle")}</h2>
          <p className="text-xs text-slate-400">
            {tr("mapSub")}
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2.5 py-1 text-[10px] font-bold text-indigo-300">
          <Plane className="h-3 w-3" /> {activeCount} {tr("mapOfCorridors")}
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="h-full w-full" role="img" aria-label="India corridor network map">
          <defs>
            <radialGradient id="map-glow" cx="50%" cy="42%" r="65%">
              <stop offset="0%" stopColor="rgba(99,102,241,0.14)" />
              <stop offset="70%" stopColor="rgba(99,102,241,0.03)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#map-glow)" />

          {/* Stylized India silhouette (simplified polygon of the mainland). */}
          <path
            d="M 96 18 L 150 10 L 196 26 L 236 20 L 252 48 L 240 78 L 252 96 L 236 128 L 244 158 L 226 196 L 208 232 L 196 262 L 178 292 L 158 312 L 146 336 L 132 318 L 118 296 L 96 268 L 76 240 L 62 210 L 52 178 L 58 148 L 46 118 L 62 96 L 54 66 L 72 40 Z"
            fill="rgba(99,102,241,0.07)"
            stroke="rgba(148,163,184,0.28)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />

          {/* Route arcs — draw all, emphasize the selected one. */}
          {arcs.map((arc) => {
            const hot = arc.dodPct >= 2;
            const warm = arc.dodPct >= 0.5;
            const cool = arc.dodPct <= -1;
            const color = hot ? "#fb7185" : warm ? "#fbbf24" : cool ? "#34d399" : "#38bdf8";
            const width = 1.5 + arc.weight * 14; // 35% → ~6.4px, 10% → ~2.9px
            return (
              <g key={arc.id} onClick={() => onSelectScope(arc.selected ? "NATIONAL" : arc.id)} className="cursor-pointer">
                {/* Wide invisible hit-area stroke */}
                <path d={arc.path} stroke="transparent" strokeWidth={14} fill="none" />
                <motion.path
                  d={arc.path}
                  stroke={color}
                  strokeWidth={arc.selected ? width + 1.5 : width}
                  strokeOpacity={scope === "NATIONAL" || arc.selected ? 0.85 : 0.28}
                  strokeLinecap="round"
                  fill="none"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.4, delay: 0.2, ease: "easeOut" }}
                />
                {arc.selected && (
                  <motion.path
                    d={arc.path}
                    stroke="#fff"
                    strokeWidth={1.4}
                    strokeOpacity={0.9}
                    strokeDasharray="2 7"
                    fill="none"
                    animate={{ strokeDashoffset: [0, -18] }}
                    transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
                  />
                )}
                {/* Plane glyph travelling the selected corridor */}
                {arc.selected && <FlightGlyph path={arc.path} />}
              </g>
            );
          })}

          {/* City nodes */}
          {Object.entries(CITIES).map(([code, city]) => {
            const { x, y } = project(city.lat, city.lon);
            const isEndpoint = arcs.some((a) => a.selected && routeCities(a.id).includes(code));
            return (
              <g key={code}>
                <circle cx={x} cy={y} r={isEndpoint ? 5.5 : 3.5} fill={isEndpoint ? "#818cf8" : "#475569"} stroke="#e2e8f0" strokeWidth={isEndpoint ? 1.4 : 0.8} />
                <text x={x + 8} y={y + 3.5} fontSize="9.5" fontWeight={isEndpoint ? 700 : 500} fill={isEndpoint ? "#e0e7ff" : "#94a3b8"}>
                  {city.name}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover legend + selected route card */}
        <div className="absolute right-1 top-0 space-y-1 text-[9.5px] text-slate-500">
          <p className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-rose-400" /> {tr("mapHot")}</p>
          <p className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-amber-400" /> {tr("mapWarm")}</p>
          <p className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-sky-400" /> {tr("mapSteady")}</p>
          <p className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-emerald-400" /> {tr("mapCool")}</p>
        </div>

        {scope !== "NATIONAL" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-1 left-1 rounded-xl border border-indigo-400/30 bg-slate-950/80 px-3 py-2 backdrop-blur-md"
          >
            <p className="text-[11px] font-bold text-indigo-200">{scope}</p>
            <p className="text-[10px] text-slate-400">
              {formatInr(arcs.find((a) => a.selected)?.fare ?? 0)} · DoD{" "}
              <span className={cn((arcs.find((a) => a.selected)?.dodPct ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                {formatSignedPercent(arcs.find((a) => a.selected)?.dodPct ?? 0)}
              </span>
            </p>
          </motion.div>
        )}
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
        <MousePointerClick className="h-3 w-3" /> {tr("mapClickHint")} · <MapPin className="h-3 w-3" /> {tr("mapProjectionHint")}
      </p>
    </motion.div>
  );
}

/** A small plane glyph animating along the selected corridor's path. */
function FlightGlyph({ path }: { path: string }) {
  return (
    <motion.g
      animate={{ offsetDistance: ["0%", "100%"] }}
      transition={{ repeat: Infinity, duration: 3.2, ease: "easeInOut" }}
      style={{ offsetPath: `path('${path}')`, offsetRotate: "0deg" } as React.CSSProperties}
    >
      <circle r="3" fill="#fff" opacity={0.95} />
      <circle r="6" fill="#818cf8" opacity={0.35} />
    </motion.g>
  );
}

export default CorridorMap;
