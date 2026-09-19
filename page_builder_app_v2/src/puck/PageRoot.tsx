/*
 * Puck's root — the page-level state and the chrome the blocks sit inside.
 *
 * Root props carry BOTH the SEO metadata and the hero, which is the single
 * change that deletes the most v1 machinery:
 *
 *   - The hero is not in `content`, so there is exactly one, it is always
 *     first, and it cannot be dragged or nested. v1 enforced that by hand in
 *     five places (state.ts heroCount/addBlock/moveBlock/reorderBlock and
 *     normalize.ts's hero re-sort), all now gone.
 *   - Meta edits ride Puck's history for free, so v1's manual "re-render the
 *     meta form after undo" (main.ts:227) is gone too.
 *
 * The chrome mirrors the published page from <div class="bg-topology-map">
 * inward: the hero, or else the layout's date/<h1>/back-link header — taken
 * from the generated shell, so it is the layout's own markup, not a copy —
 * then the content column. The fixed <nav> is deliberately NOT rendered: it
 * is `fixed top-0 z-[200]` and would sit on top of Puck's drop targets and
 * selection overlays. Neither is the closing date rule; Preview shows the
 * whole page. Editor fidelity is "content region accurate, page chrome
 * omitted" — the authoritative check is Preview, or the Eleventy build.
 *
 * EDITOR ONLY. The export does not render this component at all: assembleFragment
 * emits the content column itself and the layout supplies the rest at build
 * time, so the export renders content through contentConfig (passthrough root)
 * and the hero separately.
 */
import type { ReactNode } from "react";
import { Hero, type HeroProps } from "./components/Hero";
import { contentColumnClass, shellHeader } from "../export/export";
import { useShell } from "../export/shellStore";
import { EMPTY_IMAGE } from "./fields/mediaField";

export type SchemaChoice = "auto" | "blogposting" | "article" | "imagegallery" | "faqpage";

export interface PageMeta {
  title: string;
  date: string;
  tags: string;
  description: string;
  image: string;
  draft: boolean;
  /// JSON-LD primary type; "auto" derives it from the page content.
  schemaType: SchemaChoice;
}

export interface RootProps {
  meta: PageMeta;
  hasHero: boolean;
  hero: HeroProps;
}

export const DEFAULT_META: PageMeta = {
  title: "",
  date: "",
  tags: "",
  description: "",
  image: "",
  draft: false,
  schemaType: "auto",
};

/// Mirrors v1's newBlock("hero") defaults (defs.ts:51-77).
export const DEFAULT_HERO: HeroProps = {
  background: "backdrop",
  coverStyle: "dark",
  image: EMPTY_IMAGE,
  showSvg: false,
  svgSrc: "",
  svgWidthPct: 40,
  svgX: 0,
  svgY: 0,
  kicker: "",
  title: "",
  tagline: "",
  align: "left",
  anim: "fade",
  // Both default ON, matching v1 (defs.ts:71-72): a hero page normally wants
  // the index/release-style nav reveal and the one fade-in back link.
  navReveal: true,
  backLink: true,
  scrollPrompt: "",
};

export function PageRoot({
  meta,
  hasHero,
  hero,
  children,
}: Partial<RootProps> & { children?: ReactNode }) {
  const header = shellHeader(useShell(), { meta: { ...DEFAULT_META, ...meta }, hasHero });
  return (
    <div className="bg-topology-map">
      {hasHero && <Hero {...{ ...DEFAULT_HERO, ...hero }} id="hero" />}
      {header && <div dangerouslySetInnerHTML={{ __html: header }} />}
      <div className={contentColumnClass(!!hasHero)}>{children}</div>
    </div>
  );
}
