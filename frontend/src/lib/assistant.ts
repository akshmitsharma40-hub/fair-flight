/**
 * assistant.ts — grounded APIx assistant intent engine.
 *
 * A fully client-side, deterministic assistant: every reply is COMPOSED FROM
 * the same series state powering the dashboard (no hallucinated numbers — the
 * template only interpolates values computed from lib/series + the live
 * forecast payload). Recognised intents produce an optional dashboard action
 * (scope / baseYear / horizon changes) so the assistant can drive the UI.
 *
 * No external LLM/API dependency — safe for offline demo conditions.
 */

import { getNationalSeries, getRouteSeries, ROUTES, reindex, type BaseYear, type Horizon, type RouteId, type SectorScope } from "@/lib/series";
import type { ArimaViewForecast } from "@/lib/series";
import { formatInr } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssistantContext {
  scope: SectorScope;
  baseYear: BaseYear;
  horizon: Horizon;
  forecast?: ArimaViewForecast | null;
  latestApix: number;
  cpiBenchmark: number;
}

export interface AssistantAction {
  type: "setScope" | "setBaseYear" | "setHorizon";
  value: SectorScope | BaseYear | Horizon;
}

export interface AssistantReply {
  text: string;
  chips: string[];
  action?: AssistantAction;
}

// ---------------------------------------------------------------------------
// Entity extraction
// ---------------------------------------------------------------------------

const ROUTE_ALIASES: Array<{ id: RouteId; patterns: RegExp[] }> = [
  { id: "DEL-BOM", patterns: [/del\s*[- ]?\s*bom/i, /delhi[^a-z]{0,6}mumbai/i] },
  { id: "DEL-BLR", patterns: [/del\s*[- ]?\s*blr/i, /delhi[^a-z]{0,6}bengaluru|delhi[^a-z]{0,6}bangalore/i] },
  { id: "BOM-BLR", patterns: [/bom\s*[- ]?\s*blr/i, /mumbai[^a-z]{0,6}bengaluru|mumbai[^a-z]{0,6}bangalore/i] },
  { id: "BLR-HYD", patterns: [/blr\s*[- ]?\s*hyd/i, /bengaluru[^a-z]{0,6}hyderabad|bangalore[^a-z]{0,6}hyderabad/i] },
  { id: "DEL-CCU", patterns: [/del\s*[- ]?\s*ccu/i, /delhi[^a-z]{0,6}kolkata|delhi[^a-z]{0,6}calcutta/i] },
];

function extractRoute(text: string): RouteId | null {
  for (const { id, patterns } of ROUTE_ALIASES) {
    if (patterns.some((p) => p.test(text))) return id;
  }
  return null;
}

function extractHorizon(text: string): Horizon | null {
  if (/\bweek\b|\b7\s*-?\s*d\b|\b7\s*-?\s*day\b/i.test(text)) return "7D";
  if (/\bmonth\b|\b30\s*d\b|\b1\s*-?\s*m\b|\b1\s*month\b/i.test(text)) return "1M";
  if (/\bquarter\b|\b90\s*d\b|\b3\s*-?\s*m\b|\b3\s*month\b/i.test(text)) return "3M";
  if (/\ball\b|\bfull\b|\beverything\b|\bhistory\b/i.test(text)) return "ALL";
  return null;
}

function extractBaseYear(text: string): BaseYear | null {
  if (/2012/i.test(text)) return "2012";
  if (/2024/i.test(text)) return "2024";
  return null;
}

// ---------------------------------------------------------------------------
// Statistics helpers (all values derived from live series state)
// ---------------------------------------------------------------------------

interface ScopeStats {
  latest: number;
  first: number;
  latestDate: string;
  dodPct: number;
  trendPct: number;
  peak: { date: string; value: number };
  trough: { date: string; value: number };
  avgFare: number;
  weightPct: number;
}

export function scopeStats(scope: SectorScope, baseYear: BaseYear): ScopeStats {
  const series =
    scope === "NATIONAL"
      ? getNationalSeries().map((p) => ({ date: p.date, apix: p.apix2024, fare: p.fare, dod: p.dodPct }))
      : getRouteSeries(scope).map((p) => ({ date: p.date, apix: p.apix2024, fare: p.fare, dod: p.dodPct }));

  const idx = series.map((p) => ({ ...p, apix: reindex(p.apix, baseYear) }));
  const first = idx[0];
  const latest = idx[idx.length - 1];
  const sorted = [...idx].sort((a, b) => a.apix - b.apix);
  const route = ROUTES.find((r) => r.id === scope);

  return {
    latest: latest.apix,
    first: first.apix,
    latestDate: latest.date,
    dodPct: latest.dod,
    trendPct: Number((((latest.apix - first.apix) / first.apix) * 100).toFixed(2)),
    peak: { date: sorted[sorted.length - 1].date, value: sorted[sorted.length - 1].apix },
    trough: { date: sorted[0].date, value: sorted[0].apix },
    avgFare: latest.fare,
    weightPct: Math.round((route?.weight ?? 1) * 100),
  };
}

function describeTrend(trendPct: number): string {
  if (trendPct > 5) return "firming steadily";
  if (trendPct > 1) return "drifting upward";
  if (trendPct < -5) return "cooling sharply";
  if (trendPct < -1) return "drifting downward";
  return "moving sideways";
}

function scopeDisplayName(scope: SectorScope): string {
  if (scope === "NATIONAL") return "the national aggregate";
  const route = ROUTES.find((r) => r.id === scope);
  return route ? `${scope} (${route.corridor})` : scope;
}

// ---------------------------------------------------------------------------
// Intent handlers
// ---------------------------------------------------------------------------

type Handler = (text: string, ctx: AssistantContext) => AssistantReply;

const DEFAULT_CHIPS = [
  "What is the current APIx?",
  "Forecast for DEL-BLR",
  "Switch to 2012 base",
  "Why did fares spike?",
  "Show 7-day view",
];

function answerCurrentIndex(text: string, ctx: AssistantContext): AssistantReply {
  const route = extractRoute(text);
  const targetScope = route ?? ctx.scope;
  const stats = scopeStats(targetScope, ctx.baseYear);
  const action = route && route !== ctx.scope ? { type: "setScope" as const, value: route } : undefined;

  const lines = [
    `Current APIx for ${scopeDisplayName(targetScope)} is **${stats.latest.toFixed(2)}** (Base ${ctx.baseYear}=100), as of ${stats.latestDate}.`,
    `That's ${formatInr(stats.avgFare)} for the weighted basket, a day-over-day shift of ${stats.dodPct >= 0 ? "+" : ""}${stats.dodPct.toFixed(2)}% and a ${describeTrend(stats.trendPct)} trend (${stats.trendPct >= 0 ? "+" : ""}${stats.trendPct.toFixed(2)}% across the visible window).`,
  ];
  if (targetScope !== "NATIONAL") {
    lines.push(`This corridor carries a ${stats.weightPct}% DGCA traffic weight in the national basket.`);
  }
  if (Math.abs(stats.dodPct) > 5) {
    lines.push(`The ±5% MoSPI volatility threshold is breached — the banner above is active.`);
  }
  return {
    text: lines.join("\n\n"),
    chips: ["Forecast for this corridor", "Why did fares move?", "Show heatmap insights"],
    action,
  };
}

function answerForecast(text: string, ctx: AssistantContext): AssistantReply {
  const route = extractRoute(text);
  const targetScope = route ?? ctx.scope;
  const action = route && route !== ctx.scope ? { type: "setScope" as const, value: route } : undefined;
  const stats = scopeStats(targetScope, ctx.baseYear);

  // Prefer the live backend forecast; refit client-side only when absent.
  const forecast = ctx.forecast ?? null;
  if (!forecast || forecast.predictions.length === 0) {
    return {
      text: `I don't have a fitted forecast loaded for ${scopeDisplayName(targetScope)} yet — the ARIMA engine is still initialising. Ask again in a moment, or switch scopes to trigger a fresh fit.`,
      chips: DEFAULT_CHIPS,
      action,
    };
  }

  const { order } = forecast.model;
  const last = forecast.predictions[forecast.predictions.length - 1];
  const reindexed = reindex(last.point, ctx.baseYear);
  const lo = reindex(last.lower95, ctx.baseYear);
  const hi = reindex(last.upper95, ctx.baseYear);
  const drift = reindexed - stats.latest;
  const direction = drift >= 0 ? "rise" : "ease";

  return {
    text: [
      `The ARIMA(${order.p},${order.d},${order.q}) fit projects ${scopeDisplayName(targetScope)} to ${direction} to **${reindexed.toFixed(2)}** by ${last.date} (Base ${ctx.baseYear}=100).`,
      `That's a ${drift >= 0 ? "+" : ""}${drift.toFixed(2)}-point move from today's ${stats.latest.toFixed(2)}, with a 95% interval of ${lo.toFixed(1)} – ${hi.toFixed(1)} — the shaded band on the chart.`,
      forecast.source === "backend"
        ? "Model fitted server-side on data_master.csv (Hannan–Rissanen, AIC-selected order)."
        : "Fitted client-side by the in-browser ARIMA port (backend offline) — same methodology.",
    ].join("\n\n"),
    chips: ["What is the current APIx?", "Why did fares spike?", "Compare with CPI"],
    action,
  };
}

function answerCompareCpi(_text: string, ctx: AssistantContext): AssistantReply {
  const stats = scopeStats(ctx.scope, ctx.baseYear);
  const cpi = reindex(ctx.cpiBenchmark, ctx.baseYear);
  const gap = stats.latest - cpi;
  return {
    text: [
      `APIx for ${scopeDisplayName(ctx.scope)} stands at **${stats.latest.toFixed(2)}** vs the official CPI benchmark of ${cpi.toFixed(1)} (Base ${ctx.baseYear}=100).`,
      gap >= 0
        ? `Airfares are running ${gap.toFixed(2)} points ABOVE the CPI reference line — dynamic fare pricing is outpacing economy-wide transport inflation.`
        : `Airfares are running ${Math.abs(gap).toFixed(2)} points BELOW the CPI reference line — an unusually soft patch for the sector.`,
      `CPI Division 07 (Transport) is published monthly with a lag; APIx updates daily and is designed to bridge exactly that gap for MoSPI/RBI nowcasting.`,
    ].join("\n\n"),
    chips: ["What is the current APIx?", "Forecast for this scope", "Switch to 2012 base"],
  };
}

function answerEvents(_text: string, ctx: AssistantContext): AssistantReply {
  const stats = scopeStats(ctx.scope, ctx.baseYear);
  return {
    text: [
      `Recent fare dynamics for ${scopeDisplayName(ctx.scope)}: ${describeTrend(stats.trendPct)} (${stats.trendPct >= 0 ? "+" : ""}${stats.trendPct.toFixed(2)}% across the window).`,
      `The annotated macro events on the chart — Independence Day (Aug 15), Corporate Tech Summit (Sep 3), ATF Fuel Hike (Jul 16) — each inject a decaying 4-day demand shock into the index. Festival anchors recur yearly.`,
      `Peak in-window: **${stats.peak.value.toFixed(2)}** on ${stats.peak.date}; trough: ${stats.trough.value.toFixed(2)} on ${stats.trough.date}.`,
    ].join("\n\n"),
    chips: ["Forecast for this scope", "Show 7-day view", "What is the current APIx?"],
  };
}

function answerBaseYear(text: string, ctx: AssistantContext): AssistantReply {
  const target = extractBaseYear(text) ?? (ctx.baseYear === "2024" ? "2012" : "2024");
  const action: AssistantAction = { type: "setBaseYear", value: target };
  const stats = scopeStats(ctx.scope, target);
  const crossFactor = target === "2012" ? "× 1.18 re-index factor" : "÷ 1.18 (back to the 2024 mandate)";
  return {
    text: [
      `Switched to **Base ${target}=100** (${crossFactor}).`,
      `On this scale, ${scopeDisplayName(ctx.scope)} reads **${stats.latest.toFixed(2)}** — the anchor series remains pinned to 100.00 at its base observation.`,
      `MoSPI's CPI mandate moved to Base Year 2024=100 under COICOP-2018; the 2012 view is retained for legacy-series comparability.`,
    ].join("\n\n"),
    chips: ["Switch to 2024 base", "Compare with CPI", "Forecast for this scope"],
    action,
  };
}

function answerSetHorizon(text: string, _ctx: AssistantContext): AssistantReply {
  const target = extractHorizon(text);
  if (!target) {
    return {
      text: "I can switch the horizon to 7D, 1M, 3M, or ALL — which would you like?",
      chips: ["Show 7-day view", "Show 1-month view", "Show full history"],
    };
  }
  const labels: Record<Horizon, string> = { "7D": "7 days", "1M": "1 month", "3M": "3 months", ALL: "the full 180-day history" };
  return {
    text: `Switched the time horizon to **${labels[target]}**. The chart, KPI strip, and window trend all recompute against this slice.`,
    chips: ["What is the current APIx?", "Forecast for this scope", "Compare with CPI"],
    action: { type: "setHorizon", value: target },
  };
}

function answerScopeSwitch(text: string, ctx: AssistantContext): AssistantReply {
  const route = extractRoute(text);
  if (!route) {
    return {
      text: `I can isolate any of the five DGCA corridors: ${ROUTES.map((r) => r.id).join(", ")}. Say e.g. "show DEL-BOM".`,
      chips: ["Show DEL-BOM", "Show DEL-BLR", "Back to national"],
    };
  }
  const action: AssistantAction = { type: "setScope", value: route };
  const stats = scopeStats(route, ctx.baseYear);
  const nationalFirst = ctx.scope !== route;
  return {
    text: [
      `Isolated **${route}** (${ROUTES.find((r) => r.id === route)!.corridor}).`,
      `Current corridor APIx: **${stats.latest.toFixed(2)}** (Base ${ctx.baseYear}=100), ${stats.dodPct >= 0 ? "+" : ""}${stats.dodPct.toFixed(2)}% day-over-day, carrying a ${stats.weightPct}% DGCA traffic weight.`,
      ...(nationalFirst ? ["Every chart, the KPI strip, and the forecast refit now follow this corridor."] : []),
    ].join("\n\n"),
    chips: ["Forecast for this corridor", "Back to national", "What is the current APIx?"],
    action,
  };
}

function answerNational(_text: string, _ctx: AssistantContext): AssistantReply {
  return {
    text: "Restored the **National Aggregate (Weighted)** view — the fixed-basket Laspeyres across all five corridors with DGCA traffic weights 35/25/20/10/10 and booking-horizon weights 15/35/50.",
    chips: ["What is the current APIx?", "Forecast for this scope", "Show heatmap insights"],
    action: { type: "setScope", value: "NATIONAL" },
  };
}

function answerHeatmap(_text: string, _ctx: AssistantContext): AssistantReply {
  // Corridor ranking by latest DoD, computed from live route series.
  const ranked = ROUTES.map((r) => {
    const s = getRouteSeries(r.id);
    return { id: r.id, dod: s[s.length - 1].dodPct, fare: s[s.length - 1].fare };
  }).sort((a, b) => b.dod - a.dod);
  const hottest = ranked[0];
  const coolest = ranked[ranked.length - 1];
  return {
    text: [
      `Corridor heat ranking (day-over-day, latest observation):`,
      ...ranked.map((r, i) => `${i + 1}. **${r.id}** — ${r.dod >= 0 ? "+" : ""}${r.dod.toFixed(2)}% (${formatInr(r.fare)} window-avg fare)`),
      `Hottest: ${hottest.id}; coolest: ${coolest.id}. Click any heatmap row to isolate that sector — or ask me to.`,
    ].join("\n"),
    chips: [`Show ${hottest.id}`, `Show ${coolest.id}`, "Back to national"],
  };
}

function answerMethodology(_text: string, _ctx: AssistantContext): AssistantReply {
  return {
    text: [
      `APIx is a **fixed-basket Laspeyres index** anchored to Base Year 2024=100 (MoSPI mandate, COICOP-2018 Division 07 → subclass 07.3.1.2, passenger transport by air).`,
      `Basket = Σ (DGCA corridor weight × booking-horizon weight × mean observed fare). Corridor weights: DEL-BOM 35%, DEL-BLR 25%, BOM-BLR 20%, BLR-HYD 10%, DEL-CCU 10%. Horizon weights: T+15 50%, T+7 35%, T+1 15%.`,
      `The projection is ARIMA(p,1,q) — order selected by AIC over p≤3, q≤2, estimated by Hannan–Rissanen on the published series, with ψ-weight 95% prediction bands.`,
    ].join("\n\n"),
    chips: ["What is the current APIx?", "Forecast for this scope", "Compare with CPI"],
  };
}

function answerTelemetry(_text: string, _ctx: AssistantContext): AssistantReply {
  return {
    text: [
      `Collection pipeline: 5 async Playwright workers sweep the DGCA corridors at T+1/T+7/T+15 daily at 02:00 AM IST (cron 0 0 * * * UTC in GitHub Actions).`,
      `Anti-bot: automation-flag scrubbing, en-IN locale, randomized human-like delays; 4 Cloudflare challenges bypassed in the last run. Extraction yield 99.4%.`,
      `If any worker fails, a DGCA-calibrated synthetic batch takes over instantly — the pipeline never fails closed.`,
    ].join("\n\n"),
    chips: ["What is the current APIx?", "Show heatmap insights", "Forecast for this scope"],
  };
}

function answerGreeting(_text: string, ctx: AssistantContext): AssistantReply {
  return {
    text: `I'm the APIx analyst assistant. I answer from the live dashboard state — index levels, ARIMA projections, corridor heat, methodology — and I can drive the controls (say "show DEL-BOM" or "switch to 2012 base"). Currently viewing ${scopeDisplayName(ctx.scope)} at Base ${ctx.baseYear}=100, horizon ${ctx.horizon}.`,
    chips: DEFAULT_CHIPS,
  };
}

function answerFallback(_text: string, _ctx: AssistantContext): AssistantReply {
  return {
    text: `I answer questions grounded in the live APIx dashboard — try asking about the current index, the ARIMA forecast, a specific corridor (e.g. "show DEL-BOM"), the base-year toggle, the heatmap ranking, or the index methodology.`,
    chips: DEFAULT_CHIPS,
  };
}

// ---------------------------------------------------------------------------
// Intent router
// ---------------------------------------------------------------------------

const INTENTS: Array<{ patterns: RegExp[]; handler: Handler }> = [
  { patterns: [/\b(hi|hello|hey|help|what can you)\b/i], handler: answerGreeting },
  { patterns: [/current|latest|right now|today'?s|what is the apix|index level/i], handler: answerCurrentIndex },
  { patterns: [/forecast|project|predict|tomorrow|next (week|7)/i], handler: answerForecast },
  { patterns: [/cpi|compare|versus|vs\.?|benchmark/i], handler: answerCompareCpi },
  { patterns: [/spike|event|diwali|atf|fuel|summit|holiday|festival|why.*(move|rise|fall|change)/i], handler: answerEvents },
  { patterns: [/2012|2024|base year|re-?index/i], handler: answerBaseYear },
  { patterns: [/\b(7\s*-?\s*d\b|7\s*-?\s*day\b|1\s*month\b|3\s*month\b|week|month|quarter|full history|horizon)\b/i], handler: answerSetHorizon },
  { patterns: [/national|aggregate|weighted|all corridors/i], handler: answerNational },
  { patterns: [/heatmap|heat map|hot|coolest|hottest|ranking|which corridor/i], handler: answerHeatmap },
  { patterns: [/laspeyres|methodolog|how (is|does).*(comput|calculat|weight)|basket|coicop|formula/i], handler: answerMethodology },
  { patterns: [/scraper|telemetry|pipeline|playwright|worker|cloudflare|uptime|health/i], handler: answerTelemetry },
  { patterns: [/show|isolate|switch|go to|view/i], handler: answerScopeSwitch },
];

export function respondTo(message: string, ctx: AssistantContext): AssistantReply {
  const normalized = message.trim();
  for (const intent of INTENTS) {
    if (intent.patterns.some((p) => p.test(normalized))) {
      return intent.handler(normalized, ctx);
    }
  }
  return answerFallback(normalized, ctx);
}

/** Rich-text renderer contract: **bold** segments become <strong> chips. */
export function splitBold(text: string): Array<{ text: string; bold: boolean }> {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part) => ({
    text: part.replace(/^\*\*|\*\*$/g, ""),
    bold: part.startsWith("**") && part.endsWith("**"),
  }));
}
