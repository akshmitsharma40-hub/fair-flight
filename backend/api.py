#!/usr/bin/env python3
"""api.py — Institutional FastAPI surface for NSO / RBI / MoSPI consumption.

Endpoints (e-Sankhyiki-style):
  GET  /api/v1/apix/latest              → today's index + COICOP-2018 metadata
  GET  /api/v1/apix/history?days=30     → historical observations
       (also accepts ?Format=JSON, mirroring e-Sankhyiki parameter casing)
  GET  /api/v1/apix/csv                 → raw daily_index.csv download
  POST /api/v1/webhooks/register        → register a push target for NSO feeds
  GET  /health                          → liveness probe

Every index response carries COICOP-2018 metadata
("Division 07: Transport" → 07.3.1.2 Passenger transport by air).
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import io
import json
import os
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import pandas as pd
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from analytics_engine import (
    atf_correlation,
    backtest,
    companion_indices,
    seasonal_decompose,
    simulate_policy,
    yoy,
)
import auth as auth_module
from auth import (
    authenticate,
    bearer_from_header,
    create_user,
    ensure_demo_account,
    issue_token,
    public_profile,
)
from forecast_engine import build_forecast_payload
from pdf_bulletin import build_bulletin_pdf
from index_engine import (
    INDEX_PATH,
    BASE_ANCHOR,
    history_payload,
    latest_payload,
    run_index,
)

IST = timezone(timedelta(hours=5, minutes=30))

API_VERSION = "1.0.0"
CSV_PATH = INDEX_PATH

# Registered webhook targets (in-memory registry — swap for Postgres in prod)
_webhook_registry: dict[str, dict[str, Any]] = {}

# Webhook delivery log (latest first) + signing key (set WEBHOOK_SECRET in prod)
_delivery_log: deque[dict[str, Any]] = deque(maxlen=100)
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "apix-demo-signing-key")

# Demo keys: `demo` (public tier, 240 req/min) and `nso-institutional` (600/min).
# The dashboard fires ~12 parallel calls per load, so the anonymous tier must
# absorb a dashboard session, not just a single curl. Production would persist
# these; a dict keeps the PoC self-contained.
API_KEYS: dict[str, dict[str, Any]] = {
    "demo": {"tier": "public", "rate": 240},
    "nso-institutional": {"tier": "institutional", "rate": 600},
}
RATE_LIMIT_WINDOW_S = 60.0
_request_log: dict[str, deque[float]] = defaultdict(lambda: deque())

app = FastAPI(
    title="APIx Institutional API",
    version=API_VERSION,
    description=(
        "Real-time Laspeyres Airfare Price Index (APIx) for CPI augmentation. "
        "COICOP-2018 Division 07 (Transport) · Base Year 2024=100."
    ),
)

app.add_middleware(
    CORSMiddleware,
    # Deployed frontends are injected via CORS_ORIGINS (comma-separated);
    # "*" keeps local/demo use zero-config (the API is public-read anyway).
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=False,
    allow_methods=["GET", "POST", "HEAD", "OPTIONS"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# API-key + rate-limit middleware
# ---------------------------------------------------------------------------


@app.middleware("http")
async def rate_limit_middleware(request, call_next):
    """Per-key sliding-window rate limiter (X-API-Key header, optional).

    Unauthenticated requests share the public tier's budget; requests bearing a
    known key get that key's tier budget. 429s include Retry-After.
    """
    # The SSE stream is long-lived (one connection, not a request storm) and
    # EventSource auto-reconnects — never rate-limit it.
    if request.url.path.startswith("/api/") and not request.url.path.endswith("/stream"):
        # Signed-in accounts (Authorization: Bearer) get their tier's budget;
        # plain API keys and anonymous callers fall back to the static tiers.
        bearer = bearer_from_header(request.headers.get("Authorization"))
        api_key = request.headers.get("X-API-Key", "")
        if api_key and api_key not in API_KEYS:
            return JSONResponse(status_code=401, content={"detail": "Unknown API key"})
        if bearer:
            limit = API_KEYS["nso-institutional"]["rate"] if bearer.get("tier") == "institutional" else API_KEYS["demo"]["rate"]
        else:
            limit = API_KEYS[api_key]["rate"] if api_key else API_KEYS["demo"]["rate"]
        bucket = _request_log[f"bearer:{bearer['sub']}" if bearer else (api_key or "anonymous")]
        now = time.monotonic()
        while bucket and bucket[0] <= now - RATE_LIMIT_WINDOW_S:
            bucket.popleft()
        if len(bucket) >= limit:
            retry_after = int(RATE_LIMIT_WINDOW_S - (now - bucket[0])) + 1
            return JSONResponse(
                status_code=429,
                content={"detail": f"Rate limit {limit}/min exceeded for tier"},
                headers={"Retry-After": str(retry_after)},
            )
        bucket.append(now)
    return await call_next(request)


# ---------------------------------------------------------------------------
# Webhook models
# ---------------------------------------------------------------------------

class WebhookRegistration(BaseModel):
    target_url: str = Field(..., description="HTTPS endpoint that will receive NSO data pushes")
    event: str = Field(
        default="apix.daily_publish",
        description="Event type to subscribe to (apix.daily_publish, apix.anomaly)",
    )
    contact_email: Optional[str] = Field(
        default=None,
        pattern=r"^[\w.+-]+@[\w-]+\.[\w.-]+$",
        description="Optional ops contact for delivery failures",
    )


class WebhookAck(BaseModel):
    status: str
    message: str
    webhook_id: str
    target_url: str
    event: str
    registered_at: str


_INDEX_CACHE: Optional[pd.DataFrame] = None


def _index_frame() -> pd.DataFrame:
    """Compute (or load) the daily index frame.

    Cached per process: the frame is a pure function of the committed CSV
    artifacts, so every endpoint (latest/history/forecast/analytics) shares one
    computation instead of re-running the full Laspeyres engine per request.
    The first call takes ~3s; subsequent calls are effectively free.
    """
    global _INDEX_CACHE
    if _INDEX_CACHE is None:
        _INDEX_CACHE = run_index()
    return _INDEX_CACHE


# ---------------------------------------------------------------------------
# Core index endpoints
# ---------------------------------------------------------------------------

@app.get("/api/v1/apix/latest")
def get_latest() -> dict:
    """Current day's index, DoD shift, basket price, and COICOP metadata."""
    return latest_payload(_index_frame())


@app.get("/api/v1/apix/history")
def get_history(
    days: int = Query(30, ge=1, le=365, description="Number of trailing observations"),
    Format: str = Query("JSON", description="e-Sankhyiki-style format flag (JSON or CSV)"),
):
    """Historical time-series for NSO consumption (JSON or CSV)."""
    frame = _index_frame()
    if Format.upper() == "CSV":
        buffer = io.StringIO()
        frame.tail(days).to_csv(buffer, index=False)
        return Response(
            content=buffer.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="apix_history.csv"'},
        )
    return JSONResponse(content=history_payload(frame, days=days))


@app.get("/api/v1/apix/forecast")
def get_forecast(
    scope: str = Query("NATIONAL", description="NATIONAL or a corridor id (DEL-BOM, DEL-BLR, BOM-BLR, BLR-HYD, DEL-CCU)"),
    horizon: int = Query(7, ge=1, le=30, description="Forecast horizon in days"),
):
    """ARIMA(p,1,q) projection with 95% prediction intervals.

    Model is estimated from the published series (Hannan-Rissanen, AIC-selected
    order) — replaces the earlier simulated projection for NSO consumption.
    """
    try:
        return JSONResponse(content=build_forecast_payload(scope.upper(), horizon))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=f"data artifacts missing: {exc}") from exc


# ---------------------------------------------------------------------------
# Analytics suite (research panels)
# ---------------------------------------------------------------------------

@app.get("/api/v1/apix/backtest")
def get_backtest(
    scope: str = Query("NATIONAL", description="NATIONAL or a corridor id"),
):
    """Walk-forward ARIMA evaluation: MAE / RMSE / MAPE + 95% band coverage."""
    try:
        return JSONResponse(content=backtest(scope.upper()))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/v1/apix/seasonal")
def get_seasonal(
    scope: str = Query("NATIONAL"),
):
    """Classical decomposition: trend / weekly-seasonal / residual + strength."""
    try:
        return JSONResponse(content=seasonal_decompose(scope.upper()))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/v1/apix/policy-sim")
def get_policy_sim(
    atf_pct: float = Query(0.0, ge=-50, le=50, description="ATF price shock, %"),
    demand_pct: float = Query(0.0, ge=-50, le=50, description="Demand shock, %"),
    gst_pp: float = Query(0.0, ge=-10, le=10, description="GST/levy change, percentage points"),
    horizon: int = Query(14, ge=7, le=30),
    scope: str = Query("NATIONAL"),
):
    """Policy scenario fed through the ARIMA path + headline-CPI pass-through."""
    try:
        return JSONResponse(
            content=simulate_policy(atf_pct, demand_pct, gst_pp, horizon, scope.upper())
        )
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/v1/apix/atf-correlation")
def get_atf_correlation(scope: str = Query("NATIONAL")):
    """ATF-fare co-movement (Pearson r + OLS beta) on the trailing window."""
    try:
        return JSONResponse(content=atf_correlation(scope.upper()))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/v1/apix/companion-indices")
def get_companion_indices(days: int = Query(90, ge=30, le=420)):
    """Laspeyres vs Paasche vs Fisher — substitution-bias comparison."""
    return JSONResponse(content=companion_indices(days))


@app.get("/api/v1/apix/provenance")
def get_provenance():
    """Reproducibility chain: code revision, data vintages, model meta.

    The dashboard stamps charts with this — NSO-grade provenance for every
    published figure. Cache headers: the payload changes only when artifacts
    or code change, so a short client cache is safe.
    """
    from provenance import build_provenance

    payload = build_provenance()
    return JSONResponse(content=payload, headers={"Cache-Control": "max-age=60"})


@app.get("/api/v1/apix/atf-feed")
def get_atf_feed():
    """The real ATF feed itself: monthly notified prices + provenance."""
    from atf_feed import get_atf_series, latest_atf

    series = get_atf_series()
    return JSONResponse(
        content={"latest": latest_atf(), "meta": series["meta"], "records": series["records"]},
        headers={"Cache-Control": "max-age=3600"},
    )


@app.get("/api/v1/apix/yoy")
def get_yoy(scope: str = Query("NATIONAL")):
    """Year-over-year change on the extended (backfilled) window."""
    try:
        return JSONResponse(content=yoy(scope.upper()))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
def get_csv() -> Response:
    """Serve the canonical daily_index.csv artifact."""
    if CSV_PATH.exists():
        content = CSV_PATH.read_text(encoding="utf-8")
    else:
        buffer = io.StringIO()
        _index_frame().to_csv(buffer, index=False)
        content = buffer.getvalue()
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="daily_index.csv"'},
    )


# ---------------------------------------------------------------------------
# Webhook registration (event-driven NSO data pushes)
# ---------------------------------------------------------------------------

@app.post("/api/v1/webhooks/register", response_model=WebhookAck, status_code=201)
def register_webhook(registration: WebhookRegistration) -> WebhookAck:
    """Register a push target for event-driven NSO data dissemination."""
    if not registration.target_url.lower().startswith("https://"):
        raise HTTPException(status_code=422, detail="target_url must be an HTTPS endpoint")

    webhook_id = f"wh_{abs(hash(registration.target_url + registration.event)) % 10**10:010d}"
    registered_at = datetime.now(IST).strftime("%Y-%m-%dT%H:%M:%S%z")
    _webhook_registry[webhook_id] = {
        "target_url": registration.target_url,
        "event": registration.event,
        "contact_email": registration.contact_email,
        "registered_at": registered_at,
    }
    return WebhookAck(
        status="success",
        message=(
            f"Webhook registered for event '{registration.event}'. "
            "APIx daily publications will be pushed to your endpoint."
        ),
        webhook_id=webhook_id,
        target_url=registration.target_url,
        event=registration.event,
        registered_at=registered_at,
    )


@app.get("/api/v1/webhooks")
def list_webhooks() -> dict:
    """Ops view of registered push targets."""
    return {"count": len(_webhook_registry), "webhooks": list(_webhook_registry.values())}


# ---------------------------------------------------------------------------
# Real-time SSE stream — live index ticks for dashboard ribbons
# ---------------------------------------------------------------------------

from fastapi.responses import StreamingResponse


def _latest_snapshot() -> dict:
    return latest_payload(_index_frame())


@app.get("/api/v1/apix/stream")
async def stream_index(
    interval: float = Query(10.0, ge=2.0, le=120.0, description="Seconds between ticks"),
):
    """Server-Sent Events stream of the latest index (live ribbon feed)."""

    async def event_gen():
        last_payload = None
        while True:
            try:
                snapshot = _latest_snapshot()
                if snapshot != last_payload:  # only push on change
                    last_payload = snapshot
                    yield f"event: apix.tick\ndata: {json.dumps(snapshot)}\n\n"
                else:
                    yield ": keepalive\n\n"
            except Exception:  # noqa: BLE001 — stream must survive data hiccups
                yield ": error\n\n"
            await asyncio.sleep(interval)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Webhook delivery engine — HMAC-signed POSTs + ops delivery log
# ---------------------------------------------------------------------------


def _hmac_signature(body: bytes, secret: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


async def _deliver_webhook(entry: dict[str, Any], payload: dict[str, Any]) -> None:
    """POST a signed payload to one registered target, logging the outcome."""
    body = json.dumps(payload).encode()
    signature = _hmac_signature(body, WEBHOOK_SECRET)
    try:  # httpx is a FastAPI/transitive dependency
        import httpx

        async with httpx.AsyncClient(timeout=6.0) as client:
            response = await client.post(
                entry["target_url"],
                content=body,
                headers={"Content-Type": "application/json", "X-APIx-Signature": signature},
            )
            ok = response.status_code < 400
            status_code = response.status_code
    except Exception as exc:  # noqa: BLE001 — delivery errors land in the log
        ok, status_code = False, str(exc)[:120]
    _delivery_log.appendleft(
        {
            "webhookId": entry.get("webhook_id", "?"),
            "targetUrl": entry["target_url"],
            "event": entry["event"],
            "ok": ok,
            "statusCode": status_code,
            "signature": signature[:19] + "…",
            "at": datetime.now(IST).strftime("%Y-%m-%dT%H:%M:%S%z"),
        }
    )


async def fire_event(event: str, payload: dict[str, Any]) -> int:
    """Fan a signed push out to every subscriber of `event`; returns deliveries."""
    targets = [e for e in _webhook_registry.values() if e["event"] == event]
    await asyncio.gather(*(_deliver_webhook(e, payload) for e in targets))
    return len(targets)


@app.post("/api/v1/webhooks/test")
async def test_webhooks(event: str = Query("apix.anomaly")):
    """Fire a signed test push to all subscribers (ops smoke-test)."""
    payload = {
        "event": event,
        "firedAt": datetime.now(IST).strftime("%Y-%m-%dT%H:%M:%S%z"),
        "sample": _latest_snapshot(),
    }
    deliveries = await fire_event(event, payload)
    return {
        "status": "fired",
        "event": event,
        "deliveries": deliveries,
        "signingHeader": "X-APIx-Signature: sha256=… (HMAC of body with WEBHOOK_SECRET)",
    }


@app.get("/api/v1/webhooks/deliveries")
def webhook_deliveries() -> dict:
    """Delivery log for the ops telemetry panel (latest first)."""
    return {"count": len(_delivery_log), "deliveries": list(_delivery_log)}


# ---------------------------------------------------------------------------
# Accounts + sign-in (FAIR FLIGHT institutional access)
# ---------------------------------------------------------------------------

class AuthRegister(BaseModel):
    email: str = Field(..., description="Account email (gov.in / nic.in domains get the institutional tier)")
    password: str = Field(..., min_length=8, description="Password (min 8 chars)")
    organisation: Optional[str] = Field(default=None, description="Optional organisation name")


class AuthLogin(BaseModel):
    email: str
    password: str


@app.post("/api/v1/auth/register", status_code=201)
def auth_register(registration: AuthRegister) -> dict:
    """Create an account. gov.in / nic.in emails are tiered institutional."""
    try:
        profile = create_user(registration.email, registration.password, registration.organisation)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    token = issue_token(profile["email"], profile["tier"])
    return {"status": "created", "token": token, "account": profile}


@app.post("/api/v1/auth/login")
def auth_login(credentials: AuthLogin) -> dict:
    """Sign in → HMAC bearer token (12h) + account profile."""
    try:
        record = authenticate(credentials.email, credentials.password)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    token = issue_token(record["email"], record["tier"])
    return {
        "status": "signed_in",
        "token": token,
        "tokenType": "bearer",
        "expiresIn": 12 * 3600,
        "account": public_profile(record),
    }


@app.get("/api/v1/auth/me")
def auth_me(authorization: Optional[str] = Header(default=None)) -> dict:
    """Current account profile from a bearer token."""
    payload = bearer_from_header(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="invalid or expired token")
    users = auth_module._load_users()
    record = users.get(payload.get("sub", ""))
    if not record:
        raise HTTPException(status_code=404, detail="account no longer exists")
    return {"account": public_profile(record)}


# ---------------------------------------------------------------------------
# PDF bulletin — one-click institutional publication
# ---------------------------------------------------------------------------

@app.get("/api/v1/apix/bulletin.pdf")
def get_bulletin() -> Response:
    """Render the monthly APIx bulletin as a print-ready PDF.

    A dependency-free PDF writer (helvetica, inline JPEG-free vector shapes)
    keeps the PoC installable anywhere — no wkhtmltopdf/weasyprint needed.
    """
    frame = _index_frame().tail(30)
    latest = latest_payload(frame)
    content = build_bulletin_pdf(latest, frame)
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="apix_bulletin.pdf"'},
    )


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "series": "APIx",
        "version": API_VERSION,
        "registeredWebhooks": len(_webhook_registry),
        "coicop": "07.3.1.2 — Passenger transport by air",
        "baseAnchor": BASE_ANCHOR,
    }


# Bootstrap the demo account on first boot.
ensure_demo_account()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=False)
