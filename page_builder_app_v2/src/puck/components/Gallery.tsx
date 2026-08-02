/*
 * Photo gallery, three layouts. Transcribed from
 * page_builder/src/blocks/render.ts:133-242.
 *
 * The `_min` thumbnail convention: <a href> is the full-size image (what
 * GLightbox opens), <img src> the _min thumbnail. Falls back to the full-size
 * file when no _min exists.
 *
 * Only classes present in the compiled main.css may be emitted — including the
 * dynamic `md:grid-cols-N` in the uniform layout. tests/render.test.tsx greps
 * the real CSS for every one of them.
 */
import type { CSSProperties } from "react";
import type { PuckContext } from "@measured/puck";
import { BlockShell } from "../nesting";
import { EmptyHint } from "../EmptyHint";
import type { Spacing } from "../spacing";

export type Aspect =
  | "5/7" | "4/5" | "square" | "video" | "16/10" | "3/2" | "21/9" | "29/9" | "21/7";

export const ASPECTS: Aspect[] = [
  "5/7", "4/5", "square", "video", "16/10", "3/2", "21/9", "29/9", "21/7",
];

export const GALLERY_COLUMNS = [2, 3, 4, 5, 6];

export interface GalleryItem {
  full: string;
  thumb: string;
  alt: string;
  title: string;
  description: string;
  thumbMissing?: boolean;
  /// Pixel dimensions of the full-size image; the justified layout needs the ratio.
  w?: number;
  h?: number;
}

export type GridLayout = "justified" | "uniform" | "feature";

export interface GalleryProps {
  layout: GridLayout;
  rowHeight: number;
  columns: number;
  aspect: Aspect;
  group: string;
  items: GalleryItem[];
  spacing: Spacing;
  puck?: PuckContext;
}

function aspectClass(aspect: string): string {
  if (aspect === "square") return "aspect-square";
  if (aspect === "video") return "aspect-video";
  return `aspect-[${aspect}]`;
}

/// GLightbox parses "key: value; key: value", so ';' and ':' are structural —
/// strip them out of user text or the caption breaks. (v1 render.ts:71)
function glightboxCaption(title: string, desc: string): string {
  const clean = (s: string) => (s || "").replace(/;/g, ",").replace(/:/g, " -").trim();
  return `title: ${clean(title)}; description: ${clean(desc)}`;
}

/// The shared <a> wrapper. `--delay` is a CSS custom property; React passes
/// unknown `--*` keys through to the style attribute verbatim.
function Item({
  it,
  group,
  className,
  style,
}: {
  it: GalleryItem;
  group: string;
  className: string;
  style?: CSSProperties;
}) {
  return (
    <a
      href={it.full}
      className={className}
      data-gallery={group}
      data-glightbox={glightboxCaption(it.title, it.description)}
      style={{ "--delay": "0.1s", ...style } as CSSProperties}
    >
      <div className="overlay"></div>
      <img
        src={it.thumb || it.full}
        alt={it.alt}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    </a>
  );
}

/// Justified (Behance/Flickr) layout, zero JS: flex-grow proportional to each
/// image's aspect ratio + a native aspect-ratio makes the browser itself fill
/// every row at the target row height with no cropping. Because each item's
/// grow factor equals its ratio, a row resolves to the SAME height for every
/// item in it, so rows are exactly justified rather than approximately.
function justifiedStyle(it: GalleryItem, basisH: number, maxH: number): CSSProperties {
  // Unknown dimensions -> assume 3/2 until revalidation fills them in.
  const w = it.w && it.h ? it.w : 3;
  const h = it.w && it.h ? it.h : 2;
  const ratio = Math.round((w / h) * 10000) / 10000;
  // Grow factors are ratio * 100, not ratio. Flexbox only hands out Sum(grow)
  // of the free space when that sum is < 1, so a row whose ratios total under 1
  // (a lone portrait) could never fill its width. Scaling every factor by the
  // same constant leaves each item's share (g_i / Sum(g)) untouched.
  const grow = Math.round(ratio * 10000) / 100;
  return {
    aspectRatio: `${w}/${h}`,
    flexGrow: grow,
    // The cap must be on WIDTH, not height. A max-height caps the height while
    // flex-grow keeps widening the box, and CSS max-constraints override
    // aspect-ratio — so the box goes wider than the photo and object-cover crops
    // it (a lone portrait lost 59% this way). Capping width at ratio * maxH
    // triggers on exactly the same condition but lets aspect-ratio set the
    // height, so nothing is ever cropped.
    flexBasis: `calc(${ratio} * ${basisH}px)`,
    maxWidth: `calc(${ratio} * ${maxH}px)`,
  };
}

export function Gallery({
  layout,
  rowHeight,
  columns,
  aspect,
  group,
  items,
  spacing,
  puck,
}: GalleryProps) {
  const g = group || "gallery";
  const list = items ?? [];

  // A gallery with no photos emits an empty grid container — zero height, so it
  // is invisible in the editor. See EmptyHint.
  if (list.length === 0 && puck?.isEditing) {
    return <EmptyHint label="Empty gallery — add photos in the sidebar" />;
  }

  let inner;
  if (layout === "feature") {
    // about.html / galdhopiggen.html "feature" grid: 3x3 squares where the
    // first image spans 2x2 (4 slots); extras keep flowing in rows of three.
    inner = (
      <div className="grid grid-cols-3 md:grid-cols-3 gap-4">
        {list.map((it, i) => (
          <Item
            key={i}
            it={it}
            group={g}
            className={`portfolio-item glightbox block${i === 0 ? " col-span-2 row-span-2" : ""} aspect-square`}
          />
        ))}
      </div>
    );
  } else if (layout === "uniform") {
    const acl = aspectClass(aspect || "5/7");
    inner = (
      <div className={`grid grid-cols-2 md:grid-cols-${columns || 3} gap-6`}>
        {list.map((it, i) => (
          <Item key={i} it={it} group={g} className={`portfolio-item glightbox block ${acl}`} />
        ))}
      </div>
    );
  } else {
    const asked = Number(rowHeight);
    const rh = Math.max(60, Math.round(Number.isFinite(asked) && asked ? asked : 320));
    // Greedy flex packing: items pack at flex-basis size, then grow to fill the
    // row. Basing at 75% of the target packs more images per row (the Flickr look).
    const basisH = Math.round(rh * 0.75);
    const maxH = Math.round(rh * 2);
    inner = (
      <div className="flex flex-wrap gap-2">
        {list.map((it, i) => (
          <Item
            key={i}
            it={it}
            group={g}
            className="portfolio-item glightbox block"
            style={justifiedStyle(it, basisH, maxH)}
          />
        ))}
      </div>
    );
  }

  return <BlockShell spacing={spacing}>{inner}</BlockShell>;
}
