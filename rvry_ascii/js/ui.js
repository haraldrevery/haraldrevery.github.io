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
    // opts.stretch: vertical scale matching the preview's Stretch slider
    const stretch = +opts.stretch || 1;
    const stretchCss = stretch === 1 ? "" :
      `\n      transform:scaleY(${stretch});transform-origin:0 0;`;
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
      display:inline-block;${stretchCss}}
</style></head>
<body><pre>${body}</pre></body></html>`;
    download(`${(opts.name || "rvry-ascii")}-${ts()}.html`, html, "text/html;charset=utf-8");
  }

  /* ---- Export as PNG ----
     Renders the on-screen <pre> to a canvas by walking its child nodes, so it
     reproduces exactly what's shown — plain text (image / code-art tabs) and
     colored <span>s (player) alike. ---- */
  const _pngCanvas = document.createElement("canvas");
  function exportPng(preEl, opts) {
    opts = opts || {};
    const font = opts.font || "monospace";
    const bg = opts.bg || "#0a0b0d";
    const fg = opts.fg || "#e9eaec";
    const text = preEl.textContent || "";
    if (!text.trim()) { toast("Nothing to export yet"); return; }

    const lines = text.split("\n");
    let cols = 1;
    for (const l of lines) if (l.length > cols) cols = l.length;
    const rows = lines.length;

    // vertical stretch matching the preview's Stretch slider (scaleY)
    const stretch = +opts.stretch || 1;

    // pick a scale that keeps the canvas within browser limits (~8000px)
    const base = Math.max(6, opts.fontSize || 8);
    const ctx = _pngCanvas.getContext("2d");
    let scale = 3;
    const measure = (px) => { ctx.font = `${px}px ${font}`; return ctx.measureText("M").width; };
    let px, charW, lineH, W, H, pad;
    while (true) {
      px = base * scale;
      charW = measure(px) || px * 0.6;
      lineH = px;                 // preview uses line-height:1
      pad = Math.round(px * 0.6);
      W = Math.ceil(charW * cols) + pad * 2;
      H = Math.ceil((lineH * rows + pad * 2) * stretch);
      if ((W <= 8000 && H <= 8000) || scale <= 1) break;
      scale -= 1;
    }
    _pngCanvas.width = W; _pngCanvas.height = H;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    if (stretch !== 1) ctx.scale(1, stretch); // stretches glyphs like the preview
    ctx.font = `${px}px ${font}`;
    ctx.textBaseline = "top";

    let x = pad, y = pad;
    const draw = (str, color) => {
      ctx.fillStyle = color;
      for (const ch of str) {
        if (ch === "\n") { x = pad; y += lineH; }
        else { ctx.fillText(ch, x, y); x += charW; }
      }
    };
    preEl.childNodes.forEach((node) => {
      if (node.nodeType === 3) draw(node.nodeValue, fg);                 // text
      else if (node.nodeType === 1) draw(node.textContent, node.style.color || fg); // span
    });

    _pngCanvas.toBlob((blob) => {
      if (blob) download(`${opts.name || "rvry-ascii"}-${ts()}.png`, blob);
      else toast("PNG export failed — image too large. Reduce width or font size.");
    }, "image/png");
  }

  /* ---- Font picker ----
     Curated cross-platform monospace stack + project fonts. Optionally
     augmented with real installed fonts via the Local Font Access API. ---- */
  const BASE_FONTS = [
    { label: "HaraldMono (brand)", value: '"HaraldMono", monospace' },
    { label: "System monospace", value: "ui-monospace, monospace" },
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
    { label: "HaraldText (sans)", value: '"HaraldText", sans-serif' }
  ];

  function populateFontSelect(select) {
    select.innerHTML = "";
    for (const f of BASE_FONTS) {
      const o = document.createElement("option");
      o.value = f.value; o.textContent = f.label;
      select.appendChild(o);
    }
  }

  // Progressive enhancement: pull real installed monospace-ish fonts.
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
        const o = document.createElement("option");
        o.value = `"${fam}"`; o.textContent = fam;
        group.appendChild(o);
      }
      if (group.children.length) select.appendChild(group);
      return true;
    } catch (e) {
      return false;
    }
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
    exportTxt, exportMd, exportHtml, exportPng,
    BASE_FONTS, populateFontSelect, loadSystemFonts,
    debounce, rafThrottle
  };
})(window);
