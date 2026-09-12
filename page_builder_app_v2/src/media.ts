import { invoke } from "@tauri-apps/api/core";
import { toast } from "./ui/toast";
import { hasSvgText, setSvgText } from "./blocks/svgStore";

/// A photo's embedded XMP title and description; null where it has none.
/// XMP only — see src-tauri/src/embedded_text.rs for why not EXIF or IPTC.
export interface ImageText {
  title: string | null;
  description: string | null;
}

export interface PickedFile {
  web: string;
  full: string;
  thumb: string;
  thumbExists: boolean;
  width: number | null;
  height: number | null;
  /// Only looked up for kind "image"; null when the file carries none.
  text: ImageText | null;
}

interface PickResult {
  files: PickedFile[];
  rejected: string[];
}

export type MediaKind = "image" | "svg" | "video" | "audio" | "any";

/// Native file picker; paths come back repo-relative (root-absolute web paths)
/// with the _min thumbnail already derived. Files outside the repo are
/// rejected by the backend and reported here.
export async function pickMedia(
  kind: MediaKind,
  multiple: boolean,
  startDir: string
): Promise<PickedFile[]> {
  const res = await invoke<PickResult>("pick_media", { kind, multiple, startDir });
  if (res.rejected.length) {
    toast(`Not inside the site repo (skipped): ${res.rejected.join(", ")}`, true);
  }
  return res.files;
}

/// foo.jpg -> foo_min.jpg (the site's thumbnail convention)
export function deriveMinPath(web: string): string {
  const slash = web.lastIndexOf("/");
  const dot = web.lastIndexOf(".");
  if (dot <= slash) return web + "_min";
  const base = web.slice(0, dot);
  const ext = web.slice(dot);
  return base.endsWith("_min") ? web : `${base}_min${ext}`;
}

export async function checkFiles(paths: string[]): Promise<boolean[]> {
  if (!paths.length) return [];
  return invoke<boolean[]>("check_files", { paths });
}

/// Batch pixel-dimension lookup for repo images ([w, h] or null per path).
export async function imageDims(paths: string[]): Promise<([number, number] | null)[]> {
  if (!paths.length) return [];
  return invoke<([number, number] | null)[]>("image_dims", { paths });
}

/// Batch embedded title/description lookup for repo images (null per path
/// that carries none, or cannot be read).
export async function imageText(paths: string[]): Promise<(ImageText | null)[]> {
  if (!paths.length) return [];
  return invoke<(ImageText | null)[]>("image_text", { paths });
}

export interface FileHashInfo {
  size: number;
  sha256: string;
  sha512: string;
}

/// Streamed SHA-256/SHA-512 + size per file; null for missing files.
export async function hashFiles(paths: string[]): Promise<(FileHashInfo | null)[]> {
  if (!paths.length) return [];
  return invoke<(FileHashInfo | null)[]>("hash_files", { paths });
}

/// Load an svg's text into the sync cache the renderer reads from.
/// Errors are reported (toast) but don't throw — the preview shows a
/// placeholder until the file exists.
export async function prefetchSvg(src: string): Promise<void> {
  if (!src || hasSvgText(src)) return;
  try {
    const text = await invoke<string>("read_svg", { path: src });
    setSvgText(src, text);
  } catch (e) {
    toast(String(e), true);
  }
}

export async function prefetchSvgs(srcs: string[]): Promise<void> {
  await Promise.all(srcs.map((s) => prefetchSvg(s)));
}
