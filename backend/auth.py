#!/usr/bin/env python3
"""auth.py — accounts + HMAC bearer tokens for FAIR FLIGHT.

Self-contained auth for the PoC (no external identity provider):

  * PBKDF2-SHA256 password hashing (per-user salt, 200k iterations)
  * Stateless bearer tokens: base64url(JSON payload) + "." + HMAC-SHA256
    signature — the same signing machinery as the webhooks, so the demo has
    exactly one crypto story.
  * Tiers: "public" (default 240 req/min) and "institutional" (600/min).
  * Accounts persist to auth_users.json next to the code (demo-grade
    durability); production would swap this for a DB + identity provider.

Endpoints (wired in api.py):
  POST /api/v1/auth/register  {email, password, organisation?} → account
  POST /api/v1/auth/login     {email, password} → {token, tier, expiresIn}
  GET  /api/v1/auth/me        (Authorization: Bearer …) → account profile
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from pathlib import Path
from typing import Any, Optional

BACKEND_DIR = Path(__file__).resolve().parent
USERS_PATH = BACKEND_DIR / "auth_users.json"

TOKEN_TTL_S = 12 * 3600  # 12-hour sessions
PBKDF2_ITERATIONS = 200_000

# Signing key: WEBHOOK_SECRET by default so the whole API has one secret env.
TOKEN_SECRET = os.environ.get("WEBHOOK_SECRET", "apix-demo-signing-key")


# ---------------------------------------------------------------------------
# Password hashing (PBKDF2-SHA256)
# ---------------------------------------------------------------------------

def hash_password(password: str, salt: Optional[bytes] = None) -> str:
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, iterations, salt_hex, digest_hex = stored.split("$")
        if scheme != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations)
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


# ---------------------------------------------------------------------------
# Bearer tokens (base64url payload + HMAC-SHA256 signature)
# ---------------------------------------------------------------------------

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(text: str) -> bytes:
    padding = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + padding)


def issue_token(email: str, tier: str, ttl_s: int = TOKEN_TTL_S) -> str:
    payload = {"sub": email, "tier": tier, "exp": int(time.time()) + ttl_s}
    body = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    signature = _b64url(hmac.new(TOKEN_SECRET.encode(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{signature}"


def verify_token(token: str) -> Optional[dict[str, Any]]:
    """Return the token payload when valid and unexpired; None otherwise."""
    try:
        body, signature = token.split(".", 1)
        expected = _b64url(hmac.new(TOKEN_SECRET.encode(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            return None
        payload = json.loads(_b64url_decode(body))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except (ValueError, json.JSONDecodeError):
        return None


# ---------------------------------------------------------------------------
# Account store (JSON file — demo-grade persistence)
# ---------------------------------------------------------------------------

def _load_users() -> dict[str, dict[str, Any]]:
    if USERS_PATH.exists():
        try:
            return json.loads(USERS_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


def _save_users(users: dict[str, dict[str, Any]]) -> None:
    USERS_PATH.write_text(json.dumps(users, indent=2), encoding="utf-8")


def create_user(email: str, password: str, organisation: Optional[str] = None) -> dict[str, Any]:
    email = email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise ValueError("invalid email address")
    if len(password) < 8:
        raise ValueError("password must be at least 8 characters")

    users = _load_users()
    if email in users:
        raise ValueError("an account with this email already exists")

    # Demo: an MoSPI/Gov domain gets the institutional tier automatically.
    org = (organisation or "").strip()
    domain = email.split("@")[-1]
    tier = "institutional" if domain.endswith(".gov.in") or domain.endswith(".nic.in") else "public"

    record = {
        "email": email,
        "organisation": org or None,
        "tier": tier,
        "passwordHash": hash_password(password),
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }
    users[email] = record
    _save_users(users)
    return public_profile(record)


def authenticate(email: str, password: str) -> dict[str, Any]:
    email = email.strip().lower()
    record = _load_users().get(email)
    if not record or not verify_password(password, record["passwordHash"]):
        raise ValueError("invalid email or password")
    return record


def public_profile(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "email": record["email"],
        "organisation": record.get("organisation"),
        "tier": record["tier"],
        "createdAt": record.get("createdAt"),
    }


# ---------------------------------------------------------------------------
# Default demo account (created on first boot when the store is empty)
# ---------------------------------------------------------------------------

def ensure_demo_account() -> None:
    users = _load_users()
    if not users:
        create_user("analyst@mospi.gov.in", "fairflight-demo", organisation="MoSPI (demo)")


def bearer_from_header(authorization: Optional[str]) -> Optional[dict[str, Any]]:
    """Parse an `Authorization: Bearer …` header into a payload, if valid."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return verify_token(authorization[7:].strip())
