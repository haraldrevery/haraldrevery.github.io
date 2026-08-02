/*
 * Export pipeline. An exported page is:
 *   YAML front matter + shell.html with every {{PLACEHOLDER}} filled.
 * Eleventy's before-hook then strips the front matter and copies the body
 * VERBATIM to notebook_pages/; the front matter drives the Notebook index.
 * Nothing is injected downstream, so what this produces is the whole page.
 *
 * Ported from v1's src/export.ts. The pure helpers (yamlValue, frontmatterYaml,
 * slugify, humanDate, resolveSchemaType, jsonld, assembleDocument) are
 * unchanged; only the places that inspected a Block[] now take Puck `Data` and
 * go through src/export/collect.ts.
 */
import type { Config, Data } from "@measured/puck";
import { renderMarkdown } from "../markdown";
import { collectStats } from "./collect";
import type { PageMeta, SchemaChoice, RootProps } from "../puck/PageRoot";
import { STATIC_BACKLINK } from "../puck/components/Hero";

export type { PageMeta, SchemaChoice };

/// Matches v1's escAttr (render.ts:50) — used for values that land in
/// attributes and <title>. The markup-valued placeholders are deliberately NOT
/// escaped; they are HTML by design.
export function escAttr(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
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

/// Always double-quote. Deciding *when* to quote is what kept going wrong: a
/// bare value breaks on ':' and '#', on indicator characters (* & ! % @ ` | >),
/// and on implicit typing — "2024" becomes a number, "No"/"Yes"/"On" become
/// booleans, date-shaped titles become timestamps. A newline was worse than
/// wrong output: it injected a second front-matter key.
function yamlValue(v: string): string {
  const body = String(v ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
  return `"${body}"`;
}

export function frontmatterYaml(meta: PageMeta): string {
  const lines = ["---"];
  lines.push(`title: ${yamlValue(meta.title || "")}`);
  lines.push(`date: ${meta.date || ""}`);
  // quoted per entry: a tag containing ':' would otherwise parse as a map and
  // one containing ']' would end the flow sequence early
  lines.push(`tags: [${splitTags(meta.tags).map(yamlValue).join(", ")}]`);
  if (meta.image) lines.push(`image: ${yamlValue(meta.image)}`);
  if (meta.description) lines.push(`description: ${yamlValue(meta.description)}`);
  if (meta.draft) lines.push("draft: true");
  lines.push("---");
  return lines.join("\n");
}

// ------------------------------------------------------------- schema / SEO

export type SchemaType = "BlogPosting" | "Article" | "ImageGallery" | "FAQPage";

/// The primary JSON-LD type — manual override or content-derived (auto):
/// FAQ-dominated pages -> FAQPage, photo-dominated -> ImageGallery,
/// otherwise BlogPosting (the notebook default).
export function resolveSchemaType(
  meta: PageMeta,
  data: Data,
  config: Config,
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
  const s = collectStats(data, config);
  if (s.faq.length >= 2 && s.images.length === 0 && s.textBlocks <= 2) {
    return { type: "FAQPage", auto: true };
  }
  if (s.images.length >= 4 && s.images.length > s.textBlocks) {
    return { type: "ImageGallery", auto: true };
  }
  return { type: "BlogPosting", auto: true };
}

const MAX_SCHEMA_IMAGES = 6;

export function jsonld(
  meta: PageMeta,
  data: Data,
  config: Config,
  canonical: string,
  siteUrl: string,
): string {
  const { type } = resolveSchemaType(meta, data, config);
  const stats = collectStats(data, config);

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
  for (const im of stats.images) pushImage(im.src, im.w, im.h);

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
  if (stats.wordCount > 0 && (type === "BlogPosting" || type === "Article")) {
    primary.wordCount = stats.wordCount;
  }
  if (images.length) primary.image = images.length === 1 ? images[0] : images;

  // real Q&A from the page's FAQ blocks: on the primary when it IS a FAQPage,
  // otherwise as a second entity in an @graph
  const usable = stats.faq.filter((it) => it.q.trim() && it.a.trim());
  const faqEntity = usable.length
    ? {
        "@type": "FAQPage",
        mainEntity: usable.map((it) => ({
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
  // Escaping "<" as < keeps the JSON identical for any parser while making
  // it impossible for a "</script>" in a title/description/FAQ answer to
  // terminate the element and inject live markup into every exported page.
  const json = JSON.stringify(obj, null, 2).replace(/</g, "\\u003c");
  return '<script type="application/ld+json">\n' + json + "\n</script>";
}

// ------------------------------------------------------------------ assembly

export interface AssembleInput {
  shell: string;
  data: Data;
  config: Config;
  siteUrl: string;
  /// Pre-rendered, already formatted markup for the two content placeholders.
  heroHtml: string;
  contentHtml: string;
  slug?: string;
}

export function assembleDocument(i: AssembleInput): string {
  const root = (i.data.root?.props ?? {}) as Partial<RootProps>;
  const meta = (root.meta ?? {}) as PageMeta;
  const hasHero = !!root.hasHero;
  const navReveal = hasHero && !!root.hero?.navReveal;

  const s = i.slug || slugify(meta.title);
  const canonical = `${i.siteUrl}/notebook_pages/${s}`;
  const title = (meta.title || "").trim();
  const e = escAttr;

  const repl: Record<string, string> = {
    TITLE: e(title ? `Harald Revery - ${title}` : "Harald Revery"),
    DESCRIPTION: e(meta.description || ""),
    KEYWORDS: e(meta.tags || ""),
    // og/twitter title order matches base.njk ("title - Harald Revery")
    OG_TITLE: e(title ? `${title} - Harald Revery` : "Harald Revery"),
    OG_DESC: e(meta.description || ""),
    OG_IMAGE: e(meta.image ? i.siteUrl + meta.image : `${i.siteUrl}/opengraphimg.jpg`),
    OG_URL: e(canonical),
    CANONICAL: e(canonical),
    DATE_ISO: e(meta.date || ""),
    DATE_HUMAN: e(humanDate(meta.date)),
    JSONLD: jsonld(meta, i.data, i.config, canonical, i.siteUrl),
    HERO: i.heroHtml,
    // hero pages carry their own fade-in back link — never show both
    BACKLINK: hasHero ? "" : STATIC_BACKLINK,
    NAV_EXTRA: navReveal ? " navi_mechanic" : "",
    NAV_SCRIPT: navReveal
      ? '<script src="/javascript/navbar_scroll_min.js" defer></script>'
      : "",
    CONTENT: i.contentHtml,
  };

  // Single pass. A sequential split/join re-scanned each substituted value with
  // every later key, so a description containing "{{CONTENT}}" got the whole
  // page body spliced into the meta tag. Unknown tokens pass through untouched.
  return i.shell.replace(/\{\{(\w+)\}\}/g, (m, k: string) =>
    Object.prototype.hasOwnProperty.call(repl, k) ? repl[k] : m,
  );
}

export function exportText(i: AssembleInput): string {
  const meta = ((i.data.root?.props ?? {}) as Partial<RootProps>).meta ?? ({} as PageMeta);
  return frontmatterYaml(meta) + "\n" + assembleDocument(i);
}
