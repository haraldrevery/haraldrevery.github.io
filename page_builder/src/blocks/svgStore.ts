/*
 * SVG content cache + transforms. Pure module (no Tauri imports) so the
 * renderer stays synchronous and unit-testable; src/media.ts fills the cache
 * via the read_svg command before renders/exports that need it.
 */
import type { Block, ColumnContent } from "./model";

const cache = new Map<string, string>();

export function getSvgText(src: string): string | undefined {
  return cache.get(src);
}

export function setSvgText(src: string, text: string): void {
  cache.set(src, text);
}

export function hasSvgText(src: string): boolean {
  return cache.has(src);
}

/// Every svg src referenced by the given blocks (top-level + inside columns).
export function collectSvgSrcs(blocks: Block[]): string[] {
  const out = new Set<string>();
  for (const b of blocks) {
    if (b.type === "svg" && b.src) out.add(b.src);
    if (b.type === "columns") {
      for (const c of b.columns as ColumnContent[]) {
        if (c.kind === "svg" && c.src) out.add(c.src);
      }
    }
  }
  return [...out];
}

/// Recolor an svg to currentColor so it follows the page's light/dark theme
/// (the site's <body> carries text-black dark:text-white). fill/stroke that
/// are "none" or url(#...) references are left alone. The lookbehind keeps
/// attributes like viewport-fill from being mangled.
export function themeSvgText(svg: string): string {
  let s = svg;
  s = s.replace(/(?<![-\w])(fill|stroke)="(?!none|url\()[^"]*"/gi, '$1="currentColor"');
  s = s.replace(/(?<![-\w])(fill|stroke)='(?!none|url\()[^']*'/gi, "$1='currentColor'");
  s = s.replace(/(?<![-\w])(fill|stroke)\s*:\s*(?!none|url\()[^;"'}]+/gi, "$1:currentColor");
  // Illustrator-style exports often carry no fill at all — SVG's default fill
  // is black, which ignores the theme. fill is inherited, so putting
  // currentColor on the root covers every shape without an explicit fill.
  const root = s.match(/<svg[^>]*>/i);
  if (root && !/(?<![-\w])fill\s*=/i.test(root[0])) {
    s = s.replace(/<svg/i, '<svg fill="currentColor"');
  }
  return s;
}

/// Strip XML prolog/doctype and make the root element scale to its container
/// (fixed width/height attributes replaced by width:100% styling; the viewBox
/// keeps the aspect ratio).
export function prepareSvgForInline(svg: string): string {
  let s = svg.replace(/<\?xml[^>]*\?>/gi, "").replace(/<!DOCTYPE[^>]*>/gi, "").trim();
  s = s.replace(/<svg([^>]*)>/i, (_m, attrs: string) => {
    let cleaned = attrs.replace(/\s(width|height)="[^"]*"/gi, "");
    cleaned = cleaned.replace(/\s(width|height)='[^']*'/gi, "");
    if (/style\s*=\s*"/i.test(cleaned)) {
      cleaned = cleaned.replace(/style\s*=\s*"([^"]*)"/i, 'style="$1;width:100%;height:auto"');
    } else {
      cleaned += ' style="width:100%;height:auto"';
    }
    return `<svg${cleaned}>`;
  });
  return s;
}
