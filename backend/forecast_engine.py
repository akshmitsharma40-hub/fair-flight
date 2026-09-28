#!/usr/bin/env python3
"""forecast_engine.py — ARIMA-style statistical forecast for the APIx series.

Replaces the earlier simulated projection with a genuine ARIMA(p, 1, q) model
estimated from the committed data artifacts:

  * Scope ``NATIONAL`` fits the published Laspeyres series (daily_index.csv).
  * Per-route scopes fit that corridor's mean observed fare re-indexed to
    100 at the window start (data_master.csv).

Estimation is Hannan-Rissanen two-stage (long-autoregression residuals -> OLS
on the ARMA regression), with the (p, q) order selected by AIC over a small
grid, d = 1 (first differences) since the series is a drifting price index.
Forecast intervals use the exact ARMA ψ-weight impulse-response variance.
Everything is pure NumPy — no statsmodels dependency.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

BACKEND_DIR = Path(__file__).resolve().parent
MASTER_PATH = BACKEND_DIR / "data_master.csv"
INDEX_PATH = BACKEND_DIR / "daily_index.csv"

MAX_P = 3
MAX_Q = 2
D_ORDER = 1

ROUTES = ("DEL-BOM", "DEL-BLR", "BOM-BLR", "BLR-HYD", "DEL-CCU")


# ---------------------------------------------------------------------------
# Series preparation
# ---------------------------------------------------------------------------

def national_series(master_path: Path = MASTER_PATH, index_path: Path = INDEX_PATH) -> pd.DataFrame:
    """Published national Laspeyres series: date + apix (2024=100)."""
    if index_path.exists():
        frame = pd.read_csv(index_path, parse_dates=["date"])
        return frame[["date", "apix"]].sort_values("date").reset_index(drop=True)
    if not master_path.exists():
        raise FileNotFoundError(f"neither {index_path} nor {master_path} exists")
    master = pd.read_csv(master_path, parse_dates=["date"])
    daily = master.groupby("date", as_index=False)["total_fare"].mean()
    daily["apix"] = 100.0 * daily["total_fare"] / daily["total_fare"].iloc[0]
    return daily[["date", "apix"]].sort_values("date").reset_index(drop=True)


def route_series(route_id: str, master_path: Path = MASTER_PATH) -> pd.DataFrame:
    """Corridor series: date + mean fare re-indexed to 100 at window start."""
    if not master_path.exists():
        raise FileNotFoundError(f"{master_path} does not exist")
    master = pd.read_csv(master_path, parse_dates=["date"])
    subset = master[master["route"] == route_id]
    if subset.empty:
        raise ValueError(f"route {route_id} not present in {master_path}")
    daily = subset.groupby("date", as_index=False)["total_fare"].mean().sort_values("date")
    daily["apix"] = 100.0 * daily["total_fare"] / daily["total_fare"].iloc[0]
    return daily[["date", "apix"]].reset_index(drop=True)


def load_series(scope: str, master_path: Path = MASTER_PATH, index_path: Path = INDEX_PATH) -> pd.DataFrame:
    if scope == "NATIONAL":
        return national_series(master_path, index_path)
    if scope not in ROUTES:
        raise ValueError(f"unknown scope '{scope}'; expected NATIONAL or one of {ROUTES}")
    return route_series(scope, master_path)


# ---------------------------------------------------------------------------
# ARIMA machinery (pure NumPy)
# ---------------------------------------------------------------------------

def _ols_design(residuals: np.ndarray, y: np.ndarray, p: int, q: int, t0: int) -> tuple[np.ndarray, np.ndarray]:
    """Build the Hannan-Rissanen regression matrix for ARMA(p, q) on y.

    Rows run over t in [t0, n): intercept + AR lags of y + MA lags of the
    stage-1 residual series.
    """
    n = len(y)
    rows: list[np.ndarray] = []
    targets: list[float] = []
    for t in range(t0, n):
        row = [1.0]
        row.extend(y[t - lag] for lag in range(1, p + 1))
        row.extend(residuals[t - lag] for lag in range(1, q + 1))
        rows.append(row)
        targets.append(y[t])
    return np.asarray(rows), np.asarray(targets)


def _residual_variance(residuals: np.ndarray, n_effective: int, k: int) -> float:
    """Unbiased-style residual variance: SSR / (n_eff - k)."""
    denominator = max(n_effective - k, 1)
    return float(np.dot(residuals, residuals) / denominator)


ROOT_MARGIN = 1.05  # require |root| > 1 + margin for stationarity/invertibility


def _roots_outside_unit_circle(coefficients: list[float]) -> bool:
    """True when all roots of 1 + c1 z + ... + ck z^k lie outside |z| > margin."""
    if not coefficients:
        return True
    polynomial = [*reversed(coefficients), 1.0]  # numpy wants highest degree first
    roots = np.roots(polynomial)
    return bool(np.all(np.abs(roots) > ROOT_MARGIN))


def _long_ar_residuals(y: np.ndarray, p_long: int) -> np.ndarray:
    """Hannan-Rissanen stage 1: long AR(p_long) OLS fit -> residual series."""
    n = len(y)
    design = np.column_stack(
        [np.ones(n - p_long)] + [y[p_long - lag : n - lag] for lag in range(1, p_long + 1)]
    )
    targets = y[p_long:]
    coefficients, *_ = np.linalg.lstsq(design, targets, rcond=None)
    residuals = np.zeros(n)
    residuals[p_long:] = targets - design @ coefficients
    return residuals


def fit_arima(y: np.ndarray, max_p: int = MAX_P, max_q: int = MAX_Q, d: int = D_ORDER) -> dict[str, Any]:
    """Hannan-Rissanen ARIMA(p, d, q) fit with AIC order selection.

    Stage 1: fit a long AR(p*) by OLS and keep its residuals as proxies for
    the unobserved innovations. Stage 2: regress y_t on (1, y_{t-1..p},
    eps_{t-1..q}) by OLS. The (p, q) order minimises AIC on a common sample.
    """
    y = np.asarray(y, dtype=float)
    for _ in range(d):
        y = np.diff(y)

    n = len(y)
    if n < 12:
        raise ValueError("series too short to fit (need >= 12 observations after differencing)")

    p_long = min(10, max(2, n // 4))
    stage1 = _long_ar_residuals(y, p_long)

    candidates: list[dict[str, Any]] = []
    for p in range(max_p + 1):
        for q in range(max_q + 1):
            if p == 0 and q == 0:
                continue
            # Residual regressors eps_{t-1..t-q} exist once t - q >= p_long.
            t0 = max(p_long + q, p + 1, p_long + 1)
            if n - t0 <= p + q + 2:  # keep >= ~8 effective observations
                continue
            try:
                design, targets = _ols_design(stage1, y, p, q, t0)
                coefficients, *_ = np.linalg.lstsq(design, targets, rcond=None)

                # Enforce AR stationarity and MA invertibility — unconstrained
                # Hannan-Rissanen can land on explosive/anti-causal fits whose
                # forecast recursions diverge.
                ar_coefficients = [float(v) for v in coefficients[1 : 1 + p]]
                ma_coefficients = [float(v) for v in coefficients[1 + p : 1 + p + q]]
                if p > 0 and not _roots_outside_unit_circle([-c for c in ar_coefficients]):
                    continue  # AR poly: 1 - phi1 z - ... - phi_p z^p
                if q > 0 and not _roots_outside_unit_circle(ma_coefficients):
                    continue  # MA poly: 1 + theta1 z + ... + theta_q z^q

                residuals = targets - design @ coefficients

                k = p + q + 1
                sigma2 = _residual_variance(residuals, len(targets), k)
                aic = len(targets) * math.log(max(sigma2, 1e-12)) + 2 * k
                candidates.append(
                    {
                        "p": p,
                        "q": q,
                        "intercept": float(coefficients[0]),
                        "ar": ar_coefficients,
                        "ma": ma_coefficients,
                        "sigma2": sigma2,
                        "aic": aic,
                        "n_eff": int(len(targets)),
                    }
                )
            except (np.linalg.LinAlgError, ValueError, FloatingPointError):
                continue

    if candidates:
        best = min(candidates, key=lambda c: c["aic"])
    else:
        # Degenerate-dynamics fallback: random walk with drift — always
        # stationary in first differences, invertible, and well-behaved.
        differences = np.diff(y) if d == 1 else y - y.mean()
        best = {
            "p": 0,
            "q": 0,
            "intercept": float(differences.mean()),
            "ar": [],
            "ma": [],
            "sigma2": float(differences.var()),
            "aic": float("nan"),
            "n_eff": int(len(differences)),
            "fallback": "random-walk-with-drift",
        }
    best["d"] = d
    best["n_obs"] = int(n)
    return best


def _impulse_psi_squared(h: int, ar: list[float], ma: list[float]) -> float:
    """Sum of squared ψ-weights up to lag h for the differenced ARMA."""
    p, q = len(ar), len(ma)
    psi = [1.0]
    for j in range(1, h + 1):
        value = 0.0
        if j <= q:
            value += ma[j - 1]
        for lag in range(1, min(p, j) + 1):
            value += ar[lag - 1] * (psi[j - lag] if j - lag < len(psi) else 0.0)
        psi.append(value)
    return sum(w * w for w in psi[: h + 1])


def forecast_arima(
    y: np.ndarray,
    horizon: int = 7,
    max_p: int = MAX_P,
    max_q: int = MAX_Q,
    d: int = D_ORDER,
) -> dict[str, Any]:
    """Fit + forecast with 95% prediction intervals (normal quantile 1.96)."""
    model = fit_arima(np.asarray(y, dtype=float), max_p=max_p, max_q=max_q, d=d)
    series = np.asarray(y, dtype=float)
    for _ in range(model["d"]):
        series = np.diff(series)

    p, q = model["p"], model["q"]
    intercept, ar, ma = model["intercept"], model["ar"], model["ma"]

    # Recompute the one-step residual state over the full (differenced) series
    # with the final coefficients so the forecast recursion starts cleanly.
    n = len(series)
    residuals = np.zeros(n)
    for t in range(p, n):
        expected = intercept
        for lag in range(1, p + 1):
            expected += ar[lag - 1] * series[t - lag]
        for lag in range(1, q + 1):
            expected += ma[lag - 1] * residuals[t - lag]
        residuals[t] = series[t] - expected

    history = list(series)
    error_state = list(residuals[p:])
    forecasts: list[float] = []

    for _ in range(1, horizon + 1):
        expected = intercept
        for lag in range(1, p + 1):
            value = history[-lag] if lag <= len(history) else 0.0
            expected += ar[lag - 1] * value
        for lag in range(1, q + 1):
            value = error_state[-lag] if lag <= len(error_state) else 0.0
            expected += ma[lag - 1] * value
        error_state.append(0.0)  # future innovations have zero expectation
        history.append(expected)
        forecasts.append(expected)

    # For I(1) processes the h-step LEVEL error variance is the cumulative
    # impulse-response variance of the differenced ARMA: V_h = sigma^2 * sum
    # (psi_j^2, j = 0..h-1). Bounds are computed once per horizon on the level
    # scale — never by re-integrating per-step half-widths, which compounds
    # them linearly and blows the band up.
    psi_sums = [0.0]  # psi_sums[h] = sum_{j=0}^{h-1} psi_j^2
    running = 0.0
    for h in range(1, horizon + 1):
        running += _impulse_psi_squared(h - 1, ar, ma)
        psi_sums.append(running)

    def reattach(levels: list[float]) -> list[float]:
        out: list[float] = []
        last = float(np.asarray(y)[-1])
        for value in levels:
            last = last + value
            out.append(last)
        return out

    sigma = math.sqrt(max(model["sigma2"], 0.0))
    if model["d"] == 1:
        point = reattach(forecasts)
        lo = [point[h - 1] - 1.96 * sigma * math.sqrt(psi_sums[h]) for h in range(1, horizon + 1)]
        hi = [point[h - 1] + 1.96 * sigma * math.sqrt(psi_sums[h]) for h in range(1, horizon + 1)]
    else:  # pragma: no cover — d is fixed at 1 today
        point, lo, hi = forecasts, list(forecasts), list(forecasts)

    return {
        "order": {"p": model["p"], "d": model["d"], "q": model["q"]},
        "aic": round(model["aic"], 3),
        "sigma2": model["sigma2"],
        "n_obs": model["n_obs"],
        "point": point,
        "lower": lo,
        "upper": hi,
    }


# ---------------------------------------------------------------------------
# Payload assembly
# ---------------------------------------------------------------------------

def build_forecast_payload(scope: str = "NATIONAL", horizon: int = 7) -> dict[str, Any]:
    frame = load_series(scope)
    values = frame["apix"].to_numpy(dtype=float)
    result = forecast_arima(values, horizon=horizon)

    last_date = pd.Timestamp(frame["date"].iloc[-1])
    dates = [(last_date + pd.Timedelta(days=i)).strftime("%Y-%m-%d") for i in range(1, horizon + 1)]

    return {
        "scope": scope,
        "model": {
            "family": "ARIMA",
            "order": result["order"],
            "aic": result["aic"],
            "nObs": result["n_obs"],
            "estimator": "hannan-rissanen",
            "selection": "aic-grid p<=3, q<=2",
        },
        "anchorDate": str(frame["date"].iloc[-1].date()),
        "anchorApix": float(values[-1]),
        "horizon": horizon,
        "predictions": [
            {
                "date": date,
                "point": round(float(point), 2),
                "lower95": round(float(low), 2),
                "upper95": round(float(high), 2),
            }
            for date, point, low, high in zip(dates, result["point"], result["lower"], result["upper"])
        ],
        "coicop": {
            "division": "07",
            "divisionName": "Transport",
            "subClass": "07.3.1.2",
            "subClassName": "Passenger transport by air",
            "framework": "COICOP-2018",
            "baseYear": "2024",
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="ARIMA forecast for the APIx series")
    parser.add_argument("--scope", default="NATIONAL", choices=("NATIONAL", *ROUTES))
    parser.add_argument("--horizon", type=int, default=7)
    parser.add_argument("--all", action="store_true", help="write forecasts for every scope")
    parser.add_argument("--out", default=str(BACKEND_DIR / "forecast.json"))
    args = parser.parse_args()

    scopes = ("NATIONAL", *ROUTES) if args.all else (args.scope,)
    payloads = {scope: build_forecast_payload(scope, args.horizon) for scope in scopes}

    out_path = Path(args.out)
    out_path.write_text(json.dumps(payloads if args.all else payloads[args.scope], indent=2), encoding="utf-8")

    for scope, payload in payloads.items():
        order = payload["model"]["order"]
        first = payload["predictions"][0]
        last = payload["predictions"][-1]
        print(
            f"[forecast] {scope}: ARIMA({order['p']},{order['d']},{order['q']}) "
            f"AIC={payload['model']['aic']} -> {payload['anchorDate']} {payload['anchorApix']:.2f} "
            f"=> {last['date']} {last['point']:.2f} [{last['lower95']:.2f}, {last['upper95']:.2f}]"
        )
    print(f"[forecast] wrote {out_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except FileNotFoundError as exc:
        print(f"[forecast] {exc}; run pipeline.py + index_engine.py first", file=sys.stderr)
        raise SystemExit(1)
