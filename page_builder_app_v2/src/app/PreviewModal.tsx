/*
 * Full-page preview.
 *
 * Puck's editor frame shows the content region with the real site CSS, but
 * nothing else: no <nav>, no <footer>, no GLightbox, no Alpine, and the entry
 * animations are deliberately frozen (SiteFrame.tsx). This modal is the other
 * half — the finished page, running.
 *
 * The iframe NAVIGATES to the repo server rather than using srcDoc, which is
 * what makes it the real thing: root-absolute URLs resolve natively, deferred
 * scripts execute, @font-face loads same-origin. It also keeps author-supplied
 * script (Raw blocks, markdown with html:true) on 127.0.0.1 — cross-origin to
 * the app, so it cannot reach the Tauri IPC the way a srcDoc frame's script can.
 *
 * The document itself lives in Rust memory, handed over by setPreviewHtml before
 * this mounts. Nothing is written to the repo.
 */
import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { previewOrigin } from "../appConfig";
import { setPreviewHtml } from "./project";

export type PreviewTheme = "system" | "light" | "dark";

const THEMES: PreviewTheme[] = ["system", "light", "dark"];

/// The site has no data-theme — dark mode is pure prefers-color-scheme, so the
/// only lever is the window's own theme. That tints the whole builder, not just
/// the iframe; "system" hands control back to the OS.
export const applyWindowTheme = (t: PreviewTheme) =>
  getCurrentWindow().setTheme(t === "system" ? null : t);

/*
 * Open on whatever the EDITOR is currently showing, not on "system".
 *
 * WebKitGTK does not resolve prefers-color-scheme identically for Puck's srcDoc
 * frame and for a frame navigated to http://127.0.0.1 — on a GTK dark theme
 * with color-scheme left at "default", the editor renders dark and the preview
 * came up light. Pinning the window theme to the app document's own resolved
 * scheme makes the two agree by construction. "System" is still there to drop
 * the override.
 */
const editorScheme = (): PreviewTheme =>
  window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";

export function PreviewModal({
  previewPort,
  title,
  onClose,
  onReload,
}: {
  previewPort: number;
  title: string;
  onClose: () => void;
  /// Re-renders the page from the live editor state and re-hands it to Rust.
  /// Resolves once the new document is in place.
  onReload: () => Promise<void>;
}) {
  // Cache-buster. The route sends no-store, but bumping the src is also what
  // forces a fresh navigation — see the note on reload() below.
  const [nonce, setNonce] = useState(() => Date.now());
  const [theme, setTheme] = useState<PreviewTheme>(editorScheme);
  const [busy, setBusy] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /*
   * Pin the editor's scheme on mount, and put exactly that back on unmount —
   * NOT "system". setTheme(null) is not the same as never having called
   * setTheme: on a GTK dark theme with color-scheme "default", releasing the
   * override resolves to light, so restoring "system" would leave the editor
   * lighter than it was before the preview was ever opened.
   *
   * The document is released here too, so neither it nor the theme can outlive
   * the modal — including when App unmounts it from the close guard.
   */
  useEffect(() => {
    const initial = editorScheme();
    void applyWindowTheme(initial);
    return () => {
      void applyWindowTheme(initial);
      void setPreviewHtml("");
    };
  }, []);

  const pick = (t: PreviewTheme) => {
    setTheme(t);
    void applyWindowTheme(t);
  };

  /*
   * Reload must re-point src, NOT call iframe.contentWindow.location.reload().
   * The preview's nav and back-links are live, so by the time you press this
   * you may have clicked through to /notebook.html on the repo server; reload()
   * would faithfully reload THAT page instead of returning to your draft.
   */
  const reload = async () => {
    setBusy(true);
    try {
      await onReload();
      setNonce(Date.now());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pb-preview">
      <header className="pb-preview__bar">
        <strong className="pb-preview__title">{title || "Untitled"}</strong>
        <span className="pb-preview__note">
          Styling reflects the last Tailwind build — keep <code>dev.sh</code> running if
          you added new classes.
        </span>

        <div className="pb-preview__themes" role="group" aria-label="Colour scheme">
          {THEMES.map((t) => (
            <button
              key={t}
              type="button"
              className={t === theme ? "is-current" : ""}
              onClick={() => pick(t)}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="pb-preview__ops">
          <button type="button" onClick={() => void reload()} disabled={busy}>
            {busy ? "Rendering…" : "Reload"}
          </button>
          <button type="button" className="pb-preview__close" onClick={onClose}>
            Close (Esc)
          </button>
        </div>
      </header>

      <iframe
        className="pb-preview__frame"
        title="Page preview"
        src={`${previewOrigin(previewPort)}/__pb/preview?t=${nonce}`}
      />
    </div>
  );
}
