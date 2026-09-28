# FAIR FLIGHT — Public Deployment Guide

Two free-tier-friendly paths to a public URL. Both deploy the same two pieces:
the **FastAPI backend** (`backend/`, hosts the index + analytics + auth + SSE)
and the **static React dashboard** (`frontend/dist`).

> After deploying, the dashboard's masthead flips to **"Live API · SSE"** when
> it can reach the backend — that ribbon is your deployment health-check.

---

## Option A — Render.com (recommended, ~10 minutes, $0)

The repo ships a [`render.yaml`](render.yaml) **blueprint**, so Render builds
both services from one click.

1. **Push this repo to GitHub** (if it isn't already).
2. Go to [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint**
   and select the repo. Render reads `render.yaml` and creates:
   - `fair-flight-api` — Python web service, `uvicorn api:app`, `/health` check
   - `fair-flight-web` — static site, `npm run build` → `dist` with SPA rewrite
3. Render auto-generates `WEBHOOK_SECRET` (HMAC signing for tokens + webhooks).
4. After the first deploy, **link the two services**: in `fair-flight-web` →
   Environment, confirm `VITE_API_BASE` matches your API URL
   (`https://fair-flight-api.onrender.com` by default) and trigger **Manual
   Deploy → Clear build cache** so the frontend picks it up.
5. **CORS**: in `fair-flight-api` → Environment, set
   `CORS_ORIGINS=https://fair-flight.onrender.com` (your frontend URL; comma-
   separate extra origins). Restart the service.

**Free-tier notes:** Render free services sleep after ~15 min idle — the first
page-load after a nap takes ~40 s while the API boots (the dashboard degrades
to its embedded snapshot meanwhile, then flips live). Static sites never sleep.

### Demo credentials (seeded on first boot)

| Email | Password | Tier |
| --- | --- | --- |
| `analyst@mospi.gov.in` | `fairflight-demo` | institutional (600 req/min) |

Sign-up is open; **gov.in / nic.in** emails automatically get the
institutional tier, everyone else public (240 req/min). The dashboard is fully
browsable signed-out — sign-in upgrades the rate tier and unlocks the account
badge.

---

## Option B — Docker Compose (any VM / Fly.io / your own box)

```bash
docker compose up --build -d
```

- frontend → `http://<host>:5173` (nginx, proxies `/api` internally)
- backend → `http://<host>:8000/docs`

For Fly.io: `fly launch --no-deploy` in `backend/` and `frontend/` (the
Dockerfiles are ready), then set `VITE_API_BASE` to the API's public URL and
rebuild the frontend image.

---

## Environment variables (backend)

| Var | Default | Purpose |
| --- | --- | --- |
| `WEBHOOK_SECRET` | `apix-demo-signing-key` | HMAC key for bearer tokens **and** webhook signatures — set a real random value in production |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins for the deployed frontend |
| `PORT` | `8000` | Render injects this; uvicorn binds `$PORT` |

## Post-deploy smoke test

```bash
curl https://<api-url>/health
curl -X POST https://<api-url>/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"analyst@mospi.gov.in","password":"fairflight-demo"}'
curl "https://<api-url>/api/v1/apix/forecast?scope=NATIONAL&horizon=7" | head -c 200
```

Then open the frontend URL: the masthead should read **"Live API · SSE"**, the
policy simulator should return numbers (not the offline hint), and the
research panel badges should say **API** (not **CLIENT**).
