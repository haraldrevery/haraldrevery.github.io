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
 *
 * The cursor adds a hill: a soft swell in the terrain under the pointer,
 * unprojected back onto the ground plane so it sits where the cursor is
 * rather than where the pixel is. It is part of the terrain, not an overlay,
 * so the contours bend around it and it occludes what is behind it.
 *
 * A click drops a stone in it: a ring travels out from the point struck,
 * fading as it goes. That one rides on top of the finished surface rather than
 * inside the terrain, so the logo's plates and its traced outline ride it too
 * and the whole relief model rocks like a sheet before settling.
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

// With no cursor on it — a TV, say — the view turns slowly by itself. Two
// waves at unrelated periods, so it wanders instead of visibly repeating, and
// neither lines up with the island's breathing. DRIFT_YAW is the swing either
// side of YAW, in degrees; set it to 0 to park the camera. A cursor takes over
// the moment it moves, and hands back once it has sat still for MOUSE_IDLE
// seconds — otherwise a cursor abandoned on screen would freeze the drift.
const DRIFT_YAW = 14 * Math.PI / 180;
const DRIFT_PERIOD = 28;           // seconds for the main swing
const MOUSE_IDLE = 4;              // seconds of a still cursor before drift resumes

const FOCAL = 420;                 // world units; smaller = stronger perspective
const ELEV_SCALE = 22;             // world units per unit of field height
const ELEV_REF = 1.0;              // field height that sits on the horizon line
const BOB_PX = 5;                  // hover height, in pixels
const BOB_SPEED = 0.55;            // radians per second
const BOB_PHASE = 0.55;            // radians of offset per layer
const HORIZON_EPS = 1.5;           // px of slack, so grazing lines survive
const FOG_SPAN = 0.45;             // fraction of the screen the far haze covers

// Terrain
const NOISE_SCALE = 0.08;    // per grid cell
const NOISE_AMP = 0.62;
const DRIFT = 0.02;           // noise units per second
const EVOLVE = 0.05;          // z travel per second

// Cursor hill
//
// >>> THE BUMP UNDER THE POINTER — TWEAK IT HERE <<<
// A swell added to the terrain (not to the island, which stays rigid) at the
// spot on the ground plane the cursor is pointing at. RADIUS is its half-width
// in grid cells, HEIGHT its peak in field units — for scale, LEVEL_STEP is the
// gap between two contour lines, so 0.45 is five lines' worth of lift. EASE is
// how lazily it slides after the cursor, FADE how quickly it grows in when a
// cursor arrives and dies away when one leaves the window.
const HILL_RADIUS = 10;       // grid cells
const HILL_HEIGHT = 0.6;     // field units at the peak
const HILL_EASE = 0.14;
const HILL_FADE = 0.05;
const HILL_R2 = HILL_RADIUS * HILL_RADIUS;
// The height the cursor is taken to be touching, when the screen point is
// unprojected back onto the ground. The plain averages around half NOISE_AMP,
// and the hill stands on top of it, so aiming at that puts the cursor on the
// swell's crown instead of on the flat some distance beyond it.
const HILL_REF_H = NOISE_AMP * 0.5 + HILL_HEIGHT;

// Click ripple
//
// >>> THE DROPLET WAVE — TWEAK IT HERE <<<
// A ring expanding from wherever the pointer was pressed. Unlike the hill this
// is laid over the finished surface, so the island rides it instead of hiding
// it: the monogram's plates and its outline rock as the wave goes through.
// HEIGHT is the crest at birth in field units (LEVEL_STEP is one contour line
// apart, so 0.5 is about five lines of lift); SPEED and LIFE together set how
// far it gets — 30 x 2.8 is roughly half the screen. WIDTH is the half-width of
// the packet, so a bigger number is a longer, lazier swell. SPREAD is the
// distance over which the crest loses half its height to the ring growing
// longer. LOBES is how many crests are in the packet: 1 is a single droplet
// ring, 2-3 makes it a train chasing itself outward.
const RIPPLE_MAX = 4;         // rings at once; a fifth click recycles the oldest
const RIPPLE_HEIGHT = 0.5;    // field units at the crest, at birth
const RIPPLE_SPEED = 30;      // grid cells per second
const RIPPLE_WIDTH = 7;       // grid cells, half-width of the packet
const RIPPLE_LIFE = 2.8;      // seconds from click to nothing
const RIPPLE_SPREAD = 55;     // cells over which the crest halves
const RIPPLE_LOBES = 1;
const RIPPLE_INV_W = 1 / RIPPLE_WIDTH;
const RIPPLE_WAVE = Math.PI * RIPPLE_LOBES;

// Logo island. Distances below are in grid cells.
//
// >>> LOGO RESOLUTION — RAISE THIS FOR A SHARPER SILHOUETTE <<<
// How many times finer than the contour grid the SVG is traced and its
// distance field measured. 1 measures at grid resolution and the monogram's
// edges come out chipped; 3-4 is plenty. Costs a little memory and a few ms
// at startup and on resize — never per frame — so the only real reason not to
// crank it is diminishing returns.
const LOGO_DETAIL = 3;

// The rim is traced from the SVG itself, so it is not limited by the grid at
// all. RIM_STEP is the spacing between samples along the outline, in SVG units
// (the logo is 1100 tall); ~3 lands around 2px on screen. Lower it if the
// curves ever look faceted.
const RIM_STEP = 3;

// >>> RIM OPACITY — SET THE FADE HERE <<<
// The traced outline fades in as the island rises, so it arrives rather than
// switching on. MIN is the instant it first breaks the surface, MAX is full
// height at the top of the cycle. Set both the same for a flat opacity, or MIN
// to 0 (as here) to have it wash in from nothing.
const RIM_ALPHA_MIN = 0.0;
const RIM_ALPHA_MAX = 1.0;

const LOGO_SPAN = 0.62;       // fraction of viewport height

// >>> LOGO POSITION — NUDGE IT HERE <<<
// Offsets from centre, as a fraction of the viewport: X positive moves it
// right, Y positive moves it down. Y also walks it toward the camera across
// the ground plane, so it grows a little as it comes down and shrinks as it
// goes up — that is the perspective, not a bug. Keep them modest: the island
// is carved out of the grid, and pushing it far enough to reach an edge will
// clip its skirt.
const LOGO_SHIFT_X = -0.036;
const LOGO_SHIFT_Y = 0;
const FALLOFF = 9;            // cells the skirt takes to drop one unit;
                              // smaller = steeper cliffs, plates stack tighter
const INNER_SCALE = 50;      // how gently the top domes toward the middle
const LOGO_HEIGHT = 1.15;     // rim height at full rise, above the plain's floor
const SINK = 0.5;             // how far below that floor it hides when sunk;
                              // must exceed BLEND or a ghost swell shows through
const BLEND = 0.28;           // width of the union's blend band
const BREATH_PERIOD = 24;     // seconds

// >>> HOW LONG THE LOGO STAYS HIDDEN <<<
// The fraction of each cycle the island spends entirely under the map. The
// motion is a triangle wave eased with a smoothstep, which left to itself
// keeps the logo out of sight for about 0.37 of the period; this warps the
// wave to hit whatever share is asked for instead. BREATH_PERIOD and the
// height it reaches are untouched — only the shape of the climb changes, so
// the time saved down there is spent dwelling at the top. Keep it under the
// natural 0.37: asking for more makes it loiter at the bottom instead.
const SUBMERGE_SHARE = 0.28;

// Where in the cycle the animation starts, as a fraction of the period. 0.5 is
// the top; a little under that opens with the logo up and still rising, so the
// page does not load onto a held pose.
const BREATH_OFFSET = 0.45;

// The rise at which the island's rim reaches the plain's floor — the first
// moment any of it can surface. Below this it is under the map no matter what
// the terrain is doing, so the rim fade is measured from here rather than from
// the bottom of the cycle; otherwise RIM_ALPHA_MIN would be a value that never
// actually appears on screen. Derived, so it follows SINK and LOGO_HEIGHT.
const RISE_SURFACED = SINK / (LOGO_HEIGHT + SINK);

// Turning SUBMERGE_SHARE into the warp that delivers it. The triangle wave
// sits below any threshold x for exactly x of its period, so all that is
// needed is a curve sending SUBMERGE_SHARE to whatever raw phase the
// smoothstep maps onto RISE_SURFACED. A power curve does it, holds both ends
// of the range put, and stays monotonic, so nothing downstream notices.
const SURFACE_PHASE = 0.5 - Math.sin(Math.asin(1 - 2 * RISE_SURFACED) / 3);
const BREATH_WARP = Math.log(SURFACE_PHASE) / Math.log(SUBMERGE_SHARE);

let width, height, dpr, cell;
let cols, rows, halfCols, halfRows;
let field, onIsland, mesa;
let rimX, rimY, rimBreak, rimI, rimJ, rimH, rimSx, rimSy, rimOk;
const rimBuckets = [];
let islandTop = 0;
let breath = 0, rise = 1;
let cx, cy, zoom, fog;

// Live camera: drifting on its own, or eased toward the mouse when there is one.
let yaw = YAW, pitch = PITCH;
let yawTarget = YAW, pitchTarget = PITCH;
let mouseInside = false, mouseLast = -1e9;
let mouseX = 0, mouseY = 0;

// The hill, in the same camera-grid coordinates the field is sampled in, so it
// stays put under the cursor while the world yaws underneath it.
let hillI = 0, hillJ = 0, hillAmp = 0, hillPlaced = false;

// Ripples, in those same coordinates. A click writes a slot in the pool; the
// slots are recycled round-robin, so a burst of clicking costs nothing and
// allocates nothing. Everything a frame needs to evaluate a ring — its radius,
// what is left of its amplitude, the band it occupies — is worked out once in
// updateRipples and read straight out of the scratch arrays by the node loop.
const rippleSrcI = new Float32Array(RIPPLE_MAX);
const rippleSrcJ = new Float32Array(RIPPLE_MAX);
const rippleBorn = new Float64Array(RIPPLE_MAX);
let rippleNext = 0, rippleSeeded = 0;

const rpI = new Float32Array(RIPPLE_MAX);
const rpJ = new Float32Array(RIPPLE_MAX);
const rpR = new Float32Array(RIPPLE_MAX);      // radius of the ring, in cells
const rpAmp = new Float32Array(RIPPLE_MAX);
const rpIn2 = new Float32Array(RIPPLE_MAX);    // squared radii of the band the
const rpOut2 = new Float32Array(RIPPLE_MAX);   // packet occupies
const rpOut = new Float32Array(RIPPLE_MAX);    // unsquared, for the row test
let rippleLive = 0;
let sinP = Math.sin(PITCH), cosP = Math.cos(PITCH);
let sinY = Math.sin(YAW), cosY = Math.cos(YAW);

function updateCamera(t) {
    // The cursor only holds the camera while it is actually being moved.
    if (!(mouseInside && t - mouseLast < MOUSE_IDLE)) {
        const swing = Math.sin(t * (2 * Math.PI / DRIFT_PERIOD)) * 0.75
                    + Math.sin(t * (2 * Math.PI / (DRIFT_PERIOD * 0.41))) * 0.25;
        yawTarget = YAW + swing * DRIFT_YAW;
        pitchTarget = PITCH;
    }

    // Easing does the handover in both directions, so the drift picks up from
    // wherever the cursor left the view rather than snapping back.
    yaw += (yawTarget - yaw) * ORBIT_EASE;
    pitch += (pitchTarget - pitch) * ORBIT_EASE;
    sinP = Math.sin(pitch); cosP = Math.cos(pitch);
    sinY = Math.sin(yaw); cosY = Math.cos(yaw);
}

/*
 * Screen pixel back to a grid position — project() run backwards.
 *
 * project() needs a grid node and a height to give a pixel; going the other way
 * the height is the one thing the screen cannot supply, so it is passed in.
 * Solving pY for the depth gives
 *
 *     wz = (wy * (Y sinP - FOCAL cosP) - Y FOCAL) / (Y cosP + FOCAL sinP)
 *
 * with Y the pixel's offset from the centre in world units. The denominator is
 * the horizon: it goes to zero for a point level with it and negative above,
 * which is the sky and has no ground position at all — hence the return value.
 * pX then divides out by the same perspective scale.
 *
 * Writes gX/gY rather than returning a pair, the way project() writes pX/pY:
 * this runs per pointer event and per frame, and neither wants the garbage.
 */
let gX = 0, gY = 0;

function screenToGrid(sx, sy, h) {
    const Y = (sy - cy) / zoom;
    const den = FOCAL * sinP + Y * cosP;
    if (den <= 1e-3) return false;              // at or above the horizon

    const wy = (h - ELEV_REF) * ELEV_SCALE;
    const wz = (wy * (Y * sinP - FOCAL * cosP) - Y * FOCAL) / den;
    const scale = FOCAL / (FOCAL + wz * cosP - wy * sinP);
    gX = halfCols + (sx - cx) / (scale * zoom);
    gY = halfRows - wz;
    return true;
}

// Put the hill where the cursor is pointing.
function updateHill() {
    let want = 0;

    if (mouseInside && screenToGrid(mouseX, mouseY, HILL_REF_H)) {
        // Easing in grid space rather than screen space, so the swell trails
        // the cursor across the ground instead of across the pixels — the same
        // lag looks longer near the horizon, which is right.
        if (hillPlaced) {
            hillI += (gX - hillI) * HILL_EASE;
            hillJ += (gY - hillJ) * HILL_EASE;
        } else {
            hillI = gX; hillJ = gY; hillPlaced = true;
        }
        want = 1;
    }

    hillAmp += (want - hillAmp) * HILL_FADE;
    // Fully gone: forget the position too, so the next cursor swells where it
    // actually is rather than sliding in from wherever the last one stopped.
    if (hillAmp < 1e-3) { hillAmp = 0; hillPlaced = false; }
}

// The swell itself. Zero value and zero slope at the rim, so it meets the
// terrain without a crease for the contours to catch on.
function hillAt(gi, gj) {
    const dx = gi - hillI, dy = gj - hillJ;
    const r2 = dx * dx + dy * dy;
    if (r2 >= HILL_R2) return 0;
    const u = 1 - r2 / HILL_R2;
    return HILL_HEIGHT * hillAmp * u * u;
}

// A click, taken back to the ground and dropped in the pool. Recorded as an
// origin and a birth time, not as a shape: the shape is whatever that origin
// and time have grown into by the frame that reads it.
function addRipple(sx, sy, t) {
    if (!screenToGrid(sx, sy, HILL_REF_H)) return;   // clicked the sky

    rippleSrcI[rippleNext] = gX;
    rippleSrcJ[rippleNext] = gY;
    rippleBorn[rippleNext] = t;
    rippleNext = (rippleNext + 1) % RIPPLE_MAX;
    if (rippleSeeded < RIPPLE_MAX) rippleSeeded++;
}

/*
 * Age every ring once a frame and compact the survivors to the front of the
 * scratch arrays. Doing it here rather than inside rippleAt is the whole reason
 * the effect is affordable: the node loop runs tens of thousands of times a
 * frame and must not be working out radii and decay curves while it does.
 */
function updateRipples(t) {
    rippleLive = 0;

    for (let s = 0; s < rippleSeeded; s++) {
        const age = t - rippleBorn[s];
        if (age < 0 || age >= RIPPLE_LIFE) continue;

        const R = age * RIPPLE_SPEED;
        const a = age / RIPPLE_LIFE;
        const fade = (1 - a) * (1 - a);
        // Two separate losses: the ring retiring on its own clock, and its
        // energy thinning as it is smeared around an ever-longer circle.
        const amp = RIPPLE_HEIGHT * fade / (1 + R / RIPPLE_SPREAD);

        // Clamped at zero rather than folded, so a ring younger than its own
        // width is a blob covering the point struck. That is what reads as the
        // impact — without it the wave would appear out of nowhere at radius W.
        const inner = R - RIPPLE_WIDTH;
        const outer = R + RIPPLE_WIDTH;

        const k = rippleLive++;
        rpI[k] = rippleSrcI[s];
        rpJ[k] = rippleSrcJ[s];
        rpR[k] = R;
        rpAmp[k] = amp;
        rpIn2[k] = inner > 0 ? inner * inner : 0;
        rpOut2[k] = outer * outer;
        rpOut[k] = outer;
    }
}

/*
 * The wave at one grid position: every live ring summed.
 *
 * The band test is on squared distance, so the common case — a node nowhere
 * near this ring — costs two multiplies and a compare and never touches a
 * square root. Only nodes actually inside the packet pay for the profile.
 */
function rippleAt(gi, gj) {
    let sum = 0;
    for (let k = 0; k < rippleLive; k++) {
        const dx = gi - rpI[k], dy = gj - rpJ[k];
        const d2 = dx * dx + dy * dy;
        if (d2 <= rpIn2[k] || d2 >= rpOut2[k]) continue;

        // -1 behind the front, 0 on it, +1 ahead of it.
        const u = (Math.sqrt(d2) - rpR[k]) * RIPPLE_INV_W;
        // Windowed to zero in value and slope at both ends of the packet, so
        // the wave dies into the surface instead of stepping off it.
        const win = 1 - u * u;
        sum += rpAmp[k] * Math.cos(RIPPLE_WAVE * u) * win * win;
    }
    return sum;
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

    // Fit the 1000x1100 viewBox into the grid, centred, then nudged. The span
    // is measured against the visible rows, not the overscanned ones, so the
    // island keeps its size on screen.
    const sg = (LOGO_SPAN * (height / cell)) / 1100;   // grid units per SVG unit
    const s = sg * S;

    // Offsets are a fraction of the viewport, converted to grid cells. Divide
    // by zoom rather than cell — that is what the camera actually scales by —
    // and the vertical by sin(PITCH) as well, since moving across a tilted
    // ground plane is foreshortened. Lands within a couple of percent; the
    // last of it is the perspective, which no constant can fix because the
    // near and far ends of the logo move by different amounts.
    const ox = LOGO_SHIFT_X * width / zoom;
    const oy = LOGO_SHIFT_Y * height / (zoom * Math.sin(PITCH));

    octx.setTransform(s, 0, 0, s,
                      W / 2 - 500 * s + ox * S,
                      H / 2 - 550 * s + oy * S);
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

    // Same placement as the raster above, minus the supersampling.
    // Same placement as the raster above, minus the supersampling.
    buildRim(sg, w / 2 - 500 * sg + ox, h / 2 - 550 * sg + oy);
}

/*
 * The rim, traced from the SVG rather than pulled off the grid.
 *
 * Every other line comes out of marching squares on a ~10px grid, which rounds
 * the monogram's finer detail off and merges anything thinner than a cell or
 * two. The rim is the one line that has to read as the logo, and it happens to
 * be exactly the SVG outline at the island's rim height — the island is built
 * from the distance to that outline, so distance zero is the path itself.
 *
 * So it gets traced from the path data at full precision and projected point
 * by point. Stroking a transformed Path2D would not work: perspective is not
 * an affine transform, and every point sits at a different depth.
 */
function buildRim(sg, gox, goy) {
    const xs = [], ys = [], breaks = [];

    svg.querySelectorAll('path').forEach(p => {
        const len = p.getTotalLength();
        let first = true;
        // The four outlines are disjoint, so each one is silhouette throughout.
        for (let d = 0; d <= len; d += RIM_STEP) {
            const pt = p.getPointAtLength(Math.min(d, len));
            xs.push(pt.x * sg + gox);
            ys.push(pt.y * sg + goy);
            breaks.push(first ? 1 : 0);
            first = false;
        }
    });

    const n = xs.length;
    rimX = Float32Array.from(xs);
    rimY = Float32Array.from(ys);
    rimBreak = Uint8Array.from(breaks);
    rimI = new Float32Array(n);
    rimJ = new Float32Array(n);
    rimH = new Float32Array(n);
    rimSx = new Float32Array(n);
    rimSy = new Float32Array(n);
    rimOk = new Uint8Array(n);
}

/*
 * Place each rim point for this frame: drop the ones the plain still covers,
 * ride the same blended surface the plates do, and undo the yaw to find which
 * grid row the point falls in. The horizon is only a depth order while it is
 * being built, so points are bucketed by row and tested inside that sweep.
 */
function prepRim(t, top) {
    const drift = t * DRIFT;
    const z = t * EVOLVE;
    for (let b = 0; b < rimBuckets.length; b++) rimBuckets[b].length = 0;

    for (let p = 0; p < rimX.length; p++) {
        const mx = rimX[p], my = rimY[p];

        // Camera-grid position first: the hill lives in those coordinates, and
        // the rim has to feel it the same way the plates do, or it would hang
        // in the air through a swell the terrain around it has already risen
        // over.
        const rx = mx - halfCols, ry = my - halfRows;
        const ci = rx * cosY + ry * sinY + halfCols;
        const cj = -rx * sinY + ry * cosY + halfRows;

        let ground = fbm(mx * NOISE_SCALE + drift,
                         my * NOISE_SCALE - drift * 0.6, z) * NOISE_AMP;
        if (hillAmp > 0) ground += hillAt(ci, cj);
        if (ground >= top) { rimOk[p] = 0; continue; } // still under the plain

        rimOk[p] = 1;
        // The ripple goes on after the union, so the outline rides the wave
        // along with the plates it sits on. Deliberately not part of the test
        // above: measuring cover against a rippled ground would make the rim
        // blink out every time a crest swept across it.
        rimH[p] = smax(ground, top, BLEND)
                + (rippleLive > 0 ? rippleAt(ci, cj) : 0);
        rimI[p] = ci;
        rimJ[p] = cj;

        let b = rimJ[p] | 0;
        if (b < 0) b = 0; else if (b > rows - 1) b = rows - 1;
        rimBuckets[b].push(p);
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

    // Triangle wave, warped so the sunk stretch takes SUBMERGE_SHARE of the
    // period, then smoothstepped — which is what puts the dwell at the top.
    const u = (t / BREATH_PERIOD + BREATH_OFFSET) % 1;
    breath = Math.pow(1 - Math.abs(2 * u - 1), BREATH_WARP);
    rise = breath * breath * (3 - 2 * breath);

    // Rim height: below the plain's floor when sunk, full height when risen.
    const top = -SINK + (LOGO_HEIGHT + SINK) * rise;
    islandTop = top;

    const drift = t * DRIFT;
    const z = t * EVOLVE;

    for (let j = 0; j <= rows; j++) {
        const row = j * w;
        const dj = j - halfRows;

        // Whole rows miss the hill entirely; skipping them keeps it off the
        // hot path when it is inactive and cheap when it is not.
        const hillRow = hillAmp > 0 && Math.abs(j - hillJ) < HILL_RADIUS;

        // Same for the rings: a row no packet reaches skips the whole test.
        let rippleRow = false;
        for (let k = 0; k < rippleLive; k++) {
            if (Math.abs(j - rpJ[k]) < rpOut[k]) { rippleRow = true; break; }
        }

        for (let i = 0; i <= cols; i++) {
            const di = i - halfCols;

            // Where this node reads from, once the world is turned.
            const rx = di * cosY - dj * sinY;
            const ry = di * sinY + dj * cosY;

            // The hill is added in camera-grid space, not world space, so it
            // is pinned to the cursor rather than drifting with the noise.
            const ground = fbm((rx + halfCols) * NOISE_SCALE + drift,
                               (ry + halfRows) * NOISE_SCALE - drift * 0.6,
                               z) * NOISE_AMP
                         + (hillRow ? hillAt(i, j) : 0);

            const m = sampleMesa(rx + halfCols, ry + halfRows);
            const island = top + m;

            const k = row + i;
            // The ripple is laid over the finished surface, not mixed into the
            // terrain: the union has already decided what the ground is, and
            // the wave lifts whatever that turned out to be — plain, cliff or
            // the island's crown alike.
            field[k] = smax(ground, island, BLEND)
                     + (rippleRow ? rippleAt(i, j) : 0);
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

function buildContours(t) {
    for (let i = 0; i < LEVEL_COUNT; i++) { levelSegs[i].length = 0; levelSegsLit[i].length = 0; }
    prepRim(t, islandTop);
    const w = cols + 1;

    horizon.fill(Infinity);
    addHorizonRow(rows); // the near edge of the map occludes nothing but itself

    // Near to far, so the horizon always holds everything closer than this row.
    for (let j = rows - 1; j >= 0; j--) {
        addHorizonRow(j + 1);

        // Rim points landing in this row, now that everything nearer is in.
        const bucket = rimBuckets[j];
        for (let n = 0; n < bucket.length; n++) {
            const p = bucket[n];
            project(rimI[p], rimJ[p], rimH[p]);
            rimSx[p] = pX;
            rimSy[p] = pY;
            if (!visible(pX, pY)) rimOk[p] = 0;
        }

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

// The rim rides the same hover as the plate it sits closest to, so the top of
// the island moves as one piece. The phase is taken from its height rather
// than a layer index, so it stays continuous as the island climbs.
function drawRim(t) {
    // Fades in across the part of the climb the rim is actually above ground
    // for: MIN as it breaks the surface, MAX standing at full height.
    let f = (rise - RISE_SURFACED) / (1 - RISE_SURFACED);
    if (f < 0) f = 0; else if (f > 1) f = 1;
    const alpha = RIM_ALPHA_MIN + (RIM_ALPHA_MAX - RIM_ALPHA_MIN) * f;

    ctx.save();
    ctx.translate(0, Math.sin(t * BOB_SPEED + (islandTop / LEVEL_STEP) * BOB_PHASE) * BOB_PX);
    ctx.lineWidth = 2;
    ctx.strokeStyle = isDark
        ? `rgba(255,255,255,${alpha})`
        : `rgba(26,26,26,${alpha})`;

    ctx.beginPath();
    let drawing = false;
    for (let p = 0; p < rimOk.length; p++) {
        if (rimOk[p] === 0) { drawing = false; continue; }
        if (!drawing || rimBreak[p] === 1) {
            ctx.moveTo(rimSx[p], rimSy[p]);
            drawing = true;
        } else {
            ctx.lineTo(rimSx[p], rimSy[p]);
        }
    }
    ctx.stroke();
    ctx.restore();
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

    drawRim(t);

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
    updateCamera(t);
    updateHill();
    updateRipples(t);
    sampleField(t);
    buildContours(t);
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
    rimBuckets.length = 0;
    for (let j = 0; j < rows; j++) rimBuckets.push([]);
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
        mouseInside = true;
        mouseLast = performance.now() * 0.001;
        mouseX = e.clientX;
        mouseY = e.clientY;
        yawTarget = YAW + ((e.clientX / width) * 2 - 1) * YAW_RANGE;
        pitchTarget = PITCH + ((e.clientY / height) * 2 - 1) * TILT_RANGE;
    });
    // Leaving the window hands the camera straight back to the drift.
    window.addEventListener('mouseout', () => { mouseInside = false; });

    // pointerdown, not click: it fires on the press rather than the release,
    // which an impact wants, and it covers touch, where the hill never appears
    // because mousemove never fires.
    window.addEventListener('pointerdown', e => {
        addRipple(e.clientX, e.clientY, performance.now() * 0.001);
    });

    animate();
}

setup();
