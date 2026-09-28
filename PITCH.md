# FAIR FLIGHT — One-page pitch

### The problem
India's CPI just moved to **Base Year 2024=100** under the UN **COICOP-2018** framework — and the new methodology explicitly calls for **web-scraped prices for dynamic services**. Airfares are the textbook case: they move daily with fuel, demand and seasonality, but the official CPI prints them **once a month, weeks late**. Policymakers at **MoSPI** and the **RBI** are steering inflation with a rear-view mirror.

### The solution
**FAIR FLIGHT** publishes a **daily Airfare Price Index (APIx)** — a weighted Laspeyres basket over five DGCA trunk corridors and three booking windows, anchored to the new **2024=100** base. It is collected by an anti-bot Playwright scraper every morning at 05:30 IST, served over an e-Sankhyiki-style FastAPI, and delivered through a dashboard that makes the statistics *legible*: forecast bands, policy shock simulators, volatility alerts, and a one-click PDF bulletin in official format.

### Why it wins
1. **On mandate, not adjacent to it.** COICOP Division 07, 2024=100 anchor, e-Sankhyiki-shaped API — judges from the statistics world will recognise every convention.
2. **Real methodology, not vibes.** Hannan–Rissanen ARIMA with walk-forward validation (MAE/MAPE/skill vs naive), Paasche–Fisher companion indices, 95% band coverage — every number on screen is reproducible from committed CSVs.
3. **Policy-native.** The simulator translates "ATF +15%" into APIx points and **headline-CPI basis points** using air travel's actual COICOP weight — the exact mental model an RBI analyst uses.
4. **Engineered like a product.** SSE live push, HMAC-signed webhooks, PBKDF2 auth with institutional rate tiers, PWA offline, Docker one-liner, CI pipeline — and the UI degrades gracefully so the demo *cannot* break.
5. **Self-documenting.** A 60-entry searchable in-app encyclopedia explains every acronym, formula and panel — a reviewer never needs a second tab.

### The ask
A 90-second look at the dashboard shows what a *daily* CPI layer would feel like: living, forecast, explainable. FAIR FLIGHT is the reference implementation MoSPI could bolt onto e-Sankhyiki tomorrow.

> *Fares, measured fairly — because inflation policy deserves data at the speed it moves.*
