/*
 * Halftone wallpaper, drawn as a printer's screen that breathes.
 *
 * The whole plane is one halftone screen: a lattice of dots at a fixed pitch,
 * turned to 45 degrees the way a single-colour press screens a photograph.
 * Nothing in the lattice ever moves. The only thing that changes is how much
 * ink each dot carries, so the image is made entirely out of dot size — which
 * is what a real halftone is, and what separates this from a grid of particles.
 *
 * The tone those dots carry comes from the logo. A signed distance field is
 * measured off the four monogram paths, so every point on screen knows how far
 * it is from the silhouette, and the waves are written against that distance
 * rather than against a centre point. Crests are therefore concentric offsets
 * of the mark itself: rings that leave the monogram wearing its own shape and
 * only round off into circles once they are far enough out for the detail to
 * wash away. The logo is the source of the motion, not a shape parked in it.
 *
 * Two wave trains ride the field at unrelated wavelengths and speeds, one
 * travelling out and one in. Where they meet they beat against each other, so
 * the screen swells and thins on a rhythm that never quite repeats, and a slow
 * tide underneath lifts the whole plane in and out of the paper. The logo's
 * interior breathes too, but far more gently — enough that it is alive, not
 * enough to stop it reading as solid ink.
 *
 * The dots merge on their own. At full tone the radius reaches the half
 * diagonal of a lattice cell, so neighbouring dots overlap and the plane goes
 * genuinely solid with no second pass — the same way ink closes up in the
 * shadows of a real print, and why the monogram reads as a filled mark while
 * the mid-tones around it stay visibly screened.
 *
 * The cursor is a swell: dots fatten under the pointer as though the paper
 * were being pressed from behind. A click drops a ring into the screen, which
 * travels out through the lattice and fades, briefly overprinting whatever the
 * standing waves were doing.
 */

const canvas = document.getElementById('halftone-canvas');
const ctx = canvas.getContext('2d');
const toggle = document.getElementById('mode-toggle_legacy');
const icon = document.getElementById('mode-icon_legacy');
const svg = document.getElementById('svg-source_halftone');

let isDark = document.documentElement.classList.contains('dark');

toggle.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    isDark = document.documentElement.classList.contains('dark');
    icon.textContent = isDark ? '☀' : '🌙';
});

// The screen
//
// >>> THE DOT GRID — THESE SET THE WHOLE CHARACTER <<<
//
// PITCH is the distance between dot centres in CSS pixels — the screen's
// frequency, the single most visible number in the file. Small is a fine,
// photographic screen that costs more to draw; large is a coarse, poster-like
// one. Roughly 6-16 is the useful range; below 5 the dots stop reading as dots
// on a normal display and the whole thing turns to grey mush.
//
// SCREEN_ANGLE is how far the lattice is turned, in degrees. 45 is what a
// press uses for a single black screen, because a diagonal grid is the one the
// eye is least able to pick out. 0 gives an obvious, deliberate graph-paper
// grid instead.
const PITCH = 11;
const SCREEN_ANGLE = 45 * Math.PI / 180;

// Dot radius, as a fraction of PITCH.
//
// DOT_AREA is the radius at full tone if a dot is sized so its *area* matches
// the tone it stands for: 1/sqrt(pi), the number that makes a half-tone
// actually cover half the paper. Sizing by area rather than by radius is what
// makes the tone ramp read evenly — size by radius and every mid-tone comes
// out far darker than it should, until the whole screen saturates into flat
// bands with no grey left anywhere between them.
//
// Circles cannot tile, though, so area-correct dots never fully close: at full
// tone they still leave a pinhole at each cell corner. DOT_CLOSE is the radius
// that does close them — half a cell's diagonal, plus a little overlap — and
// CLOSE_FROM is the tone above which the radius ramps from the one to the
// other. That is a real press behaviour, ink joining up in the shadows, and it
// is what lets the monogram sit on the paper as a solid mark while the screen
// all around it stays visibly, countably screened.
const DOT_AREA = 0.5642;
const DOT_CLOSE = 0.74;
const CLOSE_FROM = 0.86;

// Dots smaller than this are skipped rather than drawn. Sub-pixel circles cost
// as much as real ones and only add a grey haze, so this is both a look and a
// speed control: raise it to make the highlights drop out cleanly.
const MIN_DOT_PX = 0.35;

// Dot gain: the exponent tone is raised to before it becomes an area. Under 1
// fattens the mid-tones the way ink spreading into paper does; over 1 thins
// them. 1 is a linear, digital-looking response.
const DOT_GAIN = 0.9;

// Ceiling on how many dots the lattice may hold. If a viewport is big enough
// that PITCH would exceed this, the pitch is widened until it fits — so a 5K
// display draws a slightly coarser screen instead of costing three times the
// frame. It is never made finer than PITCH.
const MAX_DOTS = 34000;

// Tone field
//
// Tone runs 0 (bare paper, no dot) to 1 (solid ink). BASE_TONE is the ambient
// stipple the far field settles to, so the screen is always faintly present
// rather than dropping to blank paper. LOGO_TONE is the ink inside the
// monogram — at 0.9 and above the dots there are overlapping, so it reads as a
// filled mark.
const BASE_TONE = 0.30;
const LOGO_TONE = 0.97;

// How far the logo's edge is softened, in pixels. This is not antialiasing —
// the dots do that themselves — it is how many pixels the fill takes to fall
// off into the surrounding screen. A few pixels keeps the silhouette crisp; a
// large value makes the mark bleed into its own rings.
const EDGE_FEATHER = 4;

const LOGO_SPAN = 0.62;       // fraction of viewport height

// >>> LOGO POSITION — NUDGE IT HERE <<<
// Offsets from centre as a fraction of the viewport: X positive moves it
// right, Y positive moves it down.
const LOGO_SHIFT_X = -0.036;
const LOGO_SHIFT_Y = 0;

// How finely the distance field is measured, in pixels per sample. The field
// is close to linear, so it survives being sampled coarsely and read back with
// bilinear interpolation — 4 is plenty and keeps the build under a few
// milliseconds. This runs on resize only, never per frame.
const SDF_CELL = 4;

// The breathing
//
// >>> THE WAVES — TWEAK THEM HERE <<<
// Two trains written against distance from the silhouette, so their crests are
// offsets of the monogram rather than circles. LENGTH is the gap between
// crests in pixels, SPEED how fast a crest travels in pixels per second, AMP
// how much tone it adds and removes at full strength. The first travels
// outward, the second inward, and the two wavelengths are deliberately not
// related — that beat is what keeps the loop from reading as a repeat.
//
// Match LENGTH to PITCH with some care: a wavelength near the dot pitch will
// alias into moire rather than reading as a wave. Keep it several times PITCH.
const WAVE_LENGTH = 96;
const WAVE_SPEED = 46;
const WAVE_AMP = 0.19;

const WAVE2_LENGTH = 167;
const WAVE2_SPEED = -27;      // negative travels inward, toward the mark
const WAVE2_AMP = 0.10;

// How the crests weaken with distance from the silhouette. DECAY is the
// distance in pixels over which a wave loses most of its strength; FLOOR is
// the fraction it keeps forever, so the rings still reach the corners of a
// wide screen instead of dying just past the logo. Set FLOOR to 0 for waves
// that fade out entirely and leave flat paper beyond.
const WAVE_DECAY = 620;
const WAVE_FLOOR = 0.30;

// How much of that reaches inside the mark. The interior has to stay solid
// enough to read, so it gets a fraction of the amplitude the outside does —
// enough to see it is alive, not enough to open holes in the monogram.
const INNER_BREATH = 0.16;

// The tide: one slow rise and fall of the entire plane, at a period unrelated
// to either wave, so the screen as a whole inhales rather than only rippling.
const SWELL_PERIOD = 23;      // seconds
const SWELL_AMP = 0.05;

// Grain — a drifting cloud of value noise, so the field is never mechanically
// even. SCALE is in cycles per pixel (smaller is a broader cloud), DRIFT how
// fast it evolves. AMP of 0 gives a perfectly clean screen. STEP is how coarse
// a grid it is evaluated on before being interpolated back out, in pixels —
// the cloud is hundreds of pixels wide — GRAIN_SCALE puts a full cycle across
// some 450 of them — so a grid this coarse still carries several samples per
// cycle and interpolates back smoothly. Keep it tied to that wavelength rather
// than to the screen: a step fine enough to look like pixels would put the
// cost of the whole effect back into the noise function on a large display.
const GRAIN_AMP = 0.05;
const GRAIN_SCALE = 0.0022;
const GRAIN_DRIFT = 0.05;
const GRAIN_STEP = 64;

// The margin
//
// >>> HOW FAR THE SCREEN REACHES INTO THE EDGES <<<
// Tone falls away toward the edges of the frame, the way a print leaves a
// margin. There is a practical reason — the wordmark in one corner and the
// code in the other need paper to sit on, and white text over a white screen
// is unreadable — but it earns its place anyway: it puts the monogram in a
// pool of ink rather than a field running off all four sides.
//
// MARGIN is the width of the fade as a fraction of the shorter side of the
// viewport. STRENGTH is how much tone it takes away at the very edge: 1 fades
// to bare paper, 0 turns the margin off entirely and lets the screen bleed.
const MARGIN = 0.16;
const MARGIN_STRENGTH = 0.9;

// Cursor swell
//
// >>> THE BLOOM UNDER THE POINTER — TWEAK IT HERE <<<
// A soft lift in tone centred on the cursor, so dots fatten under it. RADIUS
// is its half-width in pixels, HEIGHT the tone it adds at the peak (for scale,
// the whole range is 0 to 1). EASE is how lazily it slides after the cursor,
// FADE how quickly it grows in when a cursor arrives and dies away when one
// leaves the window.
const HILL_RADIUS = 190;
const HILL_HEIGHT = 0.34;
const HILL_EASE = 0.14;
const HILL_FADE = 0.05;
const HILL_R2 = HILL_RADIUS * HILL_RADIUS;

// Click ripple
//
// >>> THE DROPPED RING — TWEAK IT HERE <<<
// A ring of ink expanding from wherever the pointer was pressed, laid over
// whatever the standing waves are doing. HEIGHT is the tone at the crest at
// birth; SPEED and LIFE together set how far it gets. WIDTH is the half-width
// of the packet, so a bigger number is a longer, lazier swell. SPREAD is the
// distance over which the crest loses half its height to the ring growing
// longer. LOBES is how many crests are in the packet: 1 is a single ring, 2-3
// makes it a train chasing itself outward.
const RIPPLE_MAX = 4;         // rings at once; a fifth click recycles the oldest
const RIPPLE_HEIGHT = 0.42;
const RIPPLE_SPEED = 460;     // pixels per second
const RIPPLE_WIDTH = 110;     // pixels, half-width of the packet
const RIPPLE_LIFE = 2.6;      // seconds from click to nothing
const RIPPLE_SPREAD = 760;    // pixels over which the crest halves
const RIPPLE_LOBES = 1;
const RIPPLE_INV_W = 1 / RIPPLE_WIDTH;
const RIPPLE_WAVE = Math.PI * RIPPLE_LOBES;

const TAU = Math.PI * 2;

// --- state ------------------------------------------------------------------

let width = 0, height = 0, dpr = 1;
let pitch = PITCH, areaR = 0, closeR = 0, marginPx = 1;

// Signed distance to the silhouette, in pixels: positive outside, negative in.
// Only ever read while the lattice is being solved, never during a frame.
let sdf = null, sdfW = 0, sdfH = 0;

// The lattice: one entry per dot that lands on the page. Positions and
// everything derived from the distance field, all fixed until the next resize.
// The two wave terms are held as a sine and a cosine part rather than as a
// phase, so a frame can advance them with the angle-addition identity instead
// of calling a trigonometric function per dot. See draw().
let dotX, dotY, dotBase, dotMarg;
let dotAS1, dotAC1, dotAS2, dotAC2;
let dotCount = 0;

// tone -> dot radius, resolved once per resize. The mapping is a fixed curve
// with a square root, a fractional power and a branch in it; looking it up is
// a great deal cheaper than evaluating it twenty thousand times a frame, and
// at this many steps the radius is quantised far below a pixel.
const RADIUS_STEPS = 1024;
let radiusLut = null;

// The grain cloud, on its own coarse grid.
let grain = null, grainW = 0, grainH = 0;

let mouseX = 0, mouseY = 0, mouseInside = false;
let hillX = 0, hillY = 0, hillAmt = 0;

const ripples = [];

// Per-frame scratch for the live ripples, so the dot loop reads flat numbers
// instead of chasing objects and redoing the same divisions for every dot.
const rpX = new Float64Array(RIPPLE_MAX), rpY = new Float64Array(RIPPLE_MAX);
const rpRad = new Float64Array(RIPPLE_MAX), rpAmp = new Float64Array(RIPPLE_MAX);
const rpIn2 = new Float64Array(RIPPLE_MAX), rpOut2 = new Float64Array(RIPPLE_MAX);

// Angular frequencies, derived once. A crest sits where the phase is constant,
// so dividing speed by wavelength is what turns a distance into a rate.
const OMEGA = TAU * WAVE_SPEED / WAVE_LENGTH;
const OMEGA2 = TAU * WAVE2_SPEED / WAVE2_LENGTH;
const INV_WAVE = TAU / WAVE_LENGTH;
const INV_WAVE2 = TAU / WAVE2_LENGTH;
const INV_DECAY = 1 / WAVE_DECAY;
const INV_GRAIN_STEP = 1 / GRAIN_STEP;
const INV_HILL_R2 = 1 / HILL_R2;

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

// --- logo distance field ----------------------------------------------------

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

// Chamfer 3-4 distance transform, returned in samples.
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

/*
 * Rasterise the monogram once, then measure how far every point on screen is
 * from it. Distance is what the waves are written against, so this is the
 * whole geometry of the piece — the dots themselves know nothing about the
 * logo beyond the number they read out of here.
 *
 * The field is measured on a coarse grid and read back with bilinear
 * interpolation. A distance field is very nearly linear away from the
 * silhouette, so sampling it every few pixels loses almost nothing, and it
 * keeps this to a few milliseconds on resize rather than per frame.
 */
function buildLogo() {
    sdfW = Math.ceil(width / SDF_CELL) + 1;
    sdfH = Math.ceil(height / SDF_CELL) + 1;

    const off = document.createElement('canvas');
    off.width = sdfW;
    off.height = sdfH;
    const octx = off.getContext('2d', { willReadFrequently: true });

    // Fit the 1000x1100 viewBox to a fraction of viewport height, centred,
    // then nudged. Scale is in samples per SVG unit.
    const s = (LOGO_SPAN * height / 1100) / SDF_CELL;
    const cxs = (width / 2 + LOGO_SHIFT_X * width) / SDF_CELL;
    const cys = (height / 2 + LOGO_SHIFT_Y * height) / SDF_CELL;

    octx.setTransform(s, 0, 0, s, cxs - 500 * s, cys - 550 * s);
    octx.fillStyle = '#fff';
    svg.querySelectorAll('path').forEach(p => {
        octx.fill(new Path2D(p.getAttribute('d')));
    });

    const px = octx.getImageData(0, 0, sdfW, sdfH).data;
    const n = sdfW * sdfH;
    const solid = new Float32Array(n);
    const hollow = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        solid[i] = px[i * 4 + 3] * (1 / 255);
        hollow[i] = 1 - solid[i];
    }

    // Positive outside, negative inside, converted from samples into pixels.
    const outer = distanceTransform(solid, sdfW, sdfH);
    const inner = distanceTransform(hollow, sdfW, sdfH);
    sdf = new Float32Array(n);
    for (let i = 0; i < n; i++) sdf[i] = (outer[i] - inner[i]) * SDF_CELL;
    boxBlur(sdf, sdfW, sdfH, 1, 1); // soften the chamfer's octagonal bias
}

// Bilinear read, clamped at the edges. Sampling off the grid is fine: past the
// viewport the field is only ever a little wrong, and nothing is drawn there.
function sampleSDF(x, y) {
    let gx = x / SDF_CELL, gy = y / SDF_CELL;
    if (gx < 0) gx = 0; else if (gx > sdfW - 1.001) gx = sdfW - 1.001;
    if (gy < 0) gy = 0; else if (gy > sdfH - 1.001) gy = sdfH - 1.001;

    const i = gx | 0, j = gy | 0;
    const fx = gx - i, fy = gy - j;
    const k = j * sdfW + i;

    const a = sdf[k], b = sdf[k + 1];
    const c = sdf[k + sdfW], d = sdf[k + sdfW + 1];
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}

// --- the tone field ---------------------------------------------------------

function updateHill() {
    if (mouseInside) {
        hillX += (mouseX - hillX) * HILL_EASE;
        hillY += (mouseY - hillY) * HILL_EASE;
        if (hillAmt < 1) hillAmt = Math.min(1, hillAmt + HILL_FADE);
    } else if (hillAmt > 0) {
        hillAmt = Math.max(0, hillAmt - HILL_FADE);
    }
}

function addRipple(x, y, t) {
    if (ripples.length >= RIPPLE_MAX) ripples.shift();
    ripples.push({ x, y, t0: t });
}

function updateRipples(t) {
    for (let i = ripples.length - 1; i >= 0; i--) {
        if (t - ripples[i].t0 > RIPPLE_LIFE) ripples.splice(i, 1);
    }
}
/*
 * The lattice, solved once.
 *
 * Not one dot ever moves: the screen is nailed to the page, and the only thing
 * a frame changes is how much ink each dot carries. Everything a dot's tone
 * depends on that is not the clock is therefore fixed the moment the viewport
 * is known — where it sits, how far it is from the silhouette, how much of the
 * wave reaches it, how far into the margin it has fallen — so all of that is
 * measured here, on resize, and a frame is left with two sines and a handful
 * of adds per dot.
 *
 * That is the difference between this running at sixty frames a second and not
 * running at all. Sampling the distance field and the noise per dot per frame,
 * which is the obvious way to write it, costs around forty milliseconds a
 * frame at 1600x900 — the field is static and was being re-measured sixty
 * times a second for no reason.
 *
 * Dots that fall outside the viewport are dropped here rather than tested every
 * frame, so the arrays hold only what actually gets drawn.
 */
function buildLattice() {
    const ca = Math.cos(SCREEN_ANGLE), sa = Math.sin(SCREEN_ANGLE);
    const ux = pitch * ca, uy = pitch * sa;    // one step along i
    const vx = -pitch * sa, vy = pitch * ca;   // one step along j

    // Half-width of the lattice box, in cells. A screen point is at most
    // (|x| + |y|) / pitch cells from the centre under any rotation, so this
    // covers the corners the turned grid would otherwise leave bare.
    const N = Math.ceil((width + height) / (2 * pitch)) + 1;

    const cx = width / 2, cy = height / 2;
    const edge = closeR + 1;
    const hiX = width + edge, hiY = height + edge;

    const X = [], Y = [], base = [], mg = [];
    const as1 = [], ac1 = [], as2 = [], ac2 = [];

    for (let j = -N; j <= N; j++) {
        // Walk each row incrementally rather than multiplying out every dot.
        let x = cx + vx * j - ux * N;
        let y = cy + vy * j - uy * N;
        for (let i = -N; i <= N; i++, x += ux, y += uy) {
            if (x < -edge || x > hiX || y < -edge || y > hiY) continue;

            const d = sampleSDF(x, y);

            // Feathered fill: 1 well inside the mark, 0 well outside it.
            let inside;
            if (d <= -EDGE_FEATHER) inside = 1;
            else if (d >= EDGE_FEATHER) inside = 0;
            else inside = fade((EDGE_FEATHER - d) / (2 * EDGE_FEATHER));

            // The waves are written against distance from the silhouette, so
            // their crests are offsets of the mark rather than circles. Inside
            // it they are held right down, or the monogram would open up into
            // rings and stop reading as a filled shape.
            const ad = d < 0 ? -d : d;
            const decay = WAVE_FLOOR + (1 - WAVE_FLOOR) * Math.exp(-ad * INV_DECAY);
            const reach = decay * (1 - inside * (1 - INNER_BREATH));

            // How far into the margin this dot has fallen. Multiplying rather
            // than subtracting thins the screen toward the edge instead of
            // pushing it negative, so the wave structure stays legible right
            // up to where it fades out.
            const ex = Math.min(x, width - x) / marginPx;
            const ey = Math.min(y, height - y) / marginPx;
            let m = ex < ey ? ex : ey;
            if (m < 0) m = 0; else if (m > 1) m = 1;

            // Amplitude is folded into the sine and cosine parts here, so a
            // frame's whole wave term is two multiplies and a subtract.
            const ph1 = ad * INV_WAVE, ph2 = ad * INV_WAVE2;
            const amp1 = WAVE_AMP * reach, amp2 = WAVE2_AMP * reach;

            X.push(x); Y.push(y);
            base.push(BASE_TONE + (LOGO_TONE - BASE_TONE) * inside);
            as1.push(amp1 * Math.sin(ph1)); ac1.push(amp1 * Math.cos(ph1));
            as2.push(amp2 * Math.sin(ph2)); ac2.push(amp2 * Math.cos(ph2));
            mg.push(m < 1 ? 1 - MARGIN_STRENGTH * (1 - fade(m)) : 1);
        }
    }

    dotCount = X.length;
    dotX = Float32Array.from(X);       dotY = Float32Array.from(Y);
    dotBase = Float32Array.from(base); dotMarg = Float32Array.from(mg);
    dotAS1 = Float32Array.from(as1);   dotAC1 = Float32Array.from(ac1);
    dotAS2 = Float32Array.from(as2);   dotAC2 = Float32Array.from(ac2);
}

// The tone-to-radius curve, resolved into a table. A radius of 0 means the dot
// fell under MIN_DOT_PX and is not worth drawing, so that cull comes free.
function buildRadiusLut() {
    radiusLut = new Float32Array(RADIUS_STEPS + 1);
    for (let i = 0; i <= RADIUS_STEPS; i++) {
        const tone = i / RADIUS_STEPS;
        // Area-correct through the mid-tones, then joining up in the shadows
        // so the darkest ink actually closes rather than pinholing.
        let r = areaR * Math.sqrt(Math.pow(tone, DOT_GAIN));
        if (tone > CLOSE_FROM) {
            r = lerp(r, closeR, fade((tone - CLOSE_FROM) / (1 - CLOSE_FROM)));
        }
        radiusLut[i] = r < MIN_DOT_PX ? 0 : r;
    }
}

/*
 * The grain, on its own coarse grid.
 *
 * The noise cloud is deliberately broad — GRAIN_SCALE puts a whole cycle
 * across several hundred pixels — so evaluating it separately for every dot is
 * asking a three-dimensional noise function for a number it has already
 * effectively answered. It is built on a grid a couple of dozen pixels across
 * instead and read back bilinearly, which is visually identical and around an
 * order of magnitude fewer calls.
 */
function buildGrain(t) {
    const z = t * GRAIN_DRIFT;
    const s = GRAIN_STEP * GRAIN_SCALE;
    for (let j = 0; j < grainH; j++) {
        const gy = j * s;
        for (let i = 0; i < grainW; i++) {
            grain[j * grainW + i] = GRAIN_AMP * (noise3(i * s, gy, z) - 0.5) * 2;
        }
    }
}

function sampleGrain(x, y) {
    let gx = x * INV_GRAIN_STEP, gy = y * INV_GRAIN_STEP;
    if (gx < 0) gx = 0; else if (gx > grainW - 1.001) gx = grainW - 1.001;
    if (gy < 0) gy = 0; else if (gy > grainH - 1.001) gy = grainH - 1.001;

    const i = gx | 0, j = gy | 0;
    const fx = gx - i, fy = gy - j;
    const k = j * grainW + i;

    const a = grain[k] + (grain[k + 1] - grain[k]) * fx;
    const b = grain[k + grainW] + (grain[k + grainW + 1] - grain[k + grainW]) * fx;
    return a + (b - a) * fy;
}

// --- drawing ----------------------------------------------------------------

/*
 * One pass over the lattice, one path, one fill.
 *
 * Every dot is the same colour, so they can all be accumulated into a single
 * path and filled in one call. That is the other half of the performance
 * story: some twenty thousand arcs cost very little to build, and filling them
 * one at a time is what would not be affordable.
 */
function draw(t) {
    ctx.clearRect(0, 0, width, height);

    buildGrain(t);

    // None of these depend on position, so they are lifted out of the dot loop.
    // Advancing the waves by the angle-addition identity — sin(p - w) as
    // sin(p)cos(w) - cos(p)sin(w) — is what lets a frame carry twenty thousand
    // dots without calling a trigonometric function even once inside the loop.
    const tide = SWELL_AMP * Math.sin(TAU * t / SWELL_PERIOD);
    const w1 = t * OMEGA, w2 = t * OMEGA2;
    const cw1 = Math.cos(w1), sw1 = Math.sin(w1);
    const cw2 = Math.cos(w2), sw2 = Math.sin(w2);

    const hill = hillAmt > 0;
    const hillPeak = HILL_HEIGHT * hillAmt;

    /*
     * A ripple is a thin annulus, and all but a sliver of the lattice is
     * outside it. Everything that is the same for every dot — the radius it
     * has reached, the height it has left, and the band it can possibly touch
     * — is worked out once here, and the band is kept as squared radii so the
     * dot loop rejects the great majority on a comparison rather than paying
     * for a square root it is going to throw away.
     */
    let nRip = 0;
    for (let i = 0; i < ripples.length; i++) {
        const rp = ripples[i];
        const age = t - rp.t0;
        const rad = age * RIPPLE_SPEED;
        const amp = RIPPLE_HEIGHT * (1 - age / RIPPLE_LIFE) / (1 + rad / RIPPLE_SPREAD);
        if (amp <= 0) continue;
        const inner = rad - RIPPLE_WIDTH, outer = rad + RIPPLE_WIDTH;
        rpX[nRip] = rp.x;   rpY[nRip] = rp.y;
        rpRad[nRip] = rad;  rpAmp[nRip] = amp;
        rpIn2[nRip] = inner > 0 ? inner * inner : 0;
        rpOut2[nRip] = outer * outer;
        nRip++;
    }

    ctx.beginPath();
    for (let k = 0; k < dotCount; k++) {
        const x = dotX[k], y = dotY[k];

        let tone = dotBase[k]
                 + dotAS1[k] * cw1 - dotAC1[k] * sw1
                 + dotAS2[k] * cw2 - dotAC2[k] * sw2
                 + tide
                 + sampleGrain(x, y);

        if (hill) {
            const hx = x - hillX, hy = y - hillY;
            const q = 1 - (hx * hx + hy * hy) * INV_HILL_R2;
            if (q > 0) tone += hillPeak * q * q;
        }

        for (let i = 0; i < nRip; i++) {
            const dx = x - rpX[i], dy = y - rpY[i];
            const d2 = dx * dx + dy * dy;
            if (d2 > rpOut2[i] || d2 < rpIn2[i]) continue;
            const u = (Math.sqrt(d2) - rpRad[i]) * RIPPLE_INV_W;
            const env = 1 - u * u;
            tone += rpAmp[i] * env * env * Math.cos(u * RIPPLE_WAVE);
        }

        tone *= dotMarg[k];
        if (tone <= 0) continue;
        if (tone > 1) tone = 1;

        const r = radiusLut[(tone * RADIUS_STEPS) | 0];
        if (r === 0) continue;

        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
    }

    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.88)';
    ctx.fill();
}

function animate() {
    const t = performance.now() * 0.001;
    updateHill();
    updateRipples(t);
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

    // Widen the screen on very large viewports rather than paying for the dots.
    pitch = Math.max(PITCH, Math.sqrt(width * height / MAX_DOTS));
    areaR = pitch * DOT_AREA;
    closeR = pitch * DOT_CLOSE;
    marginPx = Math.max(1, MARGIN * Math.min(width, height));

    grainW = Math.ceil(width / GRAIN_STEP) + 2;
    grainH = Math.ceil(height / GRAIN_STEP) + 2;
    grain = new Float32Array(grainW * grainH);

    // Order matters: the lattice reads the distance field as it is built.
    buildLogo();
    buildLattice();
    buildRadiusLut();
}

function setup() {
    resize();

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 150);
    });

    window.addEventListener('mousemove', e => {
        if (!mouseInside) { hillX = e.clientX; hillY = e.clientY; }
        mouseInside = true;
        mouseX = e.clientX;
        mouseY = e.clientY;
    });
    // Leaving the window fades the swell out rather than snapping it off.
    window.addEventListener('mouseout', () => { mouseInside = false; });

    // pointerdown, not click: it fires on the press rather than the release,
    // which an impact wants, and it covers touch, where the swell never
    // appears because mousemove never fires.
    window.addEventListener('pointerdown', e => {
        addRipple(e.clientX, e.clientY, performance.now() * 0.001);
    });

    animate();
}

setup();
