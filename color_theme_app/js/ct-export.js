/* Color Theme Generator: the theme model and every export format.
   snapshot() turns the saved theme into concrete colours; the builders turn a
   snapshot into files. Only renderSheet() touches the DOM (a canvas), so the
   rest runs under Node for tests/ct.test.js. */
(function (root) {
  'use strict';
  const C = root.CTColor || require('./ct-color.js');

  /* ---------------- theme model ---------------- */

  const DEFAULT_THEME = () => ({
    name: '',
    base: { h: 18, s: 0.62, v: 0.92, a: 1 },
    harmony: { mode: 'analogous', count: 3, spread: 30 },
    gradient: { stops: [{ r: 245, g: 234, b: 215, a: 1 }, { r: 38, g: 70, b: 83, a: 1 }], steps: 7 },
    contrast: { fg: { r: 26, g: 25, b: 22, a: 1 }, bg: { r: 255, g: 255, b: 255, a: 1 } }
  });

  const fin = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  // Accepts { r, g, b, a } objects or any colour string.
  function readColor(x) {
    if (typeof x === 'string') { const p = C.parse(x); return p ? C.quant(p.color) : null; }
    if (!x || typeof x !== 'object') return null;
    const r = Number(x.r), g = Number(x.g), b = Number(x.b);
    if (![r, g, b].every(Number.isFinite)) return null;
    return C.quant({ r, g, b, a: x.a == null ? 1 : fin(Number(x.a), 1) });
  }
  // Untrusted input (localStorage, imported files) -> a valid theme.
  function normalizeTheme(raw) {
    const d = DEFAULT_THEME();
    if (!raw || typeof raw !== 'object') return d;
    const t = d;
    t.name = typeof raw.name === 'string' ? raw.name.slice(0, 80) : '';
    const b = raw.base;
    if (typeof b === 'string' || (b && b.r != null)) {
      const c = readColor(b);
      if (c) { const v = C.rgbToHsv(c.r, c.g, c.b); t.base = { h: v.h, s: v.s, v: v.v, a: c.a }; }
    } else if (b && typeof b === 'object') {
      t.base = {
        h: C.mod360(fin(Number(b.h), d.base.h)),
        s: C.clamp(fin(Number(b.s), d.base.s), 0, 1),
        v: C.clamp(fin(Number(b.v), d.base.v), 0, 1),
        a: C.clamp(fin(Number(b.a), 1), 0, 1)
      };
    }
    const h = raw.harmony || {};
    if (C.HARMONY_MODES.indexOf(h.mode) >= 0) t.harmony.mode = h.mode;
    if ([3, 4, 5, 7].indexOf(Number(h.count)) >= 0) t.harmony.count = Number(h.count);
    t.harmony.spread = Math.round(C.clamp(fin(Number(h.spread), 30), 5, 90));
    const g = raw.gradient || {};
    const stops = Array.isArray(g.stops) ? g.stops.slice(0, 12).map(readColor).filter(Boolean) : [];
    if (stops.length >= 2) t.gradient.stops = stops;
    t.gradient.steps = Math.round(C.clamp(fin(Number(g.steps), 7), 2, 24));
    const k = raw.contrast || {};
    t.contrast.fg = readColor(k.fg) || d.contrast.fg;
    t.contrast.bg = readColor(k.bg) || d.contrast.bg;
    return t;
  }
  // Compact, human-readable form for storage and .json export (colours as hex).
  function serializeTheme(t) {
    return {
      name: t.name || '',
      base: { h: +t.base.h.toFixed(3), s: +t.base.s.toFixed(5), v: +t.base.v.toFixed(5), a: +t.base.a.toFixed(3) },
      harmony: Object.assign({}, t.harmony),
      gradient: { stops: t.gradient.stops.map(C.rgbToHex), steps: t.gradient.steps },
      contrast: { fg: C.rgbToHex(t.contrast.fg), bg: C.rgbToHex(t.contrast.bg) }
    };
  }

  const baseColor = (t) => C.quant(C.hsvToRgb(t.base.h, t.base.s, t.base.v, t.base.a));

  // Everything an export shows, computed once.
  function snapshot(t) {
    const base = baseColor(t);
    const hues = C.harmonyHues(t.base.h, t.harmony.mode, t.harmony.count, t.harmony.spread);
    const harmonyColors = hues.map((h) => C.quant(C.hsvToRgb(h, t.base.s, t.base.v, t.base.a)));
    const scale = C.toneScale(base).map((s) => ({
      step: s.step, color: C.quant(s.color), L: s.L,
      white: C.contrast(s.color, C.WHITE), black: C.contrast(s.color, C.BLACK)
    }));
    const stops = t.gradient.stops.map(C.quant);
    const steps = C.gradientSteps(stops, t.gradient.steps).map(C.quant);
    const ratio = C.contrast(t.contrast.fg, t.contrast.bg);
    return {
      name: t.name || '',
      base,
      harmony: {
        mode: t.harmony.mode, count: hues.length,
        spread: Math.round(C.harmonySpread(t.harmony.mode, t.harmony.count, t.harmony.spread)),
        usesSpread: t.harmony.mode === 'analogous' || t.harmony.mode === 'split',
        colors: harmonyColors, baseIndex: C.harmonyBaseIndex(t.harmony.mode, t.harmony.count)
      },
      scale,
      nearest: C.nearestStep(scale, base),
      gradient: {
        stops, steps,
        css: C.gradientCss(stops, 33),
        cssOklab: C.gradientCssOklab(stops)
      },
      contrast: { fg: C.quant(t.contrast.fg), bg: C.quant(t.contrast.bg), ratio, grade: C.grade(ratio) }
    };
  }

  // Every colour of the theme in order, for palette files.
  function entries(S, t) {
    const out = [{ group: 'base', name: t('n_base'), color: S.base }];
    S.harmony.colors.forEach((c, i) => { if (i !== S.harmony.baseIndex) out.push({ group: 'harmony', name: t('n_harmony', { n: i + 1 }), color: c }); });
    S.scale.forEach((s) => out.push({ group: 'scale', name: t('n_scale', { n: s.step }), color: s.color }));
    S.gradient.stops.forEach((c, i) => out.push({ group: 'stop', name: t('n_stop', { n: i + 1 }), color: c }));
    S.gradient.steps.forEach((c, i) => out.push({ group: 'step', name: t('n_step', { n: i + 1 }), color: c }));
    return out;
  }

  const harmonyLine = (S, t) =>
    t('mode_' + S.harmony.mode) + ' · ' + t('n_colors', { n: S.harmony.count }) +
    (S.harmony.usesSpread ? ' · ' + t('spread_deg', { n: S.harmony.spread }) : '');
  const gradeLabel = (g, t) => t('grade_' + g);
  const ratioTxt = (r) => C.num(r, 2) + ':1';
  const today = () => new Date().toISOString().slice(0, 10);
  const titleOf = (S, t) => S.name || t('untitled');

  /* ---------------- plain text ---------------- */

  const LABELS = { hex: 'HEX', rgb: 'RGB', hsl: 'HSL', hsv: 'HSV', oklch: 'OKLCH', cmyk: 'CMYK' };
  function textFile(S, t, date) {
    const L = [];
    const rule = (title) => { L.push(''); L.push(title.toUpperCase()); L.push('-'.repeat(Math.min(72, title.length))); };
    const row = (cols, widths) => cols.map((c, i) => (i < cols.length - 1 ? String(c).padEnd(widths[i]) : c)).join('  ').trimEnd();
    const allFormats = (c) => C.FORMATS.map((f) => C.format(c, f));
    const W = [10, 9, 22, 18, 18, 27];

    L.push(t('tool_name') + ': ' + titleOf(S, t));
    L.push(t('exported') + ' ' + (date || today()));
    L.push(t('note_exact'));
    L.push(t('note_cmyk'));

    rule(t('sec_base'));
    C.FORMATS.forEach((f) => L.push(row(['  ' + LABELS[f], C.format(S.base, f)], [10])));

    rule(t('sec_harmonies') + ' · ' + harmonyLine(S, t));
    L.push(row(['  #'].concat(C.FORMATS.map((f) => LABELS[f])), W));
    S.harmony.colors.forEach((c, i) => L.push(row(['  ' + (i + 1) + (i === S.harmony.baseIndex ? ' *' : '')].concat(allFormats(c)), W)));
    L.push('  * = ' + t('n_base').toLowerCase());

    rule(t('sec_scale') + ' · OKLCH');
    L.push(row(['  ' + t('step')].concat(C.FORMATS.map((f) => LABELS[f]), [t('on_white'), t('on_black')]), W.concat([27, 16])));
    S.scale.forEach((s, i) => L.push(row(
      ['  ' + s.step + (i === S.nearest ? ' *' : '')]
        .concat(allFormats(s.color), [ratioTxt(s.white) + ' ' + gradeLabel(C.grade(s.white), t), ratioTxt(s.black) + ' ' + gradeLabel(C.grade(s.black), t)]),
      W.concat([27, 16]))));
    L.push('  * = ' + t('nearest_base'));

    rule(t('sec_gradient') + ' · ' + t('grad_line', { stops: S.gradient.stops.length, steps: S.gradient.steps.length }));
    L.push('  CSS (' + t('css_modern') + '):');
    L.push('    ' + S.gradient.cssOklab + ';');
    L.push('  CSS (' + t('css_compat') + '):');
    L.push('    ' + S.gradient.css + ';');
    L.push('');
    L.push('  ' + t('stops'));
    S.gradient.stops.forEach((c, i) => L.push(row(['  ' + (i + 1)].concat(allFormats(c)), W)));
    L.push('');
    L.push('  ' + t('steps'));
    S.gradient.steps.forEach((c, i) => L.push(row(['  ' + (i + 1)].concat(allFormats(c)), W)));

    rule(t('sec_contrast'));
    L.push('  ' + t('text') + ': ' + C.format(S.contrast.fg, 'hex') + '   ' + t('background') + ': ' + C.format(S.contrast.bg, 'hex'));
    L.push('  ' + t('ratio') + ': ' + ratioTxt(S.contrast.ratio) + ' (' + gradeLabel(S.contrast.grade, t) + ')');
    const r = S.contrast.ratio;
    L.push('  ' + t('normal_text').padEnd(24) + 'AA ' + (r >= 4.5 ? '✓' : '✕') + '   AAA ' + (r >= 7 ? '✓' : '✕'));
    L.push('  ' + t('large_text').padEnd(24) + 'AA ' + (r >= 3 ? '✓' : '✕') + '   AAA ' + (r >= 4.5 ? '✓' : '✕'));
    L.push('  ' + t('ui_graphics').padEnd(24) + 'AA ' + (r >= 3 ? '✓' : '✕'));
    L.push('');
    return L.join('\n');
  }

  /* ---------------- CSS ---------------- */

  function cssFile(S, t, date) {
    const L = [];
    const v = (name, c) => L.push(`  --${name}: ${C.toCss(c)};`);
    L.push(`/* ${titleOf(S, t).replace(/\*\//g, '* /')} · ${t('tool_name')} · ${date || today()} */`);
    L.push(':root {');
    v('color-base', S.base);
    S.harmony.colors.forEach((c, i) => v('color-harmony-' + (i + 1), c));
    S.scale.forEach((s) => v('color-scale-' + s.step, s.color));
    S.gradient.stops.forEach((c, i) => v('color-gradient-stop-' + (i + 1), c));
    S.gradient.steps.forEach((c, i) => v('color-gradient-step-' + (i + 1), c));
    L.push(`  --gradient-theme: ${S.gradient.css};`);
    L.push('}');
    L.push('/* ' + t('css_modern') + ' */');
    L.push('@supports (background: linear-gradient(in oklab, red, blue)) {');
    L.push(`  :root { --gradient-theme: ${S.gradient.cssOklab}; }`);
    L.push('}');
    L.push('');
    return L.join('\n');
  }

  /* ---------------- GIMP / Krita / Inkscape palette ---------------- */

  function gplFile(S, t) {
    const L = ['GIMP Palette', 'Name: ' + titleOf(S, t).replace(/[\r\n]+/g, ' '), 'Columns: 11', '#'];
    entries(S, t).forEach((e) => {
      const q = e.color;
      L.push(`${String(q.r).padStart(3)} ${String(q.g).padStart(3)} ${String(q.b).padStart(3)}\t${e.name} ${C.format(q, 'hex').slice(0, 7)}`);
    });
    L.push('');
    return L.join('\n');
  }

  /* ---------------- Adobe Swatch Exchange (.ase, big-endian) ---------------- */

  function aseFile(S, t) {
    const bytes = [];
    const u16 = (n) => bytes.push((n >> 8) & 255, n & 255);
    const u32 = (n) => bytes.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
    const f32 = (x) => { const dv = new DataView(new ArrayBuffer(4)); dv.setFloat32(0, x); for (let i = 0; i < 4; i++) bytes.push(dv.getUint8(i)); };
    const name = (s) => { u16(s.length + 1); for (let i = 0; i < s.length; i++) u16(s.charCodeAt(i)); u16(0); };
    // A block is type + length + data; the length is patched once the data is written.
    const block = (type, write) => {
      u16(type); const at = bytes.length; u32(0);
      const start = bytes.length; write(); const len = bytes.length - start;
      bytes[at] = (len >>> 24) & 255; bytes[at + 1] = (len >>> 16) & 255; bytes[at + 2] = (len >>> 8) & 255; bytes[at + 3] = len & 255;
    };
    const groups = [];
    const byGroup = {};
    entries(S, t).forEach((e) => { if (!byGroup[e.group]) { byGroup[e.group] = []; groups.push(e.group); } byGroup[e.group].push(e); });
    const GROUP_KEYS = { base: 'n_base', harmony: 'sec_harmonies', scale: 'sec_scale', stop: 'stops', step: 'steps' };
    let blocks = 0;
    bytes.push(65, 83, 69, 70); // "ASEF"
    u16(1); u16(0);
    const countAt = bytes.length; u32(0);
    groups.forEach((g) => {
      const gname = (g === 'stop' || g === 'step' ? t('sec_gradient') + ' ' : '') + t(GROUP_KEYS[g]).toLowerCase();
      block(0xC001, () => name(gname.charAt(0).toUpperCase() + gname.slice(1))); blocks++;
      byGroup[g].forEach((e) => {
        block(0x0001, () => {
          name(e.name);
          bytes.push(82, 71, 66, 32); // "RGB "
          f32(e.color.r / 255); f32(e.color.g / 255); f32(e.color.b / 255);
          u16(2); // normal (not global / spot)
        });
        blocks++;
      });
      block(0xC002, () => {}); blocks++;
    });
    bytes[countAt] = (blocks >>> 24) & 255; bytes[countAt + 1] = (blocks >>> 16) & 255;
    bytes[countAt + 2] = (blocks >>> 8) & 255; bytes[countAt + 3] = blocks & 255;
    return new Uint8Array(bytes);
  }

  /* ---------------- ZIP (stored) + Procreate .swatches ---------------- */

  let CRC_TABLE = null;
  function crc32(u8) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Uint32Array(256);
      for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
    }
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  const utf8 = (s) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s) : Uint8Array.from(Buffer.from(s, 'utf8')));
  // files: [{ name, data: Uint8Array }] -> zip bytes (no compression).
  function zip(files, when) {
    const d = when || new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const out = [], central = [];
    let offset = 0;
    const le = (arr, n, size) => { for (let i = 0; i < size; i++) arr.push((n >>> (8 * i)) & 255); };
    files.forEach((f) => {
      const nm = utf8(f.name), crc = crc32(f.data), h = [];
      le(h, 0x04034b50, 4); le(h, 20, 2); le(h, 0x0800, 2); le(h, 0, 2); le(h, time, 2); le(h, date, 2);
      le(h, crc, 4); le(h, f.data.length, 4); le(h, f.data.length, 4); le(h, nm.length, 2); le(h, 0, 2);
      out.push(Uint8Array.from(h), nm, f.data);
      const c = [];
      le(c, 0x02014b50, 4); le(c, 20, 2); le(c, 20, 2); le(c, 0x0800, 2); le(c, 0, 2); le(c, time, 2); le(c, date, 2);
      le(c, crc, 4); le(c, f.data.length, 4); le(c, f.data.length, 4); le(c, nm.length, 2);
      le(c, 0, 2); le(c, 0, 2); le(c, 0, 2); le(c, 0, 2); le(c, 0, 4); le(c, offset, 4);
      central.push(Uint8Array.from(c), nm);
      offset += h.length + nm.length + f.data.length;
    });
    const cdSize = central.reduce((s, a) => s + a.length, 0), e = [];
    le(e, 0x06054b50, 4); le(e, 0, 2); le(e, 0, 2); le(e, files.length, 2); le(e, files.length, 2);
    le(e, cdSize, 4); le(e, offset, 4); le(e, 0, 2);
    const parts = out.concat(central, [Uint8Array.from(e)]);
    const total = parts.reduce((s, a) => s + a.length, 0), res = new Uint8Array(total);
    let p = 0;
    parts.forEach((a) => { res.set(a, p); p += a.length; });
    return res;
  }

  // Procreate palettes hold 30 swatches: base, harmonies, scale, gradient
  // stops, then gradient steps that are not already a stop.
  const PROCREATE_MAX = 30;
  function procreateColors(S, t) {
    const list = [];
    entries(S, t).forEach((e) => {
      if (e.group === 'step' && S.gradient.stops.some((s) => C.same(s, e.color))) return;
      if (list.length < PROCREATE_MAX) list.push(e.color);
    });
    return list;
  }
  function procreateFile(S, t) {
    const swatches = procreateColors(S, t).map((c) => {
      const v = C.rgbToHsv(c.r, c.g, c.b);
      return { hue: +(v.h / 360).toFixed(6), saturation: +v.s.toFixed(6), brightness: +v.v.toFixed(6), alpha: 1, colorSpace: 0 };
    });
    const json = JSON.stringify([{ name: titleOf(S, t), swatches }]);
    return zip([{ name: 'Swatches.json', data: utf8(json) }]);
  }

  /* ---------------- JSON ---------------- */

  const themeJson = (theme) => JSON.stringify({ type: 'rvry-color-theme', version: 2, exported: new Date().toISOString(), theme: serializeTheme(theme) }, null, 2);

  /* ---------------- PNG reference sheet ---------------- */

  const SHEET = {
    light: { bg: '#ffffff', ink: '#171717', ink2: '#525252', ink3: '#8a8a8a', line: '#e0e0e0', chk1: '#d9d9d9', chk2: '#ffffff' },
    dark: { bg: '#111111', ink: '#fafafa', ink2: '#b5b5b5', ink3: '#7a7a7a', line: '#2e2e2e', chk1: '#2a2a2a', chk2: '#444444' }
  };
  const FONT_TEXT = "HaraldText, 'Helvetica Neue', Arial, sans-serif";
  const FONT_MONO = "HaraldMono, ui-monospace, Menlo, monospace";

  // Draws the sheet at 2400 px wide; returns the canvas.
  function renderSheet(canvas, S, t, opts) {
    const P = SHEET[(opts && opts.dark) ? 'dark' : 'light'];
    const W = 2400, M = 120, CW = W - 2 * M;
    const date = (opts && opts.date) || today();
    const ctx = canvas.getContext('2d');
    const hasLS = 'letterSpacing' in ctx;

    const font = (size, mono) => { ctx.font = `${size}px ${mono ? FONT_MONO : FONT_TEXT}`; };
    // Shrink the font until `s` fits in `w`.
    const fit = (s, w, size, mono, min) => {
      let z = size;
      font(z, mono);
      while (z > (min || 12) && ctx.measureText(s).width > w) { z -= 1; font(z, mono); }
      return z;
    };
    const text = (s, x, y, size, color, mono, maxW, align) => {
      if (maxW) fit(s, maxW, size, mono); else font(size, mono);
      ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(s, x, y);
    };
    const label = (s, x, y) => {
      if (hasLS) ctx.letterSpacing = '6px';
      text(s.toUpperCase(), x, y, 28, P.ink2, true);
      if (hasLS) ctx.letterSpacing = '0px';
    };
    const checker = (x, y, w, h) => {
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      ctx.fillStyle = P.chk2; ctx.fillRect(x, y, w, h); ctx.fillStyle = P.chk1;
      const s = 16;
      for (let yy = 0; yy < h; yy += s) for (let xx = ((yy / s) % 2) * s; xx < w; xx += 2 * s) ctx.fillRect(x + xx, y + yy, s, s);
      ctx.restore();
    };
    const swatch = (c, x, y, w, h) => {
      if (!C.isOpaque(c)) checker(x, y, w, h);
      ctx.fillStyle = C.toCss(c); ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = P.line; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    };
    const best = (c) => (C.contrast(C.WHITE, c) >= C.contrast(C.BLACK, c) ? '#ffffff' : '#111111');

    // Layout heights (fixed, so the canvas can be sized before drawing).
    const nH = S.harmony.colors.length, nG = S.gradient.steps.length;
    const H_HEAD = 300, H_BASE = 60 + 420 + 110, H_HARM = 60 + 260 + 24 + 6 * 42 + 100;
    const H_SCALE = 60 + 220 + 20 + 8 * 34 + 100, H_GRAD = 60 + 160 + 250 + 190;
    const H_CON = 60 + 220 + 100, H_FOOT = 120;
    const H = H_HEAD + H_BASE + H_HARM + H_SCALE + H_GRAD + H_CON + H_FOOT;
    canvas.width = W; canvas.height = H;
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);

    let y = M;
    // Header
    text(titleOf(S, t), M, y + 70, 84, P.ink, false, CW - 700);
    text(t('tool_name'), W - M, y + 30, 28, P.ink2, true, 680, 'right');
    text(t('exported') + ' ' + date, W - M, y + 72, 28, P.ink3, true, 680, 'right');
    ctx.fillStyle = P.line; ctx.fillRect(M, y + 120, CW, 2);
    y = H_HEAD;

    // Base
    label(t('sec_base'), M, y + 30); y += 60;
    swatch(S.base, M, y, 420, 420);
    C.FORMATS.forEach((f, i) => {
      const ry = y + 52 + i * 68;
      text(LABELS[f], M + 480, ry, 30, P.ink3, true);
      text(C.format(S.base, f), M + 640, ry, 42, P.ink, true, CW - 520);
    });
    y += 420 + 110;

    // Harmonies
    label(t('sec_harmonies') + ' — ' + harmonyLine(S, t), M, y + 30); y += 60;
    {
      const gap = 24, w = (CW - gap * (nH - 1)) / nH;
      S.harmony.colors.forEach((c, i) => {
        const x = M + i * (w + gap);
        swatch(c, x, y, w, 260);
        if (i === S.harmony.baseIndex) text(t('n_base'), x + 18, y + 44, 26, best(c), true);
        C.FORMATS.forEach((f, j) => text(C.format(c, f), x, y + 260 + 24 + 30 + j * 42, j === 0 ? 34 : 26, j === 0 ? P.ink : P.ink2, true, w));
      });
    }
    y += 260 + 24 + 6 * 42 + 100;

    // Scale
    label(t('sec_scale'), M, y + 30); y += 60;
    {
      const n = S.scale.length, gap = 14, w = (CW - gap * (n - 1)) / n;
      S.scale.forEach((s, i) => {
        const x = M + i * (w + gap), c = s.color, ink = best(c);
        swatch(c, x, y, w, 220);
        text(String(s.step), x + 14, y + 40, 30, ink, true);
        if (i === S.nearest) { ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(x + w - 24, y + 30, 9, 0, Math.PI * 2); ctx.fill(); }
        const lines = C.FORMATS.map((f) => C.format(c, f));
        lines.forEach((l, j) => text(l, x, y + 220 + 20 + 26 + j * 34, j === 0 ? 28 : 20, j === 0 ? P.ink : P.ink2, true, w, 'left'));
        const wy = y + 220 + 20 + 26 + 6 * 34;
        text(t('on_white') + ' ' + C.num(s.white, 1) + ' ' + gradeLabel(C.grade(s.white), t), x, wy, 20, P.ink3, true, w);
        text(t('on_black') + ' ' + C.num(s.black, 1) + ' ' + gradeLabel(C.grade(s.black), t), x, wy + 34, 20, P.ink3, true, w);
      });
    }
    y += 220 + 20 + 8 * 34 + 100;

    // Gradient
    label(t('sec_gradient') + ' — ' + t('grad_line', { stops: S.gradient.stops.length, steps: nG }), M, y + 30); y += 60;
    {
      if (S.gradient.stops.some((c) => !C.isOpaque(c))) checker(M, y, CW, 120);
      for (let x = 0; x < CW; x += 2) { ctx.fillStyle = C.toCss(C.sampleAt(S.gradient.stops, x / (CW - 1))); ctx.fillRect(M + x, y, 2, 120); }
      ctx.strokeStyle = P.line; ctx.lineWidth = 2; ctx.strokeRect(M + 1, y + 1, CW - 2, 118);
      y += 120 + 40;
      const gap = nG > 12 ? 8 : 14, w = (CW - gap * (nG - 1)) / nG;
      S.gradient.steps.forEach((c, i) => {
        const x = M + i * (w + gap);
        swatch(c, x, y, w, 150);
        text(C.format(c, 'hex'), x + w / 2, y + 150 + 20 + 28, 26, P.ink, true, w, 'center');
      });
      y += 150 + 20 + 40 + 40;
      text(t('stops') + ': ' + S.gradient.stops.map((c) => C.format(c, 'hex')).join('  →  '), M, y, 26, P.ink2, true, CW);
      text(S.gradient.cssOklab, M, y + 50, 22, P.ink3, true, CW);
    }
    y += 190;

    // Contrast
    label(t('sec_contrast'), M, y + 30); y += 60;
    {
      const bg = C.flatten(S.contrast.bg, C.WHITE), fg = C.flatten(S.contrast.fg, bg);
      ctx.fillStyle = C.toCss(bg); ctx.fillRect(M, y, 900, 220);
      ctx.strokeStyle = P.line; ctx.lineWidth = 2; ctx.strokeRect(M + 1, y + 1, 898, 218);
      text('Aa', M + 40, y + 110, 84, C.toCss(fg));
      text(t('pangram'), M + 40, y + 175, 34, C.toCss(fg), false, 820);
      text(ratioTxt(S.contrast.ratio), M + 960, y + 90, 84, P.ink, true);
      text(gradeLabel(S.contrast.grade, t), M + 960, y + 150, 34, P.ink2, true);
      text(t('text') + ' ' + C.format(S.contrast.fg, 'hex') + ' · ' + t('background') + ' ' + C.format(S.contrast.bg, 'hex'), M + 960, y + 205, 26, P.ink3, true, CW - 960);
      const r = S.contrast.ratio, mark = (ok) => (ok ? '✓' : '✕');
      [[t('normal_text'), r >= 4.5, r >= 7], [t('large_text'), r >= 3, r >= 4.5], [t('ui_graphics'), r >= 3, null]].forEach((row, i) => {
        const ry = y + 50 + i * 60;
        text(row[0], M + 1560, ry, 28, P.ink2, true, 300);
        text('AA ' + mark(row[1]) + (row[2] == null ? '' : '   AAA ' + mark(row[2])), W - M, ry, 28, P.ink, true, 300, 'right');
      });
    }
    y += 220 + 100;

    // Footer
    ctx.fillStyle = P.line; ctx.fillRect(M, y - 40, CW, 2);
    text(t('note_exact') + ' ' + t('note_cmyk'), M, y + 10, 24, P.ink3, false, CW - 520);
    text('haraldrevery.com', W - M, y + 10, 24, P.ink3, true, 500, 'right');
    return canvas;
  }

  const API = {
    DEFAULT_THEME, normalizeTheme, serializeTheme, readColor, baseColor, snapshot, entries,
    textFile, cssFile, gplFile, aseFile, procreateFile, procreateColors, PROCREATE_MAX,
    themeJson, zip, crc32, renderSheet, harmonyLine
  };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.CTExport = API;
})(typeof window !== 'undefined' ? window : this);
