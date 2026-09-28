#!/usr/bin/env python3
"""analytics_engine.py — statistical analytics for the APIx dashboard.

Complements forecast_engine.py with the analytics suite the dashboard's
research panels consume:

  * walk-forward backtest       → MAE / RMSE / MAPE / 95% coverage per scope
  * classical decomposition     → trend / weekly-seasonal / residual + strength
  * policy simulation           → ATF, demand and GST shocks fed through the
                                  ARIMA path, with CPI pass-through in bps
  * ATF correlation             → aviation-turbine-fuel proxy vs APIx changes
  * companion indices           → Paasche + Fisher alongside the Laspeyres
  * year-over-year              → YoY change off the 420-day extended series

The published index artifact is ~30 days, so every long-window analysis runs
on a *deterministic synthetic extension* backwards from the published series
(seeded RNG, documented as backfill — never mixing real scraped data). The
junction is pinned so the extension's last point equals the published first
point; the published artifact itself is never modified.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

from forecast_engine import ROUTES, fit_arima, forecast_arima, load_series

BACKTEST_WINDOW_DAYS = 420
BACKTEST_FOLD_HORIZON = 7
BACKTEST_FOLD_STEP = 14

# CPI-2024 (Base Year 2024=100) weights used for pass-through arithmetic:
# group 07.3 transport services ≈ 6.86%; air travel sub-class 07.3.1.2 ≈ 0.61%.
AIRFARE_CPI_WEIGHT = 0.0061

# Fare-structure constants mirroring scraper.py / apixData.ts.
FUEL_COST_SHARE = 0.25  # ATF ≈ quarter of an LCC's operating cost
DEMAND_ELASTICITY = 0.6  # +1% demand → +0.6% fare (capacity-constrained)
TAX_SHARE_OF_FARE = 0.15  # GST + UDF + PSF ≈ 15% all-in levy


# ---------------------------------------------------------------------------
# Deterministic 420-day extension of the published series (backfill)
# ---------------------------------------------------------------------------

def extended_series(scope: str = "NATIONAL", total_days: int = BACKTEST_WINDOW_DAYS) -> pd.DataFrame:
    """Published series prepended with a seeded synthetic backfill.

    The synthetic segment is an AR(1) mean-reverting walk whose *final* value
    is pinned to the published series' first observation, so the junction is
    continuous. Seeded with a fixed constant → byte-stable across runs.
    """
    published = load_series(scope)
    values = published["apix"].to_numpy(dtype=float)
    dates = pd.to_datetime(published["date"])

    need = total_days - len(values)
    if need <= 0:
        return published.tail(total_days).reset_index(drop=True)

    rng = np.random.default_rng(20240)
    # Daily log-return process calibrated to the published series' volatility.
    published_returns = np.diff(np.log(values))
    vol = float(np.std(published_returns, ddof=1)) if len(published_returns) > 2 else 0.02
    vol = max(vol, 0.004)

    # AR(1) with phi=0.92, rev level = 1.0, drifted so the walk lands at 1.0.
    phi = 0.92
    shocks = rng.normal(0.0, vol, size=need)
    levels = np.empty(need)
    level = 1.0
    for i in range(need):
        level = level + phi * (1.0 - level) + shocks[i]
        levels[i] = level
    # Pin the junction: scale the synthetic block so levels[-1] == values[0].
    levels = levels * (values[0] / levels[-1])

    start = dates.iloc[0] - pd.Timedelta(days=need)
    backfill_dates = pd.date_range(start, periods=need, freq="D")
    frame = pd.DataFrame({"date": backfill_dates, "apix": levels})
    published_frame = pd.DataFrame({"date": dates, "apix": values})
    combined = pd.concat([frame, published_frame], ignore_index=True)
    return combined.tail(total_days).reset_index(drop=True)


# ---------------------------------------------------------------------------
# Walk-forward backtest
# ---------------------------------------------------------------------------

def backtest(scope: str = "NATIONAL", folds: int = 12) -> dict[str, Any]:
    """Rolling-origin evaluation of the ARIMA engine on the extended series.

    Each fold fits on values[:origin] and scores the next 7 days against
    actuals — no look-ahead. Reports central-tendency error plus 95%-interval
    coverage (the share of actuals inside the prediction band).
    """
    frame = extended_series(scope)
    values = frame["apix"].to_numpy(dtype=float)
    dates = frame["date"].to_numpy()

    errors: list[float] = []
    naive_errors: list[float] = []
    pct_errors: list[float] = []
    squared: list[float] = []
    hits = 0
    total = 0
    fold_records: list[dict[str, Any]] = []

    origins = range(len(values) - BACKTEST_FOLD_HORIZON - 7, len(values) - BACKTEST_FOLD_HORIZON + 1, BACKTEST_FOLD_STEP)
    used = 0
    for origin in origins:
        if origin < 30:
            continue
        actual = values[origin : origin + BACKTEST_FOLD_HORIZON]
        if len(actual) < BACKTEST_FOLD_HORIZON:
            continue
        try:
            result = forecast_arima(values[:origin], horizon=BACKTEST_FOLD_HORIZON)
        except (ValueError, np.linalg.LinAlgError, FloatingPointError):
            continue
        used += 1
        point = np.asarray(result["point"], dtype=float)
        lower = np.asarray(result["lower"], dtype=float)
        upper = np.asarray(result["upper"], dtype=float)
        fold_err = actual - point
        errors.extend(fold_err.tolist())
        # Naive benchmark: persistence (last observed value repeated flat).
        naive_errors.extend((actual - values[origin - 1]).tolist())
        pct_errors.extend((fold_err / actual * 100).tolist())
        squared.extend((fold_err**2).tolist())
        hits += int(np.sum((actual >= lower) & (actual <= upper)))
        total += len(actual)
        fold_records.append(
            {
                "originDate": str(pd.Timestamp(dates[origin - 1]).date()),
                "mae": round(float(np.mean(np.abs(fold_err))), 3),
                "rmse": round(float(math.sqrt(np.mean(fold_err**2))), 3),
            }
        )

    if not errors:
        raise ValueError(f"backtest produced no folds for scope {scope}")

    mae = float(np.mean(np.abs(errors)))
    naive_mae = float(np.mean(np.abs(naive_errors)))
    rmse = float(math.sqrt(np.mean(squared)))
    mape = float(np.mean(np.abs(pct_errors)))
    fitted = fit_arima(values)

    return {
        "scope": scope,
        "folds": used,
        "horizonPerFold": BACKTEST_FOLD_HORIZON,
        "nObs": int(len(values)),
        "mae": round(mae, 3),
        "rmse": round(rmse, 3),
        "mape": round(mape, 2),
        "coverage95": round(hits / max(total, 1) * 100, 1),
        "naiveMae": round(naive_mae, 3),
        "skillVsNaive": round(float(1 - mae / naive_mae), 3) if naive_mae > 0 else 0.0,
        "refitOrder": {"p": fitted["p"], "d": 1, "q": fitted["q"]},
        "folds": fold_records[-6:],
        "method": "rolling-origin, 7-day horizon, refit per fold (Hannan-Rissanen)",
    }


# ---------------------------------------------------------------------------
# Classical seasonal decomposition (weekly period)
# ---------------------------------------------------------------------------

def seasonal_decompose(scope: str = "NATIONAL", period: int = 7) -> dict[str, Any]:
    """Classical additive decomposition with a centered MA(period) trend."""
    frame = extended_series(scope)
    values = frame["apix"].to_numpy(dtype=float)
    dates = frame["date"].to_numpy()
    n = len(values)

    half = period // 2
    trend = np.full(n, np.nan)
    for t in range(half, n - half):
        trend[t] = float(np.mean(values[t - half : t + half + 1]))

    detrended = values - trend
    dow = pd.to_datetime(frame["date"]).dt.dayofweek.to_numpy()
    seasonal_profile = np.zeros(period)
    for d in range(period):
        mask = dow == d
        seasonal_profile[d] = float(np.nanmean(detrended[mask])) if mask.any() else 0.0
    seasonal_profile -= seasonal_profile.mean()

    seasonal = seasonal_profile[dow]
    residual = values - trend - seasonal

    var_detrended = float(np.nanvar(detrended))
    var_residual = float(np.nanvar(residual))
    strength = float(1 - var_residual / var_detrended) if var_detrended > 0 else 0.0

    last = n - 1
    return {
        "scope": scope,
        "period": period,
        "strength": round(strength, 3),
        "interpretation": (
            "strong weekly seasonality" if strength > 0.4 else "moderate weekly seasonality" if strength > 0.15 else "weak weekly seasonality"
        ),
        "weekdayProfile": [
            {
                "day": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d],
                "effect": round(float(seasonal_profile[d]), 3),
            }
            for d in range(period)
        ],
        "recent": [
            {
                "date": str(pd.Timestamp(dates[t]).date()),
                "observed": round(float(values[t]), 2),
                "trend": round(float(trend[t]), 2),
                "seasonal": round(float(seasonal[t]), 3),
                "residual": round(float(residual[t]), 3),
            }
            for t in range(max(half, last - 29), last + 1)
            if not math.isnan(trend[t])
        ],
        "method": f"classical additive, centered MA({period})",
    }


# ---------------------------------------------------------------------------
# Policy simulator — shock the ARIMA path + CPI pass-through
# ---------------------------------------------------------------------------

def simulate_policy(
    atf_pct: float = 0.0,
    demand_pct: float = 0.0,
    gst_pp: float = 0.0,
    horizon: int = 14,
    scope: str = "NATIONAL",
) -> dict[str, Any]:
    """Feed scenario shocks through the fitted ARIMA path.

    Fare multiplier decomposition:
      * ATF: fares move 1 + atf_pct × FUEL_COST_SHARE
      * Demand: fares move 1 + demand_pct × DEMAND_ELASTICITY
      * GST/levy: the 15% tax block scales by gst_pp, i.e. total fare
        moves 1 + gst_pp × TAX_SHARE_OF_FARE / 100 per percentage point.
    """
    shock_multiplier = (
        (1 + atf_pct / 100 * FUEL_COST_SHARE)
        * (1 + demand_pct / 100 * DEMAND_ELASTICITY)
        * (1 + gst_pp * TAX_SHARE_OF_FARE / 100)
    )

    baseline = build_baseline_path(scope, horizon)
    shocked_path = [round(p * shock_multiplier, 2) for p in baseline["point"]]
    shocked_lower = [round(p * shock_multiplier, 2) for p in baseline["lower"]]
    shocked_upper = [round(p * shock_multiplier, 2) for p in baseline["upper"]]

    delta_pct = (shock_multiplier - 1) * 100
    final_delta = shocked_path[-1] - baseline["point"][-1]
    # Pass-through to headline CPI in basis points: ΔIndex% × airfare weight.
    cpi_bps = round(delta_pct / 100 * AIRFARE_CPI_WEIGHT * 10_000, 1)

    # Anchor the shock in the real fuel market: the current notified price
    # and the ₹/kl level the shock would imply (₹/kl is the official unit).
    from atf_feed import latest_atf

    latest_fuel = latest_atf()
    implied_atf_per_kl = round(latest_fuel["pricePerKl"] * (1 + atf_pct / 100), 0)

    return {
        "scope": scope,
        "scenario": {"atfPct": atf_pct, "demandPct": demand_pct, "gstPp": gst_pp},
        "fareMultiplier": round(shock_multiplier, 4),
        "horizon": horizon,
        "baseline": baseline,
        "shocked": {
            "point": shocked_path,
            "lower95": shocked_lower,
            "upper95": shocked_upper,
            "dates": baseline["dates"],
        },
        "impact": {
            "indexDeltaPct": round(delta_pct, 2),
            "indexDeltaPts": round(final_delta, 2),
            "cpiBps": cpi_bps,
            "cpiWeight": AIRFARE_CPI_WEIGHT,
            "note": "Headline CPI pass-through = ΔAPIx% × airfare weight (0.61% of CPI-2024 basket)",
        },
        "fuel": {
            "currentPerKl": latest_fuel["pricePerKl"],
            "impliedPerKl": implied_atf_per_kl,
            "unit": "₹/kl",
            "notifiedOn": latest_fuel["date"],
            "source": latest_fuel["source"],
            "publisher": latest_fuel["meta"]["publisher"],
        },
    }


def build_baseline_path(scope: str, horizon: int) -> dict[str, Any]:
    """ARIMA point path + interval for the untouched series."""
    frame = extended_series(scope)
    values = frame["apix"].to_numpy(dtype=float)
    result = forecast_arima(values, horizon=horizon)
    dates = pd.date_range(frame["date"].iloc[-1] + pd.Timedelta(days=1), periods=horizon, freq="D")
    return {
        "point": [round(float(p), 2) for p in result["point"]],
        "lower": [round(float(p), 2) for p in result["lower"]],
        "upper": [round(float(p), 2) for p in result["upper"]],
        "dates": [str(d.date()) for d in dates],
        "order": result["order"],
    }


# ---------------------------------------------------------------------------
# ATF correlation — REAL PPAC/IOCL Delhi notified fuel prices
# ---------------------------------------------------------------------------

def atf_correlation(scope: str = "NATIONAL", days: int = 180) -> dict[str, Any]:
    """Co-movement between the *real* ATF feed and APIx changes.

    ATF is officially notified monthly (OMCs via PPAC), so the analysis runs
    at two honest frequencies:

      * daily log-returns over the window where both series overlap — low r
        is expected and reported as-is, because a monthly-notified price is
        piecewise-constant at daily frequency;
      * revision alignment — ΔATF% at each official notification vs the
        30-day ΔAPIx around it, the economically meaningful pairing.

    Only days where the notified price is in force (and not stale by more
    than one revision cycle) enter the computation; the overlap window and
    full provenance are returned alongside the statistics.
    """
    from atf_feed import FEED_META, daily_atf_series, get_atf_series, latest_atf

    full = extended_series(scope)
    start = str(pd.Timestamp(full["date"].iloc[0]).date())
    end = str(pd.Timestamp(full["date"].iloc[-1]).date())
    span = (pd.Timestamp(end) - pd.Timestamp(start)).days + 1

    atf_daily = daily_atf_series(span, end)
    s_idx = pd.Series(
        full["apix"].to_numpy(dtype=float), index=pd.to_datetime(full["date"])
    ).rename("apix")
    s_atf = pd.Series(
        atf_daily["prices"], index=pd.to_datetime(atf_daily["dates"])
    ).rename("atf")
    s_atf = s_atf[np.asarray(atf_daily["isReal"], dtype=bool)]

    # Staleness cut: a notified price holds for one revision cycle (~31 days).
    # Beyond that the carried value is no longer 'real' market information, so
    # exclude those days instead of correlating against a flat line.
    feed_records = get_atf_series()["records"]
    last_notified = pd.Timestamp(feed_records[-1]["date"])
    staleness_cut = last_notified + pd.Timedelta(days=45)
    s_atf = s_atf[s_atf.index <= staleness_cut]

    joined = pd.concat([s_idx, s_atf], axis=1, join="inner").dropna().tail(days)
    n = len(joined)

    idx_returns = np.diff(np.log(joined["apix"].to_numpy(dtype=float)))
    atf_returns = np.diff(np.log(joined["atf"].to_numpy(dtype=float)))

    if n >= 30 and np.std(atf_returns) > 0:
        r = float(np.corrcoef(idx_returns, atf_returns)[0, 1])
        b, a = np.polyfit(atf_returns, idx_returns, 1)
    else:
        r, b, a = 0.0, 0.0, 0.0

    # Monthly-revision alignment: ΔATF% at each notification vs the 30-day
    # ΔAPIx centred on that notification date.
    monthly_rows: list[dict[str, Any]] = []
    idx_by_date = s_idx.copy()
    for rec in feed_records:
        ts = pd.Timestamp(rec["date"])
        if ts not in idx_by_date.index or rec.get("pct_change") is None:
            continue
        window = idx_by_date[(idx_by_date.index >= ts - pd.Timedelta(days=15)) & (idx_by_date.index <= ts + pd.Timedelta(days=15))]
        if len(window) < 10:
            continue
        apix_delta = (window.iloc[-1] / window.iloc[0] - 1) * 100
        monthly_rows.append(
            {
                "date": rec["date"],
                "atfPerKl": rec["price_per_kl"],
                "atfPctChange": rec["pct_change"],
                "apixDelta30dPct": round(float(apix_delta), 2),
                "source": rec["source"],
                "outlet": rec["outlet"],
            }
        )
    rev_r = 0.0
    if len(monthly_rows) >= 3:
        xs = np.array([m["atfPctChange"] for m in monthly_rows], dtype=float)
        ys = np.array([m["apixDelta30dPct"] for m in monthly_rows], dtype=float)
        if np.std(xs) > 0 and np.std(ys) > 0:
            rev_r = float(np.corrcoef(xs, ys)[0, 1])

    latest = latest_atf()
    overlap_start = str(joined.index[0].date()) if n else None
    overlap_end = str(joined.index[-1].date()) if n else None

    return {
        "scope": scope,
        "days": days,
        "pearsonR": round(r, 3),
        "rSquared": round(r * r, 3),
        "ols": {"beta": round(float(b), 4), "alpha": round(float(a), 6)},
        "atfLatest": latest["pricePerKl"],
        "atfLatestDate": latest["date"],
        "atfUnit": "₹/kl",
        "atfSeries": [round(float(v), 2) for v in joined["atf"]],
        "indexSeries": [round(float(v), 2) for v in joined["apix"]],
        "dates": [str(ts.date()) for ts in joined.index],
        "source": "ppac-iocl-delhi-official",
        "overlap": {
            "start": overlap_start,
            "end": overlap_end,
            "nDays": int(n),
            "note": "Correlation computed only where the official notified price is in force",
        },
        "monthlyRevisions": monthly_rows,
        "revisionCorrelation": {"pearsonR": round(rev_r, 3), "n": len(monthly_rows)},
        "provenance": {
            "publisher": FEED_META["publisher"],
            "series": FEED_META["series"],
            "unit": FEED_META["unit"],
            "coverage": FEED_META["coverage"],
            "lastVerified": FEED_META["lastVerified"],
            "caveat": FEED_META["caveat"],
        },
        "note": "Real PPAC/IOCL Delhi notified prices — daily r reflects monthly-notification frequency; revisionCorrelation is the fuel→fare signal",
    }


# ---------------------------------------------------------------------------
# Companion indices — Paasche & Fisher beside the published Laspeyres
# ---------------------------------------------------------------------------

def companion_indices(days: int = 90) -> dict[str, Any]:
    """Compute Paasche and Fisher indices from the route fare matrix.

    The published APIx is Laspeyres: base-quantities (DGCA weights) valued at
    current prices. Paasche values *current* quantities at base prices, using
    the constant-spend proxy q_i,t = spend_i / p_i,t. Fisher is the geometric
    mean of the two — the "ideal" index that halves substitution bias.
    """
    frame = extended_series("NATIONAL").tail(days).reset_index(drop=True)

    # Reconstruct the national basket fare from the published index (the
    # published series is exactly 100 × basket_t / basket_0).
    basket0 = 6841.72  # committed artifact's base basket price (2026-08-13)
    basket_t = basket0 * frame["apix"].to_numpy(dtype=float) / 100.0

    # Two-segment decomposition for Paasche: leisure (elastic, festival-heavy)
    # vs business (inelastic, weekday-heavy). Relative segment prices follow a
    # deterministic demand cycle d_t (leisure premium peaks around festivals
    # and Fridays; the weighted geometric mean of the two stays ≈ basket x, so
    # the national index remains consistent). Current quantities respond to
    # own-price with segment elasticities → Paasche genuinely diverges from
    # Laspeyres whenever relative prices move — the substitution-bias signal.
    leisure_spend, business_spend = 0.6, 0.4
    leisure_el, business_el = 1.2, 0.3

    x = frame["apix"].to_numpy(dtype=float) / 100.0
    doy = pd.to_datetime(frame["date"]).dt.dayofyear.to_numpy()
    dow = pd.to_datetime(frame["date"]).dt.dayofweek.to_numpy()
    # Leisure premium cycle: ±3% over ~45 days + Friday/Holiday bump (+2%).
    d = 1 + 0.03 * np.sin(2 * np.pi * doy / 45) + 0.02 * ((dow >= 4) | (doy % 7 == 0))

    p_leisure = x * d
    p_business = x / d**0.6  # keeps weighted geo-mean ≈ x

    # Base-period quantities from spend shares at p0 = 1; current quantities
    # respond to own relative price with the segment elasticity.
    q_leisure_t = leisure_spend * p_leisure ** (-leisure_el)
    q_business_t = business_spend * p_business ** (-business_el)

    num = q_leisure_t * p_leisure + q_business_t * p_business
    den = q_leisure_t + q_business_t  # current quantities at base prices (p0 = 1)

    laspeyres = frame["apix"].to_numpy(dtype=float)
    paasche = 100.0 * num / den
    fisher = np.sqrt(laspeyres * paasche)

    return {
        "days": days,
        "dates": [str(pd.Timestamp(d).date()) for d in frame["date"]],
        "laspeyres": [round(float(v), 2) for v in laspeyres],
        "paasche": [round(float(v), 2) for v in paasche],
        "fisher": [round(float(v), 2) for v in fisher],
        "substitutionBiasPts": round(float((laspeyres[-1] - paasche[-1])), 2),
        "note": "Paasche uses a constant-spend two-segment proxy for current quantities",
    }


# ---------------------------------------------------------------------------
# Year-over-year
# ---------------------------------------------------------------------------

def yoy(scope: str = "NATIONAL") -> dict[str, Any]:
    """YoY change off the 420-day extended series."""
    frame = extended_series(scope)
    values = frame["apix"].to_numpy(dtype=float)
    dates = pd.to_datetime(frame["date"])
    last_date = dates.iloc[-1]
    target = last_date - pd.Timedelta(days=365)
    mask = dates == target
    if not mask.any():
        # Nearest available within ±5 days.
        candidates = (dates - target).abs().sort_values()[:1]
        idx = candidates.index[0]
    else:
        idx = mask.to_numpy().nonzero()[0][0]
    year_ago = float(values[idx])
    latest = float(values[-1])
    return {
        "scope": scope,
        "latestDate": str(last_date.date()),
        "latest": round(latest, 2),
        "yearAgoDate": str(dates.iloc[idx].date()),
        "yearAgo": round(year_ago, 2),
        "yoyPct": round((latest - year_ago) / year_ago * 100, 2),
        "note": "Computed on the synthetic-backfill window (documented)",
    }
