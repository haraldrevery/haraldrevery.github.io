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
      case "Image":
        // The Image block stores {full, thumb} as ONE prop — a custom field's
        // onChange can only write its own prop, so the path and its _min twin
        // travel together. See fields/mediaField.tsx.
        if (props.image?.full) images.push({ src: props.image.full, alt: props.alt ?? "" });
        break;
      case "Featured":
        // Same one-prop {full, thumb} shape as Image. The photo is the block's
        // whole point, so it belongs in the JSON-LD image list. The eyebrow
        // `tag` is a label, not prose, so it is deliberately not counted.
        if (props.image?.full) images.push({ src: props.image.full, alt: props.alt ?? "" });
        words += countWords(props.title) + countWords(props.excerpt);
        break;
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

/// Images with no alt text, and icons with no accessible name — the lint pass's
/// tree-walking half (v1 lint.ts:74-93, :117-125).
export function collectA11yIssues(
  data: Data,
  config: Config,
): { missingAlt: number; totalImages: number; unlabeledIcons: number; missingDownloads: number } {
  let missingAlt = 0;
  let totalImages = 0;
  let unlabeledIcons = 0;
  let missingDownloads = 0;

  visitComponents(data, config, ({ type, props, visible }) => {
    if (!visible) return;
    if (type === "Gallery") {
      for (const it of (props.items ?? []) as GalleryItem[]) {
        totalImages++;
        if (!(it.alt || "").trim()) missingAlt++;
      }
    }
    if (type === "Image" && props.image?.full) {
      totalImages++;
      if (!(props.alt || "").trim()) missingAlt++;
    }
    if (type === "Featured" && props.image?.full) {
      totalImages++;
      if (!(props.alt || "").trim()) missingAlt++;
    }
    if (type === "Svg" && props.src) {
      totalImages++;
      if (!(props.alt || "").trim()) missingAlt++;
    }
    if (type === "Icons") {
      for (const it of props.items ?? []) if (!(it.label || "").trim()) unlabeledIcons++;
    }
    if (type === "Downloads") {
      for (const it of props.items ?? []) if (it.missing) missingDownloads++;
    }
  });

  return { missingAlt, totalImages, unlabeledIcons, missingDownloads };
}
