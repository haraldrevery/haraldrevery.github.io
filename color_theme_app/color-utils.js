// Color conversion utilities with alpha support.
// rgb objects: { r, g, b, a? }  where a is in [0,1] (default 1 = opaque).
window.ColorUtil = (function () {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const round = (v, d = 0) => {
    const m = Math.pow(10, d);
    return Math.round(v * m) / m;
  };
  const getA = (rgb) => (rgb && rgb.a != null) ? rgb.a : 1;
  const withA = (rgb, a) => ({ ...rgb, a: a == null ? 1 : clamp(a, 0, 1) });

  function hexToRgb(hex) {
    let h = hex.replace('#', '');
    // expand short forms
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    else if (h.length === 4) h = h.split('').map(c => c + c).join('');
    let a = 1;
    if (h.length === 8) {
      a = parseInt(h.slice(6, 8), 16) / 255;
      h = h.slice(0, 6);
    }
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
  }
  function rgbToHex(r, g, b, a) {
    const to = (v) => {
      const n = Math.round(v);
      if (!Number.isFinite(n)) return '00';
      return clamp(n, 0, 255).toString(16).padStart(2, '0');
    };
    let s = '#' + to(r) + to(g) + to(b);
    if (a != null && a < 0.9999) s += to(a * 255);
    return s;
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d !== 0) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    const s = mx === 0 ? 0 : d / mx;
    return { h, s, v: mx };
  }
  function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255, a: 1 };
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (mx + mn) / 2;
    const d = mx - mn;
    if (d !== 0) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s, l };
  }

  function rgbToCmyk(r, g, b) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const k = 1 - Math.max(rn, gn, bn);
    if (k >= 0.999) return { c: 0, m: 0, y: 0, k: 1 };
    return {
      c: (1 - rn - k) / (1 - k),
      m: (1 - gn - k) / (1 - k),
      y: (1 - bn - k) / (1 - k),
      k
    };
  }
  function cmykToRgb(c, m, y, k) {
    return {
      r: 255 * (1 - c) * (1 - k),
      g: 255 * (1 - m) * (1 - k),
      b: 255 * (1 - y) * (1 - k),
      a: 1
    };
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const cc = (1 - Math.abs(2 * l - 1)) * s;
    const x = cc * (1 - Math.abs(((h / 60) % 2) - 1));
    const mm = l - cc / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [cc, x, 0];
    else if (h < 120) [r, g, b] = [x, cc, 0];
    else if (h < 180) [r, g, b] = [0, cc, x];
    else if (h < 240) [r, g, b] = [0, x, cc];
    else if (h < 300) [r, g, b] = [x, 0, cc];
    else [r, g, b] = [cc, 0, x];
    return { r: (r + mm) * 255, g: (g + mm) * 255, b: (b + mm) * 255, a: 1 };
  }

  function oklchToRgb(L, C, h) {
    const ang = h * Math.PI / 180;
    const a = C * Math.cos(ang);
    const b = C * Math.sin(ang);
    const o = oklabToRgb(L, a, b);
    o.a = 1;
    return o;
  }

  function srgbToLin(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function linToSrgb(c) {
    const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return clamp(v * 255, 0, 255);
  }

  function rgbToOklab(r, g, b) {
    const lr = srgbToLin(r), lg = srgbToLin(g), lb = srgbToLin(b);
    const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
    const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
    const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
    const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
    return {
      L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
      a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
      b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    };
  }
  function oklabToRgb(L, a, b) {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
    const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    return { r: linToSrgb(lr), g: linToSrgb(lg), b: linToSrgb(lb) };
  }
  function rgbToOklch(r, g, b) {
    const { L, a, b: bb } = rgbToOklab(r, g, b);
    const C = Math.sqrt(a * a + bb * bb);
    let h = Math.atan2(bb, a) * 180 / Math.PI;
    if (h < 0) h += 360;
    return { L, C, h };
  }

  // CSS-string format. Includes alpha forms (rgba/hsla/8-char hex) when a < 1.
  function format(rgb) {
    const { r, g, b } = rgb;
    const a = getA(rgb);
    const opaque = a >= 0.9999;
    const aTxt = round(a, 3);
    const hex = rgbToHex(r, g, b, a);
    const hsl = rgbToHsl(r, g, b);
    const oklch = rgbToOklch(r, g, b);
    const cmyk = rgbToCmyk(r, g, b);
    const hsv = rgbToHsv(r, g, b);
    const named = opaque
      ? (window.CSS_NAMED_COLORS || []).find(([, h]) => h.toLowerCase() === hex.toLowerCase())
      : null;
    return {
      hex: hex.toUpperCase(),
      rgb: opaque
        ? `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
        : `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${aTxt})`,
      hsl: opaque
        ? `hsl(${round(hsl.h)}, ${round(hsl.s * 100)}%, ${round(hsl.l * 100)}%)`
        : `hsla(${round(hsl.h)}, ${round(hsl.s * 100)}%, ${round(hsl.l * 100)}%, ${aTxt})`,
      hsv: opaque
        ? `hsv(${round(hsv.h)}, ${round(hsv.s * 100)}%, ${round(hsv.v * 100)}%)`
        : `hsva(${round(hsv.h)}, ${round(hsv.s * 100)}%, ${round(hsv.v * 100)}%, ${aTxt})`,
      oklch: opaque
        ? `oklch(${round(oklch.L, 3)} ${round(oklch.C, 3)} ${round(oklch.h, 1)})`
        : `oklch(${round(oklch.L, 3)} ${round(oklch.C, 3)} ${round(oklch.h, 1)} / ${aTxt})`,
      cmyk: `cmyk(${round(cmyk.c * 100)}%, ${round(cmyk.m * 100)}%, ${round(cmyk.y * 100)}%, ${round(cmyk.k * 100)}%)`,
      name: named ? named[0] : null
    };
  }

  // Parse various string formats -> rgb {r,g,b,a}. Returns null on failure.
  function parseColor(s) {
    if (s == null) return null;
    s = String(s).trim();
    if (!s) return null;
    // hex (#rgb, #rgba, #rrggbb, #rrggbbaa)
    let m = s.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
    if (m) return hexToRgb('#' + m[1]);
    // rgb/rgba(...) or 'R, G, B[, A]'
    m = s.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?/i);
    if (m) {
      const a = parseAlpha(m[4]);
      return { r: clamp(+m[1], 0, 255), g: clamp(+m[2], 0, 255), b: clamp(+m[3], 0, 255), a };
    }
    m = s.match(/^([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+%?))?$/);
    if (m && !/%/.test(m[1] + m[2] + m[3])) {
      const a = parseAlpha(m[4]);
      return { r: clamp(+m[1], 0, 255), g: clamp(+m[2], 0, 255), b: clamp(+m[3], 0, 255), a };
    }
    // hsl/hsla(...)
    m = s.match(/hsla?\s*\(\s*([\d.]+)\s*,?\s*([\d.]+)\s*%\s*,?\s*([\d.]+)\s*%(?:\s*[,/]\s*([\d.]+%?))?/i);
    if (m) {
      const out = hslToRgb(+m[1], clamp(+m[2] / 100, 0, 1), clamp(+m[3] / 100, 0, 1));
      out.a = parseAlpha(m[4]);
      return out;
    }
    // hsv/hsva/hsb(...)
    m = s.match(/hs[vb]a?\s*\(\s*([\d.]+)\s*,?\s*([\d.]+)\s*%\s*,?\s*([\d.]+)\s*%(?:\s*[,/]\s*([\d.]+%?))?/i);
    if (m) {
      const out = hsvToRgb(+m[1], clamp(+m[2] / 100, 0, 1), clamp(+m[3] / 100, 0, 1));
      out.a = parseAlpha(m[4]);
      return out;
    }
    // oklch(L C H[ / A])
    m = s.match(/oklch\s*\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?/i);
    if (m) {
      const out = oklchToRgb(clamp(+m[1], 0, 1), Math.max(0, +m[2]), +m[3]);
      out.a = parseAlpha(m[4]);
      return out;
    }
    // cmyk(...)
    m = s.match(/cmyk\s*\(\s*([\d.]+)\s*%?\s*,\s*([\d.]+)\s*%?\s*,\s*([\d.]+)\s*%?\s*,\s*([\d.]+)\s*%?/i);
    if (m) return cmykToRgb(clamp(+m[1] / 100, 0, 1), clamp(+m[2] / 100, 0, 1), clamp(+m[3] / 100, 0, 1), clamp(+m[4] / 100, 0, 1));
    // bare 'C%, M%, Y%, K%' (4 numbers)
    m = s.match(/^([\d.]+)\s*%?\s*,\s*([\d.]+)\s*%?\s*,\s*([\d.]+)\s*%?\s*,\s*([\d.]+)\s*%?$/);
    if (m) return cmykToRgb(clamp(+m[1] / 100, 0, 1), clamp(+m[2] / 100, 0, 1), clamp(+m[3] / 100, 0, 1), clamp(+m[4] / 100, 0, 1));
    // named css color
    const found = (window.CSS_NAMED_COLORS || []).find(([n]) => n === s.toLowerCase());
    if (found) return hexToRgb(found[1]);
    return null;
  }

  function parseAlpha(t) {
    if (t == null || t === '') return 1;
    if (t.endsWith('%')) return clamp(parseFloat(t) / 100, 0, 1);
    return clamp(parseFloat(t), 0, 1);
  }

  function formatRgbAs(rgb, fmt) {
    const { r, g, b } = rgb;
    const a = getA(rgb);
    const opaque = a >= 0.9999;
    const aTxt = round(a, 3);
    if (fmt === 'rgb') {
      return opaque
        ? `${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}`
        : `${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${aTxt}`;
    }
    if (fmt === 'hsl') {
      const h = rgbToHsl(r, g, b);
      return opaque
        ? `${round(h.h)}, ${round(h.s * 100)}%, ${round(h.l * 100)}%`
        : `${round(h.h)}, ${round(h.s * 100)}%, ${round(h.l * 100)}%, ${aTxt}`;
    }
    if (fmt === 'hsv') {
      const h = rgbToHsv(r, g, b);
      return opaque
        ? `${round(h.h)}, ${round(h.s * 100)}%, ${round(h.v * 100)}%`
        : `${round(h.h)}, ${round(h.s * 100)}%, ${round(h.v * 100)}%, ${aTxt}`;
    }
    if (fmt === 'oklch') {
      const o = rgbToOklch(r, g, b);
      return opaque
        ? `${round(o.L, 3)} ${round(o.C, 3)} ${round(o.h, 1)}`
        : `${round(o.L, 3)} ${round(o.C, 3)} ${round(o.h, 1)} / ${aTxt}`;
    }
    if (fmt === 'cmyk') {
      const k = rgbToCmyk(r, g, b);
      return `${Math.round(k.c * 100)}%, ${Math.round(k.m * 100)}%, ${Math.round(k.y * 100)}%, ${Math.round(k.k * 100)}%`;
    }
    return rgbToHex(r, g, b, a).toUpperCase();
  }

  // Build a CSS color string that browsers will accept, including alpha.
  function toCss(rgb) {
    const a = getA(rgb);
    if (a >= 0.9999) return rgbToHex(rgb.r, rgb.g, rgb.b);
    return `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, ${round(a, 3)})`;
  }

  // OKLab mix preserving alpha (linear interp)
  function mixOklab(a, b, t) {
    const A = rgbToOklab(a.r, a.g, a.b);
    const B = rgbToOklab(b.r, b.g, b.b);
    const o = oklabToRgb(
      A.L + (B.L - A.L) * t,
      A.a + (B.a - A.a) * t,
      A.b + (B.b - A.b) * t
    );
    const aA = getA(a), aB = getA(b);
    o.a = aA + (aB - aA) * t;
    return o;
  }

  // WCAG relative luminance (sRGB), and contrast ratio between two colors.
  function relLuminance(rgb) {
    const R = srgbToLin(rgb.r), G = srgbToLin(rgb.g), B = srgbToLin(rgb.b);
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  }
  function contrastRatio(a, b) {
    const la = relLuminance(a), lb = relLuminance(b);
    const hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }

  // Perceptually-even tonal ramp through a base color's hue (OKLch).
  // Returns an array of { r,g,b,a, L, step } from light to dark.
  function toneScale(rgb, stepLabels) {
    const labels = stepLabels || [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
    const Ls = [0.975, 0.945, 0.885, 0.805, 0.715, 0.625, 0.535, 0.45, 0.365, 0.285, 0.205];
    const { C, h } = rgbToOklch(rgb.r, rgb.g, rgb.b);
    return labels.map((step, i) => {
      const Lt = Ls[i];
      // Taper chroma toward the extremes so light/dark steps stay in-gamut and natural.
      const taper = 1 - Math.pow(Math.abs(Lt * 2 - 1), 2.2) * 0.55;
      const c = oklchToRgb(Lt, Math.max(0, C * taper), h);
      return { r: c.r, g: c.g, b: c.b, a: 1, L: Lt, step };
    });
  }

  function gradientSteps(stops, steps) {
    if (stops.length < 2) return stops.slice();
    const out = [];
    const segs = stops.length - 1;
    for (let i = 0; i < steps; i++) {
      const t = steps === 1 ? 0 : i / (steps - 1);
      const pos = t * segs;
      const idx = Math.min(Math.floor(pos), segs - 1);
      const local = pos - idx;
      out.push(mixOklab(stops[idx], stops[idx + 1], local));
    }
    return out;
  }

  return {
    clamp, round, getA, withA,
    hexToRgb, rgbToHex,
    rgbToHsv, hsvToRgb,
    rgbToHsl, rgbToOklch,
    rgbToOklab, oklabToRgb,
    rgbToCmyk, cmykToRgb,
    hslToRgb, oklchToRgb,
    parseColor, formatRgbAs, toCss,
    format, mixOklab, gradientSteps,
    relLuminance, contrastRatio, toneScale
  };
})();
