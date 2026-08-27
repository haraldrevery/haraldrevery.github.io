/*
 * Helpers shared by several block components. Transcribed from v1's render.ts.
 */
import type { CSSProperties } from "react";

/// Matches v1's escText (render.ts:59) — the three characters that change
/// parsing in element content. Only needed where text is spliced into an HTML
/// string; React escapes its own children.
export const escText = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/// Matches v1's escAttr (render.ts:50).
export const escAttr = (s: unknown) =>
  escText(s).replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

/*
 * GLightbox parses its caption as "key: value; key: value", so ';' and ':' are
 * STRUCTURAL — leaving them in user text splits the caption into garbage keys.
 * (v1 render.ts:71)
 */
export function glightboxCaption(title: string, desc: string): string {
  const clean = (s: string) => (s || "").replace(/;/g, ",").replace(/:/g, " -").trim();
  return `title: ${clean(title)}; description: ${clean(desc)}`;
}

/*
 * width:N% + centred, for sizing an image/svg against its container.
 * Returns undefined at 100% so no style attribute is emitted at all — v1 did
 * the same (render.ts:77), and it keeps the common case clean in committed HTML.
 */
export function pctStyle(widthPct: number): CSSProperties | undefined {
  const w = Math.max(5, Math.min(100, Math.round(widthPct || 100)));
  return w < 100 ? { width: `${w}%`, marginInline: "auto" } : undefined;
}

/// "11.2 MB"-style size, matching download.html's presentation.
export function humanSize(bytes: number): string {
  if (!bytes || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let u = 0;
  while (v >= 1000 && u < units.length - 1) {
    v /= 1000;
    u++;
  }
  return u === 0 ? `${v} B` : `${v.toFixed(1)} ${units[u]}`;
}
