/*
 * Physarum wallpaper: a colony of slime mould farming the monogram.
 *
 * Tens of thousands of single-celled agents crawl the plane. Each one reads
 * the trail three short steps ahead of itself — dead ahead, forward-left,
 * forward-right — turns toward the strongest scent, moves, and lays down a
 * little trail of its own. No agent knows another exists, and nothing on
 * screen is drawn by anyone. The veins, the webs, the dense felt of the mark,
 * are all side effects of that one rule run a few hundred million times.
 *
 * Each agent also has a small temperament of its own — a personal pace, a
 * personal reach, and a personal phase of the shuttle flow, the beat on which
 * real slime mould streams back and forth inside its veins. Cells surge,
 * slow, stop, and set off again out of phase with their neighbours, and the
 * trails thicken and thin with the surging. That is the difference between a
 * network that flows and one that lives.
 *
 * The monogram is never rendered. It enters the simulation as a field of
 * nutrient: agents that sense it steer toward it, and agents standing in it
 * lay down richer trail, so the colony farms the mark the way a real slime
 * mould farms a food source. The logo is whatever the network does to hold
 * onto it — some hours it reads as clean veins tracing the strokes, other
 * hours as a soft luminous bloom with roots running out of it, depending on
 * the seed, the weather and what the cursor has been doing.
 *
 * What keeps it watchable for hours is that the rules themselves drift. A
 * slow weather cycles how far the agents can see, how wide their sensory fan
 * opens, how hard they turn and how fast they run, over periods chosen so the
 * combined pattern does not repeat inside a day. Wide fans grow lace; narrow
 * ones grow rivers. On top of the weather sit two rarer events: gusts, which
 * fray the network for a few seconds until it rewires along new lines, and
 * flushes, which wash most of the trail out of the plane so the colony must
 * rebuild from its strongest highways. Neither ever lets the image settle
 * into a still life, and neither repeats the one before it.
 *
 * Everything hangs off a seed, drawn fresh on every load. Reload and it is a
 * different colony: where the agents begin, which way their first mistakes
 * lean, when the gusts arrive, what the weather was doing at minute zero.
 * Add ?seed=12345 to pin one, or read yours out of the console.
 *
 * Along the mark's borders runs a third, small rhythm of its own. Every seven
 * to twelve seconds a wave of colonists is carried out to the outline — the
 * same carriage a click gives the colony, but scattered along the edge
 * instead of one point, and with no food laid down when they arrive. All they
 * can do there is walk and lay their tiny traces, and those traces are what
 * rebuild the mark's border: the outline is constantly being redrawn by fresh
 * arrivals, which is what makes it read as alive rather than drawn.
 *
 * The cursor is a passing disturbance rather than a benefactor: trail is torn
 * and agents are scattered under the pointer, and the network visibly rewires
 * behind it. A click drops a rich bolus of food, and a share of the colony is
 * carried there, arriving as a visible wave.
 */

const canvas = document.getElementById('physarum-canvas');
const ctx = canvas.getContext('2d');
const toggle = document.getElementById('mode-toggle_legacy');
const icon = document.getElementById('mode-icon_legacy');
const svg = document.getElementById('svg-source_physarum');

let isDark = document.documentElement.classList.contains('dark');

toggle.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    isDark = document.documentElement.classList.contains('dark');
    icon.textContent = isDark ? '☀' : '🌙';
    buildPalette();
});

// --- tuning -----------------------------------------------------------------
//
// The simulation runs on its own grid, coarser than the screen, and everything
// below is counted in grid cells rather than pixels.

const SEED = null;
const SEED_ANNOUNCE = true;

const SIM_MAX_W = 1100;       // widest the simulation grid ever gets
const SIM_MIN_W = 380;        // narrowest, so phones stay legible
const SIM_FRACTION = 0.75;

const AGENT_PER_CELLS = 1 / 16;
const AGENT_MIN = 12000;
const AGENT_MAX = 52000;

// Where the mark sits: a fraction of viewport height, nudged off centre.
const LOGO_SPAN = 0.62;
const LOGO_SHIFT_X = 0.0;
const LOGO_SHIFT_Y = -0.01;

// The rule itself, before the weather bends it.
const SENSOR_DIST = 7;
const SENSOR_ANGLE = 0.44;
const TURN = 0.42;
const SPEED = 0.90;
const JITTER = 0.10;

const DEPOSIT = 1.15;
const MASK_FEED = 2.6;        // how much richer trail laid inside the mark is
const MASK_PULL = 2.5;        // how strongly the mark scents from empty ground

const MARK_SPAWN_SHARE = 0.35; // share of the colony born inside the mark
const MARK_FINE = 0.45;        // sensor reach shrink at full depth in the mark
const MARK_TURN = 0.50;        // turn-rate boost inside the mark
const MARK_SLOW = 0.32;        // pace reduction inside the mark

const DISTURB_R = 40;          // cursor disturbance radius, sim cells
const DISTURB_FADE = 0.80;     // trail thinning at the disturbance centre

const PULSE_MIN_GAP = 7;       // seconds between waves to the mark's outline
const PULSE_MAX_GAP = 12;
const PULSE_LEN = 2.4;         // each wave pours for half a second, not a click
const PULSE_SHARE = 0.06;      // share of the colony carried per wave
const PULSE_OUTWARD = 0.35;    // share of each wave set walking outward

// Turbulence — the eddy field. Without it a colony eventually settles into a
// handful of closed high-trail loops and stops exploring; the picture goes
// stale. The field is always there, but only as a whisper between storms:
// every ~40 s a churn ramps the eddies up hard for a few seconds, shakes the
// colony loose from whatever circuits it has settled into, and calms again.
const FLOW_CELL = 16;          // sim px per eddy cell (coarse on purpose)
const TURB_TURN = 0.012;       // rad an eddy bends a heading per step, at rest
const TURB_DRIFT = 0.020;      // px an eddy shoves a body per step, at rest

// The churn: how often the storm comes and how long it lasts.
const CHURN_MIN_GAP = 34, CHURN_MAX_GAP = 48, CHURN_LEN = 7;
const CHURN_TURN = 14;         // eddy bend multiplier at the storm's peak
const CHURN_DRIFT = 3.0;       // how much faster the field itself crawls

// The shuttle flow: the colony's beat. Every agent swells and rests on its
// own phase of this cycle, the way real slime mould streams back and forth
// inside its veins. ~14 seconds, out of phase across the colony.
const FLOW_RATE = 0.45;        // rad/s of the personal beat
const FLOW_FLOOR = 0.55;       // the beat's resting level
const FLOW_AMP = 0.65;         // how hard the beat swings around it
const PERS_SPREAD = 0.15;      // temperament spread of pace and reach

const DECAY = 0.955;          // trail evaporation, per step
const DIFFUSE = 0.28;         // trail spread toward the four neighbours
const TRAIL_CAP = 24;         // ceiling per cell, so busy junctions plateau
const TRAIL_SCALE = 2.8;      // soft normalisation for rendering
const MASK_TINT = 0.12;       // warmth ink takes inside the mark, over its own
                              // density — the brightness is the colony's, not
                              // a wash laid over it
const GUST_MIN_GAP = 55, GUST_MAX_GAP = 140, GUST_LEN = 8;
const FLUSH_MIN_GAP = 210, FLUSH_MAX_GAP = 420, FLUSH_LEN = 4;

// --- palette (edit me) --------------------------------------------------------
// Plain CSS hex strings: 3 or 6 digits, '#' optional, case doesn't matter.
// Each ramp runs background -> ... -> vein core; stop 0 is what empty plane
// reads as, the last stop is the brightest the busiest junction gets.
// ACCENT is the warm tone ink takes inside the logo mark (see MASK_TINT
// above for how strongly it pulls). Dark mode uses PALETTE_DARK, light mode
// PALETTE_LIGHT. A malformed hex falls back to that palette's default below.
const PALETTE_DARK_DEFAULT = {
    ramp: ['#0f1013', '#2e2a26', '#878787', '#e1e1e1', '#fafafa'],
    accent: '#ebebeb',
};
const PALETTE_LIGHT_DEFAULT = {
    ramp: ['#f7f6f2', '#d8d3c8', '#989081', '#46423a', '#161513'],
    accent: '#7c5f36',
};
const PALETTE_DARK = {
    ramp: ['#0f1013', '#2e2a26', '#878787', '#e1e1e1', '#fafafa'],
    accent: '#ebebeb',
};
const PALETTE_LIGHT = {
    ramp: ['#f7f6f2', '#d8d3c8', '#989081', '#46423a', '#161513'],
    accent: '#7c5f36',
};

// --- state ------------------------------------------------------------------

let seed = 0;
let width = 0, height = 0;
let sw = 0, sh = 0, scx = 1, scy = 1;   // sim size, css→sim scale

let trail = null, trailTmp = null;
let mask = null;                        // the mark, blurred, 0..1
let markCells = new Uint32Array(0);     // cells deep inside the mark, for spawns
let borderCells = new Uint32Array(0);   // the mark's edge band, for pulses
let borderNx = null, borderNy = null;   // outward normals along the edge band
let ax = null, ay = null, aa = null;    // the colony
let aPace = null, aReach = null, aBeat = null;  // temperament: pace, reach, flow phase
let agentCount = 0;

let simCanvas = null, simCtx = null, imgData = null;
const lut = new Uint8Array(256 * 3);
let accentR = 0, accentG = 0, accentB = 0;

let rng = Math.random;                  // becomes seeded in setup()
let lastTs = 0, simTime = 0;

let mouseInside = false, mouseX = 0, mouseY = 0;

let nextGust = 0, gustStart = -1;
let nextFlush = 0, flushStart = -1, flushKicked = false;
let nextPulse = 0, pulseStart = -1;
let nextChurn = 0, churnStart = -1;

// Live weather, recomputed once per frame and read by every agent.
let wSensorDist = SENSOR_DIST;
let wSensorAngle = SENSOR_ANGLE;
let wTurn = TURN;
let wSpeed = SPEED;
let wJitter = JITTER;
let wDepositMul = 1;
let wDecayMul = 1;
let wTurb = 1;                          // gusts churn the eddies harder
let wChurn = 0;                         // the turbulence storm's envelope

// The eddy field itself: angle + unit drift direction per coarse cell.
let flowA = null, flowX = null, flowY = null, flowW = 0, flowH = 0;
let flowT = 0, flowLastT = -1;

// --- the seed ---------------------------------------------------------------

/*
 * Mulberry32: four multiplies and a shift per call, which matters when the
 * colony asks for a fresh mistake once per agent per step. Good enough
 * statistics for slime, far faster than the real thing.
 */
function makeRng(n) {
    let a = n >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/*
 * Where the seed comes from: the URL first, so a colony can be pinned or sent
 * to someone, then SEED if one has been written into the file, and failing
 * both a fresh one. A ?seed= that is not a number is hashed rather than
 * refused — a word makes a perfectly good seed, and is easier to remember
 * than ten digits.
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

// --- separable box blur, for softening rasterised fields ---------------------

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

/*
 * The mark as nutrient, never as picture.
 *
 * The monogram's paths are rasterised straight into simulation space — the
 * same four strokes every other wallpaper on this site samples — and blurred
 * so its scent fades outward instead of stopping at an edge. Agents read this
 * field when they sense and when they deposit; nothing reads it when the
 * frame is drawn except to give ink laid inside the mark a slightly warmer
 * tone, so the colony's farming shows through without ever becoming a decal.
 */
function buildMask() {
    const off = document.createElement('canvas');
    off.width = sw;
    off.height = sh;
    const octx = off.getContext('2d', { willReadFrequently: true });

    // Fit the 1000x1100 viewBox to LOGO_SPAN of viewport height, centred,
    // then nudged. Scale is in sim cells per SVG unit.
    const s = (LOGO_SPAN * sh) / 1100;
    const cxs = sw / 2 + LOGO_SHIFT_X * sw;
    const cys = sh / 2 + LOGO_SHIFT_Y * sh;

    octx.setTransform(s, 0, 0, s, cxs - 500 * s, cys - 550 * s);
    octx.fillStyle = '#fff';
    svg.querySelectorAll('path').forEach(p => {
        octx.fill(new Path2D(p.getAttribute('d')));
    });

    const px = octx.getImageData(0, 0, sw, sh).data;
    mask = new Float32Array(sw * sh);
    for (let i = 0; i < mask.length; i++) {
        mask[i] = px[i * 4 + 3] * (1 / 255);
    }

    // Three-cell passes rather than two: the scent reaches a little further
    // out from the strokes, so traces approaching from further away still
    // feel the pull, and the mark's veins extend further before fading.
    boxBlur(mask, sw, sh, 3, 2);

    // Index every cell deep inside the mark. This is where a share of the
    // colony is born and where flushes reseed to, so the monogram is a place
    // the colony lives, not only a scent it walks toward. Rebuilt with the
    // mask on every resize.
    const cells = [];
    for (let i = 0; i < mask.length; i++) {
        if (mask[i] > 0.5) cells.push(i);
    }
    markCells = Uint32Array.from(cells);

    // The edge band — cells where the nutrient fades through half-strength —
    // is where the border waves land, so the mark beats along its own
    // outline rather than in its interior.
    const edge = [];
    for (let i = 0; i < mask.length; i++) {
        const m = mask[i];
        if (m > 0.4 && m < 0.6) edge.push(i);
    }
    borderCells = Uint32Array.from(edge);

    // The outward normal at each edge cell, read off the nutrient gradient.
    // This is how a wave knows which way is away from the mark, so some of
    // its colonists can be set walking outward instead of inward.
    borderNx = new Float32Array(edge.length);
    borderNy = new Float32Array(edge.length);
    for (let k = 0; k < edge.length; k++) {
        const i = edge[k];
        const x = i % sw, y = (i / sw) | 0;
        const xm = x > 0 ? x - 1 : x, xp = x < sw - 1 ? x + 1 : x;
        const ym = y > 0 ? y - 1 : y, yp = y < sh - 1 ? y + 1 : y;
        const gx = mask[y * sw + xp] - mask[y * sw + xm];
        const gy = mask[yp * sw + x] - mask[ym * sw + x];
        const len = Math.hypot(gx, gy) + 1e-6;
        borderNx[k] = -gx / len;
        borderNy[k] = -gy / len;
    }
}

// --- sizing and the colony ---------------------------------------------------

function spawnAgents() {
    agentCount = Math.max(AGENT_MIN,
        Math.min(AGENT_MAX, Math.round(sw * sh * AGENT_PER_CELLS)));

    ax = new Float32Array(agentCount);
    ay = new Float32Array(agentCount);
    aa = new Float32Array(agentCount);
    aPace = new Float32Array(agentCount);
    aReach = new Float32Array(agentCount);
    aBeat = new Float32Array(agentCount);

    const inside = markCells.length;

    for (let i = 0; i < agentCount; i++) {
        // A share of the colony is born inside the mark, so veins are
        // tracing the strokes from the first frame instead of creeping in
        // from the edges over the first minute.
        if (inside > 0 && rng() < MARK_SPAWN_SHARE) {
            const c = markCells[(rng() * inside) | 0];
            ax[i] = (c % sw) + rng();
            ay[i] = ((c / sw) | 0) + rng();
        } else {
            ax[i] = rng() * sw;
            ay[i] = rng() * sh;
        }
        aa[i] = rng() * Math.PI * 2;

        // Temperament. No two cells of a real colony move alike: a personal
        // pace, a personal sensor reach, and a personal phase of the shuttle
        // flow. The spread is narrow, but it is what stops the colony
        // marching in step like a drill squad and starts the veins
        // thickening and thinning like something streaming.
        aPace[i] = 1 + (rng() - 0.5) * 2 * PERS_SPREAD;
        aReach[i] = 1 + (rng() - 0.5) * 2 * PERS_SPREAD;
        aBeat[i] = rng() * Math.PI * 2;
    }
}

function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    // The grid rides the aspect ratio: a phone gets the same colony at a
    // smaller scale rather than one corner of it blown up.
    sw = Math.round(Math.min(SIM_MAX_W, Math.max(SIM_MIN_W, width * SIM_FRACTION)));
    sh = Math.max(240, Math.round(sw * height / width));
    scx = sw / width;
    scy = sh / height;

    trail = new Float32Array(sw * sh);
    trailTmp = new Float32Array(sw * sh);

    flowW = Math.ceil(sw / FLOW_CELL);
    flowH = Math.ceil(sh / FLOW_CELL);
    const fc = flowW * flowH;
    flowA = new Float32Array(fc);
    flowX = new Float32Array(fc);
    flowY = new Float32Array(fc);

    buildMask();
    buildPalette();
    spawnAgents();

    simCanvas = document.createElement('canvas');
    simCanvas.width = sw;
    simCanvas.height = sh;
    simCtx = simCanvas.getContext('2d');
    imgData = simCtx.createImageData(sw, sh);
}

// --- palette -----------------------------------------------------------------

/*
 * Two ramps, both quiet. In the dark the colony glows: charcoal through warm
 * amber to cream, the colour of slime mould under a lamp. On paper it is ink:
 * the same network read as an engraving, densest where the colony is busiest.
 * The accent is the tone ink takes inside the mark, so the farming reads as
 * warmth rather than outline.
 *
 * The colors themselves are the hex strings up top — PALETTE_DARK /
 * PALETTE_LIGHT — kept there so they can be tweaked without reading this far
 * down. These defaults only come into play when an edited string won't parse.
 */
function hexToRgb(str, fallback) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(str).trim());
    if (!m) {
        console.warn('physarum: bad color "' + str + '" — using default ' + fallback);
        return hexToRgb(fallback, fallback);
    }
    let h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function buildPalette() {
    const pal = isDark ? PALETTE_DARK : PALETTE_LIGHT;
    const def = isDark ? PALETTE_DARK_DEFAULT : PALETTE_LIGHT_DEFAULT;
    const stops = [];
    for (let i = 0; i < def.ramp.length; i++) {
        stops.push(hexToRgb(pal.ramp[i], def.ramp[i]));
    }
    ramp(stops);
    const acc = hexToRgb(pal.accent, def.accent);
    accentR = acc[0]; accentG = acc[1]; accentB = acc[2];
}

function ramp(stops) {
    const segs = stops.length - 1;
    for (let i = 0; i < 256; i++) {
        const t = i / 255 * segs;
        const k = Math.min(segs - 1, t | 0);
        const f = t - k;
        lut[i * 3]     = stops[k][0] + (stops[k + 1][0] - stops[k][0]) * f;
        lut[i * 3 + 1] = stops[k][1] + (stops[k + 1][1] - stops[k][1]) * f;
        lut[i * 3 + 2] = stops[k][2] + (stops[k + 1][2] - stops[k][2]) * f;
    }
}

// --- weather -----------------------------------------------------------------

/*
 * Five slow sines on incommensurate periods, phases drawn from the seed. No
 * single one does much; together they keep the colony's senses — reach, fan,
 * stubbornness, pace, nerves — wandering between temperaments whose combined
 * cycle is longer than a day of watching.
 */
const W_PHASES = new Float32Array(5);

function updateWeather() {
    const t = simTime;
    let gustEnv = 0;

    if (gustStart >= 0) {
        const g = (t - gustStart) / GUST_LEN;
        if (g >= 1) {
            gustStart = -1;
            nextGust = t + GUST_MIN_GAP + rng() * (GUST_MAX_GAP - GUST_MIN_GAP);
        } else {
            gustEnv = Math.sin(Math.PI * g);   // smooth in, smooth out
        }
    }

    // The turbulence storm: ramps up over a couple of seconds, shakes, and
    // calms the same way. Between storms the eddies are only a whisper.
    let churnEnv = 0;
    if (churnStart >= 0) {
        const g = (t - churnStart) / CHURN_LEN;
        if (g >= 1) {
            churnStart = -1;
            nextChurn = t + CHURN_MIN_GAP + rng() * (CHURN_MAX_GAP - CHURN_MIN_GAP);
        } else {
            churnEnv = Math.sin(Math.PI * g);
        }
    }
    wChurn = churnEnv;

    wSensorDist = SENSOR_DIST * (1 + 0.30 * Math.sin(t * 0.0620 + W_PHASES[0]));
    wSensorAngle = SENSOR_ANGLE * (1 + 0.55 * Math.sin(t * 0.0313 + W_PHASES[1]));
    wTurn = TURN * (1 + 0.40 * Math.sin(t * 0.0173 + W_PHASES[2]));
    wSpeed = SPEED * (1 + 0.25 * Math.sin(t * 0.0431 + W_PHASES[3]));
    wJitter = JITTER + 0.06 * Math.sin(t * 0.0117 + W_PHASES[4]);

    wDepositMul = 1;
    wDecayMul = 1;
    wTurb = 1 + CHURN_TURN * churnEnv;

    if (gustEnv > 0) {
        // A gust frays everything at once: faster, blinder, twitchier, and
        // laying thinner trail. Networks snap into threads and rewire.
        wSensorAngle *= 1 + 0.8 * gustEnv;
        wTurn *= 1 + 0.6 * gustEnv;
        wSpeed *= 1 + 0.5 * gustEnv;
        wJitter += 0.45 * gustEnv;
        wDepositMul *= 1 - 0.5 * gustEnv;
        wTurb += 1.5 * gustEnv;
    }
}

// --- turbulence ----------------------------------------------------------------

/*
 * The eddy field: one turning angle and one drift direction per coarse cell,
 * summed from four sines on incommensurate frequencies, all sliding slowly in
 * time. Nothing here is random per agent — every cell in a neighbourhood
 * shares an eddy, so the colony is carried in swirls rather than shaken
 * individually, which is the difference between water and static. The field
 * is cheap on purpose: a few thousand cells, refreshed every frame, while the
 * thirty-six thousand agents just look up their cell's two numbers.
 */
function updateFlow(dt) {
    // The field's own clock: it crawls between storms and churns hard during
    // one — a frozen field would shove everything one way; a rolling one
    // re-decides the shove as it goes, which is what actually shakes.
    flowT += dt * (0.5 + CHURN_DRIFT * wChurn);

    // The eddies crawl — refreshing at ~30 Hz is visually identical to every
    // frame and halves the field's cost.
    if (flowT - flowLastT < 0.033) return;
    flowLastT = flowT;
    const t = flowT;
    for (let j = 0; j < flowH; j++) {
        const v = j * 0.9;
        const row = j * flowW;
        for (let i = 0; i < flowW; i++) {
            const u = i * 0.9;
            const a = Math.sin(u * 1.9 + t * 0.31)
                    + Math.sin(v * 1.6 - t * 0.23)
                    + Math.sin((u + v) * 1.2 + t * 0.17)
                    + Math.sin((u - v) * 2.6 - t * 0.41);
            const k = row + i;
            flowA[k] = a;
            flowX[k] = Math.cos(a);
            flowY[k] = Math.sin(a);
        }
    }
}

// --- flushes -----------------------------------------------------------------

function scheduleEvents() {
    nextGust = simTime + GUST_MIN_GAP + rng() * (GUST_MAX_GAP - GUST_MIN_GAP);
    nextFlush = simTime + FLUSH_MIN_GAP + rng() * (FLUSH_MAX_GAP - FLUSH_MIN_GAP);
    nextPulse = simTime + PULSE_MIN_GAP + rng() * (PULSE_MAX_GAP - PULSE_MIN_GAP);
    nextChurn = simTime + CHURN_MIN_GAP + rng() * (CHURN_MAX_GAP - CHURN_MIN_GAP);
    gustStart = -1;
    flushStart = -1;
    pulseStart = -1;
    churnStart = -1;
}

function updateEvents(dt) {
    const t = simTime;

    if (gustStart < 0 && t >= nextGust) gustStart = t;

    if (churnStart < 0 && t >= nextChurn) churnStart = t;

    if (flushStart < 0 && t >= nextFlush) {
        flushStart = t;
        flushKicked = false;
    }

    if (flushStart >= 0) {
        const f = (t - flushStart) / FLUSH_LEN;
        if (f >= 1) {
            flushStart = -1;
            nextFlush = t + FLUSH_MIN_GAP + rng() * (FLUSH_MAX_GAP - FLUSH_MIN_GAP);
        } else {
            // The wash itself: evaporation runs hot for a few seconds. Once,
            // at the start, a share of the colony is scattered to fresh ground
            // so the rebuild sets out from somewhere new each time.
            wDecayMul = 0.90;
            if (!flushKicked) {
                flushKicked = true;
                for (let i = 0; i < agentCount; i++) {
                    if (rng() < 0.18) {
                        // Half the scattered are carried back into the mark,
                        // so after every wash the monogram is the first
                        // country the colony recolonises — it re-emerges out
                        // of the flush rather than fading back in.
                        if (markCells.length > 0 && rng() < 0.5) {
                            const c = markCells[(rng() * markCells.length) | 0];
                            ax[i] = (c % sw) + rng();
                            ay[i] = ((c / sw) | 0) + rng();
                        } else {
                            ax[i] = rng() * sw;
                            ay[i] = rng() * sh;
                        }
                        aa[i] = rng() * Math.PI * 2;
                    }
                }
            }
        }
    }

    // Waves to the outline — the mark's own small rhythm. A share of the
    // colony is carried to random points along the border band, the way a
    // click carries colonists to its rim, but nothing is laid down when they
    // arrive: no food, no clearing. All they can do is walk and lay their
    // tiny traces, so the mark's outline is redrawn by fresh arrivals rather
    // than repainted by the event itself.
    //
    // A wave is not a click, though — it pours. For half a second a stream
    // of colonists keeps landing along the outline, swelling in the middle
    // of the pour and easing off at both ends, so the edge reads as fed by
    // a current rather than stamped by an event.
    //
    // A share of every wave is set down a little way outside the edge,
    // facing away from the mark along its gradient. These are the emissaries:
    // they walk outward laying thin trail, and their traces are the roots
    // that run slowly out of the monogram into open country.
    if (pulseStart < 0 && t >= nextPulse && borderCells.length > 0) {
        pulseStart = t;
        nextPulse = t + PULSE_MIN_GAP + rng() * (PULSE_MAX_GAP - PULSE_MIN_GAP);
    }

    if (pulseStart >= 0) {
        const p = (t - pulseStart) / PULSE_LEN;
        if (p >= 1) {
            pulseStart = -1;
        } else {
            // Frame-rate independent: each frame carries its slice of the
            // wave, weighted by a swell envelope (mean of sin over the pour
            // is 2/π, so a full wave still moves PULSE_SHARE of the colony).
            const n = borderCells.length;
            const share = PULSE_SHARE * (Math.sin(Math.PI * p) / 0.6366) * dt / PULSE_LEN;
            for (let i = 0; i < agentCount; i++) {
                if (rng() < share) {
                    const k = (rng() * n) | 0;
                    const c = borderCells[k];

                    if (rng() < PULSE_OUTWARD) {
                        const d = 3 + rng() * 8;
                        let px = (c % sw) + borderNx[k] * d;
                        let py = ((c / sw) | 0) + borderNy[k] * d;
                        if (px < 0) px += sw; else if (px >= sw) px -= sw;
                        if (py < 0) py += sh; else if (py >= sh) py -= sh;
                        ax[i] = px;
                        ay[i] = py;
                        aa[i] = Math.atan2(borderNy[k], borderNx[k]) + (rng() - 0.5) * 0.9;
                    } else {
                        ax[i] = (c % sw) + rng();
                        ay[i] = ((c / sw) | 0) + rng();
                        aa[i] = rng() * Math.PI * 2;
                    }
                }
            }
        }
    }
}

// --- the rule ----------------------------------------------------------------

/*
 * One sensor read at a given reach. The plane is a torus, so sensing past an
 * edge wraps to the other side rather than reading a wall — a colony has no
 * idea the screen is there, and it should never learn.
 */
function sense(x, y, ang, reach) {
    let sx = x + Math.cos(ang) * reach;
    let sy = y + Math.sin(ang) * reach;
    if (sx < 0) sx += sw; else if (sx >= sw) sx -= sw;
    if (sy < 0) sy += sh; else if (sy >= sh) sy -= sh;

    const c = ((sy | 0) * sw + (sx | 0));
    return trail[c] + mask[c] * MASK_PULL;
}

function stepAgents() {
    const dep = DEPOSIT * wDepositMul;

    for (let i = 0; i < agentCount; i++) {
        let x = ax[i], y = ay[i], ang = aa[i];

        // The shuttle flow: this agent's own beat of surging and resting.
        // The swing dips below zero at the trough, which clamps to a full
        // stop — cells pause, hold, and set off again, out of phase with
        // their neighbours, which is what makes the veins stream and throb
        // instead of flowing like a conveyor belt.
        let flow = FLOW_FLOOR + FLOW_AMP * Math.sin(simTime * FLOW_RATE + aBeat[i]);
        if (flow < 0) flow = 0;
        const flowDep = flow < 1 ? flow : 1;

        // How deep in the nutrient this agent stands. Inside the mark the
        // colony's senses contract — shorter reach, sharper turns, slower
        // pace — so the network grown there is finer and denser than the
        // open-country web. The monogram reads as its own country of small
        // veins rather than a tinted patch of the same web everywhere else.
        const m = mask[((y | 0) * sw + (x | 0))];
        const reach = (m > 0 ? wSensorDist * (1 - MARK_FINE * m) : wSensorDist) * aReach[i];
        const turn = m > 0 ? wTurn * (1 + MARK_TURN * m) : wTurn;
        const spd = (m > 0 ? wSpeed * (1 - MARK_SLOW * m) : wSpeed) * aPace[i] * flow;

        const f = sense(x, y, ang, reach);
        const l = sense(x, y, ang - wSensorAngle, reach);
        const r = sense(x, y, ang + wSensorAngle, reach);

        if (f >= l && f >= r) {
            // straight on
        } else if (l > r) {
            ang -= turn;
        } else if (r > l) {
            ang += turn;
        } else {
            ang += (rng() < 0.5 ? -turn : turn);
        }

        ang += (rng() - 0.5) * wJitter;

        // Turbulence: this cell's eddy bends the heading a touch and shoves
        // the body a touch. Tiny per step, but it never stops, so a vein that
        // has closed into a circuit is always being pried open somewhere
        // along it — the picture keeps re-deciding itself instead of setting.
        const fk = ((y / FLOW_CELL) | 0) * flowW + ((x / FLOW_CELL) | 0);
        ang += flowA[fk] * TURB_TURN * wTurb;
        x += flowX[fk] * TURB_DRIFT * wTurb;
        y += flowY[fk] * TURB_DRIFT * wTurb;

        x += Math.cos(ang) * spd;
        y += Math.sin(ang) * spd;
        if (x < 0) x += sw; else if (x >= sw) x -= sw;
        if (y < 0) y += sh; else if (y >= sh) y -= sh;

        ax[i] = x; ay[i] = y; aa[i] = ang;

        // Deposit, richer inside the mark — this is the farming that makes
        // the monogram the fattest country on the map without ever drawing
        // it. Clamped here rather than only in the diffusion pass, because a
        // vein junction takes many visitors between passes and would
        // otherwise keep creeping past whatever ceiling the plane agrees on.
        // The ink laid is proportional to how far the cell actually moved:
        // a resting agent leaves nothing behind, so stalls read as pauses in
        // the stream rather than hot dots of piled-up ink.
        const c = ((y | 0) * sw + (x | 0));
        let v = trail[c] + dep * flowDep * (1 + MASK_FEED * mask[c]);
        trail[c] = v < TRAIL_CAP ? v : TRAIL_CAP;
    }
}

/*
 * Evaporation and spread in one pass over the plane, into the spare buffer.
 * The wrap is horizontal only; top and bottom clamp, which costs nothing at
 * those edges and keeps the pass branch-light where most pixels live.
 *
 * The cap is what makes an hour look like a minute: without it a busy junction
 * keeps brightening forever, and after long enough the whole map is blown out.
 * With it, every cell settles at its own equilibrium and stays there, so the
 * picture holds its contrast no matter how long the colony has been running.
 */
function diffuseDecay() {
    const a = trail, b = trailTmp;
    const decay = DECAY * wDecayMul;

    for (let y = 0; y < sh; y++) {
        const row = y * sw;
        const up = y > 0 ? row - sw : row;
        const dn = y < sh - 1 ? row + sw : row;
        for (let x = 0; x < sw; x++) {
            const i = row + x;
            const lf = x > 0 ? i - 1 : i + sw - 1;
            const rt = x < sw - 1 ? i + 1 : i - sw + 1;
            const avg = (a[lf] + a[rt] + a[up + x] + a[dn + x]) * 0.25;
            let v = (a[i] + (avg - a[i]) * DIFFUSE) * decay;
            b[i] = v < TRAIL_CAP ? v : TRAIL_CAP;
        }
    }

    trail = b;
    trailTmp = a;
}

// --- food from outside -------------------------------------------------------

function stampDisc(cx, cy, r, amt) {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(sw - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(sh - 1, Math.ceil(cy + r));
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) {
        const dy = y - cy;
        for (let x = x0; x <= x1; x++) {
            const dx = x - cx;
            const d2 = dx * dx + dy * dy;
            if (d2 <= r2) {
                trail[y * sw + x] += amt * (1 - d2 / r2);
            }
        }
    }
}

/*
 * A click drops a bolus of food and carries a share of the colony to its rim,
 * facing out. The wave of arrivals, and the network that grows to exploit the
 * windfall before it evaporates, is the one piece of theatre the colony is
 * allowed on demand.
 */
function bloom(cx, cy) {
    stampDisc(cx, cy, 53, 6);

    for (let i = 0; i < agentCount; i++) {
        if (rng() < 0.08) {
            const a = rng() * Math.PI * 2;
            const rr = 30 + rng() * 46;
            ax[i] = cx + Math.cos(a) * rr;
            ay[i] = cy + Math.sin(a) * rr;
            aa[i] = a;
        }
    }
}

/*
 * The cursor as a passing disturbance. Trail is thinned under the pointer —
 * the network visibly tears where you move — and any agent caught in the
 * radius is shoved outward and spun off its heading. Nothing is added: the
 * interest comes from watching the colony repair the damage, rerouting its
 * highways around wherever the hand has been.
 */
function disturb(cx, cy) {
    const r = DISTURB_R;
    const r2 = r * r;

    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(sw - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(sh - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
        const dy = y - cy;
        for (let x = x0; x <= x1; x++) {
            const dx = x - cx;
            const d2 = dx * dx + dy * dy;
            if (d2 <= r2) {
                const i = y * sw + x;
                const v = trail[i] * (1 - DISTURB_FADE * (1 - d2 / r2));
                trail[i] = v > 0 ? v : 0;
            }
        }
    }

    for (let i = 0; i < agentCount; i++) {
        const dx = ax[i] - cx, dy = ay[i] - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2) {
            const d = Math.sqrt(d2) + 0.001;
            const strength = 1 - d2 / r2;
            const push = strength * 1.4;
            ax[i] += (dx / d) * push;
            ay[i] += (dy / d) * push;
            aa[i] += (rng() - 0.5) * 1.4 * strength;
        }
    }
}

// --- the frame ---------------------------------------------------------------

function render() {
    const d = imgData.data;
    const n = sw * sh;

    for (let i = 0, j = 0; i < n; i++, j += 4) {
        const v = trail[i];
        let k = ((v / (v + TRAIL_SCALE)) * 255) | 0;
        k *= 3;

        let r = lut[k], g = lut[k + 1], b = lut[k + 2];

        // Ink laid inside the mark takes a whisper of accent tone, weighted
        // by the square of its depth so the warmth hugs the strokes rather
        // than fogging the ground around them. The brightness of the mark is
        // the colony's own density — the tint only warms it.
        const m = mask[i];
        if (m > 0) {
            const f = m * m * MASK_TINT;
            r += (accentR - r) * f;
            g += (accentG - g) * f;
            b += (accentB - b) * f;
        }

        d[j] = r;
        d[j + 1] = g;
        d[j + 2] = b;
        d[j + 3] = 255;
    }

    simCtx.putImageData(imgData, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(simCanvas, 0, 0, width, height);
}

function tick(ts) {
    requestAnimationFrame(tick);

    if (!lastTs) { lastTs = ts; return; }
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.05) dt = 0.05;          // tab came back from the background
    simTime += dt;

    updateEvents(dt);
    updateWeather();
    updateFlow(dt);

    // Two steps only when the display is running behind, so a slow machine
    // gets the same colony at half pace rather than a different one.
    const steps = dt > 0.024 ? 2 : 1;
    for (let s = 0; s < steps; s++) {
        diffuseDecay();
        stepAgents();
    }

    // The cursor as a passing disturbance: trail torn and agents scattered
    // under the pointer, and the network rewires behind it.
    if (mouseInside) {
        disturb(mouseX * scx, mouseY * scy);
    }

    render();
}

// --- boot --------------------------------------------------------------------

function setup() {
    seed = resolveSeed();

    rng = makeRng(seed ^ 0x9e3779b9);

    // Weather phases: where in each cycle this colony wakes up.
    for (let i = 0; i < 5; i++) W_PHASES[i] = rng() * Math.PI * 2;

    if (SEED_ANNOUNCE) {
        console.info('physarum seed ' + seed + ' — keep it with ?seed=' + seed);
    }

    resize();
    scheduleEvents();

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 150);
    });

    window.addEventListener('mousemove', e => {
        mouseInside = true;
        mouseX = e.clientX;
        mouseY = e.clientY;
    });
    window.addEventListener('mouseout', () => { mouseInside = false; });

    // pointerdown, not click: it fires on the press rather than the release,
    // which a bolus of food wants, and it covers touch.
    window.addEventListener('pointerdown', e => {
        bloom(e.clientX * scx, e.clientY * scy);
    });

    requestAnimationFrame(tick);
}

setup();