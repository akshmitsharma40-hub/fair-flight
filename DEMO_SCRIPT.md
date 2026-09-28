# FAIR FLIGHT — 3-minute live demo script

**Setup before the audience arrives:** dashboard on the projector at `http://localhost:5173` (or the deployed URL), backend running so the ribbon reads **"Live API · SSE"**, sign in with the demo account so the institutional badge shows. Have the PDF ready in a tab. Do **not** start the tour — this script replaces it.

---

### 0:00–0:20 — The hook (hero, say it while pointing)
> "India's CPI just moved to Base Year 2024=100, and the new methodology explicitly asks for **web-scraped prices for dynamic services**. Airfares are the hardest of those — they change every single day. This is **FAIR FLIGHT**: a daily Airfare Price Index, built to the COICOP Division 07 spec, that MoSPI could publish tomorrow."

*Let the eye land on the animated wordmark, the Live-API ribbon, the KPI strip. Don't click yet.*

### 0:20–0:50 — The live pulse
- Point at the **DoD Shift** card (currently −3.53%): "Yesterday the national basket got 3.5% cheaper. If that breached ±5%, that red banner would drop automatically."
- Open the **tools flyout** (single button, mid-left): hover the corridor rows — "Every route, live fares, DGCA weights — one button."
- Click **Delhi → Mumbai**. Everything cascades: chart refits, **ARIMA badge changes to the corridor's fit**.
> "One click re-estimates the whole statistical model for that corridor — server-side, not a redraw."

### 0:50–1:20 — ⌘K + the map
- Hit **⌘K**, type `national`, Enter. Then type `light` — theme flips: *"RBI-portal paper mode for the compliance folks"* — flip back.
- Scroll to the **corridor map**. Click the **DEL–CCU arc**.
> "Thickness is DGCA traffic weight, colour is day-over-day heat. This is the geography of Indian airfare inflation."

### 1:20–2:00 — The policy moment *(the scoring blow)*
Scroll to the **Policy Simulator**. Drag **ATF to +25%** — tiles recompute live.
> "Jet fuel up a quarter. The fitted model projects APIx up about 6%, and through air travel's 0.61% COICOP weight, that's **+3.8 basis points on headline CPI** — same day it happens, not next month's print. That's the number a rate-setter actually wants."

### 2:00–2:30 — Rigor, fast
Scroll to **Model Research**.
> "This isn't a fitted curve and prayers: walk-forward backtest, 12 folds, and the model **beats a naive forecast by ~42%** with full 95% band coverage. We also publish Paasche and Fisher companions — the substitution bias is visible, not hidden."

### 2:30–3:00 — Institutional close
- Click **Bulletin PDF** in the masthead → open the download.
> "One click: the A4 bulletin an NSO would actually issue — vector chart, KPI band, COICOP footer."
- Back on the dashboard, open the **About** book in the flyout, flash the search: `laspeyres`.
> "And everything you just heard — every acronym, formula, model choice — is documented **inside the product**. If a reviewer wants to know what a Laspeyres index is, they ask the dashboard itself."
> **"FAIR FLIGHT. Fares, measured fairly. Daily data for a real-time economy."**

---

**If you only get 60 seconds:** hook (0:00) → policy simulator shock (1:20) → bulletin PDF (2:30). That's the whole thesis in three gestures.

**Recovery lines:** if the backend drops mid-demo, the ribbon says *Embedded snapshot* — say "and it still runs, because every layer degrades gracefully" and continue; if the network dies, the PWA renders offline.
