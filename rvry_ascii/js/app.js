/* =====================================================================
   RVRY_ASCII — app shell: shared control helpers, tabs, theme, boot.
   ===================================================================== */
(function (global) {
  "use strict";
  const RVRY = global.RVRY;
  const $ = (id) => document.getElementById(id);

  /* ---------- shared control helpers (used by every tab) ---------- */

  RVRY.fillGlyphSelect = function (select, defaultKey) {
    select.innerHTML = "";
    for (const key in RVRY.GLYPH_PRESETS) {
      const o = document.createElement("option");
      o.value = key; o.textContent = RVRY.GLYPH_PRESETS[key].label;
      select.appendChild(o);
    }
    if (defaultKey) select.value = defaultKey;
  };

  RVRY.fillDitherSelect = function (select, defaultKey) {
    select.innerHTML = "";
    for (const key in RVRY.DITHER) {
      const o = document.createElement("option");
      o.value = key; o.textContent = RVRY.DITHER[key];
      select.appendChild(o);
    }
    if (defaultKey) select.value = defaultKey;
  };

  /* ---------- clipboard paste (Ctrl+V a screenshot / copied image) ----------
     Each tab registers a handler; a pasted file goes to the active tab.
     Plain-text pastes (no files) are never intercepted. */
  const pasteTargets = {};
  RVRY.registerPaste = function (tabName, fn) { pasteTargets[tabName] = fn; };
  function initPaste() {
    document.addEventListener("paste", (e) => {
      const files = e.clipboardData && e.clipboardData.files;
      if (!files || !files.length) return;
      const active = document.querySelector(".tab-btn.active");
      const fn = active && pasteTargets[active.dataset.tab];
      if (!fn) return;
      e.preventDefault();
      RVRY.ui.toast("Pasted " + (files[0].name || "file"));
      fn(files[0]);
    });
  }

  RVRY.wireDropzone = function (el, cb) {
    ["dragenter", "dragover"].forEach((ev) =>
      el.addEventListener(ev, (e) => { e.preventDefault(); el.classList.add("drag"); }));
    ["dragleave", "dragend", "drop"].forEach((ev) =>
      el.addEventListener(ev, (e) => { e.preventDefault(); el.classList.remove("drag"); }));
    el.addEventListener("drop", (e) => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) cb(files);
    });
  };

  // single range with an editable value readout.
  //  - double-click the slider  -> reset to its default (initial) value
  //  - click the value indicator -> type an exact number
  //  - optional unit suffix via valSpan.dataset.suffix (e.g. "×")
  RVRY.slider = function (range, valSpan, decimals, onchange) {
    decimals = decimals || 0;
    const suffix = (valSpan && valSpan.dataset.suffix) || "";
    const fmt = (v) => (+v).toFixed(decimals) + suffix;
    // reset target = the HTML-authored default (attribute), not the current
    // value — so it survives persisted-settings restore that changes .value.
    const def = range.defaultValue;
    const clampVal = (v) => {
      const min = +range.min, max = +range.max;
      return v < min ? min : v > max ? max : v;
    };
    const paint = () => { if (valSpan) valSpan.textContent = fmt(range.value); };
    const fire = () => { paint(); onchange(+range.value); };
    paint();

    range.addEventListener("input", fire);
    // Double-tap / double-click a slider -> reset to its HTML default.
    // Pointer-based so it works on touch too (dblclick doesn't fire on touch);
    // a drag is rejected so only genuine taps in place count.
    const reset = () => { range.value = def; fire(); };
    let lastTap = 0, downX = 0, downY = 0, moved = false;
    range.addEventListener("pointerdown", (e) => { downX = e.clientX; downY = e.clientY; moved = false; });
    range.addEventListener("pointermove", (e) => {
      if (Math.abs(e.clientX - downX) > 8 || Math.abs(e.clientY - downY) > 8) moved = true;
    });
    range.addEventListener("pointerup", () => {
      if (moved) { lastTap = 0; return; }
      const now = Date.now();
      if (now - lastTap < 350) { reset(); lastTap = 0; }
      else lastTap = now;
    });

    if (valSpan) {
      valSpan.classList.add("editable");
      valSpan.title = "Click to type a value";
      valSpan.addEventListener("click", () => beginEdit());
    }

    let editing = false;
    function beginEdit() {
      if (editing) return;
      editing = true;
      const inp = document.createElement("input");
      inp.type = "text";
      inp.className = "val-edit";
      inp.value = (+range.value).toFixed(decimals);
      inp.setAttribute("inputmode", "decimal");
      valSpan.textContent = "";
      valSpan.appendChild(inp);
      inp.focus(); inp.select();
      let closed = false;
      const finish = (apply) => {
        if (closed) return; closed = true; editing = false;
        if (apply) {
          const v = parseFloat(inp.value);
          if (isFinite(v)) range.value = clampVal(v);
        }
        fire();                              // rebuilds the span text + notifies
      };
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); finish(true); }
        else if (e.key === "Escape") { e.preventDefault(); finish(false); }
      });
      inp.addEventListener("blur", () => finish(true));
    }
  };

  // font / size / light-canvas wiring for a preview <pre>.
  // The <pre> stays hidden as the text source of truth (exports, fit zoom and
  // Copy read it); what's shown is a canvas repainted with the exact glyph
  // grid the PNG export uses, so preview and export can never disagree.
  RVRY.wirePreview = function (fontSelect, sizeRange, lightCheck, preEl, stageEl) {
    const canvas = document.createElement("canvas");
    canvas.className = "ascii-canvas";
    preEl.classList.add("has-canvas");
    preEl.after(canvas);

    const repaint = RVRY.ui.rafThrottle(() => {
      RVRY.ui.paintPreview(preEl, canvas, {
        font: fontSelect.value,
        fontSize: +sizeRange.value,
        // tracks --preview-ink, light-canvas and the site theme toggle
        fg: getComputedStyle(preEl).color
      });
    });

    const applyFont = () => { preEl.style.fontFamily = fontSelect.value; repaint(); };
    const applySize = () => { preEl.style.fontSize = sizeRange.value + "px"; repaint(); };
    const applyLight = () => {
      if (lightCheck) stageEl.classList.toggle("light-canvas", lightCheck.checked);
      repaint();
    };
    fontSelect.addEventListener("change", applyFont);
    sizeRange.addEventListener("input", applySize);
    if (lightCheck) lightCheck.addEventListener("change", applyLight);

    // repaint on: any output write (textContent / per-frame innerHTML),
    // site theme flips (ink color changes), and late webfont arrival
    // (metrics measured before HaraldMono loads would stay stale).
    new MutationObserver(repaint).observe(preEl, { childList: true, characterData: true, subtree: true });
    new MutationObserver(repaint).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    if (document.fonts) {
      document.fonts.addEventListener("loadingdone", repaint);
      document.fonts.ready.then(repaint).catch(() => {});
    }
    applyFont(); applySize(); applyLight();
  };

  // small source-image preview
  RVRY.drawThumb = function (canvas, source, maxW) {
    if (!canvas) return;
    const sw = source.naturalWidth || source.width;
    const sh = source.naturalHeight || source.height;
    if (!sw || !sh) return;
    const m = maxW || 160;
    const scale = Math.min(1, m / sw);
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
    canvas.classList.remove("hidden");
  };

  // fit-to-width + step zoom for a preview <pre>. Shares the size slider so the
  // value stays the single source of truth (and persists).
  const _measure = document.createElement("canvas").getContext("2d");
  RVRY.wireZoom = function (preEl, stageEl, sizeRange, btns) {
    const fit = () => {
      const text = preEl.textContent || "";
      let cols = 1;
      for (const line of text.split("\n")) if (line.length > cols) cols = line.length;
      // char-width : font-size ratio for the current monospace face
      _measure.font = "100px " + (preEl.style.fontFamily || "monospace");
      const ratio = _measure.measureText("M").width / 100 || 0.6;
      const avail = stageEl.clientWidth - 32; // stage padding (1rem each side)
      let px = Math.floor(avail / (cols * ratio));
      px = Math.max(+sizeRange.min, Math.min(+sizeRange.max, px));
      sizeRange.value = px;
      sizeRange.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const step = (d) => {
      let px = +sizeRange.value + d;
      px = Math.max(+sizeRange.min, Math.min(+sizeRange.max, px));
      sizeRange.value = px;
      sizeRange.dispatchEvent(new Event("input", { bubbles: true }));
    };
    if (btns.fit) btns.fit.addEventListener("click", fit);
    if (btns.inc) btns.inc.addEventListener("click", () => step(1));
    if (btns.dec) btns.dec.addEventListener("click", () => step(-1));
  };

  /* ---------- settings persistence ---------- */
  RVRY.persist = (function () {
    const KEY = "rvry-settings";
    const settable = (el) =>
      el.id && (el.tagName === "SELECT" || el.tagName === "TEXTAREA" ||
        (el.tagName === "INPUT" && el.type !== "file" && el.type !== "button"));

    function serialize() {
      const out = {};
      document.querySelectorAll("input, select, textarea").forEach((el) => {
        if (!settable(el)) return;
        out[el.id] = el.type === "checkbox" ? el.checked : el.value;
      });
      return out;
    }
    function save() {
      try { localStorage.setItem(KEY, JSON.stringify(serialize())); } catch (e) {}
    }
    // Apply saved values and fire the matching event so existing handlers run.
    function restore() {
      let data;
      try { data = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { data = null; }
      if (!data) return;
      for (const id in data) {
        const el = document.getElementById(id);
        if (!el || !settable(el)) continue;
        if (el.type === "checkbox") {
          el.checked = !!data[id];
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          const prev = el.value;
          el.value = data[id];
          if (el.tagName === "SELECT" && el.value !== String(data[id])) {
            el.value = prev; // option gone — keep the default instead of a blank select
            continue;
          }
          const ev = el.tagName === "SELECT" ? "change" : "input";
          el.dispatchEvent(new Event(ev, { bubbles: true }));
        }
      }
    }
    // Re-apply one saved value whose <option> appeared after restore() ran
    // (e.g. installed fonts arriving async). Skipped if the user has already
    // moved the select off its default — their choice wins.
    function reapply(id) {
      let data;
      try { data = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { data = null; }
      if (!data || !(id in data)) return;
      const el = document.getElementById(id);
      if (!el) return;
      const want = String(data[id]);
      if (el.value === want) return;
      if (el.selectedIndex > 0) return; // user-picked value — leave it
      el.value = want;
      if (el.value === want) el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    function watch() {
      const debounced = RVRY.ui.debounce(save, 250);
      document.addEventListener("input", debounced, true);
      document.addEventListener("change", debounced, true);
    }
    return { serialize, save, restore, reapply, watch };
  })();

  /* ---------- tabs ---------- */
  function initTabs() {
    const buttons = document.querySelectorAll(".tab-btn");
    const panels = { image: $("tab-image"), text: $("tab-text"), obfuscate: $("tab-obfuscate"), player: $("tab-player") };
    const exportGroups = document.querySelectorAll(".export-group");
    const activate = (name, persist) => {
      buttons.forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
      for (const k in panels) panels[k].classList.toggle("active", k === name);
      // show only the active tab's header export buttons
      exportGroups.forEach((g) => g.classList.toggle("hidden", g.dataset.tab !== name));
      if (persist) { try { localStorage.setItem("rvry-tab", name); } catch (e) {} }
    };
    buttons.forEach((btn) => btn.addEventListener("click", () => activate(btn.dataset.tab, true)));
    const saved = (() => { try { return localStorage.getItem("rvry-tab"); } catch (e) { return null; } })();
    if (saved && panels[saved]) activate(saved, false);
  }

  /* ---------- theme ---------- */
  function initTheme() {
    const btn = $("theme-toggle");
    const track = btn.querySelector(".tt-track");
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const current = () =>
      document.documentElement.getAttribute("data-theme") || (mq.matches ? "dark" : "light");
    // slide the knob + keep the button title in sync
    const paint = () => {
      const t = current();
      if (track) {
        track.classList.toggle("tt-dark", t === "dark");
        track.classList.toggle("tt-light", t === "light");
      }
      btn.title = "Switch to " + (t === "dark" ? "light" : "dark") + " mode";
    };
    const stored = localStorage.getItem("rvry-theme");
    if (stored) document.documentElement.setAttribute("data-theme", stored);
    btn.addEventListener("click", () => {
      const next = current() === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("rvry-theme", next);
      paint();
    });
    if (mq.addEventListener) mq.addEventListener("change", paint);
    paint();
  }

  /* ---------- fonts ---------- */
  function initFonts() {
    // txt-srcfont is the banner *lettering* font; the rest style previews
    const selects = ["img-font", "obf-font", "ply-font", "txt-font", "txt-srcfont"].map($);
    selects.forEach((s) => s && RVRY.ui.populateFontSelect(s));
    // Local Font Access API (Chromium, requires user gesture + permission).
    // Offer via the theme toolbar? Simpler: try silently; ignore rejection.
    // When the installed fonts arrive, a saved font choice that pointed at
    // one of them can finally be restored.
    selects.forEach((s) => s && RVRY.ui.loadSystemFonts(s)
      .then((added) => { if (added) RVRY.persist.reapply(s.id); })
      .catch(() => {}));
  }

  /* ---------- boot ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initTabs();
    initPaste();
    initFonts();            // populate select options first…
    RVRY.initImageTab();    // …then wire each tab (fills preset/dither options)…
    RVRY.initTextTab();
    RVRY.initObfuscateTab();
    RVRY.initPlayerTab();
    RVRY.persist.restore(); // …then apply saved values (options now exist) + re-render
    RVRY.persist.watch();
  });
})(window);
