/*
 * Export pipeline — port of the pure helpers in the earlier tkinter
 * builder. An exported page is:
 * YAML front matter + shell.html with every {{PLACEHOLDER}} filled.
 * Eleventy's before-hook then strips the front matter and copies the body
 * verbatim to notebook_pages/; the front matter drives the Notebook index.
 */
import { renderContent, renderHero, heroNavReveal, STATIC_BACKLINK } from "./blocks/render";
import { renderMarkdown } from "./markdown";
import { walkBlocks } from "./blocks/defs";
import type { Block, FaqItem } from "./blocks/model";

export type SchemaChoice = "auto" | "blogposting" | "article" | "imagegallery" | "faqpage";

export interface Meta {
  title: string;
  date: string;
  tags: string;
  description: string;
  image: string;
  draft: boolean;
  /// JSON-LD primary type; "auto" derives it from the page content.
  schemaType: SchemaChoice;
}

export function slugify(text: string): string {
  let s = (text || "untitled").toLowerCase();
  s = s.replace(/[^\p{L}\p{N}_\s-]/gu, "");
  s = s.replace(/\s+/g, "-").replace(/^-+|-+$/g, "");
  s = s.replace(/-+/g, "-");
  return s || "untitled";
}

export function humanDate(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateStr || "").trim());
  if (!m) return dateStr || "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function splitTags(tags: string): string[] {
  return tags.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
}

// gray-matter needs values containing ':' quoted (the old builder broke here)
function yamlValue(v: string): string {
  if (/[:#\[\]{}"']/g.test(v)) {
    return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return v;
}

export function frontmatterYaml(meta: Meta): string {
  const lines = ["---"];
  lines.push(`title: ${yamlValue(meta.title || "")}`);
  lines.push(`date: ${meta.date || ""}`);
  lines.push(`tags: [${splitTags(meta.tags).join(", ")}]`);
  if (meta.image) lines.push(`image: ${meta.image}`);
  if (meta.description) lines.push(`description: ${yamlValue(meta.description)}`);
  if (meta.draft) lines.push("draft: true");
  lines.push("---");
  return lines.join("\n");
}

// ------------------------------------------------------------- schema / SEO

export type SchemaType = "BlogPosting" | "Article" | "ImageGallery" | "FAQPage";

interface ContentStats {
  galleryImages: number;
  textBlocks: number;
  words: number;
  faqItems: FaqItem[];
  images: { url: string; w?: number; h?: number }[];
}

function collectStats(blocks: Block[]): ContentStats {
  const s: ContentStats = { galleryImages: 0, textBlocks: 0, words: 0, faqItems: [], images: [] };
  const countWords = (t: string) => t.split(/\s+/).filter(Boolean).length;
  walkBlocks(blocks, (b, ctx) => {
    if (!ctx.visible) return;
    if (b.type === "gallery") {
      s.galleryImages += b.items.length;
      for (const it of b.items) {
        if (it.full) s.images.push({ url: it.full, w: it.w, h: it.h });
      }
    } else if (b.type === "image" && b.full) {
      s.images.push({ url: b.full });
    } else if (b.type === "paragraph") {
      s.textBlocks++;
      s.words += countWords(b.md);
    } else if (b.type === "heading") {
      s.words += countWords(b.text);
    } else if (b.type === "hero") {
      s.words += countWords(`${b.kicker} ${b.title} ${b.tagline}`);
    } else if (b.type === "faq") {
      s.faqItems.push(...b.items.filter((it) => it.q.trim() && it.a.trim()));
    }
  });
  return s;
}

/// The primary JSON-LD type — manual override or content-derived (auto):
/// FAQ-dominated pages -> FAQPage, photo-dominated -> ImageGallery,
/// otherwise BlogPosting (the notebook default).
export function resolveSchemaType(
  meta: Meta,
  blocks: Block[]
): { type: SchemaType; auto: boolean } {
  switch (meta.schemaType) {
    case "blogposting":
      return { type: "BlogPosting", auto: false };
    case "article":
      return { type: "Article", auto: false };
    case "imagegallery":
      return { type: "ImageGallery", auto: false };
    case "faqpage":
      return { type: "FAQPage", auto: false };
  }
  const s = collectStats(blocks);
  if (s.faqItems.length >= 2 && s.galleryImages === 0 && s.textBlocks <= 2) {
    return { type: "FAQPage", auto: true };
  }
  if (s.galleryImages >= 4 && s.galleryImages > s.textBlocks) {
    return { type: "ImageGallery", auto: true };
  }
  return { type: "BlogPosting", auto: true };
}

const MAX_SCHEMA_IMAGES = 6;

export function jsonld(meta: Meta, blocks: Block[], canonical: string, siteUrl: string): string {
  const { type } = resolveSchemaType(meta, blocks);
  const stats = collectStats(blocks);

  // image array: card image first, then real page images with known pixel
  // dimensions (Google wants multiple images incl. sizes)
  const seen = new Set<string>();
  const images: unknown[] = [];
  const pushImage = (url: string, w?: number, h?: number) => {
    if (!url || seen.has(url) || images.length >= MAX_SCHEMA_IMAGES) return;
    seen.add(url);
    if (w && h) {
      images.push({ "@type": "ImageObject", url: siteUrl + url, width: w, height: h });
    } else {
      images.push(siteUrl + url);
    }
  };
  if (meta.image) pushImage(meta.image);
  for (const im of stats.images) pushImage(im.url, im.w, im.h);

  const primary: Record<string, unknown> = {
    "@type": type,
    headline: meta.title || "",
    description: meta.description || "",
    datePublished: meta.date || "",
    dateModified: meta.date || "",
    author: { "@type": "Person", name: "Harald Revery", url: `${siteUrl}/about` },
    publisher: { "@type": "Person", name: "Harald Revery" },
    mainEntityOfPage: canonical,
    inLanguage: "en",
  };
  const tags = splitTags(meta.tags);
  if (tags.length) primary.keywords = tags.join(", ");
  if (stats.words > 0 && (type === "BlogPosting" || type === "Article")) {
    primary.wordCount = stats.words;
  }
  if (images.length) primary.image = images.length === 1 ? images[0] : images;

  // real Q&A from the page's FAQ blocks: on the primary when it IS a FAQPage,
  // otherwise as a second entity in an @graph
  const faqEntity = stats.faqItems.length
    ? {
        "@type": "FAQPage",
        mainEntity: stats.faqItems.map((it) => ({
          "@type": "Question",
          name: it.q,
          acceptedAnswer: { "@type": "Answer", text: renderMarkdown(it.a) },
        })),
      }
    : null;

  let obj: Record<string, unknown>;
  if (faqEntity && type === "FAQPage") {
    obj = { "@context": "https://schema.org", ...primary, mainEntity: faqEntity.mainEntity };
  } else if (faqEntity) {
    obj = { "@context": "https://schema.org", "@graph": [primary, faqEntity] };
  } else {
    obj = { "@context": "https://schema.org", ...primary };
  }
  return (
    '<script type="application/ld+json">\n' + JSON.stringify(obj, null, 2) + "\n</script>"
  );
}

export function assembleDocument(
  shell: string,
  meta: Meta,
  blocks: Block[],
  siteUrl: string,
  slug?: string
): string {
  const s = slug || slugify(meta.title);
  const canonical = `${siteUrl}/notebook_pages/${s}`;
  const title = (meta.title || "").trim();
  const repl: Record<string, string> = {
    "{{TITLE}}": title ? `Harald Revery - ${title}` : "Harald Revery",
    "{{DESCRIPTION}}": meta.description || "",
    "{{KEYWORDS}}": meta.tags || "",
    // og/twitter title order matches base.njk ("title - Harald Revery")
    "{{OG_TITLE}}": title ? `${title} - Harald Revery` : "Harald Revery",
    "{{OG_DESC}}": meta.description || "",
    "{{OG_IMAGE}}": meta.image ? siteUrl + meta.image : `${siteUrl}/opengraphimg.jpg`,
    "{{OG_URL}}": canonical,
    "{{CANONICAL}}": canonical,
    "{{DATE_ISO}}": meta.date || "",
    "{{DATE_HUMAN}}": humanDate(meta.date),
    "{{JSONLD}}": jsonld(meta, blocks, canonical, siteUrl),
    "{{HERO}}": renderHero(blocks, { editMode: false }),
    // hero pages carry their own fade-in back link — never show both
    "{{BACKLINK}}": blocks.some((b) => b.type === "hero") ? "" : STATIC_BACKLINK,
    "{{NAV_EXTRA}}": heroNavReveal(blocks) ? " navi_mechanic" : "",
    "{{NAV_SCRIPT}}": heroNavReveal(blocks)
      ? '<script src="/javascript/navbar_scroll_min.js" defer></script>'
      : "",
    "{{CONTENT}}": renderContent(blocks, { editMode: false }),
  };
  let doc = shell;
  for (const [k, v] of Object.entries(repl)) {
    doc = doc.split(k).join(v);
  }
  return doc;
}

export function exportText(
  shell: string,
  meta: Meta,
  blocks: Block[],
  siteUrl: string,
  slug?: string
): string {
  return frontmatterYaml(meta) + "\n" + assembleDocument(shell, meta, blocks, siteUrl, slug);
}
