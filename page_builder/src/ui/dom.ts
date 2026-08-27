/* Tiny DOM helpers — no framework, per the site's low-JS philosophy. */

type Child = Node | string | null | undefined;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "class") node.className = String(v);
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2), v as EventListener);
    } else if (k === "checked" || k === "disabled" || k === "open" || k === "selected") {
      if (v) node.setAttribute(k, "");
      (node as unknown as Record<string, unknown>)[k] = v;
    } else if (k === "value") {
      (node as HTMLInputElement).value = String(v);
    } else {
      node.setAttribute(k, String(v));
    }
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string, isError = false): void {
  let node = document.getElementById("pb-toast");
  if (!node) {
    node = el("div", { id: "pb-toast" });
    document.body.appendChild(node);
  }
  node.textContent = msg;
  node.classList.toggle("error", isError);
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node!.classList.remove("show"), 3200);
}

// ---------------------------------------------------------------- modals

function openModal(content: HTMLElement, onClose: () => void): () => void {
  const overlay = el("div", { class: "modal-overlay" }, content);
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    onClose();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  return close;
}

export function promptModal(
  title: string,
  defaultValue = "",
  hint = ""
): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    // resolve BEFORE close(): close fires the modal's onClose, and resolving
    // there first would make every confirmation come back as null
    const finish = (v: string | null) => {
      if (done) return;
      done = true;
      resolve(v);
      close();
    };
    const input = el("input", { type: "text", value: defaultValue }) as HTMLInputElement;
    const box = el(
      "div",
      { class: "modal-box" },
      el("h3", {}, title),
      hint ? el("p", { class: "hint" }, hint) : null,
      input,
      el(
        "div",
        { class: "modal-actions" },
        el("button", { class: "secondary", onclick: () => finish(null) }, "Cancel"),
        el("button", { onclick: () => finish(input.value.trim() || null) }, "OK")
      )
    );
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish(input.value.trim() || null);
    });
    const close = openModal(box, () => {
      if (!done) {
        done = true;
        resolve(null);
      }
    });
    input.focus();
    input.select();
  });
}

export interface ListItem<T> {
  label: string;
  hint?: string;
  value: T;
}

export function listModal<T>(title: string, items: ListItem<T>[]): Promise<T | null> {
  return new Promise((resolve) => {
    let done = false;
    // same ordering rule as promptModal: resolve before close()
    const finish = (v: T | null) => {
      if (done) return;
      done = true;
      resolve(v);
      close();
    };
    const list = el(
      "div",
      { class: "modal-list" },
      ...items.map((it) =>
        el(
          "button",
          { class: "modal-list-item", onclick: () => finish(it.value) },
          el("span", {}, it.label),
          it.hint ? el("span", { class: "hint" }, it.hint) : null
        )
      )
    );
    const box = el(
      "div",
      { class: "modal-box" },
      el("h3", {}, title),
      items.length ? list : el("p", { class: "hint" }, "Nothing here yet."),
      el(
        "div",
        { class: "modal-actions" },
        el("button", { class: "secondary", onclick: () => finish(null) }, "Cancel")
      )
    );
    const close = openModal(box, () => {
      if (!done) {
        done = true;
        resolve(null);
      }
    });
  });
}

/// Free-form modal for custom content (shell diff view etc.).
export function contentModal(title: string, content: HTMLElement): () => void {
  const box = el("div", { class: "modal-box modal-wide" }, el("h3", {}, title), content);
  const close = openModal(box, () => {});
  box.appendChild(
    el(
      "div",
      { class: "modal-actions" },
      el("button", { class: "secondary", onclick: () => close() }, "Close")
    )
  );
  return close;
}
