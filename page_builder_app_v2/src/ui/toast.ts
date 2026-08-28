/*
 * Transient status line, originally ported from v1's ui/dom.ts:42-53.
 *
 * Now a STACK rather than a single node. The old version reused one element and
 * one timer, which meant any later message overwrote whatever was showing —
 * including an error. That is the channel that reports "SVG could not be read"
 * and "missing on disk", and those were routinely erased by the informational
 * toast that followed them a moment later.
 *
 * Errors also persist until dismissed instead of expiring on a timer: an error
 * is a thing the user has to act on, and a 3.2s window is not long enough to
 * read a path, let alone act on it. Informational toasts still auto-dismiss.
 *
 * Styling lives in src/style.css (#pb-toasts), imported by main.tsx.
 */

const INFO_MS = 3200;
/// Enough to keep a burst readable without letting the stack grow unbounded —
/// the export fix-up pass can report several missing files at once.
const MAX = 4;

function host(): HTMLElement {
  let el = document.getElementById("pb-toasts");
  if (!el) {
    el = document.createElement("div");
    el.id = "pb-toasts";
    document.body.appendChild(el);
  }
  return el;
}

function dismiss(node: HTMLElement): void {
  if (!node.isConnected) return;
  node.classList.remove("show");
  // Outlast the CSS transition, then remove — leaving the nodes in place would
  // keep the stack growing invisibly and shift later toasts off screen.
  setTimeout(() => node.remove(), 250);
}

export function toast(msg: string, isError = false): void {
  const parent = host();

  /*
   * Collapse an identical message already showing into a counter instead of
   * stacking duplicates. Re-checking files re-reports the same missing path,
   * and three copies of one line is noise, not emphasis.
   */
  const existing = Array.from(parent.children).find(
    (c) => (c as HTMLElement).dataset.msg === msg,
  ) as HTMLElement | undefined;
  if (existing) {
    const n = Number(existing.dataset.count ?? "1") + 1;
    existing.dataset.count = String(n);
    existing.textContent = `${msg}  ×${n}`;
    return;
  }

  const node = document.createElement("div");
  node.className = `pb-toast${isError ? " error" : ""}`;
  node.dataset.msg = msg;
  node.textContent = msg;
  // Any toast can be dismissed by clicking it; for errors that is the only way.
  node.title = "Click to dismiss";
  node.addEventListener("click", () => dismiss(node));
  parent.appendChild(node);

  // Next frame, so the transition actually runs from the hidden state.
  requestAnimationFrame(() => node.classList.add("show"));

  while (parent.children.length > MAX) dismiss(parent.firstElementChild as HTMLElement);

  if (!isError) setTimeout(() => dismiss(node), INFO_MS);
}
