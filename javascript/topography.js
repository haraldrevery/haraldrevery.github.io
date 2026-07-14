/*
 * Topographic contour wallpaper, drawn as a relief model.
 *
 * A height field (drifting 3D value noise) is sliced into contour lines with
 * marching squares. Each line is then lifted to its own elevation and run
 * through a perspective camera looking down at the terrain from a shallow
 * angle, so the slices stack into a physical object — closer to a laser-cut
 * relief map than a flat drawing. Layers hover, bobbing gently out of phase
 * with their neighbours.
 *
 * The logo is an island under that terrain — a rigid mesa, shaped by a signed
 * distance field so its contours are concentric offsets of the silhouette. It
 * is near enough to flat on top that its rim reads as the monogram, with
 * cliffs steep enough that the plates stack rather than spread.
 *
 * The ground is the union of terrain and island, so the island can genuinely
 * submerge: it slides down on a slow cycle until it is entirely below the
 * plain and the map closes over it without a trace, then rises back through,
 * surfacing in the low ground first and knitting together as it goes.
 */

const canvas = document.getElementById('topography-canvas');
const ctx = canvas.getContext('2d');
const toggle = document.getElementById('mode-toggle_legacy');
const icon = document.getElementById('mode-icon_legacy');
const svg = document.getElementById('svg-source_topography');

let isDark = document.documentElement.classList.contains('dark');

toggle.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    isDark = document.documentElement.classList.contains('dark');
    icon.textContent = isDark ? '☀' : '🌙';
});

// Grid / contour settings. The grid is sized in columns rather than pixels, so
// a 4K screen gets the same cell count (and the same frame cost) as a 1080p
// one, just with a proportionally larger cell. One grid cell is one world unit.
const TARGET_COLS = 192;
const MIN_CELL = 3;           // px
const ROW_OVERSCAN = 1.45;    // extra rows, so the tilted ground runs off-screen
                              // even at the shallowest PITCH below
const LEVEL_STEP = 0.09;      // height between contour lines
const LEVEL_COUNT = 32;
const INDEX_EVERY = 4;        // every Nth contour is drawn heavier
const ALPHA_REF = 1.8;        // height that maps to a fully bright line

// Camera
//
// >>> CAMERA ANGLES — THESE ARE THE ONES TO TWEAK <<<
//
// PITCH: how far the camera sits above the horizon, in degrees. 90 looks
// straight down (a flat map, no relief); small values lie down toward the
// horizon. Useful range is roughly 40-70; below ~40 the map foreshortens so
// hard the logo stops reading. Cliffs steeper than this angle turn their backs
// on the camera and cull away — that is what keeps them from tangling, so
// lowering this also hides more of the far side. ROW_OVERSCAN above is sized
// to keep the ground off-screen down to about 40; go lower and raise it too.
//
// YAW: how far the view is turned around, in degrees. 0 faces the map square
// on. This turns the logo with it, so a little goes a long way — past ~15 the
// monogram reads as tilted rather than as a shape seen from an angle.
const PITCH = 55 * Math.PI / 180;
const YAW = 0 * Math.PI / 180;

// How much the mouse adds on top, in degrees. Set either to 0 to pin it.
const YAW_RANGE = 7 * Math.PI / 180;
const TILT_RANGE = 5 * Math.PI / 180;
const ORBIT_EASE = 0.05;           // how lazily the view follows the cursor

const FOCAL = 420;                 // world units; smaller = stronger perspective
const ELEV_SCALE = 22;             // world units per unit of field height
const ELEV_REF = 1.0;              // field height that sits on the horizon line
const BOB_PX = 5;                  // hover height, in pixels
const BOB_SPEED = 0.55;            // radians per second
const BOB_PHASE = 0.55;            // radians of offset per layer
const HORIZON_EPS = 1.5;           // px of slack, so grazing lines survive
const FOG_SPAN = 0.45;             // fraction of the screen the far haze covers

// Terrain
const NOISE_SCALE = 0.055;    // per grid cell
const NOISE_AMP = 0.55;
const DRIFT = 0.02;           // noise units per second
const EVOLVE = 0.05;          // z travel per second

// Logo island. Distances below are in grid cells.
//
// >>> LOGO RESOLUTION — RAISE THIS FOR A SHARPER SILHOUETTE <<<
// How many times finer than the contour grid the SVG is traced and its
// distance field measured. 1 measures at grid resolution and the monogram's
// edges come out chipped; 3-4 is plenty. Costs a little memory and a few ms
// at startup and on resize — never per frame — so the only real reason not to
// crank it is diminishing returns.
const LOGO_DETAIL = 3;

const LOGO_SPAN = 0.62;       // fraction of viewport height
const FALLOFF = 9;            // cells the skirt takes to drop one unit;
                              // smaller = steeper cliffs, plates stack tighter
const INNER_SCALE = 120;      // how gently the top domes toward the middle
const LOGO_HEIGHT = 1.15;     // rim height at full rise, above the plain's floor
const SINK = 0.5;             // how far below that floor it hides when sunk;
                              // must exceed BLEND or a ghost swell shows through
const BLEND = 0.28;           // width of the union's blend band
const BREATH_PERIOD = 24;     // seconds

let width, height, dpr, cell;
let cols, rows, halfCols, halfRows;
let field, onIsland, mesa;
let breath = 0, rise = 1;
let cx, cy, zoom, fog;

// Live camera, eased toward the mouse each frame.
let yaw = YAW, pitch = PITCH;
let yawTarget = YAW, pitchTarget = PITCH;
let sinP = Math.sin(PITCH), cosP = Math.cos(PITCH);
let sinY = Math.sin(YAW), cosY = Math.cos(YAW);

function updateCamera() {
    yaw += (yawTarget - yaw) * ORBIT_EASE;
    pitch += (pitchTarget - pitch) * ORBIT_EASE;
    sinP = Math.sin(pitch); cosP = Math.cos(pitch);
    sinY = Math.sin(yaw); cosY = Math.cos(yaw);
}

// Contour segments, split per level into lines outside the logo and lines
// inside it, so the two can be stroked with different weights. Coordinates are
// already projected to pixels: the horizon test needs screen space anyway, so
// draw only has to stroke them.
const levelSegs = [];
const levelSegsLit = [];
for (let i = 0; i < LEVEL_COUNT; i++) { levelSegs.push([]); levelSegsLit.push([]); }

// --- value noise ------------------------------------------------------------

const PERM = new Uint8Array(512);
(() => {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = 0x9e3779b9;
    const rnd = () => {
        s = s + 0x6d2b79f5 | 0;
        let t = Math.imul(s ^ s >>> 15, 1 | s);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

function hash3(x, y, z) {
    return PERM[(PERM[(PERM[x & 255] + y) & 255] + z) & 255] * (1 / 255);
}

function fade(t) { return t * t * (3 - 2 * t); }
function lerp(a, b, t) { return a + (b - a) * t; }

function noise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);

    const x00 = lerp(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), xf);
    const x10 = lerp(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), xf);
    const x01 = lerp(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), xf);
    const x11 = lerp(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), xf);

    return lerp(lerp(x00, x10, yf), lerp(x01, x11, yf), zf);
}

function fbm(x, y, z) {
    let sum = 0, amp = 0.5, norm = 0, fx = x, fy = y, fz = z;
    for (let o = 0; o < 3; o++) {
        sum += noise3(fx, fy, fz) * amp;
        norm += amp;
        amp *= 0.5;
        fx *= 2.03; fy *= 2.03; fz *= 1.9;
    }
    return sum / norm;
}

// --- logo island ------------------------------------------------------------

function boxBlur(buf, w, h, r, passes) {
    const tmp = new Float32Array(buf.length);
    const inv = 1 / (2 * r + 1);
    for (let p = 0; p < passes; p++) {
        for (let y = 0; y < h; y++) {
            const row = y * w;
            for (let x = 0; x < w; x++) {
                let sum = 0;
                for (let k = -r; k <= r; k++) {
                    sum += buf[row + Math.min(w - 1, Math.max(0, x + k))];
                }
                tmp[row + x] = sum * inv;
            }
        }
        for (let x = 0; x < w; x++) {
            for (let y = 0; y < h; y++) {
                let sum = 0;
                for (let k = -r; k <= r; k++) {
                    sum += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x];
                }
                buf[y * w + x] = sum * inv;
            }
        }
    }
}

// Chamfer 3-4 distance transform, returned in grid cells.
function distanceTransform(src, w, h) {
    const INF = 1e9;
    const d = new Float32Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = src[i] > 0.5 ? 0 : INF;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            let v = d[i];
            if (y > 0) {
                if (x > 0) v = Math.min(v, d[i - w - 1] + 4);
                v = Math.min(v, d[i - w] + 3);
                if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4);
            }
            if (x > 0) v = Math.min(v, d[i - 1] + 3);
            d[i] = v;
        }
    }
    for (let y = h - 1; y >= 0; y--) {
        for (let x = w - 1; x >= 0; x--) {
            const i = y * w + x;
            let v = d[i];
            if (y < h - 1) {
                if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4);
                v = Math.min(v, d[i + w] + 3);
                if (x > 0) v = Math.min(v, d[i + w - 1] + 4);
            }
            if (x < w - 1) v = Math.min(v, d[i + 1] + 3);
            d[i] = v;
        }
    }

    for (let i = 0; i < d.length; i++) d[i] = d[i] * (1 / 3);
    return d;
}

function buildLogo() {
    /*
     * The silhouette is traced at LOGO_DETAIL times the contour grid, and the
     * distance field is measured at that finer scale before being sampled back
     * down. That matters more than it sounds: the contour crossings are
     * interpolated along cell edges, and a distance field is close to linear,
     * so an accurate one puts the rim well inside a cell rather than snapping
     * it to cell corners. Measuring at grid resolution is what made the
     * monogram's edges look chipped.
     *
     * This runs once per resize, so the cost is a few ms at startup, not per
     * frame — the grid itself, and every frame's work, is unchanged.
     */
    const S = LOGO_DETAIL;
    const w = cols + 1, h = rows + 1;
    const W = w * S, H = h * S;

    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const octx = off.getContext('2d', { willReadFrequently: true });

    // Fit the 1000x1100 viewBox into the grid, centred. The span is measured
    // against the visible rows, not the overscanned ones, so the island keeps
    // its size on screen.
    const s = (LOGO_SPAN * (height / cell)) / 1100 * S;
    octx.setTransform(s, 0, 0, s, W / 2 - 500 * s, H / 2 - 550 * s);
    octx.fillStyle = '#fff';
    svg.querySelectorAll('path').forEach(p => {
        octx.fill(new Path2D(p.getAttribute('d')));
    });

    const px = octx.getImageData(0, 0, W, H).data;
    const solid = new Float32Array(W * H);
    const hollow = new Float32Array(W * H);
    for (let i = 0; i < solid.length; i++) {
        solid[i] = px[i * 4 + 3] * (1 / 255);
        hollow[i] = 1 - solid[i];
    }

    // Signed distance to the silhouette: positive outside, negative inside,
    // scaled back from fine pixels into grid cells.
    const outer = distanceTransform(solid, W, H);
    const inner = distanceTransform(hollow, W, H);
    const sdf = new Float32Array(W * H);
    for (let i = 0; i < sdf.length; i++) sdf[i] = (outer[i] - inner[i]) / S;
    boxBlur(sdf, W, H, 1, 1); // soften the chamfer's octagonal bias

    /*
     * The island as a rigid solid, measured relative to its own rim (0 at the
     * silhouette, positive within). Inside it domes very gently; outside it
     * falls away at a constant slope, which makes an even staircase of plates
     * rather than the bunching an exponential skirt gives. Nothing here moves —
     * sampleField slides the whole shape up and down by adding one offset.
     */
    mesa = new Float32Array(w * h);
    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            const s2 = sdf[(j * S) * W + i * S];
            mesa[j * w + i] = s2 <= 0
                ? -s2 / INNER_SCALE                   // gentle dome toward the middle
                : Math.max(-4, -s2 / FALLOFF);        // skirt, at a constant slope
        }
    }
}

// Bilinear read of the island, for sampling it at a rotated position.
function sampleMesa(x, y) {
    if (x < 0) x = 0; else if (x > cols) x = cols;
    if (y < 0) y = 0; else if (y > rows) y = rows;
    const w = cols + 1;
    const x0 = x | 0, y0 = y | 0;
    const x1 = x0 < cols ? x0 + 1 : x0;
    const y1 = y0 < rows ? y0 + 1 : y0;
    const fx = x - x0, fy = y - y0;
    const r0 = y0 * w, r1 = y1 * w;
    const a = mesa[r0 + x0], b = mesa[r0 + x1];
    const c = mesa[r1 + x0], d = mesa[r1 + x1];
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

// --- height field -----------------------------------------------------------

// Smooth maximum. Blends over a band of k instead of creasing at the meeting
// point, so the plain swells as the island approaches from underneath.
function smax(a, b, k) {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.max(a, b) + h * h * k * 0.25;
}

/*
 * The ground is the union of two solids: the drifting terrain, and the island
 * sliding vertically underneath it. Taking the higher of the two is what makes
 * the logo genuinely submersible — at the bottom of the cycle its rim sits
 * SINK below the plain's floor, the terrain simply wins everywhere, and the
 * area is ordinary map with ordinary noise running through it. There is no
 * outline left behind because there is no logo in the surface at all.
 *
 * Rising, it swells the plain from below (the blend band of smax), breaks
 * through the low ground first and knits together as the rest surfaces, then
 * stands clear. Where the island wins, the surface is the island alone, so its
 * plates come out clean without needing the noise damped around them.
 */
/*
 * Yaw is applied here, to the world being sampled, rather than to the camera.
 * For a ground plane that runs past every edge of the screen the two are the
 * same thing — turning the camera around leaves the plane looking identical
 * and only swings the content across it. Doing it this way keeps the grid
 * square to the camera, which the horizon depends on: it walks grid rows from
 * near to far, and that is only a depth order while rows are lines of equal
 * depth. Yawing the camera itself would skew them and quietly break the
 * culling. It also means the grid still covers the screen exactly, with no
 * corner swinging into view.
 */
function sampleField(t) {
    const w = cols + 1;
    breath = 0.5 + 0.5 * Math.sin(t * (2 * Math.PI / BREATH_PERIOD));
    rise = breath * breath * (3 - 2 * breath); // dwell at both ends of the cycle

    // Rim height: below the plain's floor when sunk, full height when risen.
    const top = -SINK + (LOGO_HEIGHT + SINK) * rise;

    const drift = t * DRIFT;
    const z = t * EVOLVE;

    for (let j = 0; j <= rows; j++) {
        const row = j * w;
        const dj = j - halfRows;
        for (let i = 0; i <= cols; i++) {
            const di = i - halfCols;

            // Where this node reads from, once the world is turned.
            const rx = di * cosY - dj * sinY;
            const ry = di * sinY + dj * cosY;

            const ground = fbm((rx + halfCols) * NOISE_SCALE + drift,
                               (ry + halfRows) * NOISE_SCALE - drift * 0.6,
                               z) * NOISE_AMP;

            const m = sampleMesa(rx + halfCols, ry + halfRows);
            const island = top + m;

            const k = row + i;
            field[k] = smax(ground, island, BLEND);
            // Inside the silhouette (the island's rim is 0) and actually
            // surfaced here — so a sunk logo leaves no bright trace behind.
            onIsland[k] = (m > 0 && island > ground) ? 1 : 0;
        }
    }
}

// --- camera -----------------------------------------------------------------

/*
 * The camera looks along (0, -sin P, cos P): forward is +z (away, toward the
 * top of the screen) and tilted down by the pitch. Grid row 0 is the far edge.
 * Elevation shortens depth, so high ground sits closer to the camera and grows.
 */

let pX = 0, pY = 0;

function project(gi, gj, h) {
    const wy = (h - ELEV_REF) * ELEV_SCALE;
    const wz = halfRows - gj;
    const scale = FOCAL / (FOCAL + wz * cosP - wy * sinP);
    pX = cx + (gi - halfCols) * scale * zoom;
    pY = cy + (-wy * cosP - wz * sinP) * scale * zoom;
}

// --- hidden line removal ----------------------------------------------------

/*
 * Floating horizon. Cell rows are walked from the near edge of the map to the
 * far edge, and each row's surface profile is rasterised into `horizon` as the
 * lowest screen y seen so far per column. Terrain covers the screen downward
 * from its own profile, so anything farther that lands below the horizon is
 * behind a nearer ridge and gets dropped. The cliffs around the logo are far
 * steeper than the camera pitch, so their back faces cull away entirely
 * instead of tangling over the front.
 *
 * A contour crossing sits where field == level, so it lies exactly on the
 * surface the horizon is built from — the two agree by construction.
 */

let horizon, hw;

function rasterizeHorizon(x0, y0, x1, y1) {
    if (x1 < x0) {
        let t = x0; x0 = x1; x1 = t;
        t = y0; y0 = y1; y1 = t;
    }
    let ix0 = Math.floor(x0), ix1 = Math.ceil(x1);
    if (ix1 < 0 || ix0 > hw - 1) return;
    if (ix0 < 0) ix0 = 0;
    if (ix1 > hw - 1) ix1 = hw - 1;

    const dx = x1 - x0;
    const dy = y1 - y0;
    for (let x = ix0; x <= ix1; x++) {
        let t = dx > 1e-6 ? (x - x0) / dx : 0;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const y = y0 + dy * t;
        if (y < horizon[x]) horizon[x] = y;
    }
}

// Rasterise one node row's surface profile into the horizon.
function addHorizonRow(j) {
    const row = j * (cols + 1);
    project(0, j, field[row]);
    let px = pX, py = pY;
    for (let i = 1; i <= cols; i++) {
        project(i, j, field[row + i]);
        rasterizeHorizon(px, py, pX, pY);
        px = pX; py = pY;
    }
}

function visible(x, y) {
    let ix = x | 0;
    if (ix < 0) ix = 0; else if (ix > hw - 1) ix = hw - 1;
    return y <= horizon[ix] + HORIZON_EPS;
}

// --- marching squares -------------------------------------------------------

function buildContours() {
    for (let i = 0; i < LEVEL_COUNT; i++) { levelSegs[i].length = 0; levelSegsLit[i].length = 0; }
    const w = cols + 1;

    horizon.fill(Infinity);
    addHorizonRow(rows); // the near edge of the map occludes nothing but itself

    // Near to far, so the horizon always holds everything closer than this row.
    for (let j = rows - 1; j >= 0; j--) {
        addHorizonRow(j + 1);

        for (let i = 0; i < cols; i++) {
            const k = j * w + i;
            const a = field[k], b = field[k + 1], c = field[k + w + 1], d = field[k + w];

            let mn = a, mx = a;
            if (b < mn) mn = b; else if (b > mx) mx = b;
            if (c < mn) mn = c; else if (c > mx) mx = c;
            if (d < mn) mn = d; else if (d > mx) mx = d;

            let lo = Math.ceil(mn / LEVEL_STEP);
            let hi = Math.floor(mx / LEVEL_STEP);
            if (lo < 0) lo = 0;
            if (hi >= LEVEL_COUNT) hi = LEVEL_COUNT - 1;
            if (lo > hi) continue;

            const x0 = i, y0 = j, x1 = i + 1, y1 = j + 1;

            // Only lines standing on the surfaced island get the heavier weight.
            const lit = onIsland[k] === 1;

            for (let L = lo; L <= hi; L++) {
                const v = L * LEVEL_STEP;

                let idx = 0;
                if (a > v) idx |= 8;
                if (b > v) idx |= 4;
                if (c > v) idx |= 2;
                if (d > v) idx |= 1;
                if (idx === 0 || idx === 15) continue;

                // Crossing points on the top, right, bottom and left edges. A
                // crossing sits where the surface passes through v, so v is
                // its height.
                project(x0 + (b !== a ? (v - a) / (b - a) : 0.5), y0, v);
                const tX = pX, tY = pY, tV = visible(pX, pY);

                project(x1, y0 + (c !== b ? (v - b) / (c - b) : 0.5), v);
                const rX = pX, rY = pY, rV = visible(pX, pY);

                project(x0 + (c !== d ? (v - d) / (c - d) : 0.5), y1, v);
                const bX = pX, bY = pY, bV = visible(pX, pY);

                project(x0, y0 + (d !== a ? (v - a) / (d - a) : 0.5), v);
                const lX = pX, lY = pY, lV = visible(pX, pY);

                const segs = lit ? levelSegsLit[L] : levelSegs[L];

                switch (idx) {
                    case 1: case 14:
                        if (lV && bV) segs.push(lX, lY, bX, bY);
                        break;
                    case 2: case 13:
                        if (bV && rV) segs.push(bX, bY, rX, rY);
                        break;
                    case 3: case 12:
                        if (lV && rV) segs.push(lX, lY, rX, rY);
                        break;
                    case 4: case 11:
                        if (tV && rV) segs.push(tX, tY, rX, rY);
                        break;
                    case 6: case 9:
                        if (tV && bV) segs.push(tX, tY, bX, bY);
                        break;
                    case 7: case 8:
                        if (lV && tV) segs.push(lX, lY, tX, tY);
                        break;
                    case 5:
                        if ((a + b + c + d) * 0.25 > v) {
                            if (lV && tV) segs.push(lX, lY, tX, tY);
                            if (bV && rV) segs.push(bX, bY, rX, rY);
                        } else {
                            if (lV && bV) segs.push(lX, lY, bX, bY);
                            if (tV && rV) segs.push(tX, tY, rX, rY);
                        }
                        break;
                    case 10:
                        if ((a + b + c + d) * 0.25 > v) {
                            if (lV && bV) segs.push(lX, lY, bX, bY);
                            if (tV && rV) segs.push(tX, tY, rX, rY);
                        } else {
                            if (lV && tV) segs.push(lX, lY, tX, tY);
                            if (bV && rV) segs.push(bX, bY, rX, rY);
                        }
                        break;
                }
            }
        }
    }
}

function strokeSegs(segs, alpha, lineWidth) {
    if (segs.length === 0) return;
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = isDark
        ? `rgba(255,255,255,${alpha})`
        : `rgba(26,26,26,${alpha})`;

    ctx.beginPath();
    for (let s = 0; s < segs.length; s += 4) {
        ctx.moveTo(segs[s], segs[s + 1]);
        ctx.lineTo(segs[s + 2], segs[s + 3]);
    }
    ctx.stroke();
}

function draw(t) {
    ctx.clearRect(0, 0, width, height);

    // Every segment is its own subpath, so joins never apply and caps would
    // only add two arcs per segment. Neighbouring segments share endpoints
    // exactly, so butt caps leave nothing visible behind.
    ctx.lineCap = 'butt';

    // The lit lines pulse between a readable floor and full strength.
    const litAlpha = 0.62 + 0.38 * rise;

    // Low layers first: they are the farthest, so this is back to front.
    for (let L = 0; L < LEVEL_COUNT; L++) {
        if (levelSegs[L].length === 0 && levelSegsLit[L].length === 0) continue;

        const isIndex = L % INDEX_EVERY === 0;
        const ramp = Math.min(1, (L * LEVEL_STEP) / ALPHA_REF);

        // The hover is applied in screen space, after the horizon has already
        // decided what is visible. Bobbing before the test would make lines
        // pop in and out along every silhouette.
        ctx.save();
        ctx.translate(0, Math.sin(t * BOB_SPEED + L * BOB_PHASE) * BOB_PX);

        let alpha = 0.24 + 0.52 * Math.pow(ramp, 1.2);
        if (isIndex) alpha = Math.min(1, alpha * 1.35);
        strokeSegs(levelSegs[L], alpha, isIndex ? 1.4 : 0.8);

        strokeSegs(levelSegsLit[L], isIndex ? litAlpha : litAlpha * 0.75,
                   isIndex ? 1.9 : 1.1);
        ctx.restore();
    }

    // Haze the far edge of the ground away rather than letting it end in a
    // hard line. Erasing is cheaper than a fog term per segment, and it lets
    // the page background show through untouched.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, width, height * FOG_SPAN);
    ctx.globalCompositeOperation = 'source-over';
}

function buildFog() {
    if (!height) return;
    fog = ctx.createLinearGradient(0, 0, 0, height * FOG_SPAN);
    fog.addColorStop(0, 'rgba(0,0,0,1)');
    fog.addColorStop(0.55, 'rgba(0,0,0,0.35)');
    fog.addColorStop(1, 'rgba(0,0,0,0)');
}

function animate() {
    const t = performance.now() * 0.001;
    updateCamera();
    sampleField(t);
    buildContours();
    draw(t);
    requestAnimationFrame(animate);
}

function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cell = Math.max(MIN_CELL, width / TARGET_COLS);
    cols = Math.ceil(width / cell);
    rows = Math.ceil((height / cell) * ROW_OVERSCAN);
    halfCols = cols / 2;
    halfRows = rows / 2;
    const nodes = (cols + 1) * (rows + 1);
    field = new Float32Array(nodes);
    onIsland = new Uint8Array(nodes);
    hw = Math.ceil(width);
    horizon = new Float32Array(hw);

    cx = width / 2;
    cy = height / 2;
    // Wide enough that the ground still spans the screen at its far edge,
    // where perspective has shrunk it the most.
    zoom = width / (cols * 0.95);

    buildFog();
    buildLogo();
}

function setup() {
    resize();

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 150);
    });

    window.addEventListener('mousemove', e => {
        yawTarget = YAW + ((e.clientX / width) * 2 - 1) * YAW_RANGE;
        pitchTarget = PITCH + ((e.clientY / height) * 2 - 1) * TILT_RANGE;
    });
    window.addEventListener('mouseout', () => {
        yawTarget = YAW;
        pitchTarget = PITCH;
    });

    animate();
}

setup();
