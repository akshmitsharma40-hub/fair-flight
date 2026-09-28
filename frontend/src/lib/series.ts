/**
 * series.ts — deterministic series generation + view-model transforms.
 *
 * The dashboard consumes the FastAPI backend when it is up. Because a single
 * 30-day national series cannot be re-sliced per sector/horizon, this module
 * derives per-route and per-window series deterministically (seeded, stable
 * across reloads) from the same DGCA baseline matrix the backend uses, then
 * applies the view transforms the controls drive:
 *
 *   - Base-year re-indexing (2012=100 -> 2024=100 divides by 1.18)
 *   - Time-horizon slicing (7D / 1M / 3M / ALL)
 *   - Sector isolation (national weighted vs single corridor)
 *   - ARIMA(p,1,q) forecast consumption (backend payload or client port)
 *   - Macro-event annotations mapped onto the active slice
 */

import { fitArima } from "@/lib/arima";
import type { ForecastPayload } from "@/lib/api";

// ---------------------------------------------------------------------------
// Canonical catalogues (mirror backend/scraper.py)
// ---------------------------------------------------------------------------

export type RouteId = "DEL-BOM" | "DEL-BLR" | "BOM-BLR" | "BLR-HYD" | "DEL-CCU";

export const ROUTES: Array<{
  id: RouteId;
  corridor: string;
  baseline: number;
  weight: number;
  lat: number;
  lon: number;
}> = [
  { id: "DEL-BOM", corridor: "Delhi → Mumbai", baseline: 6200, weight: 0.35, lat: 28.61, lon: 77.21 },
  { id: "DEL-BLR", corridor: "Delhi → Bengaluru", baseline: 7800, weight: 0.25, lat: 28.61, lon: 77.21 },
  { id: "BOM-BLR", corridor: "Mumbai → Bengaluru", baseline: 5600, weight: 0.2, lat: 19.09, lon: 72.87 },
  { id: "BLR-HYD", corridor: "Bengaluru → Hyderabad", baseline: 4500, weight: 0.1, lat: 12.97, lon: 77.59 },
  { id: "DEL-CCU", corridor: "Delhi → Kolkata", baseline: 6800, weight: 0.1, lat: 28.61, lon: 77.21 },
];

export const WINDOWS = [
  { id: "T+1", leadDays: 1, multiplier: 1.65, weight: 0.15 },
  { id: "T+7", leadDays: 7, multiplier: 1.18, weight: 0.35 },
  { id: "T+15", leadDays: 15, multiplier: 1.0, weight: 0.5 },
] as const;

export const BASE_YEAR_FACTOR = 1.18; // 2012=100 re-index divisor
export type BaseYear = "2024" | "2012";
export type Horizon = "7D" | "1M" | "3M" | "ALL";
export type SectorScope = "NATIONAL" | RouteId;

export const HORIZON_DAYS: Record<Horizon, number> = {
  "7D": 7,
  "1M": 30,
  "3M": 90,
  ALL: 180,
};

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — stable series across reloads
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// ---------------------------------------------------------------------------
// Date utilities (IST-aligned, no DST in India)
// ---------------------------------------------------------------------------

export function todayIst(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDaysIso(a: string, b: string): number {
  const ms = new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

// ---------------------------------------------------------------------------
// Macro events — anchor dates + re-occurrence rules
// ---------------------------------------------------------------------------

export interface MacroEvent {
  id: string;
  label: string;
  short: string;
  kind: "festival" | "fuel" | "demand";
  detail: string;
  /** Anchor in the trailing 180-day window; yearly re-occurrence offsets. */
  anchors: Array<{ month: number; day: number }>; // 1-indexed month
}

export const MACRO_EVENTS: MacroEvent[] = [
  {
    id: "diwali",
    label: "Diwali Surge",
    short: "DIW",
    kind: "festival",
    detail: "Festival-travel demand compresses last-minute inventory",
    anchors: [
      { month: 10, day: 20 },
      { month: 11, day: 12 },
    ],
  },
  {
    id: "atf",
    label: "ATF Fuel Hike",
    short: "ATF",
    kind: "fuel",
    detail: "Aviation Turbine Fuel price revision passes through to fares",
    anchors: [
      { month: 7, day: 16 },
      { month: 1, day: 10 },
    ],
  },
  {
    id: "tech-summit",
    label: "Corporate Tech Summit",
    short: "CTS",
    kind: "demand",
    detail: "Bengaluru corridor business-travel spike",
    anchors: [{ month: 9, day: 3 }],
  },
  {
    id: "independence",
    label: "Independence Day",
    short: "I-Day",
    kind: "festival",
    detail: "Aug 15 holiday-travel demand spike",
    anchors: [{ month: 8, day: 15 }],
  },
];

function eventDatesWithin(startDate: string, endDate: string): Array<{ date: string; event: MacroEvent }> {
  const out: Array<{ date: string; event: MacroEvent }> = [];
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  for (let year = startYear; year <= endYear; year++) {
    for (const event of MACRO_EVENTS) {
      for (const anchor of event.anchors) {
        const mm = String(anchor.month).padStart(2, "0");
        const dd = String(anchor.day).padStart(2, "0");
        const date = `${year}-${mm}-${dd}`;
        if (date >= startDate && date <= endDate) {
          out.push({ date, event });
        }
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Route-level deterministic series generation
// ---------------------------------------------------------------------------

export interface RouteDayPoint {
  date: string;
  /** Route index on the 2024=100 scale. */
  apix2024: number;
  /** Mean observed fare (INR) across the weighted windows. */
  fare: number;
  dodPct: number;
}

const SERIES_LENGTH = 180;

export function buildRouteSeries(routeId: RouteId, endDate?: string): RouteDayPoint[] {
  const end = endDate ?? todayIst();
  const start = addDaysIso(end, -(SERIES_LENGTH - 1));
  const route = ROUTES.find((r) => r.id === routeId)!;
  const rand = mulberry32(hashString(`apix-${routeId}-${end}`));

  // Route character: seed-driven volatility so corridors differ. A mean-
  // reverting drift keeps the long window oscillating around par (like the
  // backend's DGCA-calibrated series) instead of compounding away from it.
  const vol = 0.014 + rand() * 0.012;

  const points: RouteDayPoint[] = [];
  let level = 1 + (rand() - 0.5) * 0.06; // start near par
  let prevIdx = 100;

  for (let i = 0; i < SERIES_LENGTH; i++) {
    const date = addDaysIso(start, i);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const dowMult = dow === 5 ? 1.06 : dow === 6 ? 1.03 : dow === 2 || dow === 3 ? 0.985 : 1;

    // Event shocks fading over 4 days
    let eventShock = 1;
    for (const { date: evDate } of eventDatesWithin(start, end)) {
      const gap = diffDaysIso(evDate, date);
      if (gap >= 0 && gap <= 3) {
        const ev = MACRO_EVENTS.find((e) =>
          e.anchors.some((a) => `${evDate.slice(0, 4)}-${String(a.month).padStart(2, "0")}-${String(a.day).padStart(2, "0")}` === evDate),
        );
        const magnitude = ev?.kind === "fuel" ? 0.035 : ev?.kind === "festival" ? 0.05 : 0.025;
        eventShock *= 1 + magnitude * (1 - gap / 4);
      }
    }

    // Mean-reverting AR walk around par + occasional demand shocks (±4-6%).
    const reversion = 0.06 * (1 - level);
    const bigShock = rand() < 0.05 ? (rand() - 0.42) * 0.1 : 0;
    level *= 1 + 0.0004 + reversion + (rand() - 0.5) * vol * 2 + bigShock;

    const fare =
      route.baseline *
      WINDOWS.reduce((acc, w) => acc + w.weight * w.multiplier, 0) *
      level *
      dowMult *
      eventShock;

    const apix2024 = Number(((fare / route.baseline) * 100).toFixed(2));
    points.push({
      date,
      apix2024,
      fare: Math.round(fare),
      dodPct: Number((((apix2024 - prevIdx) / prevIdx) * 100).toFixed(2)),
    });
    prevIdx = apix2024;
  }

  return points;
}

// ---------------------------------------------------------------------------
// Anchor calibration — the generated view-model ends at the REAL backend
// value so KPIs, charts, heatmap, and the API playground tell one story.
// ---------------------------------------------------------------------------

let anchorFactor = 1;

export function setSeriesAnchor(latestApix: number | null | undefined): void {
  if (!latestApix || latestApix <= 0) return;
  const rawRoutes = ROUTES.map((r) => buildRouteSeries(r.id));
  const last = rawRoutes.reduce(
    (acc, series, i) => acc + ROUTES[i].weight * series[series.length - 1].apix2024,
    0,
  );
  if (last <= 0) return;
  anchorFactor = latestApix / last;
  routeSeriesCache.clear();
  nationalCache = null;
}

/** Precomputed route series keyed by RouteId (memo-friendly module cache). */
const routeSeriesCache = new Map<RouteId, RouteDayPoint[]>();

/** Anchor-scaled route series: apix and fare multiplied by the calibration factor. */
export function getRouteSeries(routeId: RouteId): RouteDayPoint[] {
  let series = routeSeriesCache.get(routeId);
  if (!series) {
    series = buildRouteSeries(routeId).map((p) => ({
      ...p,
      apix2024: Number((p.apix2024 * anchorFactor).toFixed(2)),
      fare: Math.round(p.fare * anchorFactor),
    }));
    routeSeriesCache.set(routeId, series);
  }
  return series;
}

// ---------------------------------------------------------------------------
// National weighted aggregate (Laspeyres over route weights)
// ---------------------------------------------------------------------------

export interface NationalPoint {
  date: string;
  apix2024: number;
  fare: number;
  dodPct: number;
  /** Per-route contributions to the national index (percentage points of basket). */
  contributions: Record<RouteId, number>;
}

function buildNationalSeries(): NationalPoint[] {
  const routeSeries = ROUTES.map((r) => getRouteSeries(r.id));
  const length = routeSeries[0].length;
  const points: NationalPoint[] = [];

  let prev = 100;
  for (let i = 0; i < length; i++) {
    const date = routeSeries[0][i].date;
    let weightedIdx = 0;
    const contributions = {} as Record<RouteId, number>;
    for (let r = 0; r < ROUTES.length; r++) {
      const route = ROUTES[r];
      const idx = routeSeries[r][i].apix2024;
      weightedIdx += route.weight * idx;
      contributions[route.id] = Number((route.weight * (idx - 100)).toFixed(2));
    }
    const apix = Number(weightedIdx.toFixed(2));
    const fare = Number(
      ROUTES.reduce((acc, r, ri) => acc + r.weight * routeSeries[ri][i].fare, 0).toFixed(0),
    );
    points.push({
      date,
      apix2024: apix,
      fare,
      dodPct: Number((((apix - prev) / prev) * 100).toFixed(2)),
      contributions,
    });
    prev = apix;
  }
  return points;
}

let nationalCache: NationalPoint[] | null = null;

export function getNationalSeries(): NationalPoint[] {
  if (!nationalCache) nationalCache = buildNationalSeries();
  return nationalCache;
}

// ---------------------------------------------------------------------------
// View-model transforms
// ---------------------------------------------------------------------------

export interface ChartDatum {
  date: string;
  apix: number; // on the active base-year scale
  forecast?: number;
  lower95?: number;
  upper95?: number;
  cpiBenchmark: number;
  dodPct: number;
  fare: number;
  events: MacroEvent[];
}

/** Re-index a 2024=100 value to the active base year scale. */
export function reindex(apix2024: number, baseYear: BaseYear): number {
  return Number((baseYear === "2024" ? apix2024 : apix2024 * BASE_YEAR_FACTOR).toFixed(2));
}

const CPI_2024 = 102.0;

export function cpiForBaseYear(baseYear: BaseYear): number {
  return Number((baseYear === "2024" ? CPI_2024 : CPI_2024 * BASE_YEAR_FACTOR).toFixed(1));
}

export function sliceByHorizon<T extends { date: string }>(series: T[], horizon: Horizon): T[] {
  if (horizon === "ALL") return series;
  const days = HORIZON_DAYS[horizon];
  return series.slice(-days);
}

/** Normalised forecast view-model, independent of transport (API or local fit). */
export interface ArimaViewForecast {
  model: { family: string; order: { p: number; d: number; q: number }; aic: number; nObs: number };
  predictions: Array<{ date: string; point: number; lower95: number; upper95: number }>;
  source: "backend" | "client";
}

export type ForecastMeta = ArimaViewForecast["model"] & { source: ArimaViewForecast["source"] };

/** Adapt the backend payload into the view-model shape. */
export function toViewForecast(payload: ForecastPayload): ArimaViewForecast {
  return {
    model: {
      family: payload.model.family,
      order: payload.model.order,
      aic: payload.model.aic,
      nObs: payload.model.nObs,
    },
    predictions: payload.predictions.map((p) => ({
      date: p.date,
      point: p.point,
      lower95: p.lower95,
      upper95: p.upper95,
    })),
    source: "backend",
  };
}

/** Fit the client-side ARIMA port on a scope's full history (fallback path). */
export function computeClientForecast(scope: SectorScope): ArimaViewForecast {
  const series = scopedSeries(scope);
  const values = series.map((p) => p.apix2024);
  const fit = fitArima(values);
  const lastDate = series[series.length - 1].date;
  return {
    model: {
      family: fit.fallback ? "ARIMA (fallback: RW with drift)" : "ARIMA",
      order: fit.order,
      aic: Number.isFinite(fit.aic) ? Number(fit.aic.toFixed(3)) : 0,
      nObs: fit.nObs,
    },
    predictions: fit.point.map((point, i) => ({
      date: addDaysIso(lastDate, i + 1),
      point,
      lower95: fit.lower[i],
      upper95: fit.upper[i],
    })),
    source: "client",
  };
}

/** Full-history series for a scope (2024=100 scale) — forecast input. */
export function scopedSeries(scope: SectorScope): Array<{ date: string; apix2024: number; fare: number; dodPct: number }> {
  return scope === "NATIONAL"
    ? getNationalSeries().map((p) => ({ date: p.date, apix2024: p.apix2024, fare: p.fare, dodPct: p.dodPct }))
    : getRouteSeries(scope).map((p) => ({ date: p.date, apix2024: p.apix2024, fare: p.fare, dodPct: p.dodPct }));
}

/**
 * Build the chart dataset for the active scope/horizon/base-year.
 *
 * The forecast is ARIMA(p,1,q) with 95% prediction bands — either consumed
 * from the backend's `ForecastPayload` (source of truth, fitted on
 * data_master.csv) or recomputed client-side via the arima.ts port when the
 * API is offline. The simulated damped-WMA projection is gone.
 */
export function buildChartDataset(
  scope: SectorScope,
  horizon: Horizon,
  baseYear: BaseYear,
  forecastPayload?: ArimaViewForecast | null,
  /** Time-travel "as of" date — the series is cut at this day (inclusive). */
  asOf?: string | null,
): { history: ChartDatum[]; forecast: ChartDatum[]; events: Array<{ date: string; event: MacroEvent }>; forecastMeta: ForecastMeta | null } {
  const full = scopedSeries(scope);
  const series = asOf ? full.filter((p) => p.date <= asOf) : full;
  const history = sliceByHorizon(series, horizon);
  const last = history[history.length - 1];
  const cpi = cpiForBaseYear(baseYear);

  // During time travel the forecast is re-dated to extend from the scrubbed
  // day (values are index points — the shape still communicates the trend).
  const forecastAnchor = last?.date ?? todayIst();
  const forecastShift = asOf ? diffDaysIso(last.date, forecastPayload?.predictions[0]?.date ?? forecastAnchor) : 0;

  const forecast: ChartDatum[] = (forecastPayload?.predictions ?? []).map((pred, i) => ({
    date: asOf ? addDaysIso(forecastAnchor, i + 1) : pred.date,
    apix: reindex(pred.point, baseYear),
    // Populated by IndexChart's merge step so the dashed segment starts at
    // the last observed point; kept here as the tooltip value source.
    forecast: reindex(pred.point, baseYear),
    lower95: reindex(pred.lower95, baseYear),
    upper95: reindex(pred.upper95, baseYear),
    cpiBenchmark: cpi,
    dodPct: 0,
    fare: last ? Math.round((last.fare * pred.point) / last.apix2024) : 0,
    events: [],
  }));
  void forecastShift;

  const forecastMeta: ForecastMeta | null = forecastPayload
    ? {
        family: forecastPayload.model.family,
        order: forecastPayload.model.order,
        aic: forecastPayload.model.aic,
        nObs: forecastPayload.model.nObs,
        source: forecastPayload.source,
      }
    : null;

  const events = eventDatesWithin(history[0].date, last.date);
  return {
    history: history.map((p) => ({
      date: p.date,
      apix: reindex(p.apix2024, baseYear),
      cpiBenchmark: cpi,
      dodPct: p.dodPct,
      fare: p.fare,
      events: events.filter((e) => e.date === p.date).map((e) => e.event),
    })),
    forecast,
    events,
    forecastMeta,
  };
}

// ---------------------------------------------------------------------------
// KPI extraction for the active slice
// ---------------------------------------------------------------------------

export interface SliceKpis {
  apix: number;
  dodPct: number;
  basketInr: number;
  windowMin: string;
  windowMax: string;
  trendPct: number; // change across the whole active window
  peak: { date: string; apix: number };
  trough: { date: string; apix: number };
}

export function extractSliceKpis(history: ChartDatum[]): SliceKpis {
  const first = history[0];
  const last = history[history.length - 1];
  const sorted = [...history].sort((a, b) => a.apix - b.apix);
  return {
    apix: last.apix,
    dodPct: last.dodPct,
    basketInr: last.fare,
    windowMin: first.date,
    windowMax: last.date,
    trendPct: Number((((last.apix - first.apix) / first.apix) * 100).toFixed(2)),
    peak: { date: sorted[sorted.length - 1].date, apix: sorted[sorted.length - 1].apix },
    trough: { date: sorted[0].date, apix: sorted[0].apix },
  };
}

// ---------------------------------------------------------------------------
// Airline market-share contribution (donut)
// ---------------------------------------------------------------------------

export const AIRLINE_SHARE = [
  { name: "IndiGo", code: "6E", share: 56, bias: 0.93, color: "#6366f1" },
  { name: "Air India", code: "AI", share: 24, bias: 1.05, color: "#f59e0b" },
  { name: "Akasa Air", code: "QP", share: 12, bias: 0.97, color: "#f472b6" },
  { name: "SpiceJet", code: "SG", share: 8, bias: 0.89, color: "#34d399" },
] as const;

/** Fare movement each carrier contributed over the active slice (index pts). */
export function airlineMovements(scope: SectorScope, history: ChartDatum[]): Array<{ name: string; code: string; share: number; movement: number; color: string }> {
  const scopeRoute = scope === "NATIONAL" ? null : ROUTES.find((r) => r.id === scope)!;
  const trendPct = extractSliceKpis(history).trendPct;
  return AIRLINE_SHARE.map((a) => {
    // Route-level tilt: IndiGo dominates leisure-heavy corridors, AI business ones.
    const routeTilt = scopeRoute
      ? scopeRoute.id === "DEL-BLR" || scopeRoute.id === "DEL-CCU"
        ? a.code === "AI"
          ? 1.3
          : a.code === "6E"
            ? 0.85
            : 1
        : a.code === "6E"
          ? 1.2
          : 1
      : 1;
    return {
      name: a.name,
      code: a.code,
      share: a.share,
      movement: Number((trendPct * (a.share / 100) * routeTilt * (a.bias - 0.02) * 2.4).toFixed(2)),
      color: a.color,
    };
  });
}

// ---------------------------------------------------------------------------
// Sector heatmap (route × window with DoD heat + sparkline data)
// ---------------------------------------------------------------------------

export interface HeatCell {
  route: RouteId;
  window: string;
  fare: number;
  dodPct: number;
  level: "hot" | "warm" | "cool" | "cold";
}

export function buildHeatmap(): { cells: HeatCell[]; routes: RouteId[]; windows: string[] } {
  const cells: HeatCell[] = [];
  for (const route of ROUTES) {
    const series = getRouteSeries(route.id);
    const last = series[series.length - 1];
    const prev = series[series.length - 2];
    for (const w of WINDOWS) {
      const fare = Math.round(last.fare * w.multiplier);
      // T+1 amplifies the DoD move (last-minute inventory is most reactive)
      const dod = Number((last.dodPct * (w.id === "T+1" ? 1.9 : w.id === "T+7" ? 1.3 : 1)).toFixed(2));
      cells.push({ route: route.id, window: w.id, fare, dodPct: dod, level: heatLevel(dod) });
    }
    void prev;
  }
  return { cells, routes: ROUTES.map((r) => r.id), windows: WINDOWS.map((w) => w.id) };
}

function heatLevel(dod: number): HeatCell["level"] {
  if (dod > 2) return "hot";
  if (dod > 0.5) return "warm";
  if (dod > -1) return "cool";
  return "cold";
}

export const HEAT_STYLES: Record<HeatCell["level"], { bg: string; text: string }> = {
  hot: { bg: "bg-red-500/20 border-red-500/40", text: "text-red-300" },
  warm: { bg: "bg-amber-500/20 border-amber-500/40", text: "text-amber-300" },
  cool: { bg: "bg-sky-500/20 border-sky-500/40", text: "text-sky-300" },
  cold: { bg: "bg-emerald-500/20 border-emerald-500/40", text: "text-emerald-300" },
};

/** Latest DoD for a route (used by KPI strip + heatmap rows). */
export function routeLatestDod(routeId: RouteId): number {
  const s = getRouteSeries(routeId);
  return s[s.length - 1].dodPct;
}
