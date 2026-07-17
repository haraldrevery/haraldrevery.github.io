/*
 * Block -> HTML renderers. Gallery/image/video/audio/prose markup is a 1:1
 * port of old_page_builder/blocks.py; svg and columns are new. The same
 * function produces the preview and the exported page; editMode only adds
 * data-pb-id attributes (selection targets), so what you see is what exports.
 *
 * Rule: only emit Tailwind classes that exist in the compiled main.css —
 * there is no CSS build on export. (hover:scale-105 / transition-transform /
 * duration-300 are verified present.)
 */
import { renderMarkdown } from "../markdown";
import { PROSE_TYPES } from "./model";
import { getSvgText, themeSvgText, prepareSvgForInline } from "./svgStore";
import type {
  AudioBlock,
  Block,
  ColumnContent,
  ColumnsBlock,
  GalleryBlock,
  GalleryItem,
  ImageBlock,
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

// ---------------------------------------------------------------- prose blocks
function proseBlock(b: Block): string {
  switch (b.type) {
    case "heading": {
      const lvl = Math.max(1, Math.min(3, b.level || 2));
      return `<h${lvl}>${escText(b.text)}</h${lvl}>`;
    }
    case "paragraph":
      return renderMarkdown(b.md);
    case "hr":
      return "<hr>";
    default:
      return "";
  }
}

// --------------------------------------------------------------- media blocks
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

function gallery(b: GalleryBlock): string {
  const group = escAttr(b.group || "gallery");
  if (b.layout !== "uniform") {
    return `<section class="mb-20">\n  <div class="flex flex-wrap gap-2">\n${justifiedItems(b.items, group, b.rowHeight)}\n  </div>\n</section>`;
  }
  const acl = aspectClass(b.aspect || "5/7");
  const grid = `grid grid-cols-2 md:grid-cols-${b.columns || 3} gap-6`;
  return `<section class="mb-20">\n  <div class="${grid}">\n${galleryItems(b.items, acl, group)}\n  </div>\n</section>`;
}

function image(b: ImageBlock): string {
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
  return `<section class="mb-16">\n  <figure>\n${img}${figcap}\n  </figure>\n</section>`;
}

function video(b: VideoBlock): string {
  const src = escAttr(b.src);
  const poster = escAttr(b.poster);
  const posterAttr = b.poster ? ` poster="${poster}"` : "";
  const caption = (b.caption || "").trim();
  const figcap = caption ? `\n    <figcaption>${caption}</figcaption>` : "";
  return (
    `<section class="mb-16">\n  <figure>\n` +
    `    <video controls class="w-full rounded-lg"${posterAttr}>\n` +
    `      <source src="${src}" type="video/mp4">\n` +
    `      Your browser does not support the video tag.\n` +
    `    </video>${figcap}\n  </figure>\n</section>`
  );
}

function audio(b: AudioBlock): string {
  const src = escAttr(b.src);
  const title = escText(b.title);
  const label = b.title
    ? `\n  <p class="font-mono text-sm uppercase tracking-widest mb-2 text-neutral-600 dark:text-neutral-400">${title}</p>`
    : "";
  return `<section class="mb-12">${label}\n  <audio controls class="w-full" src="${src}"></audio>\n</section>`;
}

// ------------------------------------------------------------------------ svg

/// Inner svg markup shared by the svg block and svg column content.
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
  const width = f.maxWidth.trim() ? ` style="max-width:${escAttr(f.maxWidth.trim())}px"` : "";
  return `<div class="mx-auto"${width}>${core}</div>`;
}

function svgBlock(b: Block & SvgFields): string {
  return `<section class="mb-16">\n  ${svgInner(b)}\n</section>`;
}

// -------------------------------------------------------------------- columns

function columnContent(c: ColumnContent): string {
  switch (c.kind) {
    case "markdown":
      return `<div class="prose dark:prose-invert max-w-none">${renderMarkdown(c.md)}</div>`;
    case "image": {
      const img = `<img src="${escAttr(c.thumb || c.full)}" alt="${escAttr(c.alt)}" class="w-full rounded-lg" loading="lazy">`;
      if (c.lightbox && c.full) {
        const cap = glightboxCaption(c.alt, "");
        return `<a href="${escAttr(c.full)}" class="glightbox block" data-gallery="single" data-glightbox="${cap}">${img}</a>`;
      }
      return img;
    }
    case "grid": {
      const group = escAttr(c.group || "grid");
      if (c.layout !== "uniform") {
        return `<div class="flex flex-wrap gap-2">\n${justifiedItems(c.items, group, c.rowHeight)}\n    </div>`;
      }
      const acl = aspectClass(c.aspect || "square");
      const grid = `grid grid-cols-2 md:grid-cols-${c.columns || 2} gap-4`;
      return `<div class="${grid}">\n${galleryItems(c.items, acl, group)}\n    </div>`;
    }
    case "video": {
      const posterAttr = c.poster ? ` poster="${escAttr(c.poster)}"` : "";
      return `<video controls class="w-full rounded-lg"${posterAttr}><source src="${escAttr(c.src)}" type="video/mp4"></video>`;
    }
    case "svg":
      return svgInner(c);
    case "raw":
      return c.html;
  }
}

function columns(b: ColumnsBlock): string {
  const cols = b.columns.slice(0, b.count).map((c) => `    <div>${columnContent(c)}</div>`);
  const inner =
    b.count === 2
      ? `  <div class="grid md:grid-cols-2 gap-16 items-center">\n${cols.join("\n")}\n  </div>`
      : `  <div>${columnContent(b.columns[0])}</div>`;
  return `<section class="py-12 extra_fade_effect">\n${inner}\n</section>`;
}

// ------------------------------------------------------------------ dispatch

function mediaBlock(b: Block): string {
  switch (b.type) {
    case "gallery":
      return gallery(b);
    case "image":
      return image(b);
    case "svg":
      return svgBlock(b);
    case "video":
      return video(b);
    case "columns":
      return columns(b);
    case "audio":
      return audio(b);
    case "raw":
      return b.html;
    default:
      return "";
  }
}

/// Tag a media block's outermost <section> so the preview can select it.
function withPbId(html: string, id: string): string {
  if (html.trimStart().startsWith("<section")) {
    return html.replace("<section", `<section data-pb-id="${id}"`);
  }
  return `<div data-pb-id="${id}">${html}</div>`;
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
    if (PROSE_TYPES.has(b.type)) {
      const html = proseBlock(b);
      proseBuf.push(edit ? `<div data-pb-id="${b.id}">${html}</div>` : html);
    } else {
      flush();
      const html = mediaBlock(b);
      out.push(edit ? withPbId(html, b.id) : html);
    }
  }
  flush();
  return out.join("\n\n");
}
