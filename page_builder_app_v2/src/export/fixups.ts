/*
 * On-open / pre-export fix-up passes. Ported from v1's main.ts:306-409.
 *
 * These reconcile a saved project against what is actually on disk right now.
 * Both MUTATE the data in place, which is safe because they run before Puck
 * mounts (on open) or against the live data just before an export writes.
 *
 * They are verification, not editing — v1 deliberately kept them out of the
 * undo history, and so does this.
 */
import type { Config, Data } from "@measured/puck";
import { visitComponents } from "./collect";
import { checkFiles, deriveMinPath, hashFiles, imageDims } from "../media";
import { toast } from "../ui/toast";
import type { GalleryItem } from "../puck/components/Gallery";
import type { DownloadItem } from "../puck/components/Lists";

export interface Imageish {
  full: string;
  thumb: string;
  thumbMissing?: boolean;
  w?: number;
  h?: number;
}

/*
 * Which thumbnail an item should use, given what is on disk. Pure, so the
 * branching is testable without going through Tauri.
 *
 * The `_min` convention: `foo.jpg` is the full-size image (what the lightbox
 * opens) and `foo_min.jpg` the grid thumbnail. Picking a photo before its
 * thumbnail exists is the intended workflow, so a `_min` that shows up later is
 * adopted automatically.
 */
export function resolveThumb(
  it: Imageish,
  exists: (path: string) => boolean,
): { thumb: string; thumbMissing: boolean } {
  const thumb = it.thumb || it.full;
  const expected = deriveMinPath(it.full);

  // Currently falling back to the full-size image, and a distinct _min path is
  // possible: adopt it if it has appeared, otherwise flag it as still missing.
  if (thumb === it.full && expected !== it.full) {
    return exists(expected)
      ? { thumb: expected, thumbMissing: false }
      : { thumb, thumbMissing: true };
  }
  // Otherwise trust the stored thumb, but re-check that it is still there.
  return { thumb, thumbMissing: !exists(thumb) };
}

/*
 * Re-check a flat list of image-ish items against disk: adopt `_min` files that
 * have appeared, flag ones that have not, and backfill pixel dimensions.
 * Mutates in place and returns the same list.
 *
 * Shared by the on-open pass and the gallery editor's "Re-check files" button,
 * so a thumbnail generated mid-session can be picked up without reopening.
 */
export async function recheckImages(items: Imageish[]): Promise<Imageish[]> {
  const withPath = items.filter((it) => it.full);
  if (!withPath.length) return items;

  const needDims = withPath.filter((it) => !it.w || !it.h);
  if (needDims.length) {
    const dims = await imageDims(needDims.map((it) => it.full)).catch((e) => {
      toast(`Image dimension lookup failed: ${e}`, true);
      return needDims.map(() => null);
    });
    needDims.forEach((it, i) => {
      const d = dims[i];
      if (d) {
        it.w = d[0];
        it.h = d[1];
      }
    });
  }

  const paths = new Set<string>();
  for (const it of withPath) {
    paths.add(deriveMinPath(it.full));
    if (it.thumb) paths.add(it.thumb);
  }
  const list = [...paths];

  // Permissive fallback (assume present) so a backend failure never blocks
  // opening a project — but SAY so, rather than silently dropping the badges.
  const results = await checkFiles(list).catch((e) => {
    toast(`Thumbnail check failed: ${e}`, true);
    return list.map(() => true);
  });
  const exists = new Map(list.map((p, i) => [p, results[i]]));

  for (const it of withPath) {
    const r = resolveThumb(it, (p) => !!exists.get(p));
    it.thumb = r.thumb;
    it.thumbMissing = r.thumbMissing;
  }
  return items;
}

/*
 * Re-check `_min` thumbnails on disk and auto-adopt ones that appeared since
 * the project was saved — "link now, add the thumbnail later" is the intended
 * workflow. Also backfills pixel dimensions, which the justified gallery layout
 * needs to compute its flex ratios.
 *
 * Hidden slots are included: a column switched back to 2 must not surface stale
 * badges for content that was simply not being rendered.
 */
export async function revalidateThumbs(data: Data, config: Config): Promise<void> {
  const items: Imageish[] = [];
  visitComponents(data, config, ({ type, props }) => {
    if (type === "Gallery") items.push(...((props.items ?? []) as GalleryItem[]));
    // The Image block keeps {full, thumb} as ONE prop (see fields/mediaField.tsx).
    else if (type === "Image" && props.image) items.push(props.image as Imageish);
  });
  if (items.length) await recheckImages(items);
}

export interface HashReport {
  /// Files whose bytes changed since the stored hash was written.
  changed: string[];
  /// Files that are no longer on disk.
  missing: string[];
  /// Whether anything was actually rewritten.
  dirtied: boolean;
}

/*
 * Recompute download hashes from the ACTUAL file bytes.
 *
 * This is the one pass that must never be skipped before an export: a published
 * SHA that does not match the file is worse than no SHA at all, and rebuilding
 * a binary changes its bytes without touching the project.
 */
export async function refreshDownloadHashes(data: Data, config: Config): Promise<HashReport> {
  const items: DownloadItem[] = [];
  visitComponents(data, config, ({ type, props }) => {
    if (type === "Downloads") {
      items.push(...((props.items ?? []) as DownloadItem[]).filter((it) => it.src));
    }
  });
  if (!items.length) return { changed: [], missing: [], dirtied: false };

  // A backend failure is not "every file is missing" — report it and leave the
  // stored hashes untouched.
  const hashes = await hashFiles(items.map((it) => it.src)).catch((e) => {
    toast(`Download hash check failed: ${e}`, true);
    return null;
  });
  if (!hashes) return { changed: [], missing: [], dirtied: false };

  const changed: string[] = [];
  const missing: string[] = [];
  let dirtied = false;

  items.forEach((it, i) => {
    const h = hashes[i];
    const name = it.src.split("/").pop() || it.src;
    if (!h) {
      if (!it.missing) dirtied = true;
      it.missing = true;
      missing.push(name);
      return;
    }
    if (it.missing) dirtied = true;
    it.missing = false;
    if (it.sha256 !== h.sha256 || it.sha512 !== h.sha512 || it.size !== h.size) {
      // Only report REAL changes, not first fills — a newly added file has no
      // previous hash to have drifted from.
      if (it.sha256) changed.push(name);
      it.sha256 = h.sha256;
      it.sha512 = h.sha512;
      it.size = h.size;
      dirtied = true;
    }
  });

  return { changed, missing, dirtied };
}
