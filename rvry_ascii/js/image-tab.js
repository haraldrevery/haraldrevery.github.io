/* =====================================================================
   RVRY_ASCII — Image tab
   Load JPG/PNG/GIF/WEBP/SVG -> real-time ASCII with tone + dither controls.
   ===================================================================== */
(function (global) {
  "use strict";
  const RVRY = global.RVRY;
  const $ = (id) => document.getElementById(id);

  /* ---- Image loading (raster + SVG) ---- */
  function ensureSvgSize(svgText) {
    // Give sizeless SVGs a concrete raster size so canvas draws them crisply.
    try {
      const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
      const svg = doc.documentElement;
      if (svg.nodeName.toLowerCase() !== "svg") return svgText;
      const hasW = svg.hasAttribute("width"), hasH = svg.hasAttribute("height");
      if (!hasW || !hasH) {
        let vb = svg.getAttribute("viewBox");
        let w = 1024, h = 1024;
        if (vb) {
          const p = vb.trim().split(/[\s,]+/).map(Number);
          if (p.length === 4 && p[2] > 0 && p[3] > 0) {
            const scale = 1024 / Math.max(p[2], p[3]);
            w = Math.round(p[2] * scale); h = Math.round(p[3] * scale);
          }
        }
        svg.setAttribute("width", w);
        svg.setAttribute("height", h);
      }
      return new XMLSerializer().serializeToString(svg);
    } catch (e) { return svgText; }
  }

  function loadImageFile(file) {
    return new Promise((resolve, reject) => {
      const isSvg = /svg/i.test(file.type) || /\.svg$/i.test(file.name);
      const done = (url, revoke) => {
        const img = new Image();
        img.onload = () => { if (revoke) URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { if (revoke) URL.revokeObjectURL(url); reject(new Error("Could not decode image.")); };
        img.src = url;
      };
      if (isSvg) {
        const fr = new FileReader();
        fr.onload = () => {
          const fixed = ensureSvgSize(fr.result);
          const blob = new Blob([fixed], { type: "image/svg+xml" });
          done(URL.createObjectURL(blob), true);
        };
        fr.onerror = () => reject(new Error("Could not read SVG file."));
        fr.readAsText(file);
      } else {
        done(URL.createObjectURL(file), true);
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
      width: $("img-width"), widthV: $("img-width-v"),
      ratio: $("img-ratio"), ratioV: $("img-ratio-v"),
      preset: $("img-preset"), customWrap: $("img-custom-wrap"), custom: $("img-custom"),
      invert: $("img-invert"), color: $("img-color"),
      exposure: $("img-exposure"), exposureV: $("img-exposure-v"),
      contrast: $("img-contrast"), contrastV: $("img-contrast-v"),
      gamma: $("img-gamma"), gammaV: $("img-gamma-v"),
      stretch: $("img-stretch"), stretchV: $("img-stretch-v"),
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
            width: opts.width, ratio: opts.ratio, braille: opts.braille, color: opts.color
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
        applyStretch();
      } catch (e) {
        showError(e.message);
      }
    }
    const rerender = RVRY.ui.rafThrottle(render);

    // Vertical preview stretch — display only (real-time, no resample). A matching
    // bottom margin reserves layout space so the stretched output stays scrollable.
    function applyStretch() {
      const s = +els.stretch.value;
      els.out.style.transformOrigin = "0 0";
      els.out.style.transform = s === 1 ? "" : `scaleY(${s})`;
      const h = els.out.offsetHeight; // layout height (ignores the transform)
      els.out.style.marginBottom = s > 1 ? Math.round(h * (s - 1)) + "px" : "";
    }

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
      try { setImage(await loadImageUrl("svg_icons_to_use/hrldrvryicon.svg"), "hrldrvryicon.svg"); }
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

    /* glyphs */
    els.preset.addEventListener("change", () => {
      const p = RVRY.GLYPH_PRESETS[els.preset.value];
      els.customWrap.classList.toggle("hidden", els.preset.value !== "custom");
      els.thWrap.classList.toggle("hidden", !(p && p.braille));
      state.dirty = true; // braille toggles sample resolution
      render();
    });
    els.custom.addEventListener("input", rerender);
    els.invert.addEventListener("change", rerender);
    els.color.addEventListener("change", () => { state.dirty = true; rerender(); }); // needs rgb resample

    /* tone (real-time, no resample) */
    RVRY.slider(els.exposure, els.exposureV, 2, rerender);
    RVRY.slider(els.contrast, els.contrastV, 2, rerender);
    RVRY.slider(els.gamma, els.gammaV, 2, rerender);
    RVRY.slider(els.stretch, els.stretchV, 2, applyStretch); // no resample needed
    els.toneReset.addEventListener("click", () => {
      // real input events so the slider readouts repaint and the change persists
      [[els.exposure, 1], [els.contrast, 0], [els.gamma, 1]].forEach(([el, v]) => {
        el.value = v;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });

    /* dither */
    els.dither.addEventListener("change", rerender);
    RVRY.slider(els.threshold, els.thV, 2, rerender);

    /* export */
    const paint = () => ({
      font: els.font.value, name: "rvry-image", fontSize: +els.fontsize.value,
      bg: els.lightcanvas.checked ? "#ffffff" : "#0a0b0d",
      fg: els.lightcanvas.checked ? "#0a0b0d" : "#e9eaec",
      stretch: +els.stretch.value
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
