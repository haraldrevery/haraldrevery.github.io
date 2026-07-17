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

  let mode = "edit";
  let selectedId = null;

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
  `;
  document.head.appendChild(style);

  const handle = document.createElement("div");
  handle.id = "pb-handle";
  handle.innerHTML =
    '<button class="pb-add-above" title="Insert block above">+↑</button>' +
    '<button class="pb-grip" title="Drag to reorder">⠿</button>' +
    '<button class="pb-add-below" title="Insert block below">+↓</button>';
  document.body.appendChild(handle);

  const drop = document.createElement("div");
  drop.id = "pb-drop";
  document.body.appendChild(drop);

  const post = (msg) => parent.postMessage(msg, "*");
  const blockEls = () => Array.from(content.querySelectorAll("[data-pb-id]"));

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
      content.innerHTML = m.html;
      const dateEl = document.querySelector("[data-pb-date]");
      if (dateEl) dateEl.textContent = m.dateHuman || "";
      applySelection();
      hideHandle();
      if (mode === "preview") reinitLightbox();
      if (m.scrollToId) {
        const el = content.querySelector('[data-pb-id="' + m.scrollToId + '"]');
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } else if (m.type === "select") {
      selectedId = m.id;
      applySelection();
      if (m.scroll) {
        const el = content.querySelector('[data-pb-id="' + m.id + '"]');
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } else if (m.type === "mode") {
      setMode(m.value);
    }
  });

  // ---- edit mode: swallow every click; block clicks become selections
  document.addEventListener(
    "click",
    (e) => {
      if (mode !== "edit") return;
      if (e.target.closest && e.target.closest("#pb-handle")) return;
      e.preventDefault();
      e.stopPropagation();
      const block = e.target.closest && e.target.closest("[data-pb-id]");
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
    handle.style.display = "flex";
    handle.style.top = Math.max(4, r.top - 14) + "px";
    handle.style.left = Math.min(window.innerWidth - 110, Math.max(4, r.right - 100)) + "px";
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
