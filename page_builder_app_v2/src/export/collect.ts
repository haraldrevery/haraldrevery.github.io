/*
 * Tree collectors — the replacement for v1's walkBlocks (defs.ts:235-244).
 *
 * Everything that needs to know "what is on this page" goes through here: the
 * JSON-LD image list and word count, the svg prefetch list, the download hash
 * refresh, and the lint pass's alt-text / missing-file checks.
 *
 * VISIBILITY. Puck's walkTree visits every zone, including slots that are in
 * `data` but not rendered — specifically a Columns block's `right` slot when
 * count is 1, whose content is deliberately kept so switching 2 -> 1 -> 2 does
 * not lose work. Counting alt text or images from unrendered content would
 * produce lint warnings about markup nobody can see, so each component declares
 * which of its slots are currently hidden and the walk propagates that down.
 */
import { walkTree } from "@measured/puck/rsc";
import type { Config, Data } from "@measured/puck";
import { hasSvgText } from "../blocks/svgStore";
import type { GalleryItem } from "../puck/components/Gallery";
import type { RootProps } from "../puck/PageRoot";

export interface VisitedComponent {
  type: string;
  props: Record<string, any>;
  /// False when the component sits in a slot its parent does not render.
  visible: boolean;
}

/// Slots a component hides at its current settings. Extend as block types land.
const HIDDEN_SLOTS: Record<string, (props: any) => string[]> = {
  Columns: (p) => (p.count === 2 ? [] : ["right"]),
};

/*
 * One traversal, yielding every component with a resolved `visible` flag.
 *
 * walkTree is a TRANSFORM walker: the callback returns the (possibly new)
 * content for a zone. Returning undefined is the documented no-op, verified
 * to leave `data` byte-identical — this is a read-only visitor.
 */
export function visitComponents(
  data: Data,
  config: Config,
  cb: (c: VisitedComponent) => void,
): void {
  // Zones arrive in arbitrary order, so collect first and resolve visibility
  // afterwards, when every parent is known.
  const zones: { parentId: string; propName: string; items: any[] }[] = [];
  const byId = new Map<string, any>();

  walkTree(data as any, config, (content, opts) => {
    zones.push({ parentId: opts.parentId, propName: opts.propName, items: content as any[] });
    for (const item of content as any[]) {
      if (item?.props?.id) byId.set(item.props.id, item);
    }
    return undefined as any;
  });

  const zoneVisible = (parentId: string, propName: string): boolean => {
    if (parentId === "root") return true;
    const parent = byId.get(parentId);
    if (!parent) return true;
    const hidden = HIDDEN_SLOTS[parent.type]?.(parent.props) ?? [];
    if (hidden.includes(propName)) return false;
    // A slot inside a hidden slot is hidden too.
    const grand = zones.find((z) => z.items.some((i) => i?.props?.id === parentId));
    return grand ? zoneVisible(grand.parentId, grand.propName) : true;
  };

  for (const z of zones) {
    const visible = zoneVisible(z.parentId, z.propName);
    for (const item of z.items) {
      if (item?.type) cb({ type: item.type, props: item.props ?? {}, visible });
    }
  }
}

// ------------------------------------------------------------------ collectors

/// Every svg src the page references. The renderer reads svg text from a
/// SYNCHRONOUS cache, so these must be prefetched before the first render or
/// the hero shows its "[svg … not loaded]" placeholder. Hidden slots are
/// INCLUDED on purpose — nothing should be missing when they become visible.
export function collectSvgSrcs(data: Data, config: Config): string[] {
  const out = new Set<string>();
  const root = (data.root?.props ?? {}) as Partial<RootProps>;
  if (root.hasHero && root.hero?.showSvg && root.hero.svgSrc) out.add(root.hero.svgSrc);

  visitComponents(data, config, ({ type, props }) => {
    if (type === "Svg" && props.src) out.add(props.src);
    if (type === "Icons") for (const it of props.items ?? []) if (it.src) out.add(it.src);
  });
  return [...out];
}

export interface PageImage {
  src: string;
  w?: number;
  h?: number;
  alt: string;
}

export interface PageStats {
  images: PageImage[];
  /// Visible words, for JSON-LD wordCount.
  wordCount: number;
  faq: { q: string; a: string }[];
  galleryCount: number;
  /// Prose blocks. Feeds the auto schema-type heuristic, which compares how
  /// text-heavy a page is against how photo-heavy it is. v1 counted its
  /// `paragraph` blocks; Text is the v2 equivalent (see components/Text.tsx).
  textBlocks: number;
}

/// Content statistics for the JSON-LD block and the schema-type heuristic.
/// Only VISIBLE content counts — structured data must describe the page a
/// reader actually gets.
export function collectStats(data: Data, config: Config): PageStats {
  const images: PageImage[] = [];
  const faq: PageStats["faq"] = [];
  let words = 0;
  let galleryCount = 0;
  let textBlocks = 0;

  const countWords = (s: string) => {
    const t = (s || "").replace(/<[^>]*>/g, " ").trim();
    return t ? t.split(/\s+/).length : 0;
  };

  visitComponents(data, config, ({ type, props, visible }) => {
    if (!visible) return;
    switch (type) {
      case "Text":
        textBlocks++;
        words += countWords(props.md);
        break;
      case "Heading":
        words += countWords(props.text);
        break;
      case "Gallery":
        galleryCount++;
        for (const it of (props.items ?? []) as GalleryItem[]) {
          if (it.full) images.push({ src: it.full, w: it.w, h: it.h, alt: it.alt ?? "" });
        }
        break;
      case "Image": {
        // The Image block stores {full, thumb} as ONE prop — a custom field's
        // onChange can only write its own prop, so the path and its _min twin
        // travel together. See fields/mediaField.tsx. Either path renders a
        // picture (Media.tsx), so either one puts it on the page.
        const src = props.image?.full || props.image?.thumb;
        if (src) images.push({ src, alt: props.alt ?? "" });
        break;
      }
      case "Featured": {
        // Same one-prop {full, thumb} shape as Image. The photo is the block's
        // whole point, so it belongs in the JSON-LD image list. The eyebrow
        // `tag` is a label, not prose, so it is deliberately not counted.
        const src = props.image?.full || props.image?.thumb;
        if (src) images.push({ src, alt: props.alt ?? "" });
        words += countWords(props.title) + countWords(props.excerpt);
        break;
      }
      case "Faq":
        for (const it of props.items ?? []) faq.push({ q: it.q, a: it.a });
        break;
    }
  });

  return { images, wordCount: words, faq, galleryCount, textBlocks };
}

/// Root-absolute paths of every download file, for the pre-export hash refresh.
export function collectDownloadPaths(data: Data, config: Config): string[] {
  const out: string[] = [];
  visitComponents(data, config, ({ type, props }) => {
    if (type === "Downloads") for (const it of props.items ?? []) if (it.src) out.push(it.src);
  });
  return out;
}

/// Images with no alt text, icons with no accessible name, videos missing
/// part of their glass panel and media blocks with nothing picked — the lint
/// pass's tree-walking half (v1 lint.ts:74-93, :117-125).
export function collectA11yIssues(
  data: Data,
  config: Config,
): {
  missingAlt: number;
  totalImages: number;
  unlabeledIcons: number;
  missingDownloads: number;
  /// Svg / Icons sources with no text in the cache. The cache is warmed by
  /// prefetchSvgs on open, on pick and before every export, so a cold entry here
  /// means the file could not be read — and the renderer would emit its
  /// "[svg … not loaded]" placeholder into the published page.
  missingSvgs: number;
  /// Videos that have a file but lack part of the glass panel: the poster
  /// (without it the player is a black box until the video loads), the title
  /// or the description.
  videosNoPoster: number;
  videosNoTitle: number;
  videosNoDescription: number;
  /// The block type of every media block with nothing picked, one entry per
  /// block. Video, Image, Audio and Svg then publish nothing at all; an empty
  /// Gallery publishes an empty grid, i.e. a blank gap.
  emptyMedia: string[];
} {
  let missingAlt = 0;
  let totalImages = 0;
  let unlabeledIcons = 0;
  let missingDownloads = 0;
  let missingSvgs = 0;
  let videosNoPoster = 0;
  let videosNoTitle = 0;
  let videosNoDescription = 0;
  const emptyMedia: string[] = [];

  visitComponents(data, config, ({ type, props, visible }) => {
    if (!visible) return;
    if (type === "Gallery") {
      const items = (props.items ?? []) as GalleryItem[];
      if (!items.length) emptyMedia.push("Gallery");
      for (const it of items) {
        totalImages++;
        if (!(it.alt || "").trim()) missingAlt++;
      }
    }
    // Either path renders a picture (Media.tsx, Featured.tsx), so either one
    // makes the alt text matter.
    const picture = props.image?.full || props.image?.thumb;
    if (type === "Image") {
      if (picture) {
        totalImages++;
        if (!(props.alt || "").trim()) missingAlt++;
      } else {
        emptyMedia.push("Image");
      }
    }
    if (type === "Featured" && picture) {
      totalImages++;
      if (!(props.alt || "").trim()) missingAlt++;
    }
    if (type === "Svg") {
      if (props.src) {
        totalImages++;
        if (!(props.alt || "").trim()) missingAlt++;
        // Only the themed path inlines the file; un-themed renders a plain <img>,
        // which fails visibly as a broken image rather than as placeholder text.
        if (props.themed !== false && !hasSvgText(props.src)) missingSvgs++;
      } else {
        emptyMedia.push("Svg");
      }
    }
    if (type === "Icons") {
      for (const it of props.items ?? []) {
        if (!(it.label || "").trim()) unlabeledIcons++;
        if (it.src && !hasSvgText(it.src)) missingSvgs++;
      }
    }
    if (type === "Downloads") {
      for (const it of props.items ?? []) if (it.missing) missingDownloads++;
    }
    if (type === "Audio" && !props.src) emptyMedia.push("Audio");
    if (type === "Video") {
      if (!props.src) {
        // Nothing is published, so there is no panel to be missing parts of.
        emptyMedia.push("Video");
      } else {
        if (!(props.poster || "").trim()) videosNoPoster++;
        if (!(props.title || "").trim()) videosNoTitle++;
        if (!(props.caption || "").trim()) videosNoDescription++;
      }
    }
  });

  return {
    missingAlt, totalImages, unlabeledIcons, missingDownloads, missingSvgs,
    videosNoPoster, videosNoTitle, videosNoDescription, emptyMedia,
  };
}

/*
 * Every media file the page PUBLISHES a reference to — video and poster, audio,
 * and the photos behind Image, Featured, Gallery and the hero — for the page
 * check's on-disk test (findMissingMedia in fixups.ts).
 *
 * Mirrors what each component emits, so a path that is stored but not rendered
 * (the full-size photo behind an Image with the lightbox off, the poster of a
 * Video with no file) is not reported. Visible content only, like the rest of
 * the lint. Svg and Icons are covered by the svg cache check, Downloads by the
 * hash refresh. Remote URLs are skipped: there is no local file to look for.
 */
export function collectMediaPaths(data: Data, config: Config): string[] {
  const out = new Set<string>();
  const add = (p: unknown) => {
    const s = typeof p === "string" ? p.trim() : "";
    if (s && !/^[a-z][a-z0-9+.-]*:/i.test(s)) out.add(s);
  };

  const root = (data.root?.props ?? {}) as Partial<RootProps>;
  if (root.hasHero && root.hero) {
    const img = root.hero.image ?? { full: "", thumb: "" };
    // Hero.tsx: the cover is the sharp full-size photo, the backdrop a
    // blurred thumbnail. Other backgrounds use no photo at all.
    if (root.hero.background === "cover") add(img.full || img.thumb);
    else if (root.hero.background === "backdrop") add(img.thumb || img.full);
  }

  visitComponents(data, config, ({ type, props, visible }) => {
    if (!visible) return;
    switch (type) {
      case "Video":
        if (props.src) {
          add(props.src);
          add(props.poster);
        }
        break;
      case "Audio":
        add(props.src);
        break;
      case "Image":
      case "Featured": {
        const img = props.image ?? {};
        add(img.thumb || img.full);
        if (props.lightbox && img.full) add(img.full);
        break;
      }
      case "Gallery":
        for (const it of (props.items ?? []) as GalleryItem[]) {
          add(it.full);
          add(it.thumb || it.full);
        }
        break;
    }
  });
  return [...out];
}
