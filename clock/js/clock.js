/* ==========================================================================
   Clock (/clock/) — faces, timer, alarm, stopwatch, settings, backgrounds.

   Storage (listed in input_legal/legal.md; see KEYS below):
     localStorage "rvry-clock-settings"   preferences, written only when you change one
     localStorage "rvry-clock-timers"     running timer and armed alarm, so a reload keeps them
     localStorage "rvry-clock-stopwatch"  stopwatch, laps (notes, time of day), the Undo copy
     IndexedDB    "rvry-clock-photos"     background photos you add yourself
   Photos never go in localStorage: it is shared with Revery Notebook's
   autosave and holds only ~5 MB for the whole site. Every open tab listens
   for the others' writes and takes them over (see wire()), so a tab left open
   in the background never saves an older copy back over newer data.

   Timing: timers and alarms are absolute timestamps. One setTimeout aimed at
   the next due moment fires them, so they ring in a background tab (where
   requestAnimationFrame is paused). Drawing uses rAF only for faces that
   actually move smoothly; everything else redraws once per second. What the
   browser can animate by itself (the celestial seconds planet, its sky's
   turning, twinkling and shooting stars) it does, so that face needs no rAF.
   Settings > Performance > Low turns all smooth motion and blur off.
   ========================================================================== */
(function () {
    'use strict';

    var $ = function (sel, root) { return (root || document).querySelector(sel); };
    var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
    var root = document.documentElement;
    var app = $('#app');

    function pad(n) { return String(n).padStart(2, '0'); }
    function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
    function readJSON(key) {
        try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
    }
    function writeJSON(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    }
    function setHidden(el, hidden) { if (el.hidden !== hidden) el.hidden = hidden; }
    // Runs one part of the page on its own: if it throws, the error is
    // reported (once per function) and the rest carries on, above all the
    // timer and the alarm.
    var failed = {};
    function safely(fn, arg) {
        try { return fn(arg); } catch (e) {
            if (!failed[fn.name]) { failed[fn.name] = true; console.error(e); }
        }
    }
    // Repeatable pseudo-random numbers 0..1: the same seed gives the same
    // sky (mulberry32; a plain LCG would line the stars up in rows).
    function seeded(a) {
        return function () {
            a = a + 0x6D2B79F5 | 0;
            var t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    // Asset version: this script's own ?v= from index.html. Cloudflare and
    // browsers keep CSS/JS for months, so a changed file only reaches visitors
    // under a new ?v=; the event card files loaded later reuse it.
    var ASSET_V = (function () {
        var m = document.currentScript && /[?&]v=([^&]+)/.exec(document.currentScript.src);
        return m ? '?v=' + m[1] : '';
    }());

    // ======================================================================
    // Storage names
    // ======================================================================
    // rvry-clock-*, like the rest of the site's storage (but never plain
    // rvry-settings: the ASCII tool uses that). Until 2026-09 the names were
    // clock-*, with timer, alarm and stopwatch in one key. migrateStorage()
    // writes the new keys first and removes an old one only after that worked,
    // so a full or blocked localStorage loses nothing: the next visit retries.
    var KEYS = {
        settings: 'rvry-clock-settings',
        timers: 'rvry-clock-timers',
        stopwatch: 'rvry-clock-stopwatch'
    };
    var PHOTO_DB = 'rvry-clock-photos', OLD_PHOTO_DB = 'clock-photos';
    function migrateStorage() {
        try {
            var oldS = localStorage.getItem('clock-settings');
            if (oldS !== null) {
                if (localStorage.getItem(KEYS.settings) === null) localStorage.setItem(KEYS.settings, oldS);
                localStorage.removeItem('clock-settings');
            }
        } catch (e) {}
        try {
            var oldT = localStorage.getItem('clock-timers');
            if (oldT !== null) {
                var o = null;
                try { o = JSON.parse(oldT); } catch (e) {}
                o = o || {};
                if (localStorage.getItem(KEYS.timers) === null) {
                    localStorage.setItem(KEYS.timers, JSON.stringify({ timer: o.timer, alarm: o.alarm }));
                }
                if (localStorage.getItem(KEYS.stopwatch) === null && o.sw) {
                    localStorage.setItem(KEYS.stopwatch, JSON.stringify(o.sw));
                }
                localStorage.removeItem('clock-timers');
            }
        } catch (e) {}
    }
    migrateStorage();

    // ======================================================================
    // Settings
    // ======================================================================
    var FACES = ['ring', 'hourglass', 'mono', 'analog', 'celestial'];
    var DEFAULTS = {
        face: 'ring',
        theme: 'auto',       // auto | dark | light | sepia | custom
        format: '24',        // 24 | 12
        seconds: true,
        size: 'm',           // s | m | l
        lang: 'en',          // en | sv
        bg: 'p3',            // p1..p7 = bundled photo, u… = one you added
        bgOpacity: 0.25,
        bgCycle: false,
        photos: [],          // ids of added photos (the images are in IndexedDB)
        customBg: '#14181f', // the custom theme's two colours; the same
        customInk: '#ece6d9', // fallbacks are in index.html's pre-paint script
        perf: 'full'         // full | low (no smooth motion, twinkling or blur)
    };
    var HEX = /^#[0-9a-f]{6}$/i;

    function loadSettings() {
        var s = readJSON(KEYS.settings);
        var migrated = false;
        if (!s) {
            // First visit since the redesign: carry over the old single-value keys.
            s = {};
            try {
                var lang = localStorage.getItem('clock-lang');
                var anim = localStorage.getItem('clock-anim');
                if (lang) { s.lang = lang; migrated = true; }
                if (anim) { if (anim === 'hourglass') s.face = 'hourglass'; migrated = true; }
            } catch (e) {}
        }
        s = Object.assign({}, DEFAULTS, s);
        if (FACES.indexOf(s.face) < 0) s.face = DEFAULTS.face;
        if (['auto', 'dark', 'light', 'sepia', 'custom'].indexOf(s.theme) < 0) s.theme = 'auto';
        if (!HEX.test(s.customBg)) s.customBg = DEFAULTS.customBg;
        if (!HEX.test(s.customInk)) s.customInk = DEFAULTS.customInk;
        if (s.format !== '12') s.format = '24';
        if (['s', 'm', 'l'].indexOf(s.size) < 0) s.size = 'm';
        if (s.perf !== 'low') s.perf = 'full';
        if (s.lang !== 'sv') s.lang = 'en';
        s.seconds = s.seconds !== false;
        s.bgCycle = s.bgCycle === true;
        s.bgOpacity = clamp(Number(s.bgOpacity), 0, 1);
        if (isNaN(s.bgOpacity)) s.bgOpacity = DEFAULTS.bgOpacity;
        if (!Array.isArray(s.photos)) s.photos = [];
        if (typeof s.bg !== 'string') s.bg = DEFAULTS.bg;
        if (migrated) {
            writeJSON(KEYS.settings, s);
            try { localStorage.removeItem('clock-lang'); localStorage.removeItem('clock-anim'); } catch (e) {}
        }
        return s;
    }
    var S = loadSettings();
    function saveSettings() { writeJSON(KEYS.settings, S); }

    var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    function resolvedTheme() {
        return S.theme === 'auto' ? (darkQuery.matches ? 'dark' : 'light') : S.theme;
    }
    // WCAG relative luminance of a #rrggbb colour (copied into index.html's
    // pre-paint script, which must reach the same dark/light answer).
    function luminance(hex) {
        var n = parseInt(hex.slice(1), 16);
        return [n >> 16, n >> 8 & 255, n & 255].reduce(function (sum, v, i) {
            v /= 255;
            v = v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
            return sum + v * [.2126, .7152, .0722][i];
        }, 0);
    }
    function contrastRatio(a, b) {
        var la = luminance(a), lb = luminance(b);
        return (Math.max(la, lb) + .05) / (Math.min(la, lb) + .05);
    }

    // ======================================================================
    // Language
    // ======================================================================
    var I18N = {
        en: {
            title: 'Harald Revery - Time',
            mode_clock: 'Clock', mode_timer: 'Timer', mode_alarm: 'Alarm', mode_stopwatch: 'Stopwatch',
            timer_heading: 'Countdown', alarm_heading: 'Alarm', sw_heading: 'Stopwatch',
            btn_start: 'Start', btn_pause: 'Pause', btn_resume: 'Resume', btn_reset: 'Reset',
            btn_lap: 'Lap', btn_arm: 'Arm', btn_disarm: 'Disarm', btn_dismiss: 'Dismiss', btn_undo: 'Undo',
            preset_1m: '1 min', preset_3m: '3 min', preset_5m: '5 min', preset_10m: '10 min',
            preset_15m: '15 min', preset_25m: '25 min', preset_45m: '45 min', preset_1h: '1 hour',
            hours: 'Hours', minutes: 'Minutes', seconds_unit: 'Seconds',
            alarm_idle: 'Set a time, then arm',
            alarm_armed: 'Rings at {time} · in {left}',
            left_min: '{m} min', left_hm: '{h} h {m} min', left_now: 'less than a minute',
            ring_timer: 'Time is up', ring_alarm: 'Alarm · {time}',
            lap: 'Lap', laps_one: '1 lap', laps_many: '{n} laps', export_csv: 'Export .csv',
            lap_note: 'Add a note', lap_note_for: 'Note for lap {n}',
            settings: 'Settings', close: 'Close', face: 'Face', theme: 'Theme', background: 'Background',
            opacity: 'Opacity', format: 'Format', seconds: 'Seconds', size: 'Size', language: 'Language',
            auto: 'Auto', dark: 'Dark', light: 'Light', sepia: 'Sepia', custom: 'Custom',
            custom_bg: 'Background', custom_ink: 'Text', low_contrast: 'Low contrast: hard to read',
            fmt_24: '24 h', fmt_12: '12 h', on: 'On', off: 'Off',
            size_s: 'S', size_m: 'M', size_l: 'L',
            cycle_locked: 'Fixed', cycle_auto: 'Cycle', next: 'Next',
            add_photo: 'Add a photo', remove_photo: 'Remove this photo', photo_n: 'Photo {n}', your_photo: 'Your photo',
            photo_failed: 'That image could not be read.',
            face_ring: 'Ring', face_hourglass: 'Hourglass', face_mono: 'Mono', face_analog: 'Analog', face_celestial: 'Celestial',
            set_timer: 'Set a timer', make_card: 'Create an event card',
            perf: 'Performance', perf_full: 'Full', perf_low: 'Low',
            perf_low_hint: 'Less motion and no blur: easier on older devices and the battery',
            week: 'Week'
        },
        sv: {
            title: 'Harald Revery - Tid',
            mode_clock: 'Klocka', mode_timer: 'Timer', mode_alarm: 'Larm', mode_stopwatch: 'Tidtagarur',
            timer_heading: 'Nedräkning', alarm_heading: 'Larm', sw_heading: 'Tidtagarur',
            btn_start: 'Starta', btn_pause: 'Paus', btn_resume: 'Fortsätt', btn_reset: 'Nollställ',
            btn_lap: 'Varv', btn_arm: 'Aktivera', btn_disarm: 'Avaktivera', btn_dismiss: 'Stäng av', btn_undo: 'Ångra',
            preset_1m: '1 min', preset_3m: '3 min', preset_5m: '5 min', preset_10m: '10 min',
            preset_15m: '15 min', preset_25m: '25 min', preset_45m: '45 min', preset_1h: '1 timme',
            hours: 'Timmar', minutes: 'Minuter', seconds_unit: 'Sekunder',
            alarm_idle: 'Ställ in en tid och aktivera',
            alarm_armed: 'Ringer {time} · om {left}',
            left_min: '{m} min', left_hm: '{h} h {m} min', left_now: 'mindre än en minut',
            ring_timer: 'Tiden är ute', ring_alarm: 'Larm · {time}',
            lap: 'Varv', laps_one: '1 varv', laps_many: '{n} varv', export_csv: 'Exportera .csv',
            lap_note: 'Lägg till en anteckning', lap_note_for: 'Anteckning för varv {n}',
            settings: 'Inställningar', close: 'Stäng', face: 'Urtavla', theme: 'Tema', background: 'Bakgrund',
            opacity: 'Opacitet', format: 'Format', seconds: 'Sekunder', size: 'Storlek', language: 'Språk',
            auto: 'Auto', dark: 'Mörk', light: 'Ljus', sepia: 'Sepia', custom: 'Egen',
            custom_bg: 'Bakgrund', custom_ink: 'Text', low_contrast: 'Låg kontrast: svårläst',
            fmt_24: '24 h', fmt_12: '12 h', on: 'På', off: 'Av',
            size_s: 'S', size_m: 'M', size_l: 'L',
            cycle_locked: 'Fast', cycle_auto: 'Växla', next: 'Nästa',
            add_photo: 'Lägg till ett foto', remove_photo: 'Ta bort fotot', photo_n: 'Foto {n}', your_photo: 'Ditt foto',
            photo_failed: 'Bilden kunde inte läsas.',
            face_ring: 'Ring', face_hourglass: 'Timglas', face_mono: 'Mono', face_analog: 'Analog', face_celestial: 'Himmelsk',
            set_timer: 'Ställ in en timer', make_card: 'Skapa ett eventkort',
            perf: 'Prestanda', perf_full: 'Full', perf_low: 'Låg',
            perf_low_hint: 'Mindre rörelse och ingen oskärpa: skonsammare mot äldre enheter och batteriet',
            week: 'Vecka'
        }
    };
    function t(key, vars) {
        var s = (I18N[S.lang] && I18N[S.lang][key]) || I18N.en[key] || key;
        if (vars) Object.keys(vars).forEach(function (k) { s = s.replace('{' + k + '}', vars[k]); });
        return s;
    }
    function applyLanguage() {
        root.lang = S.lang;
        $$('[data-i18n]').forEach(function (el) { el.textContent = t(el.dataset.i18n); });
        $$('[data-i18n-title]').forEach(function (el) { el.title = t(el.dataset.i18nTitle); });
        $$('[data-i18n-aria]').forEach(function (el) { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
        dateCache = {};
    }

    // ======================================================================
    // Dates
    // ======================================================================
    var DAYS = {
        en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        sv: ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag']
    };
    var MONTHS = {
        en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
        sv: ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December']
    };
    function isoWeek(date) {
        var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        var day = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - day);
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    }
    function ordinal(n) {
        var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }
    function tzLabel(d) {
        var off = -d.getTimezoneOffset(), abs = Math.abs(off);
        return 'UTC' + (off >= 0 ? '+' : '-') + pad(Math.floor(abs / 60)) + ':' + pad(abs % 60);
    }
    function dateStrings(d) {
        var L = S.lang, day = DAYS[L][d.getDay()], month = MONTHS[L][d.getMonth()];
        var short3 = function (w) { return w.slice(0, 3); };
        var dd = d.getDate(), yyyy = d.getFullYear();
        return {
            // ring + hourglass keep the original clock's wording
            long: L === 'sv'
                ? day + ', ' + t('week') + ' ' + isoWeek(d) + ', ' + dd + ' ' + month + ' ' + yyyy
                : day + ', ' + ordinal(dd) + ' ' + month + ' ' + yyyy,
            analog: L === 'sv'
                ? day + ' · ' + dd + ' ' + short3(month) + ' · ' + yyyy
                : day + ' · ' + short3(month) + ' ' + dd + ' · ' + yyyy,
            celestial: short3(day) + ' · ' + dd + ' ' + short3(month) + ' ' + yyyy,
            numeric: pad(dd) + '.' + pad(d.getMonth() + 1) + '.' + String(yyyy).slice(-2),
            weekday: day,
            tz: tzLabel(d)
        };
    }

    // Hours/minutes/seconds for display, honouring 12/24 h.
    function clockParts(d) {
        var h = d.getHours(), ampm = '';
        if (S.format === '12') { ampm = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; }
        var hm = pad(h) + ':' + pad(d.getMinutes());
        return { text: S.seconds ? hm + ':' + pad(d.getSeconds()) : hm, hm: hm, ampm: ampm };
    }
    function formatAlarm(h, m) {
        if (S.format !== '12') return pad(h) + ':' + pad(m);
        return (h % 12 || 12) + ':' + pad(m) + (h >= 12 ? ' pm' : ' am');
    }
    function splitMs(ms) {
        var total = Math.floor(Math.max(0, ms) / 1000);
        return { h: Math.floor(total / 3600), m: Math.floor(total / 60) % 60, s: total % 60 };
    }
    function hms(ms) { var p = splitMs(ms); return pad(p.h) + ':' + pad(p.m) + ':' + pad(p.s); }
    // Countdowns show whole seconds rounded up: 00:00:01 until it is really over.
    function ceilSec(ms) { return Math.ceil(Math.max(0, ms) / 1000) * 1000; }
    function shortDuration(ms) {
        var p = splitMs(ms);
        return p.h ? p.h + ':' + pad(p.m) + ':' + pad(p.s) : pad(p.m) + ':' + pad(p.s);
    }

    // Fixed-width digit slots — see the note on .digits in clock.css.
    // Returns a setter that only touches the characters that changed.
    function digits(el) {
        var last = null;
        return function (str) {
            if (str === last) return;
            if (!last || last.length !== str.length) {
                el.textContent = '';
                for (var i = 0; i < str.length; i++) el.appendChild(document.createElement('span'));
                last = '';
            }
            var spans = el.children;
            for (var j = 0; j < str.length; j++) {
                if (last[j] === str[j]) continue;
                spans[j].textContent = str[j];
                spans[j].className = /\d/.test(str[j]) ? 'dg' : 'sp';
            }
            last = str;
        };
    }
    function setText(el, text) { if (el.textContent !== text) el.textContent = text; }

    // ======================================================================
    // Faces
    // ======================================================================
    var SVGNS = 'http://www.w3.org/2000/svg';
    function svgEl(tag, attrs, parent) {
        var el = document.createElementNS(SVGNS, tag);
        Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
        parent.appendChild(el);
        return el;
    }

    var RING_R = 270;
    var RING_C = 2 * Math.PI * RING_R;
    function buildRing() {
        var g = $('#ring-ticks');
        for (var i = 0; i < 60; i++) {
            var major = i % 5 === 0;
            var a = (i / 60) * 2 * Math.PI - Math.PI / 2;
            var outer = RING_R - 2, inner = outer - (major ? 16 : 8);
            svgEl('line', {
                x1: (Math.cos(a) * inner).toFixed(2), y1: (Math.sin(a) * inner).toFixed(2),
                x2: (Math.cos(a) * outer).toFixed(2), y2: (Math.sin(a) * outer).toFixed(2),
                'class': major ? 'tick-major' : 'tick-minor'
            }, g);
        }
        var arc = $('#ring-arc');
        arc.style.strokeDasharray = RING_C;
        arc.style.strokeDashoffset = RING_C;
    }
    function buildAnalog() {
        var ticks = $('#analog-ticks'), nums = $('#analog-numerals');
        for (var i = 0; i < 60; i++) {
            var hour = i % 5 === 0, a = i * 6 * Math.PI / 180, r1 = hour ? 78 : 82, r2 = 86;
            svgEl('line', {
                x1: (Math.sin(a) * r1).toFixed(3), y1: (-Math.cos(a) * r1).toFixed(3),
                x2: (Math.sin(a) * r2).toFixed(3), y2: (-Math.cos(a) * r2).toFixed(3),
                'class': hour ? 'tick-hour' : 'tick-min'
            }, ticks);
        }
        for (var h = 1; h <= 12; h++) {
            var b = h * 30 * Math.PI / 180;
            svgEl('text', { 'class': 'numeral', x: (Math.sin(b) * 64).toFixed(3), y: (-Math.cos(b) * 64).toFixed(3) }, nums).textContent = h;
        }
    }
    function buildCelestial() {
        var stars = $('#cel-stars'), marks = $('#cel-marks');
        var seed = 13;
        function rand() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
        for (var i = 0; i < 38; i++) {
            var r = 90 + rand() * 8, a = rand() * Math.PI * 2;
            var x = Math.cos(a) * r * (0.4 + rand() * 0.6), y = Math.sin(a) * r * (0.4 + rand() * 0.6);
            var dist = Math.sqrt(x * x + y * y);
            if (dist < 28 || [86, 64, 42].some(function (R) { return Math.abs(dist - R) < 3; })) continue;
            svgEl('circle', {
                'class': 'star', cx: x.toFixed(2), cy: y.toFixed(2),
                r: (0.4 + rand() * 0.8).toFixed(2), opacity: (0.25 + rand() * 0.5).toFixed(2)
            }, stars);
        }
        for (var h = 0; h < 12; h++) {
            var b = h * 30 * Math.PI / 180;
            svgEl('circle', {
                'class': 'star', cx: (Math.sin(b) * 86).toFixed(2), cy: (-Math.cos(b) * 86).toFixed(2),
                r: h % 3 === 0 ? 0.9 : 0.5, opacity: 0.55
            }, marks);
        }
    }

    // The celestial seconds planet goes on a layer of its own, which the
    // browser turns (Web Animations), so the face needs no drawing every
    // frame. The layer is only the strip from the centre up to the planet,
    // measured from the planet in index.html, and turns about its bottom.
    // Browsers without el.animate() keep it in the face's SVG, drawn every
    // frame as before.
    var celSec = null;               // { layer, anim } once built
    function buildCelSeconds() {
        if (!Element.prototype.animate) return;
        var g = $('#cel-s'), dot = $('.planet-s', g);
        var r = Number(dot.getAttribute('r')), top = -Number(dot.getAttribute('cy')) + r + 2, half = r + 2;
        var layer = document.createElement('div');
        layer.className = 'cel-sec sec-el';
        // viewBox units are the face's (200 across = 100%), so 1 unit = .5%
        layer.style.cssText = 'left:' + (50 - half / 2) + '%;width:' + half + '%;top:' + (50 - top / 2) + '%;height:' + top / 2 + '%';
        svgEl('svg', { viewBox: -half + ' ' + -top + ' ' + 2 * half + ' ' + top, 'aria-hidden': 'true' }, layer).appendChild(g);
        $('.orbit-wrap').appendChild(layer);
        celSec = { layer: layer, anim: null };
    }
    // Called every frame (once a second on this face): runs the planet's
    // turn while the face shows it and stops it otherwise. The browser's
    // animation clock drifts from Date after the computer sleeps or the
    // clock is set, so each call puts it back if it is off by more than 40 ms.
    // Low performance: no animation, a step once a second.
    function driveCelSeconds(now) {
        if (!celSec) return;
        var shown = currentMode === 'clock' && S.face === 'celestial' && S.seconds;
        var anim = celSec.anim, ms = now.getSeconds() * 1000 + now.getMilliseconds();
        if (!shown || S.perf === 'low') {
            if (anim) { anim.cancel(); celSec.anim = null; }
            if (shown) celSec.layer.style.transform = 'rotate(' + now.getSeconds() * 6 + 'deg)';
            return;
        }
        if (!anim) {
            celSec.layer.style.transform = '';
            anim = celSec.anim = celSec.layer.animate(
                [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
                { duration: 60000, iterations: Infinity });
            anim.currentTime = ms;
            return;
        }
        var off = (((anim.currentTime || 0) - ms) % 60000 + 60000) % 60000;
        if (Math.min(off, 60000 - off) > 40) anim.currentTime = ms;
    }

    var faceDigits = {
        ring: digits($('#ring-time')),
        hourglass: digits($('#hg-time')),
        mono: digits($('#mono-time')),
        celestial: digits($('#cel-time'))
    };
    var dateCache = {};
    function setDate(id, text) {
        if (dateCache[id] === text) return;
        dateCache[id] = text;
        $('#' + id).textContent = text;
    }

    // --- Hourglass ---------------------------------------------------------
    // A glass is one SVG: the clock face's, or the timer face's copy (whose
    // ids carry a prefix). flips counts half-turns; when it is odd the glass is
    // upside down, so its local bottom chamber is the one on top.
    //
    // The sand behaves like the sand in a real, round glass: its level follows
    // the volume that has run through (half the time is half the sand), it
    // fills most of one bulb, the top sinks into a funnel over the neck and the
    // bottom piles up into a cone. Distances are in the SVG's units.
    var sandShapes = (function () {
        var H = 240, FILL = .86, REPOSE = .58, FUNNEL = .3;
        // R[a]: half-width of a bulb at a whole units from the neck, from the
        // wall curve in index.html (M -90 -240 C -90 -100, -4 -60, -3 0; the
        // bottom bulb is its mirror image). Change the glass there, change
        // these numbers too.
        var R = [], as = [], xs = [], i, a, k;
        for (i = 600; i >= 0; i--) {
            var t = i / 600, u = 1 - t;
            as.push(240 * u * u * u + 300 * u * u * t + 180 * u * t * t);
            xs.push(90 * u * u * u + 270 * u * u * t + 12 * u * t * t + 3 * t * t * t);
        }
        for (a = 0, k = 0; a <= H; a++) {
            while (as[k + 1] < a) k++;
            R.push(xs[k] + (xs[k + 1] - xs[k]) * (a - as[k]) / (as[k + 1] - as[k]));
        }
        function r(a) {
            if (a <= 0) return R[0];
            if (a >= H) return R[H];
            var j = Math.floor(a);
            return R[j] + (R[j + 1] - R[j]) * (a - j);
        }
        // Volume from a0 to a1 of sand whose radius there is width(a) (without
        // the π: only ratios matter).
        function volume(a0, a1, width) {
            var v = 0, n = Math.max(1, Math.ceil(a1 - a0)), h = (a1 - a0) / n;
            for (var j = 0; j < n; j++) { var w = width(a0 + (j + .5) * h); v += w * w * h; }
            return v;
        }
        var SAND_V = volume(0, H, r) * FILL;
        // Top: the sand stands L above the neck, with a funnel in the middle
        // whose rim is the wall. It forms over the first part of the run.
        function funnel(L, p) {
            return Math.max(0, Math.min(L - 3, FUNNEL * r(L) * Math.min(1, p / .15)));
        }
        function topVolume(L, p) {
            var D = funnel(L, p), W = r(L);
            return volume(0, L, function (a) {
                var w = r(a), hole = D > 0 ? W * (a - L + D) / D : 0;
                return hole <= 0 ? w : hole >= w ? 0 : Math.sqrt(w * w - hole * hole);
            });
        }
        // Bottom, by one number s: up to 1 a cone grows on the floor until it
        // reaches the walls; from 1 to 2 the level M rises with the cone on it.
        function heap(s) {
            var M = s <= 1 ? H : H * (2 - s), B = r(M) * .96 * Math.min(1, s);
            return { M: M, B: B, P: Math.max(0, Math.min(REPOSE * B, M - 3)) };
        }
        function bottomVolume(s) {
            var h = heap(s), peak = h.M - h.P;
            return volume(h.M, H, r) + (h.P > 0 ? volume(peak, h.M, function (a) {
                return Math.min(r(a), h.B * (a - peak) / h.P);
            }) : 0);
        }
        function solve(f, target, hi) {
            var lo = 0;
            for (var j = 0; j < 20; j++) {
                var mid = (lo + hi) / 2;
                if (f(mid) < target) lo = mid; else hi = mid;
            }
            return (lo + hi) / 2;
        }
        function n1(n) { return n.toFixed(1); }
        // progress 0..1 -> path data for both chambers, the glass upright, and
        // how far down the stream falls. The paths overshoot the walls; the
        // bulbs' clip paths trim them.
        return function (p) {
            var out = { top: 'M0 0', bottom: 'M0 0', landing: H };
            if (p < .9999) {
                var L = solve(function (L) { return topVolume(L, p); }, SAND_V * (1 - p), H);
                var D = funnel(L, p), W = r(L) + 1, tip = D - L;
                var c = Math.min(10, W * .3), cy = tip - D * c / W;   // round off the funnel's point
                out.top = 'M-100 ' + n1(-L) + 'H' + n1(-W) + 'L' + n1(-c) + ' ' + n1(cy) +
                    'Q0 ' + n1(tip) + ' ' + n1(c) + ' ' + n1(cy) + 'L' + n1(W) + ' ' + n1(-L) + 'H100V2H-100Z';
            }
            if (p > .0001) {
                var hp = heap(solve(bottomVolume, SAND_V * p, 2));
                var peak = hp.M - hp.P, b = Math.max(hp.B, .01);
                var e = Math.min(8, b * .25), ey = peak + hp.P * e / b;   // round off the cone's point
                out.bottom = 'M-100 ' + n1(hp.M) + 'H' + n1(-b) + 'L' + n1(-e) + ' ' + n1(ey) +
                    'Q0 ' + n1(peak) + ' ' + n1(e) + ' ' + n1(ey) + 'L' + n1(b) + ' ' + n1(hp.M) + 'H100V242H-100Z';
                out.landing = peak;
            }
            return out;
        };
    }());

    function makeHourglass(prefix) {
        var glass = {
            flips: -1, key: null,
            still: 0,                        // Date.now() until which the sand is left alone
            drawnAt: -1, drawnFlip: false,   // what drawSand last drew
            svg: $('#' + prefix + 'hg-svg'),
            top: sandPath($('#' + prefix + 'hg-top-sand')),
            bot: sandPath($('#' + prefix + 'hg-bot-sand')),
            stream: $('#' + prefix + 'hg-stream')
        };
        glass.sand = glass.top.parentNode;
        glass.stream.setAttribute('x', '-1');
        glass.stream.setAttribute('y', '-2');
        glass.stream.setAttribute('width', '2');
        return glass;
    }
    // index.html keeps the <rect>s that scripts before 2026-09-22 drew the
    // sand with: clock.js has no ?v=, so a browser can hold an old copy for
    // months and that copy must still find them. The sand is now a <path>.
    function sandPath(rect) {
        if (rect.tagName !== 'rect') return rect;
        var path = document.createElementNS(SVGNS, 'path');
        path.id = rect.id;
        path.setAttribute('clip-path', rect.getAttribute('clip-path'));
        rect.parentNode.replaceChild(path, rect);
        return path;
    }
    // Turn the glass to `flips` half-turns, animated or in one jump. While it
    // turns, the sand stays where it lay (all run through, in the chamber
    // that is going up) and only settles once the turn is over.
    function turnHourglass(glass, flips, animate) {
        if (animate) { glass.still = 0; drawSand(glass, 1, false); }
        glass.flips = flips;
        if (!animate) glass.svg.style.transition = 'none';
        glass.svg.style.transform = 'rotate(' + flips * 180 + 'deg)';
        if (!animate) { glass.svg.getBoundingClientRect(); glass.svg.style.transition = ''; }
        else glass.still = Date.now() + parseFloat(getComputedStyle(glass.svg).transitionDuration) * 1000;
    }
    // progress: 0 = all the sand still on top, 1 = all of it run through.
    // The sand is always worked out upright; in an upside-down glass it is
    // mirrored, clip paths and all, so it still lies at the bottom.
    function drawSand(glass, progress, flowing) {
        if (Date.now() < glass.still) return;
        // 3600 steps: one per second on the clock face, too fine to see on a
        // timer. The timer face asks every frame; most frames change nothing.
        var q = Math.round(clamp(progress, 0, 1) * 3600) / 3600, flip = glass.flips % 2 === 1;
        if (q !== glass.drawnAt || flip !== glass.drawnFlip) {
            glass.drawnAt = q;
            glass.drawnFlip = flip;
            var s = sandShapes(q);
            glass.top.setAttribute('d', s.top);
            glass.bot.setAttribute('d', s.bottom);
            glass.stream.setAttribute('height', q > .999 ? '0' : (s.landing + 2).toFixed(1));
            [glass.sand, glass.stream].forEach(function (el) {
                if (flip) el.setAttribute('transform', 'scale(1 -1)');
                else el.removeAttribute('transform');
            });
        }
        glass.stream.classList.toggle('flowing', flowing && progress > 0.001 && progress < 0.999);
    }

    // Clock face: turned over on the hour (at first shown upright on even
    // hours), and the sand runs through over the hour. Made at boot.
    var hgClock = null;
    function renderHourglass(now) {
        var h = now.getHours();
        if (hgClock.flips < 0) {
            turnHourglass(hgClock, h % 2, false);   // first draw: no animation
            hgClock.key = h;
        } else if (h !== hgClock.key) {
            hgClock.key = h;
            turnHourglass(hgClock, hgClock.flips + 1, true);
        }
        drawSand(hgClock, (now.getMinutes() * 60 + now.getSeconds()) / 3600, true);
    }

    // --- Timer face --------------------------------------------------------
    // Ring and hourglass show a running countdown in their own look: the
    // timer view gets copies of the clock faces' SVGs, so the two can never
    // drift apart. Every id in a copy gets a prefix, and so do url(#…)
    // references to them (the hourglass's clip paths).
    function cloneWithIds(el, prefix) {
        var copy = el.cloneNode(true);
        [copy].concat($$('*', copy)).forEach(function (n) {
            if (n.id) n.id = prefix + n.id;
            var clip = n.getAttribute('clip-path');
            if (clip) n.setAttribute('clip-path', clip.replace('url(#', 'url(#' + prefix));
        });
        copy.style.transform = '';
        return copy;
    }
    var tfArc = null, hgTimer = null, tfDigits = null;
    function buildTimerFace() {
        var box = $('#timer-face');
        box.insertBefore(cloneWithIds($('.face-ring .ring-svg'), 'tf-'), box.firstChild);
        box.insertBefore(cloneWithIds($('#hg-svg'), 'tf-'), box.firstChild);
        tfArc = $('#tf-ring-arc');
        hgTimer = makeHourglass('tf-');
        tfDigits = digits($('#tf-digits'));
    }
    // (Not if buildTimerFace failed: then big numerals, as for the other faces.)
    function timerHasFace() { return !!hgTimer && (S.face === 'ring' || S.face === 'hourglass'); }
    // progress: 0 = just started, 1 = time is up.
    function renderTimerFace(progress, remaining) {
        tfDigits(hms(ceilSec(remaining)));
        if (S.face === 'ring') {
            // The arc is the time left: it ends at 12 and its start runs clockwise.
            tfArc.style.strokeDashoffset = (-RING_C * progress).toFixed(2);
            tfArc.classList.toggle('tf-arc-done', progress >= 1);
        } else {
            if (hgTimer.flips < 0) turnHourglass(hgTimer, 0, false);
            drawSand(hgTimer, progress, T.timer.status === 'running');
        }
    }
    // A new countdown on the hourglass: turn the glass over, so the sand lying
    // at the bottom from the last run ends up on top. Called right after the
    // face is shown, so the turn animates from where the glass stood.
    function turnTimerGlass() {
        if (hgTimer.flips < 0) turnHourglass(hgTimer, 0, false);
        hgTimer.svg.getBoundingClientRect();
        turnHourglass(hgTimer, hgTimer.flips + 1, true);
        drawSand(hgTimer, 0, true);
    }

    function renderFace(now) {
        var face = S.face, c = clockParts(now), d = dateStrings(now);
        // Low performance draws once a second, so everything moves in whole seconds.
        var sec = now.getSeconds() + (S.perf === 'low' ? 0 : now.getMilliseconds() / 1000);
        var minF = now.getMinutes() + sec / 60;
        var hourF = (now.getHours() % 12) + minF / 60;

        if (face === 'ring') {
            faceDigits.ring(c.text);
            setText($('#ring-ampm'), c.ampm);
            setDate('ring-date', d.long);
            setDate('ring-tz', d.tz);
            // With seconds: a sweep per minute that alternates direction (as
            // before). Without: the arc shows how far into the hour we are.
            var arc = $('#ring-arc');
            if (S.seconds) {
                var frac = sec / 60;
                arc.style.strokeDashoffset = now.getMinutes() % 2 === 0 ? RING_C * (1 - frac) : -RING_C * frac;
            } else {
                arc.style.strokeDashoffset = RING_C * (1 - minF / 60);
            }
        } else if (face === 'hourglass') {
            faceDigits.hourglass(c.text);
            setText($('#hg-ampm'), c.ampm);
            setDate('hg-date', d.long);
            setDate('hg-tz', d.tz);
            renderHourglass(now);
        } else if (face === 'mono') {
            faceDigits.mono(c.text);
            setText($('#mono-ampm'), c.ampm);
            setDate('mono-numeric', d.numeric);
            setDate('mono-weekday', d.weekday);
            setDate('mono-tz', d.tz);
        } else if (face === 'analog') {
            var s = S.seconds ? sec : Math.floor(sec);
            $('#analog-h').setAttribute('transform', 'rotate(' + (hourF * 30).toFixed(3) + ')');
            $('#analog-m').setAttribute('transform', 'rotate(' + (minF * 6).toFixed(3) + ')');
            $('#analog-s').setAttribute('transform', 'rotate(' + (s * 6).toFixed(3) + ')');
            setDate('analog-date', d.analog);
        } else if (face === 'celestial') {
            $('#cel-h').setAttribute('transform', 'rotate(' + (hourF * 30).toFixed(3) + ')');
            $('#cel-m').setAttribute('transform', 'rotate(' + (minF * 6).toFixed(3) + ')');
            if (!celSec) $('#cel-s').setAttribute('transform', 'rotate(' + (sec * 6).toFixed(3) + ')');
            faceDigits.celestial(c.text);
            setText($('#cel-ampm'), c.ampm);
            setDate('cel-date', d.celestial);
        }
    }

    // ======================================================================
    // Timer / alarm / stopwatch state
    // ======================================================================
    // atBoot: the page is just opening. Then a finished timer is cleared, and
    // something that came due while the page was closed rings if it was only
    // just now, otherwise it is quietly let go.
    function loadTimers(atBoot) {
        var saved = readJSON(KEYS.timers) || {};
        var timer = Object.assign({ status: 'idle', duration: 5 * 60000, endAt: 0, remaining: 0 }, saved.timer);
        var alarm = Object.assign({ h: 7, m: 0, armed: false, fireAt: 0 }, saved.alarm);
        if (['idle', 'running', 'paused', 'done'].indexOf(timer.status) < 0) timer.status = 'idle';
        if (atBoot) {
            var now = Date.now(), GRACE = 10 * 60000;
            if (timer.status === 'done') timer.status = 'idle';
            if (timer.status === 'running' && timer.endAt <= now - GRACE) timer.status = 'idle';
            if (alarm.armed && alarm.fireAt <= now - GRACE) alarm.armed = false;
        }
        return { timer: timer, alarm: alarm };
    }

    // Stopwatch laps are { n: lap number, t: total ms, s: the lap's own ms,
    // c: the moment Lap was pressed (epoch ms, null on laps taken before
    // 2026-09-20), note }. Keeping n and s on each lap means both stay right
    // after the oldest lap is dropped at LAP_MAX. Before notes existed a lap
    // was just its total, so plain numbers are converted here. Every field is
    // copied over by name: one left out here is lost at the next reload.
    var LAP_MAX = 999, NOTE_MAX = 60;
    function isMs(v) { return typeof v === 'number' && isFinite(v) && v >= 0; }
    function normalizeLaps(list) {
        var out = [];
        (Array.isArray(list) ? list : []).forEach(function (lap) {
            if (isMs(lap)) lap = { t: lap };
            if (!lap || !isMs(lap.t)) return;
            var prev = out[out.length - 1], prevN = prev ? prev.n : 0;
            out.push({
                n: Math.floor(lap.n) > prevN ? Math.floor(lap.n) : prevN + 1,
                t: lap.t,
                s: isMs(lap.s) ? lap.s : Math.max(0, lap.t - (prev ? prev.t : 0)),
                c: isMs(lap.c) ? lap.c : null,
                note: typeof lap.note === 'string' ? lap.note.slice(0, NOTE_MAX) : ''
            });
        });
        return out.slice(-LAP_MAX);
    }
    // pausedAt: when it was last paused (epoch ms), for the CSV's total row
    // and the Reset guard. undo: what the last Reset cleared ({ elapsed,
    // laps }), until Undo is used or a new run starts.
    function loadStopwatch() {
        var saved = readJSON(KEYS.stopwatch) || {};
        var sw = {
            running: saved.running === true && isMs(saved.startedAt),
            startedAt: isMs(saved.startedAt) ? saved.startedAt : 0,
            elapsed: isMs(saved.elapsed) ? saved.elapsed : 0,
            pausedAt: isMs(saved.pausedAt) ? saved.pausedAt : 0,
            laps: normalizeLaps(saved.laps),
            undo: null
        };
        if (saved.undo && typeof saved.undo === 'object') {
            sw.undo = { elapsed: isMs(saved.undo.elapsed) ? saved.undo.elapsed : 0, laps: normalizeLaps(saved.undo.laps) };
        }
        return sw;
    }

    var T = loadTimers(true);
    T.sw = loadStopwatch();
    function saveTimers() { writeJSON(KEYS.timers, { timer: T.timer, alarm: T.alarm }); }
    var swSaveId = 0;
    function saveStopwatch() {
        clearTimeout(swSaveId);
        swSaveId = 0;
        writeJSON(KEYS.stopwatch, T.sw);
    }

    var ringing = null;          // null | 'timer' | 'alarm'
    var ringingAlarmText = '';

    // --- Sound -------------------------------------------------------------
    var audio = $('#alarm-sound');
    var SOUNDS = ['/clock/audio/timer_alarm_1.mp3', '/clock/audio/timer_alarm_2.mp3', '/clock/audio/timer_alarm_3.mp3'];
    var soundCutoff = 0;
    function pickSound() {
        audio.src = SOUNDS[Math.floor(Math.random() * SOUNDS.length)];
        audio.preload = 'auto';
        audio.load();
    }
    // Called from the Start / Arm click. Picks (and so downloads) the sound
    // ahead of time, and plays it muted for an instant: Safari only lets a
    // page play audio later if it has played once inside a user gesture.
    function primeAudio() {
        pickSound();
        audio.muted = true;
        var p = audio.play();
        var done = function () {
            if (ringing) return;              // a very short timer may already be ringing
            audio.pause();
            audio.currentTime = 0;
            audio.muted = false;
        };
        if (p && p.then) p.then(done, function () { audio.muted = false; });
        else done();
    }
    function startSound() {
        if (!audio.getAttribute('src')) pickSound();
        audio.muted = false;
        audio.loop = true;
        try { audio.currentTime = 0; } catch (e) {}
        var p = audio.play();
        if (p && p.catch) p.catch(function () {});
        clearTimeout(soundCutoff);
        soundCutoff = setTimeout(stopSound, 2 * 60000);
    }
    function stopSound() {
        clearTimeout(soundCutoff);
        audio.pause();
        audio.loop = false;
    }

    // --- Ringing -----------------------------------------------------------
    function startRinging(kind) {
        ringing = kind;
        if (kind === 'alarm') ringingAlarmText = formatAlarm(T.alarm.h, T.alarm.m);
        startSound();
        renderRinging();
        renderTools();
        heartbeat();
    }
    function dismiss() {
        if (!ringing) return;
        var kind = ringing;
        ringing = null;
        stopSound();
        // A timer and an alarm can come due together; either Dismiss clears both.
        if (T.timer.status === 'done') { T.timer.status = 'idle'; saveTimers(); }
        renderRinging();
        renderTools();
        heartbeat();
    }
    function renderRinging() {
        var banner = $('#ring-banner');
        app.classList.toggle('ringing', !!ringing);
        app.classList.toggle('ringing-timer', ringing === 'timer');
        app.classList.toggle('ringing-alarm', ringing === 'alarm');
        banner.hidden = !ringing;
        if (ringing) {
            $('#ring-label').textContent = ringing === 'timer' ? t('ring_timer') : t('ring_alarm', { time: ringingAlarmText });
            if (!banner.contains(document.activeElement)) $('#ring-dismiss').focus({ preventScroll: true });
        }
    }

    // --- Due checks --------------------------------------------------------
    var dueTimeout = 0;
    function checkDue() {
        var now = Date.now(), changed = false;
        if (T.timer.status === 'running' && now >= T.timer.endAt) {
            T.timer.status = 'done';
            T.timer.remaining = 0;
            changed = true;
            startRinging('timer');
        }
        if (T.alarm.armed && now >= T.alarm.fireAt) {
            T.alarm.armed = false;
            changed = true;
            startRinging('alarm');
        }
        if (changed) saveTimers();
        scheduleDue();
    }
    function scheduleDue() {
        clearTimeout(dueTimeout);
        var next = Infinity;
        if (T.timer.status === 'running') next = Math.min(next, T.timer.endAt);
        if (T.alarm.armed) next = Math.min(next, T.alarm.fireAt);
        if (next === Infinity) return;
        dueTimeout = setTimeout(checkDue, clamp(next - Date.now() + 15, 0, 2147483000));
    }

    // A slow heartbeat while anything is active keeps the tab title and the
    // status chips current in a background tab, and re-checks due times after
    // the computer wakes from sleep (timeouts can be late then).
    var heartbeatId = 0;
    function anythingActive() {
        return !!ringing || T.timer.status === 'running' || T.alarm.armed || T.sw.running;
    }
    function heartbeat() {
        if (anythingActive() && !heartbeatId) {
            heartbeatId = setInterval(function () { checkDue(); updateTitle(); if (document.hidden) renderChips(); }, 1000);
        } else if (!anythingActive() && heartbeatId) {
            clearInterval(heartbeatId);
            heartbeatId = 0;
        }
        updateTitle();
    }
    var titleFlip = false;
    function updateTitle() {
        var title = t('title');
        if (ringing) {
            titleFlip = !titleFlip;
            title = titleFlip ? '• ' + $('#ring-label').textContent : title;
        } else if (T.timer.status === 'running') {
            title = shortDuration(ceilSec(T.timer.endAt - Date.now())) + ' · ' + t('mode_timer');
        }
        if (document.title !== title) document.title = title;
    }

    // ======================================================================
    // Timer
    // ======================================================================
    var timerInputs = [$('#timer-in-h'), $('#timer-in-m'), $('#timer-in-s')];
    var timerDigits = digits($('#timer-digits'));
    function timerRemaining() {
        var tm = T.timer;
        if (tm.status === 'running') return Math.max(0, tm.endAt - Date.now());
        if (tm.status === 'paused') return tm.remaining;
        if (tm.status === 'done') return 0;
        return tm.duration;
    }
    function durationToInputs(ms) {
        var p = splitMs(ms);
        timerInputs[0].value = pad(p.h);
        timerInputs[1].value = pad(p.m);
        timerInputs[2].value = pad(p.s);
    }
    function inputsToDuration() {
        var v = timerInputs.map(function (el) { return parseInt(el.value, 10) || 0; });
        return (v[0] * 3600 + v[1] * 60 + v[2]) * 1000;
    }
    function timerStartPause() {
        var tm = T.timer, now = Date.now();
        if (ringing === 'timer') { dismiss(); return; }
        if (tm.status === 'done') tm.status = 'idle';
        var fresh = tm.status === 'idle';
        if (tm.status === 'running') {
            tm.remaining = Math.max(0, tm.endAt - now);
            tm.status = 'paused';
        } else {
            if (fresh) {
                var ms = inputsToDuration();
                if (ms < 1000) { timerInputs[1].focus(); return; }
                tm.duration = ms;
                tm.remaining = ms;
            }
            tm.endAt = now + tm.remaining;
            tm.status = 'running';
            primeAudio();
        }
        saveTimers();
        scheduleDue();
        heartbeat();
        renderTools();
        if (fresh && S.face === 'hourglass' && timerHasFace()) turnTimerGlass();
        kick();
    }
    function timerReset() {
        if (ringing === 'timer') { dismiss(); return; }
        T.timer.status = 'idle';
        T.timer.remaining = T.timer.duration;
        durationToInputs(T.timer.duration);
        saveTimers();
        scheduleDue();
        heartbeat();
        renderTools();
    }
    function applyPreset(seconds) {
        if (ringing === 'timer') dismiss();
        T.timer.status = 'idle';
        T.timer.duration = seconds * 1000;
        T.timer.remaining = T.timer.duration;
        durationToInputs(T.timer.duration);
        saveTimers();
        scheduleDue();
        heartbeat();
        renderTools();
    }
    // Idle: the number inputs and presets. Started: the ring or hourglass face
    // when one of those is chosen, otherwise big numerals and a progress line.
    function renderTimer() {
        var tm = T.timer, editing = tm.status === 'idle', faceOn = !editing && timerHasFace();
        setHidden($('#timer-edit'), !editing);
        setHidden($('#timer-display'), editing || faceOn);
        setHidden($('#timer-face'), !faceOn);
        setHidden($('#timer-presets'), faceOn);
        var bar = $('#timer-progress').parentNode;
        setHidden(bar, faceOn);
        bar.style.visibility = editing ? 'hidden' : '';
        tickTimer();
        var start = $('#timer-start');
        start.textContent = tm.status === 'running' ? t('btn_pause')
            : tm.status === 'paused' ? t('btn_resume')
            : ringing === 'timer' ? t('btn_dismiss') : t('btn_start');
        start.dataset.variant = tm.status === 'running' ? '' : 'primary';
        $('#timer-reset').disabled = tm.status === 'idle';
        $$('[data-preset]').forEach(function (b) {
            b.setAttribute('aria-pressed', String(editing && Number(b.dataset.preset) * 1000 === inputsToDuration()));
        });
    }
    // The parts of the timer that move while it runs (every frame).
    function tickTimer() {
        var tm = T.timer, remaining = timerRemaining();
        var progress = tm.status === 'idle' ? 0 : clamp(1 - remaining / (tm.duration || 1), 0, 1);
        timerDigits(hms(ceilSec(remaining)));
        $('#timer-progress').style.transform = 'scaleX(' + progress.toFixed(4) + ')';
        if (tm.status !== 'idle' && timerHasFace()) renderTimerFace(progress, remaining);
    }

    // ======================================================================
    // Alarm
    // ======================================================================
    var alarmInputs = [$('#alarm-in-h'), $('#alarm-in-m')];
    function nextOccurrence(h, m) {
        var now = Date.now(), d = new Date(now);
        d.setHours(h, m, 0, 0);
        if (d.getTime() <= now) d.setDate(d.getDate() + 1);
        return d.getTime();
    }
    function alarmToggle() {
        var al = T.alarm;
        if (ringing === 'alarm') { dismiss(); return; }
        if (al.armed) {
            al.armed = false;
        } else {
            al.h = clamp(parseInt(alarmInputs[0].value, 10) || 0, 0, 23);
            al.m = clamp(parseInt(alarmInputs[1].value, 10) || 0, 0, 59);
            al.fireAt = nextOccurrence(al.h, al.m);
            al.armed = true;
            primeAudio();
        }
        saveTimers();
        scheduleDue();
        heartbeat();
        renderTools();
    }
    function renderAlarm() {
        var al = T.alarm, view = $('[data-view="alarm"] .tool');
        alarmInputs.forEach(function (el) { el.disabled = al.armed; });
        if (al.armed || document.activeElement !== alarmInputs[0]) alarmInputs[0].value = pad(al.h);
        if (al.armed || document.activeElement !== alarmInputs[1]) alarmInputs[1].value = pad(al.m);
        view.classList.toggle('armed', al.armed);
        var status = $('#alarm-status'), text;
        if (al.armed) {
            var mins = Math.floor((al.fireAt - Date.now()) / 60000);
            var left = mins < 1 ? t('left_now')
                : mins < 60 ? t('left_min', { m: mins })
                : t('left_hm', { h: Math.floor(mins / 60), m: mins % 60 });
            text = t('alarm_armed', { time: formatAlarm(al.h, al.m), left: left });
        } else {
            text = S.format === '12' ? t('alarm_idle') + ' · ' + formatAlarm(al.h, al.m) : t('alarm_idle');
        }
        setText(status, text);
        var toggle = $('#alarm-toggle');
        toggle.textContent = ringing === 'alarm' ? t('btn_dismiss') : al.armed ? t('btn_disarm') : t('btn_arm');
        toggle.dataset.variant = al.armed ? '' : 'primary';
    }

    // ======================================================================
    // Stopwatch
    // ======================================================================
    var swDigits = digits($('#sw-digits'));
    var swCs = digits($('#sw-cs'));
    var lapList = $('#sw-laps');
    // The left button turns from Lap into Reset the moment you pause, so a
    // tap meant as one more Lap would reset; for this long it does nothing.
    var RESET_GUARD = 600;
    // now: pass the Date.now() that is also stored with the result, so the two agree.
    function swElapsed(now) {
        var sw = T.sw;
        return sw.running ? sw.elapsed + ((now || Date.now()) - sw.startedAt) : sw.elapsed;
    }
    // A pause "in the future" (the computer's clock was set back since) doesn't count.
    function swJustPaused() {
        var ago = Date.now() - T.sw.pausedAt;
        return ago >= 0 && ago < RESET_GUARD;
    }
    function swCanUndo() {
        var sw = T.sw;
        return !!sw.undo && !sw.running && sw.elapsed === 0 && !sw.laps.length;
    }
    function swStartPause() {
        var sw = T.sw, now = Date.now();
        if (sw.running) {
            sw.elapsed += now - sw.startedAt;
            sw.running = false;
            sw.pausedAt = now;
            setTimeout(renderStopwatch, RESET_GUARD + 20);
        } else {
            if (sw.elapsed === 0) sw.undo = null;   // a new run: the last reset is let go
            sw.startedAt = now;
            sw.running = true;
        }
        saveStopwatch();
        heartbeat();
        renderTools();
        kick();
    }
    // The left button: Lap while running, Reset when paused, Undo right after
    // a reset.
    function swLapReset() {
        if (T.sw.running) swLap();
        else if (swCanUndo()) swUndo();
        else if (!swJustPaused()) swReset();
    }
    function swLap() {
        var sw = T.sw, last = sw.laps[sw.laps.length - 1], now = Date.now(), total = swElapsed(now);
        var lap = { n: last ? last.n + 1 : 1, t: total, s: total - (last ? last.t : 0), c: now, note: '' };
        sw.laps.push(lap);
        // One new row on top instead of a rebuild, so a note being typed in
        // another row keeps its focus.
        lapList.insertBefore(lapRow(lap), lapList.firstChild);
        if (sw.laps.length > LAP_MAX) {
            sw.laps.shift();
            lapList.removeChild(lapList.lastChild);
        }
        saveStopwatch();
        renderStopwatch();
    }
    // What Reset clears is kept (and saved, so a reload doesn't lose it) as
    // the Undo copy: Ctrl/Cmd+Z or the Undo button bring it back.
    function swReset() {
        var sw = T.sw;
        sw.undo = { elapsed: sw.elapsed, laps: sw.laps };
        sw.elapsed = 0;
        sw.laps = [];
        saveStopwatch();
        renderLaps();
        renderTools();
    }
    function swUndo() {
        if (!swCanUndo()) return;
        var sw = T.sw;
        sw.elapsed = sw.undo.elapsed;
        sw.laps = sw.undo.laps;
        sw.undo = null;
        saveStopwatch();
        renderLaps();
        renderTools();
    }

    // --- Laps ----------------------------------------------------------------
    // Each row: "Lap 03", an editable note, the lap's own time, the total.
    function lapRow(lap) {
        var li = document.createElement('li');
        li.dataset.n = lap.n;
        var note = document.createElement('input');
        note.className = 'note';
        note.type = 'text';
        note.maxLength = NOTE_MAX;
        note.defaultValue = lap.note;          // the last committed text; Escape goes back to it
        note.placeholder = t('lap_note');
        note.spellcheck = false;
        note.autocomplete = 'off';
        note.setAttribute('aria-label', t('lap_note_for', { n: lap.n }));
        [[t('lap') + ' ' + pad(lap.n), 'idx'], null, [swText(lap.s), 'lap'], [swText(lap.t), 'total']].forEach(function (c) {
            if (!c) { li.appendChild(note); return; }
            var span = document.createElement('span');
            span.className = c[1];
            span.textContent = c[0];
            li.appendChild(span);
        });
        return li;
    }
    function lapByN(n) {
        var laps = T.sw.laps, i = laps.length ? n - laps[0].n : -1;
        if (laps[i] && laps[i].n === n) return laps[i];
        for (i = 0; i < laps.length; i++) if (laps[i].n === n) return laps[i];
        return null;
    }
    // A full rebuild (load, language, reset, undo, another tab's change). A
    // note being typed keeps its text, caret and focus, and its text wins.
    function renderLaps() {
        var a = document.activeElement, keep = null;
        if (a && a.classList.contains('note') && lapList.contains(a)) {
            keep = { n: Number(a.parentNode.dataset.n), before: a.defaultValue, value: a.value, from: a.selectionStart, to: a.selectionEnd };
        }
        var frag = document.createDocumentFragment();
        for (var i = T.sw.laps.length - 1; i >= 0; i--) frag.appendChild(lapRow(T.sw.laps[i]));
        lapList.textContent = '';
        lapList.appendChild(frag);
        var lap = keep && lapByN(keep.n), input = lap && lapList.querySelector('li[data-n="' + keep.n + '"] .note');
        if (input) {
            input.defaultValue = keep.before;
            lap.note = input.value = keep.value;
            input.focus({ preventScroll: true });
            input.setSelectionRange(keep.from, keep.to);
        }
    }
    function swText(ms) { return hms(ms) + '.' + pad(Math.floor((ms % 1000) / 10)); }
    function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    // Local date and time of a moment, "2026-09-19 14:33:11.25" (always 24 h:
    // it sorts as text and spreadsheets read it as a date-time). '' if unknown.
    function clockStamp(ms) {
        if (!ms) return '';
        var d = new Date(ms);
        return ymd(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) +
            '.' + pad(Math.floor(d.getMilliseconds() / 10));
    }
    // RFC 4180: a cell with a comma, quote or line break goes in quotes.
    function csvCell(v) {
        v = String(v);
        return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }
    // One row per lap plus a final "total" row with the full elapsed time
    // (the stopwatch may be running or paused past the last lap). clock_time
    // is when Lap was pressed; on the total row, now if running, else when
    // it was paused. The BOM makes Excel read the file as UTF-8, so å ä ö in
    // notes survive.
    function swExportCsv() {
        var now = Date.now(), total = swElapsed(now);
        var rows = [['lap', 'note', 'lap_time', 'total_time', 'clock_time', 'lap_ms', 'total_ms']];
        T.sw.laps.forEach(function (lap) {
            rows.push([lap.n, lap.note, swText(lap.s), swText(lap.t), clockStamp(lap.c), lap.s, lap.t]);
        });
        rows.push(['total', '', '', swText(total), clockStamp(T.sw.running ? now : T.sw.pausedAt), '', total]);
        var csv = '\uFEFF' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
        var d = new Date(now);
        var a = document.createElement('a');
        a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
        a.download = 'stopwatch_' + ymd(d) + '_' + pad(d.getHours()) + '-' + pad(d.getMinutes()) + '.csv';
        a.click();
    }
    function renderStopwatch() {
        var ms = swElapsed();
        swDigits(hms(ms));
        swCs('.' + pad(Math.floor((ms % 1000) / 10)));
        var sw = T.sw, start = $('#sw-start'), lap = $('#sw-lap'), undo = swCanUndo();
        setText(start, sw.running ? t('btn_pause') : sw.elapsed > 0 ? t('btn_resume') : t('btn_start'));
        start.dataset.variant = sw.running ? '' : 'primary';
        setText(lap, sw.running ? t('btn_lap') : undo ? t('btn_undo') : t('btn_reset'));
        lap.disabled = !sw.running && !undo && (sw.elapsed === 0 || swJustPaused());
        var n = sw.laps.length;
        $('#sw-log-head').hidden = ms === 0 && !n;
        setText($('#sw-lap-count'), n ? t(n === 1 ? 'laps_one' : 'laps_many', { n: n }) : '');
    }

    // ======================================================================
    // Status chips (a running tool, seen from another view)
    // ======================================================================
    function renderChips() {
        var mode = currentMode;
        var chipT = $('#chip-timer'), chipA = $('#chip-alarm'), chipS = $('#chip-stopwatch');
        var showT = mode !== 'timer' && (T.timer.status === 'running' || T.timer.status === 'paused' || ringing === 'timer');
        chipT.hidden = !showT;
        if (showT) {
            setText(chipT, t('mode_timer') + ' ' + shortDuration(ceilSec(timerRemaining())));
            chipT.classList.toggle('alert', ringing === 'timer');
        }
        var showA = mode !== 'alarm' && (T.alarm.armed || ringing === 'alarm');
        chipA.hidden = !showA;
        if (showA) {
            setText(chipA, t('mode_alarm') + ' ' + (ringing === 'alarm' ? ringingAlarmText : formatAlarm(T.alarm.h, T.alarm.m)));
            chipA.classList.toggle('alert', ringing === 'alarm');
        }
        var showS = mode !== 'stopwatch' && (T.sw.running || T.sw.elapsed > 0);
        chipS.hidden = !showS;
        if (showS) setText(chipS, t('mode_stopwatch') + ' ' + shortDuration(swElapsed()));
    }

    function renderTools() {
        renderTimer();
        renderAlarm();
        renderStopwatch();
        renderChips();
    }

    // ======================================================================
    // Drawing loop
    // ======================================================================
    var currentMode = 'clock';
    var frameRaf = 0, frameTimeout = 0;
    function needsSmoothFrames() {
        // The stopwatch's hundredths are what it is for: smooth in every mode.
        if (currentMode === 'stopwatch') return T.sw.running;
        if (S.perf === 'low') return false;
        if (currentMode === 'timer') return T.timer.status === 'running' && timerHasFace();
        if (currentMode !== 'clock') return false;
        if (S.face === 'celestial') return S.seconds && !celSec;   // see buildCelSeconds
        if (S.face === 'ring' || S.face === 'analog') return S.seconds;
        return false;
    }
    // Each part on its own (see safely), so one that fails never stops the loop.
    function frame() {
        frameRaf = 0;
        frameTimeout = 0;
        var now = new Date();
        safely(drawView, now);
        safely(driveCelSeconds, now);
        safely(updateSky);
        scheduleFrame();
    }
    function drawView(now) {
        if (currentMode === 'clock') renderFace(now);
        else if (currentMode === 'timer') tickTimer();
        else if (currentMode === 'alarm') renderAlarm();
        else renderStopwatch();
        renderChips();
    }
    function scheduleFrame() {
        if (frameRaf || frameTimeout || document.hidden) return;
        if (needsSmoothFrames()) { frameRaf = requestAnimationFrame(frame); return; }
        // Otherwise once a second, on the boundary where the display changes:
        // the wall-clock second, or a running countdown's own second.
        var now = Date.now(), phase = now % 1000;
        if (T.timer.status === 'running') phase = ((now - T.timer.endAt) % 1000 + 1000) % 1000;
        frameTimeout = setTimeout(frame, 1000 - phase + 8);
    }
    // Redraw now (after a setting or mode change) and restart the loop.
    function kick() {
        cancelAnimationFrame(frameRaf);
        clearTimeout(frameTimeout);
        frameRaf = frameTimeout = 0;
        frame();
    }

    // ======================================================================
    // Modes
    // ======================================================================
    function setMode(mode) {
        if (['clock', 'timer', 'alarm', 'stopwatch'].indexOf(mode) < 0) mode = 'clock';
        currentMode = mode;
        root.setAttribute('data-mode', mode);
        $$('.view').forEach(function (v) { v.classList.toggle('active', v.dataset.view === mode); });
        $$('.mode-btn').forEach(function (b) { b.setAttribute('aria-current', String(b.dataset.mode === mode)); });
        renderTools();
        kick();
    }

    // ======================================================================
    // Sky (celestial face): a disc of stars behind the dial
    // ======================================================================
    // A little larger than the face (1.4 times: .sky in clock.css), turning
    // very slowly (.sky-turn: once in 30 minutes, the other way round from
    // the planets, as the northern sky does). It takes over from the face's
    // own fixed stars. Made the first time the celestial face is shown, so
    // no other face pays for it; drawn in the face's units, so it grows and
    // shrinks with the face and a resize needs nothing.
    // The still stars are one SVG, painted once, and the turning is the
    // browser's. Every fifth star is a small element whose opacity the
    // browser animates (.tw), and a shooting star is one element the browser
    // moves (Web Animations) and then removes, on a layer that doesn't turn.
    // None of it runs through this script per frame. Low performance and
    // "reduce motion" keep the sky still, with no shooting stars; a hidden
    // face or tab animates nothing.
    var SKY_R = 140;                 // in face units (the face is 200 across)
    var sky = null, skyOn = false, meteorId = 0;
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    function buildSky() {
        var rand = seeded(7), wrap = $('.orbit-wrap'), turn = document.createElement('div');
        sky = document.createElement('div');
        sky.className = 'sky';
        sky.setAttribute('aria-hidden', 'true');
        turn.className = 'sky-turn';
        sky.appendChild(turn);
        var still = svgEl('svg', { viewBox: [-SKY_R, -SKY_R, 2 * SKY_R, 2 * SKY_R].join(' ') }, turn);
        function pct(v) { return ((v + SKY_R) / (2 * SKY_R) * 100).toFixed(2) + '%'; }
        for (var i = 0; i < 160; i++) {
            // Even over the disc (none on the core), fading out towards its rim.
            var d = SKY_R * Math.sqrt(rand()), a = rand() * 2 * Math.PI;
            var x = Math.cos(a) * d, y = Math.sin(a) * d;
            var b = rand() * rand();                     // brightness: mostly faint, a few bright
            var f = clamp((SKY_R - d) / 45, 0, 1), fade = f * f * (3 - 2 * f);
            if (d < 26) continue;
            if (i % 5 || d > 100) {
                svgEl('circle', { cx: x.toFixed(2), cy: y.toFixed(2), r: (.25 + b * .6).toFixed(2), opacity: ((.2 + b * .6) * fade).toFixed(2) }, still);
                continue;
            }
            var tw = document.createElement('i'), size = ((.9 + b * 1.2) / (2 * SKY_R) * 100).toFixed(2) + '%';
            tw.className = 'tw';
            tw.style.cssText = 'left:' + pct(x) + ';top:' + pct(y) + ';width:' + size + ';height:' + size +
                ';animation-duration:' + (2.5 + rand() * 5).toFixed(2) + 's;animation-delay:-' + (rand() * 8).toFixed(2) + 's';
            turn.appendChild(tw);
        }
        wrap.insertBefore(sky, wrap.firstChild);
        $('#cel-stars').setAttribute('hidden', '');
    }
    // Called every frame (once a second on this face): builds the sky when
    // it is first needed, clears it when it goes, and keeps one shooting
    // star waiting while it may have them.
    function updateSky() {
        var on = currentMode === 'clock' && S.face === 'celestial';
        if (on && !sky) buildSky();
        if (!sky) return;
        if (on !== skyOn) {
            skyOn = on;
            if (!on) $$('.meteor', sky).forEach(function (el) { el.remove(); });
        }
        var lively = on && S.perf !== 'low' && !reducedMotion.matches;
        if (lively && !meteorId) scheduleMeteor();
        else if (!lively && meteorId) { clearTimeout(meteorId); meteorId = 0; }
    }

    // Peak nights of the main meteor showers (month, day; they shift by a day
    // or so from year to year): shooting stars come twice as often then.
    var SHOWERS = [[1, 3], [4, 22], [5, 6], [8, 12], [10, 21], [11, 17], [12, 13]];
    function showerNight(d) {
        return SHOWERS.some(function (p) {
            return Math.abs(d - new Date(d.getFullYear(), p[0] - 1, p[1], 12)) < 1.5 * 86400000;
        });
    }
    // One every 15-75 s.
    function scheduleMeteor() {
        var wait = (15 + Math.random() * 60) * 1000 / (showerNight(new Date()) ? 2 : 1);
        meteorId = setTimeout(function () {
            meteorId = 0;
            // Not while nobody would see it: a hidden tab, or under the event card.
            if (!document.hidden && !$('#card-overlay.active')) safely(shootStar);
            safely(updateSky);
        }, wait);
    }
    // In px within the sky's box: it starts somewhere in the middle of the
    // disc, and its flight is cut short if it would leave the stars.
    function shootStar() {
        var R = sky.offsetWidth / 2;
        var len = R * (.15 + Math.random() * .15), travel = R * (.35 + Math.random() * .25);
        var a = (18 + Math.random() * 37) * Math.PI / 180;      // falling, 18-55° below level
        if (Math.random() < .5) a = Math.PI - a;                // to the left or to the right
        var r0 = R * .55 * Math.sqrt(Math.random()), b0 = Math.random() * 2 * Math.PI;
        var x = R + Math.cos(b0) * r0, y = R + Math.sin(b0) * r0;
        while (Math.hypot(x + Math.cos(a) * travel - R, y + Math.sin(a) * travel - R) > R * .85) travel *= .85;
        var dx = Math.cos(a) * travel, dy = Math.sin(a) * travel, deg = (a * 180 / Math.PI).toFixed(1);
        // The element's right end is the head (transform-origin in clock.css):
        // it is put at the point reached so far and turned about that end, so
        // the tail trails behind it.
        function at(f, stretch) {
            return 'translate(' + (x + dx * f - len).toFixed(1) + 'px,' + (y + dy * f).toFixed(1) + 'px) ' +
                'rotate(' + deg + 'deg) scaleX(' + stretch + ')';
        }
        var el = document.createElement('i');
        el.className = 'meteor';
        el.style.width = len.toFixed(0) + 'px';
        sky.appendChild(el);
        el.animate([
            { transform: at(0, .15), opacity: 0 },
            { transform: at(.25, .8), opacity: 1, offset: .25 },
            { transform: at(1, 1), opacity: 0 }
        ], { duration: 450 + Math.random() * 450 }).onfinish = function () { el.remove(); };
    }

    // ======================================================================
    // Background photos
    // ======================================================================
    var PRESETS = [1, 2, 3, 4, 5, 6, 7].map(function (n) {
        return { id: 'p' + n, src: '/revery_notebook/image_assets/bg_' + n + '_web.jpg', thumb: '/clock/img/thumb_bg_' + n + '.jpg' };
    });
    var userPhotos = [];          // { id, src, thumb } — loaded from IndexedDB on demand
    var userPhotosLoaded = false;
    var bgLayers = [$('#bg-a'), $('#bg-b')], bgFront = 0, bgToken = 0, bgShown = null, cycleId = 0;

    function allPhotos() { return PRESETS.concat(userPhotos); }
    function findPhoto(id) {
        var list = allPhotos();
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return null;
    }
    // Load the image fully before fading to it, so the fade never goes to blank.
    function showBackground() {
        if (S.bgOpacity === 0) return;           // nothing visible: don't download
        var photo = findPhoto(S.bg);
        if (!photo) {
            if (S.bg.charAt(0) === 'u' && !userPhotosLoaded) { loadUserPhotos().then(showBackground); return; }
            photo = PRESETS[2];
        }
        if (bgShown === photo.id) return;
        var token = ++bgToken, img = new Image();
        img.onload = function () {
            if (token !== bgToken) return;
            var back = bgLayers[1 - bgFront];
            back.style.backgroundImage = 'url("' + photo.src + '")';
            back.classList.add('active');
            bgLayers[bgFront].classList.remove('active');
            bgFront = 1 - bgFront;
            bgShown = photo.id;
        };
        img.src = photo.src;
    }
    function nextBackground() {
        var list = allPhotos(), i = 0;
        for (var j = 0; j < list.length; j++) if (list[j].id === S.bg) i = j;
        S.bg = list[(i + 1) % list.length].id;
        showBackground();
        renderPhotoStrip();
    }
    function restartCycle() {
        clearInterval(cycleId);
        cycleId = 0;
        if (!S.bgCycle) return;
        loadUserPhotos();
        cycleId = setInterval(nextBackground, 90000);
    }

    // --- IndexedDB for added photos ---------------------------------------
    // create false: only open a database that already exists. Opening one
    // that doesn't would make it; aborting that first upgrade prevents it.
    function openPhotoDb(name, create) {
        return new Promise(function (resolve, reject) {
            var req = indexedDB.open(name, 1);
            req.onupgradeneeded = function () {
                if (!create) { req.transaction.abort(); return; }
                req.result.createObjectStore('photos', { keyPath: 'id' });
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    }
    var dbPromise = null;
    function db() {
        if (!dbPromise) dbPromise = openPhotoDb(PHOTO_DB, true);
        return dbPromise;
    }
    function idb(mode, fn) {
        return db().then(function (d) {
            return new Promise(function (resolve, reject) {
                var tx = d.transaction('photos', mode), req = fn(tx.objectStore('photos'));
                tx.oncomplete = function () { resolve(req && req.result); };
                tx.onerror = function () { reject(tx.error); };
            });
        });
    }
    // Photos added before the storage rename are in the old database: copy
    // them over, and delete the old database only once the copy is committed
    // (if anything fails it stays for the next visit to try again).
    var photosMigrated = false;
    function migrateOldPhotos() {
        photosMigrated = true;
        return openPhotoDb(OLD_PHOTO_DB, false).then(function (old) {
            return new Promise(function (resolve, reject) {
                var tx = old.transaction('photos', 'readonly'), req = tx.objectStore('photos').getAll();
                tx.oncomplete = function () { old.close(); resolve(req.result || []); };
                tx.onerror = function () { old.close(); reject(tx.error); };
            });
        }).then(function (rows) {
            if (rows.length) return idb('readwrite', function (store) { rows.forEach(function (r) { store.put(r); }); });
        }).then(function () {
            indexedDB.deleteDatabase(OLD_PHOTO_DB);
        }).catch(function () {});
    }
    function loadUserPhotos() {
        // Only touch IndexedDB if a photo was ever added, so a plain visit
        // creates no database.
        if (userPhotosLoaded || !S.photos.length) { userPhotosLoaded = true; return Promise.resolve(); }
        function readAll() { return idb('readonly', function (store) { return store.getAll(); }); }
        return readAll().then(function (rows) {
            var have = {};
            (rows || []).forEach(function (r) { have[r.id] = true; });
            var missing = S.photos.some(function (id) { return !have[id]; });
            return missing && !photosMigrated ? migrateOldPhotos().then(readAll) : rows;
        }).then(function (rows) {
            var byId = {};
            (rows || []).forEach(function (r) { byId[r.id] = r; });
            userPhotos = S.photos.filter(function (id) { return byId[id]; }).map(function (id) { return byId[id]; });
            userPhotosLoaded = true;
        }, function () { userPhotosLoaded = true; });
    }
    function scaledDataUrl(img, maxSide, quality) {
        var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, maxSide / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.round(w * k);
        c.height = Math.round(h * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', quality);
    }
    function squareThumb(img) {
        var s = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement('canvas');
        c.width = c.height = 120;
        c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 120, 120);
        return c.toDataURL('image/jpeg', 0.7);
    }
    // Read as a data: URL (not an object URL): the live CSP has no blob: in img-src.
    function addPhoto(file) {
        if (!file || !/^image\//.test(file.type)) return;
        var reader = new FileReader();
        reader.onload = function () {
            var img = new Image();
            img.onload = function () {
                var rec = { id: 'u' + Date.now().toString(36), src: scaledDataUrl(img, 2560, 0.85), thumb: squareThumb(img) };
                loadUserPhotos()
                    .then(function () { return idb('readwrite', function (store) { return store.put(rec); }); })
                    .then(function () {
                        userPhotos.push(rec);
                        S.photos.push(rec.id);
                        S.bg = rec.id;
                        if (S.bgOpacity === 0) S.bgOpacity = DEFAULTS.bgOpacity;
                        saveSettings();
                        applyRoot();
                        syncSettingsUI();
                        showBackground();
                        renderPhotoStrip();
                    })
                    .catch(function () { alert(t('photo_failed')); });
            };
            img.onerror = function () { alert(t('photo_failed')); };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    }
    function removePhoto(id) {
        idb('readwrite', function (store) { return store.delete(id); }).catch(function () {});
        userPhotos = userPhotos.filter(function (p) { return p.id !== id; });
        S.photos = S.photos.filter(function (p) { return p !== id; });
        if (S.bg === id) S.bg = DEFAULTS.bg;
        saveSettings();
        showBackground();
        renderPhotoStrip();
    }

    function renderPhotoStrip() {
        var strip = $('#photo-strip');
        if (!panelOpen) return;
        strip.textContent = '';
        allPhotos().forEach(function (p, i) {
            var item = document.createElement('div');
            item.className = 'photo-item';
            var b = document.createElement('button');
            b.className = 'photo-thumb';
            b.style.backgroundImage = 'url("' + p.thumb + '")';
            b.setAttribute('aria-pressed', String(p.id === S.bg));
            b.setAttribute('aria-label', p.id.charAt(0) === 'u' ? t('your_photo') : t('photo_n', { n: i + 1 }));
            b.addEventListener('click', function () {
                S.bg = p.id;
                S.bgCycle = false;
                if (S.bgOpacity === 0) S.bgOpacity = DEFAULTS.bgOpacity;
                saveSettings();
                applyRoot();
                restartCycle();
                showBackground();
                syncSettingsUI();
                renderPhotoStrip();
            });
            item.appendChild(b);
            if (p.id.charAt(0) === 'u') {
                var rm = document.createElement('button');
                rm.className = 'photo-remove';
                rm.textContent = '✕';
                rm.setAttribute('aria-label', t('remove_photo'));
                rm.addEventListener('click', function () { removePhoto(p.id); });
                item.appendChild(rm);
            }
            strip.appendChild(item);
        });
        var add = document.createElement('button');
        add.className = 'photo-thumb add';
        add.textContent = '+';
        add.setAttribute('aria-label', t('add_photo'));
        add.title = t('add_photo');
        add.addEventListener('click', function () { $('#photo-upload').click(); });
        strip.appendChild(add);
    }

    // ======================================================================
    // Settings panel
    // ======================================================================
    var panel = $('#settings-panel'), cog = $('#cog'), panelOpen = false;
    function openPanel() {
        panelOpen = true;
        panel.classList.add('open');
        panel.inert = false;
        cog.setAttribute('aria-expanded', 'true');
        syncSettingsUI();
        renderPhotoStrip();
        loadUserPhotos().then(renderPhotoStrip);
    }
    function closePanel(returnFocus) {
        if (!panelOpen) return;
        panelOpen = false;
        panel.classList.remove('open');
        panel.inert = true;
        cog.setAttribute('aria-expanded', 'false');
        if (returnFocus) cog.focus();
    }

    function applyRoot() {
        root.setAttribute('data-theme', resolvedTheme());
        if (S.theme === 'custom') {
            root.style.setProperty('--custom-bg', S.customBg);
            root.style.setProperty('--custom-ink', S.customInk);
            root.setAttribute('data-tone', luminance(S.customBg) < .179 ? 'dark' : 'light');
        } else {
            root.style.removeProperty('--custom-bg');
            root.style.removeProperty('--custom-ink');
            root.removeAttribute('data-tone');
        }
        root.setAttribute('data-face', S.face);
        root.setAttribute('data-size', S.size);
        root.setAttribute('data-format', S.format);
        root.setAttribute('data-seconds', String(S.seconds));
        root.setAttribute('data-perf', S.perf);
        root.style.setProperty('--bg-opacity', String(S.bgOpacity));
    }
    function syncSettingsUI() {
        $$('[data-set]').forEach(function (btn) {
            var kv = btn.dataset.set.split('=');
            btn.setAttribute('aria-pressed', String(String(S[kv[0]]) === kv[1]));
        });
        var pct = Math.round(S.bgOpacity * 100);
        $('#bg-opacity').value = pct;
        $('#bg-opacity-val').textContent = pct + '%';
        var custom = S.theme === 'custom';
        setHidden($('#custom-colors'), !custom);
        setHidden($('#contrast-note'), !custom || contrastRatio(S.customBg, S.customInk) >= 4.5);
        $('#custom-bg').value = S.customBg;
        $('#custom-ink').value = S.customInk;
    }
    // A colour picked for the custom theme: shown live while the picker is
    // dragged, saved once it is closed ("change").
    function setCustomColor(key, value, save) {
        if (!HEX.test(value)) return;
        S[key] = value.toLowerCase();
        S.theme = 'custom';
        applyRoot();
        syncSettingsUI();
        if (save) saveSettings();
    }
    // Another tab saved settings: take them over, so this tab's next save
    // doesn't put back its older copy (and, say, drop a photo added there).
    function adoptSettings() {
        var before = S;
        S = loadSettings();
        applyRoot();
        if (before.lang !== S.lang) { applyLanguage(); renderLaps(); }
        if (before.face !== S.face && hgClock) hgClock.flips = -1;
        if (before.bgCycle !== S.bgCycle) restartCycle();
        if (before.photos.join() !== S.photos.join()) { userPhotosLoaded = false; userPhotos = []; }
        syncSettingsUI();
        loadUserPhotos().then(function () { renderPhotoStrip(); showBackground(); });
    }
    function applySetting(key, value) {
        if (key === 'seconds' || key === 'bgCycle') value = value === 'true';
        S[key] = value;
        saveSettings();
        applyRoot();
        syncSettingsUI();
        if (key === 'lang') { applyLanguage(); renderLaps(); renderPhotoStrip(); }
        if (key === 'bgCycle') restartCycle();
        if (key === 'face' && hgClock) hgClock.flips = -1;
        renderTools();
        kick();
    }

    // ======================================================================
    // Event card (loaded on first use)
    // ======================================================================
    // card.js builds its own markup and loads its own stylesheet, so the two
    // always match. The <template id="ecm-template"> and event_card.js/.css
    // are left only for browsers still running the clock.js from before
    // 2026-09-23, which loads those instead.
    var cardState = 'none';   // none | loading | ready
    function openCard() {
        if (cardState === 'ready') { window.RvryCard.open(); return; }
        if (cardState === 'loading') return;
        cardState = 'loading';
        var s = document.createElement('script');
        s.src = '/clock/js/card.js' + ASSET_V;
        s.onload = function () { cardState = 'ready'; window.RvryCard.open(); };
        s.onerror = function () { cardState = 'none'; s.remove(); };
        document.body.appendChild(s);
    }

    // ======================================================================
    // Wiring
    // ======================================================================
    // Two-digit number fields: digits only, clamped on leave, arrows step.
    function wireNumberInput(el, onCommit) {
        var max = Number(el.dataset.max);
        // Select all on focus; swallow the mouseup that would otherwise drop
        // the selection again in Chrome/Safari.
        var justFocused = false;
        el.addEventListener('focus', function () { el.select(); justFocused = true; });
        el.addEventListener('mouseup', function (e) { if (justFocused) { e.preventDefault(); justFocused = false; } });
        el.addEventListener('input', function () {
            var v = el.value.replace(/\D/g, '').slice(-2);
            if (el.value !== v) el.value = v;
        });
        el.addEventListener('change', function () {
            el.value = pad(clamp(parseInt(el.value, 10) || 0, 0, max));
            if (onCommit) onCommit();
        });
        el.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                var n = (parseInt(el.value, 10) || 0) + (e.key === 'ArrowUp' ? 1 : -1);
                el.value = pad(n > max ? 0 : n < 0 ? max : n);
                if (onCommit) onCommit();
                el.select();
            } else if (e.key === 'Enter') {
                el.blur();
            }
        });
    }
    function isTyping(el) {
        return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    }

    function wire() {
        $$('.mode-btn').forEach(function (b) { b.addEventListener('click', function () { setMode(b.dataset.mode); }); });
        document.addEventListener('click', function (e) {
            if (panelOpen && !panel.contains(e.target) && !cog.contains(e.target)) closePanel(false);
            var go = e.target.closest('[data-goto]');
            if (go) setMode(go.dataset.goto);
            else if (e.target.closest('[data-card]')) openCard();
        });

        // Chrome: the mode bar shows when the pointer is near the top; the
        // cursor and chrome fade after a few idle seconds (wall-clock use).
        var idleId = 0;
        function wake() {
            app.classList.remove('idle');
            clearTimeout(idleId);
            idleId = setTimeout(function () {
                if (!panelOpen && !ringing) app.classList.add('idle');
                app.classList.remove('chrome-top');
            }, 3000);
        }
        document.addEventListener('pointermove', function (e) {
            if (e.pointerType !== 'mouse') return;
            app.classList.toggle('chrome-top', e.clientY <= Math.max(110, window.innerHeight * 0.18));
            wake();
        });
        document.addEventListener('mouseleave', function () { app.classList.remove('chrome-top'); });
        document.addEventListener('keydown', wake);

        cog.addEventListener('click', function () { if (panelOpen) closePanel(false); else openPanel(); });
        $('#panel-close').addEventListener('click', function () { closePanel(true); });
        $$('[data-set]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var kv = btn.dataset.set.split('=');
                applySetting(kv[0], kv[1]);
            });
        });
        $('#bg-next').addEventListener('click', function () {
            nextBackground();
            saveSettings();
            restartCycle();
        });
        $('#bg-opacity').addEventListener('input', function (e) {
            S.bgOpacity = clamp(Number(e.target.value) / 100, 0, 1);
            $('#bg-opacity-val').textContent = e.target.value + '%';
            root.style.setProperty('--bg-opacity', String(S.bgOpacity));
            showBackground();
        });
        $('#bg-opacity').addEventListener('change', saveSettings);
        $('#photo-upload').addEventListener('change', function (e) {
            if (e.target.files && e.target.files[0]) addPhoto(e.target.files[0]);
            e.target.value = '';
        });
        [['#custom-bg', 'customBg'], ['#custom-ink', 'customInk']].forEach(function (pair) {
            var input = $(pair[0]);
            input.addEventListener('input', function () { setCustomColor(pair[1], input.value, false); });
            input.addEventListener('change', function () { setCustomColor(pair[1], input.value, true); });
        });

        // Timer
        timerInputs.forEach(function (el) { wireNumberInput(el, renderTimer); });
        $('#timer-start').addEventListener('click', timerStartPause);
        $('#timer-reset').addEventListener('click', timerReset);
        $$('[data-preset]').forEach(function (b) {
            b.addEventListener('click', function () { applyPreset(Number(b.dataset.preset)); });
        });
        // Alarm
        alarmInputs.forEach(function (el) {
            wireNumberInput(el, function () {
                T.alarm.h = clamp(parseInt(alarmInputs[0].value, 10) || 0, 0, 23);
                T.alarm.m = clamp(parseInt(alarmInputs[1].value, 10) || 0, 0, 59);
                renderAlarm();
            });
        });
        $('#alarm-toggle').addEventListener('click', alarmToggle);
        // Stopwatch
        $('#sw-start').addEventListener('click', swStartPause);
        $('#sw-lap').addEventListener('click', swLapReset);
        $('#sw-export').addEventListener('click', swExportCsv);
        // Lap notes: saved a moment after typing stops, and at once when the
        // field is left (Enter leaves it too). Escape puts back the last
        // committed text, which the field keeps as its defaultValue.
        function setNote(input) {
            var lap = lapByN(Number(input.parentNode.dataset.n));
            if (lap) lap.note = input.value.slice(0, NOTE_MAX);
        }
        lapList.addEventListener('input', function (e) {
            if (!e.target.classList.contains('note')) return;
            setNote(e.target);
            clearTimeout(swSaveId);
            swSaveId = setTimeout(saveStopwatch, 400);
        });
        function commitNote(input) {
            input.defaultValue = input.value;
            if (swSaveId) saveStopwatch();
        }
        lapList.addEventListener('focusout', function (e) {
            if (e.target.classList.contains('note')) commitNote(e.target);
        });
        lapList.addEventListener('keydown', function (e) {
            if (!e.target.classList.contains('note')) return;
            if (e.key === 'Enter') {
                e.preventDefault();
                commitNote(e.target);
                e.target.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();                   // the page's own Escape handling skips it
                e.target.value = e.target.defaultValue;
                setNote(e.target);
                saveStopwatch();
                e.target.blur();
            }
        });
        window.addEventListener('pagehide', function () { if (swSaveId) saveStopwatch(); });
        // Ringing
        $('#ring-dismiss').addEventListener('click', dismiss);

        document.addEventListener('keydown', function (e) {
            if (e.defaultPrevented) return;
            var cardOpen = $('#card-overlay.active');
            // Ctrl+Z / Cmd+Z undoes a stopwatch reset. Not while typing in a
            // field (that is the field's own undo), nor under the event card.
            if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
                if (currentMode === 'stopwatch' && !cardOpen && !isTyping(e.target) && swCanUndo()) {
                    e.preventDefault();
                    swUndo();
                }
                return;
            }
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key === 'Escape') {
                if (cardOpen) return;                 // card.js closes itself
                if (panelOpen) { closePanel(true); return; }
                if (ringing) dismiss();
                return;
            }
            if (cardOpen || isTyping(e.target)) return;
            if (e.key === ' ' && e.target.tagName !== 'BUTTON') {
                if (ringing) { e.preventDefault(); dismiss(); }
                else if (currentMode === 'timer') { e.preventDefault(); timerStartPause(); }
                else if (currentMode === 'stopwatch') { e.preventDefault(); swStartPause(); }
            } else if ((e.key === 'l' || e.key === 'L') && currentMode === 'stopwatch' && T.sw.running) {
                swLapReset();
            }
        });

        darkQuery.addEventListener('change', function () { if (S.theme === 'auto') applyRoot(); });
        reducedMotion.addEventListener('change', function () { safely(updateSky); });
        // index.html hides the Performance field: a clock.js from before it
        // (cached for months) would show a switch that does nothing.
        var perfField = $('#perf-field');
        if (perfField) perfField.hidden = false;

        // Another tab (or window) wrote one of the clock's keys: take its
        // version. Each tab keeps everything in memory and saves it whole, so
        // without this a tab left open in the background would later write
        // its older copy back (a second tab arming an alarm used to wipe the
        // laps saved by the first).
        window.addEventListener('storage', function (e) {
            if (e.storageArea !== localStorage) return;
            if (e.key === KEYS.stopwatch) {
                T.sw = loadStopwatch();
                renderLaps();
            } else if (e.key === KEYS.timers) {
                var fresh = loadTimers(false);
                T.timer = fresh.timer;
                T.alarm = fresh.alarm;
                // Dismissed, reset or restarted over there: stop ringing here too.
                if (ringing === 'timer' && T.timer.status !== 'done') { ringing = null; stopSound(); renderRinging(); }
                if (T.timer.status === 'idle' && timerInputs.indexOf(document.activeElement) < 0) durationToInputs(T.timer.duration);
                scheduleDue();
            } else if (e.key === KEYS.settings) {
                adoptSettings();
            } else {
                return;
            }
            heartbeat();
            renderTools();
            kick();
        });

        // Back in view: catch up on anything that came due, restart drawing.
        function resume() { checkDue(); heartbeat(); kick(); }
        document.addEventListener('visibilitychange', function () { if (!document.hidden) resume(); });
        window.addEventListener('pageshow', function (e) { if (e.persisted) resume(); });
        window.addEventListener('focus', checkDue);
    }

    // ======================================================================
    // Boot
    // ======================================================================
    // Each face is built on its own (see safely): one that fails stays blank,
    // and the timer, alarm and stopwatch still work.
    hgClock = safely(makeHourglass, '');
    [buildRing, buildAnalog, buildCelestial, buildCelSeconds, buildTimerFace].forEach(function (build) { safely(build); });
    applyRoot();
    applyLanguage();
    wire();
    durationToInputs(T.timer.duration);
    renderLaps();
    showBackground();
    restartCycle();
    setMode('clock');
    checkDue();
    heartbeat();
}());
