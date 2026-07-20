/*
 * Block -> HTML renderers. Gallery/image/video/audio/prose markup is a 1:1
 * port of the earlier tkinter builder's block renderers; the rest is new.
 * The same functions produce the preview and the exported page; editMode
 * only adds data-pb-id attributes (selection targets) and editor chips, so
 * what you see is what exports.
 *
 * Every type has two render paths in the RENDERERS Record (compile-checked
 * against the Block union): `top` (standalone, with its own <section>
 * wrapper) and `inner` (inside a column — no section). Column children are
 * real blocks, so any embeddable type renders in columns automatically.
 *
 * Rule: only emit Tailwind classes that exist in the compiled main.css —
 * there is no CSS build on export.
 */
import { renderMarkdown } from "../markdown";
import { PROSE_TYPES, isEmbeddable } from "./defs";
import { getSvgText, themeSvgText, prepareSvgForInline } from "./svgStore";
import { wrapPlainWords, wrapHtmlWords } from "./wordAnimate";
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
  IconsBlock,
  ImageBlock,
  ParagraphBlock,
  SvgFields,
  VideoBlock,
} from "./model";

export interface RenderOptions {
  editMode?: boolean;
}

function escAttr(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function escText(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function aspectClass(aspect: string): string {
  if (aspect === "square") return "aspect-square";
  if (aspect === "video") return "aspect-video";
  return `aspect-[${aspect}]`;
}

// GLightbox parses "key: value; key: value" -> ';' and ':' are structural,
// so strip them out of user text to avoid breaking the caption.
function glightboxCaption(title: string, desc: string): string {
  const clean = (s: string) => (s || "").replace(/;/g, ",").replace(/:/g, " -").trim();
  return escAttr(`title: ${clean(title)}; description: ${clean(desc)}`);
}

/// width:N% + centered — used to size images/svgs relative to their container.
function pctStyle(widthPct: number): string {
  const w = Math.max(5, Math.min(100, Math.round(widthPct || 100)));
  return w < 100 ? ` style="width:${w}%;margin-inline:auto"` : "";
}

// ---------------------------------------------------------------- prose blocks

function headingHtml(b: HeadingBlock): string {
  const lvl = Math.max(1, Math.min(3, b.level || 2));
  const cls = b.align === "center" ? ' class="text-center"' : "";
  const text = b.animate ? wrapPlainWords(escText(b.text), b.id) : escText(b.text);
  return `<h${lvl}${cls}>${text}</h${lvl}>`;
}

function paragraphHtml(b: ParagraphBlock): string {
  const html = renderMarkdown(b.md);
  return b.animate ? wrapHtmlWords(html, b.id) : html;
}

/// Prose markup for the top-level <article class="prose"> grouping.
function proseBlock(b: Block): string {
  switch (b.type) {
    case "heading":
      return headingHtml(b);
    case "paragraph":
      return paragraphHtml(b);
    case "hr":
      return "<hr>";
    default:
      return "";
  }
}

const proseWrap = (inner: string) =>
  `<div class="prose dark:prose-invert max-w-none">${inner}</div>`;

// -------------------------------------------------------------------- gallery

function galleryItems(items: GalleryItem[], acl: string, group: string): string {
  return items
    .map((it) => {
      const full = escAttr(it.full);
      const thumb = escAttr(it.thumb || it.full);
      const alt = escAttr(it.alt);
      const cap = glightboxCaption(it.title, it.description);
      return (
        `      <a href="${full}"\n` +
        `         class="portfolio-item glightbox block ${acl}"\n` +
        `         data-gallery="${group}"\n` +
        `         data-glightbox="${cap}"\n` +
        `         style="--delay: 0.1s">\n` +
        `        <div class="overlay"></div>\n` +
        `        <img src="${thumb}" alt="${alt}" class="w-full h-full object-cover" loading="lazy">\n` +
        `      </a>`
      );
    })
    .join("\n");
}

/// Justified (Behance/Flickr) layout, zero JS: flex-grow proportional to each
/// image's aspect ratio + a native aspect-ratio makes the browser itself fill
/// every row at (approximately) the target row height with no cropping. The
/// trailing spacer stops the last row from stretching.
function justifiedItems(items: GalleryItem[], group: string, rowHeight: number): string {
  const rh = Math.max(60, Math.round(rowHeight || 320));
  // Greedy flex packing: items pack at flex-basis size, then grow to fill the
  // row. Basing at 75% of the target height packs more images per row (rows
  // land between ~0.75x and 1.5x the target — the Flickr look), and the
  // max-height cap (transferred to width via aspect-ratio) stops an item that
  // ends up alone on a row from ballooning to full row width.
  const basisH = Math.round(rh * 0.75);
  const maxH = Math.round(rh * 1.5);
  const rendered = items.map((it) => {
    const full = escAttr(it.full);
    const thumb = escAttr(it.thumb || it.full);
    const alt = escAttr(it.alt);
    const cap = glightboxCaption(it.title, it.description);
    // unknown dimensions -> assume 3/2 until revalidation fills them in
    const w = it.w && it.h ? it.w : 3;
    const h = it.w && it.h ? it.h : 2;
    const ratio = Math.round((w / h) * 10000) / 10000;
    return (
      `      <a href="${full}"\n` +
      `         class="portfolio-item glightbox block"\n` +
      `         data-gallery="${group}"\n` +
      `         data-glightbox="${cap}"\n` +
      `         style="--delay: 0.1s; aspect-ratio: ${w}/${h}; flex-grow: ${ratio}; flex-basis: calc(${ratio} * ${basisH}px); max-height: ${maxH}px">\n` +
      `        <div class="overlay"></div>\n` +
      `        <img src="${thumb}" alt="${alt}" class="w-full h-full object-cover" loading="lazy">\n` +
      `      </a>`
    );
  });
  rendered.push(`      <div style="flex-grow: 1000000" aria-hidden="true"></div>`);
  return rendered.join("\n");
}

/// about.html / galdhopiggen.html "feature" grid: 3x3 squares where the first
/// image spans 2x2 (4 slots); extra images keep flowing in rows of three.
function featureItems(items: GalleryItem[], group: string): string {
  return items
    .map((it, i) => {
      const full = escAttr(it.full);
      const thumb = escAttr(it.thumb || it.full);
      const alt = escAttr(it.alt);
      const cap = glightboxCaption(it.title, it.description);
      const span = i === 0 ? " col-span-2 row-span-2" : "";
      return (
        `      <a href="${full}"\n` +
        `         class="portfolio-item glightbox block${span} aspect-square"\n` +
        `         data-gallery="${group}"\n` +
        `         data-glightbox="${cap}"\n` +
        `         style="--delay: 0.1s">\n` +
        `        <div class="overlay"></div>\n` +
        `        <img src="${thumb}" alt="${alt}" class="w-full h-full object-cover" loading="lazy">\n` +
        `      </a>`
      );
    })
    .join("\n");
}

function galleryInner(b: GalleryBlock): string {
  const group = escAttr(b.group || "gallery");
  if (b.layout === "feature") {
    return `<div class="grid grid-cols-3 md:grid-cols-3 gap-4">\n${featureItems(b.items, group)}\n  </div>`;
  }
  if (b.layout === "uniform") {
    const acl = aspectClass(b.aspect || "5/7");
    const grid = `grid grid-cols-2 md:grid-cols-${b.columns || 3} gap-6`;
    return `<div class="${grid}">\n${galleryItems(b.items, acl, group)}\n  </div>`;
  }
  return `<div class="flex flex-wrap gap-2">\n${justifiedItems(b.items, group, b.rowHeight)}\n  </div>`;
}

// ---------------------------------------------------------------------- image

function imageInner(b: ImageBlock): string {
  const full = escAttr(b.full);
  const thumb = escAttr(b.thumb || b.full);
  const alt = escAttr(b.alt);
  const caption = (b.caption || "").trim();
  const figcap = caption ? `\n    <figcaption>${caption}</figcaption>` : "";
  let img: string;
  if (b.lightbox && b.full) {
    const cap = glightboxCaption(caption, "");
    img =
      `    <a href="${full}" class="glightbox block" data-gallery="single" data-glightbox="${cap}">\n` +
      `      <img src="${thumb}" alt="${alt}" class="w-full rounded-lg" loading="lazy">\n` +
      `    </a>`;
  } else {
    img = `    <img src="${thumb || full}" alt="${alt}" class="w-full rounded-lg" loading="lazy">`;
  }
  return `<figure${pctStyle(b.widthPct)}>\n${img}${figcap}\n  </figure>`;
}

// ---------------------------------------------------------------------- video

function videoInner(b: VideoBlock): string {
  const src = escAttr(b.src);
  const poster = escAttr(b.poster);
  const posterAttr = b.poster ? ` poster="${poster}"` : "";
  const caption = (b.caption || "").trim();
  const figcap = caption ? `\n    <figcaption>${caption}</figcaption>` : "";
  return (
    `<figure>\n` +
    `    <video controls class="w-full rounded-lg"${posterAttr}>\n` +
    `      <source src="${src}" type="video/mp4">\n` +
    `      Your browser does not support the video tag.\n` +
    `    </video>${figcap}\n  </figure>`
  );
}

// ---------------------------------------------------------------------- audio

function audioInner(b: AudioBlock): string {
  const src = escAttr(b.src);
  const title = escText(b.title);
  if (b.panel) {
    // release-page preview card: frosted glass + release caption styling
    // (letter-spacing inline — the tracking-eyebrow class may not be in the
    // compiled css, since utilities only ship if a scanned file uses them)
    return (
      `<div class="preview-card">\n` +
      `    <p class="font-mono text-xs uppercase opacity-50 mb-3" style="letter-spacing:0.3em">${title || "Preview"}</p>\n` +
      `    <audio controls preload="none" class="w-full">\n` +
      `      <source src="${src}" type="audio/mpeg">\n` +
      `      Your browser does not support the audio element.\n` +
      `    </audio>\n` +
      `  </div>`
    );
  }
  const label = b.title
    ? `<p class="font-mono text-sm uppercase tracking-widest mb-2 text-neutral-600 dark:text-neutral-400">${title}</p>\n  `
    : "";
  return `${label}<audio controls class="w-full" src="${src}"></audio>`;
}

// ------------------------------------------------------------------------ svg

/// themed -> the file is inlined with colors replaced by currentColor, so it
/// inherits text-black dark:text-white from the page body (light/dark aware).
/// Not themed -> a plain linked <img>, like every other medium.
function svgInner(f: SvgFields): string {
  let inner: string;
  if (f.themed) {
    const text = f.src ? getSvgText(f.src) : undefined;
    if (text === undefined) {
      inner = `<div class="font-mono text-sm text-neutral-500">${
        f.src ? `[svg ${escText(f.src)} not loaded]` : "[SVG — pick a file]"
      }</div>`;
    } else {
      let s = prepareSvgForInline(themeSvgText(text));
      if (f.alt) {
        s = s.replace(/<svg/i, `<svg role="img" aria-label="${escAttr(f.alt)}"`);
      }
      inner = s;
    }
  } else {
    inner = `<img src="${escAttr(f.src)}" alt="${escAttr(f.alt)}" class="w-full" loading="lazy">`;
  }

  // classes verified present in compiled main.css
  const grow = f.hoverGrow ? "transition-transform duration-300 hover:scale-105" : "";
  let core: string;
  if (f.link) {
    core = `<a href="${escAttr(f.link)}" class="block${grow ? " " + grow : ""}">${inner}</a>`;
  } else if (grow) {
    core = `<div class="${grow}">${inner}</div>`;
  } else {
    core = inner;
  }
  return `<div class="mx-auto"${pctStyle(f.widthPct)}>${core}</div>`;
}

// ---------------------------------------------------------------------- icons

/// Social/icon link row, mirroring the footer pattern: inlined currentColor
/// svgs, sr-only labels, hover:opacity-50 muting.
function iconsInner(b: IconsBlock): string {
  const sizeCls = b.size === "small" ? "w-6 h-6" : b.size === "medium" ? "w-8 h-8" : "";
  const sizeStyle = b.size === "large" ? ` style="width:2.5rem;height:2.5rem"` : "";
  const items = b.items.map((it) => {
    const external = /^https?:\/\//.test(it.href);
    const target = external ? ` target="_blank" rel="noopener noreferrer"` : "";
    let inner: string;
    const text = it.src ? getSvgText(it.src) : undefined;
    if (text !== undefined) {
      inner = prepareSvgForInline(themeSvgText(text));
    } else {
      inner = `<span class="font-mono text-sm">[${escText(it.src || "no svg")}]</span>`;
    }
    return (
      `    <a class="transition-opacity duration-300 hover:opacity-50" href="${escAttr(it.href || "#")}"${target}>\n` +
      `      <span class="sr-only">${escText(it.label)}</span>\n` +
      `      <div class="${sizeCls} flex items-center justify-center"${sizeStyle}>${inner}</div>\n` +
      `    </a>`
    );
  });
  // labeled panels mirror the release pages ("Listen everywhere"): mono
  // uppercase label + left-aligned row; unlabeled = centered footer style.
  // letter-spacing is inline — the release pages' tracking-eyebrow class may
  // not be in the compiled css, since utilities only ship if a scanned file
  // uses them.
  if (b.label.trim()) {
    return (
      `<p class="font-mono text-xs uppercase opacity-50 mb-4" style="letter-spacing:0.3em">${escText(b.label)}</p>\n` +
      `  <div class="flex flex-wrap items-center gap-6 text-gray-600 dark:text-gray-300">\n` +
      `${items.join("\n")}\n  </div>`
    );
  }
  return (
    `<div class="flex flex-wrap justify-center items-center gap-6 text-gray-600 dark:text-gray-300">\n` +
    `${items.join("\n")}\n  </div>`
  );
}

// ------------------------------------------------------------------------ faq

/// about.html-style CSS-only accordion: hidden checkbox + label toggle the
/// .faq-answer max-height via :checked sibling selectors. No JS. Checkbox ids
/// are prefixed with the block id so multiple FAQ blocks can't collide.
function faqInner(b: FaqBlock): string {
  const items = b.items
    .filter((it) => it.q.trim() || it.a.trim())
    .map((it, i) => {
      const id = `faq-${b.id}-${i}`;
      return (
        `    <div class="faq-item border border-zinc-200 dark:border-white/10 rounded-lg overflow-hidden">\n` +
        `      <input type="checkbox" id="${id}" class="faq-toggle hidden">\n` +
        `      <label for="${id}" class="faq-question block p-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">\n` +
        `        <div class="flex items-center justify-between">\n` +
        `          <h3 class="text-xl font-medium text-zinc-900 dark:text-white pr-8">${escText(it.q)}</h3>\n` +
        `          <span class="faq-icon text-3xl text-zinc-500 dark:text-zinc-400 flex-shrink-0">+</span>\n` +
        `        </div>\n` +
        `      </label>\n` +
        `      <div class="faq-answer">\n` +
        `        <div class="p-4 text-zinc-800 dark:text-zinc-200">${renderMarkdown(it.a)}</div>\n` +
        `      </div>\n` +
        `    </div>`
      );
    });
  return `<div class="space-y-2">\n${items.join("\n")}\n  </div>`;
}

// -------------------------------------------------------------------- downloads

/// "11.2 MB"-style human size (matches download.html's presentation).
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

/// download.html's verification table, with SHA-256/SHA-512 instead of MD5
/// (kept responsive the same way: sha-256 from md, sha-512 from lg).
function downloadsInner(b: DownloadsBlock): string {
  const rows = b.items
    .filter((it) => it.src)
    .map((it) => {
      const name = escText(it.label || it.src.split("/").pop() || it.src);
      return (
        `      <tr class="hover:opacity-50 transition-opacity">\n` +
        `        <td class="py-5 pr-2">\n` +
        `          <a href="${escAttr(it.src)}" download class="inline-block px-2 py-1 bg-zinc-900 rounded-sm dark:bg-white text-white dark:text-zinc-900 hover:opacity-80 transition-opacity uppercase text-[0.9rem] tracking-wider">Download</a>\n` +
        `        </td>\n` +
        `        <td class="py-5 pr-2"><span class="py-5 px-2 text-zinc-600 dark:text-zinc-400">${name}</span></td>\n` +
        `        <td class="py-5 px-1 text-zinc-600 dark:text-zinc-400">${humanSize(it.size)}</td>\n` +
        `        <td class="py-5 px-2 hidden md:table-cell"><code class="text-zinc-400 dark:text-zinc-500 break-all select-all">${escText(it.sha256)}</code></td>\n` +
        `        <td class="py-5 pl-2 hidden lg:table-cell"><code class="text-zinc-400 dark:text-zinc-500 break-all select-all">${escText(it.sha512)}</code></td>\n` +
        `      </tr>`
      );
    });
  return (
    `<div class="overflow-x-auto">\n` +
    `    <table class="w-full text-left border-collapse font-mono text-[0.85rem]">\n` +
    `      <thead>\n` +
    `        <tr class="border-b border-zinc-200 dark:border-white/10 text-zinc-500 uppercase text-[0.9rem]">\n` +
    `          <th class="py-4 pr-2 font-medium">Download Link</th>\n` +
    `          <th class="py-4 px-2 font-medium">File name</th>\n` +
    `          <th class="py-4 px-1 font-medium">Size</th>\n` +
    `          <th class="py-4 px-2 font-medium hidden md:table-cell">SHA-256 Hash</th>\n` +
    `          <th class="py-4 pl-2 font-medium hidden lg:table-cell">SHA-512 Hash</th>\n` +
    `        </tr>\n` +
    `      </thead>\n` +
    `      <tbody class="divide-y divide-zinc-100 dark:divide-white/5">\n` +
    `${rows.join("\n")}\n` +
    `      </tbody>\n` +
    `    </table>\n` +
    `  </div>`
  );
}

// -------------------------------------------------------------------- columns

function columns(b: ColumnsBlock, opts: RenderOptions): string {
  const edit = !!opts.editMode;
  const renderChild = (c: Block, i: number) => {
    // editor-only affordances: a type chip per column, and empty text slots
    // become a "pick content" target (both handled by the preview bridge)
    const chip = edit
      ? `<div class="pb-col-head"><button class="pb-col-chip" data-pb-col="${i}" type="button">${c.type} ▾</button></div>`
      : "";
    if (edit && c.type === "paragraph" && !(c as { md?: string }).md?.trim()) {
      return `${chip}<div class="pb-empty-col pb-col-chip" data-pb-col="${i}">＋ pick content</div>`;
    }
    return chip + RENDERERS[c.type].inner(c as never, { editMode: false });
  };
  const cols = b.columns.slice(0, b.count).map((c, i) => `    <div>${renderChild(c, i)}</div>`);
  const align = b.verticalAlign === "top" ? "items-start" : "items-center";
  const inner =
    b.count === 2
      ? `  <div class="grid md:grid-cols-2 gap-16 ${align}">\n${cols.join("\n")}\n  </div>`
      : `  <div>${renderChild(b.columns[0], 0)}</div>`;
  return `<section class="py-12 extra_fade_effect">\n${inner}\n</section>`;
}

// ----------------------------------------------------------------------- hero

/// Markup for the shell's normal static back link (used when no hero exists;
/// with a hero the hero renders the one-and-only, fade-in version instead).
export const STATIC_BACKLINK =
  '<a href="/notebook.html" class="inline-flex items-center text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors font-mono text-sm uppercase tracking-wider">\n   ← Back to Notebook\n</a>';

/// Full-viewport opener built from classes already in main.css (release-hero,
/// bg-dot-grid, extra_fade_effect, word_animation, #scroll-prompt). Rendered
/// into the shell's {{HERO}} slot (before the page container). Zero JS — the
/// only exception is the shell-level navi_mechanic nav-reveal fallback script.
function hero(b: HeroBlock): string {
  const center = b.align === "center";
  const cover = b.background === "cover";
  const lightCover = cover && b.coverStyle === "light";

  // ---- background layers
  let media = "";
  if ((b.background === "backdrop" || cover) && (b.image || b.imageThumb)) {
    if (cover) {
      // sharp full-bleed cover with a long fade-out into the page
      const mask =
        "-webkit-mask-image:linear-gradient(#000 72%,transparent 100%);mask-image:linear-gradient(#000 72%,transparent 100%)";
      const scrim = lightCover
        ? "linear-gradient(rgba(255,255,255,.74),rgba(255,255,255,.47) 45%,rgba(255,255,255,0) 90%)"
        : "linear-gradient(rgba(0,0,0,.74),rgba(0,0,0,.47) 45%,rgba(0,0,0,0) 90%)";
      media =
        `  <img src="${escAttr(b.image || b.imageThumb)}" alt="" class="absolute inset-0 w-full h-full object-cover" style="z-index:-2;${mask}" fetchpriority="high">\n` +
        `  <div class="absolute inset-0" style="z-index:-1;background:${scrim}"></div>\n`;
    } else {
      media =
        `  <div class="release-hero__backdrop" style="background-image: url('${escAttr(b.imageThumb || b.image)}')"></div>\n` +
        `  <div class="release-hero__scrim"></div>\n`;
    }
  }

  // ---- foreground: optional svg + text, sharing the in-animation setting
  const words = b.anim === "words";
  const fade = b.anim === "fade" || words; // words-mode svg still fades
  const text = (raw: string, field: string) =>
    words ? wrapPlainWords(escText(raw), `${b.id}:${field}`) : escText(raw);

  // svg left-aligned pages put the svg in a right column (release-hero__grid);
  // centered pages stack it above the text
  const sideBySide = b.showSvg && !!b.svgSrc && !center;

  let svg = "";
  if (b.showSvg && b.svgSrc) {
    const svgText = getSvgText(b.svgSrc);
    let inner: string;
    if (svgText !== undefined) {
      let s = prepareSvgForInline(themeSvgText(svgText));
      if (b.title) s = s.replace(/<svg/i, `<svg role="img" aria-label="${escAttr(b.title)}"`);
      inner = s;
    } else {
      inner = `<div class="font-mono text-sm text-neutral-500">[svg ${escText(b.svgSrc)} not loaded]</div>`;
    }
    const w = Math.max(5, Math.min(100, Math.round(b.svgWidthPct || 40)));
    const translate =
      b.svgX || b.svgY ? `transform:translate(${b.svgX || 0}%,${b.svgY || 0}%);` : "";
    const spacing = sideBySide ? "" : "margin-bottom:2.5rem";
    svg = `<div class="mx-auto${fade ? " extra_fade_effect" : ""}" style="width:${w}%;${translate}${spacing}">${inner}</div>\n`;
  }

  const kicker = b.kicker
    ? `<p class="release-hero__kicker">${text(b.kicker, "kicker")}</p>\n`
    : "";
  const title = b.title
    ? `<h1 class="release-hero__title">${text(b.title, "title")}</h1>\n`
    : "";
  const tagline = b.tagline
    ? `<p class="release-hero__tagline${center ? " mx-auto" : ""}">${text(b.tagline, "tagline")}</p>\n`
    : "";
  // fade animates the whole text box unless the words animate individually
  const textBoxCls = fade && !words ? ' class="extra_fade_effect"' : "";

  // cover tint follows the PHOTO, not the site theme: the scrim makes the
  // backdrop predictably dark or light in both modes, so the text color must
  // be forced to match (inheriting text-black dark:text-white would put white
  // text on the light scrim in dark mode).
  const sectionCls = "release-hero" + (b.background === "dots" ? " bg-dot-grid" : "");
  const innerCls =
    "page-container release-hero__inner" +
    (center ? " text-center" : "") +
    (cover ? (lightCover ? " text-black" : " text-white") : "");

  const hasPrompt = !!b.scrollPrompt.trim();

  // single back link, aligned to the page container's left content edge; when
  // the scroll prompt is on too, both sit on the same bottom row (bottom-10)
  const backLink = b.backLink
    ? `  <div class="page-container" style="position:absolute;left:0;right:0;bottom:${hasPrompt ? "2.5rem" : "1.5rem"};z-index:20">\n` +
      `    <a href="/notebook.html" class="extra_fade_effect_long inline-flex items-center text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors font-mono text-sm uppercase tracking-wider">← Back to Notebook</a>\n` +
      `  </div>\n`
    : "";

  // index.html-style delayed scroll prompt (#scroll-prompt CSS does the
  // fade); line breaks become <br> like "Welcome! <br> Scroll down …"
  const promptText = escText(b.scrollPrompt.trim()).replace(/\n/g, " <br> ");
  const prompt = hasPrompt
    ? `  <a href="#enter_site" id="scroll-prompt" class="absolute text-center bottom-10 text-black dark:text-white hover:text-neutral-500 dark:hover:text-neutral-300 transition-colors opacity-0 cursor-pointer z-50" style="left:50%;transform:translateX(-50%)">${promptText}</a>\n`
    : "";

  const anchor = hasPrompt ? `\n<div id="enter_site"></div>` : "";

  const foreground = sideBySide
    ? `    <div class="release-hero__grid">\n` +
      `      <div${textBoxCls}>\n${kicker}${title}${tagline}      </div>\n` +
      `      <div>\n${svg}      </div>\n` +
      `    </div>\n`
    : `    <div${textBoxCls}>\n${svg}${kicker}${title}${tagline}    </div>\n`;

  return (
    `<section class="${sectionCls}">\n` +
    media +
    `  <div class="${innerCls}">\n${foreground}  </div>\n` +
    backLink +
    prompt +
    `</section>` +
    anchor
  );
}

/// Hero blocks render into the shell's {{HERO}} slot regardless of their list
/// position — that's what "always on top" means.
export function renderHero(blocks: Block[], opts: RenderOptions = {}): string {
  const edit = !!opts.editMode;
  return blocks
    .filter((b): b is HeroBlock => b.type === "hero")
    .map((b) => (edit ? withPbId(hero(b), b.id) : hero(b)))
    .join("\n");
}

/// True when any hero wants the index/release-style nav reveal on scroll.
export function heroNavReveal(blocks: Block[]): boolean {
  return blocks.some((b) => b.type === "hero" && b.navReveal);
}

// ------------------------------------------------------------------ dispatch

interface Renderer {
  /// Standalone rendering with the block's own <section> wrapper.
  top(b: never, opts: RenderOptions): string;
  /// Inside a column — no outer section. Only called for embeddable types.
  inner(b: never, opts: RenderOptions): string;
}

function renderer<T extends Block>(r: {
  top(b: T, opts: RenderOptions): string;
  inner(b: T, opts: RenderOptions): string;
}): Renderer {
  return r as unknown as Renderer;
}

const RENDERERS: Record<BlockType, Renderer> = {
  // hero renders via renderHero into the {{HERO}} slot, never inline
  hero: renderer<HeroBlock>({ top: () => "", inner: () => "" }),
  // prose types render standalone only inside columns; at the top level the
  // prose-grouping path in renderContent handles them
  heading: renderer<HeadingBlock>({
    top: (b) => proseWrap(headingHtml(b)),
    inner: (b) => proseWrap(headingHtml(b)),
  }),
  paragraph: renderer<ParagraphBlock>({
    top: (b) => proseWrap(paragraphHtml(b)),
    inner: (b) => proseWrap(paragraphHtml(b)),
  }),
  hr: renderer<Block>({ top: () => "<hr>", inner: () => "<hr>" }),
  gallery: renderer<GalleryBlock>({
    // data-pb-items marks top-level galleries as item-drag targets in the
    // preview (editor-only attribute)
    top: (b, opts) =>
      `<section class="mb-20"${opts.editMode ? ' data-pb-items="1"' : ""}>\n  ${galleryInner(b)}\n</section>`,
    inner: (b) => galleryInner(b),
  }),
  image: renderer<ImageBlock>({
    top: (b) => `<section class="mb-16">\n  ${imageInner(b)}\n</section>`,
    inner: (b) => imageInner(b),
  }),
  svg: renderer<Block & SvgFields>({
    top: (b) => `<section class="mb-16">\n  ${svgInner(b)}\n</section>`,
    inner: (b) => svgInner(b),
  }),
  video: renderer<VideoBlock>({
    top: (b) => `<section class="mb-16">\n  ${videoInner(b)}\n</section>`,
    inner: (b) => videoInner(b),
  }),
  columns: renderer<ColumnsBlock>({
    top: (b, opts) => columns(b, opts),
    inner: () => "",
  }),
  icons: renderer<IconsBlock>({
    top: (b) => `<section class="mb-12">\n  ${iconsInner(b)}\n</section>`,
    inner: (b) => iconsInner(b),
  }),
  faq: renderer<FaqBlock>({
    // about.html constrains its FAQ to max-w-4xl centered — match it
    top: (b) => `<section class="mb-16">\n  <div class="max-w-4xl mx-auto">\n  ${faqInner(b)}\n  </div>\n</section>`,
    inner: (b) => faqInner(b),
  }),
  downloads: renderer<DownloadsBlock>({
    top: (b) => `<section class="mb-16">\n  ${downloadsInner(b)}\n</section>`,
    inner: (b) => downloadsInner(b),
  }),
  audio: renderer<AudioBlock>({
    top: (b) => `<section class="mb-12">\n  ${audioInner(b)}\n</section>`,
    inner: (b) => audioInner(b),
  }),
  raw: renderer<Block & { html: string }>({ top: (b) => b.html, inner: (b) => b.html }),
};

/// Tag a block's outermost element so the preview can select it; splittable
/// (= embeddable) blocks additionally advertise the "split into columns"
/// affordance to the bridge.
function withPbId(html: string, id: string, splittable = false): string {
  const split = splittable ? ' data-pb-split="1"' : "";
  if (html.trimStart().startsWith("<section")) {
    return html.replace("<section", `<section data-pb-id="${id}"${split}`);
  }
  return `<div data-pb-id="${id}"${split}>${html}</div>`;
}

export function renderContent(blocks: Block[], opts: RenderOptions = {}): string {
  const edit = !!opts.editMode;
  const out: string[] = [];
  let proseBuf: string[] = [];

  const flush = () => {
    if (proseBuf.length) {
      const inner = proseBuf.join("\n  ");
      out.push(`<article class="prose dark:prose-invert max-w-none">\n  ${inner}\n</article>`);
      proseBuf = [];
    }
  };

  for (const b of blocks) {
    if (b.type === "hero") continue; // heroes render into the {{HERO}} slot
    if (PROSE_TYPES.has(b.type)) {
      const html = proseBlock(b);
      const split = isEmbeddable(b.type) ? ' data-pb-split="1"' : "";
      proseBuf.push(edit ? `<div data-pb-id="${b.id}"${split}>${html}</div>` : html);
    } else {
      flush();
      const html = RENDERERS[b.type].top(b as never, opts);
      out.push(edit ? withPbId(html, b.id, isEmbeddable(b.type)) : html);
    }
  }
  flush();
  return out.join("\n\n");
}
