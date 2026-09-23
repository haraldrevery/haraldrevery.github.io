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
     localStorage "rvry-clock-card-v2"            the card being made, plus the
                                                  ids of the images and fonts added
     localStorage "rvry-clock-card-templates-v2"  templates saved by the visitor
     IndexedDB    "rvry-clock-card-images"        the added images (never in
                                                  localStorage, which holds ~5 MB
                                                  for the whole site)
     IndexedDB    "rvry-clock-card-fonts"         the added fonts
   The first version of this editor (2026-09-22/23) used "rvry-clock-card" and
   "rvry-clock-card-templates". They are only READ, to carry a card and
   templates over, and never written: a clock tab can stay open for days
   running that first card.js, which drops everything it does not know (text
   layers, frames, boxes, fonts) and saves over its key. The images database
   is shared: same version (1), same records. Any later change that an older
   card.js would misread needs new key names again, and a new IndexedDB
   database rather than a version bump (an old tab that has the database open
   blocks an upgrade).

   Model: one plain object, `doc`, saved as JSON. doc.items is the stacking
   order, bottom first: the graphic, the date, author, title and description
   (one each, with those ids) and any number of image and text layers. The
   background photo is always at the very bottom and lives in doc.bg.

   The date, author, title, description and graphic are either "auto" —
   placed by the template's automatic layout (the old card's), which follows
   the text, the card size and the template settings — or have their own
   frame: x, y, w, h as fractions of the card (h 0 = as tall as the text),
   which keeps its proportions when the size changes. Dragging or resizing
   gives an element its own frame; "Reset position" and "Reset layout" hand it
   back to the template. Moves made in the first version are kept as offsets
   from the automatic place (dx, dy) until the element is touched, so an old
   card looks exactly as before. Text sizes always follow the card size and
   the template's text size (the old card's rules).

   Text is laid out at card size once per change (layoutCache) and painted
   through a scale transform, so the preview breaks lines exactly where the
   exported file does, and dragging only repaints.
   ========================================================================== */
(function () {
'use strict';

// Bump with every card.css change: this file and the CSS must match, and both
// are cached for months (clock.js loads this file without a version).
var CSS_HREF = '/clock/css/card.css?v=20260923b';

var KEY_DOC = 'rvry-clock-card-v2';
var KEY_TPL = 'rvry-clock-card-templates-v2';
var KEY_DOC_V1 = 'rvry-clock-card';               // read once, never written
var KEY_TPL_V1 = 'rvry-clock-card-templates';     // read, never written
var IMG_DB = 'rvry-clock-card-images';
var FONT_DB = 'rvry-clock-card-fonts';
var MAX_IMG = 4096;       // longest side an added image is stored at
var MAX_FONT_BYTES = 15 * 1024 * 1024;
var MAX_LAYERS = 24;      // image layers, and text layers, each
var MAX_TEXT = 5000;      // characters in one text layer
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
function strList(a) { return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string'; }) : []; }

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
        align: 'Alignment', left: 'Left', center: 'Centre', right: 'Right', align_auto: 'Auto',
        font_scale: 'Text size', padding: 'Margins', pad_bias: 'Margin balance ↕ ↔',
        reset_layout: 'Reset layout to the template',
        el_bg: 'Background', el_graphic: 'Graphic', el_title: 'Title', el_date: 'Date', el_author: 'Author',
        el_desc: 'Description', el_image: 'Image {n}', el_text: 'Text {n}',
        show: 'Show', hide: 'Hide', visible: 'Visible', on: 'On', off: 'Off',
        add_image: 'Add image', add_text: 'Add text', image_failed: 'That image could not be read.',
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
        layer_remove: 'Remove layer', layer_up: 'Move up', layer_down: 'Move down', duplicate: 'Duplicate',
        image_missing: 'This image is missing.',
        f_text: 'Text', text_default: 'Your text', text_hint: 'Markdown: # heading, **bold**, *italic*, - list',
        font: 'Font', add_font: 'Add a font…', remove_font: 'Remove this font',
        remove_font_confirm: 'Remove the font “{name}” from the card editor? Text that uses it goes back to the default font.',
        font_failed: 'That font could not be read. Use a .ttf, .otf, .woff or .woff2 file.',
        font_too_big: 'That font file is too large (15 MB at most).',
        font_missing: 'The font chosen for this text is missing, so the default font is used.', font_missing_opt: 'Missing font',
        letter_spacing: 'Letter spacing', line_spacing: 'Line spacing',
        text_box: 'Text box', width: 'Width', height: 'Height', h_fit: 'Fit the text', h_fixed: 'Fixed',
        valign: 'Vertical alignment', top: 'Top', middle: 'Middle', bottom: 'Bottom',
        box: 'Background box', fill: 'Fill', fill_opacity: 'Fill opacity', blur: 'Blur behind',
        border: 'Border', border_color: 'Border colour', border_opacity: 'Border opacity',
        radius: 'Rounded corners', box_pad: 'Padding', shadow: 'Shadow', shadow_opacity: 'Shadow opacity',
        hint_drag: 'Drag to move · handles resize · double-click resets · arrow keys nudge',
        hint_touch: 'Tap to select, then drag',
        warn_overflow: 'Some text runs off the card.',
        warn_frame: 'Some text does not fit in its text box.',
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
        align: 'Justering', left: 'Vänster', center: 'Mitten', right: 'Höger', align_auto: 'Auto',
        font_scale: 'Textstorlek', padding: 'Marginaler', pad_bias: 'Marginalbalans ↕ ↔',
        reset_layout: 'Återställ layouten till mallen',
        el_bg: 'Bakgrund', el_graphic: 'Grafik', el_title: 'Titel', el_date: 'Datum', el_author: 'Avsändare',
        el_desc: 'Beskrivning', el_image: 'Bild {n}', el_text: 'Text {n}',
        show: 'Visa', hide: 'Dölj', visible: 'Synlig', on: 'På', off: 'Av',
        add_image: 'Lägg till bild', add_text: 'Lägg till text', image_failed: 'Bilden kunde inte läsas.',
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
        layer_remove: 'Ta bort lagret', layer_up: 'Flytta upp', layer_down: 'Flytta ner', duplicate: 'Duplicera',
        image_missing: 'Bilden saknas.',
        f_text: 'Text', text_default: 'Din text', text_hint: 'Markdown: # rubrik, **fet**, *kursiv*, - lista',
        font: 'Typsnitt', add_font: 'Lägg till ett typsnitt…', remove_font: 'Ta bort typsnittet',
        remove_font_confirm: 'Ta bort typsnittet ”{name}” från kortredigeraren? Text som använder det får standardtypsnittet igen.',
        font_failed: 'Typsnittet kunde inte läsas. Använd en .ttf-, .otf-, .woff- eller .woff2-fil.',
        font_too_big: 'Typsnittsfilen är för stor (högst 15 MB).',
        font_missing: 'Typsnittet som valts för texten saknas, så standardtypsnittet används.', font_missing_opt: 'Typsnitt saknas',
        letter_spacing: 'Teckenavstånd', line_spacing: 'Radavstånd',
        text_box: 'Textruta', width: 'Bredd', height: 'Höjd', h_fit: 'Efter texten', h_fixed: 'Fast',
        valign: 'Vertikal justering', top: 'Topp', middle: 'Mitten', bottom: 'Botten',
        box: 'Bakgrundsruta', fill: 'Fyllning', fill_opacity: 'Fyllningens opacitet', blur: 'Oskärpa bakom',
        border: 'Kantlinje', border_color: 'Kantlinjens färg', border_opacity: 'Kantlinjens opacitet',
        radius: 'Rundade hörn', box_pad: 'Utfyllnad', shadow: 'Skugga', shadow_opacity: 'Skuggans opacitet',
        hint_drag: 'Dra för att flytta · handtagen ändrar storlek · dubbelklicka för att återställa · piltangenterna knuffar',
        hint_touch: 'Tryck för att välja, dra sedan',
        warn_overflow: 'En del text hamnar utanför kortet.',
        warn_frame: 'En del text får inte plats i sin textruta.',
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
    dark:  { bg: '#0d0d0d', paper: '#000000', fg: 'rgba(255,255,255,0.86)', fgBody: 'rgba(255,255,255,0.72)', title: '#ffffff', date: '#a1a1a1', fgHex: '#dbdbdb', bodyHex: '#b8b8b8' },
    light: { bg: '#f4f3ee', paper: '#ffffff', fg: 'rgba(0,0,0,0.86)',       fgBody: 'rgba(0,0,0,0.72)',       title: '#000000', date: '#666666', fgHex: '#242424', bodyHex: '#474747' }
};
var STYLE = {
    tracking: 0.10,      // letter spacing, as a fraction of the date's size
    lineHeight: 1.01,    // description line height
    titleLine: 1.14,     // title (and wrapped date / author) line height
    capTop: 0.62,        // first baseline below the top of a text box, as a fraction of the size
    bannerBody: 0.12,
    separatorOp: 0.3,    // the line under the title
    listGap: -0.7
};
var STD = ['graphic', 'date', 'author', 'title', 'desc'];    // default stacking order, bottom first
var STD_TEXT = ['date', 'author', 'title', 'desc'];
var COLOR_KEYS = ['title', 'date', 'author', 'graphic', 'body', 'accent'];

// ==========================================================================
// The document
// ==========================================================================
// Box sizes are in em of the text they sit behind.
var BOX_DEFAULTS = { on: false, fill: '', fillOp: 0.5, blur: 0, border: 0, borderColor: '', borderOp: 1, radius: 0.3, pad: 0.6, shadow: 0, shadowOp: 0.4 };
function blankColors() { return { title: '', date: '', author: '', graphic: '', body: '', accent: '' }; }
// role: 'date' | 'author' | 'title' | 'desc' (one each) or 'text' (a text layer)
function textDefaults(role) {
    var o = {
        id: role === 'text' ? '' : role, type: 'text', role: role, hidden: false, auto: role !== 'text',
        dx: 0, dy: 0, x: 0.25, y: 0.4, w: 0.5, h: 0,
        size: 1, align: role === 'text' ? 'left' : '', valign: 'top', font: '', ls: 1, lh: 1,
        box: clone(BOX_DEFAULTS)
    };
    if (role === 'date') o.lang = uiLang;
    if (role === 'title') o.rule = true;
    if (role === 'author') o.pos = 'opposite';
    if (role === 'desc') { o.columns = 1; o.justify = true; }
    if (role === 'text') { o.text = ''; o.columns = 1; o.justify = false; o.color = ''; o.accent = ''; }
    return o;
}
function graphicDefaults() {
    return { id: 'graphic', type: 'graphic', hidden: false, auto: true, dx: 0, dy: 0, x: 0.5, y: 0.5, size: 1, opacity: 1, kind: 'ring', logo: 0 };
}
function imageDefaults() {
    return { id: '', type: 'image', img: '', hidden: false, x: 0.5, y: 0.5, size: 0.4, opacity: 1 };
}
function defaultItem(id) { return id === 'graphic' ? graphicDefaults() : textDefaults(id); }
function lookDefaults() {
    return {
        theme: 'dark', align: 'left', fontScale: 1.5, padScale: 1, padRatio: 0,
        colors: { dark: blankColors(), light: blankColors() },
        bg: { hidden: false, src: '', opacity: 0.3, zoom: 1, px: 0, py: 0 },
        items: STD.map(defaultItem)
    };
}
function docDefaults() {
    var d = { v: 2, template: 'classic', title: '', author: '', desc: '', date: isoDate(new Date()), format: '1080p', fileType: 'jpg' };
    var look = lookDefaults();
    Object.keys(look).forEach(function (k) { d[k] = look[k]; });
    return d;
}
var LOOK_KEYS = Object.keys(lookDefaults());
function isCustomText(it) { return it && it.type === 'text' && it.role === 'text'; }

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
    raw = raw && typeof raw === 'object' ? raw : {};
    var defs = docDefaults();
    defs.items = [];
    var d = merge(defs, raw);
    d.v = 2;
    d.theme = oneOf(d.theme, ['dark', 'light'], 'dark');
    d.align = oneOf(d.align, ['left', 'center', 'right'], 'left');
    if (!findFormat(d.format)) d.format = '1080p';
    d.fileType = oneOf(d.fileType, ['jpg', 'png', 'png_transp'], 'jpg');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) d.date = isoDate(new Date());
    d.fontScale = clamp(d.fontScale, 0.5, 8);
    d.padScale = clamp(d.padScale, 0, 5);
    d.padRatio = clamp(d.padRatio, -0.9, 0.9);
    ['dark', 'light'].forEach(function (th) {
        COLOR_KEYS.forEach(function (k) { if (!isHex(d.colors[th][k])) d.colors[th][k] = ''; });
    });
    d.bg.opacity = clamp(d.bg.opacity, 0, 1);
    d.bg.zoom = clamp(d.bg.zoom, 1, 4);
    d.bg.px = clamp(d.bg.px, -1, 1);
    d.bg.py = clamp(d.bg.py, -1, 1);
    d.items = normalizeItems(raw.items);
    return d;
}
// Keep what is valid, one of each standard element (a missing one comes back
// in its default place), at most MAX_LAYERS image and text layers each.
function normalizeItems(list) {
    var out = [], seen = { bg: true }, nImg = 0, nTxt = 0;
    (Array.isArray(list) ? list : []).forEach(function (r) {
        if (!r || typeof r !== 'object') return;
        var it = null;
        if (r.type === 'graphic') it = normGraphic(r);
        else if (r.type === 'text' && STD_TEXT.indexOf(r.id) >= 0 && (r.role === undefined || r.role === r.id)) it = normText(r, r.id);
        else if (r.type === 'text' && r.role === 'text' && nTxt < MAX_LAYERS) { it = normText(r, 'text'); nTxt++; }
        else if (r.type === 'image' && typeof r.img === 'string' && r.img && nImg < MAX_LAYERS) { it = normImage(r); nImg++; }
        if (!it) return;
        if (STD.indexOf(it.id) >= 0 && (it.type === 'graphic' || !isCustomText(it))) {
            if (seen[it.id]) return;
        } else if (typeof it.id !== 'string' || !/^[a-z][a-z0-9]{0,24}$/.test(it.id) || seen[it.id] || STD.indexOf(it.id) >= 0) {
            it.id = newId(it.type === 'image' ? 'l' : 't');
        }
        seen[it.id] = true;
        out.push(it);
    });
    STD.forEach(function (id) {
        if (seen[id]) return;
        if (id === 'graphic') out.unshift(defaultItem(id));
        else out.push(defaultItem(id));
    });
    return out;
}
function normBox(b) {
    b.fillOp = clamp(b.fillOp, 0, 1);
    b.blur = clamp(b.blur, 0, 3);
    b.border = clamp(b.border, 0, 0.5);
    b.borderOp = clamp(b.borderOp, 0, 1);
    b.radius = clamp(b.radius, 0, 3);
    b.pad = clamp(b.pad, 0, 3);
    b.shadow = clamp(b.shadow, 0, 3);
    b.shadowOp = clamp(b.shadowOp, 0, 1);
    if (!isHex(b.fill)) b.fill = '';
    if (!isHex(b.borderColor)) b.borderColor = '';
    return b;
}
function normText(r, role) {
    var n = merge(textDefaults(role), r);
    n.type = 'text';
    n.role = role;
    if (role !== 'text') n.id = role;
    else n.auto = false;
    n.dx = clamp(n.dx, -2, 2);
    n.dy = clamp(n.dy, -2, 2);
    n.x = clamp(n.x, -1, 2);
    n.y = clamp(n.y, -1, 2);
    n.w = clamp(n.w, 0.02, 3);
    n.h = n.h > 0 ? clamp(n.h, 0.01, 3) : 0;
    n.size = clamp(n.size, 0.2, 5);
    n.ls = clamp(n.ls, 0, 4);
    n.lh = clamp(n.lh, 0.5, 3);
    n.align = role === 'text' ? oneOf(n.align, ['left', 'center', 'right'], 'left') : oneOf(n.align, ['', 'left', 'center', 'right'], '');
    n.valign = oneOf(n.valign, ['top', 'middle', 'bottom'], 'top');
    if (!/^(mono|text|f[a-z0-9]{1,24})$/.test(n.font)) n.font = '';
    n.box = normBox(n.box);
    if (role === 'date') n.lang = oneOf(n.lang, ['en', 'sv'], 'en');
    if (role === 'author') n.pos = oneOf(n.pos, ['opposite', 'diagonal'], 'opposite');
    if (role === 'desc' || role === 'text') n.columns = clamp(Math.round(n.columns), 1, 3);
    if (role === 'text') {
        n.text = n.text.slice(0, MAX_TEXT);
        if (!isHex(n.color)) n.color = '';
        if (!isHex(n.accent)) n.accent = '';
    }
    return n;
}
function normGraphic(r) {
    var n = merge(graphicDefaults(), r);
    n.id = 'graphic';
    n.dx = clamp(n.dx, -2, 2);
    n.dy = clamp(n.dy, -2, 2);
    n.x = clamp(n.x, -1, 2);
    n.y = clamp(n.y, -1, 2);
    n.size = clamp(n.size, 0.2, 5);
    n.opacity = clamp(n.opacity, 0, 1);
    n.kind = oneOf(n.kind, ['ring', 'logo'], 'ring');
    n.logo = clamp(Math.round(n.logo), 0, LOGOS.length - 1);
    return n;
}
function normImage(r) {
    var n = merge(imageDefaults(), r);
    n.x = clamp(n.x, -1, 2);
    n.y = clamp(n.y, -1, 2);
    n.size = clamp(n.size, 0.02, 3);
    n.opacity = clamp(n.opacity, 0, 1);
    return n;
}

// A card (or a template's look) from the first version of the editor, in
// this version's shape; normalize() does the checking. Its moves stay offsets
// from the automatic layout (dx, dy), so it looks exactly as it did.
function fromV1(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var E = raw.els && typeof raw.els === 'object' ? raw.els : {};
    function std(id, keys) {
        var s = E[id] && typeof E[id] === 'object' ? E[id] : {};
        var o = { id: id, type: id === 'graphic' ? 'graphic' : 'text', auto: true };
        if (id !== 'graphic') o.role = id;
        ['hidden', 'dx', 'dy', 'size'].concat(keys).forEach(function (k) { if (k in s) o[k] = s[k]; });
        return o;
    }
    function img(l) { return { id: l.id, type: 'image', img: l.img, hidden: l.hidden, x: l.x, y: l.y, size: l.size, opacity: l.opacity }; }
    var layers = Array.isArray(raw.layers) ? raw.layers.filter(function (l) { return l && typeof l === 'object'; }) : [];
    var out = {};
    ['template', 'title', 'author', 'desc', 'date', 'format', 'fileType', 'theme', 'align', 'fontScale', 'padScale', 'padRatio', 'colors', 'bg']
        .forEach(function (k) { if (k in raw) out[k] = raw[k]; });
    // The first version drew: graphic, images under the text, date, author,
    // title, description, images above the text.
    out.items = [std('graphic', ['opacity', 'kind', 'logo'])]
        .concat(layers.filter(function (l) { return !l.front; }).map(img))
        .concat([std('date', ['lang']), std('author', ['pos']), std('title', ['rule']), std('desc', ['columns', 'justify'])])
        .concat(layers.filter(function (l) { return l.front; }).map(img));
    return out;
}
function pickLook(d, withTextLayers) {
    var look = {};
    LOOK_KEYS.forEach(function (k) { look[k] = clone(d[k]); });
    if (!withTextLayers) look.items = look.items.filter(function (it) { return !isCustomText(it); });
    return look;
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

// ==========================================================================
// Templates. A template sets the look and the layout; the text (Content and
// text layers) is yours and stays when you switch.
// ==========================================================================
// Built-in templates are the looks the old event card could make.
var BUILTIN = [
    { id: 'classic', name: 'tpl_classic', look: {} },
    { id: 'centered', name: 'tpl_centered', look: { align: 'center', items: { graphic: { hidden: true } } } },
    { id: 'right', name: 'tpl_right', look: { align: 'right', items: { author: { pos: 'diagonal' } } } },
    { id: 'logo', name: 'tpl_logo', look: { items: { graphic: { kind: 'logo', logo: 0 } } } },
    { id: 'paper', name: 'tpl_paper', look: { theme: 'light', bg: { src: 'p3', opacity: 0.05 } } },
    { id: 'columns', name: 'tpl_columns', look: { fontScale: 1.2, items: { desc: { columns: 2 } } } }
];
var tplSeenV1 = [];           // first-version templates already carried over (and maybe deleted since)
function findTemplate(id) {
    var list = BUILTIN.concat(templates);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
}
function templateLook(tpl) {
    var look = lookDefaults();
    if (tpl.user) {
        var L = clone(tpl.look || {});
        LOOK_KEYS.forEach(function (k) { if (k in L) look[k] = L[k]; });
        look.items = (Array.isArray(look.items) ? look.items : []).filter(function (it) { return !isCustomText(it); });
    } else {
        var P = clone(tpl.look);
        Object.keys(P).forEach(function (k) {
            if (k === 'items') {
                Object.keys(P.items).forEach(function (id) {
                    look.items.forEach(function (it) { if (it.id === id) assignLook(it, P.items[id]); });
                });
            } else if (look[k] && typeof look[k] === 'object') assignLook(look[k], P[k]);
            else look[k] = P[k];
        });
    }
    return look;
}
// Saved templates, plus any first-version template not carried over yet (a
// tab still running the first version can save one at any time).
function readTemplates() {
    var s = readJSON(KEY_TPL), list = s && Array.isArray(s.list) ? s.list : [], added = false;
    tplSeenV1 = s ? strList(s.v1seen) : [];
    var old = readJSON(KEY_TPL_V1);
    if (Array.isArray(old)) old.forEach(function (x) {
        if (!x || typeof x.id !== 'string' || typeof x.name !== 'string' || !x.look || tplSeenV1.indexOf(x.id) >= 0) return;
        tplSeenV1.push(x.id);
        var look = {}, v2 = fromV1(x.look);
        LOOK_KEYS.forEach(function (k) { if (k in v2) look[k] = v2[k]; });
        list.push({ id: x.id, name: x.name, look: look, format: x.format, fileType: x.fileType });
        added = true;
    });
    list = list.filter(function (x) { return x && typeof x.id === 'string' && typeof x.name === 'string' && x.look && typeof x.look === 'object'; })
        .map(function (x) { return { id: x.id, name: x.name, look: x.look, format: x.format, fileType: x.fileType, user: true }; });
    if (added) writeTemplates(list);
    return list;
}
function writeTemplates(list) {
    return writeJSON(KEY_TPL, {
        v: 2, v1seen: tplSeenV1,
        list: list.map(function (x) { return { id: x.id, name: x.name, look: x.look, format: x.format, fileType: x.fileType }; })
    });
}

// ==========================================================================
// IndexedDB: added images and fonts (opened only once one is involved, so a
// plain visit creates no database)
// ==========================================================================
var dbs = {};
function openDb(name, store) {
    if (!dbs[name]) {
        dbs[name] = new Promise(function (resolve, reject) {
            var req = indexedDB.open(name, 1);
            req.onupgradeneeded = function () { req.result.createObjectStore(store, { keyPath: 'id' }); };
            req.onsuccess = function () {
                var d = req.result;
                // Step aside if a later version of this page upgrades the
                // database, instead of blocking it until this tab closes.
                d.onversionchange = function () { d.close(); dbs[name] = null; };
                resolve(d);
            };
            req.onerror = function () { reject(req.error); };
            req.onblocked = function () { reject(new Error('blocked')); };
        });
        dbs[name].catch(function () { dbs[name] = null; });
    }
    return dbs[name];
}
function idb(name, store, mode, fn) {
    return openDb(name, store).then(function (d) {
        return new Promise(function (resolve, reject) {
            var tx = d.transaction(store, mode), req = fn(tx.objectStore(store));
            tx.oncomplete = function () { resolve(req && req.result); };
            tx.onerror = tx.onabort = function () { reject(tx.error); };
        });
    });
}
function imgStore(mode, fn) { return idb(IMG_DB, 'images', mode, fn); }
function fontStore(mode, fn) { return idb(FONT_DB, 'fonts', mode, fn); }

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

// User images live in IndexedDB (records { id, src: data: URL, thumb, w, h },
// the same as in the first version); `lib` holds the records read so far.
var lib = {};                 // id -> record
var imageIds = [];            // ids of all added images, oldest first
var removedIds = {};
var pendingRec = {};
function userAsset(id) {
    var key = 'img:' + id;
    if (assets[key]) return assets[key];
    var rec = lib[id];
    if (rec) return loadImage(key, rec.src, rec.w / rec.h);
    if (!pendingRec[id]) {
        pendingRec[id] = imgStore('readonly', function (st) { return st.get(id); }).then(function (r) {
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
var libraryLoaded = false;
function loadLibrary() {
    if (libraryLoaded || !imageIds.length) { libraryLoaded = true; return Promise.resolve(); }
    return imgStore('readonly', function (st) { return st.getAll(); }).then(function (rows) {
        (rows || []).forEach(function (r) { if (r && typeof r.id === 'string') lib[r.id] = r; });
        // The database is the full list (a tab running the first version may
        // have added images since); ids sort by the time they were made.
        imageIds = Object.keys(lib).filter(function (id) { return !removedIds[id]; }).sort();
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
        return imgStore('readwrite', function (st) { return st.put(rec); }).then(function () {
            lib[rec.id] = rec;
            imageIds.push(rec.id);
            save();
            return rec;
        });
    });
}
// Canvases are given back (size 0) as soon as they are done with: iOS counts
// canvas memory until garbage collection and then refuses new canvases.
function freeCanvas(c) { if (c) { c.width = 0; c.height = 0; } }
function hasAlpha(img) {
    var c = document.createElement('canvas');
    c.width = c.height = 48;
    var x = c.getContext('2d');
    x.drawImage(img, 0, 0, 48, 48);
    var px = x.getImageData(0, 0, 48, 48).data, found = false;
    for (var i = 3; i < px.length; i += 4) if (px[i] < 250) { found = true; break; }
    freeCanvas(c);
    return found;
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
    var rec = {
        id: newId('i'),
        src: alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.9),
        thumb: alpha ? th.toDataURL('image/png') : th.toDataURL('image/jpeg', 0.75),
        w: c.width,
        h: c.height
    };
    freeCanvas(c);
    freeCanvas(th);
    return rec;
}
function removeImage(id) {
    imgStore('readwrite', function (st) { return st.delete(id); }).catch(noop);
    delete lib[id];
    delete assets['img:' + id];
    removedIds[id] = true;
    imageIds = imageIds.filter(function (x) { return x !== id; });
    if (doc.bg.src === id) doc.bg.src = '';
    doc.items = doc.items.filter(function (it) { return !(it.type === 'image' && it.img === id); });
    if (sel && !selExists(sel)) sel = null;
    commit();
    refreshAll();
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

// ==========================================================================
// Fonts. The bundled ones come from clock.css; added ones are read from
// their bytes (FontFace from an ArrayBuffer is not a fetch, so the CSP's
// font-src does not apply — a blob: URL would be blocked by it). Each gets a
// family name of its own (rvcf-<id>) and is scaled so its capitals are as
// tall as Harald's (.486 em): sizes, line spacing and the markdown's
// underlines then fit any font.
// ==========================================================================
var FONT_MONO = { key: 'mono', fam: 'HaraldMono, monospace', k: 1 };
var FONT_TEXT = { key: 'text', fam: 'HaraldText, sans-serif', k: 1 };
var fontLib = {};             // id -> { id, name, family, ok, failed, k, face, promise }
var fontIds = [];             // ids of the added fonts, oldest first
var removedFonts = {};
var fontsListed = false;
var fontEpoch = 0;            // bumped when a font arrives: text is laid out again
function fontByKey(key, fallback) {
    if (key === 'mono') return FONT_MONO;
    if (key === 'text') return FONT_TEXT;
    var f = fontLib[key];
    if (!f || !f.ok) return null;
    return { key: key, fam: '"' + f.family + '", ' + (fallback === 'mono' ? FONT_MONO.fam : FONT_TEXT.fam), k: f.k };
}
function itemFonts(it) {
    var def = it.role === 'desc' || it.role === 'text' ? 'text' : 'mono', key = it.font || def;
    var body = fontByKey(key, def);
    if (!body) body = fontByKey(def);
    // Markdown headings are in Harald Mono beside Harald Text (the old card),
    // and in the chosen font otherwise.
    return { body: body, head: body === FONT_TEXT ? FONT_MONO : body, mono: FONT_MONO };
}
function capScale(family) {
    var c = measurer();
    c.font = '100px "' + family + '"';
    setTracking(c, 0);
    var a = c.measureText('H').actualBoundingBoxAscent;
    return a > 5 ? clamp(48.6 / a, 0.35, 2.5) : 1;
}
function registerFont(rec) {
    if (fontLib[rec.id]) return fontLib[rec.id];
    var f = fontLib[rec.id] = { id: rec.id, name: rec.name || 'Font', family: 'rvcf-' + rec.id, ok: false, failed: false, k: 1 };
    var face;
    try { face = new FontFace(f.family, rec.data.slice(0)); } catch (e) { f.failed = true; f.promise = Promise.resolve(null); return f; }
    f.promise = face.load().then(function () {
        document.fonts.add(face);
        f.face = face;
        f.k = capScale(f.family);
        f.ok = true;
        fontEpoch++;
        schedule();
        fontsChanged();
        return f;
    }, function () { f.failed = true; return null; });
    return f;
}
function loadFonts() {
    if (fontsListed || !fontIds.length) { fontsListed = true; return Promise.resolve(); }
    fontsListed = true;
    return fontStore('readonly', function (st) { return st.getAll(); }).then(function (rows) {
        (rows || []).forEach(function (r) { if (r && typeof r.id === 'string' && r.data && !removedFonts[r.id]) registerFont(r); });
        fontIds = Object.keys(fontLib).filter(function (id) { return !removedFonts[id]; }).sort();
        fontsChanged();
        return Promise.all(fontIds.map(function (id) { return fontLib[id].promise; }));
    }, noop);
}
function readBuffer(file) {
    if (file.arrayBuffer) return file.arrayBuffer();
    return new Promise(function (resolve, reject) {
        var r = new FileReader();
        r.onload = function () { resolve(r.result); };
        r.onerror = reject;
        r.readAsArrayBuffer(file);
    });
}
function fontName(n) {
    return String(n || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 40) || 'Font';
}
function importFont(file) {
    if (!file) return Promise.reject(new Error('none'));
    if (file.size > MAX_FONT_BYTES) return Promise.reject(new Error('size'));
    return readBuffer(file).then(function (buf) {
        var rec = { id: newId('f'), name: fontName(file.name), data: buf, size: buf.byteLength };
        var f = registerFont(rec);
        return f.promise.then(function (ok) {
            if (!ok) { delete fontLib[rec.id]; throw new Error('font'); }
            return fontStore('readwrite', function (st) { return st.put(rec); }).then(function () {
                fontIds.push(rec.id);
                fontsListed = true;
                save();
                return f;
            });
        });
    });
}
function removeFont(id) {
    var f = fontLib[id];
    fontStore('readwrite', function (st) { return st.delete(id); }).catch(noop);
    if (f && f.face) { try { document.fonts.delete(f.face); } catch (e) { /* already gone */ } }
    delete fontLib[id];
    removedFonts[id] = true;
    fontIds = fontIds.filter(function (x) { return x !== id; });
    doc.items.forEach(function (it) { if (it.type === 'text' && it.font === id) it.font = ''; });
    fontEpoch++;
    commit();
    refreshAll();
}
// Fonts used by what is shown, loaded (the export waits for them).
function fontsFor(d) {
    var list = [];
    d.items.forEach(function (it) {
        if (it.type !== 'text' || it.hidden || !/^f/.test(it.font)) return;
        list.push(fontLib[it.font] ? fontLib[it.font].promise : loadFonts());
    });
    return Promise.all(list);
}
function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([
        document.fonts.load('400 40px HaraldMono'),
        document.fonts.load('400 40px HaraldText'),
        document.fonts.load('italic 400 40px HaraldText')
    ]).catch(noop);
}

// ==========================================================================
// Text layout, in card pixels. Text is measured on a canvas of its own (a
// width does not depend on the canvas or its scale), laid out once per
// change and cached; painting only replays the result.
// ==========================================================================
function setTracking(ctx, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; }
var mctx = null;
function measurer() {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    return mctx;
}
var layoutCache = new Map();
function cached(key, make) {
    var v = layoutCache.get(key);
    if (v) return v;
    if (layoutCache.size > 150) layoutCache.clear();
    v = make();
    layoutCache.set(key, v);
    return v;
}

// Title, date and author: words wrapped to the width, each line drawn whole.
function layoutPlain(text, font, track, maxW) {
    return cached(JSON.stringify(['p', fontEpoch, text, font, track, maxW]), function () {
        var c = measurer(), words = text.split(' '), lines = [], line = '', test;
        c.font = font;
        setTracking(c, track);
        for (var i = 0; i < words.length; i++) {
            test = line ? line + ' ' + words[i] : words[i];
            if (c.measureText(test).width > maxW && line) { lines.push(line); line = words[i]; }
            else line = test;
        }
        if (line) lines.push(line);
        var widths = lines.map(function (l) { return c.measureText(l).width; });
        return { lines: lines, widths: widths, maxW: Math.max.apply(null, widths.concat(0)) };
    });
}

/* ─── Markdown (the old card's parser and layout) ─── */
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

function mdFont(type, size, forceMono, F) {
    var fb = forceMono ? F.head : F.body;
    if (type === 'code') return '400 ' + (size * 0.91 * F.mono.k) + 'px ' + F.mono.fam;
    if (type === 'italic') return 'italic 400 ' + (size * fb.k) + 'px ' + fb.fam;
    if (type === 'footnoteref') return '400 ' + (size * 0.7 * fb.k) + 'px ' + fb.fam;
    return '400 ' + (size * fb.k) + 'px ' + fb.fam;
}

// Word-wrap tokens into lines of draw operations (the old card's
// drawTokensWrapped, recorded instead of drawn). y is the first baseline;
// returns the lines and the baseline after the last one.
function wrapTokens(c, tokens, x0, y, maxW, lh, size, bodyColor, S, justify, forceMono, alignOverride) {
    var align = alignOverride || S.align, codeCol = S.accent, isDark = S.isDark;
    var units = [], lines = [], lineUnits = [], lineW = 0;
    tokens.forEach(function (tok) {
        tok.s.split(/(\s+)/).forEach(function (p) { if (p) units.push({ text: p, type: tok.t }); });
    });
    units.forEach(function (u) {
        u.font = mdFont(u.type, size, forceMono, S.F);
        c.font = u.font;
        u.w = c.measureText(u.text).width;
        u.space = /^\s+$/.test(u.text);
    });
    function flush(isLast) {
        if (!lineUnits.length) return;
        var lx = x0, extraSpace = 0, ops = [];
        if (justify && !isLast) {
            var spaceCount = lineUnits.filter(function (u) { return u.space; }).length;
            if (spaceCount > 0) extraSpace = Math.max(0, (maxW - lineW)) / spaceCount;
        } else if (align === 'center') {
            lx = x0 + (maxW - lineW) / 2;
        } else if (align === 'right') {
            lx = x0 + (maxW - lineW);
        }
        // Pass 1: one continuous pill behind runs of code / highlight
        var p1 = lx, bgType = null, bgStartX = p1, bgWidth = 0;
        function pill(type, startX, width) {
            var p = size * 0.18;
            ops.push({ k: 'pill', x: startX - p, y: y - size * 0.88, w: width + p * 2, h: size * 1.2, r: size * 0.22,
                color: type === 'code' ? (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)') : codeCol,
                alpha: type === 'code' ? 1 : (isDark ? 0.22 : 0.28) });
        }
        lineUnits.forEach(function (u) {
            var spc = u.space ? extraSpace : 0;
            if (u.type === 'code' || u.type === 'highlight') {
                if (bgType === u.type) bgWidth += u.w + spc;
                else {
                    if (bgType) pill(bgType, bgStartX, bgWidth);
                    bgType = u.type;
                    bgStartX = p1;
                    bgWidth = u.w + spc;
                }
            } else if (bgType) {
                pill(bgType, bgStartX, bgWidth);
                bgType = null;
            }
            p1 += u.w + spc;
        });
        if (bgType) pill(bgType, bgStartX, bgWidth);
        // Pass 2: text and its lines (spaces draw nothing but carry lines)
        lineUnits.forEach(function (u) {
            if (u.type === 'link') ops.push({ k: 'line', x1: lx, y1: y + size * 0.12, x2: lx + u.w, y2: y + size * 0.12, color: codeCol, lw: Math.max(0.5, size * 0.05) });
            if (!u.space) ops.push({ k: 'text', s: u.text, x: lx, y: u.type === 'footnoteref' ? y - size * 0.35 : y, font: u.font,
                color: u.type === 'code' || u.type === 'link' ? codeCol : bodyColor, align: 'left' });
            if (u.type === 'bold') ops.push({ k: 'line', x1: lx, y1: y + size * 0.11, x2: lx + u.w, y2: y + size * 0.11, color: bodyColor, lw: Math.max(0.5, size * 0.038) });
            else if (u.type === 'strikethrough') ops.push({ k: 'line', x1: lx, y1: y - size * 0.25, x2: lx + u.w, y2: y - size * 0.25, color: bodyColor, lw: Math.max(0.5, size * 0.05) });
            lx += u.w;
            if (u.space) lx += extraSpace;
        });
        lines.push({ base: y, ops: ops });
        lineUnits = [];
        lineW = 0;
        y += lh;
    }
    units.forEach(function (unit) {
        if (lineW + unit.w > maxW && lineUnits.length > 0 && !unit.space) {
            if (lineUnits[lineUnits.length - 1].space) lineW -= lineUnits.pop().w;
            flush(false);
        }
        if (lineUnits.length === 0 && unit.space) return;
        lineUnits.push(unit);
        lineW += unit.w;
    });
    flush(true);
    return { lines: lines, y: y };
}

// A markdown text as a list of boxes: one per line (a list marker rides on
// its item's first line), one per table row, one per rule. Columns may only
// break between boxes. A box: { top, bottom, ops, keepNext, deco }; boxes of
// one table or quote share a `deco` (its grid or bar is drawn per column run).
// Coordinates start at (S.x0, S.y0): 0, 0 for a frame of its own, and the
// old card's own starting point for the automatic layout — the positions are
// then summed exactly as it summed them, so the text lands on the same pixels
// (browsers snap baselines, and a sum 1e-13 off can round the other way).
function layoutMarkdown(md, S) {
    return cached(JSON.stringify(['m', fontEpoch, md, S.size, S.maxW, S.x0, S.y0, S.align, S.justify, S.lh, S.track,
        S.F.body.fam, S.F.body.k, S.F.head.fam, S.fg, S.fgBody, S.accent, S.isDark]), function () { return buildMarkdown(md, S); });
}
function buildMarkdown(md, S) {
    var c = measurer(), base = S.size, maxW = S.maxW, x = S.x0, y = S.y0, boxes = [], gid = 0;
    var fg = S.fg, fgBody = S.fgBody, accent = S.accent, isDark = S.isDark, LH = STYLE.lineHeight * S.lh, mono = S.F.mono;
    setTracking(c, S.track);
    // Lists, tasks and footnotes: marker on the left (or right when the
    // text is right-aligned), text beside it.
    function listGeom(block, gap) {
        var indentPad = (block.indent || 0) * base * 1.5, isRight = S.align === 'right';
        if (isRight) return { isRight: true, textX0: x, textMaxW: maxW - indentPad - base * gap, edge: x + maxW - indentPad };
        return { isRight: false, textX0: x + indentPad + base * gap, textMaxW: maxW - indentPad - base * gap, edge: x + indentPad };
    }
    var listAlign = S.align === 'center' ? 'left' : S.align;
    // One box per line; `marker` goes with the first line (or stands alone
    // when the item has no text, on the line it would have had).
    function lineBoxes(r, size, lh, marker, emptyBase) {
        r.lines.forEach(function (ln, i) {
            var top = ln.base - size * STYLE.capTop;
            boxes.push({ top: top, bottom: top + lh, ops: i === 0 && marker ? marker.concat(ln.ops) : ln.ops });
        });
        if (!r.lines.length && marker) {
            var t0 = emptyBase - size * STYLE.capTop;
            boxes.push({ top: t0, bottom: t0 + lh, ops: marker });
        }
    }
    parseBlocks(md).forEach(function (block) {
        var tokens = tokenize(block.text || ''), g, r, lh, ops;
        switch (block.type) {
            case 'h1':
            case 'h2':
            case 'h3': {
                var sz = base * (block.type === 'h1' ? 1.75 : block.type === 'h2' ? 1.45 : 1.22);
                lh = sz * LH;
                y += sz * (block.type === 'h1' ? 0.4 : block.type === 'h2' ? 0.3 : 0.25);
                var headerTokens = tokens.map(function (tk) { return { t: tk.t, s: tk.s.toUpperCase() }; });
                r = wrapTokens(c, headerTokens, x, y + sz, maxW, lh, sz, fg, S, false, true);
                lineBoxes(r, sz, lh);
                if (r.lines.length) boxes[boxes.length - 1].keepNext = true;     // no heading alone at a column's foot
                y = r.y;
                y -= sz * (block.type === 'h1' ? 0.55 : block.type === 'h2' ? 0.5 : 0.45);
                break;
            }
            case 'hr': {
                y += base * 0.6;
                boxes.push({ top: y - base * 0.6, bottom: y + base * 0.6, ops: [{ k: 'line', x1: x, y1: y, x2: x + maxW, y2: y,
                    color: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)', lw: Math.max(1, base * 0.05) }] });
                y += base * 0.6;
                break;
            }
            case 'blockquote': {
                y += base * 0.25;
                lh = base * LH;
                var bqStart = y, bq = { kind: 'bq', gid: ++gid, x: x + base * 0.4, lw: Math.max(1, base * 0.15),
                    color: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)' };
                r = wrapTokens(c, tokens, x + base * 1.2, y + base, maxW - base * 1.2, lh, base, fgBody, S, S.justify, false);
                // The bar runs from above the first line to below the last;
                // each line knows its piece, so a quote split over two
                // columns gets a bar in each.
                r.lines.forEach(function (ln, i) {
                    var top = ln.base - base * STYLE.capTop;
                    boxes.push({ top: top, bottom: top + lh, ops: ln.ops, deco: bq,
                        barTop: i === 0 ? bqStart + base * 0.2 : ln.base - base * 0.8,
                        barBottom: (i + 1 < r.lines.length ? r.lines[i + 1].base : r.y) - base * 0.2 });
                });
                if (!r.lines.length) boxes.push({ top: bqStart, bottom: bqStart + base, ops: [], deco: bq, barTop: bqStart + base * 0.2, barBottom: r.y - base * 0.2 });
                y = r.y + base * 0.2;
                break;
            }
            case 'p': {
                y += base * 0.25;
                lh = base * LH;
                r = wrapTokens(c, tokens, x, y + base, maxW, lh, base, fgBody, S, S.justify, false);
                lineBoxes(r, base, lh);
                y = r.y + base * 0.2;
                break;
            }
            case 'task': {
                y += base * 0.15;
                g = listGeom(block, 1.2);
                var cxBox = g.isRight ? g.edge - base * 0.75 : g.edge + base * 0.1, lwT = Math.max(1, base * 0.08);
                ops = [{ k: 'srect', x: cxBox, y: y + base * 0.25, w: base * 0.65, h: base * 0.65, color: accent, lw: lwT }];
                if (block.checked) ops.push({ k: 'path', color: accent, lw: lwT,
                    pts: [[cxBox + base * 0.15, y + base * 0.55], [cxBox + base * 0.30, y + base * 0.75], [cxBox + base * 0.55, y + base * 0.35]] });
                lh = base * LH;
                r = wrapTokens(c, tokens, g.textX0, y + base, g.textMaxW, lh, base, fgBody, S, false, false, listAlign);
                lineBoxes(r, base, lh, ops, y + base);
                y = r.y + base * STYLE.listGap;
                break;
            }
            case 'li': {
                y += base * 0.15;
                g = listGeom(block, 1.1);
                var odd = (block.indent || 0) % 2 === 1;
                ops = [{ k: 'arc', x: g.isRight ? g.edge - base * 0.42 : g.edge + base * 0.42, y: y + base * 1.0, r: base * 0.17,
                    color: accent, fill: !odd, lw: Math.max(1, base * 0.06) }];
                lh = base * LH;
                r = wrapTokens(c, tokens, g.textX0, y + base, g.textMaxW, lh, base, fgBody, S, false, false, listAlign);
                lineBoxes(r, base, lh, ops, y + base);
                y = r.y + base * STYLE.listGap;
                break;
            }
            case 'oli': {
                y += base * 0.15;
                g = listGeom(block, 1.45);
                ops = [{ k: 'text', s: block.n + '.', x: g.edge, y: y + base, font: '400 ' + (base * mono.k) + 'px ' + mono.fam,
                    color: accent, align: g.isRight ? 'right' : 'left' }];
                lh = base * LH;
                r = wrapTokens(c, tokens, g.textX0, y + base, g.textMaxW, lh, base, fgBody, S, false, false, listAlign);
                lineBoxes(r, base, lh, ops, y + base);
                y = r.y + base * STYLE.listGap;
                break;
            }
            case 'footnote': {
                y += base * 0.15;
                var idPad = base * 1.8, fnRight = S.align === 'right';
                ops = [{ k: 'text', s: '[' + block.id + ']', x: fnRight ? x + maxW : x, y: y + base * 0.95,
                    font: '400 ' + (base * 0.85 * mono.k) + 'px ' + mono.fam, color: accent, align: fnRight ? 'right' : 'left' }];
                lh = base * 1.05 * S.lh;
                r = wrapTokens(c, tokens, fnRight ? x : x + idPad, y + base, maxW - idPad, lh, base * 0.9, fgBody, S, false, false, listAlign);
                lineBoxes(r, base * 0.9, lh, ops, y + base);
                y = r.y + base * 0.05;
                break;
            }
            case 'table': {
                y += base * 0.5;
                var nCols = block.rows[0].length, cellW = maxW / nCols;
                var tg = { kind: 'table', gid: ++gid, x: x, maxW: maxW, nCols: nCols, cellW: cellW,
                    color: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)', lw: Math.max(1, base * 0.05) };
                lh = base * 1.12 * S.lh;
                // A row is one box: it never splits over two columns.
                block.rows.forEach(function (row, rIdx) {
                    var rowTop = y, rowMaxY = y, rops = [];
                    row.forEach(function (cell, cIdx) {
                        var cr = wrapTokens(c, tokenize(cell), x + cIdx * cellW + base * 0.4, y + base * 1.2, cellW - base * 0.8, lh, base,
                            rIdx === 0 ? fg : fgBody, S, false, false);
                        cr.lines.forEach(function (ln) { rops = rops.concat(ln.ops); });
                        if (cr.y > rowMaxY) rowMaxY = cr.y;
                    });
                    y = rowMaxY + base * 0.4;
                    rops.push({ k: 'line', x1: x, y1: y, x2: x + maxW, y2: y, color: tg.color, lw: tg.lw });
                    boxes.push({ top: rowTop, bottom: y, ops: rops, deco: tg });
                });
                y += base * 0.5;
                break;
            }
        }
    });
    var bottom = 0, maxBox = 0;
    boxes.forEach(function (b) {
        if (b.bottom > bottom) bottom = b.bottom;
        if (b.bottom - b.top > maxBox) maxBox = b.bottom - b.top;
    });
    return { boxes: boxes, top: boxes.length ? boxes[0].top : 0, bottom: bottom, maxBox: maxBox, bal: {} };
}

// Put the boxes into `cols` columns of height colH (0 = one column of any
// height). A box moves to the next column when it would end below colH,
// unless it already starts the column; a heading takes the line after it
// along. The last column takes whatever is left (and may overflow).
function placeFlow(L, cols, colH) {
    var B = L.boxes, placed = [], col = 0, dy = B.length ? -B[0].top : 0, bottoms = [0, 0, 0];
    for (var i = 0; i < B.length; i++) {
        var b = B[i];
        if (colH > 0 && col < cols - 1 && b.top + dy > 0.01) {
            var end = b.bottom;
            for (var j = i; B[j].keepNext && j + 1 < B.length; j++) end = B[j + 1].bottom;
            if (end + dy > colH) { col++; dy = -b.top; }
        }
        placed.push({ b: b, col: col, dy: dy });
        if (b.bottom + dy > bottoms[col]) bottoms[col] = b.bottom + dy;
    }
    var height = Math.max(bottoms[0], bottoms[1], bottoms[2]);
    return { placed: placed, height: height, over: colH > 0 && height > colH + 0.5 };
}
// The shortest column height that fits everything in `cols` columns.
function balancedHeight(L, cols) {
    if (L.bal[cols] !== undefined) return L.bal[cols];
    var total = L.bottom - L.top, lo = Math.max(L.maxBox, total / cols), hi = total;
    if (!placeFlow(L, cols, lo).over) hi = lo;
    else {
        for (var n = 0; n < 40 && hi - lo > 0.5; n++) {
            var mid = (lo + hi) / 2;
            if (placeFlow(L, cols, mid).over) lo = mid; else hi = mid;
        }
    }
    return (L.bal[cols] = hi);
}

// ==========================================================================
// Geometry: the template's automatic layout and each item's frame
// ==========================================================================
function itemOf(d, id) {
    for (var i = 0; i < d.items.length; i++) if (d.items[i].id === id) return d.items[i];
    return null;
}
// The old card's text sizes for this card size, times the template's text size.
function baseSizes(d, f) {
    var w = f.w, h = f.h, small = Math.min(w, h), titleSz, dateSz, bodySz;
    if (w / h > 2.6) {
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
    return { title: titleSz, date: dateSz, body: bodySz, track: dateSz * STYLE.tracking };
}
// '' = follow the card's alignment; the author sits opposite it.
function effAlign(d, it) {
    if (it.align) return it.align;
    if (it.role === 'author') return d.align === 'left' ? 'right' : d.align === 'right' ? 'left' : 'center';
    return d.align;
}
function isMarkdown(it) { return it.role === 'desc' || it.role === 'text'; }
function textStyle(d, it, SZ, col) {
    var th = THEMES[d.theme], s = { align: effAlign(d, it), F: itemFonts(it) }, r = it.role;
    if (r === 'title')      { s.size = SZ.title * it.size; s.track = SZ.track * it.size * it.ls; s.color = col.title; }
    else if (r === 'date')  { s.size = SZ.date * it.size;  s.track = s.size * STYLE.tracking * it.ls; s.color = col.date; }
    else if (r === 'author') { s.size = SZ.date * it.size; s.track = s.size * 0.08 * it.ls; s.color = col.author; }
    else {
        s.size = SZ.body * it.size;
        s.track = SZ.track * it.size * it.ls;
        var body = r === 'desc' ? col.body : it.color;
        s.fg = body ? body : th.fg;
        s.fgBody = body ? withAlpha(body, 0.84) : th.fgBody;
        s.accent = r === 'desc' ? col.accent : (it.accent || col.accent);
        s.color = s.fg;
    }
    if (!isMarkdown(it)) {
        s.font = '400 ' + (s.size * s.F.body.k) + 'px ' + s.F.body.fam;
        s.lh = s.size * STYLE.titleLine * it.lh;
    }
    return s;
}
function mdStyle(d, it, st, maxW, x0, y0) {
    return { size: st.size, maxW: maxW, x0: x0 || 0, y0: y0 || 0, align: st.align, justify: it.justify, lh: it.lh, track: st.track, F: st.F,
        fg: st.fg, fgBody: st.fgBody, accent: st.accent, isDark: d.theme === 'dark' };
}
function plainText(d, it) {
    if (it.role === 'title') return (d.title.trim() ? d.title : t('card_title_placeholder')).toUpperCase();
    if (it.role === 'date') return cardDate(parseIso(d.date), it.lang).toUpperCase();
    return d.author.trim().toUpperCase();
}
function frameAt(anchor, w, align) { return align === 'center' ? anchor - w / 2 : align === 'right' ? anchor - w : anchor; }

// Where the template puts the date, author, title and description: the old
// card's flow from the top (date, title, description), with the author
// opposite or in the corner. Frames in card px; base0/anchor are the exact
// first baseline and x the old card drew at.
function autoLayout(d, f, SZ, col) {
    var w = f.w, h = f.h, small = Math.min(w, h), isBanner = w / h > 2.6, isPortrait = h / w > 1.2;
    var D = itemOf(d, 'date'), Au = itemOf(d, 'author'), T = itemOf(d, 'title'), M = itemOf(d, 'desc');
    var dSz = SZ.date * D.size, aSz = SZ.date * Au.size, tSz = SZ.title * T.size, cols = M.columns;
    var padBase = (isBanner ? h * 0.17 : small * 0.074) * d.padScale;
    var padX = padBase * (1 + d.padRatio), padY = padBase * (1 - d.padRatio);
    var contentW = isBanner ? w * 0.50 : isPortrait ? w - padX * 2 : cols > 1 ? w - padX * 2 : w * 0.60;
    var y = isBanner ? (h - (dSz * 1.5 + tSz * 1.4)) / 2 : padY;
    var align = d.align, titleX = align === 'center' ? w / 2 : align === 'right' ? w - padX : padX;
    var boxX = align === 'center' ? (w - contentW) / 2 : align === 'right' ? w - padX - contentW : padX;
    var initialY = y, F = {}, dateShown = !D.hidden, st, pl;
    var A = { frames: F, pad: { x: padX, y: padY }, contentW: contentW, gap: padX * 0.5 };

    if (dateShown) {
        st = textStyle(d, D, SZ, col);
        pl = layoutPlain(plainText(d, D), st.font, st.track, Infinity);
        var dw = Math.max(contentW, pl.maxW);
        F.date = { x: dw > contentW ? frameAt(titleX, dw, align) : boxX, y: initialY + dSz * 0.28, w: dw, h: dSz * 0.8,
            base0: initialY + dSz * 0.9, anchor: titleX, align: align, nowrap: true };
        y += dSz * 1.08;
    }
    if (d.author.trim() && !Au.hidden) {
        var ax, aAlign, aY = initialY + aSz * 0.9;
        if (align === 'left') {
            ax = w - padX; aAlign = 'right';
            if (Au.pos === 'diagonal') aY = h - padY;
        } else if (align === 'right') {
            ax = padX; aAlign = 'left';
            if (Au.pos === 'diagonal') aY = h - padY;
        } else {
            ax = w / 2; aAlign = 'center'; aY = h - padY;
        }
        st = textStyle(d, Au, SZ, col);
        pl = layoutPlain(plainText(d, Au), st.font, st.track, Infinity);
        F.author = { x: frameAt(ax, pl.maxW, aAlign), y: aY - aSz * STYLE.capTop, w: pl.maxW, h: aSz * 0.8,
            base0: aY, anchor: ax, align: aAlign, nowrap: true };
    }
    if (!T.hidden) {
        if (!isBanner) y += dateShown ? tSz * 0.17 : -tSz * 0.36;
        st = textStyle(d, T, SZ, col);
        var firstBase = y + tSz;
        pl = layoutPlain(plainText(d, T), st.font, st.track, contentW);
        F.title = { x: boxX, y: firstBase - tSz * STYLE.capTop, w: contentW, h: pl.lines.length * st.lh + tSz * 0.04,
            base0: firstBase, anchor: titleX, align: align };
        y = firstBase;
        for (var i = 0; i < pl.lines.length; i++) y += st.lh;
        y -= tSz * 0.7;
        y += tSz * 0.4;
    }
    // The description (a banner has no room for it)
    if (d.desc.trim() && !isBanner && !M.hidden) {
        st = textStyle(d, M, SZ, col);
        var colW = cols > 1 ? (contentW - (cols - 1) * A.gap) / cols : contentW;
        var L = layoutMarkdown(d.desc, mdStyle(d, M, st, colW, boxX, y));
        if (L.boxes.length) {
            var fy = L.top, colH = 0, capped = false, fh;
            if (cols > 1) {
                // Balanced columns, but no lower than the bottom margin: then
                // the columns fill up to it and the last one runs over.
                var avail = Math.max(h - padY - fy, L.maxBox);
                colH = balancedHeight(L, cols);
                if (colH > avail) { colH = avail; capped = true; }
                fh = colH;
            } else fh = L.bottom - L.top;
            F.desc = { x: boxX, y: fy, w: contentW, h: fh, colH: colH, capped: capped, L: L };
        }
    }
    return A;
}

// Where the ring / logo goes: the old card's automatic placement, or its own.
function graphicGeom(d, f, G) {
    var w = f.w, h = f.h, small = Math.min(w, h);
    var isBanner = w / h > 2.6, isPortrait = h / w > 1.2;
    var R = isBanner ? h * 0.72 : isPortrait ? small * 0.54 : small * 0.56;
    var cx, cy;
    if (!G.auto)         { cx = G.x * w;         cy = G.y * h; }
    else if (isBanner)   { cx = w - R * 0.12 + G.dx * w; cy = h * 0.5 + G.dy * h; }
    else if (isPortrait) { cx = w * 0.5 + G.dx * w;      cy = h - R * 0.06 + G.dy * h; }
    else                 { cx = w - R * 0.15 + G.dx * w; cy = h - R * 0.08 + G.dy * h; }
    var r = R * G.size;
    return { cx: cx, cy: cy, r: r, logoSize: r * LOGOS[G.logo].scale };
}
function logoDrawnW(size, ar) { return ar >= 1 ? size : size * ar; }

// Everything needed to paint (and hit) one text item: its frame in card px,
// a first-version offset (ox, oy) and the laid-out text. null = not shown.
function textGeom(d, f, it, A, SZ, col) {
    var auto = it.auto && it.role !== 'text', af = auto ? A.frames[it.id] : null;
    if (auto && !af) return null;
    if (it.role === 'author' && !d.author.trim()) return null;
    if (it.role === 'desc' && !d.desc.trim()) return null;
    var st = textStyle(d, it, SZ, col), G = { it: it, st: st, auto: auto, ox: 0, oy: 0, over: false };
    var vf = { top: 0, middle: 0.5, bottom: 1 }[it.valign], fixedH = 0;
    if (auto) {
        G.ox = it.dx * f.w;
        G.oy = it.dy * f.h;
        G.x = af.x; G.y = af.y; G.w = af.w;
    } else {
        G.x = it.x * f.w; G.y = it.y * f.h; G.w = Math.max(4, it.w * f.w);
        fixedH = it.h > 0 ? it.h * f.h : 0;
    }
    if (!isMarkdown(it)) {
        var pl = layoutPlain(plainText(d, it), st.font, st.track, auto && af.nowrap ? Infinity : G.w);
        var n = pl.lines.length, contentH = it.role === 'title' ? n * st.lh + st.size * 0.04 : (n - 1) * st.lh + st.size * 0.8;
        var voff = fixedH > contentH ? (fixedH - contentH) * vf : 0, align = st.align;
        var exact = auto && align === af.align;
        G.h = auto ? af.h : (fixedH || contentH);
        G.over = fixedH > 0 && contentH > fixedH + 0.5;
        G.textW = pl.maxW;
        G.plain = {
            lines: pl.lines, align: align,
            base0: exact ? af.base0 : G.y + voff + st.size * STYLE.capTop,
            anchor: exact ? af.anchor : align === 'center' ? G.x + G.w / 2 : align === 'right' ? G.x + G.w : G.x
        };
        return G;
    }
    // Markdown: the description or a text layer, in 1–3 columns
    var cols = it.columns, gap = A.gap, colW = cols > 1 ? (G.w - (cols - 1) * gap) / cols : G.w;
    var L = auto ? af.L : layoutMarkdown(isCustomText(it) ? it.text : d.desc, mdStyle(d, it, st, colW)), colH, P, H;
    if (auto) {
        colH = af.colH;
        H = af.h;
        G.capped = af.capped;
    } else if (cols > 1) {
        colH = fixedH || (L.boxes.length ? balancedHeight(L, cols) : 0);
        H = fixedH || colH;
    } else {
        colH = fixedH;
        H = fixedH || (L.bottom - L.top);
    }
    P = placeFlow(L, cols, colH);
    var contentH1 = L.bottom - L.top;
    var voff2 = cols === 1 && fixedH > contentH1 ? (fixedH - contentH1) * vf : 0;
    G.h = Math.max(H, isCustomText(it) ? st.size : 0);     // an empty text layer can still be picked
    G.over = P.over;
    // Where column 0 is drawn: the automatic layout's text is already in
    // card coordinates; a frame's own text starts at 0, 0.
    G.flow = { L: L, P: P, colW: colW, gap: gap, abs: auto, y0: auto ? 0 : G.y + voff2 - L.top };
    return G;
}

// ==========================================================================
// Painting (card pixels; k = device pixels per card pixel)
// ==========================================================================
function roundRectPath(ctx, x, y, w, h, r) {
    if (r <= 0) { ctx.rect(x, y, w, h); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// Blur what is already painted under a box. Only drawImage: the area is
// shrunk by halves until one pixel spans about the radius and grown back the
// same way (each step a smooth bilinear average). No ctx.filter (not in
// Safari, so browsers would differ) and no pixel read-back (slow on old
// hardware, and garbled by some privacy modes).
// Work canvases are pooled by size: dragging redraws the same sizes every
// frame, and allocating canvases each time costs more than the blur itself.
var pool = new Map();
function poolCanvas(w, h) {
    var key = w + 'x' + h, c = pool.get(key);
    if (!c) {
        c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        pool.set(key, c);
    }
    var x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, w, h);
    x.imageSmoothingEnabled = true;
    return x;
}
function freePool() { pool.forEach(freeCanvas); pool.clear(); }
function freeShadows() { shadows.forEach(function (s) { freeCanvas(s.c); }); shadows.clear(); }
function freeBlur() { freePool(); freeShadows(); }
function backdropBlur(ctx, r, rad, radius, k) {
    var src = ctx.canvas, target = radius * k;
    // Whole device pixels, the same while a box is dragged (so are the work
    // canvases), cut to the card.
    var x0 = Math.round(r.x * k), y0 = Math.round(r.y * k), w = Math.round(r.w * k), h = Math.round(r.h * k);
    if (x0 < 0) { w += x0; x0 = 0; }
    if (y0 < 0) { h += y0; y0 = 0; }
    w = Math.min(w, src.width - x0);
    h = Math.min(h, src.height - y0);
    if (w < 2 || h < 2 || target < 1) return;
    if (pool.size > 30) freePool();
    var sizes = [[w, h]], cw = w, ch = h;
    while (cw > 2 && ch > 2 && w / cw < target && sizes.length < 14) {
        var s = Math.max(0.5, w / target / cw);
        var nw = Math.max(1, Math.round(cw * s)), nh = Math.max(1, Math.round(ch * s));
        if (nw === cw && nh === ch) break;
        cw = nw; ch = nh;
        sizes.push([cw, ch]);
    }
    if (sizes.length < 2) return;
    var cur = src, sx = x0, sy = y0, i, x;
    for (i = 1; i < sizes.length; i++) {
        x = poolCanvas(sizes[i][0], sizes[i][1]);
        x.drawImage(cur, sx, sy, sizes[i - 1][0], sizes[i - 1][1], 0, 0, sizes[i][0], sizes[i][1]);
        cur = x.canvas; sx = sy = 0;
    }
    // Growing back reuses each size's canvas (its shrunk copy is no longer needed).
    for (i = sizes.length - 2; i >= 1; i--) {
        x = poolCanvas(sizes[i][0], sizes[i][1]);
        x.drawImage(cur, 0, 0, sizes[i + 1][0], sizes[i + 1][1], 0, 0, sizes[i][0], sizes[i][1]);
        cur = x.canvas;
    }
    ctx.save();
    ctx.beginPath();
    roundRectPath(ctx, r.x, r.y, r.w, r.h, rad);
    ctx.clip();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(x0, y0, w, h);         // inside the clip only; nothing sharp shows through a transparent PNG
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(cur, 0, 0, sizes[1][0], sizes[1][1], x0, y0, w, h);
    ctx.restore();
}
// A box's shadow, drawn once per size into a canvas of its own and then
// only stamped (dragging a box does not blur it again; canvas shadows are
// slow). Device pixels: canvas shadows ignore the transform, so everything
// is scaled by k by hand. Only the part outside the box is kept, like a CSS
// box-shadow, so a see-through box is not darkened by its own shadow.
var shadows = new Map();
function shadowImage(w, h, rad, blur, offY, op) {
    var key = [w, h, rad, blur, offY, op].map(function (v) { return Math.round(v * 20) / 20; }).join('|');
    var s = shadows.get(key);
    if (s) return s;
    if (shadows.size > 16) freeShadows();
    var m = Math.ceil(blur * 1.5 + 2), c = document.createElement('canvas'), far = w + m * 4 + 100;
    c.width = Math.ceil(w + m * 2);
    c.height = Math.ceil(h + m * 2 + offY);
    var x = c.getContext('2d');
    // The shape is drawn far to the left and its shadow thrown into place.
    x.shadowColor = 'rgba(0,0,0,' + op + ')';
    x.shadowBlur = blur;
    x.shadowOffsetX = far;
    x.shadowOffsetY = offY;
    x.fillStyle = '#000';
    x.beginPath();
    roundRectPath(x, m - far, m, w, h, rad);
    x.fill();
    x.shadowColor = 'rgba(0,0,0,0)';
    x.globalCompositeOperation = 'destination-out';
    x.beginPath();
    roundRectPath(x, m, m, w, h, rad);
    x.fill();
    s = { c: x.canvas, m: m };
    shadows.set(key, s);
    return s;
}
// Shadow, blur, fill, border.
function drawBox(ctx, d, f, r, bx, em, textColor, k) {
    var th = THEMES[d.theme], rad = Math.min(bx.radius * em, r.w / 2, r.h / 2);
    // Shadow and blur need extra canvases; if the browser refuses one (iOS
    // does when its canvas memory is used up) the card is drawn without it.
    if (bx.shadow > 0 && bx.shadowOp > 0) {
        ctx.save();
        try {
            var sh = shadowImage(r.w * k, r.h * k, rad * k, bx.shadow * em * k, bx.shadow * em * 0.35 * k, bx.shadowOp);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.drawImage(sh.c, r.x * k - sh.m, r.y * k - sh.m);
        } catch (e) { freeShadows(); }
        ctx.restore();
    }
    if (bx.blur > 0) {
        try { backdropBlur(ctx, r, rad, bx.blur * em, k); } catch (e) { freePool(); }
    }
    if (bx.fillOp > 0) {
        ctx.save();
        ctx.globalAlpha = bx.fillOp;
        ctx.fillStyle = bx.fill || th.paper;
        ctx.beginPath();
        roundRectPath(ctx, r.x, r.y, r.w, r.h, rad);
        ctx.fill();
        ctx.restore();
    }
    if (bx.border > 0 && bx.borderOp > 0) {
        ctx.save();
        ctx.globalAlpha = bx.borderOp;
        ctx.strokeStyle = bx.borderColor || textColor;
        ctx.lineWidth = bx.border * em;
        ctx.beginPath();
        roundRectPath(ctx, r.x, r.y, r.w, r.h, rad);
        ctx.stroke();
        ctx.restore();
    }
}

function drawOps(ctx, ops) {
    var font = '';
    for (var i = 0; i < ops.length; i++) {
        var o = ops[i];
        if (o.k === 'text') {
            if (o.font !== font) { ctx.font = o.font; font = o.font; }
            ctx.fillStyle = o.color;
            ctx.textAlign = o.align;
            ctx.fillText(o.s, o.x, o.y);
        } else if (o.k === 'line') {
            ctx.beginPath();
            ctx.moveTo(o.x1, o.y1);
            ctx.lineTo(o.x2, o.y2);
            ctx.strokeStyle = o.color;
            ctx.lineWidth = o.lw;
            ctx.stroke();
        } else if (o.k === 'pill') {
            ctx.save();
            ctx.fillStyle = o.color;
            if (o.alpha !== 1) ctx.globalAlpha = o.alpha;
            if (ctx.roundRect) {
                ctx.beginPath();
                ctx.roundRect(o.x, o.y, o.w, o.h, o.r);
                ctx.fill();
            } else {
                ctx.fillRect(o.x, o.y, o.w, o.h);
            }
            ctx.restore();
        } else if (o.k === 'arc') {
            ctx.beginPath();
            ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
            if (o.fill) { ctx.fillStyle = o.color; ctx.fill(); }
            else { ctx.strokeStyle = o.color; ctx.lineWidth = o.lw; ctx.stroke(); }
        } else if (o.k === 'srect') {
            ctx.strokeStyle = o.color;
            ctx.lineWidth = o.lw;
            ctx.strokeRect(o.x, o.y, o.w, o.h);
        } else if (o.k === 'path') {
            ctx.beginPath();
            ctx.moveTo(o.pts[0][0], o.pts[0][1]);
            for (var j = 1; j < o.pts.length; j++) ctx.lineTo(o.pts[j][0], o.pts[j][1]);
            ctx.strokeStyle = o.color;
            ctx.lineWidth = o.lw;
            ctx.stroke();
        }
    }
}
// A table's grid or a quote's bar, for one run of its boxes in one column.
function drawDeco(ctx, dc, first, last) {
    ctx.beginPath();
    ctx.strokeStyle = dc.color;
    ctx.lineWidth = dc.lw;
    if (dc.kind === 'bq') {
        ctx.moveTo(dc.x, first.barTop);
        ctx.lineTo(dc.x, last.barBottom);
        ctx.stroke();
        return;
    }
    ctx.moveTo(dc.x, first.top);
    ctx.lineTo(dc.x + dc.maxW, first.top);
    ctx.stroke();
    for (var c = 0; c <= dc.nCols; c++) {
        ctx.beginPath();
        ctx.moveTo(dc.x + c * dc.cellW, first.top);
        ctx.lineTo(dc.x + c * dc.cellW, last.bottom);
        ctx.stroke();
    }
}
function paintFlow(ctx, G) {
    var FL = G.flow, placed = FL.P.placed;
    setTracking(ctx, G.st.track);
    for (var i = 0; i < placed.length; i++) {
        var p = placed[i], b = p.b;
        ctx.save();
        ctx.translate((FL.abs ? 0 : G.x) + p.col * (FL.colW + FL.gap), p.col === 0 ? FL.y0 : G.y + p.dy);
        drawOps(ctx, b.ops);
        var dc = b.deco, next = placed[i + 1];
        if (dc && (!next || next.b.deco !== dc || next.col !== p.col)) {
            var s = i;
            while (s > 0 && placed[s - 1].b.deco === dc && placed[s - 1].col === p.col) s--;
            drawDeco(ctx, dc, placed[s].b, b);
        }
        ctx.restore();
    }
}
function paintPlain(ctx, f, G) {
    var p = G.plain, st = G.st, y = p.base0;
    ctx.font = st.font;
    ctx.fillStyle = st.color;
    ctx.textAlign = p.align;
    setTracking(ctx, st.track);
    for (var i = 0; i < p.lines.length; i++) {
        ctx.fillText(p.lines[i], p.anchor, y);
        y += st.lh;
    }
    if (G.it.role === 'title' && G.it.rule) {
        y -= st.size * 0.7;
        var small = Math.min(f.w, f.h), sepLen = Math.min(G.w * 0.16, 70 * (small / 900)), a = p.anchor;
        ctx.beginPath();
        if (p.align === 'center')     { ctx.moveTo(a - sepLen / 2, y); ctx.lineTo(a + sepLen / 2, y); }
        else if (p.align === 'right') { ctx.moveTo(a - sepLen, y); ctx.lineTo(a, y); }
        else                          { ctx.moveTo(a, y); ctx.lineTo(a + sepLen, y); }
        ctx.strokeStyle = st.color;
        ctx.globalAlpha = STYLE.separatorOp;
        ctx.lineWidth = Math.max(0.6, 1.2 * (small / 900));
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
}
function paintText(ctx, d, f, G, k, out) {
    var it = G.it, fr = { x: G.x + G.ox, y: G.y + G.oy, w: G.w, h: G.h }, hit = fr;
    out.boxes[it.id] = fr;
    out.frames[it.id] = { x: fr.x, y: fr.y, w: fr.w, h: fr.h, textW: G.textW || 0, capped: !!G.capped };
    if (it.box.on) {
        var em = G.st.size, pd = it.box.pad * em;
        hit = { x: fr.x - pd, y: fr.y - pd, w: fr.w + pd * 2, h: fr.h + pd * 2 };
        drawBox(ctx, d, f, hit, it.box, em, G.st.color, k);
    }
    out.hits[it.id] = hit;
    if (G.over) { out.over[it.id] = true; out.overflow = true; }
    else if (fr.y + fr.h > f.h + 0.5) out.overflow = true;
    ctx.save();
    ctx.translate(G.ox, G.oy);
    if (G.plain) paintPlain(ctx, f, G);
    else paintFlow(ctx, G);
    ctx.restore();
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
function paintImage(ctx, f, l, out) {
    var a = usable(userAsset(l.img)), box = layerBox(l, a, f.w, f.h);
    out.boxes[l.id] = out.hits[l.id] = box;
    if (!a) return;
    ctx.save();
    ctx.globalAlpha = l.opacity;
    ctx.drawImage(a.img, box.x, box.y, box.w, box.h);
    ctx.restore();
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
function paintGraphic(ctx, d, f, G, col, out) {
    var geo = graphicGeom(d, f, G), b;
    if (G.kind === 'ring') {
        drawRing(ctx, geo.cx, geo.cy, geo.r, col.graphic, f.w, f.h, G.opacity);
        b = { x: geo.cx - geo.r, y: geo.cy - geo.r, w: geo.r * 2, h: geo.r * 2, ring: geo };
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
        b = { x: geo.cx - lw / 2, y: geo.cy - lh / 2, w: lw, h: lh };
    }
    out.boxes.graphic = out.hits.graphic = b;
    out.frames.graphic = { cx: geo.cx, cy: geo.cy };
}

function render(ctx, d, f, k, forExport) {
    var w = f.w, h = f.h, th = THEMES[d.theme], col = colorsOf(d);
    var transparent = d.fileType === 'png_transp';
    var out = { boxes: {}, hits: {}, frames: {}, over: {}, w: w, h: h, overflow: false };

    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    /* Background: a transparent PNG is empty; its preview shows plain paper. */
    if (forExport && transparent) ctx.clearRect(0, 0, w, h);
    else {
        ctx.fillStyle = transparent ? th.paper : th.bg;
        ctx.fillRect(0, 0, w, h);
    }
    /* Background photo */
    if (d.bg.src) {
        out.boxes.bg = { x: 0, y: 0, w: w, h: h };
        if (!transparent && !d.bg.hidden) {
            var bim = usable(bgAsset(d.bg.src, forExport && Math.max(w, h) > 2560));
            if (bim) drawCover(ctx, bim.img, w, h, d.bg);
        }
    }
    var SZ = baseSizes(d, f), A = autoLayout(d, f, SZ, col);
    out.pad = A.pad;
    out.contentW = A.contentW;
    d.items.forEach(function (it) {
        if (it.hidden) return;
        if (it.type === 'graphic') paintGraphic(ctx, d, f, it, col, out);
        else if (it.type === 'image') paintImage(ctx, f, it, out);
        else {
            var G = textGeom(d, f, it, A, SZ, col);
            if (G) paintText(ctx, d, f, G, k, out);
        }
    });
    return out;
}

// Everything the export needs, fully loaded.
function ensureAssets(d, f) {
    var list = [], big = Math.max(f.w, f.h) > 2560;
    if (d.bg.src && !d.bg.hidden && d.fileType !== 'png_transp') list.push(bgAsset(d.bg.src, big));
    var G = itemOf(d, 'graphic');
    if (!G.hidden && G.kind === 'logo') {
        var geo = graphicGeom(d, f, G), color = colorsOf(d).graphic;
        list.push({ promise: logoSource(G.logo).p.then(function () {
            var s = svgSrc[G.logo];
            return s.raw ? logoAsset(G.logo, color, logoDrawnW(geo.logoSize, s.vb[0] / s.vb[1])).promise : null;
        }) });
    }
    d.items.forEach(function (it) { if (it.type === 'image' && !it.hidden) list.push(userAsset(it.img)); });
    list.push({ promise: fontsFor(d) });
    return Promise.all(list.map(function (a) { return a && a.promise ? a.promise : a; }));
}

// ==========================================================================
// State, history, saving
// ==========================================================================
var doc = null, templates = [];
var hist = [], histPos = -1, commitTimer = 0;
var sel = null;                // an item id, or 'bg'
var fontsLoaded = false;       // the font list has been read (a font not in it is missing)

function loadState() {
    var saved = readJSON(KEY_DOC);
    if (saved && saved.doc && typeof saved.doc === 'object') {
        doc = normalize(saved.doc);
        imageIds = strList(saved.images);
        fontIds = strList(saved.fonts);
        // A tab still running the first version may have added images.
        var older = readJSON(KEY_DOC_V1);
        strList(older && older.images).forEach(function (id) { if (imageIds.indexOf(id) < 0) imageIds.push(id); });
    } else {
        // First visit with this version: carry the first version's card over.
        var old = readJSON(KEY_DOC_V1) || {};
        doc = normalize(fromV1(old.doc));
        imageIds = strList(old.images);
        fontIds = [];
    }
    fontsLoaded = !fontIds.length;
    templates = readTemplates();
    hist = [JSON.stringify(doc)];
    histPos = 0;
}
function save() {
    // Union with what another tab may have added since, minus what was
    // removed here, so two open tabs do not lose each other's images/fonts.
    var stored = readJSON(KEY_DOC), ids = imageIds.slice(), fids = fontIds.slice();
    if (stored) {
        strList(stored.images).forEach(function (id) { if (ids.indexOf(id) < 0 && !removedIds[id]) ids.push(id); });
        strList(stored.fonts).forEach(function (id) { if (fids.indexOf(id) < 0 && !removedFonts[id]) fids.push(id); });
    }
    imageIds = ids;
    fontIds = fids;
    writeJSON(KEY_DOC, { v: 2, doc: doc, images: imageIds, fonts: fontIds });
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
function itemById(id) { return doc ? itemOf(doc, id) : null; }
function selExists(id) { return id === 'bg' || !!itemById(id); }
function fmt() { return findFormat(doc.format); }
function customCount() { return doc.items.filter(isCustomText).length; }
function imageCount() { return doc.items.filter(function (it) { return it.type === 'image'; }).length; }

// Give an element its own frame where it is now (before a drag, a resize or
// a width change). A date or author frame is widened away from the side its
// text hangs on, so typing more does not wrap it at once.
function toManual(it) {
    if (!it.auto) return;
    var f = fmt(), L = lastLayout;
    if (it.type === 'graphic') {
        var g = L && L.frames.graphic;
        if (!g) return;
        it.x = g.cx / f.w;
        it.y = g.cy / f.h;
    } else {
        var B = L && L.frames[it.id];
        if (!B) return;
        var x = B.x, w = B.w;
        if (it.role === 'date' || it.role === 'author') {
            var W = Math.max(w, B.textW + 1, it.role === 'author' ? L.contentW * 0.5 : 0), a = effAlign(doc, it);
            x = a === 'right' ? x + w - W : a === 'center' ? x + w / 2 - W / 2 : x;
            w = W;
        }
        it.x = x / f.w;
        it.y = B.y / f.h;
        it.w = w / f.w;
        // Columns squeezed by the bottom margin keep that height.
        it.h = B.capped ? B.h / f.h : 0;
    }
    it.auto = false;
    it.dx = it.dy = 0;
}
function toAuto(it) {
    it.auto = true;
    it.dx = it.dy = 0;
}

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
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h8"/>',
    text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'
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

var HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(function (h) {
    return '<span class="card-handle" data-h="' + h + '"></span>';
}).join('');
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
      '<div class="card-box card-sel" id="card-sel" hidden><span class="card-sel-name" id="card-sel-name"></span>' + HANDLES + '</div>' +
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
     '<div class="card-row card-add-row">' +
      '<button type="button" class="chip card-add" data-act="add-text" id="card-add-text">' + icon('text') + '<span data-t="add_text"></span></button>' +
      '<button type="button" class="chip card-add" data-act="add-layer" id="card-add-image">' + icon('plus') + '<span data-t="add_image"></span></button>' +
     '</div>' +
     '<div class="card-props" id="card-props"></div>' +
    '</div>' +
    '<input type="file" accept="image/*" id="card-file" hidden>' +
    '<input type="file" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" id="card-font-file" hidden>' +
   '</section>' +
  '</div>' +
 '</div>' +
'</div>';

var overlayEl, modal, canvas, frame, stageArea, inTitle, inAuthor, inDesc, calEl, layersEl, propsEl, designEl, fileIn, fontIn, exportBtn, selEl;
var cssReady = null, built = false, isOpen = false, langApplied = null, tab = 'design';
var previewK = 1, cssScale = 1, lastLayout = null, calView = null, fileMode = 'layer', fontTarget = null;

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
    fontIn = $('#card-font-file');
    exportBtn = $('#card-export');
    selEl = $('#card-sel');
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
    $('#card-add-text').disabled = customCount() >= MAX_LAYERS;
    $('#card-add-image').disabled = imageCount() >= MAX_LAYERS;
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
// A font finished loading: show its name, unless the visitor is typing there.
function fontsChanged() {
    if (!built || !isOpen || propsEl.contains(document.activeElement)) return;
    var it = sel && itemById(sel);
    if (it && it.type === 'text') renderProps();
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
function slider(label, value, min, max, step, show, onInput, onChange) {
    var out = node('span', { class: 'card-val', text: show(value) });
    var r = node('input', { type: 'range', class: 'card-range', min: min, max: max, step: step, 'aria-label': label });
    r.value = value;
    r.addEventListener('input', function () {
        var v = parseFloat(r.value);
        out.textContent = show(v);
        onInput(v);
        schedule();
    });
    r.addEventListener('change', function () { commit(); if (onChange) onChange(); });
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
// A folding group; whether it is open is remembered while the page is open.
var openGroups = {};
function group(key, title, kids) {
    var body = node('div', { class: 'card-more-body' }, kids);
    var el = node('details', { class: 'card-more', open: !!openGroups[key] }, [node('summary', { class: 'card-more-head', text: title }), body]);
    el.addEventListener('toggle', function () { openGroups[key] = el.open; });
    return el;
}
function pct(v) { return Math.round(v * 100) + '%'; }
function times(v) { return v.toFixed(2) + '×'; }
function signed(v) { return (v > 0 ? '+' : '') + v.toFixed(2); }
function ems(v) { return v.toFixed(2) + ' em'; }
function emsOrOff(v) { return v > 0 ? ems(v) : t('off'); }
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
    var allAuto = doc.items.every(function (it) { return !(it.type === 'graphic' || (it.type === 'text' && !isCustomText(it))) || (it.auto && !it.dx && !it.dy); });
    designEl.appendChild(node('div', { class: 'card-group' }, [
        node('h3', { class: 'card-section', text: t('card') }),
        field(t('format'), fsel),
        seg(t('theme'), [['dark', t('dark')], ['light', t('light')]], doc.theme, function (v) { doc.theme = v; renderProps(); }),
        seg(t('align'), [['left', t('left')], ['center', t('center')], ['right', t('right')]], doc.align, function (v) { doc.align = v; }),
        slider(t('font_scale'), doc.fontScale, 0.5, 8, 0.05, times, function (v) { doc.fontScale = v; }),
        slider(t('padding'), doc.padScale, 0, 5, 0.05, times, function (v) { doc.padScale = v; }),
        slider(t('pad_bias'), doc.padRatio, -0.8, 0.8, 0.05, signed, function (v) { doc.padRatio = v; }),
        node('div', { class: 'card-row' }, [actionButton(t('reset_layout'), 'reset', resetLayout, allAuto)])
    ]));
}
// Hand the date, author, title, description and graphic back to the
// template's automatic layout; their looks, the text layers and images stay.
function resetLayout() {
    doc.items.forEach(function (it) { if (it.type === 'graphic' || (it.type === 'text' && !isCustomText(it))) toAuto(it); });
    commit();
    refreshAll();
}

// --- Layers tab --------------------------------------------------------
function nth(it) {
    var n = 0;
    for (var i = 0; i < doc.items.length; i++) {
        var x = doc.items[i];
        if (x.type === it.type && isCustomText(x) === isCustomText(it)) n++;
        if (x === it) return n;
    }
    return n;
}
function elName(id) {
    if (id === 'bg') return t('el_bg');
    var it = itemById(id);
    if (!it) return '';
    if (it.type === 'image') return t('el_image', { n: nth(it) });
    if (isCustomText(it)) {
        var s = it.text.replace(/[#*_`>|~=[\]]+/g, ' ').replace(/^\s*[-\d.]+\s/, '').replace(/\s+/g, ' ').trim();
        return s ? (s.length > 24 ? s.slice(0, 23) + '…' : s) : t('el_text', { n: nth(it) });
    }
    return t('el_' + it.id);
}
function layerOrder() {
    return doc.items.slice().reverse().map(function (it) { return it.id; }).concat('bg');
}
function isHidden(id) {
    if (id === 'bg') return doc.bg.hidden || !doc.bg.src;
    var it = itemById(id);
    if (id === 'author' && !doc.author.trim()) return true;
    if (id === 'desc' && !doc.desc.trim()) return true;
    return it.hidden;
}
function ownHidden(id) { return id === 'bg' ? doc.bg.hidden : itemById(id).hidden; }
function setHidden(id, hidden) {
    if (id === 'bg') doc.bg.hidden = hidden;
    else itemById(id).hidden = hidden;
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

// --- The selected element -------------------------------------------------
function renderProps() {
    propsEl.textContent = '';
    if (!sel) { propsEl.appendChild(note(t('select_hint'))); return; }
    var id = sel, f = fmt(), kids = [node('h3', { class: 'card-section', text: elName(id) })];
    if (id === 'bg') bgProps(kids);
    else {
        var it = itemById(id);
        if (it.type === 'text') textProps(it, kids, f);
        else if (it.type === 'graphic') graphicProps(it, kids);
        else imageProps(it, kids);
    }
    kids.forEach(function (k) { propsEl.appendChild(k); });
}
function posButton(isZero, reset) {
    return actionButton(t('reset_pos'), 'reset', function () { reset(); commit(); renderProps(); schedule(); }, isZero);
}
function orderButtons(it) {
    var i = doc.items.indexOf(it);
    return [
        actionButton(t('layer_up'), 'up', function () { moveItem(it, 1); }, i === doc.items.length - 1),
        actionButton(t('layer_down'), 'down', function () { moveItem(it, -1); }, i === 0)
    ];
}
function textHex(it) {
    var col = colorsOf(doc), th = THEMES[doc.theme];
    if (isCustomText(it)) return it.color || th.fgHex;
    return it.role === 'desc' ? (col.body || th.bodyHex) : col[it.role];
}
function textProps(it, kids, f) {
    var std = !isCustomText(it), md = isMarkdown(it), col = colorsOf(doc), cset = doc.colors[doc.theme];
    kids.push(onOff(t('visible'), !it.hidden, function (v) { it.hidden = !v; renderLayers(); }));
    if (it.role === 'author' && !doc.author.trim()) kids.push(note(t('author_empty')));
    if (it.role === 'desc' && !doc.desc.trim()) kids.push(note(t('desc_empty')));
    if (it.role === 'desc' && it.auto && f.w / f.h > 2.6) kids.push(note(t('banner_desc'), true));
    if (lastLayout && lastLayout.over[it.id]) kids.push(note(t('warn_frame'), true));
    if (!std) {
        var ta = node('textarea', { class: 'card-input card-textarea card-textarea-sm', id: 'card-in-text', rows: 5, maxlength: MAX_TEXT, 'aria-describedby': 'card-text-hint' });
        ta.value = it.text;
        ta.addEventListener('input', function () { it.text = ta.value; commitSoon(); schedule(); renderLayers(); });
        ta.addEventListener('change', commit);
        kids.push(node('div', { class: 'card-field' }, [node('label', { class: 'card-label', for: 'card-in-text', text: t('f_text') }), ta,
            node('p', { class: 'card-note', id: 'card-text-hint', text: t('text_hint') })]));
    }
    if (it.role === 'date') kids.push(seg(t('date_lang'), [['en', 'EN'], ['sv', 'SV']], it.lang, function (v) { it.lang = v; }));
    if (it.role === 'author') kids.push(seg(t('author_pos'), [['opposite', t('opposite')], ['diagonal', t('diagonal')]], it.pos, function (v) {
        it.pos = v;
        toAuto(it);           // the position is the template's: back to it
        renderProps();
    }));
    if (it.role === 'title') kids.push(onOff(t('rule'), it.rule, function (v) { it.rule = v; }));
    fontField(it, kids);
    kids.push(slider(t('size'), it.size, 0.2, 5, 0.01, pct, function (v) { it.size = v; }));
    if (std) {
        var ckey = { date: 'date', title: 'title', author: 'author', desc: 'body' }[it.role];
        kids.push(colorField(t(ckey === 'body' ? 'body_color' : 'color'), textHex(it), !cset[ckey],
            function (v) { cset[ckey] = v; }, function () { cset[ckey] = ''; }));
        if (md) kids.push(colorField(t('accent_color'), col.accent, !cset.accent, function (v) { cset.accent = v; }, function () { cset.accent = ''; }));
    } else {
        kids.push(colorField(t('body_color'), textHex(it), !it.color, function (v) { it.color = v; }, function () { it.color = ''; }));
        kids.push(colorField(t('accent_color'), it.accent || col.accent, !it.accent, function (v) { it.accent = v; }, function () { it.accent = ''; }));
    }
    var aopts = [['left', t('left')], ['center', t('center')], ['right', t('right')]];
    if (std) aopts.unshift(['', t('align_auto')]);
    kids.push(seg(t('align'), aopts, it.align, function (v) {
        it.align = v;
        // The author's automatic box is only as wide as its text.
        if (v && it.role === 'author' && it.auto) { toManual(it); renderProps(); }
    }));
    if (md) {
        kids.push(seg(t('columns'), [[1, '1'], [2, '2'], [3, '3']], it.columns, function (v) { it.columns = v; renderProps(); }));
        kids.push(onOff(t('justify'), it.justify, function (v) { it.justify = v; }));
    }
    kids.push(frameGroup(it, f));
    kids.push(boxGroup(it));
    var row = [];
    if (std) row.push(posButton(it.auto && !it.dx && !it.dy, function () { toAuto(it); }));
    row = row.concat(orderButtons(it));
    if (!std) {
        row.push(actionButton(t('duplicate'), 'copy', function () { duplicateText(it); }, customCount() >= MAX_LAYERS));
        row.push(actionButton(t('layer_remove'), 'trash', function () { removeItem(it); }));
    }
    kids.push(node('div', { class: 'card-row' }, row));
}
function fontField(it, kids) {
    var def = isMarkdown(it) ? 'text' : 'mono', cur = it.font || def, custom = /^f/.test(cur);
    var missing = custom && fontsLoaded && !(fontLib[cur] && !fontLib[cur].failed);
    var s = node('select', { class: 'card-select', 'aria-label': t('font') });
    s.appendChild(node('option', { value: 'mono', text: 'Harald Mono' }));
    s.appendChild(node('option', { value: 'text', text: 'Harald Text' }));
    fontIds.forEach(function (id) {
        var fl = fontLib[id];
        if (fl && !fl.failed) s.appendChild(node('option', { value: id, text: fl.name }));
    });
    if (custom && !(fontLib[cur] && !fontLib[cur].failed)) s.appendChild(node('option', { value: cur, text: missing ? t('font_missing_opt') : '…' }));
    s.appendChild(node('option', { value: '__add', text: t('add_font') }));
    s.value = cur;
    s.addEventListener('change', function () {
        if (s.value === '__add') { s.value = cur; fontTarget = it.id; fontIn.click(); return; }
        it.font = s.value === def ? '' : s.value;
        commit();
        renderProps();
        schedule();
    });
    var row = [s];
    if (custom && fontLib[cur]) {
        var rm = node('button', { type: 'button', class: 'icon-btn card-mini', title: t('remove_font'), 'aria-label': t('remove_font'), html: icon('trash') });
        rm.addEventListener('click', function () {
            if (confirm(t('remove_font_confirm', { name: fontLib[cur].name }))) removeFont(cur);
        });
        row.push(rm);
    }
    kids.push(field(t('font'), node('div', { class: 'card-row card-row-select' }, row)));
    if (missing) kids.push(note(t('font_missing'), true));
}
function frameGroup(it, f) {
    var box = lastLayout && lastLayout.boxes[it.id], kids = [], wasAuto = it.auto;
    var fixed = !it.auto && it.h > 0;
    function manual() { if (it.auto) toManual(it); }
    kids.push(slider(t('width'), it.auto ? (box ? box.w / f.w : it.w) : it.w, 0.02, 1.5, 0.005, pct,
        function (v) { manual(); it.w = v; }, function () { if (wasAuto !== it.auto) renderProps(); }));
    kids.push(seg(t('height'), [['fit', t('h_fit')], ['fixed', t('h_fixed')]], fixed ? 'fixed' : 'fit', function (v) {
        if (v === 'fixed') {
            var b = lastLayout && lastLayout.boxes[it.id];
            manual();
            if (!it.h) it.h = clamp((b ? b.h : f.h * 0.2) / f.h, 0.01, 3);
        } else if (!it.auto) it.h = 0;
        renderProps();
    }));
    if (fixed) {
        kids.push(slider(t('height'), it.h, 0.01, 1.5, 0.005, pct, function (v) { it.h = v; }));
        if (!isMarkdown(it) || it.columns === 1) {
            kids.push(seg(t('valign'), [['top', t('top')], ['middle', t('middle')], ['bottom', t('bottom')]], it.valign, function (v) { it.valign = v; }));
        }
    }
    kids.push(slider(t('letter_spacing'), it.ls, 0, 4, 0.05, times, function (v) { it.ls = v; }));
    kids.push(slider(t('line_spacing'), it.lh, 0.5, 3, 0.01, times, function (v) { it.lh = v; }));
    return group('frame', t('text_box'), kids);
}
function boxGroup(it) {
    var bx = it.box, kids = [];
    kids.push(onOff(t('box'), bx.on, function (v) { bx.on = v; renderProps(); }));
    if (bx.on) {
        kids.push(colorField(t('fill'), bx.fill || THEMES[doc.theme].paper, !bx.fill, function (v) { bx.fill = v; }, function () { bx.fill = ''; }));
        kids.push(slider(t('fill_opacity'), bx.fillOp, 0, 1, 0.01, pct, function (v) { bx.fillOp = v; }));
        kids.push(slider(t('blur'), bx.blur, 0, 3, 0.01, emsOrOff, function (v) { bx.blur = v; }));
        kids.push(slider(t('border'), bx.border, 0, 0.5, 0.005, emsOrOff, function (v) { bx.border = v; }));
        kids.push(colorField(t('border_color'), bx.borderColor || textHex(it), !bx.borderColor, function (v) { bx.borderColor = v; }, function () { bx.borderColor = ''; }));
        kids.push(slider(t('border_opacity'), bx.borderOp, 0, 1, 0.01, pct, function (v) { bx.borderOp = v; }));
        kids.push(slider(t('radius'), bx.radius, 0, 3, 0.01, ems, function (v) { bx.radius = v; }));
        kids.push(slider(t('box_pad'), bx.pad, 0, 3, 0.01, ems, function (v) { bx.pad = v; }));
        kids.push(slider(t('shadow'), bx.shadow, 0, 3, 0.01, emsOrOff, function (v) { bx.shadow = v; }));
        kids.push(slider(t('shadow_opacity'), bx.shadowOp, 0, 1, 0.01, pct, function (v) { bx.shadowOp = v; }));
    }
    return group('box', t('box'), kids);
}
function graphicProps(it, kids) {
    var col = colorsOf(doc), cset = doc.colors[doc.theme];
    kids.push(onOff(t('visible'), !it.hidden, function (v) { it.hidden = !v; renderLayers(); }));
    var ksel = node('select', { class: 'card-select', 'aria-label': t('kind') });
    ksel.appendChild(node('option', { value: 'ring', text: t('ring') }));
    LOGOS.forEach(function (lg, i) { ksel.appendChild(node('option', { value: 'logo' + i, text: t(lg.name) })); });
    ksel.value = it.kind === 'ring' ? 'ring' : 'logo' + it.logo;
    ksel.addEventListener('change', function () {
        if (ksel.value === 'ring') it.kind = 'ring';
        else { it.kind = 'logo'; it.logo = parseInt(ksel.value.slice(4), 10); }
        commit();
        schedule();
    });
    kids.push(field(t('kind'), ksel));
    kids.push(slider(t('size'), it.size, 0.2, 4, 0.01, pct, function (v) { it.size = v; }));
    kids.push(slider(t('opacity'), it.opacity, 0, 1, 0.01, pct, function (v) { it.opacity = v; }));
    kids.push(colorField(t('color'), col.graphic, !cset.graphic, function (v) { cset.graphic = v; }, function () { cset.graphic = ''; }));
    kids.push(node('div', { class: 'card-row' }, [posButton(it.auto && !it.dx && !it.dy, function () { toAuto(it); })].concat(orderButtons(it))));
}
function imageProps(l, kids) {
    if (!lib[l.img] && libraryLoaded) kids.push(note(t('image_missing'), true));
    kids.push(onOff(t('visible'), !l.hidden, function (v) { l.hidden = !v; renderLayers(); }));
    kids.push(slider(t('size'), l.size, 0.02, 2, 0.005, pct, function (v) { l.size = v; }));
    kids.push(slider(t('opacity'), l.opacity, 0, 1, 0.01, pct, function (v) { l.opacity = v; }));
    kids.push(node('div', { class: 'card-row' }, [posButton(l.x === 0.5 && l.y === 0.5, function () { l.x = 0.5; l.y = 0.5; })]
        .concat(orderButtons(l))
        .concat([actionButton(t('layer_remove'), 'trash', function () { removeItem(l); })])));
}
function bgProps(kids) {
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
}
function moveItem(it, dir) {
    var i = doc.items.indexOf(it), j = i + dir;
    if (j < 0 || j >= doc.items.length) return;
    doc.items.splice(i, 1);
    doc.items.splice(j, 0, it);
    commit();
    renderLayers();
    renderProps();
    schedule();
}
function removeItem(it) {
    var i = doc.items.indexOf(it);
    if (i < 0 || !(it.type === 'image' || isCustomText(it))) return;
    doc.items.splice(i, 1);
    select(null);
    commit();
}
function addText() {
    if (customCount() >= MAX_LAYERS) return;
    var n = customCount();
    var it = normText({ type: 'text', role: 'text', id: newId('t'), text: t('text_default'), x: 0.25, y: 0.4 + (n % 5) * 0.05, w: 0.5 }, 'text');
    doc.items.push(it);
    commit();
    select(it.id);
    syncUndo();
    var ta = $('#card-in-text');
    if (ta) { ta.focus(); ta.select(); }
}
function duplicateText(it) {
    if (customCount() >= MAX_LAYERS) return;
    var c = clone(it);
    c.id = newId('t');
    c.y = clamp(c.y + 0.04, -1, 2);
    doc.items.splice(doc.items.indexOf(it) + 1, 0, normText(c, 'text'));
    commit();
    select(c.id);
    syncUndo();
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
// Preview, selection, dragging, resizing
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
    var it = sel && sel !== 'bg' ? itemById(sel) : null;
    showBox(selEl, sel ? lastLayout.boxes[sel] : null);
    selEl.dataset.handles = !it ? 'none' : it.type === 'text' ? 'all' : 'corners';
    selEl.classList.toggle('is-over', !!(sel && lastLayout.over[sel]));
    $('#card-sel-name').textContent = sel ? elName(sel) : '';
    if (!drag) showBox($('#card-hover'), hoverId && hoverId !== sel ? lastLayout.hits[hoverId] : null);
    $('#card-dims').textContent = f.w + ' × ' + f.h + ' px';
    var hint = $('#card-hint'), warn = '';
    if (bannerHidesDesc(f)) warn = t('banner_desc');
    else if (Object.keys(lastLayout.over).length) warn = t('warn_frame');
    else if (lastLayout.overflow) warn = t('warn_overflow');
    hint.textContent = warn || t(coarse ? 'hint_touch' : 'hint_drag');
    hint.classList.toggle('card-warn', !!warn);
}
function bannerHidesDesc(f) {
    var M = itemOf(doc, 'desc');
    return f.w / f.h > 2.6 && doc.desc.trim() && !M.hidden && M.auto;
}
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
function inBox(p, b, tol) { return p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol; }
// The topmost element under the point (the ring only on its ring).
function hitTest(p) {
    if (!lastLayout) return null;
    var H = lastLayout.hits, tol = 6 / cssScale, ids = layerOrder();
    for (var i = 0; i < ids.length; i++) {
        var id = ids[i], b = H[id];
        if (!b || id === 'bg') continue;
        if (b.ring) {
            var dist = Math.hypot(p.x - b.ring.cx, p.y - b.ring.cy);
            if (dist > b.ring.r * 0.86 - tol && dist < b.ring.r * 1.02 + tol) return id;
        } else if (inBox(p, b, tol)) {
            return id;
        }
    }
    return null;
}
function select(id) {
    sel = id && selExists(id) ? id : null;
    if (sel && tab !== 'layers') setTab('layers');
    frame.classList.toggle('has-sel', !!sel);
    renderLayers();
    renderProps();
    schedule();
}

function posOf(id) {
    if (id === 'bg') return { x: doc.bg.px, y: doc.bg.py };
    var it = itemById(id);
    return { x: it.x, y: it.y };
}
// Move `id` by (dx, dy) card pixels from its position `start` (an element
// placed by the template gets its own frame first: see beginMove).
function applyMove(id, start, dx, dy) {
    var f = fmt();
    if (id === 'bg') {
        var a = usable(bgAsset(doc.bg.src, false));
        if (!a) return;
        var o = coverOverflow(a.img, f.w, f.h, doc.bg.zoom);
        doc.bg.px = o.x > 0 ? clamp(start.x + dx / (o.x / 2), -1, 1) : 0;
        doc.bg.py = o.y > 0 ? clamp(start.y + dy / (o.y / 2), -1, 1) : 0;
        return;
    }
    var it = itemById(id);
    it.x = clamp(start.x + dx / f.w, -1, 2);
    it.y = clamp(start.y + dy / f.h, -1, 2);
}
function beginMove(id) {
    var it = id !== 'bg' && itemById(id);
    if (it && it.auto) toManual(it);
    return posOf(id);
}
// Snap the dragged box's edges or middle to the margins and the centre lines.
function snapLines(f) {
    var P = lastLayout.pad;
    return { x: [P.x, f.w / 2, f.w - P.x], y: [P.y, f.h / 2, f.h - P.y] };
}
function snap(box, dx, dy) {
    var f = fmt(), S = snapLines(f), thr = 7 / cssScale, res = { dx: dx, dy: dy, gx: null, gy: null };
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
    var hx = best(box.x, box.w, S.x, dx);
    var hy = best(box.y, box.h, S.y, dy);
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

// Resizing. A text box: each edge moves (the text re-wraps; moving the top or
// bottom edge fixes the height). An image or the graphic: the corners scale
// it about its centre.
function beginResize(dr) {
    var it = itemById(dr.id), f = fmt(), b = lastLayout.boxes[dr.id];
    if (it.type === 'text') {
        toManual(it);
        dr.fr = { x: it.x * f.w, y: it.y * f.h, w: it.w * f.w, h: it.h > 0 ? it.h * f.h : b.h };
        dr.min = Math.max(8, textStyle(doc, it, baseSizes(doc, f), colorsOf(doc)).size * 0.6);
    } else {
        dr.centre = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
        dr.size0 = it.size;
    }
}
function applyResize(dr, dx, dy, free) {
    var it = itemById(dr.id), f = fmt();
    if (it.type !== 'text') {
        var c = dr.centre, d0 = Math.hypot(dr.x0 - c.x, dr.y0 - c.y) || 1, d1 = Math.hypot(dr.x0 + dx - c.x, dr.y0 + dy - c.y);
        it.size = it.type === 'image' ? clamp(dr.size0 * d1 / d0, 0.02, 3) : clamp(dr.size0 * d1 / d0, 0.2, 5);
        return { gx: null, gy: null };
    }
    var F = dr.fr, h = dr.h, S = snapLines(f), thr = 7 / cssScale, g = { gx: null, gy: null };
    function snapTo(v, lines, axis) {
        if (free) return v;
        for (var i = 0; i < lines.length; i++) if (Math.abs(lines[i] - v) < thr) { g[axis] = lines[i]; return lines[i]; }
        return v;
    }
    var x = F.x, y = F.y, w = F.w, hh = F.h;
    if (h.indexOf('e') >= 0) w = Math.max(dr.min, snapTo(F.x + F.w + dx, S.x, 'gx') - F.x);
    if (h.indexOf('w') >= 0) { x = Math.min(snapTo(F.x + dx, S.x, 'gx'), F.x + F.w - dr.min); w = F.x + F.w - x; }
    if (h.indexOf('s') >= 0) hh = Math.max(dr.min, snapTo(F.y + F.h + dy, S.y, 'gy') - F.y);
    if (h.indexOf('n') >= 0) { y = Math.min(snapTo(F.y + dy, S.y, 'gy'), F.y + F.h - dr.min); hh = F.y + F.h - y; }
    it.x = clamp(x / f.w, -1, 2);
    it.y = clamp(y / f.h, -1, 2);
    it.w = clamp(w / f.w, 0.02, 3);
    if (/[ns]/.test(h)) it.h = clamp(hh / f.h, 0.01, 3);
    return g;
}

var drag = null, hoverId = null, coarse = false;
function onPointerDown(e) {
    if (e.button !== 0 || !lastLayout) return;
    coarse = e.pointerType === 'touch' || e.pointerType === 'pen';
    var p = toCard(e), handle = e.target.closest && e.target.closest('.card-handle');
    if (handle && sel && sel !== 'bg' && lastLayout.boxes[sel]) {
        drag = { id: sel, resize: true, h: handle.dataset.h, x0: p.x, y0: p.y, moved: false };
    } else {
        var hit = hitTest(p);
        // The selected element wins inside its own box, so an image under the
        // text (or a big description box) can still be dragged once selected.
        var sb = sel && sel !== 'bg' && lastLayout.hits[sel];
        if (sb && !sb.ring && inBox(p, sb, 0)) hit = sel;
        if (!hit && !(sel === 'bg' && doc.bg.src)) { if (sel) select(null); return; }
        var id = hit || 'bg';
        if (id !== sel) select(id);
        drag = { id: id, x0: p.x, y0: p.y, moved: false };
    }
    try { frame.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    // Focus for the arrow keys, without the keyboard focus ring.
    frame.focus({ preventScroll: true, focusVisible: false });
    e.preventDefault();
}
function onPointerMove(e) {
    if (!drag) {
        if (e.pointerType !== 'mouse') return;
        var hv = hitTest(toCard(e));
        if (hv !== hoverId) { hoverId = hv; frame.style.cursor = hv ? 'move' : (sel === 'bg' && doc.bg.src ? 'grab' : ''); schedule(); }
        return;
    }
    var p = toCard(e), dx = p.x - drag.x0, dy = p.y - drag.y0, g;
    if (!drag.moved) {
        if (Math.hypot(dx, dy) * cssScale < 3) return;
        drag.moved = true;
        if (drag.resize) beginResize(drag);
        else {
            var b = lastLayout.boxes[drag.id];
            drag.box = b ? { x: b.x, y: b.y, w: b.w, h: b.h } : null;
            drag.start = beginMove(drag.id);
        }
    }
    if (drag.resize) g = applyResize(drag, dx, dy, e.altKey);
    else {
        g = drag.id !== 'bg' && drag.box && !e.altKey ? snap(drag.box, dx, dy) : { dx: dx, dy: dy, gx: null, gy: null };
        applyMove(drag.id, drag.start, g.dx, g.dy);
    }
    showGuides(g.gx, g.gy);
    schedule();
}
function onPointerUp() {
    if (!drag) return;
    var moved = drag.moved;
    drag = null;
    showGuides(null, null);
    if (moved) { commit(); renderDesign(); renderProps(); }
}
// Double-click: back to the template's place (an image to the centre);
// on a text layer, edit its text.
function resetPosition(id) {
    var it = id !== 'bg' && itemById(id);
    if (id === 'bg') { doc.bg.px = doc.bg.py = 0; }
    else if (it.type === 'image') { it.x = it.y = 0.5; }
    else if (isCustomText(it)) {
        select(id);
        var ta = $('#card-in-text');
        if (ta) ta.focus();
        return;
    } else toAuto(it);
    commit();
    renderDesign();
    renderProps();
    schedule();
}

// ==========================================================================
// Templates, images, fonts, export
// ==========================================================================
// The template's look and layout; the content and the text layers stay (on
// top, in their order).
function applyTemplate(id) {
    var tpl = findTemplate(id);
    if (!tpl) return;
    var next = templateLook(tpl);
    ['title', 'author', 'desc', 'date', 'format', 'fileType'].forEach(function (k) { next[k] = doc[k]; });
    if (tpl.user) {
        if (tpl.format) next.format = tpl.format;
        if (tpl.fileType) next.fileType = tpl.fileType;
    } else {
        itemOf({ items: next.items }, 'date').lang = itemOf(doc, 'date').lang;
    }
    next.items = next.items.concat(doc.items.filter(isCustomText));
    next.template = id;
    doc = normalize(next);
    sel = null;
    commit();
    refreshAll();
}
function saveTemplate(name) {
    name = (name || '').trim().slice(0, 40) || t('tpl_default_name', { n: templates.length + 1 });
    var list = readTemplates();
    var tpl = { id: newId('u'), name: name, look: pickLook(doc, false), format: doc.format, fileType: doc.fileType };
    list.push(tpl);
    writeTemplates(list);
    templates = readTemplates();
    doc.template = tpl.id;
    commit();
    renderDesign();
}
function deleteTemplate(id) {
    var tpl = findTemplate(id);
    if (!tpl || !tpl.user || !confirm(t('tpl_delete_confirm', { name: tpl.name }))) return;
    writeTemplates(readTemplates().filter(function (x) { return x.id !== id; }));
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
                if (imageCount() >= MAX_LAYERS) return;
                // Under the text, like the first version: just below the
                // lowest of the date, author, title and description.
                var l = normImage({ id: newId('l'), img: rec.id }), at = doc.items.length;
                doc.items.forEach(function (it, i) { if (it.type === 'text' && !isCustomText(it) && i < at) at = i; });
                doc.items.splice(at, 0, l);
                sel = l.id;
            }
            commit();
        });
    });
    chain.catch(function () { alert(t('image_failed')); }).then(function () {
        if (sel) setTab('layers');
        frame.classList.toggle('has-sel', !!sel);
        renderLayers();
        renderProps();
        syncUndo();
        schedule();
    });
}
function addFont(file) {
    var target = fontTarget;
    fontTarget = null;
    importFont(file).then(function (f) {
        var it = target && itemById(target);
        if (it && it.type === 'text') it.font = f.id;
        fontEpoch++;
        commit();
        renderProps();
        schedule();
    }, function (e) {
        alert(t(e && e.message === 'size' ? 'font_too_big' : 'font_failed'));
    });
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
    var d = clone(doc), f = findFormat(d.format), c = null;
    // Wait for the fonts and every image (a texture switched on a moment ago
    // used to be missing from the file).
    Promise.all([fontsReady(), ensureAssets(d, f)]).then(function () {
        c = document.createElement('canvas');
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
        freeCanvas(c);
        freeBlur();
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
    libraryLoaded = false;          // read the images again: another tab may have added some
    cssReady.then(function () {
        overlayEl.hidden = false;
        void overlayEl.offsetWidth;          // start the fade from the hidden state
        overlayEl.classList.add('active');   // visible from here on, so focus works
        isOpen = true;
        refreshAll();
        setTab(tab);
        // Text measured before a font arrived is laid out again.
        fontsReady().then(function () { fontEpoch++; schedule(); });
        loadFonts().then(function () { fontsLoaded = true; fontsChanged(); schedule(); });
        inTitle.focus({ preventScroll: true });
    });
}
function close() {
    if (!isOpen) return;
    commit();
    isOpen = false;
    drag = null;
    overlayEl.classList.remove('active');
    freeBlur();
    if (returnFocus && returnFocus.focus) returnFocus.focus({ preventScroll: true });
}
function isTyping(el) {
    return el && (el.tagName === 'INPUT' && !/^(range|color|button|checkbox|radio|file)$/.test(el.type) || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}
function focusables() {
    return $$('button, input, select, textarea, summary, [tabindex="0"]', modal).filter(function (n) {
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
        else if (act === 'add-text') addText();
        else if (act === 'new') {
            // A new card: the Content fields only (text layers and the look stay).
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
        if (e.target.closest('.card-handle')) return;
        var hit = hitTest(toCard(e)) || (sel === 'bg' ? 'bg' : null);
        if (hit) resetPosition(hit);
    });

    fileIn.addEventListener('change', function () {
        addFiles(fileIn.files, fileMode);
        fileIn.value = '';
    });
    fontIn.addEventListener('change', function () {
        if (fontIn.files && fontIn.files[0]) addFont(fontIn.files[0]);
        fontIn.value = '';
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
        var it = sel !== 'bg' && itemById(sel);
        if (arrows) {
            e.preventDefault();
            var step = (e.shiftKey ? 10 : 1) / cssScale, wasAuto = it && it.auto;
            applyMove(sel, beginMove(sel), arrows[0] * step, arrows[1] * step);
            commitSoon();
            if (wasAuto) { renderDesign(); renderProps(); }
            schedule();
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && it && (it.type === 'image' || isCustomText(it))) {
            e.preventDefault();
            removeItem(it);
            frame.focus({ preventScroll: true });
        }
    });

    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function () { schedule(); }).observe(stageArea);
    else window.addEventListener('resize', schedule);
    window.addEventListener('pagehide', function () { if (doc && commitTimer) commit(); });
}

window.RvryCard = { open: open };
}());
