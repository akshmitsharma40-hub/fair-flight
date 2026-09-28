#!/usr/bin/env python3
"""pdf_bulletin.py — dependency-free PDF rendering for the APIx bulletin.

Builds a single-page A4 institutional bulletin (vector line chart, KPI band,
table, COICOP metadata footer) using raw PDF primitives — no wkhtmltopdf,
weasyprint, or reportlab required. Only Helvetica (PDF base-14), so any
viewer renders it identically.

Coordinate convention: helpers take *top-down* y (0 = page top); PDF's
bottom-up origin is translated internally.
"""

from __future__ import annotations

import math
from typing import Any

import pandas as pd

from logo_mark import draw_logo_aerotrend

PAGE_W, PAGE_H = 595, 842  # A4 @ 72dpi
MARGIN = 46

INK = (0.07, 0.10, 0.19)          # slate-900-ish
MUTED = (0.38, 0.44, 0.56)        # slate-500-ish
ACCENT = (0.30, 0.34, 0.91)       # indigo-600-ish
ACCENT_2 = (0.02, 0.72, 0.83)     # cyan-600-ish
GRID = (0.85, 0.88, 0.94)


def _fmt(value: float) -> str:
    """Format a float for PDF output (no scientific notation, 2dp)."""
    return f"{value:.2f}"


def _esc(text: str) -> str:
    """Escape a string for a PDF literal text object."""
    return text.replace("\\", r"\\\\").replace("(", r"\(").replace(")", r"\)")


def _pdf_x(x: float) -> float:
    return x


def _pdf_y(y_top: float) -> float:
    return PAGE_H - y_top


def _text_lines(
    parts: list[tuple[str, tuple[float, float, float], float]],
    x: float,
    y: float,
) -> str:
    """One BT/ET block of positioned colored runs on a single baseline.

    parts: list of (text, rgb, font_size). Runs are placed sequentially with
    explicit Td advances (Helvetica width estimation keeps spacing decent).
    """
    pdf_y = _pdf_y(y)
    out = [f"BT 1 0 0 1 {_fmt(_pdf_x(x))} {_fmt(pdf_y)} Tm"]
    for text, rgb, size in parts:
        r, g, b = rgb
        out.append(f"/F1 {_fmt(size)} Tf {r:.3f} {g:.3f} {b:.3f} rg")
        out.append(f"({_esc(text)}) Tj 0 -0 Td")
    out.append("ET")
    return "\n".join(out)


def _text(text: str, x: float, y: float, size: float, rgb: tuple[float, float, float]) -> str:
    r, g, b = rgb
    return (
        f"BT 1 0 0 1 {_fmt(_pdf_x(x))} {_fmt(_pdf_y(y))} Tm /F1 {_fmt(size)} Tf "
        f"{r:.3f} {g:.3f} {b:.3f} rg ({_esc(text)}) Tj ET"
    )


def _rect(x: float, y: float, w: float, h: float, rgb: tuple[float, float, float], stroke: bool = False) -> str:
    r, g, b = rgb
    op = "S" if stroke else "f"
    return (
        f"{r:.3f} {g:.3f} {b:.3f} {_fmt(w)} {_fmt(-h)} {_fmt(_pdf_x(x))} {_fmt(_pdf_y(y))} re {op}"
        if stroke
        else f"{r:.3f} {g:.3f} {b:.3f} {_fmt(w)} {_fmt(-h)} {_fmt(_pdf_x(x))} {_fmt(_pdf_y(y))} re f"
    )


def _polyline(points: list[tuple[float, float]], rgb: tuple[float, float, float], width: float) -> str:
    r, g, b = rgb
    cmds = [f"{r:.3f} {g:.3f} {b:.3f} RG {_fmt(width)} w 1 J 1 j"]
    for i, (x, y) in enumerate(points):
        prefix = "m" if i == 0 else "l"
        cmds.append(f"{_fmt(_pdf_x(x))} {_fmt(_pdf_y(y))} {prefix}")
    cmds.append("S")
    return "\n".join(cmds)


def _dashed_line(points: list[tuple[float, float]], rgb: tuple[float, float, float], width: float) -> str:
    body = _polyline(points, rgb, width)
    return body.replace("RG", "RG [3 3] 0 d", 1)


def _band(points: list[tuple[float, float]], rgb: tuple[float, float, float]) -> str:
    r, g, b = rgb
    cmds = [f"{r:.3f} {g:.3f} {b:.3f} rg"]
    for i, (x, y) in enumerate(points):
        prefix = "m" if i == 0 else "l"
        cmds.append(f"{_fmt(_pdf_x(x))} {_fmt(_pdf_y(y))} {prefix}")
    cmds.append("h f")
    return "\n".join(cmds)


def _hline(x0: float, x1: float, y: float, rgb: tuple[float, float, float], width: float = 0.7) -> str:
    r, g, b = rgb
    return (
        f"{r:.3f} {g:.3f} {b:.3f} RG {_fmt(width)} w {_fmt(_pdf_x(x0))} {_fmt(_pdf_y(y))} m "
        f"{_fmt(_pdf_x(x1))} {_fmt(_pdf_y(y))} l S"
    )


def _helvetica_width(text: str, size: float) -> float:
    """Approximate advance width using the standard Helvetica AFM ratios."""
    widths: dict[str, float] = {
        " ": 0.278, "!": 0.278, '"': 0.355, "#": 0.556, "$": 0.556, "%": 0.889, "&": 0.667,
        "'": 0.191, "(": 0.333, ")": 0.333, "*": 0.389, "+": 0.584, ",": 0.278, "-": 0.333,
        ".": 0.278, "/": 0.278, "0": 0.556, "1": 0.556, "2": 0.556, "3": 0.556, "4": 0.556,
        "5": 0.556, "6": 0.556, "7": 0.556, "8": 0.556, "9": 0.556, ":": 0.278, ";": 0.278,
        "<": 0.584, "=": 0.584, ">": 0.584, "?": 0.556, "@": 1.015, "A": 0.667, "B": 0.667,
        "C": 0.722, "D": 0.722, "E": 0.667, "F": 0.611, "G": 0.778, "H": 0.722, "I": 0.278,
        "J": 0.5, "K": 0.667, "L": 0.556, "M": 0.833, "N": 0.722, "O": 0.778, "P": 0.667,
        "Q": 0.778, "R": 0.722, "S": 0.667, "T": 0.611, "U": 0.722, "V": 0.667, "W": 0.944,
        "X": 0.667, "Y": 0.667, "Z": 0.611, "[": 0.278, "\\": 0.278, "]": 0.278, "^": 0.469,
        "_": 0.556, "`": 0.333, "a": 0.556, "b": 0.556, "c": 0.5, "d": 0.556, "e": 0.556,
        "f": 0.278, "g": 0.556, "h": 0.556, "i": 0.222, "j": 0.222, "k": 0.5, "l": 0.222,
        "m": 0.833, "n": 0.556, "o": 0.556, "p": 0.556, "q": 0.556, "r": 0.333, "s": 0.5,
        "t": 0.278, "u": 0.556, "v": 0.5, "w": 0.722, "x": 0.5, "y": 0.5, "z": 0.5,
        "{": 0.334, "|": 0.26, "}": 0.334, "~": 0.584, "₹": 0.556, "→": 0.584, "·": 0.278,
        "—": 1.0, "–": 0.556, "±": 0.584, "≥": 0.549, "×": 0.584,
    }
    return sum(widths.get(ch, 0.556) for ch in text) * size


def _fit_text(text: str, size: float, max_width: float) -> str:
    while text and _helvetica_width(text, size) > max_width:
        text = text[:-1]
    return text


def build_bulletin_pdf(latest: dict[str, Any], frame: pd.DataFrame) -> bytes:
    """Render the A4 bulletin and return raw PDF bytes."""
    content: list[str] = []

    apix_series = frame["apix"].astype(float).tolist()
    dates = pd.to_datetime(frame["date"])

    # ------------------------------------------------------------------
    # 1. Masthead — AeroTrend brand mark + titles
    # ------------------------------------------------------------------
    content.append(_rect(0, 0, PAGE_W, 118, INK))
    content.append(_rect(0, 118, PAGE_W, 3, ACCENT))
    # Vector logo tile top-left (30pt); text shifts right to clear it.
    logo_x, logo_size = MARGIN, 30
    content.extend(draw_logo_aerotrend(logo_x, PAGE_H - 14 - logo_size, logo_size))
    text_x = logo_x + logo_size + 16
    content.append(_text("FAIR FLIGHT  ·  MONTHLY AIRFARE PRICE BULLETIN", text_x, 44, 10.5, (0.62, 0.68, 0.85)))
    content.append(_text("National Airfare Price Index (APIx) for India", text_x, 70, 21, (1, 1, 1)))
    stamp = f"Reference day {latest['date']}  ·  Base Year 2024=100  ·  COICOP-2018 Division 07 (07.3.1.2)"
    content.append(_text(_fit_text(stamp, 9.5, PAGE_W - text_x - MARGIN), text_x, 92, 9.5, (0.72, 0.78, 0.9)))

    # ------------------------------------------------------------------
    # 2. KPI band (four boxes)
    # ------------------------------------------------------------------
    kpis = [
        ("APIx (latest)", f"{latest['apix']:.2f}", ACCENT),
        ("Day-over-day", f"{latest['dodPct']:+.2f}%", (0.85, 0.33, 0.11) if latest["dodPct"] >= 0 else (0.02, 0.59, 0.41)),
        ("Basket fare", f"\u20b9{latest['weightedBasketInr']:,.0f}", ACCENT_2),
        ("CPI benchmark", f"{latest['cpiBenchmark']:.1f}", MUTED),
    ]
    box_w = (PAGE_W - 2 * MARGIN - 3 * 12) / 4
    for i, (label, value, rgb) in enumerate(kpis):
        x = MARGIN + i * (box_w + 12)
        content.append(_rect(x, 140, box_w, 62, (0.965, 0.972, 0.985)))
        content.append(_rect(x, 140, 2.5, 62, rgb))
        content.append(_text(label.upper(), x + 12, 158, 7.5, MUTED))
        content.append(_text(value, x + 12, 184, 16, INK))

    # ------------------------------------------------------------------
    # 3. 30-day index chart (vector line + CPI benchmark + grid)
    # ------------------------------------------------------------------
    chart_x, chart_y, chart_w, chart_h = MARGIN, 236, PAGE_W - 2 * MARGIN, 168
    content.append(_rect(chart_x, chart_y, chart_w, chart_h, (0.975, 0.98, 0.99)))

    pad_l, pad_r, pad_t, pad_b = 40, 14, 16, 24
    lo = min(min(apix_series), latest["cpiBenchmark"]) * 0.985
    hi = max(max(apix_series), latest["cpiBenchmark"]) * 1.015

    def sx(i: int) -> float:
        return chart_x + pad_l + i * (chart_w - pad_l - pad_r) / max(len(apix_series) - 1, 1)

    def sy(v: float) -> float:
        return chart_y + pad_t + (1 - (v - lo) / max(hi - lo, 1e-9)) * (chart_h - pad_t - pad_b)

    # horizontal gridlines + y labels
    for g in range(5):
        gy = chart_y + pad_t + g * (chart_h - pad_t - pad_b) / 4
        gv = hi - g * (hi - lo) / 4
        content.append(_hline(chart_x + pad_l, chart_x + chart_w - pad_r, gy, GRID, 0.6))
        content.append(_text(f"{gv:.0f}", chart_x + 8, gy + 3, 7, MUTED))
    # x labels: first / middle / last
    for i in (0, len(apix_series) // 2, len(apix_series) - 1):
        content.append(_text(dates.iloc[i].strftime("%d %b"), sx(i) - 12, chart_y + chart_h - 8, 7, MUTED))

    # CPI benchmark (dashed slate)
    cpi_pts = [(sx(0), sy(latest["cpiBenchmark"])), (sx(len(apix_series) - 1), sy(latest["cpiBenchmark"]))]
    content.append(_dashed_line(cpi_pts, (0.45, 0.51, 0.63), 1.0))
    content.append(_text("CPI benchmark", chart_x + chart_w - pad_r - 62, sy(latest["cpiBenchmark"]) - 4, 6.5, MUTED))

    # APIx line (accent) + end dot
    line_pts = [(sx(i), sy(v)) for i, v in enumerate(apix_series)]
    content.append(_polyline(line_pts, ACCENT, 1.8))
    ex, ey = line_pts[-1]
    content.append(f"{ACCENT[0]:.3f} {ACCENT[1]:.3f} {ACCENT[2]:.3f} rg {_fmt(ex)} {_fmt(_pdf_y(ey))} 2.6 0 360 arc f")

    # forecast band placeholder caption
    content.append(_text(
        f"30-day observed series · peak {_fmt(max(apix_series))} · trough {_fmt(min(apix_series))}",
        chart_x + pad_l, chart_y + chart_h + 14, 7.5, MUTED,
    ))

    # ------------------------------------------------------------------
    # 4. Methodology + classification block (two columns)
    # ------------------------------------------------------------------
    col_y = 442
    content.append(_text("METHODOLOGY", MARGIN, col_y, 8.5, ACCENT))
    method_lines = [
        "Fixed-basket Laspeyres aggregation across 5 DGCA trunk corridors,",
        "weighted by domestic traffic shares (DEL-BOM 35% · DEL-BLR 25% ·",
        "BOM-BLR 20% · BLR-HYD 10% · DEL-CCU 10%) and by booking-window",
        "mix (T+1 15% · T+7 35% · T+15 50%). Daily index re-anchored to 100",
        "at the Base Year reference day; ARIMA(p,1,q) projection band at 95%.",
    ]
    for i, line in enumerate(method_lines):
        content.append(_text(line, MARGIN, col_y + 18 + i * 12, 8.2, INK))

    col2_x = MARGIN + (PAGE_W - 2 * MARGIN) / 2 + 8
    content.append(_text("CLASSIFICATION (COICOP-2018)", col2_x, col_y, 8.5, ACCENT))
    cls_lines = [
        "Division 07 — Transport",
        "Group 07.3 — Transport services",
        "Class 07.3.1 — Local & long-distance passenger transport",
        "Sub-class 07.3.1.2 — Passenger transport by air",
        "Experimental series — not for official citation.",
    ]
    for i, line in enumerate(cls_lines):
        content.append(_text(line, col2_x, col_y + 18 + i * 12, 8.2, INK))

    # ------------------------------------------------------------------
    # 5. Daily table (compact, two-up columns of 15 rows)
    # ------------------------------------------------------------------
    table_y = col_y + 96
    content.append(_text("DAILY OBSERVATIONS (TRAILING 30 DAYS)", MARGIN, table_y, 8.5, ACCENT))
    content.append(_hline(MARGIN, PAGE_W - MARGIN, table_y + 8, GRID, 0.8))

    rows = list(zip(dates.dt.strftime("%d %b %Y"), apix_series))
    half = math.ceil(len(rows) / 2)
    row_h = 11.5
    col_w = (PAGE_W - 2 * MARGIN) / 2
    for col in range(2):
        x0 = MARGIN + col * col_w
        for r in range(half):
            idx = col * half + r
            if idx >= len(rows):
                break
            label, value = rows[idx]
            y = table_y + 22 + r * row_h
            content.append(_text(label, x0, y, 7.6, MUTED))
            content.append(_text(f"{value:.2f}", x0 + 74, y, 7.6, INK))
        if col == 0:
            content.append(_hline(MARGIN + col_w - 14, MARGIN + col_w - 14, table_y + 14, GRID, 0.6))

    # ------------------------------------------------------------------
    # 6. Footer
    # ------------------------------------------------------------------
    footer_y = PAGE_H - 30
    content.append(_hline(MARGIN, PAGE_W - MARGIN, footer_y - 8, GRID, 0.8))
    content.append(_text(
        "APIx proof-of-concept for MoSPI e-Sankhyiki integration · generated from the daily pipeline artifact · publisher: MoSPI (experimental)",
        MARGIN, footer_y + 6, 7, MUTED,
    ))

    # ------------------------------------------------------------------
    # Assemble the PDF objects
    # ------------------------------------------------------------------
    stream = "\n".join(content).encode("latin-1", errors="replace")

    objects: list[bytes] = []
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    objects.append(
        f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_W} {PAGE_H}] "
        f"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>".encode()
    )
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    objects.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")
    objects.append(b"<< /Title (FAIR FLIGHT Monthly Airfare Price Bulletin) /Producer (APIx PoC) >>")

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref_pos = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets[1:]:
        out += f"{off:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R /Info 6 0 R >>\n"
        f"startxref\n{xref_pos}\n%%EOF"
    ).encode()
    return bytes(out)
