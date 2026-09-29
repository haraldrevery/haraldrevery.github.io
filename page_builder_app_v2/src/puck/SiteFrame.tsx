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
 * Puck copy it in. Tailwind's preflight is global and would wreck the editor
 * chrome. Copying host styles is switched off altogether (iframe.syncHostStyles
 * in App.tsx), so this override is the ONLY source of page CSS in the frame.
 *
 * NOTE Puck's frame is srcDoc, so it inherits the PARENT's origin. Fonts are
 * the one subresource type that is CORS-gated; server.rs sends
 * Access-Control-Allow-Origin for that reason. Without it the preview silently
 * falls back to a system font.
 */
import { useEffect } from "react";
import type { Overrides } from "@puckeditor/core";
import { previewOrigin } from "../appConfig";
import { usePuckState } from "./usePuckState";

/// Edit-mode neutralisation. The site's entry animations all start at
/// opacity:0 and play once; in the editor, dangerouslySetInnerHTML regenerates
/// the word_animation spans on every keystroke, so text would re-fade
/// continuously and half the page would sit invisible. Toggled by previewMode,
/// so Puck's built-in Ctrl/Cmd+I plays the real animations — that IS v1's
/// edit/preview mode toggle, for free.
const FRAME_CSS = `
html.pb-editing .fade_effect,
html.pb-editing .fade_effect_long,
html.pb-editing .word_animation,
html.pb-editing #scroll-prompt {
  animation: none !important;
  opacity: 1 !important;
  transform: none !important;
}
/* Links must not navigate the editor away from itself. */
html.pb-editing a { pointer-events: none; }

/* ---- drag targeting -----------------------------------------------------
   Two rules main.css applies to every page, which quietly break block drag and
   drop in the editor. Both are edit-mode only; the published page keeps them.

   1. scroll-behavior: smooth is set on <html> UNCONDITIONALLY by main.css
      (not just via the .scroll-smooth class). dnd-kit autoscrolls this document
      while you drag near an edge and measures collision rects against its
      scroll offset — but with smooth scrolling every autoscroll step ANIMATES,
      so scrollTop lags behind what dnd-kit just asked for. The rects it is
      matching the pointer against are stale for the duration of the animation,
      which is exactly the "it does not drop where I aimed" symptom, and why it
      feels intermittent rather than broken: it only bites when the drag scrolls.

   2. overflow-x: hidden on html and body. Per spec, overflow-y then computes
      to auto, so <body> silently becomes a scroll container of its own and the
      frame offers dnd-kit two nested scrollers to choose between.

      Replaced with overflow-x: clip rather than visible. clip does the same
      clipping hidden does — full-bleed sections still do not spill sideways —
      but it is NOT a scroll container, so overflow-y stays visible. Verified in
      Firefox against the real main.css: hidden gives overflow-y auto, clip
      gives visible. If a webview ever lacks clip the declaration is dropped and
      main.css hidden applies again, which is todays behaviour, not a new break.

   Deliberately NOT neutralised: position: relative on body. It is a
   containing block for absolutely positioned content, so changing it could move
   real block content in the editor — a worse trade than the scroll rules. */
html.pb-editing { scroll-behavior: auto !important; }
html.pb-editing,
html.pb-editing body { overflow-x: clip !important; }
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
    const previewMode = usePuckState((s) => s.appState.ui.previewMode);

    useEffect(() => {
      if (!doc || !previewPort) return;
      const origin = previewOrigin(previewPort);

      const base = doc.createElement("base");
      base.href = `${origin}/`;
      // One stylesheet: the site merged prose.css into main.css in 2026-09.
      const links = ["/main.css"].map((href) => {
        const l = doc.createElement("link");
        l.rel = "stylesheet";
        l.href = origin + href;
        return l;
      });
      const style = doc.createElement("style");
      style.textContent = FRAME_CSS;

      // <base> first in <head>, so nothing before it resolves against the
      // editor's own origin. (Puck 0.20 wiped the frame head after this effect
      // ran and a MutationObserver put these back; 0.23 with syncHostStyles off
      // never touches it — e2e/editor.e2e.mjs would show an unstyled canvas.)
      doc.head.prepend(base);
      doc.head.append(...links, style);

      // Mirror the published page's <html>/<body> attributes so the site's
      // dark-mode and base text colours apply. The source of truth is
      // eleventy_settings/base.njk, which every builder page now renders
      // through; shell.html is generated from it.
      doc.documentElement.lang = "en";
      doc.body.className = "min-h-screen text-zinc-900 dark:text-white";

      return () => {
        [base, ...links, style].forEach((n) => n.remove());
      };
    }, [doc]);

    useEffect(() => {
      doc?.documentElement.classList.toggle("pb-editing", previewMode === "edit");
    }, [doc, previewMode]);

    return <>{children}</>;
  };
}
