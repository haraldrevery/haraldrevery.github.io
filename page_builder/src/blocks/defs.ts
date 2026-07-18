/*
 * The block registry — ONE entry per block type. `Record<BlockType, …>` means
 * a new type in the model union is a compile error here (and in the renderer
 * and form Records) until every piece exists. Everything else derives from
 * this: palette labels, column-content options (embeddable types), defaults,
 * summaries, traversal, media status.
 *
 * Pure module (no DOM, no Tauri) so renderers and tests stay portable.
 */
import type {
  AudioBlock,
  Block,
  BlockType,
  ColumnsBlock,
  DownloadsBlock,
  FaqBlock,
  GalleryBlock,
  GalleryItem,
  HeadingBlock,
  HeroBlock,
  HrBlock,
  IconsBlock,
  ImageBlock,
  ParagraphBlock,
  RawBlock,
  SvgBlock,
  VideoBlock,
} from "./model";

export interface BlockMeta {
  label: string;
  /// Embeddable types can live inside a column and get a "split" affordance.
  embeddable: boolean;
  make(id: string): Block;
  summary(b: never): string;
}

function def<T extends Block>(meta: {
  label: string;
  embeddable: boolean;
  make(id: string): T;
  summary(b: T): string;
}): BlockMeta {
  return meta as unknown as BlockMeta;
}

const base = (p: string) => p.split("/").pop() || "";

// Insertion order = palette order.
export const BLOCK_META: Record<BlockType, BlockMeta> = {
  hero: def<HeroBlock>({
    label: "Hero (always on top)",
    embeddable: false,
    make: (id) => ({
      id,
      type: "hero",
      background: "backdrop",
      coverStyle: "dark",
      image: "",
      imageThumb: "",
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
      navReveal: true,
      backLink: true,
      scrollPrompt: "",
    }),
    summary: (b) => `📌 Hero (${b.background}): ${b.title.slice(0, 20)}`,
  }),
  heading: def<HeadingBlock>({
    label: "Heading",
    embeddable: true,
    make: (id) => ({ id, type: "heading", level: 2, text: "", align: "left", animate: false }),
    summary: (b) => `H${b.level}: ${b.text.slice(0, 28)}`,
  }),
  paragraph: def<ParagraphBlock>({
    label: "Text (markdown + KaTeX)",
    embeddable: true,
    make: (id) => ({ id, type: "paragraph", md: "", animate: false }),
    summary: (b) => `¶ ${b.md.replace(/\s+/g, " ").slice(0, 30)}`,
  }),
  hr: def<HrBlock>({
    label: "Divider",
    embeddable: false,
    make: (id) => ({ id, type: "hr" }),
    summary: () => "── divider ──",
  }),
  gallery: def<GalleryBlock>({
    label: "Photo gallery",
    embeddable: true,
    make: (id) => ({
      id,
      type: "gallery",
      layout: "justified",
      rowHeight: 320,
      columns: 3,
      aspect: "5/7",
      group: "gallery1",
      items: [],
    }),
    summary: (b) =>
      b.layout === "uniform"
        ? `Gallery (${b.items.length} imgs, ${b.columns} col)`
        : `Gallery (${b.items.length} imgs, justified)`,
  }),
  image: def<ImageBlock>({
    label: "Single image",
    embeddable: true,
    make: (id) => ({
      id,
      type: "image",
      full: "",
      thumb: "",
      alt: "",
      caption: "",
      lightbox: true,
      widthPct: 100,
    }),
    summary: (b) => `Image: ${base(b.full)}`,
  }),
  svg: def<SvgBlock>({
    label: "SVG",
    embeddable: true,
    make: (id) => ({
      id,
      type: "svg",
      src: "",
      themed: true,
      hoverGrow: false,
      link: "",
      alt: "",
      widthPct: 100,
    }),
    summary: (b) => `SVG: ${base(b.src)}`,
  }),
  video: def<VideoBlock>({
    label: "Video",
    embeddable: true,
    make: (id) => ({ id, type: "video", src: "", poster: "", caption: "" }),
    summary: (b) => `Video: ${base(b.src)}`,
  }),
  columns: def<ColumnsBlock>({
    label: "Columns (1–2, any content)",
    embeddable: false,
    make: (id) => ({
      id,
      type: "columns",
      count: 2,
      verticalAlign: "center",
      columns: [newBlock("paragraph"), newBlock("image")],
    }),
    summary: (b) =>
      `Columns (${b.count}): ${b.columns
        .slice(0, b.count)
        .map((c) => c.type)
        .join(" | ")}`,
  }),
  icons: def<IconsBlock>({
    label: "Social icons panel",
    embeddable: true,
    make: (id) => ({ id, type: "icons", size: "small", label: "", items: [] }),
    summary: (b) => (b.label ? `Icons “${b.label}” (${b.items.length})` : `Icons (${b.items.length})`),
  }),
  faq: def<FaqBlock>({
    label: "FAQ (accordion)",
    embeddable: true,
    make: (id) => ({ id, type: "faq", items: [{ q: "", a: "" }] }),
    summary: (b) => `FAQ (${b.items.length})`,
  }),
  downloads: def<DownloadsBlock>({
    label: "Downloads (SHA-256/512 table)",
    embeddable: false, // the table needs full width
    make: (id) => ({ id, type: "downloads", items: [] }),
    summary: (b) => `Downloads (${b.items.length})`,
  }),
  audio: def<AudioBlock>({
    label: "Audio",
    embeddable: false,
    make: (id) => ({ id, type: "audio", src: "", title: "", panel: false }),
    summary: (b) => `Audio: ${base(b.src)}`,
  }),
  raw: def<RawBlock>({
    label: "Raw HTML",
    embeddable: true,
    make: (id) => ({ id, type: "raw", html: "" }),
    summary: () => "Raw HTML",
  }),
};

export const BLOCK_TYPES = Object.keys(BLOCK_META) as BlockType[];

export const BLOCK_LABELS: [BlockType, string][] = BLOCK_TYPES.map((t) => [
  t,
  BLOCK_META[t].label,
]);

/// Types allowed as column children (and for the preview "split" action).
export const EMBEDDABLE_LABELS: [BlockType, string][] = BLOCK_LABELS.filter(
  ([t]) => BLOCK_META[t].embeddable
);

export function isEmbeddable(t: BlockType): boolean {
  return BLOCK_META[t].embeddable;
}

export function newBlock(type: BlockType): Block {
  return BLOCK_META[type].make(crypto.randomUUID());
}

export function blockSummary(b: Block): string {
  return (BLOCK_META[b.type].summary as (b: Block) => string)(b);
}

/// Prose types group into one <article class="prose"> at the top level.
export const PROSE_TYPES = new Set<BlockType>(["heading", "paragraph", "hr"]);

// ------------------------------------------------------------------ traversal

export interface WalkCtx {
  parent?: ColumnsBlock;
  colIndex?: number;
  /// false for the kept-but-hidden second column when count is 1
  visible: boolean;
}

/// Visit every block: top-level ones plus column children (both slots — the
/// hidden slot is visited with visible:false so callers can filter).
export function walkBlocks(blocks: Block[], fn: (b: Block, ctx: WalkCtx) => void): void {
  for (const b of blocks) {
    fn(b, { visible: true });
    if (b.type === "columns") {
      b.columns.forEach((c, i) =>
        fn(c, { parent: b, colIndex: i, visible: i < b.count })
      );
    }
  }
}

// ---------------------------------------------------- metadata completeness

/// Green when alt + title + description are all filled, yellow otherwise.
export function galleryItemStatus(it: GalleryItem): "ok" | "partial" {
  return it.alt.trim() && it.title.trim() && it.description.trim() ? "ok" : "partial";
}

function pushStatuses(b: Block, out: ("ok" | "partial")[]): void {
  if (b.type === "gallery") {
    b.items.forEach((it) => out.push(galleryItemStatus(it)));
  } else if (b.type === "image" && b.full) {
    out.push(b.alt.trim() && b.caption.trim() ? "ok" : "partial");
  }
}

/// Aggregate status for a block's images (null = block has no images).
export function blockMediaStatus(b: Block): "ok" | "partial" | null {
  const statuses: ("ok" | "partial")[] = [];
  pushStatuses(b, statuses);
  if (b.type === "columns") {
    for (const c of b.columns.slice(0, b.count)) pushStatuses(c, statuses);
  }
  if (!statuses.length) return null;
  return statuses.every((s) => s === "ok") ? "ok" : "partial";
}
