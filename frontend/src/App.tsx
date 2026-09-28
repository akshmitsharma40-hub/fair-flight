import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Command, Download, FileText, Github, Languages, RefreshCcw, Satellite } from "lucide-react";

import { AnomalyAlert } from "@/components/anomaly-alert";
import { ApixAssistant } from "@/components/dashboard/apix-assistant";
import { AirlineContribution } from "@/components/dashboard/airline-contribution";
import { AccountMenu } from "@/components/dashboard/account-menu";
import { AlertCenter } from "@/components/dashboard/alert-center";
import { ApiPlayground } from "@/components/dashboard/api-playground";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { LogoAeroTrend } from "@/components/logo-aero-trend";
import { CorridorMap } from "@/components/dashboard/corridor-map";
import { DashboardControls } from "@/components/dashboard/dashboard-controls";
import { GuidedTour, TourLauncher } from "@/components/dashboard/guided-tour";
import { AboutDrawer, useAboutOpen } from "@/components/dashboard/about-panel";
import { MethodologyPanel } from "@/components/dashboard/methodology-panel";
import { AnimatedWordmark } from "@/components/animated-wordmark";
import { CloudDrift } from "@/components/cloud-drift";
import { IndexChart } from "@/components/dashboard/index-chart";
import { PolicySimulator } from "@/components/dashboard/policy-simulator";
import { ResearchPanel } from "@/components/dashboard/research-panel";
import { TimeTravel } from "@/components/dashboard/time-travel";
import { ToolsRail } from "@/components/dashboard/tools-rail";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { SectorHeatmap } from "@/components/dashboard/sector-heatmap";
import { TaxDecompositionChart } from "@/components/dashboard/tax-decomposition-chart";
import { TelemetryFeed } from "@/components/dashboard/telemetry-feed";
import {
  API_BASE,
  buildFallbackHistory,
  buildFallbackLatest,
  downloadBulletin,
  downloadIndexCsv,
  fetchForecast,
  loadDashboardData,
  triggerCsvDownload,
  type DashboardData,
} from "@/lib/api";
import {
  buildChartDataset,
  computeClientForecast,
  extractSliceKpis,
  setSeriesAnchor,
  toViewForecast,
  ROUTES,
  WINDOWS,
  type ArimaViewForecast,
  type BaseYear,
  type Horizon,
  type SectorScope,
} from "@/lib/series";
import type { AssistantContext, AssistantAction } from "@/lib/assistant";
import { readDashboardState, writeDashboardState } from "@/lib/dashboardState";
import { useAuth } from "@/lib/auth";
import { LangContext, readLang, writeLang, t, type Lang } from "@/lib/i18n";
import { useParallax, useTheme } from "@/lib/theme";
import { cn, formatFullDate } from "@/lib/utils";

const DOD_ALERT_THRESHOLD = 5;

function formatClock(isoStamp: string): string {
  const parsed = new Date(isoStamp.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  if (Number.isNaN(parsed.getTime())) return isoStamp;
  return parsed.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Initial state seeded from the URL hash once, before any effects run. */
function readInitialDashboardState(): {
  scope: SectorScope;
  baseYear: BaseYear;
  horizon: Horizon;
  asOf: string | null;
  themeOverride: "dark" | "light" | undefined;
} {
  const url = readDashboardState();
  return {
    scope: url.scope ?? "NATIONAL",
    baseYear: url.baseYear ?? "2024",
    horizon: url.horizon ?? "1M",
    asOf: url.asOf,
    themeOverride: url.theme ?? undefined,
  };
}

export default function App() {
  // ------------------------------------------------------------------
  // Theme + parallax drivers (theme may be overridden via permalink)
  // ------------------------------------------------------------------
  const [initial] = useState(readInitialDashboardState);
  const { theme, toggleTheme, setTheme } = useTheme(initial.themeOverride);
  useParallax();
  const auth = useAuth();

  // ------------------------------------------------------------------
  // Cascading dashboard state (seeded from the permalink, then live)
  // ------------------------------------------------------------------
  const [baseYear, setBaseYear] = useState<BaseYear>(initial.baseYear);
  const [horizon, setHorizon] = useState<Horizon>(initial.horizon);
  const [scope, setScope] = useState<SectorScope>(initial.scope);

  const [data, setData] = useState<DashboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [csvStatus, setCsvStatus] = useState<"idle" | "api" | "local" | "error">("idle");
  const [anchorVersion, setAnchorVersion] = useState(0);
  const [forecastMap, setForecastMap] = useState<Partial<Record<SectorScope, ArimaViewForecast>>>({});
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [assistantFeedback, setAssistantFeedback] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const about = useAboutOpen();
  const [lang, setLang] = useState<Lang>("en");
  const [asOf, setAsOf] = useState<string | null>(initial.asOf);
  const [liveTick, setLiveTick] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const payload = await loadDashboardData();
      setData(payload);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Per-scope ARIMA forecast: prefer the backend fit (data_master.csv),
  // fall back to the client-side port when the API is offline.
  useEffect(() => {
    let cancelled = false;
    const scopeKey: SectorScope = scope;
    (async () => {
      try {
        const payload = await fetchForecast(scopeKey, 7);
        if (!cancelled) {
          setForecastMap((prev) => ({ ...prev, [scopeKey]: toViewForecast(payload) }));
        }
      } catch {
        if (!cancelled) {
          setForecastMap((prev) => ({ ...prev, [scopeKey]: computeClientForecast(scopeKey) }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, anchorVersion]);

  // One-time bootstrap: fetch + restore language preference.
  useEffect(() => {
    void load();
    setLang(readLang());
  }, [load]);

  // Persist view state into the URL hash for shareable permalinks.
  useEffect(() => {
    writeDashboardState({ scope, baseYear, horizon, theme, asOf });
  }, [scope, baseYear, horizon, theme, asOf]);

  // SSE live-tick ribbon: shows "· SSE" when the server stream is connected.
  useEffect(() => {
    let source: EventSource | null = null;
    try {
      source = new EventSource(`${API_BASE}/api/v1/apix/stream?interval=30`);
      source.addEventListener("apix.tick", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as { asOf: string };
          setLiveTick(payload.asOf);
        } catch {
          // malformed tick — ignore, keep the previous one
        }
      });
      source.onerror = () => {
        // Stream closed (backend down) — EventSource retries on its own; we
        // only clear the tick so the ribbon falls back to the fetch status.
        setLiveTick(null);
      };
    } catch {
      // EventSource unavailable — non-fatal.
    }
    return () => source?.close();
  }, []);

  // Latest/history payloads (API or embedded fallback)
  const { latest, history } = useMemo(() => {
    if (data) return { latest: data.latest, history: data.history };
    return { latest: buildFallbackLatest(), history: buildFallbackHistory(30) };
  }, [data]);

  // Scope/base/horizon-aware chart dataset + KPIs (recomputed after the
  // series anchor recalibrates and when the scope's forecast arrives).
  const { chartData, kpis, scopeLabel } = useMemo(() => {
    const { history: chartHistory, forecast, events, forecastMeta } = buildChartDataset(
      scope,
      horizon,
      baseYear,
      forecastMap[scope] ?? null,
      asOf,
    );
    return {
      chartData: { history: chartHistory, forecast, events, forecastMeta },
      kpis: extractSliceKpis(chartHistory),
      scopeLabel: scope === "NATIONAL" ? "National Aggregate (Weighted)" : scope,
    };
  }, [baseYear, horizon, scope, anchorVersion, forecastMap, asOf]);

  useEffect(() => {
    setSeriesAnchor(latest.apix);
    setAnchorVersion((v) => v + 1);
  }, [latest.apix]);

  /** Snapshot the live state for the grounded assistant on every message. */
  const buildAssistantContext = useCallback((): AssistantContext => {
    const forecast = forecastMap[scope] ?? null;
    return {
      scope,
      baseYear,
      horizon,
      forecast,
      latestApix: kpis.apix,
      cpiBenchmark: latest.cpiBenchmark,
    };
  }, [scope, baseYear, horizon, forecastMap, kpis.apix, latest.cpiBenchmark]);

  /** Apply a dashboard action requested through the assistant. */
  const applyAssistantAction = useCallback((action: AssistantAction) => {
    if (action.type === "setScope") setScope(action.value as SectorScope);
    if (action.type === "setBaseYear") setBaseYear(action.value as BaseYear);
    if (action.type === "setHorizon") setHorizon(action.value as Horizon);
    setAssistantFeedback(true);
    window.setTimeout(() => setAssistantFeedback(false), 1600);
  }, []);

  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const next = prev === "en" ? "hi" : "en";
      writeLang(next);
      return next;
    });
  }, []);

  const handleCsvDownload = useCallback(async () => {
    try {
      await downloadIndexCsv();
      setCsvStatus("api");
    } catch {
      try {
        const header = "date,basket_price,apix,dod_pct,cpi_benchmark";
        const lines = history.observations.map(
          (obs) =>
            `${obs.date},${obs.basketPrice.toFixed(2)},${obs.apix.toFixed(2)},${obs.dodPct.toFixed(2)},${obs.cpiBenchmark.toFixed(1)}`,
        );
        triggerCsvDownload(
          new Blob([`${[header, ...lines].join("\n")}\n`], { type: "text/csv" }),
          "daily_index.csv",
        );
        setCsvStatus("local");
      } catch {
        setCsvStatus("error");
      }
    }
  }, [history]);

  const handleBulletinDownload = useCallback(() => {
    downloadBulletin()
      .then(() => setCsvStatus("idle"))
      .catch(() => setCsvStatus("error"));
  }, []);

  return (
    <LangContext.Provider value={useMemo(() => ({ lang, setLang }), [lang])}>
    <div className="relative min-h-screen">
      <div className="aurora-backdrop" />
      <div className="aurora-flare" aria-hidden />
      <CloudDrift />
      <ToolsRail
        theme={theme}
        onToggleTheme={toggleTheme}
        scope={scope}
        onSelectScope={setScope}
      />
      <TourLauncher onOpen={() => setTourOpen(true)} />

      <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        {/* ============================================================ */}
        {/* TOP — Executive masthead + anomaly banner                     */}
        {/* ============================================================ */}
        <AnomalyAlert dodPct={kpis.dodPct} threshold={DOD_ALERT_THRESHOLD} />

        <motion.header
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className={cn(
            "glass-panel mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-4 transition-shadow duration-500",
            assistantFeedback && "ring-2 ring-indigo-400/70 shadow-xl shadow-indigo-500/30",
          )}
        >
          <div className="flex items-center gap-4">
            {/* FAIR FLIGHT brand mark — top-left, shimmer + hue-shift on hover */}
            <motion.div
              initial={{ rotate: -8, scale: 0.9 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 14 }}
              className="shrink-0"
            >
              <LogoAeroTrend className="logo-shimmer h-12 w-12" />
            </motion.div>
            <div className="min-w-0">
              <AnimatedWordmark
                text={t(lang, "mastheadTitle")}
                className="font-display text-2xl font-black uppercase tracking-[0.08em] sm:text-[28px] sm:leading-none"
              />
              <p className="mt-1.5 text-xs text-slate-400 sm:text-[12.5px]">
                {t(lang, "mastheadSub")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <AccountMenu auth={auth} />
            <button
              type="button"
              onClick={toggleLang}
              title="Switch language / भाषा बदलें"
              className="flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-900/60 px-3 py-2 text-sm font-bold text-slate-400 transition-all hover:border-indigo-400/60 hover:text-slate-200"
            >
              <Languages className="h-4 w-4" />
              <span className="text-xs">{lang === "en" ? "EN" : "हि"}</span>
            </button>
            <button
              type="button"
              onClick={handleBulletinDownload}
              title="Download the print-ready monthly bulletin (server-rendered PDF)"
              className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-900/60 px-3 py-2 text-sm font-medium text-slate-300 transition-all hover:border-emerald-400/60 hover:text-emerald-300"
            >
              <FileText className="h-4 w-4" />
              <span className="hidden lg:inline">{t(lang, "bulletin")}</span>
            </button>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              title="Open the command palette (⌘K)"
              className="group flex items-center gap-2.5 rounded-xl border border-slate-700/80 bg-slate-900/60 px-3 py-2 text-sm font-medium text-slate-400 transition-all hover:border-indigo-400/60 hover:text-slate-200"
            >
              <Command className="h-4 w-4" />
              <span className="hidden md:inline">{t(lang, "commands")}</span>
              <kbd className="hidden rounded-md border border-slate-700/70 bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 transition-colors group-hover:border-indigo-400/40 group-hover:text-indigo-300 sm:inline">
                ⌘K
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-900/60 px-3.5 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-500 hover:text-white hover:shadow-lg"
            >
              <RefreshCcw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              <span className="hidden sm:inline">{t(lang, "refresh")}</span>
            </button>
            <motion.button
              type="button"
              onClick={() => void handleCsvDownload()}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-950/50 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-900/60"
            >
              <Download className="h-4 w-4" />
              {t(lang, "downloadCsv")}
            </motion.button>
          </div>
        </motion.header>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-slate-500"
        >
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                data?.source === "api" ? "animate-apix-pulse bg-emerald-400" : "bg-amber-400",
              )}
            />
            {data?.source === "api"
              ? `${t(lang, "liveApi")}${liveTick ? " · SSE" : ""} · as of ${formatClock(latest.asOf)} IST`
              : `${t(lang, "embeddedSnapshot")} (start backend with: uvicorn api:app --port 8000)`}
          </span>
          <span className="flex items-center gap-1.5">
            <Satellite className="h-3 w-3" />
            {t(lang, "experimentalRibbon")}
          </span>
          <span className="flex items-center gap-1.5">
            <Github className="h-3 w-3" />
            {t(lang, "ghActionsRibbon")}
          </span>
          {csvStatus === "local" && <span className="text-emerald-400">CSV exported client-side</span>}
          {csvStatus === "error" && <span className="text-red-400">Export failed</span>}
        </motion.div>

        {/* ============================================================ */}
        {/* Time-travel scrubber + permalink share                        */}
        {/* ============================================================ */}
        <TimeTravel scope={scope} asOf={asOf} onAsOfChange={setAsOf} className="mt-3" />

        {/* ============================================================ */}
        {/* ROW 1 — Dashboard controls + KPI metric strip                 */}
        {/* ============================================================ */}
        <section id="sec-controls" className="mt-4 space-y-4 scroll-mt-6">
          <DashboardControls
            baseYear={baseYear}
            horizon={horizon}
            scope={scope}
            onBaseYearChange={setBaseYear}
            onHorizonChange={setHorizon}
            onScopeChange={setScope}
          />
          <KpiStrip latest={latest} kpis={kpis} scope={scope} baseYear={baseYear} horizonLabel={horizon} />
        </section>

        {/* ============================================================ */}
        {/* ROW 2 — Annotated APIx chart (2/3) + Airline donut (1/3)      */}
        {/* ============================================================ */}
        <section id="sec-chart" className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3 scroll-mt-6">
          <div className="xl:col-span-2">
            <IndexChart
              history={chartData.history}
              forecast={chartData.forecast}
              events={chartData.events}
              forecastMeta={chartData.forecastMeta}
              baseYear={baseYear}
              scopeLabel={scopeLabel}
              theme={theme}
            />
          </div>
          <AirlineContribution scope={scope} history={chartData.history} />
        </section>

        {/* ============================================================ */}
        {/* ROW 3 — Corridor map + policy simulator                       */}
        {/* ============================================================ */}
        <section id="sec-map" className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2 scroll-mt-6">
          <CorridorMap scope={scope} onSelectScope={setScope} />
          <PolicySimulator scope={scope} theme={theme} />
        </section>

        {/* ============================================================ */}
        {/* ROW 4 — Fare decomposition + sector heatmap                   */}
        {/* ============================================================ */}
        <section id="sec-decomp" className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3 scroll-mt-6">
          <div className="xl:col-span-2">
            <TaxDecompositionChart scope={scope} theme={theme} />
          </div>
          <SectorHeatmap
            scope={scope}
            onSelectRoute={(route) => setScope(route)}
          />
        </section>

        {/* ============================================================ */}
        {/* ROW 5 — Research panel + alert center                         */}
        {/* ============================================================ */}
        <section id="sec-research" className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3 scroll-mt-6">
          <div className="xl:col-span-2">
            <ResearchPanel scope={scope} theme={theme} />
          </div>
          <AlertCenter scope={scope} />
        </section>

        {/* ============================================================ */}
        {/* ROW 6 — Scraper telemetry (1/2) + API playground (1/2)        */}
        {/* ============================================================ */}
        <section id="sec-telemetry" className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2 scroll-mt-6">
          <TelemetryFeed />
          <ApiPlayground
            latest={latest}
            history={history}
            forecast={
              forecastMap[scope]
                ? {
                    scope,
                    model: {
                      family: forecastMap[scope]!.model.family,
                      order: forecastMap[scope]!.model.order,
                      aic: forecastMap[scope]!.model.aic,
                      nObs: forecastMap[scope]!.model.nObs,
                      estimator: "hannan-rissanen",
                      selection: "aic-grid p<=3, q<=2",
                    },
                    anchorDate: chartData.history[chartData.history.length - 1]?.date ?? "—",
                    anchorApix: chartData.history[chartData.history.length - 1]?.apix ?? 0,
                    horizon: forecastMap[scope]!.predictions.length,
                    predictions: forecastMap[scope]!.predictions,
                    coicop: {},
                  }
                : undefined
            }
          />
        </section>

        {/* ============================================================ */}
        {/* Footer                                                        */}
        {/* ============================================================ */}
        <ApixAssistant buildContext={buildAssistantContext} onAction={applyAssistantAction} />

        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.6 }}
          className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-4 text-[11px] text-slate-600"
        >
          <span>
            APIx v{latest.version} · {t(lang, "footerMethod")} · {t(lang, "footerRouteWeights")}{" "}
            {ROUTES.map((r) => `${(r.weight * 100).toFixed(0)}%`).join("/")} · {t(lang, "footerWindowWeights")}{" "}
            {WINDOWS.map((w) => `${(w.weight * 100).toFixed(0)}%`).join("/")}
          </span>
          <span>
            {t(lang, "footerSeriesDate")} {formatFullDate(latest.date)} · {t(lang, "footerPoC")}
          </span>
        </motion.footer>
      </div>

      {/* ⌘K command palette — cascades the same state setters as the controls */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        scope={scope}
        baseYear={baseYear}
        horizon={horizon}
        theme={theme}
        onScope={setScope}
        onBaseYear={setBaseYear}
        onHorizon={setHorizon}
        onTheme={setTheme}
        onAssistant={() => setPaletteOpen(false)}
      />

      {/* Guided tour (spotlight walkthrough for judges) */}
      <GuidedTour open={tourOpen} onClose={() => setTourOpen(false)} />

      {/* About FAIR FLIGHT — the full encyclopedia drawer (opened via the
          ABOUT_OPEN_EVENT dispatched by the rail, palette, and tour) */}
      <AboutDrawer open={about.aboutOpen} onClose={about.closeAbout} />

      {/* Formal methodology drawer — formulas, COICOP mapping, provenance */}
      <MethodologyPanel />
    </div>
    </LangContext.Provider>
  );
}
