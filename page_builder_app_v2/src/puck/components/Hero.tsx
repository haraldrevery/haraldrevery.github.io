/*
 * Full-viewport page opener. Transcribed from
 * page_builder/src/blocks/render.ts:509-619 — v1's single largest renderer
 * (114 lines of nested conditional string assembly).
 *
 * The hero is NOT a body block. It lives in Puck's root props and renders into
 * shell.html's {{HERO}} slot, before the page container. That placement is why
 * v1 needed a "hero is always first" invariant duplicated across addBlock,
 * moveBlock, reorderBlock and normalize — as a root field there is exactly one,
 * it is always first, and it cannot be dragged or nested. See PageRoot.tsx.
 *
 * Built only from classes already in main.css (release-hero, bg-dot-grid,
 * extra_fade_effect, word_animation, #scroll-prompt). Zero JS; the only
 * exception is the shell-level navi_mechanic nav-reveal fallback script, which
 * export.ts wires up from `navReveal`.
 */
import type { CSSProperties, ReactNode } from "react";
import { wrapPlainWords } from "../../blocks/wordAnimate";
import { getSvgText, themeSvgText, prepareSvgForInline } from "../../blocks/svgStore";
import type { PickedImage } from "../fields/mediaField";

export interface HeroProps {
  background: "none" | "dots" | "backdrop" | "cover";
  /// Cover scrim tint: dark scrim + white text, or light scrim + dark text.
  coverStyle: "dark" | "light";
  /// One prop, not two: a custom field's onChange can only write its own prop,
  /// so the full-size path and its _min twin have to travel together.
  /// (v1 stored these as flat `image` + `imageThumb`; the rendered markup is
  /// unchanged — the backdrop uses the thumb, the cover the full-size photo.)
  image: PickedImage;
  showSvg: boolean;
  svgSrc: string;
  svgWidthPct: number;
  svgX: number;
  svgY: number;
  kicker: string;
  title: string;
  tagline: string;
  align: "left" | "center";
  /// Foreground in-animation.
  anim: "none" | "fade" | "words";
  /// Nav slides in on scroll (navi_mechanic, like index/release pages).
  navReveal: boolean;
  backLink: boolean;
  /// Custom "scroll down" text ("" = off); fades in like index.html.
  scrollPrompt: string;
  id?: string;
}

/// Matches v1's escText (render.ts:59).
const escText = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/// The shell's normal static back link, used when there is NO hero. With a
/// hero, the hero renders the one-and-only fade-in version instead. The mb-16
/// wrapper is what separates it from the first content block — the inline-flex
/// <a> carries no margin of its own.
export const STATIC_BACKLINK =
  '<div class="mb-16">\n   <a href="/notebook.html" class="inline-flex items-center text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors font-mono text-sm uppercase tracking-wider">\n   ← Back to Notebook\n   </a>\n</div>';

const BACKLINK_CLASS =
  "extra_fade_effect_long inline-flex items-center text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors font-mono text-sm uppercase tracking-wider";

export function Hero(p: HeroProps): ReactNode {
  const center = p.align === "center";
  const cover = p.background === "cover";
  const lightCover = cover && p.coverStyle === "light";
  const words = p.anim === "words";
  const fade = p.anim === "fade" || words; // words-mode svg still fades
  const seed = p.id ?? "";

  // ---- background layers
  let media: ReactNode = null;
  const img = p.image ?? { full: "", thumb: "" };
  if ((p.background === "backdrop" || cover) && (img.full || img.thumb)) {
    if (cover) {
      // Sharp full-bleed cover with a long fade-out into the page.
      const maskImage = "linear-gradient(#000 72%,transparent 100%)";
      const scrim = lightCover
        ? "linear-gradient(rgba(255,255,255,.74),rgba(255,255,255,.47) 45%,rgba(255,255,255,0) 90%)"
        : "linear-gradient(rgba(0,0,0,.74),rgba(0,0,0,.47) 45%,rgba(0,0,0,0) 90%)";
      media = (
        <>
          <img
            src={img.full || img.thumb}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ zIndex: -2, WebkitMaskImage: maskImage, maskImage } as CSSProperties}
            // Spread as a plain lowercase attribute, NOT React's fetchPriority
            // prop. The prop makes React 19 hoist a <link rel="preload"> into
            // the output — which would land inside shell.html's {{HERO}} slot,
            // in the body — and emit camelCase `fetchPriority` in the HTML.
            {...{ fetchpriority: "high" }}
          />
          <div className="absolute inset-0" style={{ zIndex: -1, background: scrim }} />
        </>
      );
    } else {
      media = (
        <>
          <div
            className="release-hero__backdrop"
            style={{ backgroundImage: `url('${img.thumb || img.full}')` }}
          />
          <div className="release-hero__scrim" />
        </>
      );
    }
  }

  // ---- foreground text: per-word spans, or plain text React escapes itself
  const textProps = (raw: string, field: string) =>
    words
      ? { dangerouslySetInnerHTML: { __html: wrapPlainWords(escText(raw), `${seed}:${field}`) } }
      : { children: raw };

  // An svg on a left-aligned page goes in a right column (release-hero__grid);
  // centred pages stack it above the text.
  const sideBySide = p.showSvg && !!p.svgSrc && !center;

  let svg: ReactNode = null;
  if (p.showSvg && p.svgSrc) {
    const svgText = getSvgText(p.svgSrc);
    let inner: ReactNode;
    if (svgText !== undefined) {
      let s = prepareSvgForInline(themeSvgText(svgText));
      if (p.title) s = s.replace(/<svg/i, `<svg role="img" aria-label="${escapeAttr(p.title)}"`);
      inner = <span dangerouslySetInnerHTML={{ __html: s }} />;
    } else {
      inner = <div className="font-mono text-sm text-neutral-500">[svg {p.svgSrc} not loaded]</div>;
    }
    const w = Math.max(5, Math.min(100, Math.round(p.svgWidthPct || 40)));
    svg = (
      <div
        className={`mx-auto${fade ? " extra_fade_effect" : ""}`}
        style={{
          width: `${w}%`,
          ...(p.svgX || p.svgY
            ? { transform: `translate(${p.svgX || 0}%,${p.svgY || 0}%)` }
            : {}),
          ...(sideBySide ? {} : { marginBottom: "2.5rem" }),
        }}
      >
        {inner}
      </div>
    );
  }

  const kicker = p.kicker ? <p className="release-hero__kicker" {...textProps(p.kicker, "kicker")} /> : null;
  const title = p.title ? <h1 className="release-hero__title" {...textProps(p.title, "title")} /> : null;
  const tagline = p.tagline ? (
    <p className={`release-hero__tagline${center ? " mx-auto" : ""}`} {...textProps(p.tagline, "tagline")} />
  ) : null;

  // `fade` animates the whole text box unless the words animate individually.
  const textBoxCls = fade && !words ? "extra_fade_effect" : undefined;

  const sectionCls = "release-hero" + (p.background === "dots" ? " bg-dot-grid" : "");
  // The cover tint follows the PHOTO, not the site theme: the scrim makes the
  // backdrop predictably dark or light in BOTH modes, so the text colour must be
  // forced to match. Inheriting `text-black dark:text-white` would put white
  // text on the light scrim in dark mode.
  const innerCls =
    "page-container release-hero__inner" +
    (center ? " text-center" : "") +
    (cover ? (lightCover ? " text-black" : " text-white") : "");

  const hasPrompt = !!p.scrollPrompt.trim();

  return (
    <>
      <section className={sectionCls}>
        {media}
        <div className={innerCls}>
          {sideBySide ? (
            <div className="release-hero__grid">
              <div className={textBoxCls}>
                {kicker}
                {title}
                {tagline}
              </div>
              <div>{svg}</div>
            </div>
          ) : (
            <div className={textBoxCls}>
              {svg}
              {kicker}
              {title}
              {tagline}
            </div>
          )}
        </div>

        {/* One back link, aligned to the page container's left content edge.
            With the scroll prompt on too, both sit on the same bottom row. */}
        {p.backLink && (
          <div
            className="page-container"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: hasPrompt ? "2.5rem" : "1.5rem",
              zIndex: 20,
            }}
          >
            <a href="/notebook.html" className={BACKLINK_CLASS}>
              ← Back to Notebook
            </a>
          </div>
        )}

        {/* index.html-style delayed scroll prompt; #scroll-prompt CSS does the
            fade. Line breaks become <br>, e.g. "Welcome! <br> Scroll down". */}
        {hasPrompt && (
          <a
            href="#enter_site"
            id="scroll-prompt"
            className="absolute text-center bottom-10 text-black dark:text-white hover:text-neutral-500 dark:hover:text-neutral-300 transition-colors opacity-0 cursor-pointer z-50"
            style={{ left: "50%", transform: "translateX(-50%)" }}
            dangerouslySetInnerHTML={{
              __html: escText(p.scrollPrompt.trim()).replace(/\n/g, " <br> "),
            }}
          />
        )}
      </section>
      {/* Scroll target, deliberately OUTSIDE the section — matches v1. */}
      {hasPrompt && <div id="enter_site" />}
    </>
  );
}

function escapeAttr(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
