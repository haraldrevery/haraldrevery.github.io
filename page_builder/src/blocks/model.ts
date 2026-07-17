/*
 * Block data model. A project is {version, meta, blocks}; each block carries a
 * stable uuid so the preview iframe and the sidebar can talk about the same
 * block. Field semantics ported from old_page_builder/blocks.py, with text
 * fields as markdown (rendered through the site's exact pipeline).
 *
 * Legacy types (list, blockquote, two_column) are converted to markdown /
 * columns blocks when a project is loaded — see normalizeProject in main.ts.
 */

export type Aspect = "5/7" | "4/5" | "square" | "video" | "16/10" | "3/2" | "21/9";

// "1/1" from the old builder is intentionally absent: the compiled main.css has
// no aspect-[1/1] utility ("square" covers it). Only emit classes that exist.
export const ASPECTS: Aspect[] = ["5/7", "4/5", "square", "video", "16/10", "3/2", "21/9"];

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

export type GridLayout = "justified" | "uniform";

/// Shared by the top-level SVG block and svg column content.
export interface SvgFields {
  src: string;
  themed: boolean; // recolor to currentColor -> follows the site light/dark theme
  hoverGrow: boolean; // transition-transform hover:scale-105 (classes exist in main.css)
  link: string; // optional wrap in <a href>
  alt: string;
  maxWidth: string; // px, empty = full width
}

export type ColumnContent =
  | { kind: "markdown"; md: string }
  | { kind: "image"; full: string; thumb: string; alt: string; lightbox: boolean; thumbMissing?: boolean }
  | {
      kind: "grid";
      layout: GridLayout;
      rowHeight: number;
      columns: number;
      aspect: Aspect;
      group: string;
      items: GalleryItem[];
    }
  | { kind: "video"; src: string; poster: string }
  | ({ kind: "svg" } & SvgFields)
  | { kind: "raw"; html: string };

export type ColumnKind = ColumnContent["kind"];

export const COLUMN_KIND_LABELS: [ColumnKind, string][] = [
  ["markdown", "Text (markdown + KaTeX)"],
  ["image", "Image"],
  ["grid", "Image grid"],
  ["video", "Video"],
  ["svg", "SVG"],
  ["raw", "Raw HTML"],
];

export function newColumnContent(kind: ColumnKind): ColumnContent {
  switch (kind) {
    case "markdown":
      return { kind, md: "" };
    case "image":
      return { kind, full: "", thumb: "", alt: "", lightbox: false };
    case "grid":
      return {
        kind,
        layout: "justified",
        rowHeight: 240,
        columns: 2,
        aspect: "square",
        group: "grid1",
        items: [],
      };
    case "video":
      return { kind, src: "", poster: "" };
    case "svg":
      return { kind, src: "", themed: true, hoverGrow: false, link: "", alt: "", maxWidth: "" };
    case "raw":
      return { kind, html: "" };
  }
}

interface Base {
  id: string;
}

export interface HeadingBlock extends Base {
  type: "heading";
  level: number;
  text: string;
}
export interface ParagraphBlock extends Base {
  type: "paragraph";
  md: string;
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
  // always two slots; the second is kept (not rendered) when count is 1 so
  // switching 2 -> 1 -> 2 doesn't lose work
  columns: [ColumnContent, ColumnContent];
}
export interface AudioBlock extends Base {
  type: "audio";
  src: string;
  title: string;
}
export interface RawBlock extends Base {
  type: "raw";
  html: string;
}

export type Block =
  | HeadingBlock
  | ParagraphBlock
  | HrBlock
  | GalleryBlock
  | ImageBlock
  | SvgBlock
  | VideoBlock
  | ColumnsBlock
  | AudioBlock
  | RawBlock;

export type BlockType = Block["type"];

export const PROSE_TYPES = new Set<BlockType>(["heading", "paragraph", "hr"]);

export const BLOCK_LABELS: [BlockType, string][] = [
  ["heading", "Heading"],
  ["paragraph", "Text (markdown + KaTeX)"],
  ["hr", "Divider"],
  ["gallery", "Photo gallery"],
  ["image", "Single image"],
  ["svg", "SVG"],
  ["video", "Video"],
  ["columns", "Columns (1–2, any content)"],
  ["audio", "Audio"],
  ["raw", "Raw HTML"],
];

export function newBlock(type: BlockType): Block {
  const id = crypto.randomUUID();
  switch (type) {
    case "heading":
      return { id, type, level: 2, text: "" };
    case "paragraph":
      return { id, type, md: "" };
    case "hr":
      return { id, type };
    case "gallery":
      return {
        id,
        type,
        layout: "justified",
        rowHeight: 320,
        columns: 3,
        aspect: "5/7",
        group: "gallery1",
        items: [],
      };
    case "image":
      return { id, type, full: "", thumb: "", alt: "", caption: "", lightbox: true };
    case "svg":
      return { id, type, src: "", themed: true, hoverGrow: false, link: "", alt: "", maxWidth: "" };
    case "video":
      return { id, type, src: "", poster: "", caption: "" };
    case "columns":
      return {
        id,
        type,
        count: 2,
        columns: [newColumnContent("markdown"), newColumnContent("image")],
      };
    case "audio":
      return { id, type, src: "", title: "" };
    case "raw":
      return { id, type, html: "" };
  }
}

export function blockSummary(b: Block): string {
  const base = (p: string) => p.split("/").pop() || "";
  switch (b.type) {
    case "heading":
      return `H${b.level}: ${b.text.slice(0, 28)}`;
    case "paragraph":
      return `¶ ${b.md.replace(/\s+/g, " ").slice(0, 30)}`;
    case "gallery":
      return `Gallery (${b.items.length} imgs, ${b.columns} col)`;
    case "image":
      return `Image: ${base(b.full)}`;
    case "svg":
      return `SVG: ${base(b.src)}`;
    case "video":
      return `Video: ${base(b.src)}`;
    case "columns":
      return `Columns (${b.count}): ${b.columns
        .slice(0, b.count)
        .map((c) => c.kind)
        .join(" | ")}`;
    case "audio":
      return `Audio: ${base(b.src)}`;
    case "hr":
      return "── divider ──";
    case "raw":
      return "Raw HTML";
  }
}
