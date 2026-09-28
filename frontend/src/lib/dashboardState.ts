/**
 * dashboardState.ts — shareable permalinks + time-travel state helpers.
 *
 * The dashboard's full view state (scope, base year, horizon, theme, time
 * travel) serializes into the URL hash, so a judge can bookmark or share an
 * exact dashboard configuration. `#s=DEL-BOM&b=2012&h=7D&d=2026-08-15&t=light`
 */

import type { BaseYear, Horizon, SectorScope } from "@/lib/series";

export interface DashboardUrlState {
  scope: SectorScope | null;
  baseYear: BaseYear | null;
  horizon: Horizon | null;
  theme: "dark" | "light" | null;
  /** Time-travel "as of" date (ISO) or null for live. */
  asOf: string | null;
}

const ROUTE_IDS = new Set(["DEL-BOM", "DEL-BLR", "BOM-BLR", "BLR-HYD", "DEL-CCU"]);

export function readDashboardState(): DashboardUrlState {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const scope = params.get("s");
  const base = params.get("b");
  const horizon = params.get("h");
  const theme = params.get("t");
  const asOf = params.get("d");
  return {
    scope: scope && (scope === "NATIONAL" || ROUTE_IDS.has(scope)) ? (scope as SectorScope) : null,
    baseYear: base === "2024" || base === "2012" ? base : null,
    horizon: horizon === "7D" || horizon === "1M" || horizon === "3M" || horizon === "ALL" ? horizon : null,
    theme: theme === "dark" || theme === "light" ? theme : null,
    asOf: asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : null,
  };
}

export function writeDashboardState(state: DashboardUrlState): void {
  const params = new URLSearchParams();
  if (state.scope) params.set("s", state.scope);
  if (state.baseYear) params.set("b", state.baseYear);
  if (state.horizon) params.set("h", state.horizon);
  if (state.theme) params.set("t", state.theme);
  if (state.asOf) params.set("d", state.asOf);
  const next = params.toString();
  const url = `${window.location.pathname}${next ? `#${next}` : ""}`;
  // replaceState keeps the back button clean while sharing the exact URL.
  window.history.replaceState(null, "", url);
}
