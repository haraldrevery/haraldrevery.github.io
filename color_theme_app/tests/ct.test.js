#!/usr/bin/env node
/* Unit tests for the Color Theme Generator's pure parts (colour maths,
   parsing, theme model, export files). No dependencies:
       node color_theme_app/tests/ct.test.js
   Exits non-zero on failure. The browser-only parts (canvas sheet, UI) are
   not covered here. */
'use strict';
const path = require('path');
const C = require(path.join(__dirname, '../js/ct-color.js'));
const X = require(path.join(__dirname, '../js/ct-export.js'));
const I = require(path.join(__dirname, '../js/ct-i18n.js'));

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) pass++;
  else { fail++; console.log('FAIL', name, extra !== undefined ? '→ ' + JSON.stringify(extra) : ''); }
}
const hexOf = (s, hint) => { const p = C.parse(s, hint); return p ? C.format(p.color, 'hex') : null; };

/* ---- parsing: every syntax an artist is likely to paste ---- */
const PARSE = [
  ['#ff0000', '#FF0000'], [' #FF0000 ', '#FF0000'], ['ff0000\n', '#FF0000'], ['#F00', '#FF0000'],
  ['#ff000080', '#FF000080'], ['0xFF8800', '#FF8800'], ['"#abcdef"', '#ABCDEF'], ['abc', '#AABBCC'],
  ['rgb(255, 0, 0)', '#FF0000'], ['rgb(255 0 0)', '#FF0000'], ['rgb(255 0 0 / 50%)', '#FF000080'],
  ['rgba(255,0,0,.5)', '#FF000080'], ['rgb(100%, 0%, 0%)', '#FF0000'], ['RGB(255, 0, 0)', '#FF0000'],
  ['255, 0, 0', '#FF0000'], ['255 0 0', '#FF0000'], ['255, 0, 0, 0.5', '#FF000080'],
  ['hsl(0, 100%, 50%)', '#FF0000'], ['hsl(0 100% 50%)', '#FF0000'], ['hsl(0deg 100% 50%)', '#FF0000'],
  ['hsl(-120, 100%, 50%)', '#0000FF'], ['hsl(240, 100, 50)', '#0000FF'], ['hsl(0.5turn 100% 50%)', '#00FFFF'],
  ['hsl(3.14159rad 100% 50%)', '#00FFFF'], ['hsla(0, 100%, 50%, 0.5)', '#FF000080'], ['hsl(120 1 0.5)', '#00FF00'],
  ['hsv(0, 100%, 100%)', '#FF0000'], ['hsb(120, 100%, 100%)', '#00FF00'], ['hwb(0 0% 0%)', '#FF0000'],
  ['hwb(0 100% 100%)', '#808080'],
  ['oklch(0.628 0.258 29.2)', '#FF0000'], ['oklch(62.8% 0.258 29.2)', '#FF0000'], ['oklch(0.628 0.258 29.2deg)', '#FF0000'],
  ['oklch(62.8% 0.258 29.2 / 0.5)', '#FF000080'], ['oklab(0.628 0.225 0.126)', '#FF0000'],
  ['lab(54.29 80.8 69.89)', '#FF0000'], ['lch(54.29 106.84 40.85)', '#FF0000'],
  ['color(srgb 1 0 0)', '#FF0000'], ['color(srgb-linear 1 0 0)', '#FF0000'], ['color(display-p3 0.6 0.6 0.6)', '#999999'],
  ['cmyk(0%, 100%, 100%, 0%)', '#FF0000'], ['cmyk(0, 100, 100, 0)', '#FF0000'], ['cmyk(0 100 100 0)', '#FF0000'],
  ['device-cmyk(0 1 1 0)', '#FF0000'], ['0%, 100%, 100%, 0%', '#FF0000'], ['0, 100, 100, 0', '#FF0000'],
  ['red', '#FF0000'], ['Red', '#FF0000'], ['rebeccapurple', '#663399'], ['grey', '#808080'], ['transparent', '#00000000'],
  ['--brand: #EB8559;', '#EB8559'], ['color: tomato', '#FF6347'],
  ['xyz', null], ['#ff00000', null], ['100', null], ['var(--x)', null], ['', null], ['R: 255 G: 0 B: 0', null]
];
PARSE.forEach(([s, want]) => ok(hexOf(s) === want, 'parse ' + JSON.stringify(s), hexOf(s)));

// Bare numbers follow the format the user is looking at.
ok(hexOf('120, 100%, 50%', 'hsl') === '#00FF00', 'hint hsl');
ok(hexOf('120, 100%, 100%', 'hsv') === '#00FF00', 'hint hsv');
ok(hexOf('86.64% 0.2948 142.5', 'oklch') === '#00FF00', 'hint oklch');
ok(hexOf('0, 100, 100, 0', 'cmyk') === '#FF0000', 'hint cmyk');
ok(hexOf('100', 'hex') === '#110000', 'hint hex short');

// Wide-gamut input is mapped into sRGB and says so; rounding noise is not "mapped".
ok(C.parse('oklch(0.7 0.4 150)').mapped === true, 'oklch out of gamut flagged');
ok(C.parse('color(display-p3 1 0 0)').mapped === true, 'p3 red flagged');
ok(C.parse('oklch(0.628 0.258 29.2)').mapped === false, 'rounding overshoot not flagged');
{
  const o = C.rgbToOklch(C.parse('oklch(0.7 0.25 150)').color);
  ok(Math.abs(o.h - 150) < 4, 'gamut mapping keeps the hue (within one JND)', o.h);
}

/* ---- every format the app prints parses back to the same colour ---- */
{
  let worst = {}, nulls = {};
  const rnd = (n) => Math.floor(Math.random() * n);
  for (let i = 0; i < 5000; i++) {
    const c = { r: rnd(256), g: rnd(256), b: rnd(256), a: i % 5 === 0 ? Math.round(Math.random() * 1000) / 1000 : 1 };
    C.FORMATS.forEach((f) => {
      if (f === 'cmyk' && c.a < 1) return; // CMYK has no alpha
      const p = C.parse(C.format(c, f));
      if (!p) { nulls[f] = (nulls[f] || 0) + 1; return; }
      const q = C.quant(p.color);
      const d = Math.max(Math.abs(q.r - c.r), Math.abs(q.g - c.g), Math.abs(q.b - c.b));
      worst[f] = Math.max(worst[f] || 0, d);
    });
  }
  ok(Object.keys(nulls).length === 0, 'all printed formats parse', nulls);
  ok(worst.hex === 0 && worst.rgb === 0, 'hex/rgb exact', worst);
  ok(worst.oklch <= 1, 'oklch within 1/255', worst.oklch);
  ok(worst.hsl <= 5 && worst.hsv <= 3 && worst.cmyk <= 3, 'hsl/hsv/cmyk integer rounding only', worst);
}

/* ---- list extraction (smart paste) ---- */
const ex = (s) => C.extract(s).map((x) => C.format(x.color, 'hex'));
ok(ex('#264653, #2a9d8f, #e9c46a').join() === '#264653,#2A9D8F,#E9C46A', 'comma hex list', ex('#264653, #2a9d8f, #e9c46a'));
ok(ex('https://coolors.co/264653-2a9d8f-e9c46a-f4a261-e76f51').length === 5, 'coolors url');
ok(ex(':root {\n  --a: #fff;\n  --b: rgb(0 0 0);\n  --c: tomato;\n}').join() === '#FFFFFF,#000000,#FF6347', 'css vars', ex(':root {\n  --a: #fff;\n  --b: rgb(0 0 0);\n  --c: tomato;\n}'));
ok(ex('red\nblue\ngreen').length === 3, 'named lines');
ok(ex('I want a red car and a tan coat').length === 0, 'prose is not a palette', ex('I want a red car and a tan coat'));
ok(ex('decade facade').length === 0, 'hex-looking words ignored');
ok(ex('hsl(10, 50%, 50%) oklch(70% 0.1 200) #000').length === 3, 'mixed functions in reading order');
ok(ex('#000 #000 #000').length === 1, 'duplicates dropped');
ok(ex('GIMP Palette\nName: x\n#\n255   0   0\tRed\n  0 255   0\tGreen\n').join() === '#FF0000,#00FF00', 'gpl text');
ok(ex('#abc'.repeat(1)).length === 1 && ex(Array(100).fill('#123456').map((h, i) => '#' + (i + 0x100000).toString(16)).join(' ')).length === 64, 'list capped at 64');

/* ---- contrast ---- */
ok(Math.abs(C.contrast(C.BLACK, C.WHITE) - 21) < 1e-9, 'black on white = 21');
ok(Math.abs(C.contrast({ r: 26, g: 25, b: 22, a: 1 }, C.WHITE) - 17.58) < 0.01, 'ink on white');
ok(C.grade(4.5) === 'AA' && C.grade(3) === 'AA18' && C.grade(7) === 'AAA' && C.grade(2.9) === 'fail', 'grades');
ok(Math.abs(C.contrast({ r: 0, g: 0, b: 0, a: 0.5 }, C.WHITE) - C.contrast({ r: 128, g: 128, b: 128, a: 1 }, C.WHITE)) < 0.05, 'translucent text flattened');
// A translucent colour on black is seen mixed with black (red at 50% on black
// was reported as 8.62 AAA; mixed with black it is dark red, 1.92).
{
  const red50 = { r: 255, g: 0, b: 0, a: 0.5 };
  ok(Math.abs(C.contrast(red50, C.BLACK) - 1.92) < 0.01, 'red 50% on black', C.contrast(red50, C.BLACK));
  ok(Math.abs(C.contrast(red50, C.WHITE) - C.contrast({ r: 255, g: 128, b: 128, a: 1 }, C.WHITE)) < 0.05, 'red 50% on white');
}

/* ---- theme derivation ---- */
{
  const base = { h: 18, s: 0.62, v: 0.92 };
  ok(C.harmonyHues(18, 'complementary').length === 2 && C.harmonyHues(18, 'square').length === 4, 'harmony counts');
  ok(C.harmonyHues(18, 'analogous', 7, 30).length === 7, 'analogous 7');
  ok(C.harmonyHues(18, 'analogous', 99, 30).length === 3, 'bad count falls back');
  // No two harmony colours on the same hue, whatever spread is stored
  // (7 x 90° used to give 108,198,288,18,108,198,288).
  const distinct = (hs) => hs.every((h, i) => hs.every((g, j) => i === j || Math.min(Math.abs(h - g), 360 - Math.abs(h - g)) >= 1));
  [3, 4, 5, 7].forEach((n) => [5, 30, 51, 60, 72, 90].forEach((sp) =>
    ok(distinct(C.harmonyHues(18, 'analogous', n, sp)), 'analogous distinct ' + n + 'x' + sp, C.harmonyHues(18, 'analogous', n, sp))));
  ok(C.maxSpread('analogous', 7) === 51 && C.maxSpread('analogous', 5) === 72 && C.maxSpread('analogous', 3) === 90 && C.maxSpread('split', 3) === 60, 'max spread');
  ok(C.harmonyHues(0, 'split', 3, 90).join() === '0,120,240', 'split capped at 60');
  // The export reports the spread the colours use, not the stored one.
  const sp = X.snapshot(X.normalizeTheme({ harmony: { mode: 'split', spread: 90 } }));
  ok(sp.harmony.spread === 60, 'split snapshot spread', sp.harmony.spread);
  const an = X.snapshot(X.normalizeTheme({ harmony: { mode: 'analogous', count: 7, spread: 90 } }));
  ok(an.harmony.spread === 51, 'analogous 7 snapshot spread', an.harmony.spread);
  const sc = C.toneScale(C.hsvToRgb(base.h, base.s, base.v));
  ok(sc.length === 11 && sc[0].step === 50 && sc[10].step === 950, 'scale steps');
  ok(sc.every((s, i) => i === 0 || C.rgbToOklch(s.color).L < C.rgbToOklch(sc[i - 1].color).L), 'scale is light to dark');
  // The ramp no longer drifts when a step is used as the base: same hue family.
  const h0 = C.rgbToOklch(sc[5].color).h, again = C.toneScale(sc[5].color);
  ok(Math.abs(C.rgbToOklch(again[5].color).h - h0) < 1.5, 'scale hue stable', [h0, C.rgbToOklch(again[5].color).h]);
  // Gradient: OKLab midpoint of red -> blue (the old CSS bar showed muddy #7F007F).
  const mid = C.gradientSteps([C.parse('#f00').color, C.parse('#00f').color], 7)[3];
  ok(C.format(mid, 'hex') === '#8C53A2', 'oklab midpoint', C.format(mid, 'hex'));
  const css = C.gradientCss([C.parse('#f00').color, C.parse('#00f').color], 33);
  ok(css.split(',').length === 34 && css.indexOf('#8C53A2') > 0, 'sampled CSS contains the same midpoint');
  ok(C.gradientCssOklab([C.parse('#f00').color, C.parse('#00f').color]) === 'linear-gradient(90deg in oklab, #FF0000, #0000FF)', 'oklab css');
}

/* ---- theme model: junk in, valid theme out ---- */
{
  const bad = X.normalizeTheme({ name: 5, base: { h: 'abc', s: 7, v: -1, a: 'x' }, harmony: { mode: 'evil', count: 400, spread: 'x' }, gradient: { stops: ['#f00', 'nope'], steps: 9999 }, contrast: { fg: 3 } });
  ok(bad.name === '' && bad.base.h === 18 && bad.base.s === 1 && bad.base.v === 0 && bad.base.a === 1, 'bad base clamped', bad.base);
  ok(bad.harmony.mode === 'analogous' && bad.harmony.count === 3 && bad.harmony.spread === 30, 'bad harmony reset', bad.harmony);
  ok(bad.gradient.stops.length === 2 && bad.gradient.steps === 24, 'bad gradient fixed', bad.gradient);
  const t0 = X.DEFAULT_THEME();
  t0.name = 'Höst';
  const round = X.normalizeTheme(JSON.parse(JSON.stringify(X.serializeTheme(t0))));
  ok(JSON.stringify(X.serializeTheme(round)) === JSON.stringify(X.serializeTheme(t0)), 'serialize round trip');
  ok(X.normalizeTheme({ base: '#336699' }).base.h > 200, 'base from a hex string');
}

/* ---- export files ---- */
const tEN = I.translator('en'), tSV = I.translator('sv');
const theme = X.normalizeTheme({ name: 'Sunset test', base: { h: 18, s: 0.62, v: 0.92, a: 1 }, harmony: { mode: 'analogous', count: 3, spread: 30 } });
const S = X.snapshot(theme);
{
  const txt = X.textFile(S, tEN, '2026-10-01');
  ['Sunset test', 'BASE COLOR', '#EB8559', 'HARMONIES', 'TINT & SHADE SCALE', 'GRADIENT', 'CONTRAST', 'in oklab', 'not an ICC'].forEach((s) => ok(txt.indexOf(s) >= 0, 'txt has ' + s));
  ok(!/undefined|NaN/.test(txt), 'txt clean');
  ok(C.extract(txt).length >= 20, 'txt pastes back as a list');
  const sv = X.textFile(S, tSV, '2026-10-01');
  ok(sv.indexOf('TONSKALA') >= 0 && sv.indexOf('Exporterad') >= 0, 'txt in Swedish');
  const css = X.cssFile(S, tEN, '2026-10-01');
  ok(/--color-base: #EB8559;/.test(css) && /--color-scale-500: #/.test(css) && /@supports/.test(css), 'css vars');
  ok((css.match(/--color-/g) || []).length === 1 + 3 + 11 + 2 + 7, 'css var count');
  const gpl = X.gplFile(S, tEN);
  ok(gpl.startsWith('GIMP Palette\nName: Sunset test\nColumns: 11\n#\n'), 'gpl header');
  ok(gpl.trim().split('\n').slice(4).every((l) => /^[ \d]{3} [ \d]{3} [ \d]{3}\t\S/.test(l)), 'gpl rows');
  ok(C.extract(gpl).length === X.entries(S, tEN).filter((e, i, a) => a.findIndex((x) => C.same(x.color, e.color)) === i).length, 'gpl re-imports');
}
// ASE: parse it back with an independent reader.
{
  const u8 = X.aseFile(S, tEN), dv = new DataView(u8.buffer);
  ok(String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) === 'ASEF' && dv.getUint16(4) === 1 && dv.getUint16(6) === 0, 'ase header');
  const nBlocks = dv.getUint32(8);
  let p = 12, colors = [], groups = 0, depth = 0, okStruct = true;
  for (let i = 0; i < nBlocks; i++) {
    const type = dv.getUint16(p), len = dv.getUint32(p + 2), start = p + 6;
    if (type === 0xC001) { groups++; depth++; }
    else if (type === 0xC002) { depth--; if (len !== 0) okStruct = false; }
    else if (type === 0x0001) {
      const nl = dv.getUint16(start);
      let name = '';
      for (let k = 0; k < nl - 1; k++) name += String.fromCharCode(dv.getUint16(start + 2 + k * 2));
      if (dv.getUint16(start + 2 + (nl - 1) * 2) !== 0) okStruct = false;
      const m = start + 2 + nl * 2;
      const model = String.fromCharCode(u8[m], u8[m + 1], u8[m + 2], u8[m + 3]);
      const rgb = [dv.getFloat32(m + 4), dv.getFloat32(m + 8), dv.getFloat32(m + 12)];
      if (model !== 'RGB ' || dv.getUint16(m + 16) !== 2 || m + 18 !== start + len) okStruct = false;
      colors.push({ name, hex: C.format({ r: rgb[0] * 255, g: rgb[1] * 255, b: rgb[2] * 255 }, 'hex') });
    } else okStruct = false;
    p = start + len;
  }
  ok(okStruct && depth === 0 && p === u8.length, 'ase structure', { okStruct, depth, p, len: u8.length });
  ok(groups === 5 && colors.length === X.entries(S, tEN).length, 'ase groups/colours', { groups, n: colors.length });
  ok(colors[0].name === 'Base' && colors[0].hex === '#EB8559', 'ase first colour', colors[0]);
}
// Procreate: a stored ZIP with Swatches.json (checked with an independent reader).
{
  const z = X.procreateFile(S, tEN), dv = new DataView(z.buffer);
  const eocd = z.length - 22;
  ok(dv.getUint32(eocd, true) === 0x06054b50 && dv.getUint16(eocd + 10, true) === 1, 'zip eocd');
  const cd = dv.getUint32(eocd + 16, true);
  ok(dv.getUint32(cd, true) === 0x02014b50, 'zip central dir');
  const nameLen = dv.getUint16(26, true), size = dv.getUint32(22, true), crc = dv.getUint32(14, true);
  const name = Buffer.from(z.slice(30, 30 + nameLen)).toString();
  const data = z.slice(30 + nameLen, 30 + nameLen + size);
  ok(name === 'Swatches.json' && X.crc32(data) === crc, 'zip entry + crc', name);
  const json = JSON.parse(Buffer.from(data).toString());
  ok(Array.isArray(json) && json[0].name === 'Sunset test' && json[0].swatches.length <= 30, 'procreate json', json[0].swatches.length);
  const s0 = json[0].swatches[0];
  ok(['hue', 'saturation', 'brightness', 'alpha', 'colorSpace'].every((k) => typeof s0[k] === 'number') && s0.hue < 1, 'procreate swatch keys');
  ok(X.crc32(Buffer.from('123456789')) === 0xCBF43926, 'crc32 check value');
}
{
  const back = JSON.parse(X.themeJson(theme));
  ok(back.type === 'rvry-color-theme' && back.version === 2, 'json envelope');
  ok(JSON.stringify(X.serializeTheme(X.normalizeTheme(back.theme))) === JSON.stringify(X.serializeTheme(theme)), 'json round trip');
}

/* ---- strings ---- */
{
  const en = Object.keys(I.STRINGS.en), sv = Object.keys(I.STRINGS.sv);
  ok(en.length === sv.length && en.every((k) => sv.indexOf(k) >= 0), 'EN and SV have the same keys', en.filter((k) => sv.indexOf(k) < 0).concat(sv.filter((k) => en.indexOf(k) < 0)));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
