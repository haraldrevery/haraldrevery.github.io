/*
 * Transient status line, ported from v1's ui/dom.ts:42-53. The rest of that
 * module (el/modal/confirm helpers) is gone — Puck owns the editor chrome now —
 * but media.ts still needs a way to report a rejected file or a failed read
 * without throwing, so this one function survives on its own.
 *
 * Styling lives in src/style.css (#pb-toast), imported by main.tsx.
 */

let toastTimer: ReturnType<typeof setTimeout>;

export function toast(msg: string, isError = false): void {
  let node = document.getElementById("pb-toast");
  if (!node) {
    node = document.createElement("div");
    node.id = "pb-toast";
    document.body.appendChild(node);
  }
  node.textContent = msg;
  node.classList.toggle("error", isError);
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 3200);
}
