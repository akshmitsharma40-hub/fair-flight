#!/usr/bin/env python3
"""provenance.py — reproducibility metadata for every FAIR FLIGHT figure.

NSO-grade publications carry provenance: *which* data vintage produced a
number, *which* model estimated it, and *which* code revision rendered it.
This module assembles that chain from the artifacts on disk and the runtime
environment, so the dashboard can stamp every chart with a verifiable badge.

Everything degrades gracefully: a missing artifact yields ``null`` + a note,
never an error — the badge shows what is knowable at render time.
"""

from __future__ import annotations

import hashlib
import json
import os
import platform
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

BACKEND = Path(__file__).resolve().parent

ARTIFACTS: dict[str, str] = {
    "data_scraped_raw.csv": "scraper output (raw fare quotes)",
    "data_master.csv": "cleaned master fare matrix",
    "daily_index.csv": "published Laspeyres series",
    "forecast.json": "ARIMA fits per scope",
}

ENGINES: dict[str, str] = {
    "scraper.py": "async Playwright collector + synthetic fallback",
    "pipeline.py": "cleaning / best-economy isolation / outlier filter",
    "index_engine.py": "Laspeyres aggregation, Base 2024=100",
    "forecast_engine.py": "ARIMA(p,1,q) via Hannan-Rissanen",
    "analytics_engine.py": "backtest / decomposition / policy sim / ATF / companion",
    "atf_feed.py": "real PPAC/IOCL Delhi notified ATF prices",
}


def _sha256(path: Path, head_bytes: int = 262_144) -> str | None:
    """Cheap content fingerprint: first 256 KB, hex-encoded (16 chars shown)."""
    try:
        with path.open("rb") as fh:
            digest = hashlib.sha256(fh.read(head_bytes)).hexdigest()
        return digest[:16]
    except OSError:
        return None


def _git_sha() -> dict[str, Any]:
    """Resolve the running code revision; null when not a git checkout."""
    try:
        sha = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=BACKEND, capture_output=True, text=True, timeout=5, check=True,
        ).stdout.strip()
        dirty = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=BACKEND, capture_output=True, text=True, timeout=5, check=True,
        ).stdout.strip()
        return {"sha": sha[:12], "full": sha, "dirty": bool(dirty)}
    except (OSError, subprocess.SubprocessError):
        return {"sha": None, "full": None, "dirty": None,
                "note": "not a git checkout — provenance anchored to artifact hashes instead"}


def _artifact_entry(path: Path) -> dict[str, Any]:
    entry: dict[str, Any] = {"path": path.name}
    try:
        stat = path.stat()
        entry["mtimeUtc"] = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
        entry["sizeBytes"] = stat.st_size
        entry["sha256Head"] = _sha256(path)
        try:
            import pandas as pd
            if path.suffix == ".csv":
                frame = pd.read_csv(path)
                entry["rows"] = int(len(frame))
                if "date" in frame.columns:
                    entry["firstDate"] = str(frame["date"].iloc[0])
                    entry["lastDate"] = str(frame["date"].iloc[-1])
        except Exception:
            pass
    except OSError:
        entry["missing"] = True
        entry["note"] = "artifact not present — regenerate with the pipeline commands"
    return entry


def _forecast_meta() -> dict[str, Any] | None:
    """Read the ARIMA fit metadata from forecast.json, if present."""
    path = BACKEND / "forecast.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    national = payload.get("NATIONAL") or (payload.get("models", {}) or {}).get("NATIONAL")
    if national is None and "model" in payload:
        national = payload  # forecast.json root IS the NATIONAL fit payload
    if not national:
        # forecast.json shapes vary; surface the top-level keys honestly.
        return {"keys": sorted(payload.keys())[:8], "note": "unrecognised layout — keys listed"}
    model = national.get("model") or national
    return {
        "family": model.get("family"),
        "order": model.get("order"),
        "aic": model.get("aic"),
        "nObs": model.get("nObs") or model.get("n_obs"),
        "estimator": model.get("estimator"),
        "selection": model.get("selection"),
    }


def build_provenance() -> dict[str, Any]:
    """The full reproducibility chain for the dashboard badge."""
    artifacts = {name: _artifact_entry(BACKEND / name) for name in ARTIFACTS}
    index = artifacts["daily_index.csv"]

    return {
        "generatedAtUtc": datetime.now(tz=timezone.utc).isoformat(),
        "code": _git_sha(),
        "dataVintages": artifacts,
        "seriesMeta": {
            "name": "APIx — National Airfare Price Index",
            "method": "Fixed-basket Laspeyres",
            "baseYear": "2024",
            "baseAnchor": 100.0,
            "coicop": "07.3.1.2 Passenger transport by air",
            "corridors": ["DEL-BOM", "DEL-BLR", "BOM-BLR", "BLR-HYD", "DEL-CCU"],
            "routeWeights": [0.35, 0.25, 0.20, 0.10, 0.10],
            "windowWeights": [0.15, 0.35, 0.50],
            "indexCoverage": None if index.get("missing") else
                {"first": index.get("firstDate"), "last": index.get("lastDate"), "rows": index.get("rows")},
        },
        "model": _forecast_meta(),
        "engines": ENGINES,
        "runtime": {
            "python": platform.python_version(),
            "platform": platform.platform(terse=True),
        },
        "atfFeed": {
            "publisher": "IOCL/BPCL/HPCL via PPAC (MoPNG)",
            "series": "ATF Delhi (IOCL depot) — official monthly notified price",
            "note": "embedded source-cited table; optional live refresh via ATF_FEED_URL",
        },
    }


if __name__ == "__main__":
    print(json.dumps(build_provenance(), indent=2, ensure_ascii=False))
