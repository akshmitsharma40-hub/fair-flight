"""logo_mark.py — vector AeroTrend mark for the PDF bulletin.

Renders the same brand glyph as the frontend's LogoAeroTrend SVG (rounded
gradient tile + white double-F) using raw PDF primitives, so the bulletin
masthead carries the exact dashboard brand with zero image dependencies.

PDF gradient shading needs a full /Shading dictionary; for a masthead-sized
tile we approximate the diagonal blue→cyan blend with 8 vertical slices.
At 26pt nobody can see the banding, and the vector glyph stays crisp.
"""

from __future__ import annotations

# Corner colours of the SVG gradient: blue-500 → cyan-500.
_BLUE = (0x3B / 255, 0x82 / 255, 0xF6 / 255)
_CYAN = (0x06 / 255, 0xB6 / 255, 0xD4 / 255)


def _lerp(a: tuple[float, float, float], b: tuple[float, float, float], t: float) -> tuple[float, float, float]:
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))  # type: ignore[return-value]


def _rect_fill(x: float, y: float, w: float, h: float, rgb: tuple[float, float, float]) -> str:
    r, g, b = rgb
    return f"q {r:.3f} {g:.3f} {b:.3f} rg {x:.2f} {y:.2f} {w:.2f} {h:.2f} re f Q"


def _path_fill(d_segments: list[str], rgb: tuple[float, float, float]) -> str:
    r, g, b = rgb
    return f"q {r:.3f} {g:.3f} {b:.3f} rg " + " ".join(d_segments) + " f Q"


def draw_logo_aerotrend(x: float, y: float, size: float) -> list[str]:
    """Emit PDF content-stream ops for the AeroTrend mark.

    (x, y) is the BOTTOM-LEFT of the tile in PDF page space; `size` is the
    tile edge in points. Returns a list of text ops to join into the stream.
    """
    ops: list[str] = []

    # --- 1. Tile: 8 vertical slices approximating the diagonal gradient ----
    slices = 8
    slice_w = size / slices
    for i in range(slices):
        t = i / (slices - 1)
        ops.append(_rect_fill(x + i * slice_w, y, slice_w + 0.15, size, _lerp(_BLUE, _CYAN, t)))

    # --- 2. Glyphs: scale the 32×32 SVG path coords to the tile ------------
    s = size / 32.0
    ox, oy = x, y  # SVG y is top-down; flip around the tile while scaling
    def tx(px: float) -> float:
        return ox + px * s

    def ty(py: float) -> float:
        return oy + (32 - py) * s  # flip vertical axis

    # White with 60% alpha is approximated as a pre-blended tint on the
    # cyan end of the gradient (where the wing sits).
    _white = (1.0, 1.0, 1.0)
    _white60 = tuple(0.6 * w + 0.4 * c for w, c in zip(_white, _CYAN))

    def _m(px: float, py: float) -> str:
        return f"{tx(px):.2f} {ty(py):.2f} m"

    def _l(px: float, py: float) -> str:
        return f"{tx(px):.2f} {ty(py):.2f} l"

    # First F / upward trend (SVG: M9 8 h10 l-3 4 H13 v3 h5 l-3 4 h-2 v5 H9 V8 z)
    ops.append(_path_fill(
        [
            _m(9, 8), _l(19, 8), _l(16, 12), _l(13, 12), _l(13, 15),
            _l(18, 15), _l(15, 19), _l(13, 19), _l(13, 24), _l(9, 24),
            _l(9, 8),
        ],
        _white,
    ))

    # Second F / trailing wing, 60% opacity → pre-blended tint
    # (SVG: M16 8 h7 l-3 4 h-4 V8 z  +  M16 15 h4 l-3 4 h-1 v-4 z)
    ops.append(_path_fill(
        [_m(16, 8), _l(23, 8), _l(20, 12), _l(16, 12), _l(16, 8)],
        _white60,
    ))
    ops.append(_path_fill(
        [_m(16, 15), _l(20, 15), _l(17, 19), _l(16, 19), _l(16, 15)],
        _white60,
    ))

    return ops
