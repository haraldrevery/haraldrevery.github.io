/*
 * Keyboard behaviour Puck does not provide.
 *
 * Puck binds z / y / i itself, on the PARENT document only and on the bubble
 * phase. Two consequences drive everything here.
 */
import { useEffect } from "react";

const isTypingTarget = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.isContentEditable === true
  );
};

/*
 * Ctrl/Cmd+S. Registered on the parent document AND on the preview iframe's
 * document: keydown does not cross document boundaries, so with focus inside
 * the preview the parent listener never fires. (Puck's own hotkey monitor has
 * the same blind spot; it only ever attaches to the parent.)
 */
export function useSaveShortcut(onSave: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSave();
      }
    };

    const docs = new Set<Document>([document]);
    const frame = document.querySelector("iframe");
    if (frame?.contentDocument) docs.add(frame.contentDocument);
    docs.forEach((d) => d.addEventListener("keydown", handler));

    // The iframe mounts asynchronously, so poll briefly for it rather than
    // assuming it exists at effect time.
    const t = setInterval(() => {
      const f = document.querySelector("iframe");
      if (f?.contentDocument && !docs.has(f.contentDocument)) {
        docs.add(f.contentDocument);
        f.contentDocument.addEventListener("keydown", handler);
      }
    }, 1000);

    return () => {
      clearInterval(t);
      docs.forEach((d) => d.removeEventListener("keydown", handler));
    };
  }, [onSave]);
}

/*
 * Stop Ctrl/Cmd+Z and Ctrl/Cmd+Y from reaching Puck while the caret is in a
 * text field.
 *
 * Puck's undo handler does not check where focus is, so typing a paragraph and
 * pressing Ctrl+Z undoes the last STRUCTURAL change instead of the last few
 * characters — surprising, and a regression from v1, which checked for
 * INPUT/TEXTAREA before acting.
 *
 * This listens on the CAPTURE phase so it runs before Puck's bubble-phase
 * handler, and only calls stopPropagation — the keystroke still reaches the
 * field, where the browser's native text undo handles it.
 */
export function useTextUndoShim() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k !== "z" && k !== "y") return;
      if (isTypingTarget(e.target)) e.stopPropagation();
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, []);
}
