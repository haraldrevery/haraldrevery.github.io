// Headless smoke test for physarum.js: stubs the DOM, runs 300 frames,
// asserts the colony actually moves trail onto the plane.
'use strict';
const fs = require('fs');
const path = require('path');

const W = 1280, H = 800;

function makeCtx(w, h) {
    return {
        canvas: { width: w, height: h },
        imageSmoothingEnabled: false,
        setTransform() {},
        fill() {},
        fillStyle: '',
        getImageData(x, y, iw, ih) {
            return { data: new Uint8ClampedArray(iw * ih * 4), width: iw, height: ih };
        },
        putImageData() {},
        createImageData(iw, ih) {
            return { data: new Uint8ClampedArray(iw * ih * 4), width: iw, height: ih };
        },
        drawImage() {}
    };
}

const mainCanvas = { width: 0, height: 0, getContext: () => makeCtx(W, H) };
const toggleEl = { addEventListener() {} };
const iconEl = { textContent: '' };
const svgEl = { querySelectorAll: () => [] };

// The offscreen sim canvas is created inside resize(); give its context a
// putImageData that keeps a copy of the last rendered frame.
let lastFrame = null;
function makeSimCtx(w, h) {
    const c = makeCtx(w, h);
    c.putImageData = (img) => {
        lastFrame = { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
    };
    return c;
}

global.document = {
    documentElement: { classList: { contains: () => true, toggle() {} } },
    createElement: () => {
        const c = { width: 0, height: 0 };
        let ctx = null;
        c.getContext = (type, opts) => {
            // buildMask() asks for willReadFrequently; the sim canvas doesn't.
            if (opts && opts.willReadFrequently) {
                const rc = makeCtx(Math.max(1, c.width), Math.max(1, c.height));
                // Return real zeros for the mask raster; the logo paths list is
                // empty in this harness, which is fine — mask stays blank.
                return rc;
            }
            if (!ctx) ctx = makeSimCtx(Math.max(1, c.width), Math.max(1, c.height));
            return ctx;
        };
        return c;
    },
    getElementById(id) {
        if (id === 'physarum-canvas') return mainCanvas;
        if (id === 'mode-toggle_legacy') return toggleEl;
        if (id === 'mode-icon_legacy') return iconEl;
        if (id === 'svg-source_physarum') return svgEl;
        throw new Error('unexpected getElementById: ' + id);
    }
};

let rafCb = null;
global.requestAnimationFrame = cb => { rafCb = cb; };
global.window = {
    innerWidth: W,
    innerHeight: H,
    location: { search: '?seed=42' },
    addEventListener() {}
};
global.URLSearchParams = URLSearchParams;
global.Path2D = class { constructor(d) { this.d = d; } };
global.performance = { now: () => Date.now() };

const code = fs.readFileSync(path.join(__dirname, '..', 'javascript', 'physarum.js'), 'utf8');

// The real page rasterises the monogram's SVG paths; this harness has no
// renderer, so a synthetic mark — a soft disc in the middle of the plane —
// is injected after every buildMask() to exercise the same interior logic:
// markCells, born-in-the-mark spawns, fine senses, flush reseeding.
const wrapped = code
    .replace('function buildMask() {', `
function __synthMark() {
    const cx = sw / 2, cy = sh / 2, r = sh * 0.28;
    for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
            const d = Math.hypot(x - cx, y - cy) / r;
            if (d < 1) {
                const i = y * sw + x;
                mask[i] = Math.max(mask[i], 1 - d * d);
            }
        }
    }
    boxBlur(mask, sw, sh, 2, 1);
    const cells = [];
    for (let i = 0; i < mask.length; i++) {
        if (mask[i] > 0.5) cells.push(i);
    }
    markCells = Uint32Array.from(cells);
    const edge = [];
    for (let i = 0; i < mask.length; i++) {
        const m = mask[i];
        if (m > 0.4 && m < 0.6) edge.push(i);
    }
    borderCells = Uint32Array.from(edge);
    borderNx = new Float32Array(edge.length);
    borderNy = new Float32Array(edge.length);
    for (let k = 0; k < edge.length; k++) {
        const i = edge[k];
        const x = i % sw, y = (i / sw) | 0;
        const gx = mask[y * sw + Math.min(sw - 1, x + 1)] - mask[y * sw + Math.max(0, x - 1)];
        const gy = mask[Math.min(sh - 1, y + 1) * sw + x] - mask[Math.max(0, y - 1) * sw + x];
        const len = Math.hypot(gx, gy) + 1e-6;
        borderNx[k] = -gx / len;
        borderNy[k] = -gy / len;
    }
}
function buildMask() {`)
    .replace('    buildMask();\n    buildPalette();', '    buildMask();\n    __synthMark();\n    buildPalette();')
    .replace('setup();',
        'setup();\n__capture({ get sw(){return sw;}, get sh(){return sh;}, get trail(){return trail;}, get ax(){return ax;}, get agentCount(){return agentCount;}, get markCells(){return markCells;}, get borderCells(){return borderCells;}, get nextPulse(){return nextPulse;}, get nextChurn(){return nextChurn;} });');

let ex = null;
const capture = o => { ex = o; };

new Function('window', 'document', 'requestAnimationFrame', 'URLSearchParams', 'Path2D', 'performance', '__capture', wrapped)(
    global.window, global.document, global.requestAnimationFrame, global.URLSearchParams, global.Path2D, global.performance, capture
);

if (!ex) throw new Error('simulation did not boot');
console.log('booted: grid ' + ex.sw + 'x' + ex.sh + ', agents ' + ex.agentCount);
if (ex.agentCount < 1000) throw new Error('implausibly few agents');

// Run 3400 simulated frames (~57 s at 60 fps): long enough for vein networks
// to form, for at least one full 7–12 s border pulse, and for the first
// turbulence churn (34–48 s in) to fire.
for (let f = 0; f < 3400; f++) {
    const cb = rafCb; rafCb = null;
    cb(16.7 * (f + 1));
    if (!rafCb) throw new Error('animation chain broke at frame ' + f);
}

// A completed border pulse reschedules nextPulse past its initial 7–12 s
// window; if it is still inside that window, no pulse ever fired.
if (!(ex.nextPulse > 12)) {
    throw new Error('no border pulse fired in 25 s (nextPulse=' + ex.nextPulse + ')');
}
console.log('border pulse fired, rescheduled to t=' + ex.nextPulse.toFixed(1) + 's');

// Same logic for the churn storm: after firing it is rescheduled past its
// initial 34–48 s window.
if (!(ex.nextChurn > 48)) {
    throw new Error('no turbulence churn fired in 57 s (nextChurn=' + ex.nextChurn + ')');
}
console.log('turbulence churn fired, rescheduled to t=' + ex.nextChurn.toFixed(1) + 's');
if (ex.borderCells.length < 50) throw new Error('borderCells not populated');

let sum = 0, maxv = 0, over = 0;
const t = ex.trail;
for (let i = 0; i < t.length; i++) {
    sum += t[i];
    if (t[i] > maxv) maxv = t[i];
    if (t[i] > 24.001) over++;
}
console.log('after 1200 frames: trail sum=' + sum.toFixed(1) + ' max=' + maxv.toFixed(2));
if (!(sum > 0)) throw new Error('trail is empty — nothing deposited');
if (!(maxv > 0.5)) throw new Error('no trail accumulation');
if (over > 0) throw new Error('cap breached on ' + over + ' cells');

if (!lastFrame) throw new Error('nothing was ever rendered');

// The synthetic mark is a disc of radius sh*0.28 at the centre. The colony
// must be measurably denser inside it than in open country — that is the
// whole "logo emerges from the simulation" contract.
{
    const cx = ex.sw / 2, cy = ex.sh / 2, r = ex.sh * 0.28;
    let inSum = 0, inN = 0, outSum = 0, outN = 0;
    for (let y = 0; y < ex.sh; y++) {
        for (let x = 0; x < ex.sw; x++) {
            const d = Math.hypot(x - cx, y - cy) / r;
            const v = ex.trail[y * ex.sw + x];
            if (d < 0.8) { inSum += v; inN++; }
            else if (d > 1.3) { outSum += v; outN++; }
        }
    }
    const inMean = inSum / inN, outMean = outSum / outN;
    console.log('mark density: inside=' + inMean.toFixed(3) + ' outside=' + outMean.toFixed(3) +
        ' ratio=' + (inMean / outMean).toFixed(2));
    if (!(inMean > outMean * 1.3)) {
        throw new Error('mark is not denser than open country (ratio ' +
            (inMean / outMean).toFixed(2) + ')');
    }
    if (ex.markCells.length < 100) throw new Error('markCells not populated');
}

const ppmHead = Buffer.from('P6\n' + lastFrame.width + ' ' + lastFrame.height + '\n255\n');
const rgb = Buffer.alloc(lastFrame.width * lastFrame.height * 3);
for (let i = 0, j = 0; j < rgb.length; i += 4, j += 3) {
    rgb[j] = lastFrame.data[i];
    rgb[j + 1] = lastFrame.data[i + 1];
    rgb[j + 2] = lastFrame.data[i + 2];
}
fs.writeFileSync('/tmp/physarum_frame.ppm', Buffer.concat([ppmHead, rgb]));
console.log('snapshot written: /tmp/physarum_frame.ppm (' + lastFrame.width + 'x' + lastFrame.height + ')');
console.log('SMOKE_TEST_PASS');
