/*
 * Project-file normalization: merge saved blocks over per-type defaults and
 * convert legacy shapes (list/blockquote -> markdown, two_column -> columns,
 * old column-content kinds -> child blocks). Pure module so it stays
 * unit-testable.
 */
import { newBlock, isEmbeddable } from "./defs";
import type { Block, BlockType, ColumnsBlock } from "./model";
import { defaultMeta } from "../state";
import type { Project } from "../state";

function isBlockType(t: unknown): t is BlockType {
  return (
    typeof t === "string" &&
    ["hero", "heading", "paragraph", "hr", "gallery", "image", "svg", "video", "columns", "icons", "faq", "downloads", "audio", "raw"].includes(t)
  );
}

/// Old column-content kinds map onto real block types.
const KIND_TO_TYPE: Record<string, BlockType> = {
  markdown: "paragraph",
  grid: "gallery",
  image: "image",
  video: "video",
  svg: "svg",
  raw: "raw",
};

/// Normalize a column child: accepts a real block, an old {kind: ...} column
/// content, or garbage (falls back to an empty paragraph). Non-embeddable
/// types are replaced too — columns can't nest columns/heroes.
function normalizeChild(raw: unknown): Block {
  const rc = (raw ?? {}) as Record<string, unknown>;
  let t: BlockType | undefined;
  if (isBlockType(rc.type)) t = rc.type;
  else if (typeof rc.kind === "string" && KIND_TO_TYPE[rc.kind]) {
    t = KIND_TO_TYPE[rc.kind];
    if (rc.kind === "markdown" && rc.md != null) rc.md = String(rc.md);
  }
  if (!t || !isEmbeddable(t)) return newBlock("paragraph");
  const merged = { ...(newBlock(t) as object), ...(rc as object) } as Block;
  merged.type = t; // never let a stale kind/type pair through
  if (!merged.id || typeof merged.id !== "string") merged.id = crypto.randomUUID();
  return merged;
}

/// Convert removed block types from older project files into their modern
/// equivalents (markdown covers lists/quotes; columns covers two_column).
function convertLegacyBlock(rb: Record<string, unknown>): Record<string, unknown> | null {
  const t = rb.type;
  if (t === "list") {
    const items = (Array.isArray(rb.items) ? rb.items : []).map(String).filter((s) => s.trim());
    const md = items.map((it, i) => (rb.ordered ? `${i + 1}. ${it}` : `- ${it}`)).join("\n");
    return { type: "paragraph", md };
  }
  if (t === "blockquote") {
    const quote = String(rb.md ?? rb.quote ?? "");
    const cite = String(rb.cite ?? "").trim();
    let md = quote
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");
    if (cite) md += `\n>\n> — *${cite}*`;
    return { type: "paragraph", md };
  }
  if (t === "two_column") {
    const mediaType = rb.mediaType ?? rb.media_type ?? "image";
    const media =
      mediaType === "video"
        ? { type: "video", src: String(rb.src ?? ""), poster: String(rb.poster ?? "") }
        : {
            type: "image",
            full: String(rb.full ?? ""),
            thumb: String(rb.thumb ?? ""),
            alt: String(rb.alt ?? ""),
            lightbox: false,
          };
    const heading = String(rb.heading ?? "").trim();
    const body = String(rb.md ?? rb.text ?? "");
    const text = { type: "paragraph", md: (heading ? `## ${heading}\n\n` : "") + body };
    const mediaLeft = (rb.mediaSide ?? rb.media_side ?? "left") === "left";
    return {
      type: "columns",
      count: 2,
      columns: mediaLeft ? [media, text] : [text, media],
    };
  }
  return null;
}

export function normalizeProject(data: unknown): Project {
  const d = (data ?? {}) as Record<string, unknown>;
  const meta = { ...defaultMeta(), ...((d.meta as object) ?? {}) };
  if (!["auto", "blogposting", "article", "imagegallery", "faqpage"].includes(meta.schemaType)) {
    meta.schemaType = "auto";
  }
  const rawBlocks = Array.isArray(d.blocks) ? d.blocks : [];
  const blocks: Block[] = [];
  for (let rb of rawBlocks as Record<string, unknown>[]) {
    rb = convertLegacyBlock(rb) ?? rb;
    const t = rb?.type;
    if (!isBlockType(t)) continue;
    const base = newBlock(t) as unknown as Record<string, unknown>;
    const merged = { ...base, ...(rb as object) } as unknown as Block;
    if (!merged.id) merged.id = crypto.randomUUID();
    if (merged.type === "columns") {
      const cols = Array.isArray(merged.columns) ? merged.columns : [];
      (merged as ColumnsBlock).columns = [normalizeChild(cols[0]), normalizeChild(cols[1])];
      merged.count = merged.count === 1 ? 1 : 2;
    }
    if (merged.type === "hero" && !["none", "fade", "words"].includes(merged.anim)) {
      merged.anim = "fade"; // e.g. the removed "wave" option
    }
    blocks.push(merged);
  }
  // heroes are pinned first (store order must match preview DOM order)
  const ordered = [
    ...blocks.filter((b) => b.type === "hero"),
    ...blocks.filter((b) => b.type !== "hero"),
  ];
  const project: Project = { version: 1, meta, blocks: ordered };
  if (typeof d.exportSlug === "string" && d.exportSlug) project.exportSlug = d.exportSlug;
  return project;
}
