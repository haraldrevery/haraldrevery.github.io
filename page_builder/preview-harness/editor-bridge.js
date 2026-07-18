/*
 * Editor bridge — injected into the live preview document served at
 * /__pb/preview. Talks to the builder UI (parent window) over postMessage:
 *
 *   parent -> iframe: {type:"render", html, dateHuman, scrollToId?}
 *                     {type:"select", id, scroll?}
 *                     {type:"mode", value:"edit"|"preview"}
 *   iframe -> parent: {type:"ready"}
 *                     {type:"blockClick", id}
 *                     {type:"reorder", id, dropIndex}
 *                     {type:"insertAt", index}
 *
 * In edit mode every click is intercepted (GLightbox and links stay dead) and
 * blocks get hover/selection outlines plus a floating handle for drag-reorder
 * and insert-between. Preview mode restores real lightbox behaviour but still
 * blocks navigation away from the page.
 */
(() => {
  const content = document.getElementById("pb-content");
  if (!content) return;
  const heroBox = document.getElementById("pb-hero");

  let mode = "edit";
  let selectedId = null;
  let navMechanic = false;

  const style = document.createElement("style");
  style.textContent = `
    .pb-edit [data-pb-id] { cursor: pointer; }
    .pb-edit [data-pb-id]:empty { display: block; min-height: 2.5rem;
      background: repeating-linear-gradient(45deg, transparent, transparent 8px,
        rgba(128,128,128,.08) 8px, rgba(128,128,128,.08) 16px); }
    .pb-edit [data-pb-id]:hover { outline: 2px dashed rgba(59,130,246,.55); outline-offset: 4px; }
    .pb-edit [data-pb-id].pb-selected { outline: 2px solid rgb(59,130,246); outline-offset: 4px; }
    #pb-handle {
      position: fixed; z-index: 9999; display: none; gap: 2px;
      background: rgb(23,23,23); border: 1px solid rgba(255,255,255,.2);
      border-radius: 6px; padding: 2px; box-shadow: 0 2px 8px rgba(0,0,0,.4);
      font: 12px/1 monospace;
    }
    #pb-handle button {
      all: unset; cursor: pointer; color: #eee; padding: 4px 6px; border-radius: 4px;
    }
    #pb-handle button:hover { background: rgba(255,255,255,.15); }
    #pb-handle .pb-grip { cursor: grab; }
    body.pb-dragging, body.pb-dragging * { cursor: grabbing !important; user-select: none !important; }
    #pb-drop { position: fixed; height: 3px; background: rgb(59,130,246); border-radius: 2px;
               z-index: 9998; pointer-events: none; display: none; }
    .pb-empty { border: 2px dashed rgba(128,128,128,.4); border-radius: 8px; padding: 4rem 2rem;
                text-align: center; opacity: .6; font-family: monospace; }
    .pb-edit [data-pb-items].pb-selected a.portfolio-item { cursor: grab; }
    .pb-item-drag { opacity: .45; outline: 2px dashed rgb(59,130,246); outline-offset: 2px; }
    /* editor-only column affordances (never exported) */
    .pb-col-head { display: none; }
    .pb-edit .pb-col-head { display: flex; justify-content: flex-end; margin-bottom: 4px; }
    .pb-col-chip { font: 11px/1 monospace; color: #ddd; background: rgba(23,23,23,.85);
                   border: 1px solid rgba(255,255,255,.25); border-radius: 999px;
                   padding: 3px 8px; cursor: pointer; }
    .pb-col-chip:hover { background: rgb(59,130,246); border-color: rgb(59,130,246); color: #fff; }
    .pb-empty-col { display: none; }
    .pb-edit .pb-empty-col { display: flex; align-items: center; justify-content: center;
                             border: 2px dashed rgba(128,128,128,.45); border-radius: 8px;
                             min-height: 6rem; opacity: .7; font-family: monospace;
                             font-size: 13px; cursor: pointer; background: none; color: inherit; width: 100%; }
    .pb-edit .pb-empty-col:hover { border-color: rgb(59,130,246); color: rgb(59,130,246); }
  `;
  document.head.appendChild(style);

  const handle = document.createElement("div");
  handle.id = "pb-handle";
  handle.innerHTML =
    '<button class="pb-add-above" title="Insert block above">+↑</button>' +
    '<button class="pb-grip" title="Drag to reorder">⠿</button>' +
    '<button class="pb-split" title="Split into 2 columns">⿲</button>' +
    '<button class="pb-add-below" title="Insert block below">+↓</button>';
  document.body.appendChild(handle);
  const splitBtn = handle.querySelector(".pb-split");

  const drop = document.createElement("div");
  drop.id = "pb-drop";
  document.body.appendChild(drop);

  const post = (msg) => parent.postMessage(msg, "*");
  // hero blocks live in #pb-hero and are pinned first in the store, so
  // hero-then-content DOM order matches store indices
  const roots = heroBox ? [heroBox, content] : [content];
  const blockEls = () =>
    roots.flatMap((r) => Array.from(r.querySelectorAll("[data-pb-id]")));
  const findBlock = (id) =>
    document.querySelector('[data-pb-id="' + id + '"]');

  // Preview emulation of the navi_mechanic scroll reveal (the export uses the
  // real CSS scroll-timeline + navbar_scroll fallback; here we just mimic the
  // behaviour so it works regardless of webkit support and toggles cleanly).
  function applyNavReveal() {
    const nav = document.querySelector("nav.main-nav");
    if (!nav) return;
    if (!navMechanic) {
      nav.style.transition = "";
      nav.style.transform = "";
      nav.style.opacity = "";
      return;
    }
    nav.style.transition = "transform .35s ease, opacity .35s ease";
    const shown = window.scrollY > 50;
    nav.style.transform = shown ? "translateY(0)" : "translateY(-110%)";
    nav.style.opacity = shown ? "1" : "0";
  }
  window.addEventListener("scroll", applyNavReveal, { passive: true });

  function applySelection() {
    blockEls().forEach((el) =>
      el.classList.toggle("pb-selected", el.getAttribute("data-pb-id") === selectedId)
    );
  }

  function reinitLightbox() {
    try {
      if (typeof lightbox !== "undefined" && lightbox && lightbox.reload) lightbox.reload();
    } catch (e) {}
  }

  function setMode(value) {
    mode = value;
    document.documentElement.classList.toggle("pb-edit", mode === "edit");
    if (mode !== "edit") hideHandle();
    if (mode === "preview") reinitLightbox();
  }

  window.addEventListener("message", (e) => {
    const m = e.data || {};
    if (m.type === "render") {
      if (heroBox) heroBox.innerHTML = m.heroHtml || "";
      const backBox = document.getElementById("pb-backlink");
      if (backBox) backBox.innerHTML = m.backLinkHtml || "";
      content.innerHTML = m.html;
      navMechanic = !!m.navMechanic;
      applyNavReveal();
      const dateEl = document.querySelector("[data-pb-date]");
      if (dateEl) dateEl.textContent = m.dateHuman || "";
      applySelection();
      hideHandle();
      if (mode === "preview") reinitLightbox();
      if (m.scrollToId) {
        const el = findBlock(m.scrollToId);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } else if (m.type === "select") {
      selectedId = m.id;
      applySelection();
      if (m.scroll) {
        const el = findBlock(m.id);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } else if (m.type === "mode") {
      setMode(m.value);
    }
  });

  // ---- edit mode: swallow every click; block clicks become selections,
  // column chips open the column-content picker in the parent
  document.addEventListener(
    "click",
    (e) => {
      if (mode !== "edit") return;
      if (suppressClick) {
        // a gallery-item drag just ended; eat the synthetic click
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.target.closest && e.target.closest("#pb-handle")) return;
      e.preventDefault();
      e.stopPropagation();
      const chip = e.target.closest && e.target.closest(".pb-col-chip");
      const block = e.target.closest && e.target.closest("[data-pb-id]");
      if (chip && block) {
        post({
          type: "columnPick",
          id: block.getAttribute("data-pb-id"),
          col: Number(chip.getAttribute("data-pb-col") || 0),
        });
        return;
      }
      if (block) {
        selectedId = block.getAttribute("data-pb-id");
        applySelection();
        post({ type: "blockClick", id: selectedId });
      }
    },
    true
  );

  // ---- preview mode: lightbox works, but plain links must not navigate away
  document.addEventListener("click", (e) => {
    if (mode !== "preview") return;
    const a = e.target.closest && e.target.closest("a");
    if (a && !a.classList.contains("glightbox")) {
      const href = a.getAttribute("href") || "";
      if (!href.startsWith("#")) e.preventDefault();
    }
  });

  // ---- floating handle follows the hovered block
  let hoverEl = null;

  function positionHandle(el) {
    const r = el.getBoundingClientRect();
    splitBtn.style.display = el.getAttribute("data-pb-split") ? "" : "none";
    handle.style.display = "flex";
    handle.style.top = Math.max(4, r.top - 14) + "px";
    handle.style.left = Math.min(window.innerWidth - 140, Math.max(4, r.right - 130)) + "px";
  }

  function hideHandle() {
    handle.style.display = "none";
    hoverEl = null;
  }

  document.addEventListener("mousemove", (e) => {
    if (mode !== "edit" || dragging) return;
    if (e.target.closest && e.target.closest("#pb-handle")) return;
    const block = e.target.closest && e.target.closest("[data-pb-id]");
    if (block) {
      if (block !== hoverEl) {
        hoverEl = block;
        positionHandle(block);
      }
    } else {
      hideHandle();
    }
  });

  handle.querySelector(".pb-add-above").addEventListener("click", () => {
    if (!hoverEl) return;
    post({ type: "insertAt", index: blockEls().indexOf(hoverEl) });
  });
  handle.querySelector(".pb-add-below").addEventListener("click", () => {
    if (!hoverEl) return;
    post({ type: "insertAt", index: blockEls().indexOf(hoverEl) + 1 });
  });
  splitBtn.addEventListener("click", () => {
    if (!hoverEl) return;
    post({ type: "split", id: hoverEl.getAttribute("data-pb-id") });
  });

  // ---- gallery item drag-drop (selected top-level gallery only)
  // A drag starts only after a small movement threshold, so plain clicks on
  // the selected gallery keep working; the click after a drag is suppressed.
  let itemDrag = null;
  let suppressClick = false;

  const galleryItemEls = (galleryEl) =>
    Array.from(galleryEl.querySelectorAll("a.portfolio-item"));

  function itemDropIndex(d, e) {
    const items = galleryItemEls(d.gallery);
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (e.clientY < r.top) return i; // row below the pointer
      if (e.clientY <= r.bottom && e.clientX < r.left + r.width / 2) return i;
    }
    return items.length;
  }

  function showItemDropAt(d, index) {
    const items = galleryItemEls(d.gallery);
    if (!items.length) return;
    let r, left;
    if (index >= items.length) {
      r = items[items.length - 1].getBoundingClientRect();
      left = r.right + 2;
    } else {
      r = items[index].getBoundingClientRect();
      left = r.left - 5;
    }
    drop.style.display = "block";
    drop.style.top = r.top + "px";
    drop.style.left = left + "px";
    drop.style.width = "3px";
    drop.style.height = r.height + "px";
  }

  document.addEventListener("pointerdown", (e) => {
    if (mode !== "edit" || e.button !== 0) return;
    const item = e.target.closest && e.target.closest("a.portfolio-item");
    if (!item) return;
    const gallery = item.closest("[data-pb-items]");
    if (!gallery || gallery.getAttribute("data-pb-id") !== selectedId) return;
    // stop the browser's native image/link drag from hijacking the pointer
    // (it fires pointercancel and our move/up handlers never run)
    e.preventDefault();
    itemDrag = { gallery, item, startX: e.clientX, startY: e.clientY, started: false };
  });

  // belt and braces: native dragstart on gallery images is always suppressed
  // in edit mode
  document.addEventListener("dragstart", (e) => {
    if (mode === "edit" && e.target.closest && e.target.closest("[data-pb-items]")) {
      e.preventDefault();
    }
  });

  function cancelItemDrag() {
    if (!itemDrag) return;
    if (itemDrag.started) {
      itemDrag.item.classList.remove("pb-item-drag");
      document.body.classList.remove("pb-dragging");
      drop.style.display = "none";
    }
    itemDrag = null;
  }
  document.addEventListener("pointercancel", cancelItemDrag);

  document.addEventListener("pointermove", (e) => {
    if (!itemDrag) return;
    if (!itemDrag.started) {
      if (Math.hypot(e.clientX - itemDrag.startX, e.clientY - itemDrag.startY) < 6) return;
      itemDrag.started = true;
      itemDrag.item.classList.add("pb-item-drag");
      document.body.classList.add("pb-dragging");
    }
    showItemDropAt(itemDrag, itemDropIndex(itemDrag, e));
  });

  document.addEventListener("pointerup", (e) => {
    if (!itemDrag) return;
    const d = itemDrag;
    itemDrag = null;
    if (!d.started) return;
    d.item.classList.remove("pb-item-drag");
    document.body.classList.remove("pb-dragging");
    drop.style.display = "none";
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    const from = galleryItemEls(d.gallery).indexOf(d.item);
    post({
      type: "itemReorder",
      id: d.gallery.getAttribute("data-pb-id"),
      from,
      dropIndex: itemDropIndex(d, e),
    });
  });

  // ---- drag to reorder
  let dragging = false;
  let dragId = null;

  function dropIndexForY(y) {
    const els = blockEls();
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return i;
    }
    return els.length;
  }

  function showDropAt(index) {
    const els = blockEls();
    let top;
    if (els.length === 0) return;
    if (index >= els.length) {
      const r = els[els.length - 1].getBoundingClientRect();
      top = r.bottom + 6;
    } else {
      const r = els[index].getBoundingClientRect();
      top = r.top - 6;
    }
    const cr = content.getBoundingClientRect();
    drop.style.display = "block";
    drop.style.top = top + "px";
    drop.style.left = cr.left + "px";
    drop.style.width = cr.width + "px";
    drop.style.height = "3px"; // reset from any previous item-drag (vertical bar)
  }

  handle.querySelector(".pb-grip").addEventListener("pointerdown", (e) => {
    if (!hoverEl) return;
    e.preventDefault();
    dragging = true;
    dragId = hoverEl.getAttribute("data-pb-id");
    document.body.classList.add("pb-dragging");

    const move = (ev) => showDropAt(dropIndexForY(ev.clientY));
    const up = (ev) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.body.classList.remove("pb-dragging");
      drop.style.display = "none";
      dragging = false;
      post({ type: "reorder", id: dragId, dropIndex: dropIndexForY(ev.clientY) });
      dragId = null;
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  });

  setMode("edit");
  post({ type: "ready" });
})();
