/* =====================================================================
   RVRY_ASCII — ANSI / Video player tab
   - Video  -> ANSI/ASCII frame sequence (color optional)
   - .ans / .txt -> parsed frames (basic SGR color support)
   - Transport: play/pause, step, first/last, seek, loop, fps, speed
   ===================================================================== */
(function (global) {
  "use strict";
  const RVRY = global.RVRY;
  const $ = (id) => document.getElementById(id);

  // Limits used for the "too large" warning + safety caps
  const WARN_PIXELS = 1280 * 720;
  const WARN_BYTES = 60 * 1024 * 1024;
  // Decoded GIF frames are full W×H RGBA buffers; cap their total size so a
  // large, long GIF can't exhaust memory before conversion even starts.
  const MAX_GIF_BYTES = 384 * 1024 * 1024;

  /* ---------- how many frames fit ----------
     Frames are held as {html, text} strings, and their cost varies by two
     orders of magnitude with the settings: a 100-column mono frame is ~12 KB,
     a 220-column color one ~280 KB. A flat frame count therefore has to be
     set for the worst case, which is why this used to stop at 900 frames
     (75s at the default capture rate) even for a cheap mono clip with ~25x
     the headroom to spare. Budget the total bytes instead and derive the
     count from a real measured frame, the way loadGif already budgets
     decoded GIF pixels. */
  const FRAME_BUDGET_BYTES = 320 * 1024 * 1024;
  const MAX_FRAMES_CEILING = 20000;  // absolute stop, so a tiny frame can't run away
  const MIN_FRAMES = 60;             // always allow a usable minimum
  const FALLBACK_FRAMES = 900;       // when frame 0 can't be measured

  // UTF-16 code units, plus rough per-frame object/allocation overhead
  function frameCost(f) {
    return f ? (f.html.length + f.text.length) * 2 + 96 : 0;
  }
  // "(≈120 KB per frame)" — omitted when frame 0 could not be sampled
  function costNote(f) {
    return f ? ` (≈${(frameCost(f) / 1024).toFixed(0)} KB per frame at these settings)` : "";
  }
  function framesThatFit(sample) {
    if (!sample) return FALLBACK_FRAMES;
    return Math.max(MIN_FRAMES, Math.min(MAX_FRAMES_CEILING,
      Math.floor(FRAME_BUDGET_BYTES / Math.max(1, frameCost(sample)))));
  }

  /* ---------- ANSI (SGR) -> HTML ---------- */
  const ANSI_16 = [
    "#000000", "#c0392b", "#27ae60", "#d9a406", "#2d6fd6", "#8e44ad", "#16a085", "#bdc3c7",
    "#7f8c8d", "#e74c3c", "#2ecc71", "#f1c40f", "#5b8def", "#9b59b6", "#1abc9c", "#ffffff"
  ];
  function xterm256(n) {
    if (n < 16) return ANSI_16[n];
    if (n < 232) {
      n -= 16;
      const r = Math.floor(n / 36), g = Math.floor((n % 36) / 6), b = n % 6;
      const c = (v) => (v ? v * 40 + 55 : 0);
      return `rgb(${c(r)},${c(g)},${c(b)})`;
    }
    const v = (n - 232) * 10 + 8;
    return `rgb(${v},${v},${v})`;
  }
  function ansiToHtml(text) {
    // fgIdx = base color 0-7 (bold promotes it to the bright variant at render
    // time, so ESC[31m ESC[1m brightens); fg = explicit color (256 / truecolor)
    let fg = null, fgIdx = null, bold = false, open = false, openColor = null, html = "";
    const esc = RVRY.escapeHtml;
    const flushOpen = () => { if (open) { html += "</span>"; open = false; } };
    const applyStyle = () => {
      const color = fg != null ? fg
        : fgIdx != null ? ANSI_16[fgIdx + (bold ? 8 : 0)] : null;
      if (color === openColor) return; // unchanged — keep the current span
      flushOpen();
      if (color) { html += `<span style="color:${color}">`; open = true; }
      openColor = color;
    };
    const re = /\x1b\[([0-9;]*)m/g;
    let last = 0, m;
    const emit = (s) => { html += esc(s); };
    while ((m = re.exec(text)) !== null) {
      emit(text.slice(last, m.index));
      last = re.lastIndex;
      const codes = m[1].split(";").map((x) => (x === "" ? 0 : parseInt(x, 10)));
      for (let i = 0; i < codes.length; i++) {
        const c = codes[i];
        if (c === 0) { fg = null; fgIdx = null; bold = false; }
        else if (c === 1) bold = true;
        else if (c === 22) bold = false;
        else if (c >= 30 && c <= 37) { fgIdx = c - 30; fg = null; }
        else if (c >= 90 && c <= 97) { fg = ANSI_16[c - 90 + 8]; fgIdx = null; }
        else if (c === 39) { fg = null; fgIdx = null; }
        else if (c === 38) {
          fgIdx = null;
          if (codes[i + 1] === 5) { fg = xterm256(codes[i + 2] || 0); i += 2; }
          else if (codes[i + 1] === 2) { fg = `rgb(${codes[i+2]||0},${codes[i+3]||0},${codes[i+4]||0})`; i += 4; }
        }
        else if (c === 48 || c === 58) {
          // background / underline color: not rendered, but the arguments
          // must be consumed so they aren't misread as standalone codes
          if (codes[i + 1] === 5) i += 2;
          else if (codes[i + 1] === 2) i += 4;
        }
      }
      applyStyle();
    }
    emit(text.slice(last));
    flushOpen();
    return html;
  }
  /* Drop every escape sequence except real SGR (ESC[…m), which is the only
     one we render. Cursor moves, erases and private modes (ESC[?25l) would
     otherwise survive ansiToHtml() as literal text — visible as "[5A" in the
     preview and in the PNG/GIF/.ans exports, while stripAnsi() removed them
     from .text. Applied once in parseAnsiFile so both views are always built
     from identical input and cannot drift apart. */
  function stripNonSgr(text) {
    return text
      .replace(/\x1b\[([0-9;?]*)([A-Za-z])/g,
        (seq, params, final) => (final === "m" && params.indexOf("?") < 0 ? seq : ""))
      .replace(/\x1b[()][A-Za-z0-9]/g, "");
  }
  // strip all escape sequences -> plain text
  function stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\x1b[()][A-Za-z0-9]/g, "");
  }
  function parseAnsiFile(text) {
    // Split into frames on clear-screen / form-feed markers.
    const parts = text.split(/\x1b\[2J|\x0c/);
    const frames = [];
    for (const p of parts) {
      // drop cursor-home at frame start, keep content, then remove every
      // non-SGR sequence so html and text below agree by construction
      const cleaned = stripNonSgr(p.replace(/^\s*\x1b\[[0-9;]*H/, ""));
      const plain = stripAnsi(cleaned);
      // Skip only the fragments a separator leaves behind — the empty string
      // before a leading marker, after a trailing one, or between two in a row.
      // Those hold no cells at all, so `plain` is exactly "". A frame that is
      // merely BLANK still holds its rows of spaces: every ramp starts with " ",
      // so a fully dark frame (a fade-to-black, a held pause) renders as spaces.
      // Testing .trim() here dropped those too, silently changing frame count
      // and timing on every .ans / .txt export-and-reload round trip.
      if (plain === "") continue;
      frames.push({ html: ansiToHtml(cleaned), text: plain });
    }
    if (!frames.length) {
      const cleaned = stripNonSgr(text);
      frames.push({ html: ansiToHtml(cleaned), text: stripAnsi(cleaned) });
    }
    return frames;
  }

  /* ---------- frames -> ANSI (.ans export) ----------
     Frame html only ever contains <span style="color:…">…</span> runs and
     escaped text (both our generator and ansiToHtml emit exactly that), so a
     regex walk converts it back to truecolor SGR sequences. The result
     round-trips through parseAnsiFile above. */
  function sgrColor(c) {
    let m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(c);
    if (m) return `38;2;${m[1]};${m[2]};${m[3]}`;
    m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
    if (m) {
      let h = m[1];
      if (h.length === 3) h = h.replace(/./g, (ch) => ch + ch);
      const v = parseInt(h, 16);
      return `38;2;${v >> 16};${(v >> 8) & 255};${v & 255}`;
    }
    return "";
  }
  function unescapeHtml(s) {
    return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  }
  function htmlToAnsi(html) {
    let out = "", cur = "";
    const put = (txt, sgr) => {
      if (!txt) return;
      if (sgr !== cur) { out += sgr ? "\x1b[" + sgr + "m" : "\x1b[0m"; cur = sgr; }
      out += unescapeHtml(txt);
    };
    const re = /<span style="color:([^"]+)">([\s\S]*?)<\/span>/g;
    let last = 0, m;
    while ((m = re.exec(html)) !== null) {
      put(html.slice(last, m.index), "");
      put(m[2], sgrColor(m[1]));
      last = re.lastIndex;
    }
    put(html.slice(last), "");
    if (cur) out += "\x1b[0m";
    return out;
  }
  /* One chunk per frame rather than one concatenated string. A long color
     animation can exceed the engine's maximum string length (~536M chars in
     V8) — and gets there sooner than that figure suggests, because building
     the string keeps transient copies alive. Blob accepts the parts array
     directly and never joins them, so the download path has no string
     ceiling at all; framesToAnsi keeps returning a string for callers that
     want one. */
  function framesToAnsiParts(frames) {
    const parts = [];
    for (let i = 0; i < frames.length; i++) {
      parts.push("\x1b[2J\x1b[H", htmlToAnsi(frames[i].html));
    }
    return parts;
  }
  function framesToAnsi(frames) {
    return framesToAnsiParts(frames).join("");
  }
  /* ---------- frames -> standalone HTML player ----------
     One self-contained file: frames embedded as JSON, minimal transport
     (click / space toggles play). Opens anywhere a browser exists. */
  function buildAnimHtmlParts(frames, opts) {
    opts = opts || {};
    const fps = Math.max(1, Math.min(60, +opts.fps || 12));
    const loop = opts.loop !== false;
    const font = opts.font || "monospace";
    const size = +opts.fontSize || 8;
    const head = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RVRY_ASCII animation</title>
<style>
  html,body{margin:0;min-height:100vh;background:#08090b;color:#e9eaec;}
  body{display:grid;place-items:center;}
  pre{margin:0;padding:1.5rem;font-family:${font};font-size:${size}px;
      line-height:1;white-space:pre;letter-spacing:0;}
  #hud{position:fixed;left:.75rem;bottom:.5rem;font:12px system-ui,sans-serif;
       opacity:.55;user-select:none;}
</style></head>
<body><pre id="s"></pre><div id="hud"></div>
<script>
var F=`;
    const tail = `,FPS=${fps},LOOP=${loop},i=0,on=F.length>1;
var s=document.getElementById("s"),h=document.getElementById("hud");
function show(n){i=((n%F.length)+F.length)%F.length;s.innerHTML=F[i];
  h.textContent=(i+1)+" / "+F.length+(on?"":" — paused (click or space)");}
setInterval(function(){if(!on)return;
  if(!LOOP&&i===F.length-1){on=false;show(i);return;}show(i+1);},1000/FPS);
function toggle(){if(F.length<2)return;on=!on;show(i);}
document.addEventListener("click",toggle);
document.addEventListener("keydown",function(e){if(e.key===" "){e.preventDefault();toggle();}});
show(0);
</script></body></html>`;
    /* Escape per frame instead of over the whole payload. The structural JSON
       characters ([ ] , ") are never <, U+2028 or U+2029, so escaping each
       element gives byte-identical output to escaping the joined array — but
       without holding three transient copies of the entire animation, which
       is what put a hard ceiling on this export. */
    const enc = (h) => JSON.stringify(h)
      .replace(/</g, "\\u003c")           // no </script> breakout
      .replace(/\u2028/g, "\\u2028") // JSON leaves U+2028/29 raw; invalid in JS source
      .replace(/\u2029/g, "\\u2029");
    const parts = [head, "["];
    for (let i = 0; i < frames.length; i++) {
      if (i) parts.push(",");
      parts.push(enc(frames[i].html));
    }
    parts.push("]", tail);
    return parts;
  }
  function buildAnimHtml(frames, opts) {
    return buildAnimHtmlParts(frames, opts).join("");
  }

  // exposed for reuse/testing (pure string transforms)
  RVRY.parseAnsiFile = parseAnsiFile;
  RVRY.framesToAnsi = framesToAnsi;
  RVRY.framesToAnsiParts = framesToAnsiParts;
  RVRY.buildAnimHtml = buildAnimHtml;
  RVRY.buildAnimHtmlParts = buildAnimHtmlParts;

  function init() {
    const els = {
      drop: $("ply-drop"), file: $("ply-file"),
      warn: $("ply-warn"), error: $("ply-error"), info: $("ply-info"),
      videoPanel: $("ply-video-panel"),
      width: $("ply-width"), widthV: $("ply-width-v"),
      ratio: $("ply-ratio"), ratioV: $("ply-ratio-v"), ratioFit: $("ply-ratio-fit"),
      capfps: $("ply-capfps"), capfpsV: $("ply-capfps-v"), capfpsWrap: $("ply-capfps-wrap"),
      trimWrap: $("ply-trim-wrap"), trimIn: $("ply-trim-in"), trimOut: $("ply-trim-out"),
      trimV: $("ply-trim-v"), trimHint: $("ply-trim-hint"),
      preset: $("ply-preset"), color: $("ply-color"), invert: $("ply-invert"),
      custom: $("ply-custom"), customWrap: $("ply-custom-wrap"),
      generate: $("ply-generate"), progress: $("ply-progress"),
      fps: $("ply-fps"), fpsV: $("ply-fps-v"),
      speed: $("ply-speed"), speedV: $("ply-speed-v"), loop: $("ply-loop"),
      copy: $("ply-copy"), png: $("ply-png"), txt: $("ply-txt"),
      ans: $("ply-ans"), animTxt: $("ply-anim-txt"), animHtml: $("ply-anim-html"),
      gif: $("ply-gif"),
      zoomOut: $("ply-zoom-out"), zoomFit: $("ply-zoom-fit"), zoomIn: $("ply-zoom-in"),
      font: $("ply-font"), fontsize: $("ply-fontsize"), stage: $("ply-stage"),
      out: $("ply-out"), meta: $("ply-meta"),
      first: $("ply-first"), stepback: $("ply-stepback"), play: $("ply-play"),
      stepfwd: $("ply-stepfwd"), last: $("ply-last"),
      seek: $("ply-seek"), counter: $("ply-counter"),
      video: $("ply-video")
    };

    /* The "Custom string…" preset needs a field to type the ramp into; its
       entry in GLYPH_PRESETS is only a placeholder. This control's markup lives
       in three page copies and only two are generated, so offer the preset when
       the field is actually there and fall back to preset-only when a copy lags
       behind — the same degradation the trim controls use. */
    const hasCustom = !!(els.custom && els.customWrap);
    RVRY.fillGlyphSelect(els.preset, "detailed", { allowCustom: hasCustom });
    const syncCustom = () => {
      if (hasCustom) els.customWrap.classList.toggle("hidden", els.preset.value !== "custom");
    };
    els.preset.addEventListener("change", syncCustom);
    syncCustom();

    const state = {
      frames: [],        // [{html, text}]
      index: 0,
      playing: false,
      timer: null,
      videoReady: false,
      videoUrl: null,
      mode: null,        // "video" | "gif" — which source Generate converts
      gif: null,         // decoded GIF { width, height, frames, truncated }
      generating: false  // a Generate run is in flight (button acts as Stop)
    };

    function setAlert(el, msg) {
      if (!msg) { el.classList.remove("show"); return; }
      el.textContent = msg; el.classList.add("show");
    }

    /* ---- generation run state ----
       Long clips can take minutes of seek-decode, so Generate doubles as the
       stop control while a run is in flight rather than sitting disabled.
       Frames captured before a stop are kept and loaded. */
    let genAbort = false;
    const GEN_LABEL = els.generate.textContent;
    function setGenerating(on) {
      state.generating = on;
      if (on) genAbort = false;
      els.generate.textContent = on ? "Stop" : GEN_LABEL;
      // reuse the existing ghost style rather than adding a CSS class
      els.generate.classList.toggle("primary", !on);
      els.generate.classList.toggle("ghost", on);
    }

    /* ---- trim range ----
       The point of a raised frame ceiling is usually a SECTION of a long
       clip, not all of it. The two sliders span the video's duration; they
       are kept at least one capture interval apart so a run always has at
       least one frame, and they reset to the full clip on every new file. */
    /* The page markup and this script live in separate files, and copies of
       the page exist under notebook_pages/ and input_custom_html_pages/. If
       one of them lags behind, the trim controls simply will not be there —
       so every trim path degrades to "whole clip" instead of throwing and
       taking the entire player tab down with it. */
    const hasTrim = !!(els.trimWrap && els.trimIn && els.trimOut && els.trimV && els.trimHint);
    const MIN_SPAN = 0.05;
    // largest value a range input can actually hold: min + n*step, <= max
    function gridMax(el, fallback) {
      const mn = +el.min || 0, st = +el.step || 1, mx = +el.max || fallback;
      if (!(st > 0)) return mx;
      return mn + Math.floor((mx - mn) / st + 1e-9) * st;
    }
    function fmtTime(t) {
      if (!isFinite(t)) return "?";
      const m = Math.floor(t / 60), sec = t - m * 60;
      return `${m}:${(sec < 10 ? "0" : "")}${sec.toFixed(1)}`;
    }
    // the selected [in, out) window, clamped and ordered
    function trimRange() {
      const dur = isFinite(els.video.duration) ? els.video.duration : 0;
      if (!dur) return { t0: 0, t1: 0, span: 0, dur: 0, full: true };
      if (!hasTrim) return { t0: 0, t1: dur, span: dur, dur, full: true };
      let t0 = Math.max(0, Math.min(dur, +els.trimIn.value || 0));
      let t1 = Math.max(0, Math.min(dur, +els.trimOut.value || 0));
      if (t1 < t0) { const tmp = t0; t0 = t1; t1 = tmp; }
      // A range input clamps its VALUE to the step grid, so the handle at its
      // far right reads back as the largest grid point at or below max — up
      // to a whole step short of the real duration. Compare against that grid
      // point, not max, or "untouched sliders" never registers as the whole
      // clip and the tail is quietly dropped.
      if (t1 >= gridMax(els.trimOut, dur) - 1e-6) t1 = dur;
      if (t0 <= (+els.trimIn.min || 0) + 1e-6) t0 = 0;
      if (t1 - t0 < MIN_SPAN) t1 = Math.min(dur, t0 + MIN_SPAN);
      return { t0, t1, span: t1 - t0, dur, full: t0 <= 0 && t1 >= dur - 1e-6 };
    }
    function resetTrim(dur) {
      if (!hasTrim) return;
      const usable = isFinite(dur) && dur > 0;
      els.trimWrap.classList.toggle("hidden", !usable);
      if (!usable) return;
      for (const el of [els.trimIn, els.trimOut]) {
        el.min = 0; el.max = dur;
        el.step = dur > 600 ? 0.5 : dur > 60 ? 0.1 : 0.01;
      }
      els.trimIn.value = 0; els.trimOut.value = dur;
      refreshTrim();
    }
    function refreshTrim() {
      if (!hasTrim) return;
      const r = trimRange();
      if (!r.dur) { els.trimV.textContent = "whole clip"; return; }
      els.trimV.textContent = r.full
        ? `whole clip (${fmtTime(r.dur)})`
        : `${fmtTime(r.t0)} → ${fmtTime(r.t1)}  (${r.span.toFixed(1)}s)`;
      const capfps = Math.max(1, +els.capfps.value);
      const n = Math.max(1, Math.floor(r.span * capfps));
      els.trimHint.textContent =
        `≈${n} frame${n === 1 ? "" : "s"} at ${capfps} fps capture.` +
        (r.full ? " Drag to convert only part of the clip." : "");
    }
    // keep the handles from crossing, then repaint the readout
    if (hasTrim) {
      els.trimIn.addEventListener("input", () => {
        if (+els.trimIn.value > +els.trimOut.value) els.trimOut.value = els.trimIn.value;
        refreshTrim();
      });
      els.trimOut.addEventListener("input", () => {
        if (+els.trimOut.value < +els.trimIn.value) els.trimIn.value = els.trimOut.value;
        refreshTrim();
      });
      els.capfps.addEventListener("input", refreshTrim);
    }

    /* ---- frame display ---- */
    function showFrame(i) {
      if (!state.frames.length) return;
      state.index = ((i % state.frames.length) + state.frames.length) % state.frames.length;
      const f = state.frames[state.index];
      RVRY.ui.showArtHtml(els.out, f.html);
      els.seek.value = state.index;
      els.counter.textContent = `${state.index + 1} / ${state.frames.length}`;
    }
    function setFrames(frames) {
      stop();
      state.frames = frames;
      state.index = 0;
      els.seek.max = Math.max(0, frames.length - 1);
      els.seek.value = 0;
      els.meta.textContent = `${frames.length} frame${frames.length === 1 ? "" : "s"}`;
      if (frames.length) showFrame(0);
      else RVRY.ui.showPlaceholder(els.out, "No frames.");
    }

    /* ---- transport ---- */
    function frameDelay() {
      const fps = Math.max(1, +els.fps.value);
      const speed = Math.max(0.1, +els.speed.value);
      return 1000 / (fps * speed);
    }
    function tick() {
      if (!state.playing) return;
      let next = state.index + 1;
      if (next >= state.frames.length) {
        if (els.loop.checked) next = 0;
        else { stop(); return; }
      }
      showFrame(next);
      state.timer = setTimeout(tick, frameDelay());
    }
    function play() {
      if (state.frames.length < 2) return;
      state.playing = true; els.play.classList.add("playing");
      state.timer = setTimeout(tick, frameDelay());
    }
    function stop() {
      state.playing = false; els.play.classList.remove("playing");
      if (state.timer) { clearTimeout(state.timer); state.timer = null; }
    }
    function toggle() { state.playing ? stop() : play(); }

    els.play.addEventListener("click", toggle);
    els.first.addEventListener("click", () => { stop(); showFrame(0); });
    els.last.addEventListener("click", () => { stop(); showFrame(state.frames.length - 1); });
    els.stepfwd.addEventListener("click", () => { stop(); showFrame(state.index + 1); });
    els.stepback.addEventListener("click", () => { stop(); showFrame(state.index - 1); });
    els.seek.addEventListener("input", () => { stop(); showFrame(+els.seek.value); });
    RVRY.slider(els.fps, els.fpsV, 0, () => {});
    RVRY.slider(els.speed, els.speedV, 2, () => {});

    // free the previous clip's blob URL when the video stops being the source
    function dropVideo() {
      state.videoReady = false;
      if (state.videoUrl) {
        URL.revokeObjectURL(state.videoUrl);
        state.videoUrl = null;
        els.video.removeAttribute("src");
        els.video.load();
      }
    }

    /* ---- file loading ---- */
    /* Anything that is not a video or a GIF is read as ANSI/text frames, and
       neither the drop nor the paste path enforces the file input's accept
       list — so an arbitrary binary used to be parsed into frames of mojibake
       and announced as a successful load. file.text() decodes as UTF-8, which
       turns any byte sequence that is not valid UTF-8 into U+FFFD, so a NUL or
       a replacement character in the head of the file is a reliable "this was
       never text" signal. */
    function looksBinary(s) {
      const n = Math.min(s.length, 8192);          // a header sample is enough
      for (let i = 0; i < n; i++) {
        const c = s.charCodeAt(i);
        if (c === 0 || c === 0xFFFD) return true;
      }
      return false;
    }

    async function handleFile(file) {
      setAlert(els.error, ""); setAlert(els.warn, ""); setAlert(els.info, "");
      const isVideo = /video\//i.test(file.type) || /\.(mp4|webm|mov|m4v|ogg)$/i.test(file.name);
      if (isVideo) return loadVideo(file);
      const isGif = /image\/gif/i.test(file.type) || /\.gif$/i.test(file.name);
      if (isGif) return loadGif(file);
      // Otherwise text / ANSI. Read and validate BEFORE touching any state, so
      // a rejected file leaves the currently loaded clip and frames untouched.
      // file.text() is the only rejecting call on this path (loadVideo is
      // synchronous and loadGif guards itself), and all three callers invoke
      // handleFile without a .catch().
      let txt;
      try { txt = await file.text(); }
      catch (e) {
        setAlert(els.error, `Could not read “${file.name}”: ${e.message}`);
        return;
      }
      if (!txt.trim() || looksBinary(txt)) {
        setAlert(els.error,
          `“${file.name}” is not a video, a GIF, or an ANSI / text frames file.`);
        return;
      }
      // committed — drop any previous video/GIF source state
      state.mode = null; state.gif = null; dropVideo();
      const frames = parseAnsiFile(txt);
      setFrames(frames);
      setAlert(els.info, `Loaded ${frames.length} frame(s) from ${file.name}.`);
      els.videoPanel.classList.add("hidden");
    }

    async function loadGif(file) {
      els.videoPanel.classList.remove("hidden");
      els.capfpsWrap.classList.add("hidden"); // GIF frames keep their own timing
      if (hasTrim) els.trimWrap.classList.add("hidden"); // no timeline to trim against
      state.mode = "gif"; state.gif = null; dropVideo();
      try {
        const buf = await file.arrayBuffer();
        // bound decoded frames by memory (each is a full W×H RGBA buffer)
        const size = RVRY.gifSize(buf);
        const frameBytes = size ? size.width * size.height * 4 : 0;
        const memFrames = frameBytes
          ? Math.max(1, Math.floor(MAX_GIF_BYTES / frameBytes)) : MAX_FRAMES_CEILING;
        const maxFrames = Math.min(MAX_FRAMES_CEILING, memFrames);
        const gif = RVRY.decodeGif(buf, { maxFrames });
        if (!gif.frames.length) throw new Error("no frames found.");
        state.gif = gif;
        const n = gif.frames.length;
        els.meta.textContent = `${gif.width}×${gif.height}, ${n} frame${n === 1 ? "" : "s"} (GIF)`;
        let warnMsg = "";
        if (gif.truncated) warnMsg += memFrames < MAX_FRAMES_CEILING
          ? `Large frames — only the first ${maxFrames} fit the memory limit; the rest were skipped. `
          : `Long animation — only the first ${maxFrames} frames were decoded. `;
        if (gif.width * gif.height > WARN_PIXELS) warnMsg += `High resolution (${gif.width}×${gif.height}) — conversion may be slow. `;
        if (warnMsg) setAlert(els.warn, warnMsg);
        setAlert(els.info, n === 1
          ? "Static GIF (1 frame). Set options and press “Generate frames”."
          : `GIF ready (${n} frames). Set options and press “Generate frames”.`);
      } catch (e) {
        state.mode = null;
        setAlert(els.error, "Could not decode this GIF: " + e.message);
      }
    }

    function loadVideo(file) {
      els.videoPanel.classList.remove("hidden");
      els.capfpsWrap.classList.remove("hidden");
      if (hasTrim) els.trimWrap.classList.remove("hidden");
      state.mode = "video"; state.gif = null;
      if (state.videoUrl) URL.revokeObjectURL(state.videoUrl); // free the previous clip
      const url = URL.createObjectURL(file);
      state.videoUrl = url;
      els.video.src = url;
      state.videoReady = false;
      els.video.onloadedmetadata = () => {
        state.videoReady = true;
        const w = els.video.videoWidth, h = els.video.videoHeight, dur = els.video.duration;
        els.meta.textContent = `${w}×${h}, ${dur.toFixed(1)}s`;
        resetTrim(dur);
        const pixels = w * h;
        let warnMsg = "";
        if (file.size > WARN_BYTES) warnMsg = `Large file (${(file.size/1048576).toFixed(0)} MB). `;
        if (pixels > WARN_PIXELS) warnMsg += `High resolution (${w}×${h}). Processing may be slow — a low-res clip is recommended. `;
        if (!isFinite(dur)) warnMsg += "Unknown duration — stream may not seek reliably. ";
        if (warnMsg) setAlert(els.warn, warnMsg + "You can still generate, but consider trimming/downscaling first.");
        else setAlert(els.info, "Video ready. Set options and press “Generate frames”.");
      };
      els.video.onerror = () => setAlert(els.error, "Could not load this video format in the browser.");
    }

    /* ---- video -> frames ---- */
    /* Resolves true when the seek timed out instead of completing. The
       timeout does not cancel the seek — generation carries on and grabs
       whatever the element is currently showing, which is the PREVIOUS
       frame's image. That silent duplication was invisible before; long
       runs make it likely enough that the count has to be reported.
       (The 3s wait is deliberately not shortened: a shorter one would not
       make seeks finish faster, it would only produce more duplicates.) */
    const SEEK_TIMEOUT_MS = 3000;
    function seekTo(t) {
      const v = els.video;
      return new Promise((resolve) => {
        let done = false, to = null;
        const finish = (stalled) => {
          if (done) return; done = true;
          if (to) clearTimeout(to);
          v.removeEventListener("seeked", onSeeked);
          resolve(stalled === true);
        };
        const onSeeked = () => finish(false);
        // Assigning currentTime to (almost) its existing value does not emit a
        // "seeked" event, which would hang generation on e.g. frame 0 at t=0.
        // Resolve on the next frame instead, and keep a timeout as a safety net.
        if (Math.abs(v.currentTime - t) < 1e-3 && v.readyState >= 2) {
          requestAnimationFrame(() => finish(false));
          return;
        }
        v.addEventListener("seeked", onSeeked);
        to = setTimeout(() => finish(true), SEEK_TIMEOUT_MS);
        v.currentTime = t;
      });
    }
    /* "3 seeks timed out…" — what the user needs to know about a run whose
       frames are not all what they asked for. */
    function qualityNote(stalls, dropped) {
      const n = [];
      if (stalls) n.push(`${stalls} seek${stalls === 1 ? "" : "s"} timed out — ` +
        `${stalls === 1 ? "that frame" : "those frames"} may repeat the previous image.`);
      if (dropped) n.push(`${dropped} frame${dropped === 1 ? "" : "s"} could not be ` +
        `sampled and ${dropped === 1 ? "was" : "were"} skipped.`);
      return n.join(" ");
    }

    function convertOpts() {
      const presetKey = els.preset.value;
      const preset = RVRY.GLYPH_PRESETS[presetKey];
      // Read like the Image and Text tabs: the typed ramp wins for "custom",
      // and an empty field falls back to the preset table's placeholder.
      const ramp = (presetKey === "custom" && hasCustom)
        ? (els.custom.value || "RVRY")
        : (preset ? preset.ramp : " .:-=+*#%@");
      const opts = {
        width: +els.width.value, ratio: +els.ratio.value,
        braille: !!(preset && preset.braille),
        ramp,
        dither: "none", threshold: 0.5,
        tone: { exposure: 1, contrast: 0, gamma: 1, invert: els.invert.checked }
      };
      return { opts, useColor: els.color.checked && !opts.braille };
    }
    function frameFromSource(source, opts, useColor) {
      const sample = RVRY.sampleImage(source, {
        width: opts.width, ratio: opts.ratio, braille: opts.braille, color: useColor
      });
      if (!sample) return null;
      const plain = RVRY.render(sample, opts);
      const html = useColor ? RVRY.renderColorHTML(sample, opts, plain) : RVRY.escapeHtml(plain.text);
      return { html, text: plain.text };
    }

    async function generate() {
      if (state.mode === "gif") return generateFromGif();
      if (!state.videoReady) { setAlert(els.error, "Load a video or GIF first."); return; }
      stop();
      // clear last run's cap/quality notice — it describes frames that no
      // longer exist, and a stale "N seeks timed out" is worse than silence
      setAlert(els.error, ""); setAlert(els.warn, "");
      const capfps = Math.max(1, +els.capfps.value);
      const dur = isFinite(els.video.duration) ? els.video.duration : 0;
      if (!dur) { setAlert(els.error, "Cannot determine duration; this video isn't seekable."); return; }
      // convert only the selected section (the whole clip by default)
      const { t0, t1, span, full } = trimRange();
      let count = Math.max(1, Math.floor(span * capfps)); // ≥1 even for sub-interval spans
      let step = 1 / capfps;
      const { opts, useColor } = convertOpts();
      const frames = [];
      let stalls = 0, dropped = 0;   // silently degraded frames, reported below
      setGenerating(true);
      // Frame 0 sits at the range's start under any step, so it can be
      // captured before the budget is known and then used to measure it. Only
      // after that does the count get trimmed — which keeps cheap settings
      // from paying the price of the most expensive ones.
      els.progress.textContent = `Generating… 1 / ${count}`;
      if (await seekTo(t0)) stalls++;
      const first = frameFromSource(els.video, opts, useColor);
      if (first) frames.push(first); else dropped++;
      const cap = framesThatFit(first);
      let capWarn = "";
      if (count > cap) {
        count = cap; step = span / count;
        capWarn = `Capped to ${cap} frames to stay within memory` +
          `${costNote(first)}. Effective FPS reduced — a narrower width, or ` +
          `color off, allows more frames.`;
        setAlert(els.warn, capWarn);
      }
      for (let i = 1; i < count; i++) {
        if (genAbort) break;
        if (await seekTo(Math.min(t1 - 0.001, t0 + i * step))) stalls++;
        const f = frameFromSource(els.video, opts, useColor);
        if (f) frames.push(f); else dropped++;
        if (i % 3 === 0 || i === count - 1) {
          els.progress.textContent = `Generating… ${i + 1} / ${count}`;
          await new Promise((r) => setTimeout(r, 0)); // yield to UI
        }
      }
      const stopped = genAbort;
      setGenerating(false);
      const note = qualityNote(stalls, dropped);
      if (note) setAlert(els.warn, capWarn ? capWarn + " " + note : note);
      const range = full ? "" : ` from ${fmtTime(t0)}–${fmtTime(t1)}`;
      els.progress.textContent = stopped
        ? `Stopped — kept ${frames.length} of ${count} frames${range}.`
        : `Done — ${frames.length} frames${range} @ ${capfps} fps capture.`;
      // real input event so the readout repaints and the value persists
      els.fps.value = Math.min(30, capfps);
      els.fps.dispatchEvent(new Event("input", { bubbles: true }));
      setFrames(frames);
      setAlert(els.info, stopped
        ? `Stopped at ${frames.length} frames — they're loaded and playable. Press play ▶`
        : `Generated ${frames.length} frames. Press play ▶`);
    }

    async function generateFromGif() {
      const gif = state.gif;
      if (!gif) { setAlert(els.error, "Load a GIF first."); return; }
      stop();
      setAlert(els.error, ""); setAlert(els.warn, "");   // as in generate()
      const { opts, useColor } = convertOpts();
      const cv = document.createElement("canvas");
      cv.width = gif.width; cv.height = gif.height;
      const ctx = cv.getContext("2d");
      const frames = [];
      let totalMs = 0, dropped = 0;   // GIF frames never seek, but can still fail to sample
      setGenerating(true);
      // limit starts at the whole GIF and is trimmed once frame 0 has been
      // converted and its real cost is known
      let limit = gif.frames.length, capWarn = "";
      for (let i = 0; i < limit; i++) {
        if (genAbort) break;
        const gf = gif.frames[i];
        ctx.putImageData(new ImageData(gf.data, gif.width, gif.height), 0, 0);
        const f = frameFromSource(cv, opts, useColor);
        if (f) { frames.push(f); totalMs += gf.delayMs; } else dropped++;
        if (i === 0) {
          const cap = framesThatFit(f);
          if (limit > cap) {
            limit = cap;
            capWarn = `Converting the first ${cap} of ${gif.frames.length} ` +
              `frames to stay within memory${costNote(f)}. A narrower width, or ` +
              `color off, allows more frames.`;
            setAlert(els.warn, capWarn);
          }
        }
        if (i % 5 === 0 || i === limit - 1) {
          els.progress.textContent = `Converting… ${i + 1} / ${limit}`;
          await new Promise((r) => setTimeout(r, 0)); // yield to UI
        }
      }
      const stopped = genAbort;
      setGenerating(false);
      const note = qualityNote(0, dropped);
      if (note) setAlert(els.warn, capWarn ? capWarn + " " + note : note);
      // playback rate from the GIF's own frame delays (player uses a fixed fps)
      const avg = frames.length ? totalMs / frames.length : 100;
      const fps = Math.max(1, Math.min(30, Math.round(1000 / avg)));
      els.fps.value = fps;
      els.fps.dispatchEvent(new Event("input", { bubbles: true }));
      els.progress.textContent = stopped
        ? `Stopped — kept ${frames.length} of ${limit} frames.`
        : `Done — ${frames.length} frames from GIF (≈${fps} fps).`;
      setFrames(frames);
      setAlert(els.info, stopped
        ? `Stopped at ${frames.length} frames — they're loaded and playable. Press play ▶`
        : `Converted ${frames.length} frames. Press play ▶`);
    }
    els.generate.addEventListener("click", () => {
      if (state.generating) { genAbort = true; return; }
      generate().catch((e) => {
        setGenerating(false); setAlert(els.error, e.message);
      });
    });

    /* wiring */
    els.drop.addEventListener("click", () => els.file.click());
    els.file.addEventListener("change", (e) => {
      if (e.target.files[0]) handleFile(e.target.files[0]);
      e.target.value = ""; // allow re-selecting the same file
    });
    RVRY.wireDropzone(els.drop, (files) => { if (files[0]) handleFile(files[0]); });
    RVRY.registerPaste("player", handleFile);

    RVRY.slider(els.width, els.widthV, 0, () => {});
    RVRY.slider(els.ratio, els.ratioV, 2, () => {});
    RVRY.ui.wireRatioFit(els.ratioFit, els.ratio, els.font);
    RVRY.slider(els.capfps, els.capfpsV, 0, () => {});

    els.copy.addEventListener("click", () => {
      if (state.frames[state.index]) RVRY.ui.copyText(state.frames[state.index].text);
    });
    els.txt.addEventListener("click", () => {
      if (state.frames[state.index]) RVRY.ui.exportTxt(state.frames[state.index].text, "rvry-frame");
    });
    els.png.addEventListener("click", () => {
      if (!state.frames.length) { RVRY.ui.toast("Generate or load frames first"); return; }
      RVRY.ui.exportPng(els.out, { font: els.font.value, name: "rvry-frame",
        fontSize: +els.fontsize.value, bg: "#08090b", fg: "#e9eaec" });
    });
    /* whole-animation exports; both round-trip through this tab's loader */
    const animTs = () => new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
    els.ans.addEventListener("click", () => {
      if (!state.frames.length) { RVRY.ui.toast("Generate or load frames first"); return; }
      RVRY.ui.download(`rvry-anim-${animTs()}.ans`,
        new Blob(framesToAnsiParts(state.frames), { type: "text/plain;charset=utf-8" }));
      RVRY.ui.toast(`Saved ${state.frames.length} frames as ANSI`);
    });
    els.animTxt.addEventListener("click", () => {
      if (!state.frames.length) { RVRY.ui.toast("Generate or load frames first"); return; }
      // form-feed separates frames (understood by this tab's .txt loader)
      const parts = [];
      state.frames.forEach((f, i) => { if (i) parts.push("\x0c"); parts.push(f.text); });
      RVRY.ui.download(`rvry-anim-${animTs()}.txt`,
        new Blob(parts, { type: "text/plain;charset=utf-8" }));
      RVRY.ui.toast(`Saved ${state.frames.length} frames as text`);
    });
    els.animHtml.addEventListener("click", () => {
      if (!state.frames.length) { RVRY.ui.toast("Generate or load frames first"); return; }
      RVRY.ui.download(`rvry-anim-${animTs()}.html`,
        new Blob(buildAnimHtmlParts(state.frames, {
          fps: +els.fps.value, loop: els.loop.checked,
          font: els.font.value, fontSize: +els.fontsize.value
        }), { type: "text/html;charset=utf-8" }));
      RVRY.ui.toast(`Saved a standalone HTML player (${state.frames.length} frames)`);
    });

    /* ---- animated GIF export (options modal) ----
       GIF's LZW packing is lossless, so the "compression level" works by
       shrinking the palette — which also lowers the LZW minimum code size. */
    const GIF_LEVEL_COLORS = [256, 128, 64, 32, 16, 8];
    function openGifModal() {
      if (!state.frames.length) { RVRY.ui.toast("Generate or load frames first"); return; }
      const mk = (tag, cls, html) => {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (html != null) n.innerHTML = html;
        return n;
      };
      const overlay = mk("div", "crop-overlay");
      const modal = mk("div", "crop-modal gif-modal");
      const head = mk("div", "crop-head",
        '<span class="crop-title">Export animated GIF</span>' +
        '<span class="crop-dims mono" id="gif-dims"></span>');
      const body = mk("div", null, `
        <div class="field">
          <label for="gif-level">LZW compression <span class="val" id="gif-level-v"></span></label>
          <input type="range" id="gif-level" min="1" max="6" step="1" value="1" />
          <div class="hint">GIF's LZW packing is lossless, so higher levels shrink the
            color palette (256 → 8) instead — smaller LZW codes, smaller file.</div>
        </div>
        <label class="check"><input type="checkbox" id="gif-dither" />
          Ordered dithering (smoother ramps at high compression, larger file)</label>
        <div class="field" style="margin-top:.6rem">
          <label for="gif-px">Pixel size <span class="val" id="gif-px-v"></span></label>
          <input type="range" id="gif-px" min="2" max="20" step="1" value="8" />
          <div class="hint">Rendered pixels per character cell.</div>
        </div>
        <label class="check"><input type="checkbox" id="gif-loop" /> Loop forever</label>
        <div class="hint" id="gif-info" style="margin-top:.4rem"></div>
        <div class="gif-progress hidden" id="gif-progress">
          <div class="gif-progress-fill" id="gif-progress-fill"></div>
        </div>`);
      const actions = mk("div", "crop-actions");
      const btnCancel = mk("button", "btn ghost", "Cancel");
      const btnGo = mk("button", "btn primary", "Export GIF");
      actions.append(btnCancel, btnGo);
      modal.append(head, body, actions);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const q = (id) => modal.querySelector("#" + id);
      const level = q("gif-level"), levelV = q("gif-level-v");
      const px = q("gif-px"), pxV = q("gif-px-v");
      const dither = q("gif-dither"), loop = q("gif-loop");
      const dims = q("gif-dims"), info = q("gif-info");
      const bar = q("gif-progress"), fill = q("gif-progress-fill");
      px.value = Math.min(20, Math.max(2, +els.fontsize.value || 8));
      loop.checked = els.loop.checked;
      const fps = Math.max(1, +els.fps.value);

      function refresh() {
        const colors = GIF_LEVEL_COLORS[+level.value - 1];
        levelV.textContent = `${level.value} — ${colors} colors`;
        const m = RVRY.gifFrameMetrics(state.frames, els.font.value, +px.value);
        pxV.textContent = m.px < +px.value ? `${m.px}px (capped)` : `${m.px}px`;
        dims.textContent = `${m.W} × ${m.H} px`;
        info.textContent =
          `${state.frames.length} frame${state.frames.length === 1 ? "" : "s"} @ ${fps} fps` +
          ` ≈ ${(state.frames.length / fps).toFixed(1)}s`;
      }
      level.addEventListener("input", refresh);
      px.addEventListener("input", refresh);
      refresh();

      let busy = false, abort = false;
      function close() {
        abort = true;
        document.removeEventListener("keydown", onKey);
        overlay.remove();
      }
      function onKey(e) { if (e.key === "Escape") close(); }
      document.addEventListener("keydown", onKey);
      btnCancel.addEventListener("click", close);
      overlay.addEventListener("pointerdown", (e) => {
        if (e.target === overlay && !busy) close();
      });

      btnGo.addEventListener("click", async () => {
        if (busy) return;
        busy = true;
        btnGo.disabled = true;
        level.disabled = px.disabled = dither.disabled = loop.disabled = true;
        bar.classList.remove("hidden");
        try {
          const blob = await RVRY.encodeGifAnimation(state.frames, {
            font: els.font.value, fontSize: +px.value,
            bg: "#08090b", fg: "#e9eaec",
            maxColors: GIF_LEVEL_COLORS[+level.value - 1],
            dither: dither.checked, fps, loop: loop.checked
          }, {
            aborted: () => abort,
            onProgress: (i, n) => {
              fill.style.width = ((i / n) * 100).toFixed(1) + "%";
              btnGo.textContent = `Encoding… ${i} / ${n}`;
            }
          });
          if (blob) {
            RVRY.ui.download(`rvry-anim-${animTs()}.gif`, blob);
            RVRY.ui.toast(`Saved animated GIF (${state.frames.length} frames, ${(blob.size / 1024).toFixed(0)} KB)`);
            close();
          }
        } catch (e) {
          RVRY.ui.toast("GIF export failed: " + e.message);
          busy = false;
          btnGo.disabled = false;
          level.disabled = px.disabled = dither.disabled = loop.disabled = false;
          btnGo.textContent = "Export GIF";
          bar.classList.add("hidden");
        }
      });
    }
    els.gif.addEventListener("click", openGifModal);

    RVRY.wirePreview(els.font, els.fontsize, null, els.out, els.stage);
    RVRY.wireZoom(els.out, els.stage, els.fontsize, { fit: els.zoomFit, inc: els.zoomIn, dec: els.zoomOut });
  }

  RVRY.initPlayerTab = init;
})(window);
