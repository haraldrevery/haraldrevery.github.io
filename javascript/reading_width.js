/* ─── NOTEBOOK READING-WIDTH TOGGLE ───────────────────────────
   Injects a corner button that narrows the article column by cycling a
   --reading-scale CSS variable (see .post-container in input.css).

   Everything is created here, so with JS disabled the button simply does
   not exist and the layout is unaffected (--reading-scale falls back to 1).
   The button is hidden until the pointer enters the lower-right corner zone;
   styling lives in input_prose.css (.reading-corner-zone / .reading-width-btn).
   ───────────────────────────────────────────────────────────── */
(function () {
'use strict';

// Only run on pages that actually have the markdown post column.
if (!document.querySelector('.post-container')) return;

// Desktop-only: skip entirely on touch devices. maxTouchPoints/ontouchstart is a
// more reliable "is this a touch device" signal than the (hover)/(pointer) media
// queries, which some mobile browsers misreport — letting a long-press reveal the
// button. Never creating the elements means nothing can reveal them.
if (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) return;

var SCALES  = [1, 0.75, 0.55, 0.40, 0.28, 0.18];  // 100% → 75% → 55% → 40% → 28% → 18% of default width
var NARROW  = '><';                   // shown while there's still room to narrow
var WIDEN   = '<>';                   // shown at the narrowest step: next press widens back
var KEY     = 'rvry-reading-width';   // localStorage key (see legal.md §3.2)
var index   = 0;                      // current step in SCALES

// '<>' only at the last (narrowest) step, where the next click returns to default.
function glyphFor(i) { return i === SCALES.length - 1 ? WIDEN : NARROW; }

// Restore the saved step. The inline snippet at the top of post.njk has already
// applied the width before paint, so there's nothing to re-apply here — we only
// need `index` to match it, or the glyph and the next click would be out of sync.
// SCALES stays the single source of truth: anything not in it (hand-edited
// storage, or a value from an older SCALES list) resets to the default width so
// the button can never disagree with what's on screen.
try {
    var saved = SCALES.indexOf(parseFloat(localStorage.getItem(KEY)));
    if (saved > 0) {
        index = saved;
    } else {
        document.documentElement.style.removeProperty('--reading-scale');
        localStorage.removeItem(KEY);
    }
} catch (e) {}

// Transparent hover target in the very corner (reveals the button on hover).
var zone = document.createElement('div');
zone.className = 'reading-corner-zone';

// The button itself.
var btn = document.createElement('button');
btn.type = 'button';
btn.className = 'reading-width-btn';
btn.setAttribute('aria-label', 'Narrow the reading width');
btn.setAttribute('title', 'Narrow the reading width');
btn.textContent = glyphFor(index);

// Sit above the outline button when the post has one; otherwise use the corner slot.
if (document.querySelector('.article-outline-btn')) {
    btn.classList.add('reading-width-btn--above-outline');
}

btn.addEventListener('click', function () {
    index = (index + 1) % SCALES.length;
    document.documentElement.style.setProperty('--reading-scale', SCALES[index]);
    btn.textContent = glyphFor(index);
    // Remember the step so the next page opens at the same width. The default
    // step stores nothing, so a reader who never uses the button never gets a key.
    try {
        if (index === 0) localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, SCALES[index]);
    } catch (e) {}
});

// Insert into the SAME stacking context as the outline button. That button
// lives inside .bg-topology-map, which uses `isolation: isolate` (its own
// stacking context) — so appending to document.body instead would paint the
// zone above that whole subtree and block clicks on the outline button, no
// matter the z-index. Inside .bg-topology-map, zone z-index (110) sits below
// the outline button (120), so it no longer intercepts its clicks.
// Order matters: the zone must precede the button so the CSS
// `.reading-corner-zone:hover ~ .reading-width-btn` sibling selector works.
var host = document.querySelector('.bg-topology-map') || document.body;
host.appendChild(zone);
host.appendChild(btn);

}());
