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
  const MAX_FRAMES = 900;
  const WARN_PIXELS = 1280 * 720;
  const WARN_BYTES = 60 * 1024 * 1024;
  // Decoded GIF frames are full W×H RGBA buffers; cap their total size so a
  // large, long GIF can't exhaust memory before conversion even starts.
  const MAX_GIF_BYTES = 384 * 1024 * 1024;

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
  // strip all escape sequences -> plain text
  function stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\x1b[()][A-Za-z0-9]/g, "");
  }
  function parseAnsiFile(text) {
    // Split into frames on clear-screen / form-feed markers.
    const parts = text.split(/\x1b\[2J|\x0c/);
    const frames = [];
    for (let p of parts) {
      // drop cursor-home at frame start, keep content
      const cleaned = p.replace(/^\s*\x1b\[[0-9;]*H/, "");
      if (stripAnsi(cleaned).trim() === "" && parts.length > 1) continue;
      frames.push({ html: ansiToHtml(cleaned), text: stripAnsi(cleaned) });
    }
    if (!frames.length) frames.push({ html: ansiToHtml(text), text: stripAnsi(text) });
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
  function framesToAnsi(frames) {
    let out = "";
    for (let i = 0; i < frames.length; i++) {
      out += "\x1b[2J\x1b[H" + htmlToAnsi(frames[i].html);
    }
    return out;
  }
  /* ---------- frames -> standalone HTML player ----------
     One self-contained file: frames embedded as JSON, minimal transport
     (click / space toggles play). Opens anywhere a browser exists. */
  function buildAnimHtml(frames, opts) {
    opts = opts || {};
    const fps = Math.max(1, Math.min(60, +opts.fps || 12));
    const loop = opts.loop !== false;
    const font = opts.font || "monospace";
    const size = +opts.fontSize || 8;
    const data = JSON.stringify(frames.map((f) => f.html))
      .replace(/</g, "\\u003c")           // no </script> breakout
      .replace(/\u2028/g, "\\u2028") // JSON leaves U+2028/29 raw; invalid in JS source
      .replace(/\u2029/g, "\\u2029");
    return `<!doctype html>
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
var F=${data},FPS=${fps},LOOP=${loop},i=0,on=F.length>1;
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
  }

  // exposed for reuse/testing (pure string transforms)
  RVRY.parseAnsiFile = parseAnsiFile;
  RVRY.framesToAnsi = framesToAnsi;
  RVRY.buildAnimHtml = buildAnimHtml;

  function init() {
    const els = {
      drop: $("ply-drop"), file: $("ply-file"),
      warn: $("ply-warn"), error: $("ply-error"), info: $("ply-info"),
      videoPanel: $("ply-video-panel"),
      width: $("ply-width"), widthV: $("ply-width-v"),
      ratio: $("ply-ratio"), ratioV: $("ply-ratio-v"),
      capfps: $("ply-capfps"), capfpsV: $("ply-capfps-v"), capfpsWrap: $("ply-capfps-wrap"),
      preset: $("ply-preset"), color: $("ply-color"), invert: $("ply-invert"),
      generate: $("ply-generate"), progress: $("ply-progress"),
      fps: $("ply-fps"), fpsV: $("ply-fps-v"),
      speed: $("ply-speed"), speedV: $("ply-speed-v"), loop: $("ply-loop"),
      copy: $("ply-copy"), png: $("ply-png"), txt: $("ply-txt"),
      ans: $("ply-ans"), animTxt: $("ply-anim-txt"), animHtml: $("ply-anim-html"),
      zoomOut: $("ply-zoom-out"), zoomFit: $("ply-zoom-fit"), zoomIn: $("ply-zoom-in"),
      font: $("ply-font"), fontsize: $("ply-fontsize"), stage: $("ply-stage"),
      out: $("ply-out"), meta: $("ply-meta"),
      first: $("ply-first"), stepback: $("ply-stepback"), play: $("ply-play"),
      stepfwd: $("ply-stepfwd"), last: $("ply-last"),
      seek: $("ply-seek"), counter: $("ply-counter"),
      video: $("ply-video")
    };

    RVRY.fillGlyphSelect(els.preset, "detailed");

    const state = {
      frames: [],        // [{html, text}]
      index: 0,
      playing: false,
      timer: null,
      videoReady: false,
      videoUrl: null,
      mode: null,        // "video" | "gif" — which source Generate converts
      gif: null          // decoded GIF { width, height, frames, truncated }
    };

    function setAlert(el, msg) {
      if (!msg) { el.classList.remove("show"); return; }
      el.textContent = msg; el.classList.add("show");
    }

    /* ---- frame display ---- */
    function showFrame(i) {
      if (!state.frames.length) return;
      state.index = ((i % state.frames.length) + state.frames.length) % state.frames.length;
      const f = state.frames[state.index];
      els.out.innerHTML = f.html;
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
      else els.out.textContent = "No frames.";
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
      state.playing = true; els.play.textContent = "⏸";
      state.timer = setTimeout(tick, frameDelay());
    }
    function stop() {
      state.playing = false; els.play.textContent = "▶";
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

    /* ---- file loading ---- */
    async function handleFile(file) {
      setAlert(els.error, ""); setAlert(els.warn, ""); setAlert(els.info, "");
      const isVideo = /video\//i.test(file.type) || /\.(mp4|webm|mov|m4v|ogg)$/i.test(file.name);
      if (isVideo) return loadVideo(file);
      const isGif = /image\/gif/i.test(file.type) || /\.gif$/i.test(file.name);
      if (isGif) return loadGif(file);
      // otherwise text / ansi — drop any previous video/GIF source state
      state.mode = null; state.gif = null; state.videoReady = false;
      const txt = await file.text();
      const frames = parseAnsiFile(txt);
      setFrames(frames);
      setAlert(els.info, `Loaded ${frames.length} frame(s) from ${file.name}.`);
      els.videoPanel.classList.add("hidden");
    }

    async function loadGif(file) {
      els.videoPanel.classList.remove("hidden");
      els.capfpsWrap.classList.add("hidden"); // GIF frames keep their own timing
      state.mode = "gif"; state.gif = null; state.videoReady = false;
      try {
        const buf = await file.arrayBuffer();
        // bound decoded frames by memory (each is a full W×H RGBA buffer)
        const size = RVRY.gifSize(buf);
        const frameBytes = size ? size.width * size.height * 4 : 0;
        const memFrames = frameBytes
          ? Math.max(1, Math.floor(MAX_GIF_BYTES / frameBytes)) : MAX_FRAMES;
        const maxFrames = Math.min(MAX_FRAMES, memFrames);
        const gif = RVRY.decodeGif(buf, { maxFrames });
        if (!gif.frames.length) throw new Error("no frames found.");
        state.gif = gif;
        const n = gif.frames.length;
        els.meta.textContent = `${gif.width}×${gif.height}, ${n} frame${n === 1 ? "" : "s"} (GIF)`;
        let warnMsg = "";
        if (gif.truncated) warnMsg += memFrames < MAX_FRAMES
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
    function seekTo(t) {
      const v = els.video;
      return new Promise((resolve) => {
        let done = false, to = null;
        const finish = () => {
          if (done) return; done = true;
          if (to) clearTimeout(to);
          v.removeEventListener("seeked", finish);
          resolve();
        };
        // Assigning currentTime to (almost) its existing value does not emit a
        // "seeked" event, which would hang generation on e.g. frame 0 at t=0.
        // Resolve on the next frame instead, and keep a timeout as a safety net.
        if (Math.abs(v.currentTime - t) < 1e-3 && v.readyState >= 2) {
          requestAnimationFrame(finish);
          return;
        }
        v.addEventListener("seeked", finish);
        to = setTimeout(finish, 3000);
        v.currentTime = t;
      });
    }

    function convertOpts() {
      const preset = RVRY.GLYPH_PRESETS[els.preset.value];
      const opts = {
        width: +els.width.value, ratio: +els.ratio.value,
        braille: !!(preset && preset.braille),
        ramp: preset ? preset.ramp : " .:-=+*#%@",
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
      setAlert(els.error, "");
      const capfps = Math.max(1, +els.capfps.value);
      const dur = isFinite(els.video.duration) ? els.video.duration : 0;
      if (!dur) { setAlert(els.error, "Cannot determine duration; this video isn't seekable."); return; }
      let count = Math.max(1, Math.floor(dur * capfps)); // ≥1 even for sub-interval clips
      let step = 1 / capfps;
      if (count > MAX_FRAMES) {
        count = MAX_FRAMES; step = dur / count;
        setAlert(els.warn, `Capped to ${MAX_FRAMES} frames to stay within memory. Effective FPS reduced.`);
      }
      const { opts, useColor } = convertOpts();
      const frames = [];
      els.generate.disabled = true;
      for (let i = 0; i < count; i++) {
        await seekTo(Math.min(dur - 0.001, i * step));
        const f = frameFromSource(els.video, opts, useColor);
        if (f) frames.push(f);
        if (i % 3 === 0 || i === count - 1) {
          els.progress.textContent = `Generating… ${i + 1} / ${count}`;
          await new Promise((r) => setTimeout(r, 0)); // yield to UI
        }
      }
      els.generate.disabled = false;
      els.progress.textContent = `Done — ${frames.length} frames @ ${capfps} fps capture.`;
      els.fps.value = Math.min(30, capfps); els.fpsV.textContent = String(els.fps.value);
      setFrames(frames);
      setAlert(els.info, `Generated ${frames.length} frames. Press play ▶`);
    }

    async function generateFromGif() {
      const gif = state.gif;
      if (!gif) { setAlert(els.error, "Load a GIF first."); return; }
      stop();
      setAlert(els.error, "");
      const { opts, useColor } = convertOpts();
      const cv = document.createElement("canvas");
      cv.width = gif.width; cv.height = gif.height;
      const ctx = cv.getContext("2d");
      const frames = [];
      let totalMs = 0;
      els.generate.disabled = true;
      for (let i = 0; i < gif.frames.length; i++) {
        const gf = gif.frames[i];
        ctx.putImageData(new ImageData(gf.data, gif.width, gif.height), 0, 0);
        const f = frameFromSource(cv, opts, useColor);
        if (f) { frames.push(f); totalMs += gf.delayMs; }
        if (i % 5 === 0 || i === gif.frames.length - 1) {
          els.progress.textContent = `Converting… ${i + 1} / ${gif.frames.length}`;
          await new Promise((r) => setTimeout(r, 0)); // yield to UI
        }
      }
      els.generate.disabled = false;
      // playback rate from the GIF's own frame delays (player uses a fixed fps)
      const avg = frames.length ? totalMs / frames.length : 100;
      const fps = Math.max(1, Math.min(30, Math.round(1000 / avg)));
      els.fps.value = fps; els.fpsV.textContent = String(fps);
      els.progress.textContent = `Done — ${frames.length} frames from GIF (≈${fps} fps).`;
      setFrames(frames);
      setAlert(els.info, `Converted ${frames.length} frames. Press play ▶`);
    }
    els.generate.addEventListener("click", () => generate().catch((e) => {
      els.generate.disabled = false; setAlert(els.error, e.message);
    }));

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
        framesToAnsi(state.frames), "text/plain;charset=utf-8");
      RVRY.ui.toast(`Saved ${state.frames.length} frames as ANSI`);
    });
    els.animTxt.addEventListener("click", () => {
      if (!state.frames.length) { RVRY.ui.toast("Generate or load frames first"); return; }
      // form-feed separates frames (understood by this tab's .txt loader)
      RVRY.ui.download(`rvry-anim-${animTs()}.txt`,
        state.frames.map((f) => f.text).join("\x0c"), "text/plain;charset=utf-8");
      RVRY.ui.toast(`Saved ${state.frames.length} frames as text`);
    });
    els.animHtml.addEventListener("click", () => {
      if (!state.frames.length) { RVRY.ui.toast("Generate or load frames first"); return; }
      RVRY.ui.download(`rvry-anim-${animTs()}.html`, buildAnimHtml(state.frames, {
        fps: +els.fps.value, loop: els.loop.checked,
        font: els.font.value, fontSize: +els.fontsize.value
      }), "text/html;charset=utf-8");
      RVRY.ui.toast(`Saved a standalone HTML player (${state.frames.length} frames)`);
    });

    RVRY.wirePreview(els.font, els.fontsize, null, els.out, els.stage);
    RVRY.wireZoom(els.out, els.stage, els.fontsize, { fit: els.zoomFit, inc: els.zoomIn, dec: els.zoomOut });
  }

  RVRY.initPlayerTab = init;
})(window);
