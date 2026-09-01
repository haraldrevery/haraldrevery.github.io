/* =====================================================================
   RVRY_ASCII — Code Art tab  (formerly "obfuscation")
   Take an IMAGE + a body of TEXT (e.g. functional source code) and reflow
   the text so its characters fill the image's dark regions while spaces
   fill the light regions. Only spaces / newlines are inserted between
   tokens, so whitespace-tolerant code keeps running while looking like art.
   ===================================================================== */
(function (global) {
  "use strict";
  const RVRY = global.RVRY;
  const $ = (id) => document.getElementById(id);

  function describeUsage(res, repeat) {
    if (!res.total) return "—";
    // No ink at all: flowText found no cells to fill, so nothing was placed.
    // The ratios below would otherwise blame the text length for what is
    // really a threshold/invert problem. Mirrors describePy's no-ink branch.
    if (!res.placed) return "⚠ No ink — nothing was placed. Lower the threshold or toggle Invert.";
    if (repeat) {
      if (res.loops >= 1) return `Shape filled — text tiled ${res.loops.toFixed(1)}× (${res.total} chars).`;
      return `Code used: ${Math.round(res.loops * 100)}% of one pass (${res.total} chars) — text longer than the shape.`;
    }
    if (res.placed >= res.total) return `Full text placed once (${res.total} chars).`;
    const pct = Math.round((res.placed / res.total) * 100);
    return `Text used: ${pct}% (${res.placed}/${res.total} chars) — enable Repeat or add more text to fill.`;
  }

  function describePy(res, bytes) {
    if (res.complete) return `✓ ${bytes} B wrapped in exec(bytes.fromhex(…)) — runs as-is on Python 3.`;
    if (!res.placed) return "⚠ No ink — nothing was placed, so there is no program. Lower the threshold or toggle Invert.";
    const pct = res.total ? Math.round((res.placed / res.total) * 100) : 0;
    return `⚠ Truncated — only ${pct}% of the program fits, so it WON'T run. Raise Width or shorten the code.`;
  }

  const SAMPLE_JS = `function fib(n){ return n < 2 ? n : fib(n-1) + fib(n-2); }
const seq = Array.from({length: 12}, (_, i) => fib(i));
console.log(seq.join(", "));`;
  const SAMPLE_PY = `import math
def area(r):
    return round(math.pi * r * r, 3)
for i in range(1, 5):
    print(i, area(i))`;

  function loadImageUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not load " + url));
      img.src = url;
    });
  }

  function init() {
    const els = {
      drop: $("obf-drop"), file: $("obf-file"), sample: $("obf-sample"), crop: $("obf-crop"), error: $("obf-error"),
      text: $("obf-text"), usage: $("obf-usage"), repeat: $("obf-repeat"),
      lang: $("obf-lang"), langHint: $("obf-lang-hint"),
      repeatWrap: $("obf-repeat-wrap"), repeatHint: $("obf-repeat-hint"),
      threshold: $("obf-threshold"), thV: $("obf-threshold-v"), invert: $("obf-invert"),
      alpha: $("obf-alpha"),
      exposure: $("obf-exposure"), exposureV: $("obf-exposure-v"),
      contrast: $("obf-contrast"), contrastV: $("obf-contrast-v"),
      gamma: $("obf-gamma"), gammaV: $("obf-gamma-v"),
      width: $("obf-width"), widthV: $("obf-width-v"),
      ratio: $("obf-ratio"), ratioV: $("obf-ratio-v"), ratioFit: $("obf-ratio-fit"),
      copy: $("obf-copy"), png: $("obf-png"), txt: $("obf-txt"), md: $("obf-md"), html: $("obf-html"),
      font: $("obf-font"), fontsize: $("obf-fontsize"), lightcanvas: $("obf-lightcanvas"),
      stage: $("obf-stage"), out: $("obf-out"), meta: $("obf-meta"), thumb: $("obf-thumb"),
      zoomOut: $("obf-zoom-out"), zoomFit: $("obf-zoom-fit"), zoomIn: $("obf-zoom-in")
    };

    const state = { original: null, source: null, crop: null, sample: null, dirty: true, lastText: "" };

    function showError(msg) {
      if (!msg) { els.error.classList.remove("show"); return; }
      els.error.textContent = msg; els.error.classList.add("show");
    }

    function render() {
      if (!state.source) {
        RVRY.ui.showPlaceholder(els.out, "Load an image, then flow your code into it.");
        return;
      }
      const width = +els.width.value, ratio = +els.ratio.value;
      // Same posture as the Image and Text tabs: RVRY.sampleImage throws on a
      // tainted canvas, and without this the exception escaped through
      // rafThrottle as an uncaught error — no banner, stale art left on screen,
      // and every later keystroke throwing again.
      try {
        if (state.dirty || !state.sample) {
          state.sample = RVRY.sampleImage(state.source, { width, ratio, braille: false, alphaMode: els.alpha.value });
          state.dirty = false;
        }
        const tone = { exposure: +els.exposure.value, contrast: +els.contrast.value, gamma: +els.gamma.value };
        const common = { threshold: +els.threshold.value, invert: els.invert.checked, tone };
        let res, python = els.lang.value === "python";
        if (python) {
          const wrap = RVRY.pyWrap(els.text.value);
          res = RVRY.flowText(state.sample, Object.assign({
            tokens: wrap.tokens, filler: wrap.filler, header: wrap.header, footer: wrap.footer, repeat: false
          }, common));
          els.usage.textContent = res.total ? describePy(res, wrap.bytes) : "—";
        } else {
          res = RVRY.flowText(state.sample, Object.assign({
            text: els.text.value, repeat: els.repeat.checked
          }, common));
          els.usage.textContent = describeUsage(res, els.repeat.checked);
        }
        state.lastText = res.text;
        if (res.text) RVRY.ui.showArt(els.out, res.text);
        else RVRY.ui.showPlaceholder(els.out, els.text.value.trim()
          ? "(no ink — lower the threshold or toggle Invert)"
          : "(enter some text to flow into the image)");
        els.meta.textContent = `${res.cols} × ${res.rows} chars`;
      } catch (e) {
        // No current art: clear what the copy / TXT / MD / HTML exports read so
        // none of them can return the previous image's output.
        state.sample = null;
        state.lastText = "";
        RVRY.ui.showPlaceholder(els.out, "Could not render this image.");
        els.meta.textContent = "—";
        els.usage.textContent = "—";
        showError(e.message);
      }
    }
    const rerender = RVRY.ui.rafThrottle(render);

    function setImage(img, name) {
      state.original = img; state.source = img; state.crop = null; state.dirty = true;
      els.drop.querySelector("strong").textContent = name;
      if (els.crop) els.crop.disabled = false;
      RVRY.drawThumb(els.thumb, state.source, 160);
      updateCropLabel();
      render();
    }
    function updateCropLabel() {
      if (els.crop) els.crop.textContent = state.crop ? "✂ Edit crop" : "✂ Crop";
    }

    async function setFile(file) {
      showError("");
      try { setImage(await RVRY.loadImageFile(file), file.name); }
      catch (e) { showError(e.message); }
    }

    /* image source */
    els.drop.addEventListener("click", () => els.file.click());
    els.file.addEventListener("change", (e) => {
      if (e.target.files[0]) setFile(e.target.files[0]);
      e.target.value = ""; // allow re-selecting the same file
    });
    RVRY.wireDropzone(els.drop, (files) => { if (files[0]) setFile(files[0]); });
    RVRY.registerPaste("obfuscate", setFile);
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
        }, () => {
          state.source = state.original; state.crop = null; state.dirty = true;
          RVRY.drawThumb(els.thumb, state.source, 160);
          updateCropLabel(); render();
        });
      });
    }

    /* code text + language mode */
    els.text.addEventListener("input", rerender);
    els.repeat.addEventListener("change", rerender);

    /* This mode reflows the text verbatim, so the shape is readable — but it
       splits on whitespace and separates tokens with spaces AND LINE BREAKS,
       and that is not safe for real source in general:
         - JavaScript has automatic semicolon insertion, so a line break landing
           after `return` / `throw` / `break` / `continue` / `yield` silently
           changes the program. The old sample here reflowed to
           "function fib(n){ return \n n < 2 ? …" and quietly returned undefined.
         - a line comment (// or #) swallows every token placed after it on the
           same output row;
         - a string literal containing a space is split across two tokens and a
           line break can land between them, leaving it unterminated.
       Use the Python mode when the program has to RUN; this mode is for making
       text into a shape. */
    const FREE_HINT = "Reflows your text verbatim into the shape — spaces and line breaks are inserted between whitespace-separated tokens. Good for prose and for code you want to be readable. It does NOT guarantee the code still runs: line comments (// #), string literals containing spaces, and JavaScript's automatic semicolon insertion (a break after `return`) will change or break it. Use Python mode for code that must run.";
    const PY_HINT = "Python is wrapped as exec(bytes.fromhex(…).decode()): the program is hex-encoded and the chunks form the shape. It runs unchanged on Python 3 — as long as the whole thing fits the shape.";
    function syncLang(swapSample) {
      const python = els.lang.value === "python";
      els.langHint.textContent = python ? PY_HINT : FREE_HINT;
      els.repeatWrap.classList.toggle("hidden", python);   // repeat is implicit (pad-to-fill)
      els.repeatHint.classList.toggle("hidden", python);
      // swap the demo snippet only if the box still holds the other mode's sample
      if (swapSample) {
        if (python && els.text.value.trim() === SAMPLE_JS) els.text.value = SAMPLE_PY;
        else if (!python && els.text.value.trim() === SAMPLE_PY) els.text.value = SAMPLE_JS;
      }
      render();
    }
    els.lang.addEventListener("change", () => syncLang(true));

    /* ink map + tone (no resample) */
    RVRY.slider(els.threshold, els.thV, 2, rerender);
    els.invert.addEventListener("change", rerender);
    els.alpha.addEventListener("change", () => { state.dirty = true; rerender(); }); // transparency handling is baked into the sample
    RVRY.slider(els.exposure, els.exposureV, 2, rerender);
    RVRY.slider(els.contrast, els.contrastV, 2, rerender);
    RVRY.slider(els.gamma, els.gammaV, 2, rerender);

    /* geometry (resample) */
    RVRY.slider(els.width, els.widthV, 0, () => { state.dirty = true; rerender(); });
    RVRY.slider(els.ratio, els.ratioV, 2, () => { state.dirty = true; rerender(); });
    RVRY.ui.wireRatioFit(els.ratioFit, els.ratio, els.font);

    /* export */
    const paint = () => ({
      font: els.font.value, name: "rvry-codeart", fontSize: +els.fontsize.value,
      bg: els.lightcanvas.checked ? "#ffffff" : "#0a0b0d",
      fg: els.lightcanvas.checked ? "#0a0b0d" : "#e9eaec"
    });
    // The same test exportPng applies, so all five exports agree on what
    // counts as art. Without it Copy toasted "Copied to clipboard" over an
    // empty string, and TXT / MD / HTML downloaded empty documents, while the
    // empty-state message was still on screen. A truthiness test on lastText
    // (not .trim()) keeps all-space art exportable, as exportPng now does.
    const haveArt = () => {
      if (!RVRY.ui.isPlaceholder(els.out) && state.lastText) return true;
      RVRY.ui.toast("Nothing to export yet");
      return false;
    };
    els.copy.addEventListener("click", () => { if (haveArt()) RVRY.ui.copyText(state.lastText); });
    els.txt.addEventListener("click", () => { if (haveArt()) RVRY.ui.exportTxt(state.lastText, "rvry-codeart"); });
    els.md.addEventListener("click", () => { if (haveArt()) RVRY.ui.exportMd(state.lastText, "rvry-codeart"); });
    els.html.addEventListener("click", () => { if (haveArt()) RVRY.ui.exportHtml(state.lastText, paint()); });
    els.png.addEventListener("click", () => RVRY.ui.exportPng(els.out, paint()));

    RVRY.wirePreview(els.font, els.fontsize, els.lightcanvas, els.out, els.stage);
    RVRY.wireZoom(els.out, els.stage, els.fontsize, { fit: els.zoomFit, inc: els.zoomIn, dec: els.zoomOut });
    syncLang(false); // sets hints/visibility for the current mode and renders
  }

  RVRY.initObfuscateTab = init;
})(window);
