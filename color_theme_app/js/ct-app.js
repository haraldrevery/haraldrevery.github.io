/* Color Theme Generator: the page. Plain JS, no framework, no build step.
   State lives in `theme` (what gets saved and exported) plus a few UI values;
   every change calls schedule(), and render() updates only the parts whose
   inputs changed (see `changed`), once per animation frame. */
(function () {
  'use strict';
  const C = window.CTColor, X = window.CTExport, I = window.CTI18N;
  const $ = (id) => document.getElementById(id);
  const doc = document.documentElement;

  /* ---------------- storage ---------------- */

  const KEY = { settings: 'rvry-color-settings', work: 'rvry-color-work', lib: 'rvry-color-library', theme: 'rvry-theme' };
  const OLD = { lib: 'cw-library', format: 'cw-format', size: 'cw-fontsize', theme: 'cw-theme' };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    json(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  };

  const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'];
  const TABS = ['gradient', 'contrast', 'image', 'library'];
  const MAX_STOPS = 12;
  const savedSettings = store.json(KEY.settings);
  const settings = Object.assign({ lang: 'en', size: 'md', fmt: 'hex', tab: 'gradient', sheet: 'light' }, savedSettings || {});
  if (!savedSettings) { // first visit after the rewrite: keep the old app's choices
    if (C.FORMATS.indexOf(store.get(OLD.format)) >= 0) settings.fmt = store.get(OLD.format);
    if (SIZES.indexOf(store.get(OLD.size)) >= 0) settings.size = store.get(OLD.size);
  }
  if (I.LANGS.indexOf(settings.lang) < 0) settings.lang = 'en';
  if (SIZES.indexOf(settings.size) < 0) settings.size = 'md';
  if (C.FORMATS.indexOf(settings.fmt) < 0) settings.fmt = 'hex';
  if (TABS.indexOf(settings.tab) < 0) settings.tab = 'gradient';
  if (settings.sheet !== 'dark') settings.sheet = 'light';
  const saveSettings = () => store.set(KEY.settings, JSON.stringify(settings));

  let t = I.translator(settings.lang);

  /* ---------------- browser fallback for exotic CSS colour syntax ---------------- */

  (function () {
    let ctx = null;
    C.setFallback((s) => {
      if (!window.CSS || !CSS.supports || !CSS.supports('color', s)) return null;
      if (!ctx) {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 1;
        ctx = cv.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;
      }
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = s;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    });
  })();

  /* ---------------- state ---------------- */

  let theme = X.normalizeTheme(store.json(KEY.work));
  let snap = X.snapshot(theme);
  let sel = { kind: 'base' };
  const history = [];
  let tray = null;
  const image = { src: null, palette: [], k: 6, eyedrop: false, pick: null, seed: 0 };
  let library = []; // filled at start: loadLibrary() needs the helpers below
  let libFilter = 'all';
  let renaming = null;

  /* ---------------- render scheduling ---------------- */

  let frame = 0, themeDirty = false;
  const memo = {};
  const changed = (key, sig) => { if (memo[key] === sig) return false; memo[key] = sig; return true; };
  function schedule(themeChanged) {
    if (themeChanged) themeDirty = true;
    if (!frame) frame = requestAnimationFrame(render);
  }
  function themeChanged() { schedule(true); saveWorkSoon(); commitSoon(); }

  // Undo / redo for theme edits (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y). A drag or a
  // run of typing becomes one step: a state is committed 400 ms after the
  // last change.
  const undoStack = [], redoStack = [];
  let committed = JSON.stringify(X.serializeTheme(theme)), commitTimer = 0;
  function commitSoon() { clearTimeout(commitTimer); commitTimer = setTimeout(commit, 400); }
  function commit() {
    clearTimeout(commitTimer);
    const cur = JSON.stringify(X.serializeTheme(theme));
    if (cur === committed) return;
    undoStack.push(committed);
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
    committed = cur;
  }
  function stepHistory(from, to, label) {
    commit();
    if (!from.length) return;
    to.push(committed);
    committed = from.pop();
    theme = X.normalizeTheme(JSON.parse(committed));
    sel = { kind: 'base' };
    schedule(true); saveWorkSoon();
    toast(t(label));
  }
  const undo = () => stepHistory(undoStack, redoStack, 'undone');
  const redo = () => stepHistory(redoStack, undoStack, 'redone');

  let workTimer = 0;
  function saveWorkSoon() {
    clearTimeout(workTimer);
    workTimer = setTimeout(() => store.set(KEY.work, JSON.stringify(X.serializeTheme(theme))), 400);
  }

  /* ---------------- small helpers ---------------- */

  const fmt = (c) => C.format(c, settings.fmt);
  const hex = (c) => C.format(c, 'hex');
  const inkOn = (c) => (C.contrast(C.WHITE, c) >= C.contrast(C.BLACK, c) ? '#ffffff' : '#111111');
  const isTyping = (el) => document.activeElement === el;
  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach((c) => c && n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  }
  // Grow/shrink `box` to n children made by make(i); returns the children.
  function sync(box, n, make) {
    while (box.children.length > n) box.lastElementChild.remove();
    while (box.children.length < n) box.appendChild(make(box.children.length));
    return box.children;
  }
  const setSw = (node, c) => node.style.setProperty('--sw', C.toCss(c));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const listText = (colors) => colors.map(fmt).join(settings.fmt === 'hex' ? ', ' : '\n');

  /* ---------------- toast + clipboard ---------------- */

  let toastTimer = 0, undoFn = null;
  function toast(msg, undo) {
    const box = $('toast');
    $('toast-msg').textContent = msg;
    undoFn = undo || null;
    $('toast-undo').hidden = !undo;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.hidden = true; undoFn = null; }, undo ? 7000 : 2600);
  }
  $('toast-undo').addEventListener('click', () => {
    const f = undoFn;
    $('toast').hidden = true; undoFn = null;
    if (f) f();
  });

  function copy(text, what) {
    const done = () => toast(what ? t('copied_what', { what }) : t('copied'));
    const legacy = () => {
      const ta = el('textarea', { class: 'sr-only', 'aria-hidden': 'true' });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      if (ok) done(); else toast(t('copy_failed'));
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, legacy);
    else legacy();
  }

  function download(name, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    $('exp-msg').textContent = t('downloaded', { file: name });
  }
  const slug = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'color-theme';

  /* ---------------- selection ---------------- */

  function selected() {
    const s = snap;
    switch (sel.kind) {
      case 'harmony': if (s.harmony.colors[sel.i]) return { color: s.harmony.colors[sel.i], name: sel.i === s.harmony.baseIndex ? t('n_base') : t('n_harmony', { n: sel.i + 1 }) }; break;
      case 'scale': if (s.scale[sel.i]) return { color: s.scale[sel.i].color, name: t('n_scale', { n: s.scale[sel.i].step }) }; break;
      case 'step': if (s.gradient.steps[sel.i]) return { color: s.gradient.steps[sel.i], name: t('n_step', { n: sel.i + 1 }) }; break;
      case 'stop': if (s.gradient.stops[sel.i]) return { color: s.gradient.stops[sel.i], name: t('n_stop', { n: sel.i + 1 }) }; break;
      case 'fixed': return { color: sel.color, name: sel.name ? (typeof sel.name === 'function' ? sel.name() : sel.name) : '' };
    }
    return { color: s.base, name: t('n_base'), base: true };
  }
  function select(next) { sel = next; schedule(); }

  /* ---------------- base colour ---------------- */

  function setBase(b) {
    theme.base = {
      h: C.mod360(b.h), s: C.clamp(b.s, 0, 1), v: C.clamp(b.v, 0, 1),
      a: C.clamp(b.a == null ? theme.base.a : b.a, 0, 1)
    };
    sel = { kind: 'base' };
    themeChanged();
    pushHistorySoon();
  }
  // Greys have no hue: keep the current one so the wheel does not jump to red.
  function setBaseColor(c) {
    const q = C.quant(c), v = C.rgbToHsv(q.r, q.g, q.b);
    setBase({ h: v.s < 0.001 ? theme.base.h : v.h, s: v.s, v: v.v, a: q.a });
  }

  let histTimer = 0;
  function pushHistorySoon() {
    clearTimeout(histTimer);
    histTimer = setTimeout(() => {
      const h = hex(snap.base);
      const i = history.indexOf(h);
      if (i === 0) return;
      if (i > 0) history.splice(i, 1);
      history.unshift(h);
      history.length = Math.min(history.length, 14);
      schedule();
    }, 600);
  }

  /* ---------------- picker: wheel + SV square ---------------- */

  // Same query as the one-screen layout in ct.css.
  const CANVAS = window.matchMedia ? window.matchMedia('(min-width: 1000px) and (min-height: 560px)') : { matches: false };
  const wheel = { size: 0, outer: 0, inner: 0, sv: 0 };
  // Desktop: the wheel fills the height the column has left. Otherwise it
  // follows the column width (and the wrap takes the wheel's height).
  function layoutWheel() {
    const wrap = $('wheel-wrap');
    // Desktop: never taller than wide, so spare height stays below the picker
    // instead of floating around the wheel.
    wrap.style.maxHeight = CANVAS.matches ? Math.min(wrap.clientWidth, 360) + 'px' : '';
    const w = wrap.clientWidth || 240;
    const avail = CANVAS.matches ? Math.min(w, wrap.clientHeight || w, 360) : Math.min(w, 264);
    const size = Math.max(140, Math.floor(avail));
    if (size === wheel.size) return;
    wheel.size = size;
    wheel.outer = size / 2 - 2;
    wheel.inner = wheel.outer - Math.max(16, Math.round(size * 0.085));
    wheel.sv = Math.floor((wheel.inner - 7) * Math.SQRT2);
    wrap.style.setProperty('--wheel', size + 'px');
    wrap.style.setProperty('--sv', wheel.sv + 'px');
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cv = $('wheel');
    cv.width = cv.height = Math.round(size * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = size / 2;
    for (let i = 0; i < 360; i++) {
      const a0 = (i - 0.7 - 90) * Math.PI / 180, a1 = (i + 0.7 - 90) * Math.PI / 180;
      ctx.beginPath();
      ctx.arc(c, c, wheel.outer, a0, a1);
      ctx.arc(c, c, wheel.inner, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = C.toCss(C.hsvToRgb(i, 1, 1));
      ctx.fill();
    }
    const svc = $('sv-canvas');
    svc.width = svc.height = Math.round(wheel.sv * dpr);
    memo.svHue = null; memo.marks = null;
    schedule();
  }
  function drawSV(h) {
    const cv = $('sv-canvas'), n = cv.width, ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.toCss(C.hsvToRgb(h, 1, 1));
    ctx.fillRect(0, 0, n, n);
    const gx = ctx.createLinearGradient(0, 0, n, 0);
    gx.addColorStop(0, 'rgba(255,255,255,1)'); gx.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gx; ctx.fillRect(0, 0, n, n);
    const gy = ctx.createLinearGradient(0, 0, 0, n);
    gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = gy; ctx.fillRect(0, 0, n, n);
  }

  function dragger(node, onPoint) {
    let active = false;
    node.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (onPoint(e, true) === false) return;
      active = true;
      try { node.setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ }
      e.preventDefault();
    });
    node.addEventListener('pointermove', (e) => { if (active) onPoint(e, false); });
    const end = () => { active = false; };
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
  }
  dragger($('wheel-ring'), (e, first) => {
    const r = $('wheel-ring').getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
    if (first && Math.hypot(x, y) < wheel.inner - 4) return false; // the empty middle
    setBase(Object.assign({}, theme.base, { h: Math.atan2(y, x) * 180 / Math.PI + 90 }));
    $('wheel-ring').focus({ preventScroll: true });
  });
  dragger($('sv'), (e) => {
    const r = $('sv').getBoundingClientRect();
    setBase(Object.assign({}, theme.base, {
      s: C.clamp((e.clientX - r.left) / r.width, 0, 1),
      v: 1 - C.clamp((e.clientY - r.top) / r.height, 0, 1)
    }));
    $('sv').focus({ preventScroll: true });
  });
  const stepKey = (e) => (e.shiftKey ? 10 : 1);
  $('wheel-ring').addEventListener('keydown', (e) => {
    const k = e.key, d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 15, PageDown: -15 }[k];
    if (d == null && k !== 'Home' && k !== 'End') return;
    e.preventDefault();
    const h = k === 'Home' ? 0 : k === 'End' ? 359 : Math.round(theme.base.h) + d * (Math.abs(d) === 1 ? stepKey(e) : 1);
    setBase(Object.assign({}, theme.base, { h }));
  });
  $('sv').addEventListener('keydown', (e) => {
    const b = Object.assign({}, theme.base), st = stepKey(e) / 100;
    if (e.key === 'ArrowRight') b.s += st; else if (e.key === 'ArrowLeft') b.s -= st;
    else if (e.key === 'ArrowUp') b.v += st; else if (e.key === 'ArrowDown') b.v -= st;
    else return;
    e.preventDefault();
    b.s = Math.round(C.clamp(b.s, 0, 1) * 100) / 100; b.v = Math.round(C.clamp(b.v, 0, 1) * 100) / 100;
    setBase(b);
  });

  [['sl-h', 'h', 1], ['sl-s', 's', 100], ['sl-v', 'v', 100], ['sl-a', 'a', 100]].forEach(([id, k, div]) => {
    $(id).addEventListener('input', (e) => {
      const b = Object.assign({}, theme.base);
      b[k] = Number(e.target.value) / div;
      setBase(b);
    });
  });

  /* ---------------- smart paste field ---------------- */

  function applyText(text, fromPaste) {
    const msg = $('smart-msg');
    $('smart').setAttribute('aria-invalid', 'false');
    const one = C.parse(text, settings.fmt);
    if (one) {
      setBaseColor(one.color);
      const h = hex(one.color);
      msg.textContent = one.mapped ? t('msg_mapped', { hex: h }) : t('msg_set', { hex: h });
      msg.className = 'hint' + (one.mapped ? ' warn' : ' ok');
      $('smart').value = '';
      setSw($('smart-sw'), one.color);
      return true;
    }
    const list = C.extract(text, settings.fmt);
    if (list.length === 1) return applyText(hex(list[0].color), fromPaste);
    if (list.length > 1) {
      tray = list.map((x) => x.color);
      msg.textContent = t('msg_list', { n: list.length });
      msg.className = 'hint ok';
      $('smart').value = '';
      schedule();
      return true;
    }
    if (String(text).trim()) { msg.textContent = t('msg_unknown'); msg.className = 'hint err'; $('smart').setAttribute('aria-invalid', 'true'); }
    return false;
  }
  $('smart').addEventListener('input', (e) => {
    const v = e.target.value, msg = $('smart-msg');
    const one = v.trim() ? C.parse(v, settings.fmt) : null;
    const many = !one && v.trim() ? C.extract(v, settings.fmt).length : 0;
    $('smart').setAttribute('aria-invalid', v.trim() && !one && many < 2 ? 'true' : 'false');
    if (one) { setSw($('smart-sw'), one.color); msg.textContent = t('msg_preview', { hex: hex(one.color) }); msg.className = 'hint'; }
    else { setSw($('smart-sw'), snap.base); msg.textContent = many > 1 ? t('msg_list', { n: many }) : ''; msg.className = 'hint'; }
  });
  $('smart').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); applyText(e.target.value); }
    if (e.key === 'Escape') { e.target.value = ''; $('smart-msg').textContent = ''; }
  });
  $('smart').addEventListener('paste', (e) => {
    const cd = e.clipboardData;
    if (!cd) return;
    const file = Array.prototype.find.call(cd.files || [], (f) => /^image\//.test(f.type));
    if (file) { e.preventDefault(); loadImageFile(file); return; }
    const text = cd.getData('text/plain');
    if (text && applyText(text, true)) e.preventDefault();
  });
  // Paste anywhere that is not a text field: a colour, a list, or an image.
  document.addEventListener('paste', (e) => {
    const tgt = e.target;
    if (tgt && (tgt.closest('input, textarea, [contenteditable]') || tgt.closest('dialog'))) return;
    const cd = e.clipboardData;
    if (!cd) return;
    const file = Array.prototype.find.call(cd.files || [], (f) => /^image\//.test(f.type));
    if (file) { e.preventDefault(); loadImageFile(file); return; }
    const text = cd.getData('text/plain');
    if (text) { e.preventDefault(); applyText(text, true); }
  });

  if (window.EyeDropper) {
    $('eyedropper').hidden = false;
    $('eyedropper').addEventListener('click', () => {
      new window.EyeDropper().open().then((r) => { const p = C.parse(r.sRGBHex); if (p) setBaseColor(p.color); }, () => {});
    });
  }

  /* ---------------- paste tray + history ---------------- */

  $('tray-close').addEventListener('click', () => { tray = null; $('smart-msg').textContent = ''; schedule(); });
  $('tray-gradient').addEventListener('click', () => { if (tray) replaceStops(tray); });
  $('tray-save').addEventListener('click', () => { if (tray) addLibrary({ type: 'palette', colors: tray.map(hex) }); });
  $('tray-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b || !tray) return;
    const i = +b.dataset.i;
    select({ kind: 'fixed', color: tray[i], name: () => t('n_paste', { n: i + 1 }) });
  });
  $('history').addEventListener('click', (e) => {
    const b = e.target.closest('[data-hex]');
    if (b) { const p = C.parse(b.dataset.hex); if (p) setBaseColor(p.color); }
  });

  /* ---------------- board controls ---------------- */

  $('theme-name').addEventListener('input', (e) => { theme.name = e.target.value.slice(0, 80); saveWorkSoon(); schedule(); });
  $('fmt-seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fmt]');
    if (!b) return;
    settings.fmt = b.dataset.fmt; saveSettings(); schedule();
  });
  $('mode-seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    theme.harmony.mode = b.dataset.mode;
    if (sel.kind === 'harmony') sel = { kind: 'base' };
    themeChanged();
  });
  $('count-seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-count]');
    if (!b) return;
    theme.harmony.count = +b.dataset.count;
    if (sel.kind === 'harmony') sel = { kind: 'base' };
    themeChanged();
  });
  $('spread').addEventListener('input', (e) => { theme.harmony.spread = +e.target.value; themeChanged(); });
  $('harm-row').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) select({ kind: 'harmony', i: +b.dataset.i }); });
  $('ramp').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) select({ kind: 'scale', i: +b.dataset.i }); });
  $('grad-steps').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) select({ kind: 'step', i: +b.dataset.i }); });
  $('copy-harmony').addEventListener('click', () => copy(listText(snap.harmony.colors), t('sec_harmonies').toLowerCase()));
  $('copy-scale').addEventListener('click', () => copy(snap.scale.map((s) => s.step + ': ' + fmt(s.color)).join('\n'), t('sec_scale').toLowerCase()));
  $('copy-css').addEventListener('click', () => copy('background: ' + snap.gradient.css + ';\nbackground: ' + snap.gradient.cssOklab + ';', 'CSS'));
  $('copy-steps').addEventListener('click', () => copy(listText(snap.gradient.steps), t('steps').toLowerCase()));

  // Readout
  $('ro-rows').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (b) copy(C.format(selected().color, b.dataset.f), b.dataset.f.toUpperCase());
  });
  $('act-base').addEventListener('click', () => setBaseColor(selected().color));
  $('act-gradient').addEventListener('click', () => addStop(selected().color));

  $('base-hex').addEventListener('click', () => copy(hex(snap.base), t('n_base').toLowerCase()));
  $('save-theme').addEventListener('click', () => {
    addLibrary({ type: 'theme', name: theme.name, theme: X.serializeTheme(theme) });
  });

  /* ---------------- gradient stops ---------------- */

  function replaceStops(colors) {
    const before = theme.gradient.stops.slice();
    const next = colors.slice(0, MAX_STOPS).map(C.quant);
    if (next.length === 1) next.push(next[0]);
    theme.gradient.stops = next;
    if (sel.kind === 'stop' || sel.kind === 'step') sel = { kind: 'base' };
    themeChanged();
    toast(t('gradient_replaced'), () => { theme.gradient.stops = before; themeChanged(); });
  }
  function addStop(c) {
    if (theme.gradient.stops.length >= MAX_STOPS) { toast(t('max_stops', { n: MAX_STOPS })); return; }
    theme.gradient.stops.push(C.quant(c));
    themeChanged();
  }
  $('stop-add-base').addEventListener('click', () => addStop(snap.base));
  $('stop-add-sel').addEventListener('click', () => addStop(selected().color));
  $('stop-reverse').addEventListener('click', () => { theme.gradient.stops.reverse(); themeChanged(); });
  $('grad-steps-n').addEventListener('input', (e) => { theme.gradient.steps = +e.target.value; themeChanged(); });
  $('save-gradient').addEventListener('click', () => addLibrary({ type: 'gradient', stops: theme.gradient.stops.map(hex) }));

  $('stops').addEventListener('click', (e) => {
    const row = e.target.closest('[data-i]');
    if (!row) return;
    const i = +row.dataset.i, act = e.target.closest('[data-act]');
    const s = theme.gradient.stops;
    if (!act) { if (e.target.closest('.sw')) select({ kind: 'stop', i }); return; }
    const a = act.dataset.act;
    if (a === 'up' && i > 0) { [s[i - 1], s[i]] = [s[i], s[i - 1]]; }
    else if (a === 'down' && i < s.length - 1) { [s[i + 1], s[i]] = [s[i], s[i + 1]]; }
    else if (a === 'del' && s.length > 2) { s.splice(i, 1); if (sel.kind === 'stop') sel = { kind: 'base' }; }
    else return;
    memo.stops = null;
    themeChanged();
  });
  // Typing in a stop: any format, applied live while valid, tidied on blur.
  $('stops').addEventListener('input', (e) => {
    const inp = e.target.closest('input');
    if (!inp) return;
    const i = +inp.closest('[data-i]').dataset.i, p = C.parse(inp.value, settings.fmt);
    inp.setAttribute('aria-invalid', p ? 'false' : 'true');
    if (p) { theme.gradient.stops[i] = C.quant(p.color); themeChanged(); }
  });
  $('stops').addEventListener('focusout', (e) => { if (e.target.matches('input')) { memo.stops = null; schedule(); } });
  $('stops').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });

  /* ---------------- contrast ---------------- */

  ['fg', 'bg'].forEach((k) => {
    const inp = $('cc-' + k);
    inp.addEventListener('input', () => {
      const p = C.parse(inp.value, settings.fmt);
      inp.setAttribute('aria-invalid', p ? 'false' : 'true');
      if (p) { theme.contrast[k] = C.quant(p.color); themeChanged(); }
    });
    inp.addEventListener('blur', () => { memo.cc = null; schedule(); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
  });
  $('tab-contrast').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cc]');
    if (!b) return;
    theme.contrast[b.dataset.cc] = C.quant(b.dataset.from === 'base' ? snap.base : selected().color);
    memo.cc = null;
    themeChanged();
  });
  $('cc-swap').addEventListener('click', () => {
    const k = theme.contrast;
    [k.fg, k.bg] = [k.bg, k.fg];
    memo.cc = null;
    themeChanged();
  });

  /* ---------------- image palette + eyedropper ---------------- */

  function loadImageFile(file) {
    showTab('image');
    if (!file || !/^image\//.test(file.type || '')) { toast(t('image_error')); return; }
    // data: URL, not blob: — the live CSP has no blob: in img-src.
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.onerror = () => toast(t('image_error'));
    reader.readAsDataURL(file);
  }
  function setImage(src) {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) { toast(t('image_error')); return; }
      // Eyedropper canvas: at most 4096 px and 16 MP (iOS Safari's canvas limit).
      const k = Math.min(1, 4096 / Math.max(w, h), Math.sqrt(16e6 / (w * h)));
      const pc = document.createElement('canvas');
      pc.width = Math.max(1, Math.round(w * k)); pc.height = Math.max(1, Math.round(h * k));
      const pctx = pc.getContext('2d', { willReadFrequently: true });
      pctx.drawImage(img, 0, 0, pc.width, pc.height);
      // Analysis canvas for k-means: 120 px on the long side.
      const a = Math.min(1, 120 / Math.max(w, h));
      const ac = document.createElement('canvas');
      ac.width = Math.max(1, Math.round(w * a)); ac.height = Math.max(1, Math.round(h * a));
      const actx = ac.getContext('2d', { willReadFrequently: true });
      actx.drawImage(img, 0, 0, ac.width, ac.height);
      image.pixels = actx.getImageData(0, 0, ac.width, ac.height).data;
      image.pick = pctx;
      image.pickW = pc.width; image.pickH = pc.height;
      // Seed from a sample of the file, not all of it (photos are ~10-30 MB of text).
      image.seed = C.hash32(src.length + '|' + src.slice(0, 4096) + src.slice(-4096));
      image.src = src;
      $('img').src = src;
      extractPalette();
    };
    img.onerror = () => toast(t('image_error'));
    img.src = src;
  }
  function extractPalette() {
    if (!image.pixels) return;
    image.palette = C.kmeans(image.pixels, image.k, image.seed ^ image.k);
    memo.img = null;
    schedule();
  }
  function clearImage() {
    Object.assign(image, { src: null, palette: [], pick: null, pixels: null, eyedrop: false });
    $('img').removeAttribute('src');
    memo.img = null;
    schedule();
  }
  const openPicker = () => $('img-file').click();
  $('img-file').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) loadImageFile(f); });
  $('dropzone').addEventListener('click', openPicker);
  $('dropzone').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } });
  $('img-change').addEventListener('click', openPicker);
  $('img-clear').addEventListener('click', clearImage);
  $('k-seg').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) { image.k = +b.dataset.k; extractPalette(); } });
  $('img-palette').addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const i = +b.dataset.i;
    select({ kind: 'fixed', color: image.palette[i], name: () => t('n_image', { n: i + 1 }) });
  });
  $('img-gradient').addEventListener('click', () => { if (image.palette.length) replaceStops(image.palette); });
  $('img-save').addEventListener('click', () => { if (image.palette.length) addLibrary({ type: 'palette', colors: image.palette.map(hex) }); });
  $('eyedrop-btn').addEventListener('click', () => { image.eyedrop = !image.eyedrop; memo.img = null; schedule(); });

  function sampleAt(e) {
    const img = $('img'), r = img.getBoundingClientRect(), wr = $('img-wrap').getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (!image.pick || x < 0 || y < 0 || x >= r.width || y >= r.height) return null;
    const px = Math.min(image.pickW - 1, Math.floor(x / r.width * image.pickW));
    const py = Math.min(image.pickH - 1, Math.floor(y / r.height * image.pickH));
    const d = image.pick.getImageData(px, py, 1, 1).data;
    if (d[3] < 13) return null; // transparent: its RGB is meaningless
    // x/y place the cursor inside .img-wrap, where the image may be centred.
    return { x: e.clientX - wr.left, y: e.clientY - wr.top, color: { r: d[0], g: d[1], b: d[2], a: d[3] / 255 } };
  }
  function showCursor(s) {
    const cur = $('eyedrop-cursor');
    cur.hidden = !s;
    if (!s) return;
    cur.style.left = s.x + 'px'; cur.style.top = s.y + 'px';
    setSw($('eyedrop-ring'), s.color);
    $('eyedrop-tag').textContent = hex(s.color);
  }
  $('img-wrap').addEventListener('pointermove', (e) => { if (image.eyedrop) showCursor(sampleAt(e)); });
  $('img-wrap').addEventListener('pointerleave', () => showCursor(null));
  $('img-wrap').addEventListener('pointerup', (e) => {
    if (!image.eyedrop) return;
    const s = sampleAt(e);
    if (s) setBaseColor(s.color);
  });

  // Drop an image anywhere on the page.
  document.addEventListener('dragover', (e) => {
    if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) {
      e.preventDefault();
      $('dropzone').classList.add('drag-over');
    }
  });
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) $('dropzone').classList.remove('drag-over'); });
  document.addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    $('dropzone').classList.remove('drag-over');
    if (!f) return;
    e.preventDefault();
    if (/^image\//.test(f.type)) loadImageFile(f);
    else importFile(f);
  });

  /* ---------------- library ---------------- */

  const sigOf = (it) => it.type + ':' + (it.type === 'theme' ? JSON.stringify(Object.assign({}, it.theme, { name: '' })) : (it.colors || it.stops || []).join(','));
  // Untrusted item (storage, file, the old app's format) -> clean item or null.
  function normalizeItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) : '';
    const created = Number.isFinite(Number(raw.created)) ? Number(raw.created) : Date.now();
    const id = typeof raw.id === 'string' && raw.id.length < 40 ? raw.id : uid();
    if (raw.type === 'theme' && raw.theme && typeof raw.theme === 'object') {
      const th = X.normalizeTheme(raw.theme);
      return { id, type: 'theme', name: name || th.name, created, theme: X.serializeTheme(th) };
    }
    // Old app: a palette saved from Harmonies carried its settings in `meta`.
    if (raw.type === 'palette' && raw.meta && raw.meta.type === 'harmony' && raw.meta.baseHsv) {
      const m = raw.meta;
      const th = X.normalizeTheme({ name, base: Object.assign({}, m.baseHsv, { a: m.alpha }), harmony: { mode: m.mode, count: m.count, spread: m.spread } });
      return { id, type: 'theme', name, created, theme: X.serializeTheme(th) };
    }
    const list = (arr, max) => (Array.isArray(arr) ? arr.slice(0, max).map(X.readColor).filter(Boolean).map(hex) : []);
    if (raw.type === 'gradient') {
      const stops = list(raw.stops, MAX_STOPS);
      return stops.length >= 2 ? { id, type: 'gradient', name, created, stops } : null;
    }
    if (raw.type === 'palette') {
      const colors = list(raw.colors, 64);
      return colors.length ? { id, type: 'palette', name, created, colors } : null;
    }
    return null;
  }
  function loadLibrary() {
    let raw = store.json(KEY.lib);
    if (!Array.isArray(raw)) {
      // One-time copy of the old app's library (cw-library is left untouched).
      const old = store.json(OLD.lib);
      raw = Array.isArray(old) ? old : [];
      if (raw.length) setTimeout(() => saveLibrary(), 0);
    }
    const seen = new Set();
    return raw.map(normalizeItem).filter((it) => it && !seen.has(it.id) && seen.add(it.id));
  }
  // Returns false (and says so) when the browser will not store it.
  function saveLibrary() {
    const saved = store.set(KEY.lib, JSON.stringify(library));
    if (!saved) toast(t('storage_full'));
    memo.lib = null;
    schedule();
    return saved;
  }
  function defaultName(type) {
    const n = library.filter((it) => it.type === type).length + 1;
    return t('default_' + type, { n });
  }
  function addLibrary(item) {
    const it = normalizeItem(Object.assign({ id: uid(), created: Date.now() }, item));
    if (!it) return;
    if (!it.name) it.name = defaultName(it.type);
    library.unshift(it);
    if (saveLibrary()) toast(t('saved'), () => { library = library.filter((x) => x.id !== it.id); saveLibrary(); });
  }
  function loadItem(it) {
    if (it.type === 'theme') {
      const before = X.serializeTheme(theme);
      theme = X.normalizeTheme(Object.assign({}, it.theme, { name: it.theme.name || it.name }));
      sel = { kind: 'base' };
      themeChanged();
      toast(t('loaded', { name: it.name }), () => { theme = X.normalizeTheme(before); sel = { kind: 'base' }; themeChanged(); });
    } else {
      replaceStops((it.stops || it.colors).map((h) => C.parse(h).color));
    }
  }
  function deleteItem(it) {
    const at = library.indexOf(it);
    library = library.filter((x) => x !== it);
    saveLibrary();
    toast(t('deleted', { name: it.name }), () => { library.splice(Math.min(at, library.length), 0, it); saveLibrary(); });
  }
  $('lib-filter').addEventListener('click', (e) => { const b = e.target.closest('[data-filter]'); if (b) { libFilter = b.dataset.filter; memo.lib = null; schedule(); } });
  $('lib-grid').addEventListener('click', (e) => {
    const card = e.target.closest('[data-id]');
    if (!card) return;
    const it = library.find((x) => x.id === card.dataset.id);
    if (!it) return;
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;
    if (a === 'load') loadItem(it);
    else if (a === 'del') deleteItem(it);
    else if (a === 'rename') { renaming = it.id; memo.lib = null; schedule(); }
    else if (a === 'color') {
      const i = +act.dataset.i, list = it.colors || it.stops;
      select({ kind: 'fixed', color: C.parse(list[i]).color, name: t('n_library', { name: it.name, n: i + 1 }) });
    }
  });
  function finishRename(inp, commit) {
    const it = library.find((x) => x.id === renaming);
    renaming = null;
    if (it && commit && inp.value.trim()) { it.name = inp.value.trim().slice(0, 80); saveLibrary(); }
    else { memo.lib = null; schedule(); }
  }
  $('lib-grid').addEventListener('keydown', (e) => {
    if (!e.target.matches('.lib-rename')) return;
    if (e.key === 'Enter') finishRename(e.target, true);
    if (e.key === 'Escape') finishRename(e.target, false);
  });
  $('lib-grid').addEventListener('focusout', (e) => { if (e.target.matches('.lib-rename') && renaming) finishRename(e.target, true); });

  $('lib-import').addEventListener('click', () => $('lib-file').click());
  $('lib-file').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) importFile(f); });
  $('lib-export').addEventListener('click', () => {
    download('color-theme-library-' + new Date().toISOString().slice(0, 10) + '.json',
      JSON.stringify({ type: 'rvry-color-library', version: 2, exported: new Date().toISOString(), items: library }, null, 2), 'application/json');
    toast(t('downloaded', { file: 'library .json' }));
  });

  function importFile(file) {
    if (file.size > 5e6) { toast(t('import_bad')); return; }
    const reader = new FileReader();
    reader.onerror = () => toast(t('import_bad'));
    reader.onload = () => {
      const text = String(reader.result || '');
      let items = [];
      const trimmed = text.trim();
      if (/^[[{]/.test(trimmed)) {
        let data = null;
        try { data = JSON.parse(trimmed); } catch (err) { data = null; }
        if (data) {
          if (data.type === 'rvry-color-theme' && data.theme) items = [{ type: 'theme', name: data.theme.name, theme: data.theme }];
          else items = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];
        }
      }
      if (!items.length) {
        const colors = C.extract(text);
        if (colors.length) items = [{ type: 'palette', name: file.name.replace(/\.[^.]+$/, '').slice(0, 80), colors: colors.map((x) => hex(x.color)) }];
      }
      const have = new Set(library.map(sigOf));
      let added = 0;
      items.map(normalizeItem).filter(Boolean).forEach((it) => {
        it.id = uid();
        if (!it.name) it.name = defaultName(it.type);
        const s = sigOf(it);
        if (have.has(s)) return;
        have.add(s);
        library.unshift(it);
        added++;
      });
      if (!added && !items.length) { toast(t('import_none')); return; }
      showTab('library');
      if (saveLibrary()) toast(t('imported', { n: added }));
    };
    reader.readAsText(file);
  }

  /* ---------------- tabs, menus, theme, language ---------------- */

  function showTab(name) {
    if (TABS.indexOf(name) < 0) return;
    settings.tab = name; saveSettings();
    memo.tabs = null;
    schedule();
  }
  $('tabbar').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
  $('tabbar').addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!d && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const i = TABS.indexOf(settings.tab);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + d + TABS.length) % TABS.length;
    showTab(TABS[next]);
    requestAnimationFrame(() => $('tab-btn-' + TABS[next]).focus());
  });

  // Text size menu
  const sizeBtn = $('size-btn'), sizeList = $('size-list');
  function openSize(open, focus) {
    sizeList.hidden = !open;
    sizeBtn.setAttribute('aria-expanded', String(open));
    if (open && focus) (sizeList.querySelector('[aria-checked="true"]') || sizeList.firstElementChild).focus();
  }
  sizeBtn.addEventListener('click', () => openSize(sizeList.hidden, true));
  sizeBtn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); openSize(true, true); } });
  sizeList.addEventListener('click', (e) => {
    const b = e.target.closest('[data-size]');
    if (!b) return;
    settings.size = b.dataset.size; saveSettings();
    doc.setAttribute('data-ui-size', settings.size);
    openSize(false); sizeBtn.focus();
    memo.size = null; wheel.size = 0; layoutWheel(); schedule();
  });
  sizeList.addEventListener('keydown', (e) => {
    const items = Array.prototype.slice.call(sizeList.children), i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); openSize(false); sizeBtn.focus(); }
    else if (e.key === 'Tab') openSize(false);
  });
  document.addEventListener('pointerdown', (e) => { if (!sizeList.hidden && !e.target.closest('#size-menu')) openSize(false); });

  // Light / dark: same key and behaviour as RVRY_ASCII (absent = follow the OS).
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if (!doc.getAttribute('data-theme')) {
    const old = store.get(OLD.theme); // the old app's explicit choice
    if ((old === 'light' || old === 'dark') && !store.get(KEY.theme)) doc.setAttribute('data-theme', old);
  }
  const currentMode = () => doc.getAttribute('data-theme') || (mq && mq.matches ? 'dark' : 'light');
  $('theme-toggle').addEventListener('click', () => {
    const next = currentMode() === 'dark' ? 'light' : 'dark';
    doc.setAttribute('data-theme', next);
    store.set(KEY.theme, next);
    memo.mode = null; schedule();
  });
  if (mq) {
    const onMq = () => { memo.mode = null; schedule(); };
    if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
  }

  document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
    settings.lang = b.dataset.lang; saveSettings();
    t = I.translator(settings.lang);
    for (const k in memo) delete memo[k];
    schedule(true);
  }));
  function applyStrings() {
    doc.lang = settings.lang;
    document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria]').forEach((n) => n.setAttribute('aria-label', t(n.dataset.i18nAria)));
    document.querySelectorAll('[data-i18n-title]').forEach((n) => n.setAttribute('title', t(n.dataset.i18nTitle)));
    document.querySelectorAll('[data-i18n-ph]').forEach((n) => n.setAttribute('placeholder', t(n.dataset.i18nPh)));
    document.title = t('tool_name');
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && image.eyedrop) { image.eyedrop = false; showCursor(null); memo.img = null; schedule(); }
    if (!(e.ctrlKey || e.metaKey) || e.altKey || dlg.open) return;
    // Text fields keep their own undo / copy.
    if (e.target.closest && e.target.closest('input[type="text"], textarea, [contenteditable]')) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
    else if (k === 'c' && (!window.getSelection || window.getSelection().isCollapsed)) {
      e.preventDefault();
      const cur = selected();
      copy(fmt(cur.color), cur.name);
    }
  });

  /* ---------------- export dialog ---------------- */

  const dlg = $('export-dialog');
  let fontsReady = null;
  const waitFonts = () => fontsReady || (fontsReady = (document.fonts && document.fonts.load
    ? Promise.all([document.fonts.load('40px HaraldText'), document.fonts.load('40px HaraldMono')]).catch(() => null)
    : Promise.resolve()));
  let sheetTimer = 0;
  function drawSheet() {
    clearTimeout(sheetTimer);
    sheetTimer = setTimeout(() => waitFonts().then(() => {
      X.renderSheet($('sheet'), X.snapshot(theme), t, { dark: settings.sheet === 'dark' });
    }), 60);
  }
  $('export-open').addEventListener('click', () => {
    $('exp-name').value = theme.name;
    $('exp-msg').textContent = '';
    memo.exp = null; render();
    drawSheet();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  });
  $('export-close').addEventListener('click', () => dlg.close ? dlg.close() : dlg.removeAttribute('open'));
  dlg.addEventListener('click', (e) => { if (e.target === dlg && dlg.close) dlg.close(); }); // backdrop
  $('exp-name').addEventListener('input', (e) => { theme.name = e.target.value.slice(0, 80); saveWorkSoon(); schedule(); drawSheet(); });
  $('exp-sheet').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sheet]');
    if (!b) return;
    settings.sheet = b.dataset.sheet; saveSettings(); memo.exp = null; schedule(); drawSheet();
  });
  dlg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-file]');
    if (!b) return;
    const S = X.snapshot(theme), base = slug(theme.name) + '-' + new Date().toISOString().slice(0, 10);
    switch (b.dataset.file) {
      case 'png':
        waitFonts().then(() => {
          const cv = document.createElement('canvas');
          X.renderSheet(cv, S, t, { dark: settings.sheet === 'dark' });
          cv.toBlob((blob) => { if (blob) download(base + '.png', blob); else $('exp-msg').textContent = t('exp_too_big'); }, 'image/png');
        });
        break;
      case 'txt': download(base + '.txt', X.textFile(S, t), 'text/plain;charset=utf-8'); break;
      case 'css': download(base + '.css', X.cssFile(S, t), 'text/css;charset=utf-8'); break;
      case 'gpl': download(base + '.gpl', X.gplFile(S, t), 'text/plain;charset=utf-8'); break;
      case 'ase': download(base + '.ase', X.aseFile(S, t), 'application/octet-stream'); break;
      case 'procreate': download(base + '.swatches', X.procreateFile(S, t), 'application/zip'); break;
      case 'json': download(base + '.json', X.themeJson(theme), 'application/json'); break;
      case 'copy': copy(X.textFile(S, t)); break;
    }
  });

  /* ---------------- render ---------------- */

  function render() {
    frame = 0;
    if (themeDirty) { snap = X.snapshot(theme); themeDirty = false; }
    const S = snap, b = theme.base, f = settings.fmt;
    const cur = selected();

    if (changed('strings', settings.lang)) applyStrings();
    if (changed('mode', currentMode() + settings.lang)) {
      const m = currentMode(), track = $('theme-toggle').querySelector('.tt-track');
      track.classList.toggle('tt-dark', m === 'dark');
      track.classList.toggle('tt-light', m === 'light');
      $('theme-toggle').title = t(m === 'dark' ? 'to_light' : 'to_dark');
    }
    if (changed('size', settings.size + settings.lang)) {
      doc.setAttribute('data-ui-size', settings.size);
      $('size-label').textContent = t('size_' + settings.size);
      Array.prototype.forEach.call(sizeList.children, (n) => n.setAttribute('aria-checked', String(n.dataset.size === settings.size)));
    }
    document.querySelectorAll('[data-lang]').forEach((n) => n.setAttribute('aria-pressed', String(n.dataset.lang === settings.lang)));

    // Picker
    const baseSig = [b.h, b.s, b.v, b.a].join();
    if (changed('picker', baseSig + wheel.size)) {
      if (memo.svHue !== b.h) { drawSV(b.h); memo.svHue = b.h; }
      const svDot = $('sv-dot');
      svDot.style.left = (b.s * 100) + '%'; svDot.style.top = ((1 - b.v) * 100) + '%';
      svDot.style.setProperty('--sw', C.toCss(C.hsvToRgb(b.h, b.s, b.v)));
      const vals = { 'sl-h': Math.round(b.h) % 360, 'sl-s': Math.round(b.s * 100), 'sl-v': Math.round(b.v * 100), 'sl-a': Math.round(b.a * 100) };
      for (const id in vals) if (!isTyping($(id)) || $(id).value === '') $(id).value = vals[id];
      $('v-h').textContent = vals['sl-h'] + '°';
      $('v-s').textContent = vals['sl-s'] + '%';
      $('v-v').textContent = vals['sl-v'] + '%';
      $('v-a').textContent = vals['sl-a'] + '%';
      const tr = document.querySelector('.sliders').style; // scoped: vars on the app root restyle every element
      tr.setProperty('--pure', C.toCss(C.hsvToRgb(b.h, 1, 1)));
      tr.setProperty('--sat0', C.toCss(C.hsvToRgb(b.h, 0, b.v)));
      tr.setProperty('--sat1', C.toCss(C.hsvToRgb(b.h, 1, b.v)));
      tr.setProperty('--val1', C.toCss(C.hsvToRgb(b.h, b.s, 1)));
      tr.setProperty('--opaque', C.toCss(C.hsvToRgb(b.h, b.s, b.v)));
      tr.setProperty('--clear', C.toCss(C.hsvToRgb(b.h, b.s, b.v, 0)));
      $('wheel-ring').setAttribute('aria-valuenow', vals['sl-h']);
      $('wheel-ring').setAttribute('aria-valuetext', vals['sl-h'] + '°');
      $('sv').setAttribute('aria-valuenow', vals['sl-s']);
      $('sv').setAttribute('aria-valuetext', t('saturation') + ' ' + vals['sl-s'] + '%, ' + t('brightness') + ' ' + vals['sl-v'] + '%');
      setSw($('brand-mark'), S.base);
      $('base-hex').textContent = hex(S.base);
      if (!$('smart').value) setSw($('smart-sw'), S.base);
    }
    // Wheel markers: current hue + harmony hues
    const hues = C.harmonyHues(b.h, theme.harmony.mode, theme.harmony.count, theme.harmony.spread);
    if (changed('marks', hues.join() + wheel.size + b.h)) {
      const mid = (wheel.outer + wheel.inner) / 2, c = wheel.size / 2;
      const pt = (h) => { const a = (h - 90) * Math.PI / 180; return [c + Math.cos(a) * mid, c + Math.sin(a) * mid]; };
      const marks = sync($('wheel-marks'), hues.length, () => el('span', { class: 'mark' }));
      hues.forEach((h, i) => {
        const p = pt(h), m = marks[i];
        m.style.left = p[0] + 'px'; m.style.top = p[1] + 'px';
        m.style.setProperty('--sw', C.toCss(C.hsvToRgb(h, 1, 1)));
        m.classList.toggle('main', i === S.harmony.baseIndex);
      });
      const pts = hues.map(pt);
      if (theme.harmony.mode !== 'analogous' && pts.length > 2) pts.push(pts[0]);
      const svg = $('wheel-lines');
      svg.setAttribute('viewBox', `0 0 ${wheel.size} ${wheel.size}`);
      const line = pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
      svg.innerHTML = pts.length > 1 ? `<polyline points="${line}" class="l1"/><polyline points="${line}" class="l2"/>` : '';
    }

    // Board header
    if (!isTyping($('theme-name')) && $('theme-name').value !== theme.name) $('theme-name').value = theme.name;
    if (changed('fmt', f)) $('fmt-seg').querySelectorAll('[data-fmt]').forEach((n) => n.setAttribute('aria-pressed', String(n.dataset.fmt === f)));

    // Readout
    const roSig = hex(cur.color) + cur.name + f + settings.lang + !!cur.base;
    if (changed('ro', roSig)) {
      setSw($('ro-sw'), cur.color);
      $('ro-name').textContent = cur.name;
      const w = C.contrast(C.WHITE, cur.color), k = C.contrast(C.BLACK, cur.color);
      $('ro-note').textContent = `${t('on_white')} ${C.num(w, 2)} ${t('grade_' + C.grade(w))} · ${t('on_black')} ${C.num(k, 2)} ${t('grade_' + C.grade(k))}`;
      const rows = sync($('ro-rows'), C.FORMATS.length, (i) => el('button', { type: 'button', class: 'ro-row', 'data-f': C.FORMATS[i] }, [
        el('span', { class: 'ro-k' }, [C.FORMATS[i].toUpperCase(), el('span', { class: 'ro-c' })]), el('span', { class: 'ro-v' })
      ]));
      C.FORMATS.forEach((fm, i) => {
        rows[i].children[1].textContent = C.format(cur.color, fm);
        rows[i].querySelector('.ro-c').textContent = t('copy');
        rows[i].classList.toggle('on', fm === f);
        rows[i].setAttribute('aria-label', t('copy') + ' ' + fm.toUpperCase() + ' ' + C.format(cur.color, fm));
      });
      $('act-base').disabled = !!cur.base;
    }

    // Harmonies
    const hSig = S.harmony.colors.map(hex).join() + f + (sel.kind === 'harmony' ? sel.i : -1) + settings.lang + theme.harmony.mode + theme.harmony.count + theme.harmony.spread;
    if (changed('harm', hSig)) {
      const chips = sync($('harm-row'), S.harmony.colors.length, (i) => el('button', { type: 'button', class: 'chip', 'data-i': i }, [el('span', { class: 'sw chip-sw' }), el('span', { class: 'chip-label' })]));
      S.harmony.colors.forEach((c, i) => {
        const n = chips[i], name = i === S.harmony.baseIndex ? t('n_base') : t('n_harmony', { n: i + 1 });
        setSw(n.firstChild, c);
        n.lastChild.textContent = fmt(c);
        n.classList.toggle('on', sel.kind === 'harmony' && sel.i === i);
        n.classList.toggle('is-base', i === S.harmony.baseIndex);
        n.title = t('click_select', { name }) + ' · ' + fmt(c);
      });
      $('mode-seg').querySelectorAll('[data-mode]').forEach((n) => n.setAttribute('aria-pressed', String(n.dataset.mode === theme.harmony.mode)));
      $('count-seg').querySelectorAll('[data-count]').forEach((n) => n.setAttribute('aria-pressed', String(+n.dataset.count === theme.harmony.count)));
      $('count-seg').hidden = theme.harmony.mode !== 'analogous';
      const max = theme.harmony.mode === 'split' ? 60 : 90;
      $('spread-wrap').hidden = !S.harmony.usesSpread;
      $('spread').max = max;
      const sp = Math.min(theme.harmony.spread, max);
      if (!isTyping($('spread'))) $('spread').value = sp;
      $('v-spread').textContent = sp + '°';
    }

    // Tone scale
    const sSig = S.scale.map((s) => hex(s.color)).join() + S.nearest + (sel.kind === 'scale' ? sel.i : -1) + settings.lang;
    if (changed('scale', sSig)) {
      const steps = sync($('ramp'), S.scale.length, (i) => el('button', { type: 'button', class: 'ramp-step', 'data-i': i }, [el('span', { class: 'ramp-num' })]));
      S.scale.forEach((s, i) => {
        const n = steps[i];
        setSw(n, s.color);
        n.style.color = inkOn(s.color);
        n.firstChild.textContent = s.step;
        n.classList.toggle('on', sel.kind === 'scale' && sel.i === i);
        n.classList.toggle('near', i === S.nearest);
        n.title = `${t('n_scale', { n: s.step })} · ${hex(s.color)} · ${t('on_white')} ${C.num(s.white, 1)} · ${t('on_black')} ${C.num(s.black, 1)}`;
        n.setAttribute('aria-label', t('click_select', { name: t('n_scale', { n: s.step }) }) + ', ' + hex(s.color));
      });
    }

    // Gradient bar + steps
    const g = S.gradient;
    const gSig = g.stops.map(hex).join() + '|' + g.steps.map(hex).join() + f + (sel.kind === 'step' ? sel.i : -1) + settings.lang;
    if (changed('grad', gSig)) {
      $('grad-bar').style.setProperty('--grad', C.gradientCss(g.stops, 33, 'to right'));
      $('grad-sub').textContent = t('grad_line', { stops: g.stops.length, steps: g.steps.length });
      const box = $('grad-steps');
      // Labels only when each swatch is wide enough to show one.
      box.classList.toggle('compact', g.steps.length > 12 || (box.clientWidth || 600) / g.steps.length < 56);
      const chips = sync(box, g.steps.length, (i) => el('button', { type: 'button', class: 'chip', 'data-i': i }, [el('span', { class: 'sw chip-sw' }), el('span', { class: 'chip-label' })]));
      g.steps.forEach((c, i) => {
        const n = chips[i];
        setSw(n.firstChild, c);
        n.lastChild.textContent = fmt(c);
        n.classList.toggle('on', sel.kind === 'step' && sel.i === i);
        n.title = t('click_select', { name: t('n_step', { n: i + 1 }) }) + ' · ' + fmt(c);
      });
      $('v-steps').textContent = theme.gradient.steps;
      if (!isTyping($('grad-steps-n'))) $('grad-steps-n').value = theme.gradient.steps;
    }

    // Stops editor
    const stSig = g.stops.map(hex).join() + f + settings.lang + (sel.kind === 'stop' ? sel.i : -1);
    if (changed('stops', stSig)) {
      const rows = sync($('stops'), g.stops.length, (i) => el('div', { class: 'stop-row', 'data-i': i }, [
        el('button', { type: 'button', class: 'sw stop-sw' }),
        el('input', { type: 'text', spellcheck: 'false', autocomplete: 'off' }),
        el('button', { type: 'button', class: 'icon-btn', 'data-act': 'up', text: '↑' }),
        el('button', { type: 'button', class: 'icon-btn', 'data-act': 'down', text: '↓' }),
        el('button', { type: 'button', class: 'icon-btn', 'data-act': 'del', text: '×' })
      ]));
      g.stops.forEach((c, i) => {
        const r = rows[i], inp = r.children[1];
        setSw(r.children[0], c);
        r.children[0].classList.toggle('on', sel.kind === 'stop' && sel.i === i);
        r.children[0].setAttribute('aria-label', t('click_select', { name: t('stop_n', { n: i + 1 }) }));
        if (!isTyping(inp)) { inp.value = fmt(c); inp.setAttribute('aria-invalid', 'false'); }
        inp.setAttribute('aria-label', t('stop_n', { n: i + 1 }));
        r.children[2].disabled = i === 0; r.children[2].setAttribute('aria-label', t('move_up'));
        r.children[3].disabled = i === g.stops.length - 1; r.children[3].setAttribute('aria-label', t('move_down'));
        r.children[4].disabled = g.stops.length <= 2; r.children[4].setAttribute('aria-label', t('remove'));
      });
      $('stop-add-base').disabled = $('stop-add-sel').disabled = g.stops.length >= MAX_STOPS;
    }

    // Contrast
    const k = S.contrast;
    if (changed('cc', hex(k.fg) + hex(k.bg) + f + settings.lang)) {
      ['fg', 'bg'].forEach((s) => {
        setSw($('cc-' + s + '-sw'), k[s]);
        if (!isTyping($('cc-' + s))) { $('cc-' + s).value = fmt(k[s]); $('cc-' + s).setAttribute('aria-invalid', 'false'); }
      });
      const bg = C.flatten(k.bg, C.WHITE), fg = C.flatten(k.fg, bg);
      $('cc-preview').style.background = C.toCss(bg);
      $('cc-preview').style.color = C.toCss(fg);
      $('cc-ratio').textContent = C.num(k.ratio, 2) + ':1';
      $('cc-badge').textContent = t('grade_' + k.grade);
      $('cc-badge').className = 'cc-badge g-' + k.grade;
      const r = k.ratio;
      const rowsData = [[t('normal_text'), r >= 4.5, r >= 7], [t('large_text'), r >= 3, r >= 4.5], [t('ui_graphics'), r >= 3, null]];
      const rows = sync($('cc-table'), 3, () => el('div', { class: 'cc-tr' }, [el('span', { class: 'cc-td' }), el('span', { class: 'pill' }), el('span', { class: 'pill' })]));
      rowsData.forEach((d, i) => {
        rows[i].children[0].textContent = d[0];
        rows[i].children[1].textContent = 'AA ' + (d[1] ? '✓' : '✕');
        rows[i].children[1].className = 'pill ' + (d[1] ? 'pass' : 'fail');
        rows[i].children[2].textContent = 'AAA ' + (d[2] == null ? '—' : d[2] ? '✓' : '✕');
        rows[i].children[2].className = 'pill ' + (d[2] == null ? 'na' : d[2] ? 'pass' : 'fail');
      });
    }

    // Image
    const iSig = (image.src ? image.src.length : 0) + '|' + image.palette.map(hex).join() + image.eyedrop + image.k + f + settings.lang + (sel.kind === 'fixed' ? hex(sel.color) : '');
    if (changed('img', iSig)) {
      $('dropzone').hidden = !!image.src;
      $('img-area').hidden = !image.src;
      $('img-wrap').classList.toggle('eyedrop', image.eyedrop);
      $('eyedrop-btn').setAttribute('aria-pressed', String(image.eyedrop));
      $('eyedrop-hint').textContent = image.eyedrop ? t('eyedrop_on') : '';
      if (!image.eyedrop) showCursor(null);
      $('k-seg').querySelectorAll('[data-k]').forEach((n) => n.setAttribute('aria-pressed', String(+n.dataset.k === image.k)));
      const chips = sync($('img-palette'), image.palette.length, (i) => el('button', { type: 'button', class: 'chip', 'data-i': i }, [el('span', { class: 'sw chip-sw' }), el('span', { class: 'chip-label' })]));
      image.palette.forEach((c, i) => {
        setSw(chips[i].firstChild, c);
        chips[i].lastChild.textContent = fmt(c);
        chips[i].classList.toggle('on', sel.kind === 'fixed' && C.same(sel.color, c));
        chips[i].title = t('click_select', { name: t('n_image', { n: i + 1 }) }) + ' · ' + fmt(c);
      });
      $('img-gradient').disabled = $('img-save').disabled = image.palette.length === 0;
    }

    // Paste tray
    const trSig = tray ? tray.map(hex).join() + settings.lang : '';
    if (changed('tray', trSig)) {
      $('tray').hidden = !tray;
      if (tray) {
        $('tray-title').textContent = t('msg_list', { n: tray.length });
        const chips = sync($('tray-chips'), tray.length, (i) => el('button', { type: 'button', class: 'sw mini', 'data-i': i }));
        tray.forEach((c, i) => { setSw(chips[i], c); chips[i].title = t('n_paste', { n: i + 1 }) + ' · ' + hex(c); });
      }
    }

    // History
    if (changed('hist', history.join() + settings.lang)) {
      $('history-wrap').hidden = history.length < 2;
      const chips = sync($('history'), history.length, () => el('button', { type: 'button', class: 'sw mini' }));
      history.forEach((h, i) => {
        setSw(chips[i], C.parse(h).color);
        chips[i].dataset.hex = h;
        chips[i].title = t('n_history') + ' · ' + h;
        chips[i].setAttribute('aria-label', t('n_history') + ' ' + h);
      });
    }

    // Tabs
    if (changed('tabs', settings.tab)) {
      TABS.forEach((name) => {
        const on = name === settings.tab;
        $('tab-btn-' + name).setAttribute('aria-selected', String(on));
        $('tab-btn-' + name).tabIndex = on ? 0 : -1;
        $('tab-' + name).hidden = !on;
      });
    }

    // Library
    const lSig = library.length + '|' + library.map((it) => it.id + it.name).join() + libFilter + settings.lang + f + renaming;
    if (changed('lib', lSig)) renderLibrary();

    // Density: re-check only when the layout's inputs change.
    if (changed('fit', [innerWidth, innerHeight, settings.size, settings.lang, settings.tab, image.palette.length, !!image.src,
      S.harmony.colors.length, g.steps.length, g.stops.length, history.length > 1, !!cur.base, library.length, CANVAS.matches].join())) fitDensity();

    // Export dialog bits
    if (changed('exp', settings.sheet + settings.lang)) {
      $('exp-sheet').querySelectorAll('[data-sheet]').forEach((n) => n.setAttribute('aria-pressed', String(n.dataset.sheet === settings.sheet)));
    }
  }

  function renderLibrary() {
    const grid = $('lib-grid');
    grid.textContent = '';
    $('lib-filter').querySelectorAll('[data-filter]').forEach((n) => n.setAttribute('aria-pressed', String(n.dataset.filter === libFilter)));
    $('lib-empty').hidden = library.length > 0;
    $('lib-export').disabled = library.length === 0;
    library.filter((it) => libFilter === 'all' || it.type === libFilter).forEach((it) => {
      const prev = el('div', { class: 'lib-prev' });
      if (it.type === 'theme') {
        const th = X.normalizeTheme(it.theme), S = X.snapshot(th);
        const row = el('div', { class: 'lib-strip' });
        S.harmony.colors.forEach((c) => { const s = el('span', { class: 'sw' }); setSw(s, c); row.appendChild(s); });
        const ramp = el('div', { class: 'lib-strip thin' });
        S.scale.forEach((s) => { const n = el('span', { class: 'sw' }); setSw(n, s.color); ramp.appendChild(n); });
        const bar = el('div', { class: 'lib-bar sw' });
        bar.style.setProperty('--grad', C.gradientCss(S.gradient.stops, 17, 'to right'));
        prev.append(row, ramp, bar);
      } else if (it.type === 'gradient') {
        const bar = el('div', { class: 'lib-bar sw tall' });
        bar.style.setProperty('--grad', C.gradientCss(it.stops.map((h) => C.parse(h).color), 17, 'to right'));
        prev.appendChild(bar);
      } else {
        const row = el('div', { class: 'lib-strip' });
        it.colors.forEach((h, i) => {
          const s = el('button', { type: 'button', class: 'sw', 'data-act': 'color', 'data-i': i, title: h, 'aria-label': t('click_select', { name: t('n_library', { name: it.name, n: i + 1 }) }) });
          setSw(s, C.parse(h).color);
          row.appendChild(s);
        });
        prev.appendChild(row);
      }
      const count = it.type === 'theme' ? '' : ' · ' + (it.colors || it.stops).length;
      const name = renaming === it.id
        ? el('input', { type: 'text', class: 'lib-rename', value: it.name, maxlength: 80, 'aria-label': t('rename') })
        : el('button', { type: 'button', class: 'lib-name', 'data-act': 'rename', title: t('rename'), text: it.name });
      grid.appendChild(el('div', { class: 'lib-card', 'data-id': it.id }, [
        prev,
        el('div', { class: 'lib-meta' }, [
          name,
          el('span', { class: 'lib-type', text: t('t_' + it.type) + count }),
          el('div', { class: 'lib-actions' }, [
            el('button', { type: 'button', class: 'btn small', 'data-act': 'load', text: it.type === 'palette' ? t('use_gradient') : t('load') }),
            el('button', { type: 'button', class: 'icon-btn', 'data-act': 'del', 'aria-label': t('delete') + ' ' + it.name, title: t('delete'), text: '×' })
          ])
        ])
      ]));
    });
    if (renaming) {
      const inp = grid.querySelector('.lib-rename');
      if (inp) { inp.focus(); inp.select(); }
    }
  }

  /* ---------------- one-screen fit ---------------- */

  // Desktop layout: if a column would overflow (large text on a small
  // window), step up the density classes in ct.css until it fits. Runs only
  // when something that changes the layout changed, never during a drag.
  const DENSE = ['dense-1', 'dense-2'];
  function fitDensity() {
    const app = $('ct-app');
    app.classList.remove.apply(app.classList, DENSE);
    if (!CANVAS.matches) return;
    const cols = document.querySelectorAll('.ct-main > .panel');
    const over = () => Array.prototype.some.call(cols, (p) => p.scrollHeight > p.clientHeight + 1);
    for (const cls of DENSE) { if (!over()) break; app.classList.add(cls); }
  }
  window.addEventListener('resize', () => schedule());

  /* ---------------- start ---------------- */

  const fitImage = () => {
    const h = $('img-wrap').clientHeight;
    $('img-wrap').style.setProperty('--img-max', CANVAS.matches && h ? h + 'px' : '260px');
  };
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => layoutWheel()).observe($('wheel-wrap'));
    new ResizeObserver(fitImage).observe($('img-wrap'));
  } else window.addEventListener('resize', () => { layoutWheel(); fitImage(); });
  const onMode = () => { wheel.size = 0; layoutWheel(); fitImage(); };
  if (CANVAS.addEventListener) CANVAS.addEventListener('change', onMode); else if (CANVAS.addListener) CANVAS.addListener(onMode);
  library = loadLibrary();
  layoutWheel();
  render();
})();
