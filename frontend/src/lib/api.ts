/**
 * Typed client for the APIx institutional backend (FastAPI).
 *
 * The dashboard prefers the live API (`/api/v1/apix/*`, proxied by Vite to
 * localhost:8000). If the backend is unreachable — e.g. during a static
 * frontend demo — it deterministically falls back to the committed
 * `backend/daily_index.csv` contents embedded below, so the UI is always
 * fully populated. The fallback mirrors the pipeline's exact schema.
 */

export interface CoicopMetadata {
  division: string;
  divisionName: string;
  group: string;
  groupName: string;
  class_: string;
  className: string;
  subClass: string;
  subClassName: string;
  framework: string;
  baseYear: string;
  baseAnchor: number;
  publisher: string;
}

export interface LatestIndex {
  series: string;
  version: string;
  classification: string;
  asOf: string;
  date: string;
  apix: number;
  dodPct: number;
  baseAnchor: number;
  weightedBasketInr: number;
  cpiBenchmark: number;
  routesTracked: number;
  corridors: string[];
  coicop: CoicopMetadata;
}

export interface IndexObservation {
  date: string;
  apix: number;
  basketPrice: number;
  dodPct: number;
  cpiBenchmark: number;
}

export interface HistorySeries {
  series: string;
  version: string;
  classification: string;
  days: number;
  baseDate: string;
  baseAnchor: number;
  observations: IndexObservation[];
  coicop: CoicopMetadata;
}

const API_TIMEOUT_MS = 10000;

/**
 * API base URL: empty in dev (Vite proxies /api to localhost:8000) or in
 * Docker (nginx proxies /api). On static hosts (Render) the build injects
 * the absolute backend URL via VITE_API_BASE.
 */
export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

async function getJsonOnce<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(apiUrl(path), { signal: controller.signal });
    if (!response.ok) throw new Error(`API ${path} failed with ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function getJson<T>(path: string): Promise<T> {
  try {
    return await getJsonOnce<T>(path);
  } catch {
    // One transient retry: a cold backend or a page-reload request race can
    // trip the first attempt; prefer live data whenever the API is reachable.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return getJsonOnce<T>(path);
  }
}

export async function fetchLatest(): Promise<LatestIndex> {
  return getJson<LatestIndex>("/api/v1/apix/latest");
}

export async function fetchHistory(days = 30): Promise<HistorySeries> {
  return getJson<HistorySeries>(`/api/v1/apix/history?days=${days}&Format=JSON`);
}

// ---------------------------------------------------------------------------
// ARIMA forecast endpoint
// ---------------------------------------------------------------------------

export interface ForecastModelMeta {
  family: string;
  order: { p: number; d: number; q: number };
  aic: number;
  nObs: number;
  estimator: string;
  selection: string;
}

export interface ForecastPrediction {
  date: string;
  point: number;
  lower95: number;
  upper95: number;
}

export interface ForecastPayload {
  scope: string;
  model: ForecastModelMeta;
  anchorDate: string;
  anchorApix: number;
  horizon: number;
  predictions: ForecastPrediction[];
  coicop: Record<string, string>;
}

export async function fetchForecast(scope: string, horizon = 7): Promise<ForecastPayload> {
  return getJson<ForecastPayload>(`/api/v1/apix/forecast?scope=${encodeURIComponent(scope)}&horizon=${horizon}`);
}

// ---------------------------------------------------------------------------
// Analytics suite (research panels)
// ---------------------------------------------------------------------------

export interface BacktestPayload {
  scope: string;
  folds: number;
  horizonPerFold: number;
  nObs: number;
  mae: number;
  rmse: number;
  mape: number;
  coverage95: number;
  naiveMae: number;
  skillVsNaive: number;
  refitOrder: { p: number; d: number; q: number };
  method: string;
}

export async function fetchBacktest(scope: string): Promise<BacktestPayload> {
  return getJson<BacktestPayload>(`/api/v1/apix/backtest?scope=${encodeURIComponent(scope)}`);
}

export interface SeasonalPayload {
  scope: string;
  period: number;
  strength: number;
  interpretation: string;
  weekdayProfile: Array<{ day: string; effect: number }>;
  recent: Array<{ date: string; observed: number; trend: number; seasonal: number; residual: number }>;
  method: string;
}

export async function fetchSeasonal(scope: string): Promise<SeasonalPayload> {
  return getJson<SeasonalPayload>(`/api/v1/apix/seasonal?scope=${encodeURIComponent(scope)}`);
}

export interface PolicySimPayload {
  scope: string;
  scenario: { atfPct: number; demandPct: number; gstPp: number };
  fareMultiplier: number;
  horizon: number;
  baseline: { point: number[]; lower: number[]; upper: number[]; dates: string[]; order: { p: number; d: number; q: number } };
  shocked: { point: number[]; lower95: number[]; upper95: number[]; dates: string[] };
  impact: { indexDeltaPct: number; indexDeltaPts: number; cpiBps: number; cpiWeight: number; note: string };
  fuel?: {
    currentPerKl: number;
    impliedPerKl: number;
    unit: string;
    notifiedOn: string;
    source: string;
    publisher: string;
  };
}

export async function fetchPolicySim(
  scenario: { atfPct: number; demandPct: number; gstPp: number },
  horizon = 14,
  scope = "NATIONAL",
): Promise<PolicySimPayload> {
  const qs = new URLSearchParams({
    atf_pct: String(scenario.atfPct),
    demand_pct: String(scenario.demandPct),
    gst_pp: String(scenario.gstPp),
    horizon: String(horizon),
    scope,
  });
  return getJson<PolicySimPayload>(`/api/v1/apix/policy-sim?${qs.toString()}`);
}

export interface AtfMonthlyRevision {
  date: string;
  atfPerKl: number;
  atfPctChange: number;
  apixDelta30dPct: number;
  source: string;
  outlet: string;
}

export interface AtfCorrelationPayload {
  scope: string;
  days: number;
  pearsonR: number;
  rSquared: number;
  ols: { beta: number; alpha: number };
  atfLatest: number;
  atfLatestDate: string;
  atfUnit: string;
  atfSeries: number[];
  indexSeries: number[];
  dates: string[];
  source: string;
  overlap: { start: string | null; end: string | null; nDays: number; note: string };
  monthlyRevisions: AtfMonthlyRevision[];
  revisionCorrelation: { pearsonR: number; n: number };
  provenance: {
    publisher: string;
    series: string;
    unit: string;
    coverage: string;
    lastVerified: string;
    caveat: string;
  };
  note: string;
}

export async function fetchAtfCorrelation(scope = "NATIONAL"): Promise<AtfCorrelationPayload> {
  return getJson<AtfCorrelationPayload>(`/api/v1/apix/atf-correlation?scope=${encodeURIComponent(scope)}`);
}

export interface CompanionIndicesPayload {
  days: number;
  dates: string[];
  laspeyres: number[];
  paasche: number[];
  fisher: number[];
  substitutionBiasPts: number;
  note: string;
}

export async function fetchCompanionIndices(days = 90): Promise<CompanionIndicesPayload> {
  return getJson<CompanionIndicesPayload>(`/api/v1/apix/companion-indices?days=${days}`);
}

// ---------------------------------------------------------------------------
// Provenance — NSO-grade reproducibility chain
// ---------------------------------------------------------------------------

export interface ProvenancePayload {
  generatedAtUtc: string;
  code: { sha: string | null; full: string | null; dirty: boolean | null; note?: string };
  dataVintages: Record<
    string,
    { path: string; mtimeUtc?: string; sizeBytes?: number; sha256Head?: string; rows?: number; firstDate?: string; lastDate?: string; missing?: boolean; note?: string }
  >;
  seriesMeta: {
    name: string;
    method: string;
    baseYear: string;
    baseAnchor: number;
    coicop: string;
    corridors: string[];
    routeWeights: number[];
    windowWeights: number[];
    indexCoverage: { first: string | null; last: string | null; rows: number | null } | null;
  };
  model: { family?: string; order?: { p: number; d: number; q: number }; aic?: number; nObs?: number; estimator?: string; selection?: string } | null;
  engines: Record<string, string>;
  runtime: { python: string; platform: string };
  atfFeed: { publisher: string; series: string; note: string };
}

export async function fetchProvenance(): Promise<ProvenancePayload> {
  return getJson<ProvenancePayload>("/api/v1/apix/provenance");
}

export interface AtfFeedRecord {
  date: string;
  price_per_kl: number;
  pct_change: number | null;
  prev_per_kl: number | null;
  source: string;
  outlet: string;
}

export interface AtfFeedPayload {
  latest: { date: string; pricePerKl: number; pctChange: number | null; source: string; outlet: string };
  meta: {
    series: string;
    unit: string;
    frequency: string;
    publisher: string;
    benchmarkNote: string;
    coverage: string;
    lastVerified: string;
    caveat: string;
  };
  records: AtfFeedRecord[];
}

export async function fetchAtfFeed(): Promise<AtfFeedPayload> {
  return getJson<AtfFeedPayload>("/api/v1/apix/atf-feed");
}

export interface YoYPayload {
  scope: string;
  latestDate: string;
  latest: number;
  yearAgoDate: string;
  yearAgo: number;
  yoyPct: number;
  note: string;
}

export async function fetchYoy(scope = "NATIONAL"): Promise<YoYPayload> {
  return getJson<YoYPayload>(`/api/v1/apix/yoy?scope=${encodeURIComponent(scope)}`);
}

/** Trigger the print-ready monthly bulletin (server-rendered PDF). */
export async function downloadBulletin(): Promise<void> {
  const response = await fetch(apiUrl("/api/v1/apix/bulletin.pdf"));
  if (!response.ok) throw new Error(`Bulletin failed with ${response.status}`);
  triggerCsvDownload(await response.blob(), "apix_bulletin.pdf");
}

/** Fire a signed test push to all webhook subscribers (ops smoke-test). */
export async function testWebhooks(event = "apix.anomaly"): Promise<{ deliveries: number }> {
  const response = await fetch(apiUrl(`/api/v1/webhooks/test?event=${encodeURIComponent(event)}`), { method: "POST" });
  if (!response.ok) throw new Error(`Webhook test failed with ${response.status}`);
  return (await response.json()) as { deliveries: number };
}

/** Download daily_index.csv through the institutional API (Blob download). */
export async function downloadIndexCsv(): Promise<void> {
  const response = await fetch(apiUrl("/api/v1/apix/csv"));
  if (!response.ok) throw new Error(`CSV export failed with ${response.status}`);
  const blob = await response.blob();
  triggerCsvDownload(blob, "daily_index.csv");
}

export function triggerCsvDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Deterministic embedded fallback (mirrors backend/daily_index.csv exactly)
// ---------------------------------------------------------------------------

interface FallbackCell {
  date: string;
  apix: number;
  basketPrice: number;
}

// 30-day Laspeyres series, Base Year 2024=100 — matches the committed artifact.
const FALLBACK_CELLS: FallbackCell[] = [
  { date: "2026-08-13", apix: 100.0, basketPrice: 6841.72 },
  { date: "2026-08-14", apix: 110.59, basketPrice: 7566.41 },
  { date: "2026-08-15", apix: 126.8, basketPrice: 8675.15 },
  { date: "2026-08-16", apix: 118.47, basketPrice: 8104.29 },
  { date: "2026-08-17", apix: 107.06, basketPrice: 7324.06 },
  { date: "2026-08-18", apix: 106.49, basketPrice: 7285.24 },
  { date: "2026-08-19", apix: 109.83, basketPrice: 7513.62 },
  { date: "2026-08-20", apix: 106.93, basketPrice: 7315.51 },
  { date: "2026-08-21", apix: 104.92, basketPrice: 7177.98 },
  { date: "2026-08-22", apix: 105.17, basketPrice: 7195.05 },
  { date: "2026-08-23", apix: 107.53, basketPrice: 7356.5 },
  { date: "2026-08-24", apix: 105.83, basketPrice: 7240.13 },
  { date: "2026-08-25", apix: 104.49, basketPrice: 7148.37 },
  { date: "2026-08-26", apix: 104.63, basketPrice: 7158.0 },
  { date: "2026-08-27", apix: 106.31, basketPrice: 7272.98 },
  { date: "2026-08-28", apix: 105.94, basketPrice: 7247.75 },
  { date: "2026-08-29", apix: 107.35, basketPrice: 7344.38 },
  { date: "2026-08-30", apix: 107.55, basketPrice: 7358.05 },
  { date: "2026-08-31", apix: 107.37, basketPrice: 7345.76 },
  { date: "2026-09-01", apix: 105.82, basketPrice: 7239.53 },
  { date: "2026-09-02", apix: 107.63, basketPrice: 7363.6 },
  { date: "2026-09-03", apix: 106.61, basketPrice: 7293.8 },
  { date: "2026-09-04", apix: 104.86, basketPrice: 7174.13 },
  { date: "2026-09-05", apix: 104.24, basketPrice: 7131.55 },
  { date: "2026-09-06", apix: 103.47, basketPrice: 7078.94 },
  { date: "2026-09-07", apix: 100.88, basketPrice: 6901.61 },
  { date: "2026-09-08", apix: 102.39, basketPrice: 7004.9 },
  { date: "2026-09-09", apix: 104.58, basketPrice: 7154.96 },
  { date: "2026-09-10", apix: 107.77, basketPrice: 7373.23 },
  { date: "2026-09-11", apix: 102.16, basketPrice: 6989.29 },
];

const CPI_BENCHMARK = 102.0;
const FALLBACK_DATE = "2026-09-11";
const FALLBACK_AS_OF = "2026-09-11T08:20:00+0530";

export const COICOP_INFO: CoicopMetadata = {
  division: "07",
  divisionName: "Transport",
  group: "07.3",
  groupName: "Transport services",
  class_: "07.3.1",
  className: "Local and long-distance land, air and water passenger transport",
  subClass: "07.3.1.2",
  subClassName: "Passenger transport by air",
  framework: "COICOP-2018",
  baseYear: "2024",
  baseAnchor: 100.0,
  publisher: "MoSPI (proof-of-concept, experimental series)",
};

export function buildFallbackLatest(): LatestIndex {
  const last = FALLBACK_CELLS[FALLBACK_CELLS.length - 1];
  const prev = FALLBACK_CELLS[FALLBACK_CELLS.length - 2];
  return {
    series: "APIx",
    version: "1.0.0",
    classification: "experimental",
    asOf: FALLBACK_AS_OF,
    date: last.date,
    apix: last.apix,
    dodPct: Number((((last.apix - prev.apix) / prev.apix) * 100).toFixed(2)),
    baseAnchor: 100.0,
    weightedBasketInr: last.basketPrice,
    cpiBenchmark: CPI_BENCHMARK,
    routesTracked: 5,
    corridors: ["DEL-BOM", "DEL-BLR", "BOM-BLR", "BLR-HYD", "DEL-CCU"],
    coicop: COICOP_INFO,
  };
}

export function buildFallbackHistory(days = 30): HistorySeries {
  const slice = FALLBACK_CELLS.slice(-days);
  return {
    series: "APIx",
    version: "1.0.0",
    classification: "experimental",
    days: slice.length,
    baseDate: slice[0]?.date ?? FALLBACK_DATE,
    baseAnchor: 100.0,
    observations: slice.map((cell) => ({
      date: cell.date,
      apix: cell.apix,
      basketPrice: cell.basketPrice,
      dodPct: 0, // recomputed against the previous day by withDod()
      cpiBenchmark: CPI_BENCHMARK,
    })),
    coicop: COICOP_INFO,
  };
}

/** Fill DoD values into fallback observations (day-over-day % change). */
function withDod(observations: IndexObservation[]): IndexObservation[] {
  return observations.map((obs, i) => {
    if (i === 0) return { ...obs, dodPct: 0 };
    const prev = observations[i - 1];
    return {
      ...obs,
      dodPct: Number((((obs.apix - prev.apix) / prev.apix) * 100).toFixed(2)),
    };
  });
}

/** True when the embedded snapshot's final date is older than today (IST). */
export function isFallbackStale(history: HistorySeries): boolean {
  if (!history.observations.length) return true;
  const last = history.observations[history.observations.length - 1].date;
  const nowIst = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  return last < nowIst;
}

export interface DashboardData {
  latest: LatestIndex;
  history: HistorySeries;
  source: "api" | "embedded-fallback";
}

/** Load both payloads in parallel; degrade to embedded data on failure. */
export async function loadDashboardData(): Promise<DashboardData> {
  try {
    const [latest, history] = await Promise.all([fetchLatest(), fetchHistory(30)]);
    return { latest, history, source: "api" };
  } catch {
    const latest = buildFallbackLatest();
    const fallback = buildFallbackHistory(30);
    const history = { ...fallback, observations: withDod(fallback.observations) };
    return { latest, history, source: "embedded-fallback" };
  }
}
