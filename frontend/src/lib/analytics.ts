/**
 * analytics.ts — client-side companions to the backend analytics suite.
 *
 * Every research panel prefers the FastAPI endpoint (`/api/v1/apix/…`) fitted
 * on data artifacts. When the API is offline the panel degrades to these
 * deterministic client equivalents computed from the same anchored series the
 * dashboard renders — always labelled `client` so the demo never misstates its
 * source.
 */

import { fitArima } from "@/lib/arima";
import { scopedSeries, todayIst, type SectorScope } from "@/lib/series";

// ---------------------------------------------------------------------------
// Walk-forward backtest (client mirror of analytics_engine.backtest)
// ---------------------------------------------------------------------------

export interface ClientBacktest {
  scope: SectorScope;
  folds: number;
  mae: number;
  rmse: number;
  mape: number;
  coverage95: number;
  naiveMae: number;
  skillVsNaive: number;
  source: "client";
}

export function clientBacktest(scope: SectorScope): ClientBacktest {
  const values = scopedSeries(scope).map((p) => p.apix2024);
  const H = 7;
  const errors: number[] = [];
  const naiveErrors: number[] = [];
  const pctErrors: number[] = [];
  const squared: number[] = [];
  let hits = 0;
  let total = 0;
  let folds = 0;

  for (let origin = values.length - H - 7; origin >= 60; origin -= 14) {
    const actual = values.slice(origin, origin + H);
    if (actual.length < H) break;
    let fit: ReturnType<typeof fitArima>;
    try {
      fit = fitArima(values.slice(0, origin));
    } catch {
      continue;
    }
    folds += 1;
    actual.forEach((a, i) => {
      const err = a - fit.point[i];
      errors.push(err);
      naiveErrors.push(a - values[origin - 1]);
      pctErrors.push((err / a) * 100);
      squared.push(err * err);
      if (a >= fit.lower[i] && a <= fit.upper[i]) hits += 1;
      total += 1;
    });
  }

  const mae = mean(errors.map(Math.abs));
  const naiveMae = mean(naiveErrors.map(Math.abs));
  return {
    scope,
    folds,
    mae: round(mae, 3),
    rmse: round(Math.sqrt(mean(squared)), 3),
    mape: round(mean(pctErrors.map(Math.abs)), 2),
    coverage95: total ? round((hits / total) * 100, 1) : 0,
    naiveMae: round(naiveMae, 3),
    skillVsNaive: naiveMae > 0 ? round(1 - mae / naiveMae, 3) : 0,
    source: "client",
  };
}

// ---------------------------------------------------------------------------
// Classical weekly decomposition (client mirror of seasonal_decompose)
// ---------------------------------------------------------------------------

export interface ClientSeasonal {
  scope: SectorScope;
  strength: number;
  interpretation: string;
  weekdayProfile: Array<{ day: string; effect: number }>;
  source: "client";
}

export function clientSeasonal(scope: SectorScope, period = 7): ClientSeasonal {
  const series = scopedSeries(scope);
  const values = series.map((p) => p.apix2024);
  const n = values.length;
  const half = period >> 1;

  const trend = new Array<number>(n).fill(Number.NaN);
  for (let t = half; t < n - half; t++) {
    trend[t] = mean(values.slice(t - half, t + half + 1));
  }

  const detrended = values.map((v, t) => v - trend[t]);
  const dow = series.map((p) => new Date(`${p.date}T00:00:00Z`).getUTCDay());
  const profile = new Array<number>(period).fill(0);
  for (let d = 0; d < period; d++) {
    const vals = detrended.filter((_, t) => dow[t] === d && Number.isFinite(_));
    if (vals.length) profile[d] = mean(vals);
  }
  const profileMean = mean(profile);
  const centered = profile.map((v) => v - profileMean);

  const residual = values.map((v, t) => v - trend[t] - centered[dow[t]]);
  const varDetrended = variance(detrended.filter(Number.isFinite));
  const varResidual = variance(residual.filter(Number.isFinite));
  const strength = varDetrended > 0 ? 1 - varResidual / varDetrended : 0;

  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    scope,
    strength: round(strength, 3),
    interpretation:
      strength > 0.4 ? "strong weekly seasonality" : strength > 0.15 ? "moderate weekly seasonality" : "weak weekly seasonality",
    weekdayProfile: names.map((day, d) => ({ day, effect: round(centered[d], 3) })),
    source: "client",
  };
}

// ---------------------------------------------------------------------------
// Companion indices (client mirror — same two-segment construction)
// ---------------------------------------------------------------------------

export interface ClientCompanion {
  dates: string[];
  laspeyres: number[];
  paasche: number[];
  fisher: number[];
  substitutionBiasPts: number;
  source: "client";
}

export function clientCompanion(days = 90): ClientCompanion {
  const national = scopedSeries("NATIONAL").slice(-days);
  const x = national.map((p) => p.apix2024 / 100);
  const dates = national.map((p) => p.date);

  const leisureSpend = 0.6;
  const businessSpend = 0.4;
  const leisureEl = 1.2;
  const businessEl = 0.3;

  const laspeyres = national.map((p) => p.apix2024);
  const paasche = x.map((xi, i) => {
    const date = new Date(`${dates[i]}T00:00:00Z`);
    const doy = Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86_400_000);
    const dow = date.getUTCDay();
    const d = 1 + 0.03 * Math.sin((2 * Math.PI * doy) / 45) + 0.02 * (dow >= 4 || doy % 7 === 0 ? 1 : 0);
    const pLeisure = xi * d;
    const pBusiness = xi / Math.pow(d, 0.6);
    const qLeisure = leisureSpend * Math.pow(pLeisure, -leisureEl);
    const qBusiness = businessSpend * Math.pow(pBusiness, -businessEl);
    return round((100 * (qLeisure * pLeisure + qBusiness * pBusiness)) / (qLeisure + qBusiness), 2);
  });
  const fisher = laspeyres.map((l, i) => round(Math.sqrt(l * paasche[i]), 2));

  return {
    dates,
    laspeyres,
    paasche,
    fisher,
    substitutionBiasPts: round(laspeyres[laspeyres.length - 1] - paasche[paasche.length - 1], 2),
    source: "client",
  };
}

// ---------------------------------------------------------------------------
// YoY (client mirror off the 180-day window — nearest −180d comparison)
// ---------------------------------------------------------------------------

export interface ClientYoy {
  latest: number;
  latestDate: string;
  monthsAgo: number;
  monthsAgoValue: number;
  changePct: number;
  note: string;
  source: "client";
}

export function clientYoy(scope: SectorScope): ClientYoy {
  const series = scopedSeries(scope);
  const last = series[series.length - 1];
  const sixMonths = series[Math.max(0, series.length - 1 - 180)];
  return {
    latest: last.apix2024,
    latestDate: last.date,
    monthsAgo: 6,
    monthsAgoValue: sixMonths.apix2024,
    changePct: round(((last.apix2024 - sixMonths.apix2024) / sixMonths.apix2024) * 100, 2),
    note: "Client window is 180 days — compare vs 6 months (full-year YoY needs the backend artifact)",
    source: "client",
  };
}

/** Latest index date the client series reaches (drives the time-travel scrubber). */
export function seriesEnd(): string {
  return todayIst();
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function variance(xs: number[]): number {
  if (!xs.length) return 0;
  const m = mean(xs);
  return mean(xs.map((x) => (x - m) ** 2));
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
