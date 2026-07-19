/* =====================================================================
   RVRY_ASCII — Text banner tab (FIGlet-style lettering)
   Type text -> rasterize it onto a hidden canvas -> reuse the standard
   sample/tone/dither/glyph pipeline. Every preset and export works.
   ===================================================================== */
(function (global) {
  "use strict";
  const RVRY = global.RVRY;
  const $ = (id) => document.getElementById(id);

  function init() {
    const els = {
      text: $("txt-text"), srcfont: $("txt-srcfont"), bold: $("txt-bold"),
      width: $("txt-width"), widthV: $("txt-width-v"),
      ratio: $("txt-ratio"), ratioV: $("txt-ratio-v"), ratioFit: $("txt-ratio-fit"),
      preset: $("txt-preset"), customWrap: $("txt-custom-wrap"), custom: $("txt-custom"),
      invert: $("txt-invert"),
      dither: $("txt-dither"), thWrap: $("txt-threshold-wrap"), threshold: $("txt-threshold"), thV: $("txt-threshold-v"),
      copy: $("txt-copy"), png: $("txt-png"), txt: $("txt-txt"), md: $("txt-md"), html: $("txt-html"),
      font: $("txt-font"), fontsize: $("txt-fontsize"), lightcanvas: $("txt-lightcanvas"),
      stage: $("txt-stage"), out: $("txt-out"), meta: $("txt-meta"),
      zoomOut: $("txt-zoom-out"), zoomFit: $("txt-zoom-fit"), zoomIn: $("txt-zoom-in")
    };

    RVRY.fillGlyphSelect(els.preset, "standard");
    RVRY.fillDitherSelect(els.dither);

    const cv = document.createElement("canvas");
    const state = { sample: null, dirty: true, lastText: "" };

    // White lettering on black: bright maps to the dense end of the ramp,
    // so the letters become characters and the background becomes spaces.
    function drawBanner() {
      const raw = els.text.value.replace(/\r/g, "");
      if (!raw.trim()) return null;
      const lines = raw.split("\n");
      const ctx = cv.getContext("2d");
      const setFont = (p) => {
        ctx.font = (els.bold.checked ? "bold " : "") + p + "px " + els.srcfont.value;
      };
      let px = 160;
      setFont(px);
      let w = 1;
      for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
      // keep very long banners within canvas limits — width AND height
      // (many lines would otherwise blow past the browser's canvas cap)
      if (w > 8000) { px = Math.max(4, Math.floor((px * 8000) / w)); }
      const projH = px * 1.25 * lines.length + px * 0.5;
      if (projH > 8000) { px = Math.max(4, Math.floor((px * 8000) / projH)); }
      const pad = Math.round(px * 0.25);
      const lineH = Math.round(px * 1.25);
      setFont(px);
      w = 1;
      for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
      cv.width = Math.ceil(w) + pad * 2;
      cv.height = lineH * lines.length + pad * 2;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = "#fff";
      setFont(px); // canvas resize resets ctx state
      ctx.textBaseline = "top";
      lines.forEach((l, i) => ctx.fillText(l, pad, pad + i * lineH));
      return cv;
    }

    function currentOpts() {
      const presetKey = els.preset.value;
      const preset = RVRY.GLYPH_PRESETS[presetKey];
      const braille = !!(preset && preset.braille);
      let ramp;
      if (presetKey === "custom") ramp = els.custom.value || "RVRY";
      else ramp = preset ? preset.ramp : " .:-=+*#%@";
      return {
        width: +els.width.value,
        ratio: +els.ratio.value,
        braille,
        ramp,
        threshold: +els.threshold.value,
        dither: els.dither.value,
        tone: { invert: els.invert.checked }
      };
    }

    function render() {
      const opts = currentOpts();
      try {
        if (state.dirty || !state.sample) {
          const src = drawBanner();
          if (!src) {
            state.sample = null; state.lastText = "";
            els.out.textContent = "Type some text to render.";
            els.meta.textContent = "—";
            return;
          }
          state.sample = RVRY.sampleImage(src, {
            width: opts.width, ratio: opts.ratio, braille: opts.braille
          });
          state.dirty = false;
        }
        const res = RVRY.render(state.sample, opts);
        state.lastText = res.text;
        els.out.textContent = res.text;
        els.meta.textContent = `${res.cols} × ${res.rows} chars`;
      } catch (e) {
        state.sample = null; state.lastText = "";
        els.out.textContent = "Banner too large to render — use fewer lines or shorter text.";
        els.meta.textContent = "—";
      }
    }
    const rerender = RVRY.ui.rafThrottle(render);
    const dirtyRender = () => { state.dirty = true; rerender(); };

    /* lettering (rebuilds the canvas) */
    els.text.addEventListener("input", dirtyRender);
    els.srcfont.addEventListener("change", dirtyRender);
    els.bold.addEventListener("change", dirtyRender);
    // re-rasterize once webfonts (e.g. HaraldMono) finish loading
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(dirtyRender).catch(() => {});
    }

    /* geometry */
    RVRY.slider(els.width, els.widthV, 0, dirtyRender);
    RVRY.slider(els.ratio, els.ratioV, 2, dirtyRender);
    RVRY.ui.wireRatioFit(els.ratioFit, els.ratio, els.font);

    /* glyphs */
    // threshold only applies to braille without dithering (dither replaces it)
    const syncThreshold = () => {
      const p = RVRY.GLYPH_PRESETS[els.preset.value];
      els.thWrap.classList.toggle("hidden", !(p && p.braille) || els.dither.value !== "none");
    };
    els.preset.addEventListener("change", () => {
      els.customWrap.classList.toggle("hidden", els.preset.value !== "custom");
      syncThreshold();
      state.dirty = true; // braille toggles sample resolution
      render();
    });
    els.custom.addEventListener("input", rerender);
    els.invert.addEventListener("change", rerender);

    /* dither */
    els.dither.addEventListener("change", () => { syncThreshold(); rerender(); });
    RVRY.slider(els.threshold, els.thV, 2, rerender);

    /* export */
    const paint = () => ({
      font: els.font.value, name: "rvry-banner", fontSize: +els.fontsize.value,
      bg: els.lightcanvas.checked ? "#ffffff" : "#0a0b0d",
      fg: els.lightcanvas.checked ? "#0a0b0d" : "#e9eaec"
    });
    els.copy.addEventListener("click", () => RVRY.ui.copyText(state.lastText));
    els.txt.addEventListener("click", () => RVRY.ui.exportTxt(state.lastText, "rvry-banner"));
    els.md.addEventListener("click", () => RVRY.ui.exportMd(state.lastText, "rvry-banner"));
    els.html.addEventListener("click", () => RVRY.ui.exportHtml(state.lastText, paint()));
    els.png.addEventListener("click", () => RVRY.ui.exportPng(els.out, paint()));

    RVRY.wirePreview(els.font, els.fontsize, els.lightcanvas, els.out, els.stage);
    RVRY.wireZoom(els.out, els.stage, els.fontsize, { fit: els.zoomFit, inc: els.zoomIn, dec: els.zoomOut });
    render();
  }

  RVRY.initTextTab = init;
})(window);
