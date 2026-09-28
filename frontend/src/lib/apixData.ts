/**
 * apixData.ts — dashboard demo datasets for the route-level charts.
 *
 * Values are derived deterministically from the same DGCA route baseline
 * matrix used by backend/scraper.py, so the UI stays perfectly consistent
 * with the backend's synthetic layer. When the live API grows /api/v1/apix
 * route-breakdown endpoints, these loaders will defer to it.
 */

export interface RouteTaxBreakdown {
  route: string;
  baseFare: number;
  taxesFees: number;
}

export interface WindowElasticity {
  window: string;
  leadDays: number;
  avgFare: number;
}

// Must mirror backend/scraper.py ROUTES (baseline ₹, DGCA traffic weight).
export const ROUTE_DEMO: Array<{
  route: string;
  baseline: number;
  weight: number;
  corridor: string;
}> = [
  { route: "DEL-BOM", baseline: 6200, weight: 0.35, corridor: "Delhi → Mumbai" },
  { route: "DEL-BLR", baseline: 7800, weight: 0.25, corridor: "Delhi → Bengaluru" },
  { route: "BOM-BLR", baseline: 5600, weight: 0.2, corridor: "Mumbai → Bengaluru" },
  { route: "BLR-HYD", baseline: 4500, weight: 0.1, corridor: "Bengaluru → Hyderabad" },
  { route: "DEL-CCU", baseline: 6800, weight: 0.1, corridor: "Delhi → Kolkata" },
];

// Must mirror backend/scraper.py WINDOWS (multiplier vs T+15 plan-ahead floor).
export const WINDOW_DEMO: Array<{ window: string; leadDays: number; multiplier: number; weight: number }> = [
  { window: "T+15", leadDays: 15, multiplier: 1.0, weight: 0.5 },
  { window: "T+7", leadDays: 7, multiplier: 1.18, weight: 0.35 },
  { window: "T+1", leadDays: 1, multiplier: 1.65, weight: 0.15 },
];

export function buildTaxDecomposition(): RouteTaxBreakdown[] {
  return ROUTE_DEMO.map(({ route, baseline }) => {
    // Route-average fare across the T+15/T+7/T+1 window weights.
    const avgFare = WINDOW_DEMO.reduce(
      (acc, w) => acc + w.weight * baseline * w.multiplier,
      0,
    );
    // GST on domestic economy ≈ 5% of base + fuel surcharge + UDF/PSF/aviation
    // security fee — observed all-in levy ≈ 15% of the total fare.
    const taxesFees = Math.round(avgFare * 0.15 * 0.9 / 10) * 10;
    return {
      route,
      baseFare: Math.round(avgFare - taxesFees),
      taxesFees,
    };
  });
}

export function buildElasticity(): WindowElasticity[] {
  // Weighted route-average fare per booking window: T+15 → T+1 decay curve.
  return WINDOW_DEMO.slice()
    .sort((a, b) => a.leadDays - b.leadDays)
    .map(({ window, leadDays, multiplier }) => ({
      window,
      leadDays,
      avgFare: Math.round(
        ROUTE_DEMO.reduce(
          (acc, r) => acc + r.weight * r.baseline,
          0,
        ) * multiplier,
      ),
    }));
}

/** Share of the weighted basket attributable to taxes vs base fares. */
export function taxSharePercent(): number {
  const rows = buildTaxDecomposition();
  const total = rows.reduce((acc, r) => acc + r.baseFare + r.taxesFees, 0);
  const taxes = rows.reduce((acc, r) => acc + r.taxesFees, 0);
  return Number(((taxes / total) * 100).toFixed(1));
}
