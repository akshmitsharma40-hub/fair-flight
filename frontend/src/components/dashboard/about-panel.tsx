import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  BookOpen,
  ChevronDown,
  LayoutDashboard,
  Plane,
  Search,
  ShieldCheck,
  Sigma,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { ABOUT_CHROME_HI, localizeGroups } from "@/lib/aboutHi";
import { LogoAeroTrend } from "@/components/logo-aero-trend";

/** Custom event fired by the tools rail + command palette to open this panel. */
export const ABOUT_OPEN_EVENT = "apix:open-about";

interface AboutEntry {
  term: string;
  full?: string;
  body: string;
}

interface AboutGroup {
  id: string;
  title: string;
  icon: React.ReactNode;
  entries: AboutEntry[];
}

const GROUPS: AboutGroup[] = [
  {
    id: "vision",
    title: "What is FAIR FLIGHT?",
    icon: <Plane className="h-4 w-4 text-sky-400" />,
    entries: [
      {
        term: "FAIR FLIGHT",
        body: "This dashboard. The name reads two ways: flight fares that are FAIR (transparently measured), and the Formal Airfare Index for Reporting. It is a real-time Airfare Price Index for India built as a proof-of-concept for augmenting the official Consumer Price Index with web-scraped airfare data — a mandate explicitly allowed under MoSPI's Base Year 2024 revision.",
      },
      {
        term: "APIx",
        full: "Airfare Price Index (experimental)",
        body: "The statistical series this dashboard publishes: a daily Laspeyres fixed-basket index of domestic airfares across 5 DGCA trunk corridors, re-based to 100 at the chosen base year. 'x' marks it experimental — not yet an official MoSPI release.",
      },
      {
        term: "MoSPI",
        full: "Ministry of Statistics and Programme Implementation",
        body: "India's NSO (National Statistical Office) parent ministry. It revises the CPI base decade (now 2024=100), chose the UN COICOP-2018 classification, and runs the e-Sankhyiki data portal this project's API mimics.",
      },
      {
        term: "RBI",
        full: "Reserve Bank of India",
        body: "The monetary authority and a primary consumer of CPI data for inflation targeting. Dynamic services like airfares feed core-inflation readings; a same-day index like this one gives policymakers a leading indicator instead of a monthly print.",
      },
      {
        term: "COICOP-2018",
        full: "Classification of Individual Consumption According to Purpose (2018 edition)",
        body: "The UN statistical classification MoSPI adopted with Base Year 2024. Air travel sits in Division 07 (Transport), class 07.3.1.2 'Passenger transport by air'. The dashboard stamps this code into API responses and the PDF bulletin.",
      },
      {
        term: "CPI",
        full: "Consumer Price Index",
        body: "The official headline inflation measure. The dashboard plots APIx against the flat official CPI benchmark (≈102.0) so you can see when airfares decouple from broad inflation — the whole point of augmenting CPI with dynamic data.",
      },
      {
        term: "DGCA",
        full: "Directorate General of Civil Aviation",
        body: "India's aviation regulator. Its published domestic traffic shares are the source of the corridor weights, and its sector statistics define the 5 monitored routes.",
      },
      {
        term: "e-Sankhyiki",
        body: "MoSPI's statistics portal (api.esankhyiki.in). The backend mirrors its URL conventions — /api/v1/apix/latest, /history?days=30&Format=JSON — so integration code written for the real portal would feel identical.",
      },
    ],
  },
  {
    id: "method",
    title: "Index methodology",
    icon: <Sigma className="h-4 w-4 text-violet-400" />,
    entries: [
      {
        term: "Laspeyres index",
        body: "The index formula: today's basket priced at today's fares, divided by the same fixed basket at base-year fares, × 100. Weights never change with behaviour, so the index is a pure price signal. APIx_t = 100 × Σ(wᵢ·w_w·P_{i,w,t}) / Σ(wᵢ·w_w·P_{i,w,0}).",
      },
      {
        term: "Route weights",
        body: "DGCA domestic traffic shares, fixed in the basket: DEL-BOM 35%, DEL-BLR 25% (Delhi→Bengaluru), BOM-BLR 20%, BLR-HYD 10%, DEL-CCU 10%. Heavier traffic corridors move the national index more.",
      },
      {
        term: "Advance-window weights",
        body: "Within each route, three booking horizons are averaged with fixed weights: T+1 (book tomorrow) 15%, T+7 35%, T+15 50% — approximating the real booking mix between last-minute business travel and planned leisure travel.",
      },
      {
        term: "Base Year 2024=100",
        body: "MoSPI's new mandate: index averages equal 100 in the base year. The dashboard also offers a 2012=100 view (legacy series, ×1.18 re-index divisor) so old comparisons still work — switch it in Controls → INDEX BASE.",
      },
      {
        term: "DoD shift",
        full: "Day-over-day change",
        body: "Today's APIx versus yesterday's, in %. Feeds the anomaly banner: any move beyond ±5% drops a HIGH VOLATILITY warning. A print of +3.75% means the weighted basket got 3.75% more expensive in one day.",
      },
      {
        term: "Paasche & Fisher indices",
        body: "Companion measures in the research panel. Paasche uses current-period weights (reveals substitution bias), Fisher is the geometric mean of the two — the 'ideal index'. The gap you see between Laspeyres and Paasche is real substitution behaviour between flight options.",
      },
      {
        term: "ARIMA forecast",
        full: "AutoRegressive Integrated Moving Average",
        body: "The dashed projection band on the chart. Estimated by Hannan–Rissanen two-stage least squares with AIC-selected orders (e.g. ARIMA(2,1,2)); the shaded region is a 95% prediction band. Estimated server-side on the real artifact series when the API is up, client-side otherwise — the badge under the chart always names the source.",
      },
      {
        term: "Seasonal decomposition",
        body: "The research panel splits the series into trend × weekly seasonality × residual. Airfares have a strong weekday profile (Fri/Sun peaks from business travel); 'seasonally adjusted' removes that so you read the underlying trend.",
      },
      {
        term: "Backtest scoreboard",
        body: "Walk-forward validation: the model is repeatedly fit on history up to day t and scored on unseen day t+1, across 12 folds. Reported as MAE, MAPE and skill vs a naive persistence forecast — the honest way to say 'the model beats yesterday's price by 42%'.",
      },
      {
        term: "Policy simulator",
        body: "Sliders inject shocks — ATF price change, demand surge, GST tweak — through the fitted model to project APIx impact, then translate that to headline-CPI basis points using air travel's 0.61% COICOP weight. E.g. ATF +15% ≈ +3.75% APIx ≈ +2.3 bps CPI.",
      },
    ],
  },
  {
    id: "pipeline",
    title: "Data pipeline",
    icon: <Activity className="h-4 w-4 text-emerald-400" />,
    entries: [
      {
        term: "scraper.py",
        body: "Async Playwright collector: hits airline/OTA pages for the 5 corridors at T+1/T+7/T+15 horizons with anti-bot headers and randomized delays. If selectors fail it falls back to a realistic synthetic generator so the demo never breaks — the pipeline is 'scraped' or 'synthetic', always labelled.",
      },
      {
        term: "pipeline.py",
        body: "Cleaning: filters outlier fares > ₹25,000, keeps the best available economy fare per flight, then synthesizes 30 days of DGCA-baseline history with ±10% noise. Output: data_master.csv.",
      },
      {
        term: "index_engine.py",
        body: "Computes the Laspeyres APIx with route × window weights and anchors the base to exactly 100.00. Output: daily_index.csv — the artifact the API serves and the chart renders.",
      },
      {
        term: "forecast_engine.py",
        body: "The ARIMA estimation service: fits the chosen order by AIC over the committed CSV, produces the forecast band, and exposes per-scope fits (national + each corridor).",
      },
      {
        term: "analytics_engine.py",
        body: "The research suite: walk-forward backtests, seasonal decomposition, policy simulation, ATF correlation, and the Paasche/Fisher companion indices.",
      },
      {
        term: "GitHub Actions · 05:30 IST",
        body: "A scheduled workflow (cron 0 0 * * * UTC = 05:30 IST) runs the full pipeline daily and commits fresh CSVs back to the repo — that is the 'daily publication' note under the masthead ribbon.",
      },
      {
        term: "Live vs snapshot",
        body: "The masthead ribbon tells you the data source: 'Live API · SSE' means the FastAPI backend is answering (server-side stats, real-time pushes); 'Embedded snapshot' means you're viewing committed CSV data without the backend. The dashboard is fully functional either way.",
      },
    ],
  },
  {
    id: "features",
    title: "Every panel & control",
    icon: <LayoutDashboard className="h-4 w-4 text-indigo-400" />,
    entries: [
      {
        term: "KPI strip",
        body: "Four headline cards: Current APIx (with the weighted ₹ basket fare), DoD shift, Base year (100.00 anchor), and Window trend (peak/trough over the horizon). All recompute when you change scope, base or time-travel.",
      },
      {
        term: "Controls row",
        body: "INDEX BASE (2024/2012), HORIZON (7D/1M/3M/ALL) and SECTOR (National + 5 corridors). The sector dropdown cascades everywhere: chart refits, ARIMA re-estimates, KPIs recompute.",
      },
      {
        term: "Time-travel scrubber",
        body: "Drag to any past date — the whole dashboard recomputes 'as of' that day (KPIs, forecast anchor, alerts). 'Back to live' returns to now. The state is shareable via the link icon.",
      },
      {
        term: "Share view (permalink)",
        body: "Encodes scope/base/horizon/theme/as-of into the URL hash (#s=DEL-BOM&b=2012…). Anyone opening the link lands on exactly your dashboard state.",
      },
      {
        term: "Corridor map",
        body: "The India SVG with animated arcs between city nodes — thickness = DGCA weight, colour = DoD heat. Click a corridor to isolate it across the dashboard; the plane glyph flies the arc.",
      },
      {
        term: "Fare decomposition",
        body: "Stacked bars per route: base fare (indigo) vs taxes & fees (sky) — the tax take is why airfares are tax-sensitive policy targets.",
      },
      {
        term: "Airline mix donut",
        body: "Market-share weighted contribution of carriers to the current basket fare.",
      },
      {
        term: "Sector heatmap",
        body: "All 5 corridors × 3 booking windows at a glance, coloured by DoD move — spot which corridor/window is heating up.",
      },
      {
        term: "Research panel",
        body: "Backtest scoreboard + weekday seasonality bars + Laspeyres/Paasche/Fisher comparison, served from the backend analytics engine with labelled client fallbacks.",
      },
      {
        term: "Policy simulator",
        body: "ATF/demand/GST sliders with preset chips (ATF +15%, Diwali surge…). Live project tiles show ΔAPIx, CPI pass-through in bps, and the fare multiplier.",
      },
      {
        term: "Alert center",
        body: "Threshold rules (default |DoD| > 5%) that raise browser notifications and log triggered events; runs on the live SSE feed.",
      },
      {
        term: "Analyst assistant",
        body: "The chatbot (bottom-right or rail). It answers questions grounded in the live index data — routes, weights, forecasts, volatility — with a screen-reader quote of the numbers it used.",
      },
      {
        term: "Command palette",
        body: "⌘K / Ctrl+K. Fuzzy-searchable commands for every control: sector, base year, horizon, theme, assistant, tour, section jumps, this About panel.",
      },
      {
        term: "Guided tour",
        body: "A 7-step spotlight walkthrough of the dashboard for first-time judges/reviewers, launched from the ? button bottom-left.",
      },
      {
        term: "Bulletin PDF",
        body: "One click renders an A4 institutional bulletin (vector chart, KPI band, corridor table, COICOP footer) from the live series — server-side, dependency-free.",
      },
      {
        term: "i18n EN ⇄ हिन्दी",
        body: "The masthead chrome switches between English and Hindi (फेयर फ्लाइट) — on-mission for MoSPI's bilingual portals.",
      },
      {
        term: "Sign in",
        body: "PBKDF2-hashed accounts with HMAC bearer tokens. gov.in / nic.in emails get the institutional tier (600 req/min vs 240 public). Demo: analyst@mospi.gov.in / fairflight-demo.",
      },
      {
        term: "PWA installable",
        body: "It's an installable app: manifest + offline service worker mean FAIR FLIGHT can be pinned to a desktop/home screen and still render offline from the snapshot.",
      },
    ],
  },
  {
    id: "glossary",
    title: "Acronyms & fare terms",
    icon: <BookOpen className="h-4 w-4 text-amber-400" />,
    entries: [
      { term: "ATF", full: "Aviation Turbine Fuel", body: "Jet fuel — typically 30–40% of an Indian airline's cost base. The correlation explorer tracks real PPAC/IOCL notified Delhi depot prices (₹/kl, monthly) against APIx; the policy simulator shocks it directly." },
      { term: "GST", full: "Goods and Services Tax", body: "India's unified indirect tax. Economy domestic fares sit at 5% GST; the simulator's GST slider models a change in percentage points." },
      { term: "T+1 / T+7 / T+15", body: "Booking windows: fares observed 1, 7 and 15 days before departure. Last-minute (T+1) fares run ≈1.65× the T+15 baseline — the elasticity chart's price-decay curve." },
      { term: "MAE / MAPE", full: "Mean Absolute Error / Mean Absolute Percentage Error", body: "Forecast accuracy metrics from the walk-forward backtest. MAPE expresses error as % of the true value, so 4.7% MAPE = forecasts within ~5% on average." },
      { term: "SSE", full: "Server-Sent Events", body: "The push channel behind the 'Live' ribbon: the backend streams index ticks as they change (plus keepalives), no polling needed. Same role as WebSocket, simpler, HTTP-native." },
      { term: "HMAC", full: "Hash-based Message Authentication Code", body: "The signing scheme for both webhooks and auth tokens: a SHA-256 signature only someone holding the secret can produce — proof of authenticity and integrity." },
      { term: "PBKDF2", full: "Password-Based Key Derivation Function 2", body: "The password hashing used for accounts: 200,000 SHA-256 iterations with a per-user salt, so stored material resists brute-force even if leaked." },
      { term: "PWA", full: "Progressive Web App", body: "A web app installable to a home screen with offline support via a service worker — the dashboard keeps rendering from its snapshot without a network." },
      { term: "NSO", full: "National Statistical Office", body: "MoSPI's statistics arm — the would-be publisher of an official index like this. 'NSO-grade' in this project means: base-anchored, methodology-documented, revision-aware." },
      { term: "PPAC", full: "Petroleum Planning & Analysis Cell", body: "The petroleum ministry's data arm publishing daily ATF prices at IOCL depots — the future real source for the fuel series." },
      { term: "YoY", full: "Year-over-year", body: "Comparison against the same day a year earlier; the backend computes it on a seeded 420-day backfill." },
      { term: "bps", full: "basis points", body: "1 bp = 0.01%. CPI pass-through is quoted in bps: 'ATF +15% lifts headline CPI by ≈2.3 bps' = 0.023 percentage points." },
    ],
  },
  {
    id: "api",
    title: "API & integration",
    icon: <ShieldCheck className="h-4 w-4 text-cyan-400" />,
    entries: [
      { term: "GET /api/v1/apix/latest", body: "Today's index point with COICOP-2018 metadata injected (division, class, base anchor). The single number an upstream CPI system would ingest." },
      { term: "GET /api/v1/apix/history?days=30&Format=JSON", body: "The trailing series, e-Sankhyiki-style params. Format=JSON mirrors the real portal; CSV is also accepted." },
      { term: "GET /api/v1/apix/forecast?scope=…&horizon=…", body: "ARIMA projection + 95% band + model diagnostics (order, AIC) per scope." },
      { term: "GET /api/v1/apix/stream", body: "SSE live feed of index ticks (change-only pushes + keepalives). Powers the masthead ribbon and alert center." },
      { term: "POST /api/v1/webhooks/register", body: "Event-driven NSO push: register a target_url and receive HMAC-signed POSTs when the index updates or volatility breaches threshold." },
      { term: "Rate limits & auth", body: "Anonymous 240 req/min, institutional 600 req/min. Sign-in (gov.in / nic.in auto-tiered) issues 12-hour HMAC bearer tokens; the /auth/* endpoints mirror this dashboard's own sign-in flow." },
    ],
  },
];

function AboutDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["vision"]));
  const { lang } = useLang();
  const hi = lang === "hi";

  // Hindi overlay: same group/entry structure, localized titles + bodies.
  const localizedGroups = useMemo(
    () => (hi ? localizeGroups(GROUPS) : GROUPS),
    [hi],
  );
  const chrome = hi
    ? ABOUT_CHROME_HI
    : {
        drawerTitle: "About FAIR FLIGHT",
        drawerSub: "The complete field guide — every acronym, formula, panel and pipeline stage on this dashboard, in plain language.",
        searchPlaceholder: "Search — try “Laspeyres”, “ATF”, “webhook”…",
        searchLabel: "Search the about encyclopedia",
        matches: "matches",
        noMatches: (q: string) => `Nothing matches “${q}”. Try an acronym (GST, SSE) or a panel name (“heatmap”).`,
        footer: "FAIR FLIGHT · experimental APIx for CPI augmentation · COICOP-2018 Division 07 · Base Year 2024=100 · proof-of-concept data, not for official citation.",
      };

  // Reset search each open; ESC closes.
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return localizedGroups;
    return localizedGroups.map((g) => ({
      ...g,
      entries: g.entries.filter(
        (e) =>
          e.term.toLowerCase().includes(q) ||
          (e.full ?? "").toLowerCase().includes(q) ||
          e.body.toLowerCase().includes(q),
      ),
    })).filter((g) => g.entries.length > 0);
  }, [query, localizedGroups]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const matchCount = filtered.reduce((n, g) => n + g.entries.length, 0);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[93] flex justify-start bg-slate-950/55 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="About FAIR FLIGHT"
        >
          <motion.aside
            initial={{ x: -480, opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -480, opacity: 0.6 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="glass-panel flex h-full w-full max-w-[480px] flex-col overflow-hidden rounded-r-3xl shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-start gap-3 border-b border-slate-700/50 px-5 py-4">
              <LogoAeroTrend className="logo-shimmer mt-0.5 h-11 w-11 shrink-0" />
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-white">{chrome.drawerTitle}</h2>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                  {chrome.drawerSub}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close about panel"
                className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800/60 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search */}
            <div className="border-b border-slate-700/50 px-5 py-3">
              <div className="flex items-center gap-2 rounded-xl border border-slate-700/70 bg-slate-900/60 px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-slate-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={chrome.searchPlaceholder}
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-slate-100 placeholder:text-slate-500 focus:outline-none"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label={chrome.searchLabel}
                />
                {query && (
                  <span className="shrink-0 text-[10px] font-semibold text-slate-500">
                    {matchCount} {chrome.matches}
                  </span>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {filtered.length === 0 && (
                <p className="px-4 py-10 text-center text-sm text-slate-500">
                  {chrome.noMatches(query)}
                </p>
              )}
              {filtered.map((group) => {
                const isOpen = query.trim() !== "" || expanded.has(group.id);
                return (
                  <section key={group.id} className="mb-1.5">
                    <button
                      type="button"
                      onClick={() => toggle(group.id)}
                      aria-expanded={isOpen}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-slate-800/40",
                        isOpen && "text-white",
                      )}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800/70">
                        {group.icon}
                      </span>
                      <span className="flex-1 text-[13px] font-bold tracking-wide">
                        {group.title}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500">
                        {group.entries.length}
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200",
                          isOpen && "rotate-180",
                        )}
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.24, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          <dl className="space-y-1 px-3 pb-2">
                            {group.entries.map((entry) => (
                              <div
                                key={entry.term}
                                className="rounded-xl border border-slate-800/60 bg-slate-900/30 px-3.5 py-2.5"
                              >
                                <dt className="text-[12.5px] font-bold text-sky-300">
                                  {entry.term}
                                  {entry.full && (
                                    <span className="ml-1.5 font-medium text-slate-400">
                                      — {entry.full}
                                    </span>
                                  )}
                                </dt>
                                <dd className="mt-1 text-[12px] leading-relaxed text-slate-300">
                                  {entry.body}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </section>
                );
              })}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-700/50 px-5 py-3">
              <p className="text-[10.5px] leading-relaxed text-slate-500">
                {chrome.footer}
              </p>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * AboutLauncher — the docked rail button (Info icon) that opens the drawer.
 * Rendered by ToolsRail; the drawer itself mounts from App via the shared
 * open state exposed through the custom event or direct prop.
 */
export function useAboutOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(ABOUT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(ABOUT_OPEN_EVENT, onOpen);
  }, []);
  return { aboutOpen: open, openAbout: () => setOpen(true), closeAbout: () => setOpen(false) };
}

export { AboutDrawer };
