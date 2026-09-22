/* ==========================================================================
   Event card editor (/clock/) — the easter egg behind the clock's date.

   clock.js loads this file the first time the date is clicked. It builds its
   own markup and loads its own stylesheet (CSS_HREF below), so this file and
   its CSS always travel together. The older <template id="ecm-template"> and
   event_card.js/.css are only for browsers that still have the pre-2026-09-23
   clock.js cached; nothing here uses them.

   What clock.js relies on (keep these stable):
     window.RvryCard.open()   opens the editor
     #card-overlay.active     present while it is open; the clock pauses its
                              keyboard shortcuts meanwhile

   Storage (listed in input_legal/legal.md):
     localStorage "rvry-clock-card"            the card being made, plus the ids
                                               of the images added
     localStorage "rvry-clock-card-templates"  templates saved by the visitor
     IndexedDB    "rvry-clock-card-images"     the added images themselves (never
                                               in localStorage, which holds ~5 MB
                                               for the whole site)

   Model: one plain object, `doc`, saved as JSON. The template's automatic
   layout (the one the old event card had) decides where each element goes;
   moving an element stores an offset from there, as a fraction of the card's
   width/height, so it stays roughly in place when the size changes.
   render() works in card pixels. The preview draws the same thing through a
   scale transform, and text is always measured at full size, so line breaks
   in the preview are the ones in the exported file.
   ========================================================================== */
(function () {
'use strict';

// Bump with every card.css change: this file and the CSS must match, and both
// are cached for months (clock.js loads this file without a version).
var CSS_HREF = '/clock/css/card.css?v=20260923';

var KEY_DOC = 'rvry-clock-card';
var KEY_TPL = 'rvry-clock-card-templates';
var IMG_DB = 'rvry-clock-card-images';
var MAX_IMG = 4096;       // longest side an added image is stored at
var MAX_DPR = 2;          // preview resolution cap
var HISTORY_MAX = 100;

var root = document.documentElement;
function $(sel, r) { return (r || document).querySelector(sel); }
function $$(sel, r) { return Array.prototype.slice.call((r || document).querySelectorAll(sel)); }
function pad(n) { return String(n).padStart(2, '0'); }
function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function noop() {}
function readJSON(key) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
}

// ==========================================================================
// Language (the editor follows the clock's EN / SV setting)
// ==========================================================================
var I18N = {
    en: {
        heading: 'Event card', close: 'Close', undo: 'Undo', redo: 'Redo', new_card: 'New card',
        export: 'Export', exporting: 'Exporting…', file_type: 'File type', ft_transp: 'PNG transp.',
        export_failed: 'This size is too large for this browser. Try a smaller one.',
        content: 'Content', f_title: 'Title', f_title_ph: 'Event name…',
        f_author: 'Author / contact', f_author_ph: 'Name or email…',
        f_desc: 'Description', f_desc_hint: 'Markdown: # heading, **bold**, *italic*, `code`, - list, | table |',
        f_date: 'Date', prev_month: 'Previous month', next_month: 'Next month',
        tab_design: 'Design', tab_layers: 'Layers',
        template: 'Template', tpl_builtin: 'Built in', tpl_yours: 'Yours',
        tpl_reapply: 'Reset to this template', tpl_save: 'Save as template', tpl_delete: 'Delete template',
        tpl_name_ph: 'Template name…', tpl_default_name: 'My template {n}', save: 'Save', cancel: 'Cancel',
        tpl_delete_confirm: 'Delete the template “{name}”?',
        tpl_classic: 'Classic', tpl_centered: 'Centred', tpl_right: 'Right-aligned', tpl_logo: 'Logo',
        tpl_paper: 'Paper', tpl_columns: 'Two columns',
        card: 'Card', format: 'Size', fmt_screen: 'Screen', fmt_print: 'Print (300 dpi)', fmt_other: 'Other',
        fmt_square: 'Square', fmt_banner: 'Banner', fmt_biz: 'Business card', portrait: 'portrait', landscape: 'landscape',
        theme: 'Card theme', dark: 'Dark', light: 'Light',
        align: 'Alignment', left: 'Left', center: 'Centre', right: 'Right',
        font_scale: 'Text size', padding: 'Margins', pad_bias: 'Margin balance ↕ ↔',
        el_bg: 'Background', el_graphic: 'Graphic', el_title: 'Title', el_date: 'Date', el_author: 'Author',
        el_desc: 'Description', el_image: 'Image {n}',
        show: 'Show', hide: 'Hide', visible: 'Visible', on: 'On', off: 'Off',
        add_image: 'Add image', image_failed: 'That image could not be read.',
        select_hint: 'Click something on the card, or pick it in the list.',
        reset_pos: 'Reset position', size: 'Size', color: 'Colour', color_reset: 'Use the default colour',
        opacity: 'Opacity', date_lang: 'Date language', rule: 'Line under the title',
        author_pos: 'Position', opposite: 'Opposite', diagonal: 'Diagonal',
        author_empty: 'Type a name or contact under Content to show it.',
        body_color: 'Text colour', accent_color: 'Accent colour', columns: 'Columns', justify: 'Justify',
        desc_empty: 'Write a description under Content to show it.',
        banner_desc: 'The banner size has no room for the description.',
        kind: 'Shape', ring: 'Ring', logo_hr: 'Harald Revery logo', logo_text: 'Text logo',
        logo_mtn1: 'Mountains 1', logo_mtn3: 'Mountains 2', logo_dots: 'Dotted mountain',
        photo: 'Photo', none: 'None', zoom: 'Zoom', bg_hint: 'Drag on the card to move the photo.',
        bg_transp: 'A transparent PNG has no background.', your_image: 'Your image {n}',
        remove_image: 'Remove this image',
        remove_image_confirm: 'Remove this image from the card editor? Cards and templates that use it lose it.',
        layer_front: 'Above the text', layer_remove: 'Remove layer', layer_up: 'Move up', layer_down: 'Move down',
        image_missing: 'This image is missing.',
        hint_drag: 'Drag to move · double-click resets · arrow keys nudge',
        hint_touch: 'Tap to select, then drag',
        warn_overflow: 'Some text runs off the card.',
        drop_here: 'Drop an image to add it',
        card_title_placeholder: 'EVENT TITLE',
        months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
        days_short: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
    },
    sv: {
        heading: 'Eventkort', close: 'Stäng', undo: 'Ångra', redo: 'Gör om', new_card: 'Nytt kort',
        export: 'Exportera', exporting: 'Exporterar…', file_type: 'Filtyp', ft_transp: 'PNG transp.',
        export_failed: 'Storleken är för stor för den här webbläsaren. Prova en mindre.',
        content: 'Innehåll', f_title: 'Titel', f_title_ph: 'Evenemangets namn…',
        f_author: 'Avsändare / kontakt', f_author_ph: 'Namn eller e-post…',
        f_desc: 'Beskrivning', f_desc_hint: 'Markdown: # rubrik, **fet**, *kursiv*, `kod`, - lista, | tabell |',
        f_date: 'Datum', prev_month: 'Föregående månad', next_month: 'Nästa månad',
        tab_design: 'Design', tab_layers: 'Lager',
        template: 'Mall', tpl_builtin: 'Inbyggda', tpl_yours: 'Dina',
        tpl_reapply: 'Återställ till mallen', tpl_save: 'Spara som mall', tpl_delete: 'Ta bort mallen',
        tpl_name_ph: 'Mallens namn…', tpl_default_name: 'Min mall {n}', save: 'Spara', cancel: 'Avbryt',
        tpl_delete_confirm: 'Ta bort mallen ”{name}”?',
        tpl_classic: 'Klassisk', tpl_centered: 'Centrerad', tpl_right: 'Högerställd', tpl_logo: 'Logotyp',
        tpl_paper: 'Papper', tpl_columns: 'Två spalter',
        card: 'Kort', format: 'Storlek', fmt_screen: 'Skärm', fmt_print: 'Tryck (300 dpi)', fmt_other: 'Övrigt',
        fmt_square: 'Kvadrat', fmt_banner: 'Banner', fmt_biz: 'Visitkort', portrait: 'stående', landscape: 'liggande',
        theme: 'Kortets tema', dark: 'Mörkt', light: 'Ljust',
        align: 'Justering', left: 'Vänster', center: 'Mitten', right: 'Höger',
        font_scale: 'Textstorlek', padding: 'Marginaler', pad_bias: 'Marginalbalans ↕ ↔',
        el_bg: 'Bakgrund', el_graphic: 'Grafik', el_title: 'Titel', el_date: 'Datum', el_author: 'Avsändare',
        el_desc: 'Beskrivning', el_image: 'Bild {n}',
        show: 'Visa', hide: 'Dölj', visible: 'Synlig', on: 'På', off: 'Av',
        add_image: 'Lägg till bild', image_failed: 'Bilden kunde inte läsas.',
        select_hint: 'Klicka på något på kortet, eller välj det i listan.',
        reset_pos: 'Återställ position', size: 'Storlek', color: 'Färg', color_reset: 'Använd standardfärgen',
        opacity: 'Opacitet', date_lang: 'Datumspråk', rule: 'Linje under titeln',
        author_pos: 'Placering', opposite: 'Motsatt', diagonal: 'Diagonalt',
        author_empty: 'Skriv ett namn eller en kontakt under Innehåll för att visa det.',
        body_color: 'Textfärg', accent_color: 'Accentfärg', columns: 'Spalter', justify: 'Marginaljustera',
        desc_empty: 'Skriv en beskrivning under Innehåll för att visa den.',
        banner_desc: 'Bannerstorleken har inte plats för beskrivningen.',
        kind: 'Form', ring: 'Ring', logo_hr: 'Harald Revery-logotyp', logo_text: 'Textlogotyp',
        logo_mtn1: 'Berg 1', logo_mtn3: 'Berg 2', logo_dots: 'Prickigt berg',
        photo: 'Foto', none: 'Inget', zoom: 'Zoom', bg_hint: 'Dra på kortet för att flytta fotot.',
        bg_transp: 'En transparent PNG har ingen bakgrund.', your_image: 'Din bild {n}',
        remove_image: 'Ta bort bilden',
        remove_image_confirm: 'Ta bort bilden från kortredigeraren? Kort och mallar som använder den förlorar den.',
        layer_front: 'Över texten', layer_remove: 'Ta bort lagret', layer_up: 'Flytta upp', layer_down: 'Flytta ner',
        image_missing: 'Bilden saknas.',
        hint_drag: 'Dra för att flytta · dubbelklicka för att återställa · piltangenterna knuffar',
        hint_touch: 'Tryck för att välja, dra sedan',
        warn_overflow: 'En del text hamnar utanför kortet.',
        drop_here: 'Släpp en bild för att lägga till den',
        card_title_placeholder: 'EVENEMANG',
        months: ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December'],
        days_short: ['Sö', 'Må', 'Ti', 'On', 'To', 'Fr', 'Lö']
    }
};
var uiLang = 'en';
function t(key, vars) {
    var s = (I18N[uiLang] && I18N[uiLang][key]) || I18N.en[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.replace('{' + k + '}', vars[k]); });
    return s;
}

// The date printed on the card has its own language (EN / SV).
var CARD_DAYS = {
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    sv: ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag']
};
var CARD_MONTHS = { en: I18N.en.months, sv: I18N.sv.months };
function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function cardDate(d, lang) {
    if (lang === 'sv') return CARD_DAYS.sv[d.getDay()] + ' den ' + d.getDate() + ' ' + CARD_MONTHS.sv[d.getMonth()] + ' ' + d.getFullYear();
    return CARD_DAYS.en[d.getDay()] + ', ' + ordinal(d.getDate()) + ' ' + CARD_MONTHS.en[d.getMonth()] + ' ' + d.getFullYear();
}
function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function parseIso(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
}

// ==========================================================================
// Fixed data
// ==========================================================================
var FORMATS = [
    { id: '720p',       g: 'screen', w: 1280, h: 720 },
    { id: '720p_vert',  g: 'screen', w: 720,  h: 1280 },
    { id: '1080p',      g: 'screen', w: 1920, h: 1080 },
    { id: '1080p_vert', g: 'screen', w: 1080, h: 1920 },
    { id: '1440p',      g: 'screen', w: 2560, h: 1440 },
    { id: '1440p_vert', g: 'screen', w: 1440, h: 2560 },
    { id: '2160p',      g: 'screen', w: 3840, h: 2160 },
    { id: '2160p_vert', g: 'screen', w: 2160, h: 3840 },
    { id: 'a6',         g: 'print',  w: 1240, h: 1748 },
    { id: 'a5',         g: 'print',  w: 1748, h: 2480 },
    { id: 'a4',         g: 'print',  w: 2480, h: 3508 },
    { id: 'a3',         g: 'print',  w: 3508, h: 4961 },
    { id: 'a6_ls',      g: 'print',  w: 1748, h: 1240 },
    { id: 'a5_ls',      g: 'print',  w: 2480, h: 1748 },
    { id: 'a4_ls',      g: 'print',  w: 3508, h: 2480 },
    { id: 'a3_ls',      g: 'print',  w: 4961, h: 3508 },
    { id: 'letter',     g: 'print',  w: 2550, h: 3300 },
    { id: 'biz',        g: 'print',  w: 1050, h: 600 },
    { id: 'sq',         g: 'other',  w: 1600, h: 1600 },
    { id: 'banner',     g: 'other',  w: 1600, h: 400 }
];
function findFormat(id) {
    for (var i = 0; i < FORMATS.length; i++) if (FORMATS[i].id === id) return FORMATS[i];
    return null;
}
function formatName(f) {
    var m = /^(\d+)p(_vert)?$/.exec(f.id);
    if (m) return (m[2] ? '9:16' : '16:9') + ' · ' + m[1] + 'p' + ({ 1440: ' (2K)', 2160: ' (4K)' }[m[1]] || '');
    var a = /^a(\d)(_ls)?$/.exec(f.id);
    if (a) return 'A' + a[1] + ' ' + t(a[2] ? 'landscape' : 'portrait');
    return { sq: t('fmt_square'), banner: t('fmt_banner'), biz: t('fmt_biz'), letter: 'US Letter' }[f.id] || f.id;
}

// Bundled photos (the clock's backgrounds). The preview uses the web size;
// an export with a side over 2560 px uses the full-size file.
var PHOTOS = [1, 2, 3, 4, 5, 6, 7].map(function (n) {
    return {
        id: 'p' + n,
        web: '/revery_notebook/image_assets/bg_' + n + '_web.jpg',
        max: '/revery_notebook/image_assets/bg_' + n + '_max.jpg',
        thumb: '/clock/img/thumb_bg_' + n + '.jpg'
    };
});

// Outline logos for the graphic. scale = size relative to the ring's radius.
var LOGOS = [
    { src: '/svg/haraldreverylogo.svg', scale: 1.8, name: 'logo_hr' },
    { src: '/svg/haraldreverytextlogo.svg', scale: 4.4, name: 'logo_text' },
    { src: '/svg/python_generated_svg/mountain_topology1.svg', scale: 8.2, name: 'logo_mtn1' },
    { src: '/svg/python_generated_svg/mountain_topology3.svg', scale: 8.2, name: 'logo_mtn3' },
    { src: '/svg/mountain_dotted_transparent.svg', scale: 8.2, name: 'logo_dots' }
];

var THEMES = {
    dark:  { bg: '#0d0d0d', paper: '#000000', fg: 'rgba(255,255,255,0.86)', fgBody: 'rgba(255,255,255,0.72)', title: '#ffffff', date: '#a1a1a1' },
    light: { bg: '#f4f3ee', paper: '#ffffff', fg: 'rgba(0,0,0,0.86)',       fgBody: 'rgba(0,0,0,0.72)',       title: '#000000', date: '#666666' }
};
var STYLE = {
    tracking: 0.10,      // letter spacing, as a fraction of the date's size
    lineHeight: 1.01,    // description line height
    bannerBody: 0.12,
    separatorOp: 0.3,    // the line under the title
    listGap: -0.7
};
var TEXT_ELS = ['date', 'title', 'author', 'desc'];
var MOVABLE = ['date', 'title', 'author', 'desc', 'graphic'];
var COLOR_KEYS = ['title', 'date', 'author', 'graphic', 'body', 'accent'];

// ==========================================================================
// The document
// ==========================================================================
function blankColors() { return { title: '', date: '', author: '', graphic: '', body: '', accent: '' }; }
function lookDefaults() {
    return {
        theme: 'dark', align: 'left', fontScale: 1.5, padScale: 1, padRatio: 0,
        colors: { dark: blankColors(), light: blankColors() },
        els: {
            date:    { hidden: false, dx: 0, dy: 0, size: 1, lang: uiLang },
            title:   { hidden: false, dx: 0, dy: 0, size: 1, rule: true },
            author:  { hidden: false, dx: 0, dy: 0, size: 1, pos: 'opposite' },
            desc:    { hidden: false, dx: 0, dy: 0, size: 1, columns: 1, justify: true },
            graphic: { hidden: false, dx: 0, dy: 0, size: 1, opacity: 1, kind: 'ring', logo: 0 }
        },
        bg: { hidden: false, src: '', opacity: 0.3, zoom: 1, px: 0, py: 0 },
        layers: []
    };
}
function docDefaults() {
    var d = { v: 1, template: 'classic', title: '', author: '', desc: '', date: isoDate(new Date()), format: '1080p', fileType: 'jpg' };
    var look = lookDefaults();
    Object.keys(look).forEach(function (k) { d[k] = look[k]; });
    return d;
}
var LOOK_KEYS = Object.keys(lookDefaults());
var LAYER_DEFAULTS = { id: '', img: '', hidden: false, x: 0.5, y: 0.5, size: 0.4, opacity: 1, front: false };

// Take `val` where it has the same shape as `def`, else the default.
function merge(def, val) {
    if (Array.isArray(def)) return Array.isArray(val) ? val : def;
    if (def && typeof def === 'object') {
        var src = val && typeof val === 'object' && !Array.isArray(val) ? val : {}, out = {};
        Object.keys(def).forEach(function (k) { out[k] = merge(def[k], src[k]); });
        return out;
    }
    if (typeof def === 'number') return typeof val === 'number' && isFinite(val) ? val : def;
    return typeof val === typeof def ? val : def;
}
// Copy a partial look (a template) over a full one.
function assignLook(target, src) {
    Object.keys(src || {}).forEach(function (k) {
        var v = src[k];
        if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') assignLook(target[k], v);
        else target[k] = v;
    });
    return target;
}
function oneOf(v, list, d) { return list.indexOf(v) >= 0 ? v : d; }
function isHex(s) { return typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s); }
function newId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function normalize(raw) {
    var d = merge(docDefaults(), raw), E = d.els;
    d.v = 1;
    d.theme = oneOf(d.theme, ['dark', 'light'], 'dark');
    d.align = oneOf(d.align, ['left', 'center', 'right'], 'left');
    if (!findFormat(d.format)) d.format = '1080p';
    d.fileType = oneOf(d.fileType, ['jpg', 'png', 'png_transp'], 'jpg');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) d.date = isoDate(new Date());
    d.fontScale = clamp(d.fontScale, 0.5, 8);
    d.padScale = clamp(d.padScale, 0, 5);
    d.padRatio = clamp(d.padRatio, -0.9, 0.9);
    MOVABLE.forEach(function (k) {
        var e = E[k];
        e.dx = clamp(e.dx, -2, 2);
        e.dy = clamp(e.dy, -2, 2);
        e.size = clamp(e.size, 0.2, 5);
    });
    E.date.lang = oneOf(E.date.lang, ['en', 'sv'], 'en');
    E.author.pos = oneOf(E.author.pos, ['opposite', 'diagonal'], 'opposite');
    E.desc.columns = clamp(Math.round(E.desc.columns), 1, 3);
    E.graphic.kind = oneOf(E.graphic.kind, ['ring', 'logo'], 'ring');
    E.graphic.logo = clamp(Math.round(E.graphic.logo), 0, LOGOS.length - 1);
    E.graphic.opacity = clamp(E.graphic.opacity, 0, 1);
    ['dark', 'light'].forEach(function (th) {
        COLOR_KEYS.forEach(function (k) { if (!isHex(d.colors[th][k])) d.colors[th][k] = ''; });
    });
    d.bg.opacity = clamp(d.bg.opacity, 0, 1);
    d.bg.zoom = clamp(d.bg.zoom, 1, 4);
    d.bg.px = clamp(d.bg.px, -1, 1);
    d.bg.py = clamp(d.bg.py, -1, 1);
    var seen = {};
    d.layers = d.layers.filter(function (l) { return l && typeof l.img === 'string' && l.img; }).slice(0, 24).map(function (l) {
        var n = merge(LAYER_DEFAULTS, l);
        if (!n.id || seen[n.id]) n.id = newId('l');
        seen[n.id] = true;
        n.x = clamp(n.x, -1, 2);
        n.y = clamp(n.y, -1, 2);
        n.size = clamp(n.size, 0.02, 3);
        n.opacity = clamp(n.opacity, 0, 1);
        return n;
    });
    return d;
}

// The colours actually used. Empty = follow: author and accent follow the
// date colour, the graphic follows the title colour, body text the theme.
function colorsOf(d) {
    var c = d.colors[d.theme], th = THEMES[d.theme];
    var title = c.title || th.title, date = c.date || th.date;
    return { title: title, date: date, author: c.author || date, graphic: c.graphic || title, accent: c.accent || date, body: c.body || '' };
}
function withAlpha(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

// Built-in templates are the looks the old event card could make.
var BUILTIN = [
    { id: 'classic', name: 'tpl_classic', look: {} },
    { id: 'centered', name: 'tpl_centered', look: { align: 'center', els: { graphic: { hidden: true } } } },
    { id: 'right', name: 'tpl_right', look: { align: 'right', els: { author: { pos: 'diagonal' } } } },
    { id: 'logo', name: 'tpl_logo', look: { els: { graphic: { kind: 'logo', logo: 0 } } } },
    { id: 'paper', name: 'tpl_paper', look: { theme: 'light', bg: { src: 'p3', opacity: 0.05 } } },
    { id: 'columns', name: 'tpl_columns', look: { fontScale: 1.2, els: { desc: { columns: 2 } } } }
];
function findTemplate(id) {
    var list = BUILTIN.concat(templates);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
}
function readTemplates() {
    var list = readJSON(KEY_TPL);
    return Array.isArray(list) ? list.filter(function (x) { return x && typeof x.id === 'string' && typeof x.name === 'string' && x.look; }).map(function (x) { x.user = true; return x; }) : [];
}

// ==========================================================================
// Images: loading and caching
// ==========================================================================
var assets = {};              // key -> { img, ok, failed, ar, promise }
function loadImage(key, src, ar) {
    if (assets[key]) return assets[key];
    var a = assets[key] = { img: new Image(), ok: false, failed: false, ar: ar || 0 };
    a.promise = new Promise(function (resolve) {
        a.img.onload = function () {
            a.ok = true;
            if (!a.ar) a.ar = (a.img.naturalWidth / a.img.naturalHeight) || 1;
            resolve(a);
            schedule();
        };
        a.img.onerror = function () { a.failed = true; resolve(null); };
    });
    a.img.src = src;
    return a;
}
function usable(a) { return a && a.ok ? a : null; }

function photoAsset(id, big) {
    var p = PHOTOS[parseInt(id.slice(1), 10) - 1];
    if (!p) return null;
    return loadImage(id + (big ? ':max' : ':web'), big ? p.max : p.web);
}

// User images live in IndexedDB; `lib` holds the records read so far.
var lib = {};                 // id -> { id, src, thumb, w, h }
var imageIds = [];            // ids of all added images, newest last
var removedIds = {};
var pendingRec = {};
function userAsset(id) {
    var key = 'img:' + id;
    if (assets[key]) return assets[key];
    var rec = lib[id];
    if (rec) return loadImage(key, rec.src, rec.w / rec.h);
    if (!pendingRec[id]) {
        pendingRec[id] = idb('readonly', function (st) { return st.get(id); }).then(function (r) {
            if (r) { lib[id] = r; schedule(); }
            return r;
        }, function () { return null; });
    }
    return { ok: false, promise: pendingRec[id].then(function (r) { return r ? userAsset(id).promise : null; }) };
}
function bgAsset(src, big) {
    if (!src) return null;
    return src.charAt(0) === 'p' ? photoAsset(src, big) : userAsset(src);
}

// The logos are outlined in the chosen colour by adding a stylesheet to the
// SVG. The line width is set in the SVG's own units so that it is 3 px in the
// exported file and scales with the preview (a fixed 3 px would look heavier
// in the small preview than in the file).
var svgSrc = {};              // logo index -> { p, raw, vb }
var lastLogo = {};            // logo index -> last usable asset (no flicker while it changes)
var logoKeys = [];
function logoSource(idx) {
    var s = svgSrc[idx];
    if (!s) {
        s = svgSrc[idx] = {};
        s.p = fetch(LOGOS[idx].src).then(function (r) {
            if (!r.ok) throw new Error(r.status);
            return r.text();
        }).then(function (txt) {
            var m = /<svg\b[^>]*\bviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(txt);
            s.vb = m ? [parseFloat(m[1]), parseFloat(m[2])] : [1000, 1000];
            s.raw = txt;
            schedule();
        }).catch(function () { s.failed = true; });
    }
    return s;
}
function logoAsset(idx, color, drawnW) {
    var s = logoSource(idx);
    if (!s.raw) return { ok: false, promise: s.p.then(function () { return s.raw ? logoAsset(idx, color, drawnW).promise : null; }) };
    var sw = +(3 * s.vb[0] / drawnW).toPrecision(3);
    var key = 'logo:' + idx + ':' + color + ':' + sw;
    if (!assets[key]) {
        var svg = s.raw.replace(/<svg\b[^>]*>/i, function (tag) {
            // A root without width/height has no intrinsic size in some
            // browsers, and then drawImage draws nothing.
            if (!/\swidth\s*=/.test(tag)) tag = tag.replace(/<svg\b/i, '<svg width="' + s.vb[0] + '" height="' + s.vb[1] + '"');
            return tag + '<style>path, circle, rect, polygon, polyline { fill: none !important; stroke: ' + color +
                ' !important; stroke-width: ' + sw + 'px !important; }</style>';
        });
        // data: not blob: — the live CSP allows data: images only.
        var a = loadImage(key, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), s.vb[0] / s.vb[1]);
        a.promise.then(function (r) { if (r) lastLogo[idx] = r; });
        logoKeys.push(key);
        while (logoKeys.length > 6) {
            var old = logoKeys.shift();
            if (assets[old] !== lastLogo[idx]) delete assets[old];
        }
    }
    return assets[key];
}

// Where the ring / logo goes: the old card's automatic placement.
function graphicGeom(d, f) {
    var w = f.w, h = f.h, small = Math.min(w, h);
    var isBanner = w / h > 2.6, isPortrait = h / w > 1.2;
    var R = isBanner ? h * 0.72 : isPortrait ? small * 0.54 : small * 0.56;
    var cx, cy;
    if (isBanner)        { cx = w - R * 0.12; cy = h * 0.5; }
    else if (isPortrait) { cx = w * 0.5;      cy = h - R * 0.06; }
    else                 { cx = w - R * 0.15; cy = h - R * 0.08; }
    var G = d.els.graphic, r = R * G.size;
    return { cx: cx + G.dx * w, cy: cy + G.dy * h, r: r, logoSize: r * LOGOS[G.logo].scale };
}
function logoDrawnW(size, ar) { return ar >= 1 ? size : size * ar; }

// Everything the export needs, fully loaded.
function ensureAssets(d, f) {
    var list = [], big = Math.max(f.w, f.h) > 2560;
    if (d.bg.src && !d.bg.hidden && d.fileType !== 'png_transp') list.push(bgAsset(d.bg.src, big));
    var G = d.els.graphic;
    if (!G.hidden && G.kind === 'logo') {
        var geo = graphicGeom(d, f), color = colorsOf(d).graphic;
        list.push({ promise: logoSource(G.logo).p.then(function () {
            var s = svgSrc[G.logo];
            return s.raw ? logoAsset(G.logo, color, logoDrawnW(geo.logoSize, s.vb[0] / s.vb[1])).promise : null;
        }) });
    }
    d.layers.forEach(function (l) { if (!l.hidden) list.push(userAsset(l.img)); });
    return Promise.all(list.map(function (a) { return a && a.promise ? a.promise : a; }));
}

// ==========================================================================
// Rendering (card pixels; k = device pixels per card pixel)
// ==========================================================================
function setTracking(ctx, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; }
function lineExtent(ctx, str, x, align) {
    var tw = ctx.measureText(str).width;
    var x0 = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
    return [x0, x0 + tw];
}

function render(ctx, d, f, k, forExport) {
    var w = f.w, h = f.h, E = d.els, th = THEMES[d.theme], col = colorsOf(d), align = d.align;
    var transparent = d.fileType === 'png_transp';
    var out = { boxes: {}, w: w, h: h, overflow: false };
    var B = out.boxes;

    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    /* Background: a transparent PNG is empty; its preview shows plain paper. */
    if (forExport && transparent) ctx.clearRect(0, 0, w, h);
    else {
        ctx.fillStyle = transparent ? th.paper : th.bg;
        ctx.fillRect(0, 0, w, h);
    }

    var isBanner = w / h > 2.6, isPortrait = h / w > 1.2, small = Math.min(w, h);

    /* Background photo */
    if (d.bg.src) {
        B.bg = { x: 0, y: 0, w: w, h: h };
        if (!transparent && !d.bg.hidden) {
            var bim = usable(bgAsset(d.bg.src, forExport && Math.max(w, h) > 2560));
            if (bim) drawCover(ctx, bim.img, w, h, d.bg);
        }
    }

    /* Graphic */
    var G = E.graphic;
    if (!G.hidden) {
        var geo = graphicGeom(d, f);
        if (G.kind === 'ring') {
            drawRing(ctx, geo.cx, geo.cy, geo.r, col.graphic, w, h, G.opacity);
            B.graphic = { x: geo.cx - geo.r, y: geo.cy - geo.r, w: geo.r * 2, h: geo.r * 2, ring: geo };
        } else {
            var src = svgSrc[G.logo] || logoSource(G.logo);
            var ar = src.vb ? src.vb[0] / src.vb[1] : 1;
            var lw = logoDrawnW(geo.logoSize, ar), lh = lw / ar;
            var lg = src.raw ? usable(logoAsset(G.logo, col.graphic, lw)) || lastLogo[G.logo] : null;
            if (lg) {
                ctx.save();
                ctx.globalAlpha = 0.18 * G.opacity;
                ctx.drawImage(lg.img, geo.cx - lw / 2, geo.cy - lh / 2, lw, lh);
                ctx.restore();
            }
            B.graphic = { x: geo.cx - lw / 2, y: geo.cy - lh / 2, w: lw, h: lh };
        }
    }

    /* Image layers under the text */
    drawLayers(ctx, d, f, false, B);

    /* Font sizes (the old card's), then each element's own size */
    var titleSz, dateSz, bodySz;
    if (isBanner) {
        titleSz = Math.min(h * 0.32, w * 0.055, 130);
        dateSz  = Math.min(h * 0.10, 44);
        bodySz  = Math.min(h * STYLE.bannerBody, 50);
    } else {
        titleSz = Math.min(small * 0.10, 110);
        dateSz  = Math.min(small * 0.036, 36);
        bodySz  = Math.min(small * 0.043, 44);
    }
    titleSz *= d.fontScale;
    dateSz  *= d.fontScale;
    bodySz  *= d.fontScale;
    var track = dateSz * STYLE.tracking;
    var dSz = dateSz * E.date.size, aSz = dateSz * E.author.size, tSz = titleSz * E.title.size, bSz = bodySz * E.desc.size;
    var cols = E.desc.columns;

    var padBase = (isBanner ? h * 0.17 : small * 0.074) * d.padScale;
    var padX = padBase * (1 + d.padRatio);
    var padY = padBase * (1 - d.padRatio);
    out.pad = { x: padX, y: padY };

    var contentW;
    if (isBanner)        contentW = w * 0.50;
    else if (isPortrait) contentW = w - padX * 2;
    else                 contentW = cols > 1 ? w - padX * 2 : w * 0.60;

    var y = isBanner ? (h - (dSz * 1.5 + tSz * 1.4)) / 2 : padY;
    var titleX = align === 'center' ? w / 2 : align === 'right' ? w - padX : padX;
    var initialY = y, ox, oy, ext;
    var dateShown = !E.date.hidden;

    /* Date */
    if (dateShown) {
        var dateStr = cardDate(parseIso(d.date), E.date.lang).toUpperCase();
        ox = E.date.dx * w; oy = E.date.dy * h;
        ctx.save();
        ctx.translate(ox, oy);
        ctx.font = '400 ' + dSz + 'px HaraldMono, monospace';
        ctx.fillStyle = col.date;
        ctx.textAlign = align;
        setTracking(ctx, dSz * STYLE.tracking);
        ctx.fillText(dateStr, titleX, initialY + dSz * 0.9);
        ext = lineExtent(ctx, dateStr, titleX, align);
        ctx.restore();
        B.date = { x: ext[0] + ox, y: initialY + dSz * 0.28 + oy, w: ext[1] - ext[0], h: dSz * 0.8 };
        y += dSz * 1.08;
    }

    /* Author / contact: opposite the header, or in the diagonal corner */
    var author = d.author.trim();
    if (author && !E.author.hidden) {
        var authorX, authorAlign, authorY = initialY + aSz * 0.9;
        if (align === 'left') {
            authorX = w - padX; authorAlign = 'right';
            if (E.author.pos === 'diagonal') authorY = h - padY;
        } else if (align === 'right') {
            authorX = padX; authorAlign = 'left';
            if (E.author.pos === 'diagonal') authorY = h - padY;
        } else {
            authorX = w / 2; authorAlign = 'center'; authorY = h - padY;
        }
        ox = E.author.dx * w; oy = E.author.dy * h;
        ctx.save();
        ctx.translate(ox, oy);
        ctx.font = '400 ' + aSz + 'px HaraldMono, monospace';
        ctx.fillStyle = col.author;
        ctx.textAlign = authorAlign;
        setTracking(ctx, aSz * 0.08);
        ctx.fillText(author.toUpperCase(), authorX, authorY);
        ext = lineExtent(ctx, author.toUpperCase(), authorX, authorAlign);
        ctx.restore();
        B.author = { x: ext[0] + ox, y: authorY - aSz * 0.62 + oy, w: ext[1] - ext[0], h: aSz * 0.8 };
    }

    /* Title and the line under it */
    if (!E.title.hidden) {
        if (!isBanner) y += dateShown ? tSz * 0.17 : -tSz * 0.36;
        var titleText = (d.title.trim() ? d.title : t('card_title_placeholder')).toUpperCase();
        ox = E.title.dx * w; oy = E.title.dy * h;
        ctx.save();
        ctx.translate(ox, oy);
        ctx.font = '400 ' + tSz + 'px HaraldMono, monospace';
        ctx.fillStyle = col.title;
        ctx.textAlign = align;
        setTracking(ctx, track * E.title.size);
        var firstBase = y + tSz;
        ext = [Infinity, -Infinity];
        y = drawWrapped(ctx, titleText, titleX, firstBase, contentW, tSz * 1.14, align, ext);
        y -= tSz * 0.7;
        var ruleY = y;
        if (E.title.rule) {
            var sepLen = Math.min(contentW * 0.16, 70 * (small / 900));
            ctx.beginPath();
            if (align === 'center')     { ctx.moveTo(w / 2 - sepLen / 2, y); ctx.lineTo(w / 2 + sepLen / 2, y); }
            else if (align === 'right') { ctx.moveTo(w - padX - sepLen, y); ctx.lineTo(w - padX, y); }
            else                        { ctx.moveTo(padX, y); ctx.lineTo(padX + sepLen, y); }
            ctx.strokeStyle = col.title;
            ctx.globalAlpha = STYLE.separatorOp;
            ctx.lineWidth = Math.max(0.6, 1.2 * (small / 900));
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
        ctx.restore();
        y += tSz * 0.4;
        B.title = { x: ext[0] + ox, y: firstBase - tSz * 0.62 + oy, w: ext[1] - ext[0], h: ruleY - firstBase + tSz * 0.62 + tSz * 0.12 };
        if (ruleY > h) out.overflow = true;
    }

    /* Description (markdown). A banner has no room for it. */
    if (d.desc.trim() && !isBanner && !E.desc.hidden) {
        var mdX = align === 'center' ? (w - contentW) / 2 : align === 'right' ? w - padX - contentW : padX;
        var st = {
            align: align, justify: E.desc.justify, isDark: d.theme === 'dark', accent: col.accent,
            fg: col.body ? col.body : th.fg, fgBody: col.body ? withAlpha(col.body, 0.84) : th.fgBody
        };
        ox = E.desc.dx * w; oy = E.desc.dy * h;
        ctx.save();
        ctx.translate(ox, oy);
        setTracking(ctx, track * E.desc.size);
        var startY = y, endY;
        if (cols > 1) {
            var colGap = padX * 0.5;
            var colW = (contentW - (cols - 1) * colGap) / cols;
            var totalY = drawMarkdown(ctx, d.desc, mdX, y, colW, bSz, st, null, true);
            var limitY = y + ((totalY - y) / cols) * 1.15;
            if (limitY > h - padY) limitY = h - padY;
            var colState = { startX: mdX, startY: y, limitY: limitY, width: colW, gap: colGap, current: 0, max: cols };
            endY = Math.max(drawMarkdown(ctx, d.desc, mdX, y, colW, bSz, st, colState, false), limitY);
        } else {
            endY = drawMarkdown(ctx, d.desc, mdX, y, contentW, bSz, st, null, false);
        }
        ctx.restore();
        B.desc = { x: mdX + ox, y: startY + oy, w: contentW, h: Math.max(endY - startY, bSz) };
        if (endY > h) out.overflow = true;
    }

    /* Image layers above the text */
    drawLayers(ctx, d, f, true, B);
    return out;
}

function drawCover(ctx, img, w, h, bg) {
    var iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih) return;
    var sc = Math.max(w / iw, h / ih) * bg.zoom;
    var sw = iw * sc, sh = ih * sc;
    ctx.save();
    ctx.globalAlpha = bg.opacity;
    ctx.drawImage(img, (w - sw) / 2 + bg.px * (sw - w) / 2, (h - sh) / 2 + bg.py * (sh - h) / 2, sw, sh);
    ctx.restore();
}
function coverOverflow(img, w, h, zoom) {
    var sc = Math.max(w / img.naturalWidth, h / img.naturalHeight) * zoom;
    return { x: img.naturalWidth * sc - w, y: img.naturalHeight * sc - h };
}

// A layer's size is its longer side as a fraction of √(w·h), so it looks
// about the same size in a wide and a tall format.
function layerBox(l, a, w, h) {
    var ar = a && a.ar ? a.ar : (lib[l.img] ? lib[l.img].w / lib[l.img].h : 1);
    var long = l.size * Math.sqrt(w * h);
    var bw = ar >= 1 ? long : long * ar, bh = ar >= 1 ? long / ar : long;
    return { x: l.x * w - bw / 2, y: l.y * h - bh / 2, w: bw, h: bh };
}
function drawLayers(ctx, d, f, front, B) {
    d.layers.forEach(function (l) {
        if (l.hidden || !!l.front !== front) return;
        var a = usable(userAsset(l.img)), box = layerBox(l, a, f.w, f.h);
        B['layer:' + l.id] = box;
        if (!a) return;
        ctx.save();
        ctx.globalAlpha = l.opacity;
        ctx.drawImage(a.img, box.x, box.y, box.w, box.h);
        ctx.restore();
    });
}

function drawRing(ctx, cx, cy, R, color, clipW, clipH, opacity) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, clipW, clipH);
    ctx.clip();
    var ts = R / 270;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.09 * opacity;
    ctx.lineWidth = 1.5 * ts;
    ctx.stroke();
    for (var i = 0; i < 60; i++) {
        var major = (i % 5 === 0);
        var angle = (i / 60) * Math.PI * 2 - Math.PI / 2;
        var outer = R - 2;
        var inner = outer - (major ? R * 0.058 : R * 0.028);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
        ctx.strokeStyle = color;
        ctx.globalAlpha = (major ? 0.28 : 0.11) * opacity;
        ctx.lineWidth = (major ? 1.8 : 0.9) * ts;
        ctx.stroke();
    }
    ctx.restore();
}

function drawWrapped(ctx, text, x, y, maxW, lh, align, ext) {
    var words = text.split(' '), line = '';
    function out(l) {
        ctx.fillText(l, x, y);
        var e = lineExtent(ctx, l, x, align);
        if (e[0] < ext[0]) ext[0] = e[0];
        if (e[1] > ext[1]) ext[1] = e[1];
    }
    for (var i = 0; i < words.length; i++) {
        var test = line ? line + ' ' + words[i] : words[i];
        if (ctx.measureText(test).width > maxW && line) {
            out(line);
            y += lh;
            line = words[i];
        } else {
            line = test;
        }
    }
    if (line) { out(line); y += lh; }
    return y;
}

/* ─── Markdown (same parser and layout as the old card) ─── */
function parseBlocks(md) {
    var lines = md.split('\n'), blocks = [], para = [], olN = [0, 0, 0, 0, 0, 0], match, indent;
    function flushPara() {
        if (para.length) { blocks.push({ type: 'p', text: para.join(' ') }); para = []; }
    }
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line.trim()) { flushPara(); olN = [0, 0, 0, 0, 0, 0]; continue; }
        if (/^---$/.test(line.trim())) { flushPara(); blocks.push({ type: 'hr' }); olN = [0, 0, 0, 0, 0, 0]; }
        else if (/^### /.test(line)) { flushPara(); blocks.push({ type: 'h3', text: line.slice(4) }); olN = [0, 0, 0, 0, 0, 0]; }
        else if (/^## /.test(line))  { flushPara(); blocks.push({ type: 'h2', text: line.slice(3) }); olN = [0, 0, 0, 0, 0, 0]; }
        else if (/^# /.test(line))   { flushPara(); blocks.push({ type: 'h1', text: line.slice(2) }); olN = [0, 0, 0, 0, 0, 0]; }
        else if (/^> /.test(line))   { flushPara(); blocks.push({ type: 'blockquote', text: line.slice(2) }); olN = [0, 0, 0, 0, 0, 0]; }
        else if ((match = /^\[\^([^\]]+)\]:\s*(.*)/.exec(line))) {
            flushPara();
            olN = [0, 0, 0, 0, 0, 0];
            blocks.push({ type: 'footnote', id: match[1], text: match[2] });
        }
        else if (/^\|(.+)\|$/.test(line.trim())) {
            flushPara();
            olN = [0, 0, 0, 0, 0, 0];
            var cells = line.trim().split('|').slice(1, -1).map(function (s) { return s.trim(); });
            var isSep = cells.length > 0 && cells.every(function (c) { return /^[-:]+$/.test(c); });
            if (!isSep) {
                if (blocks.length > 0 && blocks[blocks.length - 1].type === 'table') blocks[blocks.length - 1].rows.push(cells);
                else blocks.push({ type: 'table', rows: [cells] });
            }
        }
        else if ((match = /^(\s*)[-*] (.*)/.exec(line))) {
            flushPara();
            indent = Math.floor(match[1].length / 2);
            var taskMatch = /^\[([ xX])\] (.*)/.exec(match[2]);
            if (taskMatch) blocks.push({ type: 'task', text: taskMatch[2], indent: indent, checked: taskMatch[1] !== ' ' });
            else blocks.push({ type: 'li', text: match[2], indent: indent });
        }
        else if ((match = /^(\s*)\d+\. (.*)/.exec(line))) {
            flushPara();
            indent = Math.min(Math.floor(match[1].length / 2), 5);
            olN[indent]++;
            for (var j = indent + 1; j < olN.length; j++) olN[j] = 0;
            blocks.push({ type: 'oli', text: match[2], indent: indent, n: olN[indent] });
        }
        else { para.push(line); }
    }
    flushPara();
    return blocks;
}

function tokenize(text) {
    var tokens = [];
    var re = /!\[([^\]]*)\]\([^)]+\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_|```([^`]+)```|`([^`\n]+)`|~~([^~\n]+)~~|==([^=\n]+)==|\[\^([^\]]+)\]|\[([^\]]+)\]\([^)]+\)/g;
    var m, lastIdx = 0;
    while ((m = re.exec(text)) !== null) {
        if (m.index > lastIdx) tokens.push({ t: 'text', s: text.slice(lastIdx, m.index) });
        if      (m[1] !== undefined)  tokens.push({ t: 'text', s: '[Image: ' + (m[1] || 'link') + ']' });
        else if (m[2] !== undefined)  tokens.push({ t: 'bold', s: m[2] });
        else if (m[3] !== undefined)  tokens.push({ t: 'bold', s: m[3] });
        else if (m[4] !== undefined)  tokens.push({ t: 'italic', s: m[4] });
        else if (m[5] !== undefined)  tokens.push({ t: 'italic', s: m[5] });
        else if (m[6] !== undefined)  tokens.push({ t: 'code', s: m[6] });
        else if (m[7] !== undefined)  tokens.push({ t: 'code', s: m[7] });
        else if (m[8] !== undefined)  tokens.push({ t: 'strikethrough', s: m[8] });
        else if (m[9] !== undefined)  tokens.push({ t: 'highlight', s: m[9] });
        else if (m[10] !== undefined) tokens.push({ t: 'footnoteref', s: '[' + m[10] + ']' });
        else if (m[11] !== undefined) tokens.push({ t: 'link', s: m[11] });
        lastIdx = re.lastIndex;
    }
    if (lastIdx < text.length) tokens.push({ t: 'text', s: text.slice(lastIdx) });
    return tokens.filter(function (tk) { return tk.s; });
}

function getFont(type, size, forceMono) {
    var baseFont = forceMono ? 'HaraldMono, monospace' : 'HaraldText, sans-serif';
    if (type === 'code') return '400 ' + (size * 0.91) + 'px HaraldMono, monospace';
    if (type === 'italic') return 'italic 400 ' + size + 'px ' + baseFont;
    if (type === 'footnoteref') return '400 ' + (size * 0.7) + 'px ' + baseFont;
    return '400 ' + size + 'px ' + baseFont;
}

function drawTokensWrapped(ctx, tokens, x0, y, maxW, lh, size, bodyColor, st, justify, forceMono, colState, measureOnly, alignOverride) {
    var align = alignOverride || st.align, codeCol = st.accent, isDark = st.isDark;
    var units = [];
    tokens.forEach(function (tok) {
        tok.s.split(/(\s+)/).forEach(function (p) { if (p) units.push({ text: p, type: tok.t }); });
    });
    var lineUnits = [], lineW = 0, prevFont = ctx.font;

    function mw(u) {
        ctx.font = getFont(u.type, size, forceMono);
        var uw = ctx.measureText(u.text).width;
        ctx.font = prevFont;
        return uw;
    }
    function renderBg(type, startX, width) {
        ctx.save();
        if (type === 'code') {
            ctx.fillStyle = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
        } else {
            ctx.fillStyle = codeCol;
            ctx.globalAlpha = isDark ? 0.22 : 0.28;
        }
        var p = size * 0.18, bh = size * 1.2, drawY = y - size * 0.88;
        if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(startX - p, drawY, width + p * 2, bh, size * 0.22);
            ctx.fill();
        } else {
            ctx.fillRect(startX - p, drawY, width + p * 2, bh);
        }
        ctx.restore();
    }
    function flush(isLast) {
        if (!lineUnits.length) return;
        if (colState && colState.current < colState.max - 1 && y + lh > colState.limitY) {
            colState.current++;
            y = colState.startY;
        }
        var currentX0 = colState ? colState.startX + colState.current * (colState.width + colState.gap) + (x0 - colState.startX) : x0;
        var lx = currentX0;
        ctx.textAlign = 'left';
        var extraSpace = 0;
        if (justify && !isLast) {
            var spaceCount = lineUnits.filter(function (u) { return /^\s+$/.test(u.text); }).length;
            if (spaceCount > 0) extraSpace = Math.max(0, (maxW - lineW)) / spaceCount;
        } else if (align === 'center') {
            lx = currentX0 + (maxW - lineW) / 2;
        } else if (align === 'right') {
            lx = currentX0 + (maxW - lineW);
        }

        if (!measureOnly) {
            // Pass 1: one continuous pill behind runs of code / highlight
            var p1 = lx, bgType = null, bgStartX = p1, bgWidth = 0, i, u, uw, spc;
            for (i = 0; i < lineUnits.length; i++) {
                u = lineUnits[i];
                ctx.font = getFont(u.type, size, forceMono);
                uw = ctx.measureText(u.text).width;
                spc = /^\s+$/.test(u.text) ? extraSpace : 0;
                if (u.type === 'code' || u.type === 'highlight') {
                    if (bgType === u.type) {
                        bgWidth += uw + spc;
                    } else {
                        if (bgType) renderBg(bgType, bgStartX, bgWidth);
                        bgType = u.type;
                        bgStartX = p1;
                        bgWidth = uw + spc;
                    }
                } else if (bgType) {
                    renderBg(bgType, bgStartX, bgWidth);
                    bgType = null;
                }
                p1 += uw + spc;
            }
            if (bgType) renderBg(bgType, bgStartX, bgWidth);

            // Pass 2: text and its lines
            lineUnits.forEach(function (un) {
                ctx.font = getFont(un.type, size, forceMono);
                var unw = ctx.measureText(un.text).width;
                if (un.type === 'code') {
                    ctx.fillStyle = codeCol;
                } else if (un.type === 'link') {
                    ctx.fillStyle = codeCol;
                    ctx.beginPath();
                    ctx.moveTo(lx, y + size * 0.12);
                    ctx.lineTo(lx + unw, y + size * 0.12);
                    ctx.strokeStyle = codeCol;
                    ctx.lineWidth = Math.max(0.5, size * 0.05);
                    ctx.stroke();
                } else {
                    ctx.fillStyle = bodyColor;
                }
                ctx.fillText(un.text, lx, un.type === 'footnoteref' ? y - size * 0.35 : y);
                if (un.type === 'bold') {
                    ctx.beginPath();
                    ctx.moveTo(lx, y + size * 0.11);
                    ctx.lineTo(lx + unw, y + size * 0.11);
                    ctx.strokeStyle = bodyColor;
                    ctx.lineWidth = Math.max(0.5, size * 0.038);
                    ctx.stroke();
                } else if (un.type === 'strikethrough') {
                    ctx.beginPath();
                    ctx.moveTo(lx, y - size * 0.25);
                    ctx.lineTo(lx + unw, y - size * 0.25);
                    ctx.strokeStyle = bodyColor;
                    ctx.lineWidth = Math.max(0.5, size * 0.05);
                    ctx.stroke();
                }
                lx += unw;
                if (/^\s+$/.test(un.text)) lx += extraSpace;
            });
        }
        lineUnits = [];
        lineW = 0;
        y += lh;
    }

    units.forEach(function (unit) {
        var uw = mw(unit);
        if (lineW + uw > maxW && lineUnits.length > 0 && unit.text.trim()) {
            if (/^\s+$/.test(lineUnits[lineUnits.length - 1].text)) lineW -= mw(lineUnits.pop());
            flush(false);
        }
        if (lineUnits.length === 0 && !unit.text.trim()) return;
        lineUnits.push(unit);
        lineW += uw;
    });
    flush(true);
    return y;
}

function drawMarkdown(ctx, md, x, y, maxW, baseSize, st, colState, measureOnly) {
    var isDark = st.isDark, accent = st.accent, fg = st.fg, fgBody = st.fgBody;
    function checkColBreak(currentY, lh) {
        if (colState && colState.current < colState.max - 1 && currentY + lh > colState.limitY) {
            colState.current++;
            return colState.startY;
        }
        return currentY;
    }
    function getColX(baseX) {
        if (!colState) return baseX;
        return colState.startX + colState.current * (colState.width + colState.gap) + (baseX - colState.startX);
    }
    // Lists, tasks and footnotes: marker on the left (or right when the
    // text is right-aligned), text beside it.
    function listGeom(block, gap) {
        var indentPad = (block.indent || 0) * baseSize * 1.5, isRight = st.align === 'right';
        if (isRight) return { isRight: true, textX0: x, textMaxW: maxW - indentPad - baseSize * gap, edge: x + maxW - indentPad };
        return { isRight: false, textX0: x + indentPad + baseSize * gap, textMaxW: maxW - indentPad - baseSize * gap, edge: x + indentPad };
    }
    var listAlign = st.align === 'center' ? 'left' : st.align;

    parseBlocks(md).forEach(function (block) {
        var tokens = tokenize(block.text || ''), g, cx;
        switch (block.type) {
            case 'h1':
            case 'h2':
            case 'h3': {
                var sz = baseSize * (block.type === 'h1' ? 1.75 : block.type === 'h2' ? 1.45 : 1.22);
                y = checkColBreak(y, sz * STYLE.lineHeight);
                y += sz * (block.type === 'h1' ? 0.4 : block.type === 'h2' ? 0.3 : 0.25);
                var headerTokens = tokens.map(function (tk) { return { t: tk.t, s: tk.s.toUpperCase() }; });
                y = drawTokensWrapped(ctx, headerTokens, x, y + sz, maxW, sz * STYLE.lineHeight, sz, fg, st, false, true, colState, measureOnly);
                y -= sz * (block.type === 'h1' ? 0.55 : block.type === 'h2' ? 0.5 : 0.45);
                break;
            }
            case 'hr': {
                y = checkColBreak(y, baseSize * 1.2);
                y += baseSize * 0.6;
                if (!measureOnly) {
                    cx = getColX(x);
                    ctx.beginPath();
                    ctx.moveTo(cx, y);
                    ctx.lineTo(cx + maxW, y);
                    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
                    ctx.lineWidth = Math.max(1, baseSize * 0.05);
                    ctx.stroke();
                }
                y += baseSize * 0.6;
                break;
            }
            case 'blockquote': {
                y = checkColBreak(y, baseSize * STYLE.lineHeight);
                y += baseSize * 0.25;
                var bqStart = y;
                var nextY = drawTokensWrapped(ctx, tokens, x + baseSize * 1.2, y + baseSize, maxW - baseSize * 1.2, baseSize * STYLE.lineHeight, baseSize, fgBody, st, st.justify, false, colState, measureOnly);
                if (!measureOnly) {
                    cx = getColX(x + baseSize * 0.4);
                    ctx.beginPath();
                    ctx.moveTo(cx, bqStart + baseSize * 0.2);
                    ctx.lineTo(cx, nextY - baseSize * 0.2);
                    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
                    ctx.lineWidth = Math.max(1, baseSize * 0.15);
                    ctx.stroke();
                }
                y = nextY + baseSize * 0.2;
                break;
            }
            case 'p': {
                y = checkColBreak(y, baseSize * STYLE.lineHeight);
                y += baseSize * 0.25;
                if (!measureOnly) ctx.font = '400 ' + baseSize + 'px HaraldText, sans-serif';
                y = drawTokensWrapped(ctx, tokens, x, y + baseSize, maxW, baseSize * STYLE.lineHeight, baseSize, fgBody, st, st.justify, false, colState, measureOnly);
                y += baseSize * 0.2;
                break;
            }
            case 'task': {
                y = checkColBreak(y, baseSize * STYLE.lineHeight);
                if (!measureOnly) ctx.font = '400 ' + baseSize + 'px HaraldText, sans-serif';
                y += baseSize * 0.15;
                g = listGeom(block, 1.2);
                if (!measureOnly) {
                    var cxBox = getColX(g.isRight ? g.edge - baseSize * 0.75 : g.edge + baseSize * 0.1);
                    ctx.strokeStyle = accent;
                    ctx.lineWidth = Math.max(1, baseSize * 0.08);
                    ctx.strokeRect(cxBox, y + baseSize * 0.25, baseSize * 0.65, baseSize * 0.65);
                    if (block.checked) {
                        ctx.beginPath();
                        ctx.moveTo(cxBox + baseSize * 0.15, y + baseSize * 0.55);
                        ctx.lineTo(cxBox + baseSize * 0.30, y + baseSize * 0.75);
                        ctx.lineTo(cxBox + baseSize * 0.55, y + baseSize * 0.35);
                        ctx.stroke();
                    }
                }
                y = drawTokensWrapped(ctx, tokens, g.textX0, y + baseSize, g.textMaxW, baseSize * STYLE.lineHeight, baseSize, fgBody, st, false, false, colState, measureOnly, listAlign);
                y += baseSize * STYLE.listGap;
                break;
            }
            case 'li': {
                y = checkColBreak(y, baseSize * STYLE.lineHeight);
                if (!measureOnly) ctx.font = '400 ' + baseSize + 'px HaraldText, sans-serif';
                y += baseSize * 0.15;
                g = listGeom(block, 1.1);
                if (!measureOnly) {
                    var cxBul = getColX(g.isRight ? g.edge - baseSize * 0.42 : g.edge + baseSize * 0.42);
                    ctx.beginPath();
                    ctx.arc(cxBul, y + baseSize * 1.0, baseSize * 0.17, 0, Math.PI * 2);
                    if ((block.indent || 0) % 2 === 1) {
                        ctx.strokeStyle = accent;
                        ctx.lineWidth = Math.max(1, baseSize * 0.06);
                        ctx.stroke();
                    } else {
                        ctx.fillStyle = accent;
                        ctx.fill();
                    }
                }
                y = drawTokensWrapped(ctx, tokens, g.textX0, y + baseSize, g.textMaxW, baseSize * STYLE.lineHeight, baseSize, fgBody, st, false, false, colState, measureOnly, listAlign);
                y += baseSize * STYLE.listGap;
                break;
            }
            case 'oli': {
                y = checkColBreak(y, baseSize * STYLE.lineHeight);
                y += baseSize * 0.15;
                g = listGeom(block, 1.45);
                if (!measureOnly) {
                    ctx.font = '400 ' + baseSize + 'px HaraldMono, monospace';
                    ctx.fillStyle = accent;
                    ctx.textAlign = g.isRight ? 'right' : 'left';
                    ctx.fillText(block.n + '.', getColX(g.edge), y + baseSize);
                    ctx.font = '400 ' + baseSize + 'px HaraldText, sans-serif';
                }
                y = drawTokensWrapped(ctx, tokens, g.textX0, y + baseSize, g.textMaxW, baseSize * STYLE.lineHeight, baseSize, fgBody, st, false, false, colState, measureOnly, listAlign);
                y += baseSize * STYLE.listGap;
                break;
            }
            case 'footnote': {
                y = checkColBreak(y, baseSize * STYLE.lineHeight);
                y += baseSize * 0.15;
                var idPad = baseSize * 1.8, fnRight = st.align === 'right';
                if (!measureOnly) {
                    ctx.font = '400 ' + (baseSize * 0.85) + 'px HaraldMono, monospace';
                    ctx.fillStyle = accent;
                    ctx.textAlign = fnRight ? 'right' : 'left';
                    ctx.fillText('[' + block.id + ']', getColX(fnRight ? x + maxW : x), y + baseSize * 0.95);
                    ctx.font = '400 ' + baseSize + 'px HaraldText, sans-serif';
                }
                y = drawTokensWrapped(ctx, tokens, fnRight ? x : x + idPad, y + baseSize, maxW - idPad, baseSize * 1.05, baseSize * 0.9, fgBody, st, false, false, colState, measureOnly, listAlign);
                y += baseSize * 0.05;
                break;
            }
            case 'table': {
                y = checkColBreak(y, baseSize * 1.2);
                y += baseSize * 0.5;
                var nCols = block.rows[0].length, cellW = maxW / nCols, tableStart = y, tableX;
                if (!measureOnly) {
                    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
                    ctx.lineWidth = Math.max(1, baseSize * 0.05);
                }
                block.rows.forEach(function (row, rIdx) {
                    var rowMaxY = y;
                    row.forEach(function (cell, cIdx) {
                        var cy = drawTokensWrapped(ctx, tokenize(cell), x + cIdx * cellW + baseSize * 0.4, y + baseSize * 1.2, cellW - baseSize * 0.8, baseSize * 1.12, baseSize, rIdx === 0 ? fg : fgBody, st, false, false, colState, measureOnly);
                        if (cy > rowMaxY) rowMaxY = cy;
                    });
                    y = rowMaxY + baseSize * 0.4;
                    if (!measureOnly) {
                        tableX = getColX(x);
                        ctx.beginPath();
                        ctx.moveTo(tableX, y);
                        ctx.lineTo(tableX + maxW, y);
                        ctx.stroke();
                    }
                });
                if (!measureOnly) {
                    tableX = getColX(x);
                    ctx.beginPath(); ctx.moveTo(tableX, tableStart); ctx.lineTo(tableX + maxW, tableStart); ctx.stroke();
                    for (var c = 0; c <= nCols; c++) {
                        ctx.beginPath();
                        ctx.moveTo(tableX + c * cellW, tableStart);
                        ctx.lineTo(tableX + c * cellW, y);
                        ctx.stroke();
                    }
                }
                y += baseSize * 0.5;
                break;
            }
        }
    });
    return y;
}

// ==========================================================================
// IndexedDB for added images (opened only once an image is involved, so a
// plain visit creates no database)
// ==========================================================================
var dbPromise = null;
function db() {
    if (!dbPromise) {
        dbPromise = new Promise(function (resolve, reject) {
            var req = indexedDB.open(IMG_DB, 1);
            req.onupgradeneeded = function () { req.result.createObjectStore('images', { keyPath: 'id' }); };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
        dbPromise.catch(function () { dbPromise = null; });
    }
    return dbPromise;
}
function idb(mode, fn) {
    return db().then(function (d) {
        return new Promise(function (resolve, reject) {
            var tx = d.transaction('images', mode), req = fn(tx.objectStore('images'));
            tx.oncomplete = function () { resolve(req && req.result); };
            tx.onerror = tx.onabort = function () { reject(tx.error); };
        });
    });
}
var libraryLoaded = false;
function loadLibrary() {
    if (libraryLoaded || !imageIds.length) { libraryLoaded = true; return Promise.resolve(); }
    return idb('readonly', function (st) { return st.getAll(); }).then(function (rows) {
        (rows || []).forEach(function (r) { lib[r.id] = r; });
        libraryLoaded = true;
    }, function () { libraryLoaded = true; });
}

// Read a file as a data: URL (the live CSP has no blob: in img-src), shrink
// it to MAX_IMG, and keep PNG only when the image really has transparency.
function importImage(file) {
    return new Promise(function (resolve, reject) {
        if (!file || !/^image\//.test(file.type)) { reject(new Error('type')); return; }
        var reader = new FileReader();
        reader.onload = function () {
            var img = new Image();
            img.onload = function () {
                try { resolve(encodeImage(img)); } catch (e) { reject(e); }
            };
            img.onerror = reject;
            img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    }).then(function (rec) {
        return idb('readwrite', function (st) { return st.put(rec); }).then(function () {
            lib[rec.id] = rec;
            imageIds.push(rec.id);
            libraryLoaded = libraryLoaded || imageIds.length === 1;
            save();
            return rec;
        });
    });
}
function hasAlpha(img) {
    var c = document.createElement('canvas');
    c.width = c.height = 48;
    var x = c.getContext('2d');
    x.drawImage(img, 0, 0, 48, 48);
    var px = x.getImageData(0, 0, 48, 48).data;
    for (var i = 3; i < px.length; i += 4) if (px[i] < 250) return true;
    return false;
}
function encodeImage(img) {
    var iw = img.naturalWidth || 1024, ih = img.naturalHeight || 1024, s = Math.min(1, MAX_IMG / Math.max(iw, ih));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(iw * s));
    c.height = Math.max(1, Math.round(ih * s));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    var alpha = hasAlpha(img);
    var th = document.createElement('canvas'), side = Math.min(iw, ih);
    th.width = th.height = 120;
    th.getContext('2d').drawImage(img, (iw - side) / 2, (ih - side) / 2, side, side, 0, 0, 120, 120);
    return {
        id: newId('i'),
        src: alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.9),
        thumb: alpha ? th.toDataURL('image/png') : th.toDataURL('image/jpeg', 0.75),
        w: c.width,
        h: c.height
    };
}
function removeImage(id) {
    idb('readwrite', function (st) { return st.delete(id); }).catch(noop);
    delete lib[id];
    delete assets['img:' + id];
    removedIds[id] = true;
    imageIds = imageIds.filter(function (x) { return x !== id; });
    if (doc.bg.src === id) doc.bg.src = '';
    doc.layers = doc.layers.filter(function (l) { return l.img !== id; });
    if (sel && sel.indexOf('layer:') === 0 && !layerById(sel.slice(6))) sel = null;
    commit();
    refreshAll();
}

// ==========================================================================
// State, history, saving
// ==========================================================================
var doc = null, templates = [];
var hist = [], histPos = -1, commitTimer = 0;
var sel = null;                // 'date' | 'title' | 'author' | 'desc' | 'graphic' | 'bg' | 'layer:<id>'

function loadState() {
    var saved = readJSON(KEY_DOC) || {};
    doc = normalize(saved.doc);
    imageIds = Array.isArray(saved.images) ? saved.images.filter(function (x) { return typeof x === 'string'; }) : [];
    templates = readTemplates();
    hist = [JSON.stringify(doc)];
    histPos = 0;
}
function save() {
    // Union with what another tab may have added since, minus what was
    // removed here, so two open tabs do not lose each other's images.
    var stored = readJSON(KEY_DOC), ids = imageIds.slice();
    if (stored && Array.isArray(stored.images)) stored.images.forEach(function (id) {
        if (typeof id === 'string' && ids.indexOf(id) < 0 && !removedIds[id]) ids.push(id);
    });
    imageIds = ids;
    writeJSON(KEY_DOC, { v: 1, doc: doc, images: imageIds });
}
function commit() {
    clearTimeout(commitTimer);
    commitTimer = 0;
    var s = JSON.stringify(doc);
    if (hist[histPos] === s) return;
    hist = hist.slice(0, histPos + 1);
    hist.push(s);
    if (hist.length > HISTORY_MAX) hist.shift();
    histPos = hist.length - 1;
    save();
    syncUndo();
}
function commitSoon() {
    clearTimeout(commitTimer);
    commitTimer = setTimeout(commit, 600);
}
function undo() {
    commit();
    if (histPos <= 0) return;
    histPos--;
    restore();
}
function redo() {
    if (histPos >= hist.length - 1) return;
    histPos++;
    restore();
}
function restore() {
    doc = normalize(JSON.parse(hist[histPos]));
    if (sel && !selExists(sel)) sel = null;
    save();
    refreshAll();
}
function layerById(id) {
    for (var i = 0; i < doc.layers.length; i++) if (doc.layers[i].id === id) return doc.layers[i];
    return null;
}
function selExists(id) {
    if (id === 'bg') return true;
    if (id.indexOf('layer:') === 0) return !!layerById(id.slice(6));
    return MOVABLE.indexOf(id) >= 0;
}
function fmt() { return findFormat(doc.format); }

// ==========================================================================
// Markup
// ==========================================================================
var ICON = {
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 005.4-1.6"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/>',
    reset: '<path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.7L3 8"/><path d="M3 3v5h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'
};
function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>';
}
function node(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'html') n.innerHTML = v;
        else n.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
}

var MARKUP =
'<div class="card-overlay" id="card-overlay" hidden>' +
 '<div class="card-modal" role="dialog" aria-modal="true" aria-labelledby="card-heading">' +
  '<div class="card-head">' +
   '<h2 class="card-heading" id="card-heading" data-t="heading"></h2>' +
   '<div class="card-head-tools">' +
    '<button type="button" class="chip" data-act="new" data-t="new_card"></button>' +
    '<button type="button" class="icon-btn" data-act="undo" data-t-aria="undo">' + icon('undo') + '</button>' +
    '<button type="button" class="icon-btn" data-act="redo" data-t-aria="redo">' + icon('redo') + '</button>' +
    '<div class="seg-group card-filetype" role="group" data-t-aria="file_type" id="card-filetype">' +
     '<button type="button" class="seg-btn" data-ft="jpg">JPG</button>' +
     '<button type="button" class="seg-btn" data-ft="png">PNG</button>' +
     '<button type="button" class="seg-btn" data-ft="png_transp" data-t="ft_transp"></button>' +
    '</div>' +
    '<button type="button" class="btn" data-variant="primary" data-act="export" id="card-export" data-t="export"></button>' +
    '<button type="button" class="icon-btn" data-act="close" data-t-aria="close">' + icon('close') + '</button>' +
   '</div>' +
  '</div>' +
  '<div class="card-body">' +
   '<section class="card-pane card-pane-content" aria-labelledby="card-content-h">' +
    '<h3 class="card-section" id="card-content-h" data-t="content"></h3>' +
    '<div class="card-field"><label class="card-label" for="card-in-title" data-t="f_title"></label>' +
     '<input class="card-input" id="card-in-title" type="text" maxlength="120" autocomplete="off" data-t-ph="f_title_ph"></div>' +
    '<div class="card-field"><label class="card-label" for="card-in-author" data-t="f_author"></label>' +
     '<input class="card-input" id="card-in-author" type="text" maxlength="120" autocomplete="off" data-t-ph="f_author_ph"></div>' +
    '<div class="card-field card-field-grow"><label class="card-label" for="card-in-desc" data-t="f_desc"></label>' +
     '<textarea class="card-input card-textarea" id="card-in-desc" rows="7" aria-describedby="card-desc-hint"></textarea>' +
     '<p class="card-note" id="card-desc-hint" data-t="f_desc_hint"></p></div>' +
    '<div class="card-field"><span class="card-label" data-t="f_date"></span><div class="card-cal" id="card-cal"></div></div>' +
   '</section>' +
   '<section class="card-stage">' +
    '<div class="card-stage-area" id="card-stage-area">' +
     '<div class="card-frame" id="card-frame" tabindex="0">' +
      '<canvas id="card-canvas"></canvas>' +
      '<div class="card-box card-hover" id="card-hover" hidden></div>' +
      '<div class="card-box card-sel" id="card-sel" hidden><span class="card-sel-name" id="card-sel-name"></span></div>' +
      '<div class="card-guide card-guide-x" id="card-guide-x" hidden></div>' +
      '<div class="card-guide card-guide-y" id="card-guide-y" hidden></div>' +
     '</div>' +
     '<div class="card-drop" id="card-drop" hidden><span data-t="drop_here"></span></div>' +
    '</div>' +
    '<div class="card-stage-foot"><span id="card-hint" aria-live="polite"></span><span id="card-dims"></span></div>' +
   '</section>' +
   '<section class="card-pane card-pane-inspect">' +
    '<div class="seg-group card-tabs" role="tablist">' +
     '<button type="button" class="seg-btn" role="tab" id="card-tab-design" data-tab="design" aria-controls="card-panel-design" data-t="tab_design"></button>' +
     '<button type="button" class="seg-btn" role="tab" id="card-tab-layers" data-tab="layers" aria-controls="card-panel-layers" data-t="tab_layers"></button>' +
    '</div>' +
    '<div class="card-panel" id="card-panel-design" role="tabpanel" aria-labelledby="card-tab-design"></div>' +
    '<div class="card-panel" id="card-panel-layers" role="tabpanel" aria-labelledby="card-tab-layers" hidden>' +
     '<ul class="card-layers" id="card-layers"></ul>' +
     '<button type="button" class="chip card-add" data-act="add-layer">' + icon('plus') + '<span data-t="add_image"></span></button>' +
     '<div class="card-props" id="card-props"></div>' +
    '</div>' +
    '<input type="file" accept="image/*" id="card-file" hidden>' +
   '</section>' +
  '</div>' +
 '</div>' +
'</div>';

var overlayEl, modal, canvas, frame, stageArea, inTitle, inAuthor, inDesc, calEl, layersEl, propsEl, designEl, fileIn, exportBtn;
var cssReady = null, built = false, isOpen = false, langApplied = null, tab = 'design';
var previewK = 1, cssScale = 1, lastLayout = null, calView = null, fileMode = 'layer';

function build() {
    if (built) return;
    built = true;
    cssReady = new Promise(function (resolve) {
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = CSS_HREF;
        link.onload = link.onerror = function () { resolve(); };
        document.head.appendChild(link);
    });
    var wrap = document.createElement('div');
    wrap.innerHTML = MARKUP;
    overlayEl = wrap.firstChild;
    document.body.appendChild(overlayEl);
    modal = $('.card-modal', overlayEl);
    canvas = $('#card-canvas');
    frame = $('#card-frame');
    stageArea = $('#card-stage-area');
    inTitle = $('#card-in-title');
    inAuthor = $('#card-in-author');
    inDesc = $('#card-in-desc');
    calEl = $('#card-cal');
    layersEl = $('#card-layers');
    propsEl = $('#card-props');
    designEl = $('#card-panel-design');
    fileIn = $('#card-file');
    exportBtn = $('#card-export');
    coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    wire();
}

function applyLang() {
    langApplied = uiLang;
    $$('[data-t]', overlayEl).forEach(function (n) { n.textContent = t(n.dataset.t); });
    $$('[data-t-ph]', overlayEl).forEach(function (n) { n.placeholder = t(n.dataset.tPh); });
    $$('[data-t-aria]', overlayEl).forEach(function (n) {
        n.setAttribute('aria-label', t(n.dataset.tAria));
        if (n.tagName === 'BUTTON') n.title = t(n.dataset.tAria);
    });
}

// Everything that shows the document: after opening, undo, a template...
function refreshAll() {
    if (!built) return;
    inTitle.value = doc.title;
    inAuthor.value = doc.author;
    inDesc.value = doc.desc;
    $$('#card-filetype .seg-btn').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.ft === doc.fileType)); });
    renderCalendar();
    renderDesign();
    renderLayers();
    renderProps();
    syncUndo();
    schedule();
}
function syncUndo() {
    if (!built) return;
    $('[data-act="undo"]', overlayEl).disabled = histPos <= 0;
    $('[data-act="redo"]', overlayEl).disabled = histPos >= hist.length - 1;
}
function setTab(name) {
    tab = name;
    $$('.card-tabs .seg-btn', overlayEl).forEach(function (b) {
        var on = b.dataset.tab === name;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
    });
    $('#card-panel-design').hidden = name !== 'design';
    $('#card-panel-layers').hidden = name !== 'layers';
}

// --- Small control builders --------------------------------------------
function field(label, control, extra) {
    return node('div', { class: 'card-field' }, [
        node('div', { class: 'card-field-head' }, [node('span', { class: 'card-label', text: label }), extra || null]),
        control
    ]);
}
function seg(label, options, current, onPick) {
    var g = node('div', { class: 'seg-group card-seg', role: 'group', 'aria-label': label });
    options.forEach(function (o) {
        var b = node('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(o[0] === current), text: o[1] });
        b.addEventListener('click', function () {
            $$('.seg-btn', g).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
            onPick(o[0]);
            commit();
            schedule();
        });
        g.appendChild(b);
    });
    return field(label, g);
}
function onOff(label, value, onPick) {
    return seg(label, [[true, t('on')], [false, t('off')]], value, onPick);
}
function slider(label, value, min, max, step, show, onInput) {
    var out = node('span', { class: 'card-val', text: show(value) });
    var r = node('input', { type: 'range', class: 'card-range', min: min, max: max, step: step, 'aria-label': label });
    r.value = value;
    r.addEventListener('input', function () {
        var v = parseFloat(r.value);
        out.textContent = show(v);
        onInput(v);
        schedule();
    });
    r.addEventListener('change', commit);
    return field(label, r, out);
}
function colorField(label, value, isDefault, onInput, onReset) {
    var c = node('input', { type: 'color', class: 'card-color', 'aria-label': label });
    c.value = value;
    var reset = node('button', { type: 'button', class: 'icon-btn card-mini', title: t('color_reset'), 'aria-label': t('color_reset'), html: icon('reset') });
    reset.disabled = isDefault;
    c.addEventListener('input', function () { onInput(c.value); reset.disabled = false; schedule(); });
    c.addEventListener('change', commit);
    reset.addEventListener('click', function () {
        onReset();
        commit();
        renderProps();
        schedule();
    });
    return field(label, node('div', { class: 'card-color-row' }, [c, reset]));
}
function pct(v) { return Math.round(v * 100) + '%'; }
function times(v) { return v.toFixed(2) + '×'; }
function signed(v) { return (v > 0 ? '+' : '') + v.toFixed(2); }
function note(text, warn) { return node('p', { class: 'card-note' + (warn ? ' card-note-warn' : ''), text: text }); }
function actionButton(label, iconName, onClick, disabled) {
    var b = node('button', { type: 'button', class: 'chip card-action', html: (iconName ? icon(iconName) : '') });
    b.appendChild(node('span', { text: label }));
    b.disabled = !!disabled;
    b.addEventListener('click', onClick);
    return b;
}

// --- Design tab --------------------------------------------------------
function renderDesign() {
    designEl.textContent = '';
    // Template
    var tsel = node('select', { class: 'card-select', 'aria-label': t('template') });
    var g1 = node('optgroup', { label: t('tpl_builtin') });
    BUILTIN.forEach(function (b) { g1.appendChild(node('option', { value: b.id, text: t(b.name) })); });
    tsel.appendChild(g1);
    if (templates.length) {
        var g2 = node('optgroup', { label: t('tpl_yours') });
        templates.forEach(function (u) { g2.appendChild(node('option', { value: u.id, text: u.name })); });
        tsel.appendChild(g2);
    }
    if (!findTemplate(doc.template)) tsel.appendChild(node('option', { value: '', text: '—' }));
    tsel.value = findTemplate(doc.template) ? doc.template : '';
    tsel.addEventListener('change', function () { if (tsel.value) applyTemplate(tsel.value); });
    var reapply = node('button', { type: 'button', class: 'icon-btn card-mini', title: t('tpl_reapply'), 'aria-label': t('tpl_reapply'), html: icon('reset') });
    reapply.disabled = !findTemplate(doc.template);
    reapply.addEventListener('click', function () { applyTemplate(doc.template); });
    var cur = findTemplate(doc.template);
    var nameIn = node('input', { class: 'card-input', type: 'text', maxlength: 40, placeholder: t('tpl_name_ph'), 'aria-label': t('tpl_name_ph') });
    var saveRow = node('div', { class: 'card-row card-tpl-save', hidden: true }, [nameIn,
        actionButton(t('save'), null, function () { saveTemplate(nameIn.value); }),
        actionButton(t('cancel'), null, function () { saveRow.hidden = true; })]);
    nameIn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); saveTemplate(nameIn.value); }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); saveRow.hidden = true; }
    });
    var tplButtons = node('div', { class: 'card-row' }, [
        actionButton(t('tpl_save'), 'plus', function () {
            saveRow.hidden = false;
            nameIn.value = t('tpl_default_name', { n: templates.length + 1 });
            nameIn.focus();
            nameIn.select();
        }),
        actionButton(t('tpl_delete'), 'trash', function () { deleteTemplate(doc.template); }, !(cur && cur.user))
    ]);
    designEl.appendChild(node('div', { class: 'card-group' }, [
        node('h3', { class: 'card-section', text: t('template') }),
        node('div', { class: 'card-row card-row-select' }, [tsel, reapply]),
        tplButtons, saveRow
    ]));

    // Card
    var fsel = node('select', { class: 'card-select', 'aria-label': t('format') });
    ['screen', 'print', 'other'].forEach(function (grp) {
        var og = node('optgroup', { label: t('fmt_' + grp) });
        FORMATS.forEach(function (f) {
            if (f.g === grp) og.appendChild(node('option', { value: f.id, text: formatName(f) + '  —  ' + f.w + ' × ' + f.h }));
        });
        fsel.appendChild(og);
    });
    fsel.value = doc.format;
    fsel.addEventListener('change', function () { doc.format = fsel.value; commit(); renderProps(); schedule(); });
    designEl.appendChild(node('div', { class: 'card-group' }, [
        node('h3', { class: 'card-section', text: t('card') }),
        field(t('format'), fsel),
        seg(t('theme'), [['dark', t('dark')], ['light', t('light')]], doc.theme, function (v) { doc.theme = v; renderProps(); }),
        seg(t('align'), [['left', t('left')], ['center', t('center')], ['right', t('right')]], doc.align, function (v) { doc.align = v; }),
        slider(t('font_scale'), doc.fontScale, 0.5, 8, 0.05, times, function (v) { doc.fontScale = v; }),
        slider(t('padding'), doc.padScale, 0, 5, 0.05, times, function (v) { doc.padScale = v; }),
        slider(t('pad_bias'), doc.padRatio, -0.8, 0.8, 0.05, signed, function (v) { doc.padRatio = v; })
    ]));
}

// --- Layers tab --------------------------------------------------------
function elName(id) {
    if (id.indexOf('layer:') === 0) return t('el_image', { n: doc.layers.indexOf(layerById(id.slice(6))) + 1 });
    return t('el_' + id);
}
function layerOrder() {
    var ids = [];
    doc.layers.slice().reverse().forEach(function (l) { if (l.front) ids.push('layer:' + l.id); });
    ids.push('title', 'date', 'author', 'desc');
    doc.layers.slice().reverse().forEach(function (l) { if (!l.front) ids.push('layer:' + l.id); });
    ids.push('graphic', 'bg');
    return ids;
}
function isHidden(id) {
    if (id === 'bg') return doc.bg.hidden || !doc.bg.src;
    if (id.indexOf('layer:') === 0) return layerById(id.slice(6)).hidden;
    if (id === 'author' && !doc.author.trim()) return true;
    if (id === 'desc' && !doc.desc.trim()) return true;
    return doc.els[id].hidden;
}
function setHidden(id, hidden) {
    if (id === 'bg') doc.bg.hidden = hidden;
    else if (id.indexOf('layer:') === 0) layerById(id.slice(6)).hidden = hidden;
    else doc.els[id].hidden = hidden;
}
function ownHidden(id) {
    if (id === 'bg') return doc.bg.hidden;
    if (id.indexOf('layer:') === 0) return layerById(id.slice(6)).hidden;
    return doc.els[id].hidden;
}
function renderLayers() {
    layersEl.textContent = '';
    layerOrder().forEach(function (id) {
        var hiddenNow = ownHidden(id);
        var pick = node('button', { type: 'button', class: 'card-layer-pick', 'aria-pressed': String(sel === id) }, [
            node('span', { class: 'card-layer-name', text: elName(id) })
        ]);
        pick.addEventListener('click', function () { select(sel === id ? null : id); });
        var eye = node('button', { type: 'button', class: 'icon-btn card-mini card-eye', 'aria-pressed': String(!hiddenNow),
            title: t(hiddenNow ? 'show' : 'hide'), 'aria-label': t(hiddenNow ? 'show' : 'hide') + ': ' + elName(id),
            html: icon(hiddenNow ? 'eyeOff' : 'eye') });
        eye.disabled = id === 'bg' && !doc.bg.src;
        eye.addEventListener('click', function () {
            setHidden(id, !ownHidden(id));
            commit();
            renderLayers();
            if (sel === id) renderProps();
            schedule();
        });
        layersEl.appendChild(node('li', { class: 'card-layer' + (isHidden(id) ? ' is-off' : '') + (sel === id ? ' is-sel' : '') }, [pick, eye]));
    });
}

function renderProps() {
    propsEl.textContent = '';
    if (!sel) { propsEl.appendChild(note(t('select_hint'))); return; }
    var id = sel, f = fmt(), kids = [node('h3', { class: 'card-section', text: elName(id) })];
    function posButton(isZero, reset) {
        return actionButton(t('reset_pos'), 'reset', function () { reset(); commit(); renderProps(); schedule(); }, isZero);
    }
    if (MOVABLE.indexOf(id) >= 0) {
        var e = doc.els[id], cset = doc.colors[doc.theme], col = colorsOf(doc);
        kids.push(onOff(t('visible'), !e.hidden, function (v) { e.hidden = !v; renderLayers(); }));
        if (id === 'author' && !doc.author.trim()) kids.push(note(t('author_empty')));
        if (id === 'desc' && !doc.desc.trim()) kids.push(note(t('desc_empty')));
        if (id === 'desc' && f.w / f.h > 2.6) kids.push(note(t('banner_desc'), true));
        if (id === 'graphic') {
            var ksel = node('select', { class: 'card-select', 'aria-label': t('kind') });
            ksel.appendChild(node('option', { value: 'ring', text: t('ring') }));
            LOGOS.forEach(function (lg, i) { ksel.appendChild(node('option', { value: 'logo' + i, text: t(lg.name) })); });
            ksel.value = e.kind === 'ring' ? 'ring' : 'logo' + e.logo;
            ksel.addEventListener('change', function () {
                if (ksel.value === 'ring') e.kind = 'ring';
                else { e.kind = 'logo'; e.logo = parseInt(ksel.value.slice(4), 10); }
                commit();
                schedule();
            });
            kids.push(field(t('kind'), ksel));
        }
        if (id === 'date') kids.push(seg(t('date_lang'), [['en', 'EN'], ['sv', 'SV']], e.lang, function (v) { e.lang = v; }));
        if (id === 'author') kids.push(seg(t('author_pos'), [['opposite', t('opposite')], ['diagonal', t('diagonal')]], e.pos, function (v) { e.pos = v; }));
        kids.push(slider(t('size'), e.size, 0.2, 4, 0.01, pct, function (v) { e.size = v; }));
        if (id === 'graphic') kids.push(slider(t('opacity'), e.opacity, 0, 1, 0.01, pct, function (v) { e.opacity = v; }));
        var ckey = { date: 'date', title: 'title', author: 'author', desc: 'body', graphic: 'graphic' }[id];
        var shown = ckey === 'body' ? (col.body || (doc.theme === 'dark' ? '#b8b8b8' : '#474747')) : col[ckey];
        kids.push(colorField(t(ckey === 'body' ? 'body_color' : 'color'), shown, !cset[ckey],
            function (v) { cset[ckey] = v; }, function () { cset[ckey] = ''; }));
        if (id === 'desc') {
            kids.push(colorField(t('accent_color'), col.accent, !cset.accent, function (v) { cset.accent = v; }, function () { cset.accent = ''; }));
            kids.push(seg(t('columns'), [[1, '1'], [2, '2'], [3, '3']], e.columns, function (v) { e.columns = v; }));
            kids.push(onOff(t('justify'), e.justify, function (v) { e.justify = v; }));
        }
        if (id === 'title') kids.push(onOff(t('rule'), e.rule, function (v) { e.rule = v; }));
        kids.push(node('div', { class: 'card-row' }, [posButton(!e.dx && !e.dy, function () { e.dx = 0; e.dy = 0; })]));
    } else if (id === 'bg') {
        var bg = doc.bg;
        if (doc.fileType === 'png_transp') kids.push(note(t('bg_transp'), true));
        var strip = node('div', { class: 'card-thumbs', role: 'group', 'aria-label': t('photo') });
        propsThumbs(strip);
        kids.push(field(t('photo'), strip));
        if (bg.src) {
            kids.push(slider(t('opacity'), bg.opacity, 0, 1, 0.01, pct, function (v) { bg.opacity = v; }));
            kids.push(slider(t('zoom'), bg.zoom, 1, 4, 0.01, times, function (v) { bg.zoom = v; }));
            kids.push(note(t('bg_hint')));
            kids.push(node('div', { class: 'card-row' }, [posButton(!bg.px && !bg.py, function () { bg.px = 0; bg.py = 0; })]));
        }
    } else {
        var l = layerById(id.slice(6));
        if (!lib[l.img] && libraryLoaded) kids.push(note(t('image_missing'), true));
        kids.push(onOff(t('visible'), !l.hidden, function (v) { l.hidden = !v; renderLayers(); }));
        kids.push(slider(t('size'), l.size, 0.02, 2, 0.005, pct, function (v) { l.size = v; }));
        kids.push(slider(t('opacity'), l.opacity, 0, 1, 0.01, pct, function (v) { l.opacity = v; }));
        kids.push(onOff(t('layer_front'), l.front, function (v) { l.front = v; renderLayers(); }));
        var i = doc.layers.indexOf(l);
        kids.push(node('div', { class: 'card-row' }, [
            posButton(l.x === 0.5 && l.y === 0.5, function () { l.x = 0.5; l.y = 0.5; }),
            actionButton(t('layer_up'), 'up', function () { moveLayer(l, 1); }, i === doc.layers.length - 1),
            actionButton(t('layer_down'), 'down', function () { moveLayer(l, -1); }, i === 0),
            actionButton(t('layer_remove'), 'trash', function () {
                doc.layers.splice(doc.layers.indexOf(l), 1);
                select(null);
                commit();
                renderLayers();
                schedule();
            })
        ]));
    }
    kids.forEach(function (k) { propsEl.appendChild(k); });
}
function moveLayer(l, dir) {
    var i = doc.layers.indexOf(l), j = i + dir;
    if (j < 0 || j >= doc.layers.length) return;
    doc.layers.splice(i, 1);
    doc.layers.splice(j, 0, l);
    commit();
    renderLayers();
    renderProps();
    schedule();
}
function propsThumbs(strip) {
    function thumb(src, label, value, removable) {
        var b = node('button', { type: 'button', class: 'card-thumb', 'aria-pressed': String(doc.bg.src === value), title: label, 'aria-label': label });
        if (src) b.appendChild(node('img', { src: src, alt: '' }));
        else b.appendChild(node('span', { class: 'card-thumb-none', text: t('none') }));
        b.addEventListener('click', function () {
            if (value && !doc.bg.src) doc.bg.opacity = value.charAt(0) === 'p' ? 0.3 : 0.6;
            doc.bg.src = value;
            doc.bg.px = doc.bg.py = 0;
            doc.bg.hidden = false;
            commit();
            renderLayers();
            renderProps();
            schedule();
        });
        var wrap = node('div', { class: 'card-thumb-wrap' }, [b]);
        if (removable) {
            var x = node('button', { type: 'button', class: 'card-thumb-x', title: t('remove_image'), 'aria-label': t('remove_image'), html: icon('close') });
            x.addEventListener('click', function () { if (confirm(t('remove_image_confirm'))) removeImage(value); });
            wrap.appendChild(x);
        }
        strip.appendChild(wrap);
    }
    thumb('', t('none'), '', false);
    PHOTOS.forEach(function (p, i) { thumb(p.thumb, t('photo') + ' ' + (i + 1), p.id, false); });
    var mine = imageIds.filter(function (id) { return lib[id]; });
    mine.forEach(function (id, i) { thumb(lib[id].thumb, t('your_image', { n: i + 1 }), id, true); });
    var add = node('button', { type: 'button', class: 'card-thumb card-thumb-add', title: t('add_image'), 'aria-label': t('add_image'), html: icon('plus') });
    add.addEventListener('click', function () { fileMode = 'bg'; fileIn.click(); });
    strip.appendChild(node('div', { class: 'card-thumb-wrap' }, [add]));
    if (!libraryLoaded && imageIds.length) loadLibrary().then(function () { if (sel === 'bg') renderProps(); });
}

// --- Calendar ------------------------------------------------------------
function renderCalendar() {
    var d = parseIso(doc.date);
    if (!calView) calView = new Date(d.getFullYear(), d.getMonth(), 1);
    var yr = calView.getFullYear(), mo = calView.getMonth();
    var firstDow = new Date(yr, mo, 1).getDay(), days = new Date(yr, mo + 1, 0).getDate(), today = new Date();
    calEl.textContent = '';
    var prev = node('button', { type: 'button', class: 'card-cal-nav-btn', 'aria-label': t('prev_month'), title: t('prev_month'), text: '‹' });
    var next = node('button', { type: 'button', class: 'card-cal-nav-btn', 'aria-label': t('next_month'), title: t('next_month'), text: '›' });
    prev.addEventListener('click', function () { calView = new Date(yr, mo - 1, 1); renderCalendar(); });
    next.addEventListener('click', function () { calView = new Date(yr, mo + 1, 1); renderCalendar(); });
    calEl.appendChild(node('div', { class: 'card-cal-nav' }, [prev, node('span', { class: 'card-cal-month', text: t('months')[mo] + ' ' + yr }), next]));
    var grid = node('div', { class: 'card-cal-grid', role: 'group' });
    t('days_short').forEach(function (n) { grid.appendChild(node('span', { class: 'card-cal-dow', text: n })); });
    for (var i = 0; i < firstDow; i++) grid.appendChild(node('span', { class: 'card-cal-blank' }));
    for (var day = 1; day <= days; day++) {
        var isSel = d.getFullYear() === yr && d.getMonth() === mo && d.getDate() === day;
        var isToday = today.getFullYear() === yr && today.getMonth() === mo && today.getDate() === day;
        var b = node('button', { type: 'button', class: 'card-cal-day' + (isToday ? ' is-today' : ''), 'aria-pressed': String(isSel), text: String(day),
            'aria-label': day + ' ' + t('months')[mo] + ' ' + yr });
        b.dataset.iso = yr + '-' + pad(mo + 1) + '-' + pad(day);
        grid.appendChild(b);
    }
    calEl.appendChild(grid);
}

// ==========================================================================
// Preview, selection, dragging
// ==========================================================================
var rafId = 0;
function schedule() {
    if (!isOpen || rafId) return;
    rafId = requestAnimationFrame(function () { rafId = 0; drawPreview(); });
}
function fitFrame(f) {
    var cs = getComputedStyle(stageArea);
    var aw = stageArea.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var ah = stageArea.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (aw < 20 || ah < 20) return false;
    var s = Math.min(aw / f.w, ah / f.h);
    var cw = Math.max(1, Math.floor(f.w * s)), ch = Math.max(1, Math.floor(f.h * s));
    frame.style.width = cw + 'px';
    frame.style.height = ch + 'px';
    var dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    var pw = Math.round(cw * dpr), ph = Math.round(ch * dpr);
    if (canvas.width !== pw) canvas.width = pw;
    if (canvas.height !== ph) canvas.height = ph;
    previewK = pw / f.w;
    cssScale = cw / f.w;
    return true;
}
function drawPreview() {
    if (!isOpen) return;
    var f = fmt();
    if (!fitFrame(f)) return;
    lastLayout = render(canvas.getContext('2d'), doc, f, previewK, false);
    showBox($('#card-sel'), sel && sel !== 'bg' ? lastLayout.boxes[sel] : (sel === 'bg' ? lastLayout.boxes.bg : null));
    $('#card-sel-name').textContent = sel ? elName(sel) : '';
    if (!drag) showBox($('#card-hover'), hoverId && hoverId !== sel ? lastLayout.boxes[hoverId] : null);
    $('#card-dims').textContent = f.w + ' × ' + f.h + ' px';
    var hint = $('#card-hint'), warn = '';
    if (bannerHidesDesc(f)) warn = t('banner_desc');
    else if (lastLayout.overflow) warn = t('warn_overflow');
    hint.textContent = warn || t(coarse ? 'hint_touch' : 'hint_drag');
    hint.classList.toggle('card-warn', !!warn);
}
function bannerHidesDesc(f) { return f.w / f.h > 2.6 && doc.desc.trim() && !doc.els.desc.hidden; }
function showBox(el, b) {
    if (!b) { el.hidden = true; return; }
    el.hidden = false;
    el.style.left = (b.x * cssScale) + 'px';
    el.style.top = (b.y * cssScale) + 'px';
    el.style.width = Math.max(4, b.w * cssScale) + 'px';
    el.style.height = Math.max(4, b.h * cssScale) + 'px';
}

function toCard(e) {
    var r = canvas.getBoundingClientRect(), f = fmt();
    return { x: (e.clientX - r.left) / r.width * f.w, y: (e.clientY - r.top) / r.height * f.h };
}
function hitTest(p) {
    if (!lastLayout) return null;
    var B = lastLayout.boxes, tol = 6 / cssScale, ids = layerOrder();
    for (var i = 0; i < ids.length; i++) {
        var id = ids[i], b = B[id];
        if (!b || id === 'bg') continue;
        if (b.ring) {
            var dist = Math.hypot(p.x - b.ring.cx, p.y - b.ring.cy);
            if (dist > b.ring.r * 0.86 - tol && dist < b.ring.r * 1.02 + tol) return id;
        } else if (p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol) {
            return id;
        }
    }
    return null;
}
function select(id) {
    sel = id;
    if (id && tab !== 'layers') setTab('layers');
    frame.classList.toggle('has-sel', !!id);
    renderLayers();
    renderProps();
    schedule();
}

function posOf(id) {
    if (id === 'bg') return { x: doc.bg.px, y: doc.bg.py };
    if (id.indexOf('layer:') === 0) { var l = layerById(id.slice(6)); return { x: l.x, y: l.y }; }
    return { x: doc.els[id].dx, y: doc.els[id].dy };
}
// Move `id` by (dx, dy) card pixels from its position `start`.
function applyMove(id, start, dx, dy) {
    var f = fmt();
    if (id === 'bg') {
        var a = usable(bgAsset(doc.bg.src, false));
        if (!a) return;
        var o = coverOverflow(a.img, f.w, f.h, doc.bg.zoom);
        doc.bg.px = o.x > 0 ? clamp(start.x + dx / (o.x / 2), -1, 1) : 0;
        doc.bg.py = o.y > 0 ? clamp(start.y + dy / (o.y / 2), -1, 1) : 0;
    } else if (id.indexOf('layer:') === 0) {
        var l = layerById(id.slice(6));
        l.x = clamp(start.x + dx / f.w, -1, 2);
        l.y = clamp(start.y + dy / f.h, -1, 2);
    } else {
        doc.els[id].dx = clamp(start.x + dx / f.w, -2, 2);
        doc.els[id].dy = clamp(start.y + dy / f.h, -2, 2);
    }
}
// Snap the dragged box's edges or middle to the margins and the centre lines.
function snap(box, dx, dy) {
    var f = fmt(), P = lastLayout.pad, thr = 7 / cssScale, res = { dx: dx, dy: dy, gx: null, gy: null };
    function best(start, size, lines, delta) {
        var hit = null;
        [start, start + size / 2, start + size].forEach(function (edge) {
            lines.forEach(function (line) {
                var diff = line - (edge + delta);
                if (Math.abs(diff) < thr && (!hit || Math.abs(diff) < Math.abs(hit.diff))) hit = { diff: diff, line: line };
            });
        });
        return hit;
    }
    var hx = best(box.x, box.w, [P.x, f.w / 2, f.w - P.x], dx);
    var hy = best(box.y, box.h, [P.y, f.h / 2, f.h - P.y], dy);
    if (hx) { res.dx += hx.diff; res.gx = hx.line; }
    if (hy) { res.dy += hy.diff; res.gy = hy.line; }
    return res;
}
function showGuides(gx, gy) {
    var x = $('#card-guide-x'), y = $('#card-guide-y');
    x.hidden = gx === null;
    y.hidden = gy === null;
    if (gx !== null) x.style.left = (gx * cssScale) + 'px';
    if (gy !== null) y.style.top = (gy * cssScale) + 'px';
}

var drag = null, hoverId = null, coarse = false;
function onPointerDown(e) {
    if (e.button !== 0 || !lastLayout) return;
    coarse = e.pointerType === 'touch' || e.pointerType === 'pen';
    var p = toCard(e), hit = hitTest(p);
    // The selected element wins inside its own box, so an image under the
    // text (or a big description box) can still be dragged once selected.
    var sb = sel && sel !== 'bg' && lastLayout.boxes[sel];
    if (sb && !sb.ring && p.x >= sb.x && p.x <= sb.x + sb.w && p.y >= sb.y && p.y <= sb.y + sb.h) hit = sel;
    if (!hit && !(sel === 'bg' && doc.bg.src)) { if (sel) select(null); return; }
    var id = hit || 'bg';
    if (id !== sel) select(id);
    var b = lastLayout.boxes[id];
    drag = { id: id, x0: p.x, y0: p.y, start: posOf(id), box: b ? { x: b.x, y: b.y, w: b.w, h: b.h } : null, moved: false };
    try { frame.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    // Focus for the arrow keys, without the keyboard focus ring.
    frame.focus({ preventScroll: true, focusVisible: false });
    e.preventDefault();
}
function onPointerMove(e) {
    if (!drag) {
        if (e.pointerType !== 'mouse') return;
        var h = hitTest(toCard(e));
        if (h !== hoverId) { hoverId = h; frame.style.cursor = h ? 'move' : (sel === 'bg' && doc.bg.src ? 'grab' : ''); schedule(); }
        return;
    }
    var p = toCard(e), dx = p.x - drag.x0, dy = p.y - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) * cssScale < 3) return;
    drag.moved = true;
    var s = drag.id !== 'bg' && drag.box && !e.altKey ? snap(drag.box, dx, dy) : { dx: dx, dy: dy, gx: null, gy: null };
    applyMove(drag.id, drag.start, s.dx, s.dy);
    showGuides(s.gx, s.gy);
    schedule();
}
function onPointerUp() {
    if (!drag) return;
    var moved = drag.moved;
    drag = null;
    showGuides(null, null);
    if (moved) { commit(); renderProps(); }
}
function resetPosition(id) {
    if (id === 'bg') { doc.bg.px = doc.bg.py = 0; }
    else if (id.indexOf('layer:') === 0) { var l = layerById(id.slice(6)); l.x = l.y = 0.5; }
    else { doc.els[id].dx = doc.els[id].dy = 0; }
    commit();
    renderProps();
    schedule();
}

// ==========================================================================
// Templates, images, export
// ==========================================================================
function pickLook(d) {
    var look = {};
    LOOK_KEYS.forEach(function (k) { look[k] = clone(d[k]); });
    return look;
}
function applyTemplate(id) {
    var tpl = findTemplate(id);
    if (!tpl) return;
    var next = assignLook(lookDefaults(), clone(tpl.look));
    ['title', 'author', 'desc', 'date', 'format', 'fileType'].forEach(function (k) { next[k] = doc[k]; });
    if (tpl.user) {
        if (tpl.format) next.format = tpl.format;
        if (tpl.fileType) next.fileType = tpl.fileType;
    } else {
        next.els.date.lang = doc.els.date.lang;
    }
    next.template = id;
    doc = normalize(next);
    sel = null;
    commit();
    refreshAll();
}
function saveTemplate(name) {
    name = (name || '').trim().slice(0, 40) || t('tpl_default_name', { n: templates.length + 1 });
    var list = readTemplates();
    var tpl = { id: newId('u'), name: name, look: pickLook(doc), format: doc.format, fileType: doc.fileType };
    list.push(tpl);
    writeJSON(KEY_TPL, list.map(function (x) { return { id: x.id, name: x.name, look: x.look, format: x.format, fileType: x.fileType }; }));
    templates = readTemplates();
    doc.template = tpl.id;
    commit();
    renderDesign();
}
function deleteTemplate(id) {
    var tpl = findTemplate(id);
    if (!tpl || !tpl.user || !confirm(t('tpl_delete_confirm', { name: tpl.name }))) return;
    var list = readTemplates().filter(function (x) { return x.id !== id; });
    writeJSON(KEY_TPL, list.map(function (x) { return { id: x.id, name: x.name, look: x.look, format: x.format, fileType: x.fileType }; }));
    templates = readTemplates();
    commit();
    renderDesign();
}

function addFiles(files, mode) {
    var list = Array.prototype.filter.call(files || [], function (f) { return /^image\//.test(f.type); });
    if (!list.length) return;
    var chain = Promise.resolve();
    list.forEach(function (file) {
        chain = chain.then(function () { return importImage(file); }).then(function (rec) {
            if (mode === 'bg') {
                if (!doc.bg.src) doc.bg.opacity = 0.6;
                doc.bg.src = rec.id;
                doc.bg.px = doc.bg.py = 0;
                doc.bg.hidden = false;
                sel = 'bg';
            } else {
                var l = merge(LAYER_DEFAULTS, { id: newId('l'), img: rec.id });
                doc.layers.push(l);
                sel = 'layer:' + l.id;
            }
            commit();
        });
    });
    chain.catch(function () { alert(t('image_failed')); }).then(function () {
        if (sel) setTab('layers');
        frame.classList.toggle('has-sel', !!sel);
        renderLayers();
        renderProps();
        schedule();
    });
}

function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([
        document.fonts.load('400 40px HaraldMono'),
        document.fonts.load('400 40px HaraldText'),
        document.fonts.load('italic 400 40px HaraldText')
    ]).catch(noop);
}
function slug(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'event';
}
var exporting = false;
function exportCard() {
    if (exporting) return;
    commit();
    exporting = true;
    exportBtn.disabled = true;
    exportBtn.textContent = t('exporting');
    var d = clone(doc), f = findFormat(d.format);
    // Wait for the fonts and every image (a texture switched on a moment ago
    // used to be missing from the file).
    Promise.all([fontsReady(), ensureAssets(d, f)]).then(function () {
        var c = document.createElement('canvas');
        c.width = f.w;
        c.height = f.h;
        var ctx = c.getContext('2d');
        if (!ctx || c.width !== f.w || c.height !== f.h) throw new Error('canvas');
        render(ctx, d, f, 1, true);
        var type = d.fileType === 'jpg' ? 'image/jpeg' : 'image/png';
        return new Promise(function (resolve) {
            if (c.toBlob) c.toBlob(resolve, type, 0.92);
            else resolve(null);
        }).then(function (blob) {
            // A canvas over the browser's size limit gives no blob at all.
            if (!blob || !blob.size) throw new Error('blob');
            var date = parseIso(d.date);
            var name = date.getFullYear() + '_' + pad(date.getMonth() + 1) + '_' + pad(date.getDate()) + '_' + slug(d.title) + (type === 'image/jpeg' ? '.jpg' : '.png');
            // An object URL for the download link: no image is shown from
            // it, so the CSP's img-src does not apply, and a large PNG as a
            // data: URL can fail to download.
            var url = URL.createObjectURL(blob), a = document.createElement('a');
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        });
    }).catch(function () {
        alert(t('export_failed'));
    }).then(function () {
        exporting = false;
        exportBtn.disabled = false;
        exportBtn.textContent = t('export');
    });
}

// ==========================================================================
// Open / close and wiring
// ==========================================================================
var returnFocus = null, downOnBackdrop = false;
function open() {
    build();
    uiLang = root.lang === 'sv' ? 'sv' : 'en';
    if (langApplied !== uiLang) applyLang();
    if (!doc) loadState();
    if (isOpen) return;
    returnFocus = document.activeElement;
    calView = null;
    cssReady.then(function () {
        overlayEl.hidden = false;
        void overlayEl.offsetWidth;          // start the fade from the hidden state
        overlayEl.classList.add('active');   // visible from here on, so focus works
        isOpen = true;
        refreshAll();
        setTab(tab);
        fontsReady().then(schedule);
        inTitle.focus({ preventScroll: true });
    });
}
function close() {
    if (!isOpen) return;
    commit();
    isOpen = false;
    drag = null;
    overlayEl.classList.remove('active');
    if (returnFocus && returnFocus.focus) returnFocus.focus({ preventScroll: true });
}
function isTyping(el) {
    return el && (el.tagName === 'INPUT' && !/^(range|color|button|checkbox|radio|file)$/.test(el.type) || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}
function focusables() {
    return $$('button, input, select, textarea, [tabindex="0"]', modal).filter(function (n) {
        return !n.disabled && !n.hidden && n.offsetParent !== null;
    });
}

function wire() {
    overlayEl.addEventListener('pointerdown', function (e) { downOnBackdrop = e.target === overlayEl; });
    overlayEl.addEventListener('click', function (e) {
        // Close only when the click both started and ended on the backdrop,
        // so a drag that ends outside the window never closes it.
        if (e.target === overlayEl && downOnBackdrop) close();
        downOnBackdrop = false;
    });
    overlayEl.addEventListener('click', function (e) {
        var b = e.target.closest('[data-act]');
        if (!b) return;
        var act = b.dataset.act;
        if (act === 'close') close();
        else if (act === 'undo') undo();
        else if (act === 'redo') redo();
        else if (act === 'export') exportCard();
        else if (act === 'add-layer') { fileMode = 'layer'; fileIn.click(); }
        else if (act === 'new') {
            doc.title = doc.author = doc.desc = '';
            doc.date = isoDate(new Date());
            calView = null;
            commit();
            refreshAll();
            inTitle.focus();
        }
    });
    $('#card-filetype').addEventListener('click', function (e) {
        var b = e.target.closest('[data-ft]');
        if (!b) return;
        doc.fileType = b.dataset.ft;
        commit();
        refreshAll();
    });
    $$('.card-tabs .seg-btn', overlayEl).forEach(function (b) {
        b.addEventListener('click', function () { setTab(b.dataset.tab); });
    });

    function bindText(input, key) {
        input.addEventListener('input', function () {
            doc[key] = input.value;
            commitSoon();
            schedule();
            if ((key === 'author' || key === 'desc') && built) renderLayers();
        });
        input.addEventListener('change', commit);
    }
    bindText(inTitle, 'title');
    bindText(inAuthor, 'author');
    bindText(inDesc, 'desc');

    calEl.addEventListener('click', function (e) {
        var b = e.target.closest('.card-cal-day');
        if (!b) return;
        doc.date = b.dataset.iso;
        commit();
        renderCalendar();
        schedule();
    });

    frame.addEventListener('pointerdown', onPointerDown);
    frame.addEventListener('pointermove', onPointerMove);
    frame.addEventListener('pointerup', onPointerUp);
    frame.addEventListener('pointercancel', onPointerUp);
    frame.addEventListener('pointerleave', function () { if (hoverId && !drag) { hoverId = null; schedule(); } });
    frame.addEventListener('dblclick', function (e) {
        var hit = hitTest(toCard(e)) || (sel === 'bg' ? 'bg' : null);
        if (hit) resetPosition(hit);
    });

    fileIn.addEventListener('change', function () {
        addFiles(fileIn.files, fileMode);
        fileIn.value = '';
    });
    // Drop an image on the preview to add it as a layer.
    var dropEl = $('#card-drop'), dragDepth = 0;
    function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0; }
    stageArea.addEventListener('dragenter', function (e) { if (!hasFiles(e)) return; dragDepth++; dropEl.hidden = false; e.preventDefault(); });
    stageArea.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
    stageArea.addEventListener('dragleave', function () { if (--dragDepth <= 0) { dragDepth = 0; dropEl.hidden = true; } });
    stageArea.addEventListener('drop', function (e) {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth = 0;
        dropEl.hidden = true;
        addFiles(e.dataTransfer.files, 'layer');
    });
    // Paste an image (outside the text fields) to add it as a layer.
    document.addEventListener('paste', function (e) {
        if (!isOpen || isTyping(e.target) || !e.clipboardData) return;
        var files = Array.prototype.filter.call(e.clipboardData.files || [], function (f) { return /^image\//.test(f.type); });
        if (!files.length) return;
        e.preventDefault();
        addFiles(files, 'layer');
    });

    document.addEventListener('keydown', function (e) {
        if (!isOpen) return;
        var typing = isTyping(e.target), mod = e.ctrlKey || e.metaKey;
        if (e.key === 'Escape') {
            e.preventDefault();
            if (drag) return;
            if (sel && !typing) { select(null); return; }
            close();
            return;
        }
        if (e.key === 'Tab') {
            var list = focusables();
            if (!list.length) return;
            var first = list[0], last = list[list.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            else if (!modal.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
            return;
        }
        if (typing) return;
        if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
        if (mod && !e.altKey && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); return; }
        // Nudging and deleting act on the selection only while the preview
        // or the layer list has focus, never on a focused slider or button.
        if (mod || e.altKey || !sel || !(e.target === frame || e.target.closest('.card-layer-pick'))) return;
        var arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (arrows) {
            e.preventDefault();
            var step = (e.shiftKey ? 10 : 1) / cssScale;
            applyMove(sel, posOf(sel), arrows[0] * step, arrows[1] * step);
            commitSoon();
            schedule();
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel.indexOf('layer:') === 0) {
            e.preventDefault();
            doc.layers.splice(doc.layers.indexOf(layerById(sel.slice(6))), 1);
            select(null);
            commit();
            frame.focus({ preventScroll: true });
        }
    });

    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function () { schedule(); }).observe(stageArea);
    else window.addEventListener('resize', schedule);
    window.addEventListener('pagehide', function () { if (doc && commitTimer) commit(); });
}

window.RvryCard = { open: open };
}());
