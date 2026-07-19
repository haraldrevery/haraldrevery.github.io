/* =====================================================================
   RVRY_ASCII — core conversion engine  (vanilla JS, no dependencies)
   Global namespace: window.RVRY
   Pipeline:  source -> sample(grayscale grid) -> tone -> dither -> glyphs
   ===================================================================== */
(function (global) {
  "use strict";

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  /* ---- Glyph presets: ramps ordered DARK/empty -> LIGHT/dense coverage.
     A brighter source pixel maps toward the right (denser) end, which suits
     a dark background. The Invert toggle flips luminance for light docs. ---- */
  const GLYPH_PRESETS = {
    braille:      { label: "Braille (dots)", braille: true },
    standard:     { label: "Standard 10", ramp: " .:-=+*#%@" },
    detailed:     { label: "Detailed 70", ramp: " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$" },
    blocks:       { label: "Blocks", ramp: " ░▒▓█" },
    blocks_ext:   { label: "Blocks + shades", ramp: " .:░▒▓█" },
    alphanumeric: { label: "Alphanumeric", ramp: " .0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ@" },
    numbers:      { label: "Numbers only", ramp: " 1234567890" },
    letters:      { label: "Letters only", ramp: " .celosaghbqwmZO0QLCJUYXzcvunxrjft" },
    binary:       { label: "Binary 01", ramp: " 01" },
    custom:       { label: "Custom string…", ramp: "RVRY" }
  };

  const DITHER = { none: "None", floyd: "Floyd–Steinberg", atkinson: "Atkinson" };

  // Error-diffusion kernels: [dx, dy, weight]
  const KERNELS = {
    floyd: { div: 16, cells: [[1,0,7],[-1,1,3],[0,1,5],[1,1,1]] },
    atkinson: { div: 8, cells: [[1,0,1],[2,0,1],[-1,1,1],[0,1,1],[1,1,1],[0,2,1]] }
  };

  // Braille dot -> bit index, indexed [dy(0..3)][dx(0..1)]  (Unicode U+2800 layout)
  const BRAILLE_BITS = [[0, 3], [1, 4], [2, 5], [6, 7]];

  /* ---------------------------------------------------------------
     sampleImage(source, opts)
       source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
       opts: { width, ratio, braille, color }
       returns { gray:Float32Array, rgb:Float32Array|null, w, h, cols, rows }
         w,h = sample grid resolution (for braille: 2*cols x 4*rows)
     --------------------------------------------------------------- */
  const _c = document.createElement("canvas");
  const _ctx = _c.getContext("2d", { willReadFrequently: true });

  function srcSize(source) {
    return {
      w: source.naturalWidth || source.videoWidth || source.width || 0,
      h: source.naturalHeight || source.videoHeight || source.height || 0
    };
  }

  function sampleImage(source, opts) {
    const cols = Math.max(1, Math.round(opts.width || 100));
    const ratio = opts.ratio || 0.5;          // glyph aspect (cellW/cellH)
    const s = srcSize(source);
    if (!s.w || !s.h) return null;

    // rows so that on-screen proportions match: each char cell is `ratio` as
    // wide as tall, so we take fewer rows than a naive square sampling.
    let rows = Math.max(1, Math.round(cols * (s.h / s.w) * ratio));

    const sub = opts.braille ? { x: 2, y: 4 } : { x: 1, y: 1 };
    const w = cols * sub.x;
    const h = rows * sub.y;

    _c.width = w; _c.height = h;
    _ctx.clearRect(0, 0, w, h);
    _ctx.drawImage(source, 0, 0, w, h);
    let data;
    try {
      data = _ctx.getImageData(0, 0, w, h).data;
    } catch (e) {
      throw new Error("Could not read image pixels (tainted canvas). If you opened this page via file://, serve it over HTTP instead — e.g. run “python3 -m http.server” in the project folder.");
    }

    const gray = new Float32Array(w * h);
    const rgb = opts.color ? new Float32Array(w * h * 3) : null;
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
      const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3] / 255;
      // composite alpha over black; luminance (Rec. 601)
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255 * a;
      gray[i] = lum;
      if (rgb) { rgb[i * 3] = r * a; rgb[i * 3 + 1] = g * a; rgb[i * 3 + 2] = b * a; }
    }
    return { gray, rgb, w, h, cols, rows };
  }

  /* ---------------------------------------------------------------
     applyTone(gray, tone) -> new Float32Array
       tone: { exposure, contrast, gamma, invert }
         exposure: multiplier around 1 (stops-ish, we use linear 0.2..3)
         contrast: -1..1  (0 = none)
         gamma:    0.1..3  (1 = none)
         invert:   bool
     --------------------------------------------------------------- */
  function applyTone(gray, tone) {
    const out = new Float32Array(gray.length);
    const exp = tone.exposure == null ? 1 : tone.exposure;
    const contrast = tone.contrast || 0;
    const gamma = tone.gamma == null ? 1 : tone.gamma;
    const invGamma = 1 / gamma;
    // contrast factor (classic formula), c in -1..1
    const cf = (1.015 * (contrast + 1)) / (1.0 * (1.015 - contrast));
    for (let i = 0; i < gray.length; i++) {
      let v = gray[i] * exp;                 // exposure
      v = clamp01(v);
      v = cf * (v - 0.5) + 0.5;              // contrast around mid
      v = clamp01(v);
      v = Math.pow(v, invGamma);             // gamma
      v = clamp01(v);
      if (tone.invert) v = 1 - v;
      out[i] = v;
    }
    return out;
  }

  /* ---------------------------------------------------------------
     ditherLevels(gray, w, h, levels, algo) -> Float32Array quantized 0..1
     --------------------------------------------------------------- */
  function ditherLevels(gray, w, h, levels, algo) {
    levels = Math.max(2, levels);
    const step = 1 / (levels - 1);
    const out = Float32Array.from(gray);
    const k = KERNELS[algo];
    if (!k) {
      for (let i = 0; i < out.length; i++) out[i] = Math.round(out[i] / step) * step;
      return out;
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const oldv = out[idx];
        const newv = clamp01(Math.round(oldv / step) * step);
        out[idx] = newv;
        const err = oldv - newv;
        if (err === 0) continue;
        for (let c = 0; c < k.cells.length; c++) {
          const nx = x + k.cells[c][0], ny = y + k.cells[c][1];
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          out[ny * w + nx] += (err * k.cells[c][2]) / k.div;
        }
      }
    }
    return out;
  }

  /* ---------------------------------------------------------------
     render(sample, opts) -> { text, cols, rows }
       opts: { preset, ramp, braille, threshold, dither, tone }
     --------------------------------------------------------------- */
  function render(sample, opts) {
    if (!sample) return { text: "", cols: 0, rows: 0 };
    const tone = applyTone(sample.gray, opts.tone || {});
    const w = sample.w, h = sample.h;

    if (opts.braille) {
      const cols = sample.cols, rows = sample.rows;
      let bin;
      if (opts.dither && opts.dither !== "none") {
        const q = ditherLevels(tone, w, h, 2, opts.dither);
        bin = q; // values ~0 or 1
      } else {
        const t = opts.threshold == null ? 0.5 : opts.threshold;
        bin = new Float32Array(tone.length);
        for (let i = 0; i < tone.length; i++) bin[i] = tone[i] >= t ? 1 : 0;
      }
      const lines = new Array(rows);
      for (let cy = 0; cy < rows; cy++) {
        let line = "";
        for (let cx = 0; cx < cols; cx++) {
          let mask = 0;
          for (let dy = 0; dy < 4; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              const px = cx * 2 + dx, py = cy * 4 + dy;
              if (bin[py * w + px] >= 0.5) mask |= (1 << BRAILLE_BITS[dy][dx]);
            }
          }
          line += String.fromCharCode(0x2800 + mask);
        }
        lines[cy] = line;
      }
      return { text: lines.join("\n"), cols, rows };
    }

    // Character-ramp modes. Split into code points so astral characters
    // (emoji etc.) in a custom ramp count as one glyph, not two surrogates.
    const rampStr = (opts.ramp && opts.ramp.length) ? opts.ramp : " .:-=+*#%@";
    const glyphs = Array.from(rampStr);
    const levels = glyphs.length;
    let buf;
    if (opts.dither && opts.dither !== "none") {
      buf = ditherLevels(tone, w, h, levels, opts.dither);
    } else {
      buf = tone;
    }
    const lines = new Array(h);
    for (let y = 0; y < h; y++) {
      let line = "";
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let idx = Math.round(clamp01(buf[row + x]) * (levels - 1));
        line += glyphs[idx];
      }
      lines[y] = line;
    }
    return { text: lines.join("\n"), cols: w, rows: h };
  }

  /* ---------------------------------------------------------------
     renderColorHTML(sample, opts, plain) -> HTML string of colored spans
       Uses per-cell average rgb (requires sample.rgb). Used by the player.
       plain: an existing render(sample, opts) result, if the caller has one.
     --------------------------------------------------------------- */
  function renderColorHTML(sample, opts, plain) {
    if (!plain) plain = render(sample, opts);
    if (!sample.rgb || opts.braille) {
      return escapeHtml(plain.text);
    }
    const w = sample.w;
    const rows = plain.text.split("\n");
    let html = "";
    // Merge adjacent same-color characters into one span (a huge memory win
    // for frame sequences). Spaces carry no ink, so they join any run.
    for (let y = 0; y < rows.length; y++) {
      const line = rows[y];
      let cur = null, buf = "";
      const flush = () => {
        if (!buf) return;
        html += cur == null ? escapeHtml(buf)
          : `<span style="color:${cur}">${escapeHtml(buf)}</span>`;
        buf = "";
      };
      // walk by code point (not UTF-16 unit) so astral glyphs in a custom
      // ramp advance one cell, keeping the rgb index aligned with render()
      let x = 0;
      for (const ch of line) {
        if (ch !== " ") {
          const p = (y * w + x) * 3;
          const col = `rgb(${sample.rgb[p] | 0},${sample.rgb[p + 1] | 0},${sample.rgb[p + 2] | 0})`;
          if (col !== cur) { flush(); cur = col; }
        }
        buf += ch;
        x++;
      }
      flush();
      html += "\n"; // runs never span rows
    }
    return html;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
  }

  /* ---------------------------------------------------------------
     flowText(sample, opts) -> { text, cols, rows, placed, total, loops }
       "Code art" (IOCCC whitespace-abuse style): reflow a body of text —
       e.g. source code — so its characters DENSELY FILL the dark regions
       of the image, forming a silhouette, while the light regions stay
       blank. Whitespace (spaces / newlines) is only ever *inserted*
       between the text's tokens, so whitespace-tolerant code (C, JS,
       Java, …) keeps compiling and prose stays readable.

       Method: for every row, walk each maximal contiguous run of ink
       cells and pack whole tokens into it (single space between tokens).
       Because a token always sits inside one run — bounded by background
       or a line break, which are valid separators — a token is never
       split by a space/newline and never merged with its neighbour.

       opts: { text, threshold, invert, repeat, tone:{exposure,contrast,gamma} }
         repeat: loop the text to fill the whole shape (default). When
                 false the text is placed exactly once and the rest of the
                 silhouette is left blank.
     --------------------------------------------------------------- */
  function flowText(sample, opts) {
    const empty = { text: "", cols: 0, rows: 0, placed: 0, total: 0, loops: 0, complete: true };
    if (!sample) return empty;
    const w = sample.w, h = sample.h;
    const t = opts.threshold == null ? 0.5 : opts.threshold;
    const invert = !!opts.invert;
    const repeat = opts.repeat !== false; // default on

    // Tone -> binary ink map (dark = ink by default; invert flips it)
    const tone = applyTone(sample.gray, {
      exposure: opts.tone ? opts.tone.exposure : 1,
      contrast: opts.tone ? opts.tone.contrast : 0,
      gamma: opts.tone ? opts.tone.gamma : 1,
      invert: false
    });
    const ink = new Uint8Array(w * h);
    for (let i = 0; i < ink.length; i++) {
      ink[i] = (invert ? tone[i] >= t : tone[i] < t) ? 1 : 0;
    }

    // Token source: an explicit pre-built list (e.g. the Python hex chunks) or
    // maximal non-whitespace runs of the text. Original whitespace is collapsed;
    // only the spaces/newlines we insert appear between tokens in the output.
    const tokens = opts.tokens || (opts.text || "").split(/\s+/).filter((s) => s.length > 0);
    const n = tokens.length;
    const total = tokens.reduce((a, tok) => a + tok.length, 0);
    const filler = opts.filler != null ? opts.filler : null; // pads leftover ink
    const header = opts.header != null ? opts.header : null;  // flush-left first line
    const footer = opts.footer != null ? opts.footer : null;  // last line

    const wrap = (body) => {
      const out = [];
      if (header != null) out.push(header);
      for (const l of body) out.push(l);
      if (footer != null) out.push(footer);
      return out;
    };
    if (!n) {
      const body = wrap([]);
      return { text: body.join("\n"), cols: w, rows: body.length,
        placed: 0, total: 0, loops: 0, complete: true };
    }

    // which token goes at running index i, and whether anything is left to place
    const token = (i) => (i < n ? tokens[i] : (repeat ? tokens[i % n] : filler));
    const more = () => repeat || ti < n || filler !== null;

    const lines = [];
    let ti = 0;      // running token counter (grows past n when repeating/filling)
    let placed = 0;  // real-token characters emitted (fillers excluded)

    for (let y = 0; y < h; y++) {
      if (!more()) break;
      const row = new Array(w).fill(" ");
      let x = 0;
      while (x < w) {
        if (!ink[y * w + x]) { x++; continue; }
        // maximal ink run [runStart, runEnd)
        const runStart = x;
        while (x < w && ink[y * w + x]) x++;
        const runEnd = x;

        // pack whole tokens into the run
        let pos = runStart, first = true;
        while (pos < runEnd) {
          if (!more()) break;
          const tok = token(ti);
          const sep = first ? 0 : 1;
          if (pos + sep + tok.length <= runEnd) {
            if (!first) row[pos++] = " ";
            for (let k = 0; k < tok.length; k++) row[pos++] = tok[k];
            if (ti < n) placed += tok.length;
            ti++; first = false;
          } else if (first) {
            // token longer than this whole run: place it intact, overflowing
            // to the right (still one contiguous run, so still valid), then a
            // trailing space guarantees separation from whatever follows.
            for (let k = 0; k < tok.length; k++) row[pos++] = tok[k];
            row[pos++] = " ";
            if (ti < n) placed += tok.length;
            ti++;
            break;
          } else {
            break; // no more whole tokens fit; leave the tail of the run blank
          }
        }
        if (pos > runEnd) x = pos; // skip cells consumed by an overflowing token
      }
      lines.push(row.join("").replace(/\s+$/, "")); // rtrim (newline separates)
    }

    // drop trailing all-blank rows, then add the flush-left header/footer lines
    while (lines.length && lines[lines.length - 1] === "") lines.pop();

    // no ink at all -> nothing was placed; emit nothing rather than a bare
    // header/footer (for pyWrap that would be a broken exec(bytes.fromhex()))
    if (!lines.length && placed === 0) {
      return { text: "", cols: 0, rows: 0, placed: 0, total, loops: 0, complete: false };
    }
    const body = wrap(lines);

    // overflowing tokens may extend a row past the sample width
    let cols = w;
    for (const l of body) if (l.length > cols) cols = l.length;

    return {
      text: body.join("\n"), cols, rows: body.length,
      placed, total, loops: ti / n, complete: ti >= n
    };
  }

  /* ---------------------------------------------------------------
     pyWrap(code, opts) -> { header, footer, tokens, filler, bytes }
       Prepare a Python program for reliable "code art": hex-encode it and
       expose the hex as quoted string chunks to be flowed into a shape inside
       exec(bytes.fromhex( … ).decode()). Adjacent string literals concatenate
       and, being inside the parens, may be laid out with any whitespace — so
       the reassembled hex (and thus the program) is unaffected by the layout.
       opts.chunk = hex chars per chunk (default 4 = 2 bytes; smaller = finer).
     --------------------------------------------------------------- */
  function pyWrap(code, opts) {
    opts = opts || {};
    const chunk = Math.max(2, (opts.chunk || 4) - ((opts.chunk || 4) % 2)); // even
    const bytes = new TextEncoder().encode(code || "");
    let hex = "";
    for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
    const tokens = [];
    for (let i = 0; i < hex.length; i += chunk) tokens.push('"' + hex.slice(i, i + chunk) + '"');
    return {
      header: "exec(bytes.fromhex(",
      footer: ").decode())",
      filler: '""',           // empty literal: concatenates to nothing
      tokens,
      bytes: bytes.length
    };
  }

  /* Convenience: full source -> text in one call */
  function convert(source, opts) {
    const sample = sampleImage(source, {
      width: opts.width, ratio: opts.ratio, braille: opts.braille, color: false
    });
    return render(sample, opts);
  }

  global.RVRY = {
    GLYPH_PRESETS, DITHER,
    clamp, clamp01,
    sampleImage, applyTone, ditherLevels, render, renderColorHTML, flowText, pyWrap, convert,
    escapeHtml, srcSize
  };
})(window);
