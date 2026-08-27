"""
generator_v4.py  --  smooth topographic-contour SVG generator

Difference vs generator_v3.py
-----------------------------
v3 rendered contours as matplotlib marching-squares polylines, i.e. straight
line segments between grid crossings. That is the source of the "jaggy" look:
smoothness was capped by the sampling grid and then *further* degraded by
`path.simplify_threshold = 1.0` (max vertex dropping) and 1-decimal rounding.

v4 keeps the exact same scalar field (same seed => same map character) but:
  1. samples the field a bit denser,
  2. extracts the raw contour vertices,
  3. runs a light Ramer-Douglas-Peucker pass to drop redundant collinear
     points (this is what shrinks the file),
  4. fits a Catmull-Rom spline through the survivors and emits cubic Beziers
     ("C" commands) so the curves are genuinely smooth,
  5. writes the SVG by hand at 2-decimal precision.

Fewer control points AND smooth curves => usually smaller *and* smoother than
the v3 output. No online optimizer pass is needed afterwards.

Requires: numpy, matplotlib (only for the marching-squares contour extraction).
"""

import os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# viewBox is 360 x 1080; data domain is x in [-5,5], y in [-15,15].
# => 36 px per data unit, equal aspect. SVG y is flipped relative to data y.
X_MIN, X_MAX = -5.0, 5.0
Y_MIN, Y_MAX = -15.0, 15.0
VB_W, VB_H = 360.0, 1080.0
SX = VB_W / (X_MAX - X_MIN)   # 36
SY = VB_H / (Y_MAX - Y_MIN)   # 36

STROKE_COLOR = "#858585"
STROKE_WIDTH = 0.3


# --------------------------------------------------------------------------- #
# Scalar field (identical maths to generator_v3, crackle amplitude exposed)
# --------------------------------------------------------------------------- #
def generate_tectonic_faults(x, y, seed=None, crackle_amp=0.15):
    if seed is not None:
        np.random.seed(seed)

    warp_amp = 0.6
    x_warp = x + warp_amp * np.sin(0.5 * y)
    y_warp = y + warp_amp * np.cos(0.5 * x)

    angle = np.random.uniform(0, np.pi)
    direction = x_warp * np.cos(angle) + y_warp * np.sin(angle)
    z = 2.0 * np.tanh(2.0 * direction)

    for i in range(1, 4):
        freq = i * 0.8
        shift = np.random.uniform(-5, 5)
        z += (0.5 / i) * np.tanh(freq * (x_warp + shift))

    # High-frequency "crackle" texture. Lower crackle_amp => calmer contours.
    z += crackle_amp * np.sin(4 * x) * np.sin(4 * y)
    return z


# --------------------------------------------------------------------------- #
# Mountain terrain field  (fractal / fBm Perlin noise)
# --------------------------------------------------------------------------- #
# tanh faults make parallel bands; real topo maps of mountains are nested
# closed loops (peaks + basins). Fractal noise produces exactly that: an
# organic elevation surface whose contour lines read as terrain.
_FADE = lambda t: t * t * t * (t * (t * 6 - 15) + 10)
_LERP = lambda a, b, t: a + t * (b - a)
_GRAD = np.array([[1, 1], [-1, 1], [1, -1], [-1, -1],
                  [1, 0], [-1, 0], [0, 1], [0, -1]], dtype=float)


def _perlin(x, y, perm):
    """Vectorised 2-D Perlin gradient noise on float arrays x, y."""
    xi = np.floor(x).astype(np.int64) & 255
    yi = np.floor(y).astype(np.int64) & 255
    xf = x - np.floor(x)
    yf = y - np.floor(y)
    u, v = _FADE(xf), _FADE(yf)

    def dot(ix, iy, dx, dy):
        h = perm[(perm[ix & 255] + iy) & 255] & 7
        return _GRAD[h, 0] * dx + _GRAD[h, 1] * dy

    n00 = dot(xi, yi, xf, yf)
    n10 = dot(xi + 1, yi, xf - 1, yf)
    n01 = dot(xi, yi + 1, xf, yf - 1)
    n11 = dot(xi + 1, yi + 1, xf - 1, yf - 1)
    return _LERP(_LERP(n00, n10, u), _LERP(n01, n11, u), v)


def _fbm(x, y, perm, octaves=6, persistence=0.5, lacunarity=2.0):
    """Fractional Brownian motion: sum of Perlin octaves -> terrain."""
    total = np.zeros_like(x)
    amp, freq, norm = 1.0, 1.0, 0.0
    for _ in range(octaves):
        total += amp * _perlin(x * freq, y * freq, perm)
        norm += amp
        amp *= persistence
        freq *= lacunarity
    return total / norm


def generate_mountain_terrain(x, y, seed=800, octaves=6,
                              feature_freq=0.4, ridged=0.35, warp=0.35):
    """
    Abstract mountain topography.

    feature_freq : lower => bigger, fewer landforms; higher => busier terrain.
    octaves      : detail levels (more => finer ridges, larger file).
    ridged       : 0..1 blend of "ridged" noise for sharper ridgelines/valleys.
    warp         : domain warping for a more organic, less regular look.
    """
    rng = np.random.default_rng(seed)
    perm = rng.permutation(256).astype(np.int64)

    xf, yf = x * feature_freq, y * feature_freq

    # Domain warp: displace the sample coords by another noise field.
    if warp:
        wx = _fbm(xf + 5.2, yf + 1.3, perm, octaves=3)
        wy = _fbm(xf + 9.7, yf + 4.1, perm, octaves=3)
        xf = xf + warp * wx
        yf = yf + warp * wy

    base = _fbm(xf, yf, perm, octaves=octaves)                 # rolling hills
    if ridged:
        ridge = 1.0 - np.abs(_fbm(xf + 100.0, yf + 100.0, perm, octaves=octaves))
        z = (1.0 - ridged) * base + ridged * (ridge - 0.5)     # add ridgelines
    else:
        z = base
    return z


# --------------------------------------------------------------------------- #
# Geometry helpers
# --------------------------------------------------------------------------- #
def to_svg_coords(pts):
    """(N,2) data coords -> (N,2) SVG pixel coords (y flipped)."""
    out = np.empty_like(pts, dtype=float)
    out[:, 0] = (pts[:, 0] - X_MIN) * SX
    out[:, 1] = (Y_MAX - pts[:, 1]) * SY
    return out


def rdp(points, epsilon):
    """
    Ramer-Douglas-Peucker line simplification.  <<< THE SIMPLIFICATION KNOB >>>

    Drops points that are within `epsilon` pixels of the straight line through
    their neighbours, i.e. redundant near-collinear vertices. This is what
    shrinks the file. `epsilon` is measured in SVG pixels (the canvas is
    360 x 1080), and is passed in as `rdp_epsilon` from create_topographic_svg:
        0.0      = keep every point (largest, most faithful)
        0.7-1.0  = light cleanup, no visible change (good default range)
        2.0-4.0  = aggressive, much smaller file, contours start losing fine wiggles

    points: (N,2) ndarray -> (M,2) ndarray.
    """
    n = len(points)
    if n < 3:
        return points
    keep = np.zeros(n, dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        start, end = stack.pop()
        if end <= start + 1:
            continue
        a = points[start]
        b = points[end]
        ab = b - a
        seg_len = np.hypot(*ab)
        seg = points[start + 1:end]
        if seg_len < 1e-12:
            dists = np.hypot(seg[:, 0] - a[0], seg[:, 1] - a[1])
        else:
            # perpendicular distance to line a-b
            dists = np.abs(ab[0] * (a[1] - seg[:, 1]) - (a[0] - seg[:, 0]) * ab[1]) / seg_len
        idx = int(np.argmax(dists))
        if dists[idx] > epsilon:
            split = start + 1 + idx
            keep[split] = True
            stack.append((start, split))
            stack.append((split, end))
    return points[keep]


def catmull_rom_path(pts, closed, precision=2, smoothness=1.0):
    """
    Turn a reduced point list into an SVG 'd' string of cubic Beziers.

    smoothness  <<< THE SMOOTHNESS KNOB >>>
        Controls how rounded the curves are (how far the Bezier control points
        reach out along each point's tangent).
          0.0  = no smoothing -> straight line segments (the old "jaggy" look)
          1.0  = natural Catmull-Rom spline (the smooth default)
          1.5+ = extra-rounded / flowing (can bulge or overshoot at tight bends)
        Only affects the *look* of the curve, not the number of points/file size.
    """
    def f(v):
        s = f"{v:.{precision}f}".rstrip("0").rstrip(".")
        return s if s not in ("", "-0") else "0"

    m = len(pts)
    if m < 2:
        return ""
    if closed and m > 2:
        pts = pts[:-1]  # drop duplicated closing vertex; we wrap instead
        m = len(pts)

    def P(i):
        if closed:
            return pts[i % m]
        return pts[min(max(i, 0), m - 1)]

    # Tangent scale. 1/6 is the standard Catmull-Rom factor; `smoothness`
    # dials it up or down. k=0 collapses the control points onto the
    # endpoints, which renders as straight lines.
    k = smoothness / 6.0

    d = [f"M{f(pts[0][0])} {f(pts[0][1])}"]
    last = m if closed else m - 1
    for i in range(last):
        p0, p1, p2, p3 = P(i - 1), P(i), P(i + 1), P(i + 2)
        c1x = p1[0] + k * (p2[0] - p0[0])
        c1y = p1[1] + k * (p2[1] - p0[1])
        c2x = p2[0] - k * (p3[0] - p1[0])
        c2y = p2[1] - k * (p3[1] - p1[1])
        d.append(f"C{f(c1x)} {f(c1y)} {f(c2x)} {f(c2y)} {f(p2[0])} {f(p2[1])}")
    if closed:
        d.append("Z")
    return "".join(d)


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def create_topographic_svg(filename="pattern_topology_v4.svg",
                           resolution=300, num_levels=34, seed=800,
                           field="mountain", rdp_epsilon=0.7, smoothness=1.0,
                           precision=2, field_kwargs=None):
    # The two dials you'll play with most:
    #   rdp_epsilon -> SIMPLIFICATION (file size). See rdp() above.
    #   smoothness  -> SMOOTHNESS (how rounded). See catmull_rom_path() above.
    x = np.linspace(X_MIN, X_MAX, resolution)
    y = np.linspace(Y_MIN, Y_MAX, resolution)
    X, Y = np.meshgrid(x, y)

    field_kwargs = field_kwargs or {}
    if field == "mountain":
        Z = generate_mountain_terrain(X, Y, seed=seed, **field_kwargs)
    elif field == "faults":
        Z = generate_tectonic_faults(X, Y, seed=seed, **field_kwargs)
    else:
        raise ValueError(f"unknown field: {field!r}")

    levels = np.linspace(Z.min(), Z.max(), num_levels)

    # Extract raw contour polylines (no drawing). allsegs[i] -> list of (N,2).
    fig = plt.figure()
    ax = fig.add_subplot(111)
    cs = ax.contour(X, Y, Z, levels=levels)
    allsegs = cs.allsegs
    plt.close(fig)

    body = []
    for i, level_segs in enumerate(allsegs):
        opacity = round(i / (num_levels - 1), 3)
        if opacity <= 0:
            continue
        d_parts = []
        for seg in level_segs:
            seg = np.asarray(seg, dtype=float)
            if len(seg) < 2:
                continue
            closed = np.hypot(*(seg[0] - seg[-1])) < 1e-6
            svg_pts = to_svg_coords(seg)
            reduced = rdp(svg_pts, rdp_epsilon)
            if len(reduced) < 2:
                continue
            d_parts.append(catmull_rom_path(reduced, closed, precision, smoothness))
        if d_parts:
            body.append(f'<path stroke-opacity="{opacity}" d="{"".join(d_parts)}"/>')

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VB_W:g} {VB_H:g}">'
        f'<style>*{{stroke-linejoin:round;stroke-linecap:butt}}</style>'
        f'<g fill="none" stroke="{STROKE_COLOR}" stroke-width="{STROKE_WIDTH}">'
        + "".join(body) +
        "</g></svg>"
    )

    with open(filename, "w") as fh:
        fh.write(svg)

    kb = os.path.getsize(filename) / 1024
    print(f"Wrote {filename}  ({kb:.1f} KB, {len(body)} level-paths, "
          f"res={resolution}, eps={rdp_epsilon})")
    return filename


if __name__ == "__main__":
    # ======================================================================= #
    #  CONTROL PANEL  --  tweak these, then re-run:  python3 generator_v4.py
    #  Output is a NEW file, so the live background is never touched until you
    #  copy it over yourself.
    # ======================================================================= #
    out = os.path.join(os.path.dirname(__file__), "mountain_topology_v4.svg")
    create_topographic_svg(
        filename=out,
        field="mountain",     # "mountain" (terrain) or "faults" (old v3 style)
        seed=893,             # change for a totally different mountain layout

        # --- THE TWO YOU ASKED ABOUT --------------------------------------- #
        rdp_epsilon=0.6,      # SIMPLIFICATION: higher = smaller file, looser.
                              #   0 = keep all points, 0.7-1.0 = safe, 2-4 = strong.
        smoothness=1.0,       # SMOOTHNESS: 0 = straight/jaggy, 1 = smooth,
                              #   1.5+ = extra-flowing (may overshoot tight bends).
        # ------------------------------------------------------------------- #

        num_levels=24,        # how many contour lines (more = denser + bigger file)
        resolution=810,       # sampling grid; raise for finer base detail (slower)

        # Shape of the terrain itself:
        field_kwargs=dict(
            octaves=1,        # detail levels: more = finer ridges (bigger file)
            feature_freq=0.4,# lower = bigger/fewer landforms; higher = busier
            ridged=0.2,      # 0..1: sharper ridgelines & valleys as it rises
            warp=0.15,         # organic distortion; 0 = smoother/more regular blobs
        ),
    )
