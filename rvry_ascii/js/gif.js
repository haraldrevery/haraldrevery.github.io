/* =====================================================================
   RVRY_ASCII — animated GIF decoder (pure JS, no dependencies)
   RVRY.decodeGif(arrayBuffer, { maxFrames })
     -> { width, height, frames: [{ data: Uint8ClampedArray(RGBA), delayMs }],
          truncated }
   Frames are fully composited (transparency + disposal methods applied),
   so each frame's `data` is a complete width×height RGBA image ready for
   ctx.putImageData(). Interlaced images are de-interlaced.
   RVRY.gifFrameCount(arrayBuffer) -> number  (cheap scan, no decompression)
   ===================================================================== */
(function (global) {
  "use strict";
  const RVRY = global.RVRY || (global.RVRY = {});

  /* ---- LZW decompression (GIF variant, 12-bit max codes) ---- */
  function lzwDecode(minCodeSize, data, npix) {
    const MAXC = 4096;
    const clear = 1 << minCodeSize;
    const eoi = clear + 1;
    const prefix = new Int32Array(MAXC);
    const suffix = new Uint8Array(MAXC);
    const stack = new Uint8Array(MAXC + 1);
    const out = new Uint8Array(npix);
    let codeSize = minCodeSize + 1;
    let mask = (1 << codeSize) - 1;
    let avail = eoi + 1;
    let oldCode = -1, first = 0;
    for (let i = 0; i < clear; i++) suffix[i] = i;

    let datum = 0, bits = 0, op = 0, pos = 0;
    while (op < npix) {
      if (bits < codeSize) {
        if (pos >= data.length) break;          // truncated stream
        datum |= data[pos++] << bits;
        bits += 8;
        continue;
      }
      let code = datum & mask;
      datum >>= codeSize;
      bits -= codeSize;

      if (code === clear) {
        codeSize = minCodeSize + 1;
        mask = (1 << codeSize) - 1;
        avail = eoi + 1;
        oldCode = -1;
        continue;
      }
      if (code === eoi) break;
      if (oldCode === -1) {
        if (code >= clear) break;               // corrupt stream
        first = suffix[code];
        out[op++] = first;
        oldCode = code;
        continue;
      }

      const inCode = code;
      let sp = 0;
      if (code >= avail) { stack[sp++] = first; code = oldCode; } // KwKwK case
      while (code >= clear) { stack[sp++] = suffix[code]; code = prefix[code]; }
      first = suffix[code];
      stack[sp++] = first;

      if (avail < MAXC) {
        prefix[avail] = oldCode;
        suffix[avail] = first;
        avail++;
        if ((avail & mask) === 0 && avail < MAXC) {
          codeSize++;
          mask = (1 << codeSize) - 1;
        }
      }
      oldCode = inCode;
      while (sp > 0 && op < npix) out[op++] = stack[--sp];
    }
    return out;
  }

  // Interlaced GIFs store rows in 4 passes; map decoded row -> display row.
  function interlaceRows(h) {
    const rows = new Array(h);
    let i = 0;
    const passes = [[0, 8], [4, 8], [2, 4], [1, 2]];
    for (const pass of passes) {
      for (let y = pass[0]; y < h; y += pass[1]) rows[i++] = y;
    }
    return rows;
  }

  function decodeGif(buf, opts) {
    opts = opts || {};
    const maxFrames = opts.maxFrames || Infinity;
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (b.length < 13) throw new Error("File too small to be a GIF.");
    const sig = String.fromCharCode(b[0], b[1], b[2], b[3], b[4], b[5]);
    if (!/^GIF8[79]a$/.test(sig)) throw new Error("Not a GIF file.");

    let p = 6;
    const u16 = () => b[p++] | (b[p++] << 8);
    const W = u16(), H = u16();
    const lsdFlags = b[p++];
    p += 2; // background color index + pixel aspect ratio (unused)
    let gct = null;
    if (lsdFlags & 0x80) {
      const n = 2 << (lsdFlags & 7);
      gct = b.subarray(p, p + n * 3);
      p += n * 3;
    }

    // Composited canvas; starts fully transparent (composites over black
    // downstream, matching how browsers rasterize transparent GIFs).
    const canvas = new Uint8ClampedArray(W * H * 4);
    const frames = [];
    let truncated = false;

    // Graphic Control Extension state (applies to the next image only)
    let delayCs = 0, transIdx = -1, disposal = 0;

    const skipSubBlocks = () => {
      while (p < b.length && b[p] !== 0) p += b[p] + 1;
      p++; // block terminator
    };

    while (p < b.length) {
      const block = b[p++];
      if (block === 0x3B) break;                 // trailer

      if (block === 0x21) {                      // extension
        const label = b[p++];
        if (label === 0xF9) {                    // graphic control
          const size = b[p++];
          const gf = b[p];
          disposal = (gf >> 2) & 7;
          delayCs = b[p + 1] | (b[p + 2] << 8);
          transIdx = (gf & 1) ? b[p + 3] : -1;
          p += size;
          skipSubBlocks();
        } else {
          skipSubBlocks();                       // comment / app / plain text
        }

      } else if (block === 0x2C) {               // image descriptor
        const x = u16(), y = u16(), w = u16(), h = u16();
        const idFlags = b[p++];
        const interlaced = !!(idFlags & 0x40);
        let pal = gct;
        if (idFlags & 0x80) {
          const n = 2 << (idFlags & 7);
          pal = b.subarray(p, p + n * 3);
          p += n * 3;
        }
        const minCode = b[p++];

        // concatenate the image data sub-blocks
        let total = 0, q = p;
        while (q < b.length && b[q] !== 0) { total += b[q]; q += b[q] + 1; }
        const data = new Uint8Array(total);
        let dp = 0;
        while (p < b.length && b[p] !== 0) {
          const n = b[p++];
          data.set(b.subarray(p, p + n), dp);
          dp += n; p += n;
        }
        p++; // block terminator

        if (frames.length >= maxFrames) { truncated = true; break; }
        if (!pal || !w || !h) { delayCs = 0; transIdx = -1; disposal = 0; continue; }

        const idx = lzwDecode(minCode, data, w * h);
        const prev = disposal === 3 ? canvas.slice() : null;
        const rowMap = interlaced ? interlaceRows(h) : null;

        for (let row = 0; row < h; row++) {
          const dy = y + (rowMap ? rowMap[row] : row);
          if (dy >= H) continue;
          for (let col = 0; col < w; col++) {
            const ci = idx[row * w + col];
            if (ci === transIdx) continue;
            const dx = x + col;
            if (dx >= W) continue;
            const dpx = (dy * W + dx) * 4;
            const cp = ci * 3;
            canvas[dpx] = pal[cp];
            canvas[dpx + 1] = pal[cp + 1];
            canvas[dpx + 2] = pal[cp + 2];
            canvas[dpx + 3] = 255;
          }
        }

        // delay: 0/1 centiseconds is a legacy "as fast as possible" value;
        // browsers clamp it to 100 ms, so we do the same.
        let ms = delayCs * 10;
        if (ms < 20) ms = 100;
        frames.push({ data: canvas.slice(), delayMs: ms });

        if (disposal === 2) {                    // restore to background
          const cw = Math.max(0, Math.min(w, W - x));
          for (let row = 0; row < h; row++) {
            const dy = y + row;
            if (dy >= H) continue;
            const start = (dy * W + x) * 4;
            canvas.fill(0, start, start + cw * 4);
          }
        } else if (disposal === 3 && prev) {     // restore to previous
          canvas.set(prev);
        }
        delayCs = 0; transIdx = -1; disposal = 0;

      } else {
        break; // unknown block — stop gracefully with what we have
      }
    }

    return { width: W, height: H, frames, truncated };
  }

  /* Logical screen size from the header (13-byte peek, no decoding). */
  function gifSize(buf) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (b.length < 13) return null;
    const sig = String.fromCharCode(b[0], b[1], b[2], b[3], b[4], b[5]);
    if (!/^GIF8[79]a$/.test(sig)) return null;
    return { width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8) };
  }

  /* Frame count without decompressing pixel data (fast animated-GIF probe). */
  function gifFrameCount(buf) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (b.length < 13) return 0;
    const sig = String.fromCharCode(b[0], b[1], b[2], b[3], b[4], b[5]);
    if (!/^GIF8[79]a$/.test(sig)) return 0;
    let p = 10;
    const flags = b[p];
    p = 13;
    if (flags & 0x80) p += 3 * (2 << (flags & 7));
    let count = 0;
    const skipSubBlocks = () => {
      while (p < b.length && b[p] !== 0) p += b[p] + 1;
      p++;
    };
    while (p < b.length) {
      const block = b[p++];
      if (block === 0x3B) break;
      if (block === 0x21) { p++; skipSubBlocks(); }
      else if (block === 0x2C) {
        count++;
        p += 8;
        const f = b[p++];
        if (f & 0x80) p += 3 * (2 << (f & 7));
        p++; // LZW min code size
        skipSubBlocks();
      } else break;
    }
    return count;
  }

  RVRY.decodeGif = decodeGif;
  RVRY.gifSize = gifSize;
  RVRY.gifFrameCount = gifFrameCount;
})(window);
