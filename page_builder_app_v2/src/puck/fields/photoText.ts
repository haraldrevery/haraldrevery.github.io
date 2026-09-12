/*
 * Pre-filling caption fields from the title and description a photo carries
 * inside the file (its XMP — see src-tauri/src/embedded_text.rs for why XMP
 * and nothing else).
 *
 * Three rules, all decided by the site's author:
 *   - Only on IMPORT: picking a photo, or the gallery's explicit "fill" button.
 *     Never on open or export, so it can never quietly edit a saved page.
 *   - Only EMPTY fields are filled. Text the author typed is never replaced,
 *     including when a block's photo is swapped for a different one.
 *   - Alt text is never a target. It is the author's to write, and the
 *     missing-alt check keeps asking for it.
 *
 * Pure, so the rules are tested without Tauri or Puck.
 */
import type { ImageText } from "../../media";

/// Which of a block's props receive the photo's title and its description.
export interface TextTargets {
  title?: string;
  description?: string;
}

export const GALLERY_TEXT: TextTargets = { title: "title", description: "description" };
export const IMAGE_TEXT: TextTargets = { description: "caption" };
export const FEATURED_TEXT: TextTargets = { title: "title", description: "excerpt" };

/// The props to add, given what the block (or gallery item) holds now. Empty
/// when there is nothing to fill.
export function textFill(
  text: ImageText | null | undefined,
  targets: TextTargets,
  current: object,
): Record<string, string> {
  if (!text) return {};
  const now = (key: string) => String((current as Record<string, unknown>)[key] ?? "").trim();
  const out: Record<string, string> = {};

  if (targets.title && text.title && !now(targets.title)) {
    out[targets.title] = text.title;
  }
  // Never put a description beside an identical title: the lightbox caption
  // shows both, so it would read the same line twice. Several photos in
  // photos/ carry the same text in both fields. Compared against the title the
  // block will END UP with, typed or filled. A block with no title field (the
  // Image caption) keeps the description regardless.
  const title = targets.title ? (out[targets.title] ?? now(targets.title)) : "";
  if (targets.description && text.description && !now(targets.description) && text.description !== title) {
    out[targets.description] = text.description;
  }
  return out;
}
