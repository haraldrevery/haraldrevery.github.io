/* =====================================================================
   RVRY_ASCII — image cropper (modal, pointer-driven, no dependencies)
   RVRY.openCropper(image, initialImgRect, onApply, onReset)
     image          : HTMLImageElement | HTMLCanvasElement (has natural size)
     initialImgRect : {x,y,w,h} in image pixels to restore, or null
     onApply(canvas, rect) : cropped canvas + rect in image pixels
     onReset()             : user chose "Use full image"
   Drag inside the box to move, drag a handle to resize, drag outside to
   draw a fresh selection.
   ===================================================================== */
(function (global) {
  "use strict";
  const RVRY = global.RVRY || (global.RVRY = {});

  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  const MIN = 10; // minimum selection size in display px

  function openCropper(image, initialImgRect, onApply, onReset) {
    const natW = image.naturalWidth || image.width;
    const natH = image.naturalHeight || image.height;
    if (!natW || !natH) return;

    // fit the image into the viewport
    const maxW = Math.min(window.innerWidth * 0.9, 1200);
    const maxH = window.innerHeight * 0.72;
    const scale = Math.min(maxW / natW, maxH / natH, 1);
    const dispW = Math.max(1, Math.round(natW * scale));
    const dispH = Math.max(1, Math.round(natH * scale));

    /* ---- DOM ---- */
    const overlay = el("div", "crop-overlay");
    const modal = el("div", "crop-modal");
    const head = el("div", "crop-head");
    head.innerHTML = '<span class="crop-title">Crop image</span>' +
      '<span class="crop-dims mono" id="crop-dims"></span>';
    const stage = el("div", "crop-stage");
    stage.style.width = dispW + "px";
    stage.style.height = dispH + "px";

    const cv = el("canvas");
    cv.width = dispW; cv.height = dispH;
    cv.getContext("2d").drawImage(image, 0, 0, dispW, dispH);
    stage.appendChild(cv);

    const box = el("div", "crop-box");
    stage.appendChild(box);
    const handleEls = {};
    HANDLES.forEach((d) => {
      const h = el("div", "crop-handle h-" + d);
      h.dataset.dir = d;
      box.appendChild(h);
      handleEls[d] = h;
    });

    const actions = el("div", "crop-actions");
    const btnFull = el("button", "btn ghost"); btnFull.textContent = "Use full image";
    const btnCancel = el("button", "btn ghost"); btnCancel.textContent = "Cancel";
    const btnApply = el("button", "btn primary"); btnApply.textContent = "Apply crop";
    actions.append(btnFull, btnCancel, btnApply);

    modal.append(head, stage, actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    /* ---- selection state (display coords) ---- */
    let rect;
    if (initialImgRect) {
      rect = {
        x: clamp(initialImgRect.x * scale, 0, dispW),
        y: clamp(initialImgRect.y * scale, 0, dispH),
        w: clamp(initialImgRect.w * scale, MIN, dispW),
        h: clamp(initialImgRect.h * scale, MIN, dispH)
      };
    } else {
      rect = { x: 0, y: 0, w: dispW, h: dispH };
    }

    const dims = head.querySelector("#crop-dims");
    function paint() {
      box.style.left = rect.x + "px";
      box.style.top = rect.y + "px";
      box.style.width = rect.w + "px";
      box.style.height = rect.h + "px";
      dims.textContent = `${Math.round(rect.w / scale)} × ${Math.round(rect.h / scale)} px`;
    }
    function clampRect() {
      rect.w = clamp(rect.w, MIN, dispW);
      rect.h = clamp(rect.h, MIN, dispH);
      rect.x = clamp(rect.x, 0, dispW - rect.w);
      rect.y = clamp(rect.y, 0, dispH - rect.h);
    }
    clampRect(); // keep a restored selection inside the stage
    paint();

    /* ---- pointer interaction ---- */
    let drag = null; // { mode, dir, sx, sy, start:{...} }
    const localPt = (e) => {
      const r = stage.getBoundingClientRect();
      return { x: clamp(e.clientX - r.left, 0, dispW), y: clamp(e.clientY - r.top, 0, dispH) };
    };

    stage.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const p = localPt(e);
      const dir = e.target && e.target.dataset ? e.target.dataset.dir : null;
      if (dir) {
        drag = { mode: "resize", dir, sx: p.x, sy: p.y, start: Object.assign({}, rect) };
      } else if (p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h) {
        drag = { mode: "move", sx: p.x, sy: p.y, start: Object.assign({}, rect) };
      } else {
        // Draw a new selection from here. The anchor carries zero size — a
        // MIN-sized one made the moving edge run MIN px ahead of the cursor,
        // since it is measured as start + size + delta. clampRect() below
        // still enforces the minimum once the drag is under way.
        // `rect` itself is left alone until the pointer actually moves: a bare
        // click outside the box must not replace the current selection with a
        // MIN-sized one. The resize branch assigns all four fields, so the
        // first move overwrites it completely and nothing stale survives.
        drag = { mode: "resize", dir: "se", sx: p.x, sy: p.y,
                 start: { x: p.x, y: p.y, w: 0, h: 0 } };
      }
      stage.setPointerCapture(e.pointerId);
    });

    stage.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const p = localPt(e);
      const dx = p.x - drag.sx, dy = p.y - drag.sy;
      if (!dx && !dy) return;   // a click can emit a zero-distance move; it changes nothing
      const s = drag.start;
      if (drag.mode === "move") {
        rect.x = s.x + dx; rect.y = s.y + dy;
      } else {
        const d = drag.dir;
        let left = s.x, top = s.y, right = s.x + s.w, bottom = s.y + s.h;
        if (d.includes("w")) left = s.x + dx;
        if (d.includes("e")) right = s.x + s.w + dx;
        if (d.includes("n")) top = s.y + dy;
        if (d.includes("s")) bottom = s.y + s.h + dy;
        rect.x = Math.min(left, right);
        rect.y = Math.min(top, bottom);
        rect.w = Math.max(MIN, Math.abs(right - left));
        rect.h = Math.max(MIN, Math.abs(bottom - top));
      }
      clampRect();
      paint();
    });

    const endDrag = (e) => {
      if (drag && stage.hasPointerCapture && stage.hasPointerCapture(e.pointerId)) {
        stage.releasePointerCapture(e.pointerId);
      }
      drag = null;
    };
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);

    /* ---- close / actions ---- */
    /* Enter runs apply() from the document handler, and if the Apply button
       holds focus the browser's synthesized click on it can run apply() a
       second time. One flag makes both close() and apply() one-shot, so the
       crop is never delivered twice. */
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKey);
      overlay.remove();
    }
    function onKey(e) {
      if (e.key === "Escape") { close(); }
      else if (e.key === "Enter") { apply(); }
    }
    document.addEventListener("keydown", onKey);

    function apply() {
      if (closed) return;
      // origin leaves ≥1px of image so the size clamps below stay valid (hi ≥ 1)
      const ox = clamp(Math.round(rect.x / scale), 0, natW - 1);
      const oy = clamp(Math.round(rect.y / scale), 0, natH - 1);
      const ow = clamp(Math.round(rect.w / scale), 1, natW - ox);
      const oh = clamp(Math.round(rect.h / scale), 1, natH - oy);
      const out = el("canvas");
      out.width = ow; out.height = oh;
      out.getContext("2d").drawImage(image, ox, oy, ow, oh, 0, 0, ow, oh);
      close();
      onApply(out, { x: ox, y: oy, w: ow, h: oh });
    }

    btnApply.addEventListener("click", apply);
    btnCancel.addEventListener("click", close);
    btnFull.addEventListener("click", () => { close(); if (onReset) onReset(); });
    overlay.addEventListener("pointerdown", (e) => { if (e.target === overlay) close(); });
  }

  RVRY.openCropper = openCropper;
})(window);
