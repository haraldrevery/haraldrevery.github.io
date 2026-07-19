/* =====================================================================
   RVRY_ASCII — animated GIF encoder (pure JS, no dependencies)
   Counterpart to gif.js (the decoder). Two layers:

   RVRY.GifBuilder(width, height, palette, loopForever)
     .addFrame(indexedPixels, delayCs)   indices into palette
     .finish() -> Uint8Array             complete GIF89a file

   RVRY.encodeGifAnimation(frames, opts, hooks) -> Promise<Blob|null>
     Rasterizes player-tab frames ({html, text}: escaped text plus
     <span style="color:…"> runs) and streams them through GifBuilder.
     Returns null when hooks.aborted() turns true mid-encode.

   The palette depth sets the LZW minimum code size, so the export
   dialog's compression level (fewer palette colors) genuinely shrinks
   the LZW code stream, not just the color table.
   ===================================================================== */
(function (global) {
  "use strict";
  const RVRY = global.RVRY || (global.RVRY = {});

  /* ---- LZW compression (GIF variant, 12-bit max codes) ---- */
  function lzwEncode(minCodeSize, indices) {
    const CLEAR = 1 << minCodeSize, EOI = CLEAR + 1;
    let codeSize = minCodeSize + 1, next = EOI + 1;
    let dict = new Map();                 // (prev<<8 | pixel) -> code
    const bytes = [];
    let acc = 0, nbits = 0;
    const emit = (code) => {
      acc |= code << nbits; nbits += codeSize;
      while (nbits >= 8) { bytes.push(acc & 255); acc >>= 8; nbits -= 8; }
    };
    emit(CLEAR);
    let prev = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const key = (prev << 8) | k;
      const hit = dict.get(key);
      if (hit !== undefined) { prev = hit; continue; }
      emit(prev);
      if (next === 4096) {                // table full — restart
        emit(CLEAR);
        dict = new Map(); next = EOI + 1; codeSize = minCodeSize + 1;
      } else {
        dict.set(key, next++);
        // the decoder grows its read size one entry later, hence the +1
        if (next === (1 << codeSize) + 1 && codeSize < 12) codeSize++;
      }
      prev = k;
    }
    emit(prev); emit(EOI);
    if (nbits > 0) bytes.push(acc & 255);
    return bytes;
  }

  /* ---- GIF89a byte writer ---- */
  function GifBuilder(width, height, palette, loopForever) {
    let bits = 1;
    while ((1 << bits) < palette.length) bits++;
    const minCodeSize = Math.max(2, bits);
    const parts = [];
    const u16 = (v) => [v & 255, (v >> 8) & 255];

    parts.push([0x47, 0x49, 0x46, 0x38, 0x39, 0x61,          // "GIF89a"
      ...u16(width), ...u16(height),
      0x80 | 0x70 | (bits - 1), 0, 0]);                      // GCT, res 8-bit
    const gct = [];
    for (let i = 0; i < (1 << bits); i++) {
      const p = palette[i] || [0, 0, 0];
      gct.push(p[0], p[1], p[2]);
    }
    parts.push(gct);
    if (loopForever) {
      parts.push([0x21, 0xFF, 11,
        0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2E, 0x30, // NETSCAPE2.0
        3, 1, 0, 0, 0]);                                     // loop count 0 = forever
    }

    function addFrame(indices, delayCs) {
      parts.push([0x21, 0xF9, 4, 0x04, ...u16(delayCs), 0, 0]); // GCE, disposal 1
      parts.push([0x2C, 0, 0, 0, 0, ...u16(width), ...u16(height), 0, minCodeSize]);
      const data = lzwEncode(minCodeSize, indices);
      for (let off = 0; off < data.length; off += 255) {      // 255-byte sub-blocks
        const n = Math.min(255, data.length - off);
        const block = new Uint8Array(n + 1);
        block[0] = n;
        for (let j = 0; j < n; j++) block[j + 1] = data[off + j];
        parts.push(block);
      }
      parts.push([0]);                                       // block terminator
    }
    function finish() {
      parts.push([0x3B]);                                    // trailer
      let total = 0;
      for (const p of parts) total += p.length;
      const out = new Uint8Array(total);
      let o = 0;
      for (const p of parts) { out.set(p, o); o += p.length; }
      return out;
    }
    return { addFrame, finish };
  }

  /* ---- median-cut palette from a color histogram (rgb24 -> count) ---- */
  function buildPalette(hist, maxColors) {
    const colors = [];
    hist.forEach((count, rgb) =>
      colors.push([(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, count]));
    if (colors.length <= maxColors) return colors.map((c) => [c[0], c[1], c[2]]);
    const boxes = [colors];
    while (boxes.length < maxColors) {
      // split the box with the widest channel range
      let bi = -1, bch = 0, brange = 0;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.length < 2) continue;
        for (let ch = 0; ch < 3; ch++) {
          let mn = 255, mx = 0;
          for (const c of b) { if (c[ch] < mn) mn = c[ch]; if (c[ch] > mx) mx = c[ch]; }
          if (mx - mn > brange) { brange = mx - mn; bi = i; bch = ch; }
        }
      }
      if (bi < 0) break;
      const b = boxes[bi];
      b.sort((a, c) => a[bch] - c[bch]);
      const mid = b.length >> 1;
      boxes.splice(bi, 1, b.slice(0, mid), b.slice(mid));
    }
    return boxes.map((b) => {
      let r = 0, g = 0, bl = 0, n = 0;
      for (const c of b) { r += c[0] * c[3]; g += c[1] * c[3]; bl += c[2] * c[3]; n += c[3]; }
      return n ? [Math.round(r / n), Math.round(g / n), Math.round(bl / n)] : [0, 0, 0];
    });
  }

  /* ---- frame rasterization (same markup walk as the .ans exporter) ---- */
  let _canvas = null;
  const workCanvas = () => _canvas || (_canvas = document.createElement("canvas"));
  const MAX_SIDE = 3000;

  // Character grid across all frames -> pixel metrics; shrinks the pixel
  // size until the canvas fits browser-safe bounds.
  function frameMetrics(frames, font, fontPx) {
    let cols = 1, rows = 1;
    for (const f of frames) {
      const lines = f.text.split("\n");
      if (lines.length > rows) rows = lines.length;
      for (const l of lines) if (l.length > cols) cols = l.length;
    }
    const ctx = workCanvas().getContext("2d");
    let px = Math.max(2, Math.round(fontPx || 8));
    let charW, pad, W, H;
    while (true) {
      ctx.font = `${px}px ${font}`;
      charW = ctx.measureText("M").width || px * 0.6;
      pad = Math.round(px * 0.6);
      W = Math.ceil(charW * cols) + pad * 2;
      H = px * rows + pad * 2;                // preview uses line-height:1
      if ((W <= MAX_SIDE && H <= MAX_SIDE) || px <= 2) break;
      px--;
    }
    return { cols, rows, px, charW, pad, W, H };
  }

  function unescapeHtml(s) {
    return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  }
  const SPAN_RE = /<span style="color:([^"]+)">([\s\S]*?)<\/span>/g;
  function drawFrame(ctx, html, m, opts) {
    ctx.fillStyle = opts.bg; ctx.fillRect(0, 0, m.W, m.H);
    ctx.font = `${m.px}px ${opts.font}`;
    ctx.textBaseline = "top";
    let x = m.pad, y = m.pad;
    const draw = (txt, color) => {
      if (!txt) return;
      ctx.fillStyle = color;
      for (const ch of unescapeHtml(txt)) {
        if (ch === "\n") { x = m.pad; y += m.px; }
        else { ctx.fillText(ch, x, y); x += m.charW; }
      }
    };
    SPAN_RE.lastIndex = 0;
    let last = 0, mm;
    while ((mm = SPAN_RE.exec(html)) !== null) {
      draw(html.slice(last, mm.index), opts.fg);
      draw(mm[2], mm[1]);
      last = SPAN_RE.lastIndex;
    }
    draw(html.slice(last), opts.fg);
  }

  // 4×4 Bayer matrix for optional ordered dithering
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  /* ---- the whole pipeline: frames -> Blob ---- */
  async function encodeGifAnimation(frames, opts, hooks) {
    hooks = hooks || {};
    const onProgress = hooks.onProgress || (() => {});
    const aborted = hooks.aborted || (() => false);
    const yieldUI = () => new Promise((r) => setTimeout(r, 0));

    const m = frameMetrics(frames, opts.font, opts.fontSize);
    const cv = workCanvas();
    cv.width = m.W; cv.height = m.H;
    const ctx = cv.getContext("2d", { willReadFrequently: true });

    /* pass 1 — palette histogram from a spread of sample frames */
    const hist = new Map();
    const sampleN = Math.min(frames.length, 12);
    const budget = 150000;                 // histogram samples per frame
    for (let s = 0; s < sampleN; s++) {
      const f = frames[Math.floor(s * frames.length / sampleN)];
      drawFrame(ctx, f.html, m, opts);
      const d = ctx.getImageData(0, 0, m.W, m.H).data;
      const stride = Math.max(1, Math.floor(d.length / 4 / budget));
      for (let i = 0; i < d.length; i += 4 * stride) {
        const rgb = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        hist.set(rgb, (hist.get(rgb) || 0) + 1);
      }
      if (aborted()) return null;
      await yieldUI();
    }
    const palette = buildPalette(hist, opts.maxColors || 256);

    /* pass 2 — map every frame to the palette and LZW-encode it */
    const gif = GifBuilder(m.W, m.H, palette, opts.loop !== false);
    const cache = new Map();               // rgb (+ bayer cell) -> palette index
    const nearest = (r, g, b) => {
      let best = 0, bd = Infinity;
      for (let i = 0; i < palette.length; i++) {
        const p = palette[i];
        const d = (p[0] - r) * (p[0] - r) + (p[1] - g) * (p[1] - g) + (p[2] - b) * (p[2] - b);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    };
    const c255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
    const delayCs = Math.max(2, Math.round(100 / Math.max(1, opts.fps || 12)));
    const indices = new Uint8Array(m.W * m.H);
    for (let fi = 0; fi < frames.length; fi++) {
      drawFrame(ctx, frames[fi].html, m, opts);
      const d = ctx.getImageData(0, 0, m.W, m.H).data;
      for (let p = 0, i = 0; p < indices.length; p++, i += 4) {
        const rgb = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        let key = rgb, bidx = 0;
        if (opts.dither) {
          bidx = (((p / m.W) | 0) & 3) * 4 + ((p % m.W) & 3);
          key = rgb * 16 + bidx;
        }
        let idx = cache.get(key);
        if (idx === undefined) {
          if (opts.dither) {
            const t = (BAYER[bidx] / 16 - 0.5) * 24;
            idx = nearest(c255(d[i] + t), c255(d[i + 1] + t), c255(d[i + 2] + t));
          } else {
            idx = nearest(d[i], d[i + 1], d[i + 2]);
          }
          cache.set(key, idx);
        }
        indices[p] = idx;
      }
      gif.addFrame(indices, delayCs);
      onProgress(fi + 1, frames.length);
      if (aborted()) return null;
      await yieldUI();
    }
    return new Blob([gif.finish()], { type: "image/gif" });
  }

  RVRY.GifBuilder = GifBuilder;
  RVRY.gifFrameMetrics = frameMetrics;
  RVRY.encodeGifAnimation = encodeGifAnimation;
})(typeof window !== "undefined" ? window : globalThis);
