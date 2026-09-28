#!/usr/bin/env python3
"""pipeline.py — APIx cleaning + 30-day history synthesis → data_master.csv.

Responsibilities:
  1. Load raw quotes from data_scraped_raw.csv (live or synthetic source).
  2. Clean: numeric coercion, outlier filter (> ₹25,000), best-economy-fare
     isolation (keep the N cheapest carriers per date/route/window cell).
  3. Synthesise 30 calendar days of DGCA-calibrated history (±10% noise,
     day-of-week seasonality, occasional festival shocks, gentle upward trend)
     so the Laspeyres index has a real time-series backbone on day one.
  4. Write the combined master dataset to data_master.csv.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from scraper import (
    AIRLINES,
    COLUMNS,
    IST,
    OUTLIER_FARE_CAP,
    ROUTES,
    WINDOWS,
    collect_quotes,
    round_rupee,
    synthetic_live_quotes,
    today_ist,
)

MASTER_PATH = Path("data_master.csv")
RAW_PATH = Path("data_scraped_raw.csv")

HISTORY_DAYS = 30
LOWEST_N = 3          # best-economy-fare isolation: keep 3 cheapest per cell
SEED = 20260911       # deterministic history synthesis
NOISE_BAND = 0.10     # ±10% noise band around DGCA baselines

MASTER_COLUMNS = COLUMNS + ["date", "lead_window", "source"]

# Day-of-week demand curve calibrated to Indian domestic travel patterns
_DOW_MULT = {
    0: 1.00,  # Monday
    1: 0.98,  # Tuesday (weekly trough)
    2: 0.98,  # Wednesday
    3: 1.00,  # Thursday
    4: 1.10,  # Friday (weekend-getaway ramp)
    5: 1.06,  # Saturday
    6: 1.04,  # Sunday
}


def _dow_mult(day: datetime) -> float:
    return _DOW_MULT[day.weekday()]


# ---------------------------------------------------------------------------
# Cleaning
# ---------------------------------------------------------------------------

def clean_quotes(frame: pd.DataFrame) -> pd.DataFrame:
    """Drop malformed rows, filter >₹25k outliers, keep best economy fares."""
    if frame.empty:
        return frame.copy()

    data = frame.copy()
    data = data.dropna(subset=["route", "airline", "total_fare"])

    for col in ("total_fare", "base_fare", "taxes_fees", "lead_days"):
        if col in data.columns:
            data[col] = pd.to_numeric(data[col], errors="coerce")

    data = data[data["total_fare"].notna() & (data["total_fare"] > 0)]
    data = data[data["total_fare"] <= OUTLIER_FARE_CAP]          # ₹25k outlier cap
    data = data[data["airline"].astype(str).str.strip().ne("")]

    data["lead_window"] = data["lead_days"].map({1: "T+1", 7: "T+7", 15: "T+15"})
    data = data[data["lead_window"].notna()]

    # Stamp the collection date (IST) on every row.
    if "timestamp" in data.columns:
        parsed = pd.to_datetime(data["timestamp"], errors="coerce", utc=True)
        data["date"] = parsed.dt.tz_convert("Asia/Kolkata").dt.strftime("%Y-%m-%d")
        data["date"] = data["date"].fillna(today_ist().strftime("%Y-%m-%d"))
    else:
        data["date"] = today_ist().strftime("%Y-%m-%d")

    # Best-economy-fare isolation: keep the LOWEST_N carriers per cell.
    grouped: list[pd.DataFrame] = []
    for _, grp in data.groupby(["date", "route", "lead_window"], dropna=False):
        grouped.append(grp.sort_values("total_fare").head(LOWEST_N))
    if not grouped:
        return data.iloc[0:0]
    return pd.concat(grouped, ignore_index=True)


# ---------------------------------------------------------------------------
# 30-day history synthesis (DGCA-calibrated, ±10% noise)
# ---------------------------------------------------------------------------

def synthesise_history(as_of: Optional[datetime] = None, seed: int = SEED) -> pd.DataFrame:
    """30 calendar days of realistic quotes ending yesterday.

    Trend (+0.16%/day), DOW seasonality, 12% chance of a +4–9% daily shock and
    festival multipliers replicate real Indian fare dynamics.
    """
    as_of = as_of or today_ist()
    rng = np.random.default_rng(seed)
    rows: list[dict] = []

    for offset in range(HISTORY_DAYS - 1, 0, -1):
        day = as_of - timedelta(days=offset)
        day_index = HISTORY_DAYS - 1 - offset
        trend = 1.0 + 0.0016 * day_index
        shock = 1.0
        if rng.random() < 0.12:
            shock = rng.uniform(1.04, 1.09)
        if day.strftime("%m-%d") == "08-15":   # Independence Day demand spike
            shock *= 1.12

        timestamp = datetime(day.year, day.month, day.day, 8, 20, tzinfo=IST).strftime(
            "%Y-%m-%dT%H:%M:%S%z"
        )
        for route in ROUTES:
            carriers = AIRLINES if route["id"] != "BLR-HYD" else AIRLINES[:-1]
            for window in WINDOWS:
                cell = (
                    route["baseline"]
                    * window["multiplier"]
                    * trend
                    * _dow_mult(day)
                    * shock
                    * rng.uniform(1 - NOISE_BAND, 1 + NOISE_BAND)
                )
                departure = (day + timedelta(days=int(window["lead_days"]))).strftime("%Y-%m-%d")
                for slot, airline in enumerate(carriers):
                    total = round_rupee(cell * airline["bias"] * rng.uniform(0.96, 1.08))
                    total = max(route["floor"], min(total, OUTLIER_FARE_CAP - 10))
                    taxes = round_rupee(total * 0.15)
                    rows.append(
                        {
                            "timestamp": timestamp,
                            "route": route["id"],
                            "airline": airline["name"],
                            "flight_number": (
                                f"{airline['code']} "
                                f"{110 + (hash(route['id'] + airline['code'] + day.strftime('%Y%m%d') + str(slot)) % 880)}"
                            ),
                            "departure_date": departure,
                            "lead_days": int(window["lead_days"]),
                            "base_fare": total - taxes,
                            "taxes_fees": taxes,
                            "total_fare": total,
                            "date": day.strftime("%Y-%m-%d"),
                            "lead_window": window["id"],
                            "source": "historical",
                        }
                    )
    return pd.DataFrame(rows, columns=MASTER_COLUMNS)


# ---------------------------------------------------------------------------
# Master assembly
# ---------------------------------------------------------------------------

def prepare_live(frame: pd.DataFrame, source: str) -> pd.DataFrame:
    """Stamp date/lead_window/source onto today's live (or fallback) rows."""
    live = frame.copy()
    if "date" not in live.columns:
        live["date"] = today_ist().strftime("%Y-%m-%d")
    if "lead_window" not in live.columns:
        live["lead_window"] = live["lead_days"].map({1: "T+1", 7: "T+7", 15: "T+15"})
    live["source"] = source
    return live[MASTER_COLUMNS]


def build_master(raw_path: Path = RAW_PATH, force_fallback: bool = False) -> pd.DataFrame:
    """Read raw CSV (or collect fresh), merge 30-day history, clean, sort."""
    source = "live"
    if raw_path.exists() and not force_fallback:
        raw = pd.read_csv(raw_path)
    else:
        raw, source = collect_quotes(force_fallback=True)
        raw.to_csv(raw_path, index=False)

    if raw.empty:
        raw = synthetic_live_quotes()
        source = "fallback"

    live = prepare_live(raw, source if source in {"live", "fallback"} else "fallback")
    history = synthesise_history()
    master = pd.concat([history, live], ignore_index=True)
    master = clean_quotes(master)
    master["source"] = master["source"].fillna("historical")
    master = master.sort_values(["date", "route", "lead_days", "total_fare"]).reset_index(drop=True)
    return master


def run_pipeline(
    raw_path: Path = RAW_PATH,
    master_path: Path = MASTER_PATH,
    force_fallback: bool = False,
) -> pd.DataFrame:
    """Full pipeline execution: returns the master frame and writes CSV."""
    master = build_master(raw_path=raw_path, force_fallback=force_fallback)
    master_path.parent.mkdir(parents=True, exist_ok=True)
    master.to_csv(master_path, index=False)
    return master


def main() -> int:
    parser = argparse.ArgumentParser(description="APIx cleaning + history merge")
    parser.add_argument("--fallback-only", action="store_true", help="skip live scrape entirely")
    parser.add_argument("--raw", default=str(RAW_PATH))
    parser.add_argument("--out", default=str(MASTER_PATH))
    args = parser.parse_args()

    master = run_pipeline(Path(args.raw), Path(args.out), force_fallback=args.fallback_only)
    print(f"[pipeline] wrote {len(master)} rows -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
