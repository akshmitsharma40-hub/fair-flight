#!/usr/bin/env python3
"""index_engine.py — Laspeyres APIx computation → daily_index.csv.

Builds the National Airfare Price Index (APIx) as a fixed-basket Laspeyres
aggregation over the five DGCA trunk corridors:

    APIx_t = 100 × ( Σ_i Σ_w  (RouteWeight_i × WindowWeight_w × P_{i,w,t}) )
                  / ( Σ_i Σ_w  (RouteWeight_i × WindowWeight_w × P_{i,w,0}) )

- Route weights: DGCA domestic traffic shares (DEL-BOM 35% … BLR-HYD 10%).
- Window weights: booking-horizon shares (T+15 50% / T+7 35% / T+1 15%).
- BASE ANCHOR = 100.00, aligning with MoSPI's new "Base Year 2024=100" mandate.
- A flat CPI benchmark is carried alongside for visual comparison.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from pipeline import MASTER_PATH, run_pipeline
from scraper import ROUTES, WINDOWS, today_ist

INDEX_PATH = Path("daily_index.csv")

BASE_ANCHOR = 100.0        # MoSPI Base Year 2024 = 100
CPI_BENCHMARK = 102.0      # flat official CPI (Div 07) reference line

# Authoritative DGCA traffic weights — declared explicitly so the basket stays
# correct even if the ROUTES catalogue in scraper.py grows later.
ROUTE_WEIGHTS: dict[str, float] = {
    "DEL-BOM": 0.35,
    "DEL-BLR": 0.25,
    "BOM-BLR": 0.20,
    "BLR-HYD": 0.10,
    "DEL-CCU": 0.10,
}

# Booking-horizon weights — share of observed domestic ticketing volume.
WINDOW_WEIGHTS: dict[str, float] = {
    "T+15": 0.50,
    "T+7": 0.35,
    "T+1": 0.15,
}


def _route_baseline(route_id: str) -> float:
    return float(next(r["baseline"] for r in ROUTES if r["id"] == route_id))


def _window_multiplier(window_id: str) -> float:
    return float(next(w["multiplier"] for w in WINDOWS if w["id"] == window_id))


def _cell_means(frame: pd.DataFrame, day: str) -> pd.DataFrame:
    """Average observed fare per (route, lead_window) cell for a given day."""
    subset = frame[frame["date"] == day]
    return (
        subset.groupby(["route", "lead_window"], as_index=False)["total_fare"]
        .mean()
        .rename(columns={"total_fare": "fare"})
    )


def basket_price(cells: pd.DataFrame) -> float:
    """Fixed-basket Laspeyres cost of the route × window basket.

    Missing cells fall back to the route's DGCA baseline scaled by the window
    multiplier — a chained carry-forward that keeps the index continuous.
    """
    total = 0.0
    for route_id, route_w in ROUTE_WEIGHTS.items():
        route_fare = 0.0
        for window_id, window_w in WINDOW_WEIGHTS.items():
            hit = cells[(cells["route"] == route_id) & (cells["lead_window"] == window_id)]
            if hit.empty:
                fare = _route_baseline(route_id) * _window_multiplier(window_id)
            else:
                fare = float(hit["fare"].iloc[0])
            route_fare += window_w * fare
        total += route_w * route_fare
    return total


def compute_daily_index(master: pd.DataFrame) -> pd.DataFrame:
    """Walk the master frame day by day and anchor the first day at 100.00."""
    days = sorted(master["date"].dropna().unique())
    rows: list[dict] = []
    base_basket: float | None = None
    prev_apix: float | None = None

    for day in days:
        cells = _cell_means(master, day)
        basket = basket_price(cells)
        if base_basket is None:
            base_basket = basket
        apix = (BASE_ANCHOR * basket / base_basket) if base_basket else BASE_ANCHOR
        dod = 0.0 if prev_apix is None else ((apix - prev_apix) / prev_apix) * 100.0
        rows.append(
            {
                "date": day,
                "basket_price": round(basket, 2),
                "apix": round(apix, 2),
                "dod_pct": round(dod, 2),
                "cpi_benchmark": CPI_BENCHMARK,
            }
        )
        prev_apix = apix

    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# e-Sankhyiki-style JSON payloads (consumed by api.py and the dashboard)
# ---------------------------------------------------------------------------

COICOP_METADATA = {
    "coicop": {
        "division": "07",
        "divisionName": "Transport",
        "group": "07.3",
        "groupName": "Transport services",
        "class_": "07.3.1",
        "className": "Local and long-distance land, air and water passenger transport",
        "subClass": "07.3.1.2",
        "subClassName": "Passenger transport by air",
        "framework": "COICOP-2018",
        "baseYear": "2024",
        "baseAnchor": BASE_ANCHOR,
        "publisher": "MoSPI (proof-of-concept, experimental series)",
    }
}


def latest_payload(index: pd.DataFrame) -> dict:
    """Latest observation with COICOP-2018 metadata injected."""
    last = index.iloc[-1]
    return {
        "series": "APIx",
        "version": "1.0.0",
        "classification": "experimental",
        "asOf": today_ist().strftime("%Y-%m-%dT%H:%M:%S%z"),
        "date": last["date"],
        "apix": float(last["apix"]),
        "dodPct": float(last["dod_pct"]),
        "baseAnchor": BASE_ANCHOR,
        "weightedBasketInr": float(last["basket_price"]),
        "cpiBenchmark": CPI_BENCHMARK,
        "routesTracked": len(ROUTE_WEIGHTS),
        "corridors": list(ROUTE_WEIGHTS.keys()),
        **COICOP_METADATA,
    }


def history_payload(index: pd.DataFrame, days: int = 30) -> dict:
    """Historical observations with COICOP-2018 metadata injected."""
    slice_ = index.tail(days)
    return {
        "series": "APIx",
        "version": "1.0.0",
        "classification": "experimental",
        "days": int(len(slice_)),
        "baseDate": str(index.iloc[0]["date"]) if not index.empty else "",
        "baseAnchor": BASE_ANCHOR,
        "observations": [
            {
                "date": row["date"],
                "apix": float(row["apix"]),
                "basketPrice": float(row["basket_price"]),
                "dodPct": float(row["dod_pct"]),
                "cpiBenchmark": float(row["cpi_benchmark"]),
            }
            for _, row in slice_.iterrows()
        ],
        **COICOP_METADATA,
    }


def run_index(
    master_path: Path = MASTER_PATH,
    index_path: Path = INDEX_PATH,
    rebuild: bool = False,
) -> pd.DataFrame:
    """Load data_master.csv (rebuilding via pipeline when absent) and write daily_index.csv."""
    if rebuild or not master_path.exists():
        run_pipeline(force_fallback=True)
    master = pd.read_csv(master_path)
    index = compute_daily_index(master)
    index_path.parent.mkdir(parents=True, exist_ok=True)
    index.to_csv(index_path, index=False)
    return index


def main() -> int:
    parser = argparse.ArgumentParser(description="Compute the Laspeyres APIx series")
    parser.add_argument("--rebuild", action="store_true", help="rebuild data_master.csv first")
    parser.add_argument("--master", default=str(MASTER_PATH))
    parser.add_argument("--out", default=str(INDEX_PATH))
    args = parser.parse_args()

    index = run_index(Path(args.master), Path(args.out), rebuild=args.rebuild)
    last = index.iloc[-1]
    print(
        f"[index] {last['date']} APIx={last['apix']:.2f} "
        f"basket=INR {last['basket_price']:.0f} DoD={last['dod_pct']:+.2f}% -> {args.out}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
