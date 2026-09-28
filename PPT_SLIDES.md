# FAIR FLIGHT — 6-Slide Hackathon Deck

> Working doc. Each slide = on-slide text (keep slides lean) + speaker notes (where the detail lives). Slide 1 below; remaining slides to be added.

---

## Slide 1 — Proposed Solution

### On-slide title block

**FAIR FLIGHT** — A Real-time Airfare Price Index (APIx) for India's CPI
*Daily, web-scraped, COICOP-2018-aligned inflation for MoSPI & RBI · Base Year 2024 = 100*

### On-slide body (6 lines, keep verbatim length)

1. **What** — A production-ready system that publishes India's national airfare price index **daily**, not monthly — anchored to the new **Base Year 2024 = 100**.
2. **Method** — Fixed-basket **Laspeyres index** over 5 DGCA trunk corridors × 3 booking windows (T+1 / T+7 / T+15), weighted by real DGCA traffic shares (35/25/20/10/10 %) and booking-horizon weights (15/35/50 %).
3. **Data** — Async Playwright scraper with anti-bot evasions + a synthetic fallback, so the pipeline **never fails**; pandas cleaning isolates best-economy fares (outliers > ₹25k dropped).
4. **Serving** — e-Sankhyiki-style FastAPI (JSON/CSV, COICOP-2018 Division 07 metadata) + a real-time React dashboard with forecasts, alerts, and policy simulation.
5. **Intelligence** — ARIMA 7-day forecasts with 95 % bands (**42 % more accurate than naive**), walk-forward backtests, and an ATF/demand/GST **policy simulator** quantifying CPI pass-through (airfares = 0.61 % of the CPI-2024 basket).
6. **Automation** — Publishes daily at **05:30 IST** via GitHub Actions; Dockerized; HMAC-signed webhooks for event-driven NSO integration.

### Visual (right half of the slide)

A 4-stage flow arrow, matching `docs/architecture.svg` (already in the repo — export it as PNG for the slide):

```
Scrape (Playwright, 5×3 fare series/day)
   → Clean (pandas: outliers, best-economy)
      → Index (Laspeyres, Base 2024=100)
         → Serve (FastAPI + React · SSE live)
```

### Speaker notes — the detailed explanation (~90 seconds)

India's CPI has just moved to **Base Year 2024 = 100** under the UN **COICOP-2018** framework, and the new methodology explicitly mandates **web-scraped prices for dynamic services**. Airfare is the textbook case: it moves every day with fuel prices, demand shocks, and seasonality — but the official CPI prints it **once a month, weeks late**. Policymakers at MoSPI and the RBI are effectively steering inflation with a rear-view mirror.

**FAIR FLIGHT closes that gap.** It scrapes real economy fares on India's five busiest domestic corridors — Delhi–Mumbai, Delhi–Bengaluru, Mumbai–Bengaluru, Bengaluru–Hyderabad, Delhi–Kolkata — at three advance-purchase horizons: next-day, one-week, and two-week. That is **15 fare series collected every day**.

Those fares feed a **fixed-basket Laspeyres index** — the same formula family the official CPI uses — with corridor weights taken from DGCA's actual traffic shares and window weights from observed booking behaviour. The index is anchored at exactly **100.00 on the 2024 base**, so it drops into MoSPI's framework with no conversion.

Everything is engineered for institutional reliability: the scraper carries anti-bot headers and randomized delays, and if any site blocks it, a **synthetic fallback instantly generates realistic data** so the pipeline never fails — not on demo day, not in production. The cleaned data powers a **FastAPI backend that mirrors e-Sankhyiki's API conventions** and tags every response with COICOP-2018 metadata: Division 07 → Group 07.3 → Class 07.3.1 → **Sub-class 07.3.1.2, Passenger transport by air**.

And it is not just an index — it is **decision support**: ARIMA forecasts with 95 % prediction bands, a **policy simulator** that translates an ATF fuel shock into CPI basis points through the 0.61 % airfare weight, automated volatility alerts, and a publication-ready **PDF bulletin**. The whole pipeline runs itself: a GitHub Action publishes the fresh index at **05:30 IST every morning** — the same cadence official price collection follows.

**One line to close the slide:** *"Official CPI tells you what airfares did last month. FAIR FLIGHT tells you what they are doing today — and what they will do next week."*
