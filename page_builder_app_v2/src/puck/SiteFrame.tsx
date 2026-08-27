/*
 * Puck renders its preview into an iframe. This override injects the REAL site
 * CSS into that iframe's document, so what you edit looks like the published
 * page — the same property v1 got by navigating the iframe to /__pb/preview.
 *
 * The mechanism is a single <base href="http://127.0.0.1:PORT/"> pointing at
 * the tiny_http server that serves the repo root. Root-absolute URLs like
 * /photos/a.jpg resolve against the base origin, so every image, video, audio
 * and font reference redirects at the BROWSER level, with zero change to the
 * emitted markup. Preview and export therefore render byte-identical HTML —
 * one render path, which is the whole point of the rewrite.
 *
 * Deliberately NOT done: importing main.css into the app bundle and letting
 * Puck's CopyHostStyles mirror it in. Tailwind's preflight is global and would
 * wreck the Puck editor chrome.
 *
 * NOTE Puck's frame is srcDoc, so it inherits the PARENT's origin. Fonts are
 * the one subresource type that is CORS-gated; server.rs sends
 * Access-Control-Allow-Origin for that reason. Without it the preview silently
 * falls back to a system font.
 */
import { useEffect } from "react";
import type { Overrides } from "@measured/puck";
import { usePuck } from "@measured/puck";
import { previewOrigin } from "../appConfig";

/// Edit-mode neutralisation. The site's entry animations all start at
/// opacity:0 and play once; in the editor, dangerouslySetInnerHTML regenerates
/// the word_animation spans on every keystroke, so text would re-fade
/// continuously and half the page would sit invisible. Toggled by previewMode,
/// so Puck's built-in Ctrl/Cmd+I plays the real animations — that IS v1's
/// edit/preview mode toggle, for free.
const FRAME_CSS = `
html.pb-editing .extra_fade_effect,
html.pb-editing .extra_fade_effect_long,
html.pb-editing .word_animation,
html.pb-editing #scroll-prompt {
  animation: none !important;
  opacity: 1 !important;
  transform: none !important;
}
/* Links must not navigate the editor away from itself. */
html.pb-editing a { pointer-events: none; }
/* The frame has no <nav>, so nothing should reserve space for a fixed bar
   beyond the pt-24 the root render already carries. */
html.pb-editing .scroll-sentinel { display: none; }

/* Placeholder for a block with no content yet (EmptyHint.tsx). Rendered only
   while editing, so it never reaches a published page. */
.pb-empty-hint {
  border: 1px dashed currentColor;
  border-radius: 6px;
  padding: 14px 16px;
  margin-bottom: 4rem;
  opacity: 0.45;
  font: 400 0.85rem/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  text-align: center;
}
`;

export function makeSiteFrame(previewPort: number): Overrides["iframe"] {
  return function SiteFrame({ children, document: doc }) {
    // usePuck() returns the whole store; only createUsePuck() takes a selector.
    const previewMode = usePuck().appState.ui.previewMode;

    useEffect(() => {
      if (!doc || !previewPort) return;
      const origin = previewOrigin(previewPort);

      const base = doc.createElement("base");
      base.href = `${origin}/`;
      const links = ["/main.css", "/prose.css"].map((href) => {
        const l = doc.createElement("link");
        l.rel = "stylesheet";
        l.href = origin + href;
        return l;
      });
      const style = doc.createElement("style");
      style.textContent = FRAME_CSS;

      // <base> must be FIRST in <head> — it only affects elements that follow it.
      const apply = () => {
        doc.head.prepend(base);
        doc.head.append(...links, style);
      };
      apply();

      // Puck's CopyHostStyles clears the frame head (doc.head.innerHTML = "")
      // inside a promise callback, i.e. AFTER this synchronous child effect has
      // run. Re-apply whenever our nodes are removed.
      const obs = new MutationObserver(() => {
        if (!doc.head.contains(base)) apply();
      });
      obs.observe(doc.head, { childList: true });

      // Mirror shell.html's <html>/<body> attributes so the site's dark-mode
      // and base text colours apply (shell.html:53).
      doc.documentElement.lang = "en";
      doc.body.className = "min-h-screen text-black dark:text-white";

      return () => {
        obs.disconnect();
        [base, ...links, style].forEach((n) => n.remove());
      };
    }, [doc]);

    useEffect(() => {
      doc?.documentElement.classList.toggle("pb-editing", previewMode === "edit");
    }, [doc, previewMode]);

    return <>{children}</>;
  };
}
