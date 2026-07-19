/*
 * Block data model — TYPES ONLY. A project is {version, meta, blocks}; each
 * block carries a stable uuid so the preview iframe and the sidebar can talk
 * about the same block.
 *
 * Behaviour (labels, defaults, summaries, embeddability) lives in defs.ts —
 * one registry entry per type. Renderers live in render.ts, forms in
 * ui/blockForms.ts; both dispatch through compile-checked Records, so adding
 * a block type here produces compile errors until every piece exists.
 *
 * Columns hold REAL child blocks (the "embeddable" subset in defs.ts), so any
 * new embeddable block type automatically becomes a column option with its
 * full form and renderer.
 */

export type Aspect = "5/7" | "4/5" | "square" | "video" | "16/10" | "3/2" | "21/9" | "29/9" | "21/7";

// "1/1" from the old builder is intentionally absent: the compiled main.css has
// no aspect-[1/1] utility ("square" covers it). Only emit classes that exist
// (29/9 and 21/7 are verified present).
export const ASPECTS: Aspect[] = ["5/7", "4/5", "square", "video", "16/10", "3/2", "21/9", "29/9", "21/7"];

export const GALLERY_COLUMNS = [2, 3, 4, 5, 6];

export interface GalleryItem {
  full: string;
  thumb: string;
  alt: string;
  title: string;
  description: string;
  thumbMissing?: boolean;
  // pixel dimensions of the full-size image (justified layout needs the ratio)
  w?: number;
  h?: number;
}

export type GridLayout = "justified" | "uniform" | "feature";

/// Shared by the SVG block and the hero's svg foreground.
export interface SvgFields {
  src: string;
  themed: boolean; // recolor to currentColor -> follows the site light/dark theme
  hoverGrow: boolean; // transition-transform hover:scale-105 (classes exist in main.css)
  link: string; // optional wrap in <a href>
  alt: string;
  widthPct: number; // % of the container width (100 = full)
}

interface Base {
  id: string;
}

export interface HeadingBlock extends Base {
  type: "heading";
  level: number;
  text: string;
  align: "left" | "center";
  animate: boolean; // per-word fade-up (word_animation)
}

/// Full-viewport opener rendered into the shell's {{HERO}} slot — always
/// before the page container, whatever its list position. Background and
/// foreground combine freely (e.g. photo + svg + text).
export interface HeroBlock extends Base {
  type: "hero";
  background: "none" | "dots" | "backdrop" | "cover";
  coverStyle: "dark" | "light"; // cover scrim tint: dark scrim + white text, or light scrim + dark text
  image: string; // full-size photo (cover)
  imageThumb: string; // _min (backdrop bg)
  showSvg: boolean;
  svgSrc: string;
  svgWidthPct: number; // % of the container width
  svgX: number; // translate offset in % of the svg's own box
  svgY: number;
  kicker: string;
  title: string;
  tagline: string;
  align: "left" | "center";
  anim: "none" | "fade" | "words"; // foreground in-animation
  navReveal: boolean; // nav slides in on scroll (navi_mechanic, like index/release pages)
  backLink: boolean; // single "← Back to Notebook", fades in at the container's left edge
  scrollPrompt: string; // custom "scroll down" text ("" = off), fades in like index.html
}

export interface IconItem {
  src: string; // svg path
  label: string; // accessible name (sr-only)
  href: string;
}

export interface IconsBlock extends Base {
  type: "icons";
  size: "small" | "medium" | "large";
  /// optional panel label (release-page "Listen everywhere" style); when set,
  /// the row is left-aligned under the label instead of centered
  label: string;
  items: IconItem[];
}

export interface ParagraphBlock extends Base {
  type: "paragraph";
  md: string;
  animate: boolean; // per-word fade-up (word_animation), math/code left alone
}

export interface FaqItem {
  q: string;
  a: string; // markdown
}

/// about.html-style CSS-only accordion (checkbox + label, no JS).
export interface FaqBlock extends Base {
  type: "faq";
  items: FaqItem[];
}

export interface DownloadItem {
  src: string; // root-absolute web path
  label: string; // display name ("" = file name)
  size: number; // bytes
  sha256: string;
  sha512: string;
  missing?: boolean; // file not found on disk at last check
}

/// download.html-style verification table; hashes are computed by the backend
/// (streamed SHA-256 + SHA-512 — MD5 is deliberately not offered) and
/// recomputed automatically at every export so they always match the bytes.
export interface DownloadsBlock extends Base {
  type: "downloads";
  items: DownloadItem[];
}

export interface HrBlock extends Base {
  type: "hr";
}

export interface GalleryBlock extends Base {
  type: "gallery";
  layout: GridLayout;
  rowHeight: number; // px target row height for justified layout
  columns: number; // uniform layout only
  aspect: Aspect; // uniform layout only
  group: string;
  items: GalleryItem[];
}

export interface ImageBlock extends Base {
  type: "image";
  full: string;
  thumb: string;
  alt: string;
  caption: string;
  lightbox: boolean;
  widthPct: number;
  thumbMissing?: boolean;
}

export interface SvgBlock extends Base, SvgFields {
  type: "svg";
}

export interface VideoBlock extends Base {
  type: "video";
  src: string;
  poster: string;
  caption: string;
}

export interface ColumnsBlock extends Base {
  type: "columns";
  count: 1 | 2;
  verticalAlign: "center" | "top";
  // real child blocks (embeddable types only). Always two slots; the second is
  // kept (not rendered) when count is 1 so switching 2 -> 1 -> 2 keeps work.
  columns: [Block, Block];
}

export interface AudioBlock extends Base {
  type: "audio";
  src: string;
  title: string;
  /// release-page "preview card": frosted-glass panel with the release-style
  /// caption (beautiful_places.html "Listen everywhere" look)
  panel: boolean;
}

export interface RawBlock extends Base {
  type: "raw";
  html: string;
}

export type Block =
  | HeroBlock
  | HeadingBlock
  | ParagraphBlock
  | HrBlock
  | GalleryBlock
  | ImageBlock
  | SvgBlock
  | VideoBlock
  | ColumnsBlock
  | IconsBlock
  | FaqBlock
  | DownloadsBlock
  | AudioBlock
  | RawBlock;

export type BlockType = Block["type"];
