/* Color Theme Generator: colour maths, parsing and theme derivation.
   No DOM access, so tests/ct.test.js can run it under Node.

   A colour is { r, g, b, a }: r/g/b are sRGB 0-255 (floats allowed), a is 0-1.
   Every value shown to the user is computed from the 8-bit rounded colour
   (quant), so HEX and the other formats always describe the same colour. */
(function (root) {
  'use strict';

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const mod360 = (h) => ((h % 360) + 360) % 360;
  // Round to d decimals; never prints "-0".
  const num = (v, d) => {
    const m = Math.pow(10, d || 0);
    const x = Math.round(v * m) / m;
    return String(x === 0 ? 0 : x);
  };
  const alphaOf = (c) => (c && c.a != null && Number.isFinite(c.a) ? clamp(c.a, 0, 1) : 1);
  const isOpaque = (c) => alphaOf(c) >= 0.9995;

  // 8-bit colour with a 3-decimal alpha: the "real" colour every format describes.
  function quant(c) {
    return {
      r: clamp(Math.round(c.r), 0, 255),
      g: clamp(Math.round(c.g), 0, 255),
      b: clamp(Math.round(c.b), 0, 255),
      a: Math.round(alphaOf(c) * 1000) / 1000
    };
  }
  const same = (x, y) => {
    const p = quant(x), q = quant(y);
    return p.r === q.r && p.g === q.g && p.b === q.b && p.a === q.a;
  };

  /* ---------------- sRGB-family models ---------------- */

  function rgbToHex(c) {
    const q = quant(c);
    const h2 = (n) => n.toString(16).padStart(2, '0');
    let s = '#' + h2(q.r) + h2(q.g) + h2(q.b);
    const ab = Math.round(q.a * 255);
    if (ab < 255) s += h2(ab);
    return s.toUpperCase();
  }
  function hexToRgb(hex) {
    let h = hex.replace(/^#|^0x/i, '');
    if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h.slice(0, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d > 0) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = mod360(h * 60);
    }
    return { h, s: mx === 0 ? 0 : d / mx, v: mx };
  }
  function hsvToRgb(h, s, v, a) {
    h = mod360(h); s = clamp(s, 0, 1); v = clamp(v, 0, 1);
    const f = (n) => {
      const k = (n + h / 60) % 6;
      return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    };
    return { r: f(5) * 255, g: f(3) * 255, b: f(1) * 255, a: a == null ? 1 : a };
  }
  function rgbToHsl(r, g, b) {
    const { h, s: sv, v } = rgbToHsv(r, g, b);
    const l = v * (1 - sv / 2);
    const s = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
    return { h, s, l };
  }
  function hslToRgb(h, s, l, a) {
    s = clamp(s, 0, 1); l = clamp(l, 0, 1);
    const v = l + s * Math.min(l, 1 - l);
    return hsvToRgb(h, v === 0 ? 0 : 2 * (1 - l / v), v, a);
  }
  function hwbToRgb(h, w, bk, a) {
    w = clamp(w, 0, 1); bk = clamp(bk, 0, 1);
    if (w + bk >= 1) { const g = (w / (w + bk)) * 255; return { r: g, g: g, b: g, a: a == null ? 1 : a }; }
    const v = 1 - bk;
    return hsvToRgb(h, 1 - w / v, v, a);
  }
  // Naive device CMYK (no ICC profile), the same conversion most web tools use.
  function rgbToCmyk(r, g, b) {
    const k = 1 - Math.max(r, g, b) / 255;
    if (k >= 1 - 1e-9) return { c: 0, m: 0, y: 0, k: 1 };
    return { c: (1 - r / 255 - k) / (1 - k), m: (1 - g / 255 - k) / (1 - k), y: (1 - b / 255 - k) / (1 - k), k };
  }
  function cmykToRgb(c, m, y, k) {
    return { r: 255 * (1 - c) * (1 - k), g: 255 * (1 - m) * (1 - k), b: 255 * (1 - y) * (1 - k), a: 1 };
  }

  /* ---------------- linear light, XYZ, Lab, OKLab ---------------- */

  // Sign-preserving transfer functions (CSS Color 4), so out-of-gamut values survive.
  const toLin = (c) => { const s = c < 0 ? -1 : 1, x = Math.abs(c); return s * (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)); };
  const toGam = (c) => { const s = c < 0 ? -1 : 1, x = Math.abs(c); return s * (x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055); };
  const mul = (M, v) => [
    M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
    M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
    M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]
  ];
  // Matrices from the CSS Color 4 sample code.
  const LIN_SRGB_TO_XYZ = [
    [506752 / 1228815, 87881 / 245763, 12673 / 70218],
    [87098 / 409605, 175762 / 245763, 12673 / 175545],
    [7918 / 409605, 87881 / 737289, 1001167 / 1053270]
  ];
  const XYZ_TO_LIN_SRGB = [
    [12831 / 3959, -329 / 214, -1974 / 3959],
    [-851781 / 878810, 1648619 / 878810, 36519 / 878810],
    [705 / 12673, -2585 / 12673, 705 / 667]
  ];
  const LIN_P3_TO_XYZ = [
    [608311 / 1250200, 189793 / 714400, 198249 / 1000160],
    [35783 / 156275, 247089 / 357200, 198249 / 2500400],
    [0, 32229 / 714400, 5220557 / 5000800]
  ];
  const D50_TO_D65 = [
    [0.955473421488075, -0.02309845494876471, 0.06325924320057072],
    [-0.0283697093338637, 1.0099953980813041, 0.021041441191917323],
    [0.012314014864481998, -0.020507649298898964, 1.330365926242124]
  ];
  const D65_TO_D50 = [
    [1.0479297925449969, 0.022946870601609652, -0.05019226628920524],
    [0.02962780877005599, 0.9904344267538799, -0.017073799063418826],
    [-0.009243040646204504, 0.015055191490298152, 0.7518742814281371]
  ];
  const D50_WHITE = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];

  function labToLinSrgb(L, a, b) {
    const k = 24389 / 27, e = 216 / 24389;
    const f1 = (L + 16) / 116, f0 = a / 500 + f1, f2 = f1 - b / 200;
    const x = Math.pow(f0, 3) > e ? Math.pow(f0, 3) : (116 * f0 - 16) / k;
    const y = L > k * e ? Math.pow(f1, 3) : L / k;
    const z = Math.pow(f2, 3) > e ? Math.pow(f2, 3) : (116 * f2 - 16) / k;
    const d50 = [x * D50_WHITE[0], y * D50_WHITE[1], z * D50_WHITE[2]];
    return mul(XYZ_TO_LIN_SRGB, mul(D50_TO_D65, d50));
  }

  // OKLab (Björn Ottosson's matrices) on linear sRGB.
  function linToOklab(r, g, b) {
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return {
      L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    };
  }
  function oklabToLin(L, a, b) {
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    ];
  }
  const rgbToOklab = (c) => linToOklab(toLin(c.r / 255), toLin(c.g / 255), toLin(c.b / 255));
  function rgbToOklch(c) {
    const o = rgbToOklab(c);
    const C = Math.hypot(o.a, o.b);
    return { L: o.L, C, h: C < 1e-4 ? 0 : mod360(Math.atan2(o.b, o.a) * 180 / Math.PI) };
  }

  /* ---------------- gamut mapping (CSS Color 4, OKLCH chroma reduction) ---------------- */

  const inGamut = (lin, eps) => lin.every((v) => { const g = toGam(v); return g >= -eps && g <= 1 + eps; });
  const clipLin = (lin) => lin.map((v) => toLin(clamp(toGam(v), 0, 1)));
  const deltaEOK = (p, q) => Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
  const linToColor = (lin, a) => ({ r: clamp(toGam(lin[0]), 0, 1) * 255, g: clamp(toGam(lin[1]), 0, 1) * 255, b: clamp(toGam(lin[2]), 0, 1) * 255, a });

  // Linear sRGB (maybe out of gamut) -> colour, plus whether mapping it into
  // sRGB changed it visibly (rounding overshoots like oklch(62.8% 0.258 29.2)
  // for pure red do not count).
  function fromLinear(lin, a) {
    const r = mapLinear(lin, a == null ? 1 : clamp(a, 0, 1));
    if (r.mapped) {
      const o = linToOklab(lin[0], lin[1], lin[2]), q = quant(r.color);
      r.mapped = deltaEOK(o, linToOklab(toLin(q.r / 255), toLin(q.g / 255), toLin(q.b / 255))) > 0.006;
    }
    return r;
  }
  function mapLinear(lin, a) {
    if (inGamut(lin, 1e-5)) return { color: linToColor(lin, a), mapped: false };
    const o = linToOklab(lin[0], lin[1], lin[2]);
    if (o.L >= 1) return { color: { r: 255, g: 255, b: 255, a }, mapped: true };
    if (o.L <= 0) return { color: { r: 0, g: 0, b: 0, a }, mapped: true };
    const C0 = Math.hypot(o.a, o.b), hr = Math.atan2(o.b, o.a);
    const JND = 0.02, EPS = 0.0001;
    const at = (C) => oklabToLin(o.L, C * Math.cos(hr), C * Math.sin(hr));
    const okOf = (l) => linToOklab(l[0], l[1], l[2]);
    const clipped = clipLin(lin);
    if (deltaEOK(okOf(clipped), o) < JND) return { color: linToColor(clipped, a), mapped: true };
    let lo = 0, hi = C0, loInGamut = true;
    while (hi - lo > EPS) {
      const C = (lo + hi) / 2, cur = at(C);
      if (loInGamut && inGamut(cur, 1e-6)) { lo = C; continue; }
      const E = deltaEOK(okOf(clipLin(cur)), okOf(cur));
      if (E < JND) {
        lo = C;
        if (JND - E < EPS) break;
        loInGamut = false;
      } else hi = C;
    }
    // `lo` is the most chroma that is in gamut or within one JND of it.
    return { color: linToColor(clipLin(at(lo)), a), mapped: true };
  }
  const oklchToRgb = (L, C, h, a) => fromLinear(oklabToLin(L, C * Math.cos(h * Math.PI / 180), C * Math.sin(h * Math.PI / 180)), a).color;

  /* ---------------- formatting ---------------- */

  const FORMATS = ['hex', 'rgb', 'hsl', 'hsv', 'oklch', 'cmyk'];

  function format(c, fmt) {
    const q = quant(c), op = q.a >= 0.9995, a = num(q.a, 3);
    switch (fmt) {
      case 'rgb':
        return op ? `rgb(${q.r}, ${q.g}, ${q.b})` : `rgba(${q.r}, ${q.g}, ${q.b}, ${a})`;
      case 'hsl': {
        const h = rgbToHsl(q.r, q.g, q.b);
        const body = `${num(h.h, 0) % 360}, ${num(h.s * 100, 0)}%, ${num(h.l * 100, 0)}%`;
        return op ? `hsl(${body})` : `hsla(${body}, ${a})`;
      }
      case 'hsv': {
        const h = rgbToHsv(q.r, q.g, q.b);
        const body = `${num(h.h, 0) % 360}, ${num(h.s * 100, 0)}%, ${num(h.v * 100, 0)}%`;
        return op ? `hsv(${body})` : `hsva(${body}, ${a})`;
      }
      case 'oklch': {
        const o = rgbToOklch(q);
        const body = `${num(o.L * 100, 2)}% ${num(o.C, 4)} ${num(o.h, 2) % 360}`;
        return op ? `oklch(${body})` : `oklch(${body} / ${a})`;
      }
      case 'cmyk': {
        const k = rgbToCmyk(q.r, q.g, q.b);
        return `cmyk(${num(k.c * 100, 0)}%, ${num(k.m * 100, 0)}%, ${num(k.y * 100, 0)}%, ${num(k.k * 100, 0)}%)`;
      }
      default:
        return rgbToHex(q);
    }
  }
  // Valid CSS for any colour (8-digit hex when translucent).
  const toCss = (c) => rgbToHex(c);

  /* ---------------- parsing ---------------- */

  const NAMED = {};
  ('aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc bisque:ffe4c4 black:000000 ' +
   'blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 ' +
   'chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b ' +
   'darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b darkmagenta:8b008b ' +
   'darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 darksalmon:e9967a darkseagreen:8fbc8f ' +
   'darkslateblue:483d8b darkslategray:2f4f4f darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 ' +
   'deepskyblue:00bfff dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 forestgreen:228b22 ' +
   'fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f ' +
   'grey:808080 honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa ' +
   'lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff ' +
   'lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 lightpink:ffb6c1 lightsalmon:ffa07a ' +
   'lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0 ' +
   'lime:00ff00 limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa mediumblue:0000cd ' +
   'mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 mediumslateblue:7b68ee mediumspringgreen:00fa9a ' +
   'mediumturquoise:48d1cc mediumvioletred:c71585 midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 ' +
   'navajowhite:ffdead navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500 orchid:da70d6 ' +
   'palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 ' +
   'peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f ' +
   'royalblue:4169e1 saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee sienna:a0522d ' +
   'silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa springgreen:00ff7f ' +
   'steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 violet:ee82ee wheat:f5deb3 ' +
   'white:ffffff whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32 transparent:00000000')
    .split(' ').forEach((p) => { const i = p.indexOf(':'); NAMED[p.slice(0, i)] = p.slice(i + 1); });

  const TOK = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|deg|rad|grad|turn)?$/i;
  function tok(s) {
    if (/^none$/i.test(s)) return { n: 0, unit: '' };
    const m = TOK.exec(s);
    return m ? { n: parseFloat(m[1]), unit: (m[2] || '').toLowerCase() } : null;
  }
  // "a, b, c" | "a b c" | "a b c / d" | "a, b, c, d" -> { v: [tokens], alpha: token|null }
  // With commas, one value past `channels` is the legacy alpha (rgba(r, g, b, a)).
  function args(body, channels) {
    const slash = body.split('/');
    if (slash.length > 2) return null;
    const parts = slash[0].trim().split(/\s*,\s*|\s+/).filter(Boolean).map(tok);
    if (parts.some((p) => !p)) return null;
    let alpha = null;
    if (slash.length === 2) {
      alpha = tok(slash[1].trim());
      if (!alpha) return null;
    } else if (channels && parts.length === channels + 1 && /,/.test(slash[0])) {
      alpha = parts.pop();
    }
    return { v: parts, alpha };
  }
  const hueOf = (t) => (t.unit === 'rad' ? t.n * 180 / Math.PI : t.unit === 'grad' ? t.n * 0.9 : t.unit === 'turn' ? t.n * 360 : t.n);
  // Percent or plain number; `scale` is what 100% means.
  const pn = (t, scale) => (t.unit === '%' ? (t.n / 100) * scale : t.n);
  // s/l/w/b style components: "50%", a bare 0-100 number (CSS) or, when every
  // bare component is <= 1, a 0-1 fraction (common in code and other tools).
  const pctReader = (A) => {
    const frac = A.v.slice(1).every((t) => t.unit !== '%' && t.n <= 1);
    return (t) => (t.unit === '%' ? t.n / 100 : frac ? t.n : t.n / 100);
  };
  const alphaVal = (t) => (t == null ? 1 : clamp(t.unit === '%' ? t.n / 100 : t.n, 0, 1));
  const srgbOut = (c) => ({ color: { r: clamp(c.r, 0, 255), g: clamp(c.g, 0, 255), b: clamp(c.b, 0, 255), a: alphaOf(c) }, mapped: false });

  const FUNCS = {
    rgb(A) {
      if (A.v.length !== 3) return null;
      const ch = (t) => (t.unit === '%' ? t.n * 2.55 : t.n);
      return srgbOut({ r: ch(A.v[0]), g: ch(A.v[1]), b: ch(A.v[2]), a: alphaVal(A.alpha) });
    },
    hsl(A) { if (A.v.length !== 3) return null; const p = pctReader(A); return srgbOut(hslToRgb(hueOf(A.v[0]), p(A.v[1]), p(A.v[2]), alphaVal(A.alpha))); },
    hsv(A) { if (A.v.length !== 3) return null; const p = pctReader(A); return srgbOut(hsvToRgb(hueOf(A.v[0]), p(A.v[1]), p(A.v[2]), alphaVal(A.alpha))); },
    hwb(A) { if (A.v.length !== 3) return null; const p = pctReader(A); return srgbOut(hwbToRgb(hueOf(A.v[0]), p(A.v[1]), p(A.v[2]), alphaVal(A.alpha))); },
    lab(A) { return A.v.length === 3 ? fromLinear(labToLinSrgb(pn(A.v[0], 100), pn(A.v[1], 125), pn(A.v[2], 125)), alphaVal(A.alpha)) : null; },
    lch(A) {
      if (A.v.length !== 3) return null;
      const C = Math.max(0, pn(A.v[1], 150)), h = hueOf(A.v[2]) * Math.PI / 180;
      return fromLinear(labToLinSrgb(pn(A.v[0], 100), C * Math.cos(h), C * Math.sin(h)), alphaVal(A.alpha));
    },
    oklab(A) { return A.v.length === 3 ? fromLinear(oklabToLin(pn(A.v[0], 1), pn(A.v[1], 0.4), pn(A.v[2], 0.4)), alphaVal(A.alpha)) : null; },
    oklch(A) {
      if (A.v.length !== 3) return null;
      const L = pn(A.v[0], 1), C = Math.max(0, pn(A.v[1], 0.4)), h = hueOf(A.v[2]) * Math.PI / 180;
      return fromLinear(oklabToLin(L, C * Math.cos(h), C * Math.sin(h)), alphaVal(A.alpha));
    },
    cmyk(A, fn) {
      if (A.v.length !== 4) return null;
      // device-cmyk() and all-<=1 values are 0-1 numbers; otherwise 0-100.
      const unit = fn === 'device-cmyk' || A.v.every((t) => t.unit !== '%' && t.n <= 1);
      const f = (t) => clamp(t.unit === '%' ? t.n / 100 : unit ? t.n : t.n / 100, 0, 1);
      const c = cmykToRgb(f(A.v[0]), f(A.v[1]), f(A.v[2]), f(A.v[3]));
      c.a = alphaVal(A.alpha);
      return srgbOut(c);
    }
  };
  FUNCS.rgba = FUNCS.rgb; FUNCS.hsla = FUNCS.hsl; FUNCS.hsva = FUNCS.hsb = FUNCS.hsba = FUNCS.hsv;
  FUNCS['device-cmyk'] = FUNCS.cmyk;

  const COLOR_SPACES = {
    'srgb': (v) => v.map(toLin),
    'srgb-linear': (v) => v,
    'display-p3': (v) => mul(XYZ_TO_LIN_SRGB, mul(LIN_P3_TO_XYZ, v.map(toLin))),
    'xyz': (v) => mul(XYZ_TO_LIN_SRGB, v),
    'xyz-d65': (v) => mul(XYZ_TO_LIN_SRGB, v),
    'xyz-d50': (v) => mul(XYZ_TO_LIN_SRGB, mul(D50_TO_D65, v))
  };
  function colorFn(body) {
    const m = /^\s*([a-z0-9-]+)\s+(.*)$/i.exec(body);
    if (!m) return null;
    const conv = COLOR_SPACES[m[1].toLowerCase()];
    const A = args(m[2], 3);
    if (!conv || !A || A.v.length !== 3) return null;
    return fromLinear(conv(A.v.map((t) => pn(t, 1))), alphaVal(A.alpha));
  }

  // Browser fallback for CSS syntax this file does not implement (color-mix(),
  // relative colours, rec2020...). The app installs a canvas-based one.
  let fallback = null;

  // Bare numbers like "120, 100%, 50%" or "0.7 0.1 200": read them in the
  // format the user is looking at (`hint`), else guess from the units.
  function bare(s, hint) {
    const A = args(s);
    if (!A) return null;
    const v = A.v, n = v.length, pc = v.map((t) => t.unit === '%');
    if (hint === 'hsl' || hint === 'hsv' || hint === 'oklch') {
      if (n === 4 && !A.alpha) A.alpha = v.pop();
      return A.v.length === 3 ? FUNCS[hint](A) : null;
    }
    if (hint === 'cmyk' && n === 4 && !A.alpha) return FUNCS.cmyk(A, 'cmyk');
    if (n === 4 && !A.alpha) {
      // "0, 100, 100, 0" is CMYK: a fully transparent RGBA is never what is meant.
      if (pc.every(Boolean) || v[3].n > 1 || (v[3].n === 0 && v.every((t) => t.n <= 100))) return FUNCS.cmyk(A, 'cmyk');
      A.alpha = v.pop();
      return FUNCS.rgb(A);
    }
    if (n !== 3) return null;
    if (!pc[0] && pc[1] && pc[2]) return FUNCS.hsl(A);
    if (v.some((t) => t.unit && t.unit !== '%')) return null;
    return FUNCS.rgb(A);
  }

  // Parse one colour. Returns { color, mapped, via } or null.
  // `mapped` is true when a wide-gamut input had to be brought into sRGB.
  function parse(input, hint) {
    if (input == null) return null;
    let s = String(input).trim().replace(/^["'`]+|["'`;,]+$/g, '').trim();
    if (!s || s.length > 400) return null;
    // "--brand: #EB8559" / "color: red" -> the value part.
    const kv = /^[-\w\s.]+:\s*(.+)$/.exec(s);
    if (kv && !/^[a-z-]+\(/i.test(s)) s = kv[1].trim();
    const low = s.toLowerCase();

    let m = /^(?:#|0x)([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
    if (m) return { color: hexToRgb(m[1]), mapped: false, via: 'hex' };
    m = /^([0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s) ||
        ((hint === 'hex' || /[a-f]/i.test(s)) && /^([0-9a-f]{3,4})$/i.exec(s));
    if (m) return { color: hexToRgb(m[1]), mapped: false, via: 'hex' };
    if (NAMED[low]) return { color: hexToRgb(NAMED[low]), mapped: false, via: 'name' };

    m = /^([a-z-]+)\(\s*([\s\S]*?)\s*\)$/i.exec(s);
    if (m) {
      const fn = m[1].toLowerCase();
      let out = null;
      if (fn === 'color') out = colorFn(m[2]);
      else if (FUNCS[fn]) { const A = args(m[2], /cmyk/.test(fn) ? 4 : 3); out = A ? FUNCS[fn](A, fn) : null; }
      if (out) { out.via = fn; return out; }
      if (fallback && !/^(var|env|attr|calc)$/.test(fn)) {
        const c = fallback(s);
        if (c) return { color: c, mapped: false, via: 'browser' };
      }
      return null;
    }
    const out = bare(s, hint);
    if (out) out.via = 'bare';
    return out;
  }

  /* ---------------- lists (smart paste of several colours) ---------------- */

  const FN_RE = /\b(rgba?|hsla?|hs[vb]a?|hwb|lab|lch|oklab|oklch|color|device-cmyk|cmyk|color-mix)\(/gi;
  const MAX_LIST = 64;

  // Pull every colour out of pasted text, in reading order. Deliberately strict
  // about bare words so prose does not turn into colours: a named colour or a
  // bare hex code only counts when it is a whole entry (line, cell, CSS value).
  function extract(text, hint) {
    text = String(text || '');
    if (text.length > 200000) text = text.slice(0, 200000);
    const found = [];
    const add = (i, res) => { if (res) found.push({ i, color: res.color, mapped: res.mapped }); };

    // Coolors-style URL: .../264653-2a9d8f-e9c46a
    const cool = /coolors\.co\/(?:palette\/)?([0-9a-f]{6}(?:-[0-9a-f]{6})+)/i.exec(text);
    if (cool) return cool[1].split('-').map((h) => ({ color: hexToRgb(h), mapped: false }));

    // GIMP / Krita / Inkscape palette text.
    if (/^\s*GIMP Palette/i.test(text)) {
      text.split(/\r?\n/).forEach((line, i) => {
        const g = /^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s|$)/.exec(line);
        if (g) add(i, { color: { r: clamp(+g[1], 0, 255), g: clamp(+g[2], 0, 255), b: clamp(+g[3], 0, 255), a: 1 }, mapped: false });
      });
      const pal = [];
      found.forEach((f) => { if (pal.length < MAX_LIST && !pal.some((o) => same(o.color, f.color))) pal.push({ color: f.color, mapped: false }); });
      return pal;
    }

    const mask = text.split('');
    const blank = (from, to) => { for (let k = from; k < to; k++) mask[k] = ' '; };
    // 1. functions, with balanced parentheses
    FN_RE.lastIndex = 0;
    let m;
    while ((m = FN_RE.exec(text))) {
      let depth = 0, j = m.index + m[0].length - 1;
      for (; j < text.length; j++) {
        if (text[j] === '(') depth++;
        else if (text[j] === ')' && --depth === 0) break;
        if (j - m.index > 300) break;
      }
      if (depth === 0 && text[j] === ')') {
        add(m.index, parse(text.slice(m.index, j + 1), hint));
        blank(m.index, j + 1);
        FN_RE.lastIndex = j + 1;
      }
    }
    // 2. #hex anywhere
    const rest = mask.join('');
    const HEX_RE = /(?:#|\b0x)([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![0-9a-z_-])/gi;
    while ((m = HEX_RE.exec(rest))) { add(m.index, { color: hexToRgb(m[1]), mapped: false }); blank(m.index, m.index + m[0].length); }
    // 3. whole entries: named colours and bare 6/8-digit hex
    const rest2 = mask.join('');
    const ENTRY_RE = /[^\n\r,;|\t]+/g;
    while ((m = ENTRY_RE.exec(rest2))) {
      let e = m[0].trim().replace(/^["'`]+|["'`]+$/g, '');
      const kv = /^[-\w\s.]+:\s*(.+)$/.exec(e);
      if (kv) e = kv[1].trim();
      const low = e.toLowerCase();
      if (NAMED[low]) add(m.index, { color: hexToRgb(NAMED[low]), mapped: false });
      else if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(e) && /[0-9]/.test(e)) add(m.index, { color: hexToRgb(e), mapped: false });
    }
    found.sort((x, y) => x.i - y.i);
    const out = [];
    for (const f of found) {
      if (out.length >= MAX_LIST) break;
      if (!out.some((o) => same(o.color, f.color))) out.push({ color: f.color, mapped: f.mapped });
    }
    return out;
  }

  /* ---------------- contrast ---------------- */

  const relLum = (c) => 0.2126 * toLin(c.r / 255) + 0.7152 * toLin(c.g / 255) + 0.0722 * toLin(c.b / 255);
  // Composite a translucent colour over an opaque one (WCAG needs opaque colours).
  function flatten(c, base) {
    const a = alphaOf(c);
    return { r: c.r * a + base.r * (1 - a), g: c.g * a + base.g * (1 - a), b: c.b * a + base.b * (1 - a), a: 1 };
  }
  const WHITE = { r: 255, g: 255, b: 255, a: 1 }, BLACK = { r: 0, g: 0, b: 0, a: 1 };
  // Ratio of text `fg` on background `bg`; the background sits on white.
  function contrast(fg, bg) {
    const b = flatten(quant(bg), WHITE), f = flatten(quant(fg), b);
    const x = relLum(f), y = relLum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  const grade = (ratio) => (ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA18' : 'fail');

  /* ---------------- theme derivation ---------------- */

  const HARMONY_MODES = ['analogous', 'complementary', 'split', 'triad', 'square'];
  // Hues for a harmony around `h`. Spread only applies to analogous / split.
  function harmonyHues(h, mode, count, spread) {
    switch (mode) {
      case 'complementary': return [h, h + 180].map(mod360);
      case 'split': { const s = clamp(spread, 5, 60); return [h, h + 180 - s, h + 180 + s].map(mod360); }
      case 'triad': return [h, h + 120, h + 240].map(mod360);
      case 'square': return [h, h + 90, h + 180, h + 270].map(mod360);
      default: {
        const n = [3, 4, 5, 7].indexOf(count) >= 0 ? count : 3, s = clamp(spread, 5, 90), half = (n - 1) / 2;
        const out = [];
        for (let i = 0; i < n; i++) out.push(mod360(h + (i - half) * s));
        return out;
      }
    }
  }
  // Index of the base colour inside harmonyHues() output.
  const harmonyBaseIndex = (mode, count) => (mode === 'analogous' ? (([3, 4, 5, 7].indexOf(count) >= 0 ? count : 3) - 1) >> 1 : 0);

  // Perceptual tint/shade ramp through the base hue (OKLCH), light to dark.
  // Chroma tapers toward the ends and is gamut-mapped, so hues do not drift.
  const SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  const SCALE_L = [0.975, 0.945, 0.885, 0.805, 0.715, 0.625, 0.535, 0.45, 0.365, 0.285, 0.205];
  function toneScale(base) {
    const { C, h } = rgbToOklch(quant(base));
    return SCALE_STEPS.map((step, i) => {
      const L = SCALE_L[i];
      const taper = 1 - Math.pow(Math.abs(L * 2 - 1), 2.2) * 0.55;
      const c = oklchToRgb(L, C * taper, h, 1);
      return { step, color: c, L };
    });
  }
  const nearestStep = (scale, base) => {
    const L = rgbToOklch(quant(base)).L;
    let bi = 0, bd = Infinity;
    scale.forEach((s, i) => { const d = Math.abs(s.L - L); if (d < bd) { bd = d; bi = i; } });
    return bi;
  };

  // OKLab mix with premultiplied alpha (what CSS `in oklab` does).
  function mix(p, q, t) {
    const A = rgbToOklab(p), B = rgbToOklab(q), pa = alphaOf(p), qa = alphaOf(q);
    const a = pa + (qa - pa) * t;
    const w = a > 0 ? [pa * (1 - t) / a, qa * t / a] : [1 - t, t];
    const lin = oklabToLin(A.L * w[0] + B.L * w[1], A.a * w[0] + B.a * w[1], A.b * w[0] + B.b * w[1]);
    return linToColor(clipLin(lin), a);
  }
  // Colour at position t (0-1) along evenly spaced stops.
  function sampleAt(stops, t) {
    if (stops.length === 1) return Object.assign({}, stops[0]);
    const segs = stops.length - 1, pos = clamp(t, 0, 1) * segs, i = Math.min(Math.floor(pos), segs - 1);
    return mix(stops[i], stops[i + 1], pos - i);
  }
  function gradientSteps(stops, n) {
    if (!stops.length) return [];
    const out = [];
    for (let i = 0; i < n; i++) out.push(sampleAt(stops, n === 1 ? 0 : i / (n - 1)));
    return out;
  }
  // CSS that looks the same everywhere: the OKLab gradient sampled into sRGB stops.
  function gradientCss(stops, samples, dir) {
    const n = Math.max(2, samples || 33);
    return `linear-gradient(${dir || '90deg'}, ${gradientSteps(stops, n).map(toCss).join(', ')})`;
  }
  // The short modern form (browsers with `in oklab`, 2023+).
  const gradientCssOklab = (stops, dir) => `linear-gradient(${dir || '90deg'} in oklab, ${stops.map(toCss).join(', ')})`;

  /* ---------------- k-means palette (OKLab) ---------------- */

  function hash32(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // `data` is RGBA bytes. Same pixels + same k + same seed = same palette.
  function kmeans(data, k, seed) {
    const pts = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      pts.push(linToOklab(toLin(data[i] / 255), toLin(data[i + 1] / 255), toLin(data[i + 2] / 255)));
    }
    if (!pts.length) return [];
    const rand = rng(seed);
    const cents = [], used = new Set();
    while (cents.length < k && used.size < pts.length) {
      const idx = Math.floor(rand() * pts.length);
      if (used.has(idx)) continue;
      used.add(idx); cents.push(Object.assign({}, pts[idx]));
    }
    while (cents.length < k) cents.push(Object.assign({}, pts[Math.floor(rand() * pts.length)]));
    const nearest = (p) => {
      let best = 0, bd = Infinity;
      for (let j = 0; j < cents.length; j++) {
        const dL = p.L - cents[j].L, da = p.a - cents[j].a, db = p.b - cents[j].b, d = dL * dL + da * da + db * db;
        if (d < bd) { bd = d; best = j; }
      }
      return best;
    };
    for (let it = 0; it < 12; it++) {
      const sums = cents.map(() => ({ L: 0, a: 0, b: 0, n: 0 }));
      for (const p of pts) { const s = sums[nearest(p)]; s.L += p.L; s.a += p.a; s.b += p.b; s.n++; }
      sums.forEach((s, j) => { if (s.n) cents[j] = { L: s.L / s.n, a: s.a / s.n, b: s.b / s.n }; });
    }
    const counts = cents.map(() => 0);
    for (const p of pts) counts[nearest(p)]++;
    return cents
      .map((c, i) => ({ color: linToColor(clipLin(oklabToLin(c.L, c.a, c.b)), 1), w: counts[i] }))
      .filter((c) => c.w > 0)
      .sort((x, y) => y.w - x.w)
      .map((c) => c.color);
  }

  const API = {
    clamp, num, mod360, quant, same, alphaOf, isOpaque,
    rgbToHex, hexToRgb, rgbToHsv, hsvToRgb, rgbToHsl, hslToRgb, hwbToRgb, rgbToCmyk, cmykToRgb,
    rgbToOklab, rgbToOklch, oklchToRgb, fromLinear,
    FORMATS, format, toCss, parse, extract, NAMED,
    setFallback: (fn) => { fallback = fn; },
    relLum, flatten, contrast, grade, WHITE, BLACK,
    HARMONY_MODES, harmonyHues, harmonyBaseIndex,
    SCALE_STEPS, toneScale, nearestStep,
    mix, sampleAt, gradientSteps, gradientCss, gradientCssOklab,
    hash32, kmeans
  };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.CTColor = API;
})(typeof window !== 'undefined' ? window : this);
