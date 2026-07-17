/* Sidebar block list: mirrors preview order; select / move / duplicate / delete. */
import { ask } from "@tauri-apps/plugin-dialog";
import { el, clear } from "./dom";
import { store } from "../state";
import { blockSummary, blockMediaStatus } from "../blocks/model";

export async function confirmDelete(id: string, summary: string): Promise<void> {
  const ok = await ask(`Delete "${summary}"?\n(Ctrl+Z brings it back.)`, {
    title: "Delete block",
  });
  if (ok) store.removeBlock(id);
}

export function renderBlockList(container: HTMLElement): void {
  clear(container);
  if (!store.blocks.length) {
    container.appendChild(el("p", { class: "hint" }, "No blocks yet — add one below."));
    return;
  }
  store.blocks.forEach((b, i) => {
    const rowEl = el(
      "div",
      {
        class: "block-row" + (b.id === store.selectedId ? " selected" : ""),
        "data-id": b.id,
        onclick: () => store.select(b.id),
      },
      el(
        "span",
        { class: "block-summary" },
        ...(blockMediaStatus(b)
          ? [el("span", { class: `dot ${blockMediaStatus(b)}`, title: blockMediaStatus(b) === "ok" ? "Image metadata complete" : "Missing alt, title or description" }), " "]
          : []),
        blockSummary(b)
      ),
      el(
        "span",
        { class: "block-actions" },
        el("button", { class: "small", title: "Move up", onclick: (e: Event) => { e.stopPropagation(); store.moveBlock(b.id, -1); } }, "↑"),
        el("button", { class: "small", title: "Move down", onclick: (e: Event) => { e.stopPropagation(); store.moveBlock(b.id, 1); } }, "↓"),
        el("button", { class: "small", title: "Duplicate", onclick: (e: Event) => { e.stopPropagation(); store.duplicateBlock(b.id); } }, "⧉"),
        el("button", { class: "small danger", title: "Delete", onclick: (e: Event) => { e.stopPropagation(); void confirmDelete(b.id, blockSummary(b)); } }, "✕")
      )
    );
    void i;
    container.appendChild(rowEl);
  });
}

/// Cheap update path for keystrokes: refresh summaries + highlight only.
export function refreshBlockList(container: HTMLElement): void {
  const rows = container.querySelectorAll<HTMLElement>(".block-row");
  if (rows.length !== store.blocks.length) {
    renderBlockList(container);
    return;
  }
  store.blocks.forEach((b, i) => {
    const rowEl = rows[i];
    rowEl.classList.toggle("selected", b.id === store.selectedId);
    const summary = rowEl.querySelector(".block-summary");
    if (summary) {
      const status = blockMediaStatus(b);
      summary.replaceChildren(
        ...(status
          ? [el("span", { class: `dot ${status}`, title: status === "ok" ? "Image metadata complete" : "Missing alt, title or description" }), " "]
          : []),
        blockSummary(b)
      );
    }
  });
}
