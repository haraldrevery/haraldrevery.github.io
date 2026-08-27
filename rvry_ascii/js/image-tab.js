/* =====================================================================
   RVRY_ASCII — Image tab
   Load JPG/PNG/GIF/WEBP/SVG -> real-time ASCII with tone + dither controls.
   ===================================================================== */
(function (global) {
  "use strict";
  const RVRY = global.RVRY;
  const $ = (id) => document.getElementById(id);

  /* ---- Image loading (raster + SVG) ---- */
  // A width/height we can trust as an intrinsic pixel aspect ratio: a bare
  // number or an explicit px value. Percentages / em / vw etc. give an <img>
  // no resolvable intrinsic size, so the browser falls back to ~300x150 and
  // the artwork gets squashed — those must NOT be trusted.
  const isConcretePx = (v) => v != null && /^\s*[\d.]+(px)?\s*$/i.test(v);

  function ensureSvgSize(svgText) {
    // Give SVGs a concrete raster size so canvas draws them crisply AND at the
    // correct aspect ratio. The viewBox is the source of truth for the ratio
    // whenever present — it overrides percentage/relative width/height that
    // would otherwise squash the output. (An SVG that deliberately sets a
    // width:height ratio different from its viewBox via preserveAspectRatio is
    // rasterized at the viewBox ratio; that's the right call for ASCII.)
    try {
      const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
      const svg = doc.documentElement;
      if (svg.nodeName.toLowerCase() !== "svg") return svgText;

      const vb = svg.getAttribute("viewBox");
      let vbW = 0, vbH = 0;
      if (vb) {
        const p = vb.trim().split(/[\s,]+/).map(Number);
        if (p.length === 4 && p[2] > 0 && p[3] > 0) { vbW = p[2]; vbH = p[3]; }
      }

      const w0 = svg.getAttribute("width"), h0 = svg.getAttribute("height");
      const concreteDims = isConcretePx(w0) && isConcretePx(h0);

      // Trust author-supplied px dimensions only when there's no viewBox to
      // defer to. Otherwise derive both dims from the viewBox aspect ratio.
      if (vbW && vbH) {
        const scale = 1024 / Math.max(vbW, vbH);
        svg.setAttribute("width", Math.round(vbW * scale));
        svg.setAttribute("height", Math.round(vbH * scale));
      } else if (!concreteDims) {
        // No viewBox and no usable dimensions: fall back to a square.
        svg.setAttribute("width", 1024);
        svg.setAttribute("height", 1024);
      }
      return new XMLSerializer().serializeToString(svg);
    } catch (e) { return svgText; }
  }

  function loadImageFile(file) {
    return new Promise((resolve, reject) => {
      const isSvg = /svg/i.test(file.type) || /\.svg$/i.test(file.name);
      // Use data: URLs (not blob:) so images load under strict CSPs whose
      // img-src allows `data:` but not `blob:`.
      const done = (url) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Could not decode image."));
        img.src = url;
      };
      if (isSvg) {
        const fr = new FileReader();
        fr.onload = () => {
          const fixed = ensureSvgSize(fr.result);
          done("data:image/svg+xml;charset=utf-8," + encodeURIComponent(fixed));
        };
        fr.onerror = () => reject(new Error("Could not read SVG file."));
        fr.readAsText(file);
      } else {
        const fr = new FileReader();
        fr.onload = () => done(fr.result);
        fr.onerror = () => reject(new Error("Could not read image file."));
        fr.readAsDataURL(file);
      }
    });
  }
  // load from a URL (used for the sample button)
  function loadImageUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not load " + url));
      img.src = url;
    });
  }

  RVRY.loadImageFile = loadImageFile; // expose for reuse

  /* ---- Tab controller ---- */
  function init() {
    const els = {
      drop: $("img-drop"), file: $("img-file"), sample: $("img-sample"), crop: $("img-crop"), error: $("img-error"),
      alpha: $("img-alpha"),
      width: $("img-width"), widthV: $("img-width-v"),
      ratio: $("img-ratio"), ratioV: $("img-ratio-v"), ratioFit: $("img-ratio-fit"),
      preset: $("img-preset"), customWrap: $("img-custom-wrap"), custom: $("img-custom"),
      invert: $("img-invert"), color: $("img-color"),
      exposure: $("img-exposure"), exposureV: $("img-exposure-v"),
      contrast: $("img-contrast"), contrastV: $("img-contrast-v"),
      gamma: $("img-gamma"), gammaV: $("img-gamma-v"),
      toneReset: $("img-tone-reset"),
      dither: $("img-dither"), thWrap: $("img-threshold-wrap"), threshold: $("img-threshold"), thV: $("img-threshold-v"),
      copy: $("img-copy"), png: $("img-png"), txt: $("img-txt"), md: $("img-md"), html: $("img-html"),
      font: $("img-font"), fontsize: $("img-fontsize"), lightcanvas: $("img-lightcanvas"),
      stage: $("img-stage"), out: $("img-out"), meta: $("img-meta"), thumb: $("img-thumb"),
      zoomOut: $("img-zoom-out"), zoomFit: $("img-zoom-fit"), zoomIn: $("img-zoom-in")
    };

    RVRY.fillGlyphSelect(els.preset, "standard");
    RVRY.fillDitherSelect(els.dither);

    // `original` = full loaded image; `source` = what the engine samples
    // (the cropped canvas, or the original when uncropped); `crop` = rect.
    const state = { original: null, source: null, crop: null, sample: null, dirty: true, lastText: "" };

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
        alphaMode: els.alpha.value,
        braille,
        ramp,
        color: els.color.checked && !braille, // braille has no color path
        threshold: +els.threshold.value,
        dither: els.dither.value,
        tone: {
          exposure: +els.exposure.value,
          contrast: +els.contrast.value,
          gamma: +els.gamma.value,
          invert: els.invert.checked
        }
      };
    }

    function render() {
      if (!state.source) return;
      const opts = currentOpts();
      try {
        if (state.dirty || !state.sample) {
          state.sample = RVRY.sampleImage(state.source, {
            width: opts.width, ratio: opts.ratio, braille: opts.braille, color: opts.color,
            alphaMode: opts.alphaMode
          });
          state.dirty = false;
        }
        const res = RVRY.render(state.sample, opts);
        state.lastText = res.text;
        if (opts.color && state.sample.rgb) {
          els.out.innerHTML = RVRY.renderColorHTML(state.sample, opts, res);
        } else {
          els.out.textContent = res.text;
        }
        els.meta.textContent = `${res.cols} × ${res.rows} chars`;
      } catch (e) {
        showError(e.message);
      }
    }
    const rerender = RVRY.ui.rafThrottle(render);

    function showError(msg) {
      if (!msg) { els.error.classList.remove("show"); return; }
      els.error.textContent = msg; els.error.classList.add("show");
    }

    function setImage(img, name) {
      state.original = img;
      state.source = img;
      state.crop = null;
      state.dirty = true;
      els.drop.querySelector("strong").textContent = name;
      if (els.crop) els.crop.disabled = false;
      RVRY.drawThumb(els.thumb, state.source, 160);
      updateCropLabel();
      render();
    }

    function updateCropLabel() {
      if (!els.crop) return;
      els.crop.textContent = state.crop ? "✂ Edit crop" : "✂ Crop";
    }

    async function setFile(file) {
      showError("");
      try {
        setImage(await loadImageFile(file), file.name);
        // static tab shows only the first frame of an animated GIF — say so
        if (/image\/gif/i.test(file.type) || /\.gif$/i.test(file.name)) {
          file.arrayBuffer().then((buf) => {
            const n = RVRY.gifFrameCount(buf);
            if (n > 1) RVRY.ui.toast(
              `Animated GIF (${n} frames) — first frame shown; the ANSI / Video player tab converts them all`, 3600);
          }).catch(() => {});
        }
      }
      catch (e) { showError(e.message); }
    }

    /* file input / dropzone */
    els.drop.addEventListener("click", () => els.file.click());
    els.file.addEventListener("change", (e) => {
      if (e.target.files[0]) setFile(e.target.files[0]);
      e.target.value = ""; // allow re-selecting the same file
    });
    RVRY.wireDropzone(els.drop, (files) => { if (files[0]) setFile(files[0]); });
    RVRY.registerPaste("image", setFile);
    els.sample.addEventListener("click", async () => {
      showError("");
      // absolute: the published page lives in /notebook_pages/, assets don't
      try { setImage(await loadImageUrl("/rvry_ascii/svg_icons_to_use/hrldrvryicon.svg"), "hrldrvryicon.svg"); }
      catch (e) { showError("Sample not found — run from the project folder. " + e.message); }
    });

    /* crop */
    if (els.crop) {
      els.crop.disabled = true;
      els.crop.addEventListener("click", () => {
        if (!state.original) return;
        RVRY.openCropper(state.original, state.crop, (canvas, rect) => {
          state.source = canvas; state.crop = rect; state.dirty = true;
          RVRY.drawThumb(els.thumb, state.source, 160);
          updateCropLabel(); render();
        }, () => { // "use full image" reset
          state.source = state.original; state.crop = null; state.dirty = true;
          RVRY.drawThumb(els.thumb, state.source, 160);
          updateCropLabel(); render();
        });
      });
    }

    /* geometry (mark sample dirty) */
    RVRY.slider(els.width, els.widthV, 0, () => { state.dirty = true; rerender(); });
    RVRY.slider(els.ratio, els.ratioV, 2, () => { state.dirty = true; rerender(); });
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
    els.color.addEventListener("change", () => { state.dirty = true; rerender(); }); // needs rgb resample
    els.alpha.addEventListener("change", () => { state.dirty = true; rerender(); }); // transparency handling is baked into the sample

    /* tone (real-time, no resample) */
    RVRY.slider(els.exposure, els.exposureV, 2, rerender);
    RVRY.slider(els.contrast, els.contrastV, 2, rerender);
    RVRY.slider(els.gamma, els.gammaV, 2, rerender);
    els.toneReset.addEventListener("click", () => {
      // real input events so the slider readouts repaint and the change persists
      [[els.exposure, 1], [els.contrast, 0], [els.gamma, 1]].forEach(([el, v]) => {
        el.value = v;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });

    /* dither */
    els.dither.addEventListener("change", () => { syncThreshold(); rerender(); });
    RVRY.slider(els.threshold, els.thV, 2, rerender);

    /* export */
    const paint = () => ({
      font: els.font.value, name: "rvry-image", fontSize: +els.fontsize.value,
      bg: els.lightcanvas.checked ? "#ffffff" : "#0a0b0d",
      fg: els.lightcanvas.checked ? "#0a0b0d" : "#e9eaec"
    });
    els.copy.addEventListener("click", () => RVRY.ui.copyText(state.lastText));
    els.txt.addEventListener("click", () => RVRY.ui.exportTxt(state.lastText, "rvry-image"));
    els.md.addEventListener("click", () => RVRY.ui.exportMd(state.lastText, "rvry-image"));
    els.html.addEventListener("click", () => {
      const o = paint();
      if (els.color.checked && els.out.querySelector("span")) o.html = els.out.innerHTML;
      RVRY.ui.exportHtml(state.lastText, o);
    });
    els.png.addEventListener("click", () => RVRY.ui.exportPng(els.out, paint()));

    /* preview styling + zoom */
    RVRY.wirePreview(els.font, els.fontsize, els.lightcanvas, els.out, els.stage);
    RVRY.wireZoom(els.out, els.stage, els.fontsize, { fit: els.zoomFit, inc: els.zoomIn, dec: els.zoomOut });
  }

  RVRY.initImageTab = init;
})(window);
