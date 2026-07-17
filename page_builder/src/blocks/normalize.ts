/*
 * Project-file normalization: merge saved blocks over per-type defaults and
 * convert block types that no longer exist (list/blockquote -> markdown,
 * two_column -> columns). Pure module so it stays unit-testable.
 */
import { newBlock, newColumnContent } from "./model";
import type { Block, BlockType, ColumnContent, ColumnKind } from "./model";
import { defaultMeta } from "../state";
import type { Project } from "../state";

function isBlockType(t: unknown): t is BlockType {
  return (
    typeof t === "string" &&
    ["heading", "paragraph", "hr", "gallery", "image", "svg", "video", "columns", "audio", "raw"].includes(t)
  );
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
    const media: ColumnContent =
      mediaType === "video"
        ? { kind: "video", src: String(rb.src ?? ""), poster: String(rb.poster ?? "") }
        : {
            kind: "image",
            full: String(rb.full ?? ""),
            thumb: String(rb.thumb ?? ""),
            alt: String(rb.alt ?? ""),
            lightbox: false,
          };
    const heading = String(rb.heading ?? "").trim();
    const body = String(rb.md ?? rb.text ?? "");
    const text: ColumnContent = {
      kind: "markdown",
      md: (heading ? `## ${heading}\n\n` : "") + body,
    };
    const mediaLeft = (rb.mediaSide ?? rb.media_side ?? "left") === "left";
    return {
      type: "columns",
      count: 2,
      columns: mediaLeft ? [media, text] : [text, media],
    };
  }
  return null;
}

function isColumnKind(k: unknown): k is ColumnKind {
  return typeof k === "string" && ["markdown", "image", "grid", "video", "svg", "raw"].includes(k);
}

function normalizeColumn(raw: unknown): ColumnContent {
  const rc = (raw ?? {}) as Record<string, unknown>;
  if (!isColumnKind(rc.kind)) return newColumnContent("markdown");
  return { ...newColumnContent(rc.kind), ...(rc as object) } as ColumnContent;
}

export function normalizeProject(data: unknown): Project {
  const d = (data ?? {}) as Record<string, unknown>;
  const meta = { ...defaultMeta(), ...((d.meta as object) ?? {}) };
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
      merged.columns = [normalizeColumn(cols[0]), normalizeColumn(cols[1])];
      merged.count = merged.count === 1 ? 1 : 2;
    }
    blocks.push(merged);
  }
  const project: Project = { version: 1, meta, blocks };
  if (typeof d.exportSlug === "string" && d.exportSlug) project.exportSlug = d.exportSlug;
  return project;
}
