/* =====================================================================
   RVRY_ASCII — shared UI helpers: toast, clipboard, downloads, exports,
   font picker, debounce.  Attaches to window.RVRY.ui
   ===================================================================== */
(function (global) {
  "use strict";
  const RVRY = global.RVRY || (global.RVRY = {});

  /* ---- Toast ---- */
  let toastEl, toastTimer;
  function toast(msg, ms) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms || 1800);
  }

  /* ---- Clipboard ---- */
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied to clipboard");
    } catch (e) {
      // Fallback for insecure contexts / older browsers
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast("Copied to clipboard"); }
      catch (_) { toast("Copy failed — select the text manually"); }
      document.body.removeChild(ta);
    }
  }

  /* ---- Download blob ---- */
  function download(filename, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  const ts = () => new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);

  function exportTxt(text, name) { download(`${name || "rvry-ascii"}-${ts()}.txt`, text, "text/plain;charset=utf-8"); }
  function exportMd(text, name) {
    // The art itself may contain backtick runs (they're in the Detailed ramp),
    // so the fence must be longer than the longest run in the content.
    let run = 0, longest = 0;
    for (const ch of text) {
      run = ch === "`" ? run + 1 : 0;
      if (run > longest) longest = run;
    }
    const fence = "`".repeat(Math.max(3, longest + 1));
    const md = fence + "\n" + text + "\n" + fence + "\n";
    download(`${name || "rvry-ascii"}-${ts()}.md`, md, "text/markdown;charset=utf-8");
  }
  function exportHtml(text, opts) {
    opts = opts || {};
    const font = opts.font || "monospace";
    const bg = opts.bg || "#0a0b0d";
    const fg = opts.fg || "#e9eaec";
    const title = opts.title || "RVRY_ASCII";
    const size = opts.fontSize || 10;
    const esc = (RVRY.escapeHtml || ((s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))));
    // opts.html: pre-escaped markup (colored spans) used instead of plain text
    const body = opts.html != null ? opts.html : esc(text);
    const html =
`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  html,body{margin:0;background:${bg};}
  pre{margin:0;padding:2rem;color:${fg};font-family:${font};
      font-size:${size}px;line-height:1;white-space:pre;letter-spacing:0;
      display:inline-block;}
</style></head>
<body><pre>${body}</pre></body></html>`;
    download(`${(opts.name || "rvry-ascii")}-${ts()}.html`, html, "text/html;charset=utf-8");
  }

  /* ---- Preview output: art vs. empty-state message ----
     A preview <pre> is the single source that BOTH the PNG export and
     fit-to-width read, and it is also where each tab shows "load an image",
     "no ink", "type some text" and friends. Those messages are not art, and
     nothing in the element's contents distinguishes them: exporting one
     produced a PNG of the sentence, and fitting to one pinned the font size to
     the slider maximum (and left the stage laid out for it). Route both kinds
     of write through here so the distinction is recorded on the element rather
     than guessed downstream. ---- */
  const clearPlaceholder = (preEl) => { delete preEl.dataset.placeholder; };
  function showArt(preEl, text) { preEl.textContent = text; clearPlaceholder(preEl); }
  function showArtHtml(preEl, html) { preEl.innerHTML = html; clearPlaceholder(preEl); }
  function showPlaceholder(preEl, msg) {
    preEl.textContent = msg;
    preEl.dataset.placeholder = "1";
  }
  const isPlaceholder = (preEl) => preEl.dataset.placeholder === "1";

  /* ---- Fixed glyph grid ----
     Lays the <pre>'s content on a strict grid (every glyph advances by the
     measured "M" width). Single source of truth for BOTH the PNG export and
     the on-screen canvas preview, so the two can never disagree — the DOM's
     natural font advances drift when a glyph falls back to another face. ---- */
  const _pngCanvas = document.createElement("canvas");
  const _measureCtx = _pngCanvas.getContext("2d");

  function gridMetrics(font, px, cols, rows, pad) {
    _measureCtx.font = `${px}px ${font}`;
    const charW = _measureCtx.measureText("M").width || px * 0.6;
    return {
      px, charW, lineH: px, pad, // line-height:1, like the old DOM preview
      W: Math.ceil(charW * cols) + pad * 2,
      H: Math.ceil(px * rows + pad * 2)
    };
  }

  function textDims(preEl) {
    const lines = (preEl.textContent || "").split("\n");
    let cols = 1;
    for (const l of lines) { const n = RVRY.cellCount(l); if (n > cols) cols = n; }
    return { cols, rows: lines.length };
  }

  // draws preEl's child nodes (text + colored spans) onto ctx with metrics m
  function drawGrid(ctx, preEl, m, font, fg, bg) {
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, m.W, m.H); }
    else ctx.clearRect(0, 0, m.W, m.H);
    ctx.font = `${m.px}px ${font}`;
    ctx.textBaseline = "top";
    let x = m.pad, y = m.pad;
    const draw = (str, color) => {
      ctx.fillStyle = color;
      for (const ch of str) {
        if (ch === "\n") { x = m.pad; y += m.lineH; }
        else { ctx.fillText(ch, x, y); x += m.charW; }
      }
    };
    preEl.childNodes.forEach((node) => {
      if (node.nodeType === 3) draw(node.nodeValue, fg);                 // text
      else if (node.nodeType === 1) draw(node.textContent, node.style.color || fg); // span
    });
  }

  /* ---- Export as PNG ---- */
  function exportPng(preEl, opts) {
    opts = opts || {};
    const font = opts.font || "monospace";
    const bg = opts.bg || "#0a0b0d";
    const fg = opts.fg || "#e9eaec";
    if (isPlaceholder(preEl) || !(preEl.textContent || "").trim()) {
      toast("Nothing to export yet"); return;
    }

    const { cols, rows } = textDims(preEl);
    // pick a scale that keeps the canvas within browser limits (~8000px)
    const base = Math.max(6, opts.fontSize || 8);
    let scale = 3, m;
    while (true) {
      const px = base * scale;
      m = gridMetrics(font, px, cols, rows, Math.round(px * 0.6));
      if ((m.W <= 8000 && m.H <= 8000) || scale <= 1) break;
      scale -= 1;
    }
    _pngCanvas.width = m.W; _pngCanvas.height = m.H;
    drawGrid(_pngCanvas.getContext("2d"), preEl, m, font, fg, bg);

    _pngCanvas.toBlob((blob) => {
      if (blob) download(`${opts.name || "rvry-ascii"}-${ts()}.png`, blob);
      else toast("PNG export failed — image too large. Reduce width or font size.");
    }, "image/png");
  }

  /* ---- Canvas preview ----
     Repaints a preview canvas from its hidden <pre> using the same grid as
     exportPng. Transparent background (no bg fill) — the stage supplies it,
     exactly like the DOM preview did. Backing store is devicePixelRatio-
     scaled for crisp glyphs, stepped down if the canvas would get huge. ---- */
  function paintPreview(preEl, canvas, o) {
    const { cols, rows } = textDims(preEl);
    let dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    let m = gridMetrics(o.font, o.fontSize * dpr, cols, rows, 0);
    while ((m.W > 10000 || m.H > 10000) && dpr > 1) {
      dpr = Math.max(1, dpr - 0.5);
      m = gridMetrics(o.font, o.fontSize * dpr, cols, rows, 0);
    }
    canvas.width = m.W; canvas.height = m.H;
    canvas.style.width = (m.W / dpr) + "px";
    canvas.style.height = (m.H / dpr) + "px";
    drawGrid(canvas.getContext("2d"), preEl, m, o.font, o.fg, o.bg || null);
  }

  /* ---- Font picker ----
     `always: true` marks the entries this page can guarantee — the two
     webfonts it ships itself and the generic the browser must provide. Every
     other entry names a font that only exists if the OS happens to have it
     installed, and a CSS stack fails silently: the picker used to offer 15
     choices that collapsed to 6 distinct renderings on a stock Linux box, with
     Consolas, Menlo, Fira Code, JetBrains Mono and friends all quietly drawing
     the same generic monospace. Those are probed at startup and dropped when
     absent, so the list only ever offers what it can actually deliver. ---- */
  const BASE_FONTS = [
    { label: "HaraldMono (brand)", value: '"HaraldMono", monospace', always: true },
    { label: "System monospace", value: "ui-monospace, monospace", always: true },
    { label: "Courier New", value: '"Courier New", monospace' },
    { label: "Consolas", value: "Consolas, monospace" },
    { label: "Menlo", value: "Menlo, monospace" },
    { label: "Monaco", value: "Monaco, monospace" },
    { label: "DejaVu Sans Mono", value: '"DejaVu Sans Mono", monospace' },
    { label: "Liberation Mono", value: '"Liberation Mono", monospace' },
    { label: "Ubuntu Mono", value: '"Ubuntu Mono", monospace' },
    { label: "Fira Code", value: '"Fira Code", monospace' },
    { label: "JetBrains Mono", value: '"JetBrains Mono", monospace' },
    { label: "Cascadia Code", value: '"Cascadia Code", monospace' },
    { label: "Source Code Pro", value: '"Source Code Pro", monospace' },
    { label: "IBM Plex Mono", value: '"IBM Plex Mono", monospace' },
    { label: "HaraldText (sans)", value: '"HaraldText", sans-serif', always: true }
  ];

  // First family of a CSS stack, e.g. '"Courier New", monospace' -> '"Courier New"'
  const firstFamily = (stack) => String(stack).split(",")[0].trim();

  /* Is a family really installed? Measure the same string twice, once backed by
     each of two very different generics. If the family resolves, both use its
     glyphs and the widths match; if it does not, the two fallbacks are measured
     instead and differ. (Probing a family the page ships itself would race
     font-display:swap, which is what `always` above is for.) */
  const PROBE = "mmmwwwiiil0O@#MW";
  function familyAvailable(stack) {
    const fam = firstFamily(stack);
    _measureCtx.font = `72px ${fam}, monospace`;
    const a = _measureCtx.measureText(PROBE).width;
    _measureCtx.font = `72px ${fam}, serif`;
    const b = _measureCtx.measureText(PROBE).width;
    return Math.abs(a - b) < 0.01;
  }

  /* The whole render path lays glyphs on a fixed grid pitched to measureText("M"),
     so a proportional face draws every narrow glyph adrift in an M-wide cell.
     Used to filter installed fonts, and to warn (never to block) on an import. */
  function isMonospaceFamily(stack) {
    _measureCtx.font = `72px ${stack}`;
    const w = _measureCtx.measureText("M").width;
    for (const ch of "il1W.@") {
      if (Math.abs(_measureCtx.measureText(ch).width - w) > 0.01) return false;
    }
    return true;
  }

  /* ---- Custom font import ----
     Registered from an ArrayBuffer, so no network fetch happens and the page's
     `font-src 'self' data:` CSP never comes into play. The option's value is an
     ordinary CSS stack, exactly like every built-in entry, so the preview, the
     PNG/GIF rasterisers, fontCellRatio and the HTML export all keep treating it
     as just another font — nothing downstream learns a new case.
     Deliberately session-scoped: a font file cannot ride RVRY.persist (which
     skips file inputs), and storing one would mean a new IndexedDB layer. On
     reload the saved value names an option that no longer exists and
     persist.restore() falls back to the default on its own. ---- */
  const CUSTOM_FAMILY = "RVRYCustomFont";
  const CUSTOM_VALUE = `"${CUSTOM_FAMILY}", monospace`;
  const LOAD_SENTINEL = "__rvry-load-font__";
  const fontSelects = [];
  const lastFontValue = new WeakMap();
  let customFace = null, fontInput = null;

  function pickFontFile(onFile) {
    if (!fontInput) {
      fontInput = document.createElement("input");
      fontInput.type = "file";
      fontInput.accept = ".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2";
      fontInput.className = "hidden";
      document.body.appendChild(fontInput);
    }
    fontInput.onchange = () => {
      const f = fontInput.files && fontInput.files[0];
      fontInput.value = "";            // allow re-picking the same file
      if (f) onFile(f);
    };
    fontInput.click();
  }

  function addCustomOption(select, label) {
    let opt = select.querySelector("option[data-custom]");
    if (!opt) {
      opt = document.createElement("option");
      opt.dataset.custom = "1";
      opt.value = CUSTOM_VALUE;
      select.insertBefore(opt, select.querySelector("option[data-loadfont]"));
    }
    opt.textContent = label;
  }

  async function installCustomFont(file) {
    const face = new FontFace(CUSTOM_FAMILY, await file.arrayBuffer());
    await face.load();                 // throws on anything that isn't a font
    if (customFace) { try { document.fonts.delete(customFace); } catch (e) {} }
    document.fonts.add(face);
    customFace = face;
    const label = "Custom: " + file.name.replace(/\.[^.]+$/, "");
    for (const s of fontSelects) addCustomOption(s, label);
    return { mono: isMonospaceFamily(CUSTOM_VALUE) };
  }

  function onFontSelectChange(e) {
    const sel = e.currentTarget;
    if (sel.value !== LOAD_SENTINEL) { lastFontValue.set(sel, sel.value); return; }
    const previous = lastFontValue.get(sel) || (sel.options[0] && sel.options[0].value) || "";
    // Only a real user gesture may open a file dialog. persist.restore() and our
    // own post-install notification both dispatch synthetic change events; a
    // stale or hand-edited localStorage entry naming the sentinel would
    // otherwise pop a file picker during boot.
    if (!e.isTrusted) { sel.value = previous; return; }
    // Restore the previous choice synchronously. This handler is registered
    // before any tab wires its own, so nothing downstream ever reads the
    // sentinel, and a cancelled file dialog leaves the picker untouched.
    sel.value = previous;
    pickFontFile(async (file) => {
      try {
        const info = await installCustomFont(file);
        sel.value = CUSTOM_VALUE;
        lastFontValue.set(sel, CUSTOM_VALUE);
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        toast(`Loaded ${file.name}`);
        // The banner tab's lettering font is rasterised into an image and then
        // sampled, so a proportional face is a perfectly good choice there; only
        // the fonts that draw the glyph grid need the warning.
        if (!info.mono && sel.dataset.fontRole !== "lettering") {
          toast("Note: that font is not fixed-width, so the grid will look uneven.", 5200);
        }
      } catch (err) {
        toast(`Could not read ${file.name} — needs a .ttf, .otf, .woff or .woff2 font.`, 4200);
      }
    });
  }

  function populateFontSelect(select) {
    select.innerHTML = "";
    for (const f of BASE_FONTS) {
      if (!f.always && !familyAvailable(f.value)) continue;
      const o = document.createElement("option");
      o.value = f.value; o.textContent = f.label;
      select.appendChild(o);
    }
    const load = document.createElement("option");
    load.dataset.loadfont = "1";
    load.value = LOAD_SENTINEL;
    load.textContent = "Load font file…";
    select.appendChild(load);
    // a font imported before this select was built still belongs in it
    if (customFace) addCustomOption(select, "Custom font");
    if (fontSelects.indexOf(select) < 0) {
      fontSelects.push(select);
      select.addEventListener("change", onFontSelectChange);
    }
    lastFontValue.set(select, select.value);
  }

  // Progressive enhancement: pull real installed fonts (Chromium, permissioned).
  // Filtered to fixed-width faces — the API has no such filter and returns every
  // display and script face installed, each of which renders as garbage on the
  // fixed grid while looking like a legitimate choice in the list.
  async function loadSystemFonts(select) {
    if (!("queryLocalFonts" in window)) return false;
    try {
      const fonts = await window.queryLocalFonts();
      const seen = new Set();
      const group = document.createElement("optgroup");
      group.label = "Installed fonts";
      for (const f of fonts) {
        const fam = f.family;
        if (seen.has(fam)) continue;
        seen.add(fam);
        if (!isMonospaceFamily(`"${fam}"`)) continue;
        const o = document.createElement("option");
        o.value = `"${fam}"`; o.textContent = fam;
        group.appendChild(o);
      }
      if (group.children.length) select.insertBefore(group, select.querySelector("option[data-loadfont]"));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---- Ratio "Auto" button ----
     The preview renders at line-height 1, so a font's true cell ratio (w:h)
     is its glyph advance width over the font size. ---- */
  function fontCellRatio(font) {
    const ctx = _pngCanvas.getContext("2d");
    ctx.font = "100px " + (font || "monospace");
    const w = ctx.measureText("M").width;
    return w > 0 ? w / 100 : 0.5;
  }
  function wireRatioFit(btn, ratioEl, fontEl) {
    if (!btn) return;
    btn.addEventListener("click", () => {
      const min = +ratioEl.min || 0.2, max = +ratioEl.max || 1.2;
      const r = Math.min(max, Math.max(min, fontCellRatio(fontEl.value)));
      ratioEl.value = r.toFixed(2);
      ratioEl.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function debounce(fn, ms) {
    let t;
    return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms || 60); };
  }

  // requestAnimationFrame-coalesced call (for real-time slider render)
  function rafThrottle(fn) {
    let queued = false, lastArgs;
    return function (...a) {
      lastArgs = a;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; fn.apply(this, lastArgs); });
    };
  }

  RVRY.ui = {
    toast, copyText, download,
    exportTxt, exportMd, exportHtml, exportPng, paintPreview,
    showArt, showArtHtml, showPlaceholder, isPlaceholder,
    BASE_FONTS, populateFontSelect, loadSystemFonts, installCustomFont,
    familyAvailable, isMonospaceFamily,
    fontCellRatio, wireRatioFit,
    debounce, rafThrottle
  };
})(window);
