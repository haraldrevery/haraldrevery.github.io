/*
 * Halftone wallpaper: a printer's screen laid over an ink landscape, breathing
 * with a tide.
 *
 * The screen is a lattice of dots at a fixed pitch, turned to 45 degrees the
 * way a single-colour press screens a photograph. Not one dot ever moves. The
 * only thing that changes is how much ink each dot carries, so the image is
 * made entirely out of dot size — which is what a real halftone is, and what
 * separates this from a grid of particles.
 *
 * What the screen is screening is a landscape. A height field of warped
 * fractal noise runs under the whole plane — ridges, basins, isthmuses, the
 * shape of marbled paper rather than a scatter of round blobs — and it reforms
 * far too slowly to watch, so the ground is never twice the same.
 *
 * Which landscape it is comes from a seed, drawn fresh on every load. Reload
 * the page and it is a different country, screened by a different press: the
 * seed settles the noise field, where in it this page is standing, how each dot
 * is knocked off its cell, how much ink each one takes, and how far into the
 * breath the page opens. Add ?seed=12345 to the URL to pin one, or read the one
 * you are looking at out of the console.
 *
 * Over that landscape runs a tide. One level rises and falls for the entire
 * plane at once, and ink is laid wherever the ground stands above it: at high
 * water the basins flood and the screen closes into broad dark country, at low
 * water the ink drains back to the ridges and the paper opens out. That single
 * moving number is the whole animation, and it is what makes the breathing
 * both global and uneven — every dot is on the same tide, yet a steep shore
 * changes fast while a plateau barely stirs, so patches of the screen swell and
 * thin at their own apparent pace without anything travelling across it. There
 * is no wave, no centre and no direction.
 *
 * The tide is shaped like a breath rather than a sine: it draws in quickly,
 * lets go slowly, holds a moment at each end, and no two breaths run to the
 * same depth.
 *
 * The monogram is the one thing that is not weather. It keeps its own tone so
 * it always reads as the fattest dots on the page, breathes with the tide so it
 * is not a sticker laid over a living plane, and takes a little of the
 * landscape's texture so it belongs to the same paper.
 *
 * Nothing ever closes to solid. Dots overlap in the darkest country and leave a
 * star of paper at each cell corner, the way ink does in the shadows of a real
 * print — the mark is built out of the same dots as everything else, only
 * bigger ones.
 *
 * The cursor raises the ground beneath it, so ink pools under the pointer as
 * though the paper were being pressed from behind. A click drops a ring of
 * risen ground into the landscape, which travels out and settles.
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

// The seed
//
// >>> WHICH LANDSCAPE, AND WHICH PRESS <<<
// Everything random in the piece hangs off one number. Leave SEED at null and
// it is drawn fresh on every load, so the wallpaper is never the same twice;
// set it to any integer and that one landscape comes back exactly, dot jitter
// and all. ?seed= in the URL beats both, which is how a particular one gets
// kept or sent to somebody.
//
// ANNOUNCE writes the seed in use to the console, so a landscape worth keeping
// can be picked up off the page it appeared on.
const SEED = null;
const SEED_ANNOUNCE = true;

// The screen
//
// >>> THE DOT GRID — THESE SET THE WHOLE CHARACTER <<<
//
// PITCH is the distance between dot centres in CSS pixels — the screen's
// frequency, the single most visible number in the file. Small is a fine,
// photographic screen that costs more to draw; large is a coarse, poster-like
// one made of fewer and bigger dots. Below about 10 the dots stop reading as
// dots at arm's length and the whole thing turns to grey mush, which is the
// failure this value is set high to avoid: this is meant to be seen as a
// screen, not as a texture.
//
// SCREEN_ANGLE is how far the lattice is turned, in degrees. 45 is what a press
// uses for a single black screen, because a diagonal grid is the one the eye is
// least able to pick out. 0 gives an obvious, deliberate graph-paper grid.
//
// PITCH is quoted for a viewport whose shorter side is LAND_REF, and is only
// ever made finer than that, never coarser: a screen this coarse on a phone
// leaves the monogram about fifteen dots across, which is not enough of them to
// carry its shape. FINEST is as far down as that is allowed to go, as a
// fraction of PITCH.
const PITCH = 19;
const PITCH_FINEST = 0.7;
const SCREEN_ANGLE = 45 * Math.PI / 180;

// Dot radius, as a fraction of PITCH.
//
// DOT_AREA is the radius at full tone if a dot is sized so its *area* matches
// the tone it stands for: 1/sqrt(pi), the number that makes a half-tone
// actually cover half the paper. Sizing by area rather than by radius is what
// makes the tone ramp read evenly — size by radius and every mid-tone comes out
// far darker than it should, until the whole screen saturates into flat bands
// with no grey left anywhere between them.
//
// Circles cannot tile, so area-correct dots never fully close: they pass a
// radius of half a pitch around 0.79 tone, and what is left above that is a
// mesh with a star of paper at each cell corner. DOT_CLOSE is the radius that
// *would* close them — half a cell's diagonal — and CLOSE_FROM the tone above
// which the radius ramps to it. That is switched off here, CLOSE_FROM at 1
// being unreachable, because a closed dot is no longer a dot: anything that
// gets there stops being screened and becomes a flat area of ink, and a mark
// made that way could have been drawn with a brush. Lower it into the
// 0.85-0.95 range to let the deepest shadows join up.
const DOT_AREA = 0.5642;
const DOT_CLOSE = 0.74;
const CLOSE_FROM = 1;

// Dot gain: the exponent tone is raised to before it becomes an area. Under 1
// fattens the mid-tones the way ink spreading into paper does; over 1 thins
// them, which is what buys contrast — it pulls the quiet country down to small
// dots with real paper showing between them, so the difference between a dot at
// low water and the same dot at high water is something you can see rather than
// measure. Past about 1.3 the quiet field thins to specks and the screen stops
// holding together.
const DOT_GAIN = 1.1;

// The hand in the machine.
//
// A lattice this coarse is a very regular thing, and regular is the enemy of
// the look this is after: at PITCH 19 the eye reads the grid before it reads
// the image. Both of these break it, and both are drawn once per dot when the
// lattice is solved, never per frame — they are the paper and the press, not
// the animation.
//
// JITTER nudges each dot off its cell, as a fraction of PITCH. Keep it well
// under a quarter: enough that no two rows line up exactly, not so much that
// the screen angle is lost. INK varies how much ink a dot takes, as a fraction
// either way, the way an uneven surface takes an impression unevenly.
const DOT_JITTER = 0.08;
const DOT_INK = 0.1;

// Dots smaller than this are skipped rather than drawn. Sub-pixel circles cost
// as much as real ones and only add a grey haze, so this is both a look and a
// speed control: raise it to make the highlights drop out cleanly.
const MIN_DOT_PX = 0.20;

// Ceiling on how many dots the lattice may hold. If a viewport is big enough
// that PITCH would exceed this, the pitch is widened until it fits — so a 5K
// display draws a slightly coarser screen instead of costing three times the
// frame. It is never made finer than PITCH.
const MAX_DOTS = 34000;

// The landscape
//
// >>> THE GROUND UNDER THE INK — TWEAK IT HERE <<<
// A height field of fractal noise, domain-warped: the coordinates are pushed
// around by a second, broader field of noise before the first is read out of
// them. That one trick is the difference between clouds and country. Plain
// fractal noise is a fog of round hills; warping it drags those hills into
// ridges and bays and long thin necks of high ground, which is what gives the
// screen something worth screening.
//
// FEATURE is the size of the largest hills, as a fraction of the viewport's
// shorter side, so the landscape is the same shape on a phone as on a desktop.
// OCTAVES is how many times finer detail is layered in, FALLOFF how much
// quieter each layer is than the last — near 0.5 is a natural-looking
// landscape, higher gets rocky and busy — and LACUNARITY how much finer, kept
// slightly off 2 so the layers never line up into a visible grid.
const LAND_FEATURE = 0.34;
const LAND_OCTAVES = 4;
const LAND_FALLOFF = 0.52;
const LAND_LACUNARITY = 2.07;

// The warp: how far coordinates are dragged, in cycles of the base octave, and
// how broad the field doing the dragging is relative to it. Near 0 is unwarped
// fog. Past about 1.5 the ground tears into filaments and stops reading as a
// place.
const LAND_WARP = 0.9;
const LAND_WARP_SCALE = 0.5;

// Fractal noise sits in a narrow band around its middle — measured over a
// screenful this one runs a standard deviation of 0.09 about a mean of 0.581 —
// so it has to be stretched before it can be used as a height. CENTRE is that
// measured mean and CONTRAST how far it is pulled apart; together they put the
// first and ninety-ninth percentiles at roughly 0 and 0.9, which is the range
// the tide below is written against. Re-measure CENTRE if the octave settings
// above are changed much.
const LAND_CENTRE = 0.581;
const LAND_CONTRAST = 2.0;

// How fast the ground itself reforms, in noise units a second. This is not
// drift in any direction — the landscape has no velocity — it is the whole
// field slowly becoming a different landscape, so that a bay fills in and a
// ridge parts over a minute or two without anything being seen to move. Keep it
// low: this is geology, not weather.
const LAND_DRIFT = 0.025;

// The height field is solved on a coarse grid and read back with bilinear
// interpolation, because it is smooth and hundreds of pixels across and there
// is no sense asking a noise function per dot for a number it has already
// answered. STEP is that grid, in pixels at LAND_REF, scaled with the viewport
// so it stays the same fraction of a feature on any screen.
//
// SLICES is how many frames one full rebuild is spread over. A rebuild is six
// noise lookups a cell and would land as a single spike if it were done in one
// frame; done in stripes it is invisible, and since the ground moves at
// LAND_DRIFT, rows being a few frames apart in age cannot be seen.
const LAND_STEP = 18;
const LAND_REF = 900;
const LAND_SLICES = 6;

// The tide
//
// >>> THE BREATH — THE WHOLE PLANE AT ONCE <<<
// One level for the entire screen, rising and falling. Ink goes wherever the
// ground stands above it, so this single number floods and drains the whole
// landscape: every dot on the page is on the same tide, and yet no two parts of
// the plane change alike, because what a dot does depends on how steep the
// ground is where it stands.
//
// MID is where the level sits at rest, on the same 0-to-1 scale as the height
// field. AMP is how far it swings either side — the loud number here. Too small
// and the coastlines barely move; too large and the plane alternates between
// drowned and bare.
const LEVEL_MID = 0.5;
const TIDE_AMP = 0.15;

// PERIOD is seconds for one full breath. SKEW warps the phase so the plane
// draws in faster than it lets go — 0 is a plain sine, past about 0.5 the
// intake turns into a snap — and it is the difference between something alive
// and a dimmer on a timer.
const TIDE_PERIOD = 14;
const TIDE_SKEW = 0.38;

// Nor is every breath the same depth. The amplitude itself rises and falls on a
// longer cycle, deliberately not a whole multiple of PERIOD, so the screen has
// deep spells and shallow ones and the pattern of them takes many minutes to
// come round. VARY is how much of the amplitude that cycle can take away.
const TIDE_VARY = 0.3;
const TIDE_VARY_PERIOD = 37;

// Part of the breath is added to every dot regardless of the ground it stands
// on. Without it the country far above or far below the tide line sits
// perfectly still, and the eye finds those regions and reads them as dead. This
// is the ambient half of the breathing — the same everywhere — while the tide
// moving through the landscape above is the uneven half; between them the whole
// plane is alive and no two parts of it are alike.
const AMBIENT_TONE = 0.1;

// The ink
//
// How height becomes tone. BASE is the tone of the screen at rest and RANGE
// how far the landscape carries it either side, so the open field lives
// between BASE - RANGE/2 and BASE + RANGE/2 and never leaves it.
//
// That ceiling is the important half. The landscape is texture and slow drift;
// it is not allowed to compete with the mark, and the first attempt at this
// let flooded country run darker than the monogram, which promptly vanished
// into its own background. Keep BASE + RANGE/2 well under LOGO_TONE at every
// point of the breath.
//
// SHORE is how many height units the coast takes to cross the whole range:
// small makes hard-edged islands of ink, large makes soft gradients with no
// coastline at all. SHAPE_MIX is how much of the tone comes from that
// shoreline rather than from raw height — all shoreline and the flooded and
// the dry both go perfectly flat, so a little raw height is mixed back in to
// keep texture everywhere.
const BASE_TONE = 0.26;
const LAND_RANGE = 0.28;
const SHORE_BAND = 0.42;
const SHAPE_MIX = 0.78;

// The mark
//
// The monogram is not part of the landscape; it is the one fixed thing on the
// page, and it keeps its own tone so that it always reads as the fattest dots
// in view. TONE is that tone — tone is very nearly ink coverage, so it is also
// the mark's headroom: it must stay far enough below 1 that its dots never
// close into a slab, and far enough above the flooded country that a deep
// exhale never sinks it into the field.
//
// BREATH is how much tone the tide adds to and takes from it. It is set
// generously on purpose: dots are sized by area, so a given change in tone
// moves a radius less the darker the dot already is, and at TONE the mark is
// only about two thirds as responsive as the open field. Under it the mark
// reads as a sticker laid over a breathing plane, which is the one thing it
// must not look like.
//
// LAND lets a share of the landscape through the mark, and it is what stops the
// mark looking static next to it. BREATH alone moves every dot of the monogram
// by the same amount at the same moment, which is a fine thing to do on its own
// but reads as stillness beside a plane whose every part is breathing at its
// own pace: the eye finds the one thing keeping time. This gives the mark the
// same shoreline the field has, so the tide arrives across it rather than all
// at once, and one end of it can be filling while the other is still emptying.
//
// TOUCH is how much of the pointer — the swell under the cursor, and the ring
// dropped by a click — the mark answers to. The pointer reaches it twice over,
// once through the shoreline like everywhere else and once directly through
// this, which is deliberate: the mark should answer a click rather than merely
// be near one.
//
// CEIL is a hard ceiling on all of it together. A breath at its deepest, a
// ridge underneath and a ring passing over can otherwise stack up past the tone
// where dots close, and the one thing the mark must never do is go solid. Set
// it by the pitch: 0.88 leaves the fattest dot a whisker under 20px against a
// 19px pitch, which is a mesh with paper still showing through it.
const LOGO_TONE = 0.63;
const MARK_BREATH = 0.17;
const MARK_LAND = 0.12;
const MARK_TOUCH = 0.4;
const MARK_CEIL = 0.88;

// How far the mark's edge is softened, in pixels. This is not antialiasing —
// the dots do that themselves — it is how many pixels the fill takes to fall
// off into the surrounding screen. Worth keeping near a third of PITCH: much
// less and the edge dots jump from fat to thin in one step, which is what makes
// a coarse screen look like a low-resolution picture of a logo rather than a
// screened one.
const EDGE_FEATHER = 7;

const LOGO_SPAN = 0.68;       // fraction of viewport height

// >>> LOGO POSITION — NUDGE IT HERE <<<
// Offsets from centre as a fraction of the viewport: X positive moves it right,
// Y positive moves it down.
const LOGO_SHIFT_X = -0.036;
const LOGO_SHIFT_Y = 0;

// How finely the mark's distance field is measured, in pixels per sample. The
// field is close to linear, so it survives being sampled coarsely and read back
// with bilinear interpolation — 4 is plenty and keeps the build under a few
// milliseconds. This runs on resize only, never per frame.
const SDF_CELL = 4;

// The margin
//
// >>> HOW FAR THE SCREEN REACHES INTO THE EDGES <<<
// Tone falls away toward the edges of the frame, the way a print leaves a
// margin. There is a practical reason — the wordmark in one corner and the code
// in the other need paper to sit on — but it earns its place anyway: it puts
// the monogram in a pool of ink rather than a field running off all four sides.
// MARGIN is the width of the fade as a fraction of the shorter side of the
// viewport, STRENGTH how much tone it takes away at the very edge.
const MARGIN = 0.16;
const MARGIN_STRENGTH = 0.9;

// Cursor swell
//
// >>> THE BLOOM UNDER THE POINTER <<<
// The pointer raises the ground under it, so the tide falls back from that spot
// and ink gathers there. RISE is in height units, the same scale as the
// landscape, so a value near TIDE_AMP lifts the ground by about one breath.
// EASE is how lazily it slides after the cursor, FADE how quickly it grows in
// when a cursor arrives and dies away when one leaves the window.
const HILL_RADIUS = 190;
const HILL_RISE = 0.3;
const HILL_EASE = 0.14;
const HILL_FADE = 0.05;
const HILL_R2 = HILL_RADIUS * HILL_RADIUS;

// Click ripple
//
// >>> THE DROPPED RING <<<
// A ring of raised ground expanding from wherever the pointer was pressed, so
// ink follows it out and closes behind it. RISE is the height at the crest at
// birth; SPEED and LIFE together set how far it gets. WIDTH is the half-width
// of the packet, so a bigger number is a longer, lazier swell. SPREAD is the
// distance over which the crest loses half its height to the ring growing
// longer. LOBES is how many crests are in the packet: 1 is a single ring, 2-3
// makes it a train chasing itself outward.
const RIPPLE_MAX = 4;         // rings at once; a fifth click recycles the oldest
const RIPPLE_RISE = 0.34;
const RIPPLE_SPEED = 460;     // pixels per second
const RIPPLE_WIDTH = 110;     // pixels, half-width of the packet
const RIPPLE_LIFE = 2.6;      // seconds from click to nothing
const RIPPLE_SPREAD = 760;    // pixels over which the crest halves
const RIPPLE_LOBES = 1;
const RIPPLE_INV_W = 1 / RIPPLE_WIDTH;
const RIPPLE_WAVE = Math.PI * RIPPLE_LOBES;

const TAU = Math.PI * 2;

// --- state ------------------------------------------------------------------

// The seed in use, and everything drawn from it: where in the noise field this
// page stands, and how far into the breath it opened.
let seed = 0;
let landOX = 0, landOY = 0, landOZ = 0, timeOffset = 0;

let width = 0, height = 0, dpr = 1;
let pitch = PITCH, areaR = 0, closeR = 0, marginPx = 1;

// Signed distance to the mark, in pixels: positive outside, negative in. Only
// ever read while the lattice is being solved, never during a frame.
let sdf = null, sdfW = 0, sdfH = 0;

// The lattice: one entry per dot that lands on the page, all of it fixed until
// the next resize. dotIn is how far inside the mark a dot is, feathered at the
// edge; dotScale carries the margin fade and how much ink that particular dot
// takes, both of which scale the finished tone rather than adding to it.
let dotX, dotY, dotIn, dotScale;
let dotCount = 0;

// tone -> dot radius, resolved once per resize. The mapping is a fixed curve
// with a square root and a fractional power in it; looking it up is a great
// deal cheaper than evaluating it thousands of times a frame, and at this many
// steps the radius is quantised far below a pixel.
const RADIUS_STEPS = 1024;
let radiusLut = null;

// The landscape, on its own coarse grid, plus how far the striped rebuild has
// got and the frequency the noise is being read at.
let land = null, landW = 0, landH = 0;
let landStep = LAND_STEP, invLandStep = 1 / LAND_STEP;
let landScale = 0.001, landRow = 0;

let mouseX = 0, mouseY = 0, mouseInside = false;
let hillX = 0, hillY = 0, hillAmt = 0;

const ripples = [];

// Per-frame scratch for the live ripples, so the dot loop reads flat numbers
// instead of chasing objects and redoing the same divisions for every dot.
const rpX = new Float64Array(RIPPLE_MAX), rpY = new Float64Array(RIPPLE_MAX);
const rpRad = new Float64Array(RIPPLE_MAX), rpAmp = new Float64Array(RIPPLE_MAX);
const rpIn2 = new Float64Array(RIPPLE_MAX), rpOut2 = new Float64Array(RIPPLE_MAX);

const HEIGHT_MIX = 1 - SHAPE_MIX;
const INV_SHORE = 1 / SHORE_BAND;
const INV_HILL_R2 = 1 / HILL_R2;

// --- value noise ------------------------------------------------------------

/*
 * A small seeded generator, so that one number decides the whole picture.
 * Math.random cannot be seeded, and a seed that only reached some of the
 * randomness would be worse than none: the landscape would come back but the
 * press would not, and the page would not be the same page.
 */
function makeRng(n) {
    let s = n >>> 0;
    return () => {
        s = s + 0x6d2b79f5 | 0;
        let t = Math.imul(s ^ s >>> 15, 1 | s);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// The permutation the value noise is read out of. Reshuffling it for a new seed
// is what makes a genuinely different landscape rather than the same one seen
// from somewhere else — though the offsets below do that too, and the two
// together mean no two seeds share so much as a ridge.
const PERM = new Uint8Array(512);

function seedNoise(n) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    const rnd = makeRng(n);
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}

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

// --- the mark's distance field ----------------------------------------------

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
 * from it. That distance is used only to decide how far inside the mark a dot
 * is — the fill and its feathered edge — but it has to be measured properly,
 * because the alternative is reading the mark off a grid coarse enough to blunt
 * its corners.
 */
function buildLogo() {
    sdfW = Math.ceil(width / SDF_CELL) + 1;
    sdfH = Math.ceil(height / SDF_CELL) + 1;

    const off = document.createElement('canvas');
    off.width = sdfW;
    off.height = sdfH;
    const octx = off.getContext('2d', { willReadFrequently: true });

    // Fit the 1000x1100 viewBox to a fraction of viewport height, centred, then
    // nudged. Scale is in samples per SVG unit.
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

// --- the landscape ----------------------------------------------------------

/*
 * One height, at a point given in cycles of the base octave.
 *
 * The warp is the whole trick. Two broad, slow fields of noise say where each
 * point should have been, the coordinates are dragged that far, and only then
 * is the fractal sum read out. Layering noise on noise gives round hills in a
 * fog; dragging the coordinates first pulls those hills into ridges, bays and
 * necks of high ground — country with a grain to it rather than a cloud.
 *
 * Six noise lookups: two for the warp, four for the octaves. Each octave also
 * evolves at a slightly different rate through the third axis, so the fine
 * detail reforms while the big shapes are still settling and the landscape
 * never looks like one picture being cross-faded into another.
 */
function landAt(x, y, z) {
    const wx = noise3(x * LAND_WARP_SCALE + 11.3, y * LAND_WARP_SCALE, z) - 0.5;
    const wy = noise3(x * LAND_WARP_SCALE, y * LAND_WARP_SCALE + 7.1, z) - 0.5;

    let px = x + wx * LAND_WARP, py = y + wy * LAND_WARP;
    let amp = 1, sum = 0, norm = 0, f = 1;

    for (let o = 0; o < LAND_OCTAVES; o++) {
        sum += amp * noise3(px * f, py * f, z * (1 + 0.31 * o));
        norm += amp;
        amp *= LAND_FALLOFF;
        f *= LAND_LACUNARITY;
    }

    // Stretch the narrow band fractal noise actually occupies out to something
    // a tide can be written against, and keep it inside 0..1.
    const h = (sum / norm - LAND_CENTRE) * LAND_CONTRAST + 0.5;
    return h < 0 ? 0 : h > 1 ? 1 : h;
}

/*
 * Rebuild one stripe of the height grid.
 *
 * Solving the whole grid at once costs six noise lookups a cell and lands as a
 * single spike — a fraction of a frame on a laptop, most of one on a 4K
 * display. Since the ground reforms at LAND_DRIFT, far slower than a frame, the
 * rows can simply be rebuilt a stripe at a time and left a few frames apart in
 * age: the difference across one sweep is thousandths of a height unit, orders
 * below what a dot radius can show, and the cost comes out flat.
 */
function buildLandSlice(t) {
    const z = landOZ + t * LAND_DRIFT;
    const rows = Math.ceil(landH / LAND_SLICES);
    const end = Math.min(landH, landRow + rows);

    for (let j = landRow; j < end; j++) {
        const gy = landOY + j * landStep * landScale;
        const row = j * landW;
        for (let i = 0; i < landW; i++) {
            land[row + i] = landAt(landOX + i * landStep * landScale, gy, z);
        }
    }

    landRow = end >= landH ? 0 : end;
}

function sampleLand(x, y) {
    let gx = x * invLandStep, gy = y * invLandStep;
    if (gx < 0) gx = 0; else if (gx > landW - 1.001) gx = landW - 1.001;
    if (gy < 0) gy = 0; else if (gy > landH - 1.001) gy = landH - 1.001;

    const i = gx | 0, j = gy | 0;
    const fx = gx - i, fy = gy - j;
    const k = j * landW + i;

    const a = land[k] + (land[k + 1] - land[k]) * fx;
    const b = land[k + landW] + (land[k + landW + 1] - land[k + landW]) * fx;
    return a + (b - a) * fy;
}

// --- the tide ---------------------------------------------------------------

/*
 * The breath, in -1 to 1.
 *
 * Two shapings turn a sine into something that reads as breathing. The phase
 * warp — sin(th + k sin th) — runs the clock fast through the intake and slow
 * through the release without ever leaving the cycle, which is what an eased
 * in-and-out cannot do; measured on the curve it gives 5.5 seconds in against
 * 8.5 out, with a dwell at each end. The depth cycle underneath makes one
 * breath deeper than the last, and at 14 against 37 seconds the pattern of deep
 * and shallow takes the better part of ten minutes to come round.
 */
function breathAt(t) {
    const th = TAU * t / TIDE_PERIOD;
    const depth = 1 - TIDE_VARY * (0.5 - 0.5 * Math.cos(TAU * t / TIDE_VARY_PERIOD));
    return depth * Math.sin(th + TIDE_SKEW * Math.sin(th));
}

// --- the pointer ------------------------------------------------------------

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

// --- the lattice ------------------------------------------------------------

/*
 * The lattice, solved once.
 *
 * Not one dot ever moves: the screen is nailed to the page, and the only thing
 * a frame changes is how much ink each dot carries. Everything a dot's tone
 * depends on that is not the clock is therefore fixed the moment the viewport
 * is known — where it sits, how far inside the mark it is, how far into the
 * margin it has fallen, how much ink it takes — so all of that is measured
 * here, on resize, and a frame is left with one field read and a handful of
 * arithmetic per dot.
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
    const jit = DOT_JITTER * pitch;

    // Its own generator, restarted from the seed on every build, so that a
    // resize lays the press down the same way rather than reshuffling the paper
    // under the reader.
    const rnd = makeRng(seed ^ 0x5bf03635);

    const X = [], Y = [], ins = [], sc = [];

    for (let j = -N; j <= N; j++) {
        // Walk each row incrementally rather than multiplying out every dot.
        let cellX = cx + vx * j - ux * N;
        let cellY = cy + vy * j - uy * N;
        for (let i = -N; i <= N; i++, cellX += ux, cellY += uy) {
            if (cellX < -edge || cellX > hiX || cellY < -edge || cellY > hiY) continue;

            // Off the cell, once and for good. Everything below is measured at
            // where the dot actually lands, not where the lattice would have
            // put it, so a jittered dot reads the ground it truly stands on.
            const x = cellX + (rnd() * 2 - 1) * jit;
            const y = cellY + (rnd() * 2 - 1) * jit;

            const d = sampleSDF(x, y);

            // Feathered fill: 1 well inside the mark, 0 well outside it.
            let inside;
            if (d <= -EDGE_FEATHER) inside = 1;
            else if (d >= EDGE_FEATHER) inside = 0;
            else inside = fade((EDGE_FEATHER - d) / (2 * EDGE_FEATHER));

            // How far into the margin this dot has fallen. Multiplying rather
            // than subtracting thins the screen toward the edge instead of
            // pushing it negative, so the landscape stays legible right up to
            // where it fades out.
            const ex = Math.min(x, width - x) / marginPx;
            const ey = Math.min(y, height - y) / marginPx;
            let m = ex < ey ? ex : ey;
            if (m < 0) m = 0; else if (m > 1) m = 1;

            // One multiplier per dot, carrying both the margin fade and how
            // much ink this particular dot takes. They belong together because
            // both scale the finished tone rather than adding to it, and doing
            // it here costs the frame nothing.
            const margin = m < 1 ? 1 - MARGIN_STRENGTH * (1 - fade(m)) : 1;
            const ink = 1 + (rnd() * 2 - 1) * DOT_INK;

            X.push(x); Y.push(y);
            ins.push(inside);
            sc.push(margin * ink);
        }
    }

    dotCount = X.length;
    dotX = Float32Array.from(X);    dotY = Float32Array.from(Y);
    dotIn = Float32Array.from(ins); dotScale = Float32Array.from(sc);
}

// The tone-to-radius curve, resolved into a table. A radius of 0 means the dot
// fell under MIN_DOT_PX and is not worth drawing, so that cull comes free.
function buildRadiusLut() {
    radiusLut = new Float32Array(RADIUS_STEPS + 1);
    for (let i = 0; i <= RADIUS_STEPS; i++) {
        const tone = i / RADIUS_STEPS;
        let r = areaR * Math.sqrt(Math.pow(tone, DOT_GAIN));
        // Only if the closing ramp has been switched back on.
        if (CLOSE_FROM < 1 && tone > CLOSE_FROM) {
            r = lerp(r, closeR, fade((tone - CLOSE_FROM) / (1 - CLOSE_FROM)));
        }
        radiusLut[i] = r < MIN_DOT_PX ? 0 : r;
    }
}

// --- drawing ----------------------------------------------------------------

/*
 * One pass over the lattice, one path, one fill.
 *
 * Every dot is the same colour, so they can all be accumulated into a single
 * path and filled in one call. That is half the performance story: several
 * thousand arcs cost very little to build, and filling them one at a time is
 * what would not be affordable. The other half is that the landscape is solved
 * on its own coarse grid a stripe at a time, so a dot only ever reads a number
 * out of it.
 */
function draw(t) {
    ctx.clearRect(0, 0, width, height);

    buildLandSlice(t);

    // The tide. One level for the whole plane, and a little of the same breath
    // added to every dot regardless of the ground it stands on.
    const breath = breathAt(t);
    const level = LEVEL_MID - TIDE_AMP * breath;
    const ambient = AMBIENT_TONE * breath;
    const markTone = LOGO_TONE + MARK_BREATH * breath;

    const hill = hillAmt > 0;
    const hillPeak = HILL_RISE * hillAmt;

    /*
     * A ripple is a thin annulus, and all but a sliver of the lattice is
     * outside it. Everything that is the same for every dot — the radius it has
     * reached, the height it has left, and the band it can possibly touch — is
     * worked out once here, and the band is kept as squared radii so the dot
     * loop rejects the great majority on a comparison rather than paying for a
     * square root it is going to throw away.
     */
    let nRip = 0;
    for (let i = 0; i < ripples.length; i++) {
        const rp = ripples[i];
        const age = t - rp.t0;
        const rad = age * RIPPLE_SPEED;
        const amp = RIPPLE_RISE * (1 - age / RIPPLE_LIFE) / (1 + rad / RIPPLE_SPREAD);
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

        // The ground under this dot. What the pointer raises is kept apart
        // from it rather than folded straight in, because the mark answers to
        // the pointer on its own terms further down.
        const ground = sampleLand(x, y);
        let touch = 0;

        if (hill) {
            const hx = x - hillX, hy = y - hillY;
            const q = 1 - (hx * hx + hy * hy) * INV_HILL_R2;
            if (q > 0) touch = hillPeak * q * q;
        }

        for (let i = 0; i < nRip; i++) {
            const dx = x - rpX[i], dy = y - rpY[i];
            const d2 = dx * dx + dy * dy;
            if (d2 > rpOut2[i] || d2 < rpIn2[i]) continue;
            const u = (Math.sqrt(d2) - rpRad[i]) * RIPPLE_INV_W;
            const env = 1 - u * u;
            touch += rpAmp[i] * env * env * Math.cos(u * RIPPLE_WAVE);
        }

        const h = ground + touch;

        // Where this ground stands against the tide. The shoreline is the whole
        // picture — how much ink is laid here — and a little raw height is
        // mixed back in so that country well above or well below the water
        // still has texture rather than going flat.
        const s = (h - level) * INV_SHORE + 0.5;
        const shore = s <= 0 ? 0 : s >= 1 ? 1 : fade(s);
        const shape = SHAPE_MIX * shore + HEIGHT_MIX * h - 0.5;

        let tone = BASE_TONE + LAND_RANGE * shape + ambient;

        // The mark is not weather, but it is not a sticker either: it keeps its
        // own tone, breathes with the tide, takes a share of the shoreline so
        // the breath crosses it rather than lifting all of it at once, and
        // answers the pointer directly. Held under a ceiling so that none of
        // those together can ever close its dots.
        const inside = dotIn[k];
        if (inside > 0) {
            let mark = markTone + MARK_LAND * shape + MARK_TOUCH * touch;
            if (mark > MARK_CEIL) mark = MARK_CEIL;
            tone += (mark - tone) * inside;
        }

        tone *= dotScale[k];
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

// One clock for everything, offset by the seed so a page does not always open
// at the same point of the breath. Ripples are stamped with it too, or a click
// would be timed against a different zero than the frame drawing it.
function now() {
    return performance.now() * 0.001 + timeOffset;
}

function animate() {
    const t = now();
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

    /*
     * Fit the screen to the viewport, in two directions and for two different
     * reasons. Small viewports get a finer screen, because PITCH is a fraction
     * of a phone rather than of a desktop and the mark needs dots enough to be
     * built out of. Very large ones get a coarser one, because the dot count
     * runs with area and a 5K display would otherwise cost three times the
     * frame — better a slightly coarser screen than a slower one.
     */
    const shortSide0 = Math.min(width, height);
    const fine = Math.min(1, Math.max(PITCH_FINEST, shortSide0 / LAND_REF));
    pitch = Math.max(PITCH * fine, Math.sqrt(width * height / MAX_DOTS));
    areaR = pitch * DOT_AREA;
    closeR = pitch * DOT_CLOSE;
    marginPx = Math.max(1, MARGIN * Math.min(width, height));

    /*
     * Fit the landscape to the viewport. Its features are a fraction of the
     * shorter side rather than a count of pixels, so a phone gets the same
     * country as a desktop instead of one hillside blown up to fill it, and the
     * grid it is solved on rides along with them.
     */
    const shortSide = shortSide0;
    landScale = 1 / (LAND_FEATURE * shortSide);
    landStep = Math.min(26, Math.max(10, Math.round(LAND_STEP * shortSide / LAND_REF)));
    invLandStep = 1 / landStep;

    landW = Math.ceil(width / landStep) + 2;
    landH = Math.ceil(height / landStep) + 2;
    land = new Float32Array(landW * landH);

    // Order matters: the lattice reads the distance field as it is built.
    buildLogo();
    buildLattice();
    buildRadiusLut();

    // The striped rebuild would otherwise leave most of the grid at zero for
    // its first sweep, which reads as the whole screen flooding in from the
    // top. Solve all of it once, here, where a few milliseconds cost nothing.
    landRow = 0;
    const t = now();
    for (let i = 0; i < LAND_SLICES; i++) buildLandSlice(t);
}

/*
 * Where the seed comes from: the URL first, so a landscape can be pinned or
 * sent to someone, then SEED if one has been written into the file, and failing
 * both a fresh one. A ?seed= that is not a number is hashed rather than
 * refused — a word makes a perfectly good seed, and is easier to remember than
 * ten digits.
 */
function resolveSeed() {
    let asked = null;
    try {
        asked = new URLSearchParams(window.location.search).get('seed');
    } catch (e) {
        asked = null;
    }

    if (asked) {
        const n = Number(asked);
        if (Number.isFinite(n)) return n >>> 0;
        let h = 0x811c9dc5;
        for (let i = 0; i < asked.length; i++) {
            h = Math.imul(h ^ asked.charCodeAt(i), 0x01000193);
        }
        return h >>> 0;
    }

    if (SEED !== null) return SEED >>> 0;
    return (Math.random() * 4294967296) >>> 0;
}

function setup() {
    seed = resolveSeed();
    seedNoise(seed);

    // Where in the noise field this page stands, and how far into the breath it
    // opens. Large offsets, so that two seeds are nowhere near each other.
    const rnd = makeRng(seed ^ 0x27d4eb2f);
    landOX = rnd() * 4096;
    landOY = rnd() * 4096;
    landOZ = rnd() * 4096;
    timeOffset = rnd() * 1000;

    if (SEED_ANNOUNCE) {
        console.info('halftone seed ' + seed + ' — keep it with ?seed=' + seed);
    }

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
    // which an impact wants, and it covers touch, where the swell never appears
    // because mousemove never fires.
    window.addEventListener('pointerdown', e => {
        addRipple(e.clientX, e.clientY, now());
    });

    animate();
}

setup();
