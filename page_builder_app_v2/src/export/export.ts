/*
 * Export pipeline. Three outputs, one body:
 *
 *   exportText          YAML front matter + the body FRAGMENT. What Export
 *                       writes to input_build_page/; Eleventy strips the front
 *                       matter, wraps the body in base.njk and emits
 *                       notebook_pages/<slug>.html.
 *   assembleDocument    the same fragment inside shell.html. PREVIEW only.
 *   assembleStandalone  assembleDocument with the head retargeted at this page.
 *                       What "Export HTML…" saves.
 *
 * Only the first of those publishes anything. shell.html is not part of the
 * publishing path at all — it is generated build output, and the <head>, nav
 * and footer of a published page come from base.njk at BUILD time.
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
import { staticHeader } from "../puck/components/Hero";

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

/// Tolerant of undefined on purpose: `meta` is whatever is in the project file,
/// and a brand-new page carries `root.props = {}` until Puck's first onChange —
/// so this ran on `undefined` and took Preview and Export down with a TypeError.
export function splitTags(tags: string | undefined | null): string[] {
  return String(tags ?? "").split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
}

/// A date Eleventy can parse: the shape humanDate formats and the shape every
/// committed page carries.
export const isIsoDate = (d: string | undefined | null): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? "").trim());

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

export function frontmatterYaml(meta: PageMeta, navScroll = false): string {
  const lines = ["---"];
  lines.push(`title: ${yamlValue(meta.title || "")}`);
  /*
   * The one value emitted bare, and only when it is a plain ISO date.
   *
   * Bare keeps byte-compatibility with every committed page (`date: 2025-08-17`)
   * and lets YAML type it as a timestamp. Anything else is quoted, because an
   * unquoted date containing ": " makes gray-matter throw and takes the WHOLE
   * Eleventy build down — from a typo in a text field. Quoting is safe for
   * consumers: eleventy.config.js wraps every date in `new Date(...)`, which
   * treats "2025-08-17" and the timestamp identically.
   *
   * An empty date stays empty (YAML null); the page check warns about it, since
   * Eleventy would silently substitute the build date.
   */
  const date = (meta.date || "").trim();
  lines.push(`date: ${!date || isIsoDate(date) ? date : yamlValue(date)}`);
  // quoted per entry: a tag containing ':' would otherwise parse as a map and
  // one containing ']' would end the flow sequence early
  lines.push(`tags: [${splitTags(meta.tags).map(yamlValue).join(", ")}]`);
  if (meta.image) lines.push(`image: ${yamlValue(meta.image)}`);
  if (meta.description) lines.push(`description: ${yamlValue(meta.description)}`);
  if (meta.draft) lines.push("draft: true");
  /*
   * Two flags consumed by eleventy_settings/base.njk, not by this app.
   *
   * navScroll  - adds .navi_mechanic to the header (nav.njk) AND loads
   *              navbar_scroll_min.js. They MUST travel together: that script
   *              does querySelector(".navi_mechanic") with no null guard, and
   *              without it the Firefox @supports-not fallback never runs.
   * customJsonLd - suppresses base.njk's articleLd block, which is hardcoded to
   *              @type Article. This page emits its own resolved type
   *              (BlogPosting / ImageGallery / FAQPage) in the body, including
   *              an FAQ mainEntity list that cannot be rebuilt from front
   *              matter. Two competing Article entities would be worse than one.
   */
  if (navScroll) lines.push("navScroll: true");
  lines.push("customJsonLd: true");
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
  /// Pre-rendered markup for the content placeholders.
  heroHtml: string;
  contentHtml: string;
  /// The {{BACKLINK}} slot. Optional so callers that do not build it still get
  /// the correct default.
  headerHtml?: string;
  slug?: string;
}

/*
 * The published BODY FRAGMENT: everything that used to sit between the nav and
 * the footer in shell.html, and nothing else.
 *
 * This is what export writes to input_build_page/. The document around it —
 * <!DOCTYPE>, <head>, nav, footer — comes from eleventy_settings/base.njk at
 * BUILD time, so a nav or footer change reaches every exported page on the next
 * build. The old exporter filled shell.html, which carried its own frozen copy
 * of the chrome and drifted out of sync with the site.
 *
 * base.njk supplies the <div class="bg-topology-map"> wrapper, so this starts at
 * the hero. The markup below is otherwise byte-for-byte the old shell body.
 */
export function assembleFragment(i: AssembleInput): string {
  const root = (i.data.root?.props ?? {}) as Partial<RootProps>;
  const meta = (root.meta ?? {}) as PageMeta;
  const hasHero = !!root.hasHero;

  const s = i.slug || slugify(meta.title);
  const canonical = `${i.siteUrl}/notebook_pages/${s}`;

  // Hero pages carry their own fade-in back link AND their own <h1>, so they
  // get nothing here — never show two back links or two titles.
  const backlink = i.headerHtml ?? (hasHero ? "" : staticHeader(meta, humanDate(meta.date)));

  return `${i.heroHtml}

<!-- start margins -->
<div  class="page-container pt-24 pb-12 extra_fade_effect">

${backlink}

<!-- ====================================================================== -->
<!-- Content starts here -->
${i.contentHtml}
<!-- Content stops here -->
<!-- ====================================================================== -->

<!-- ====================================================================== -->
<!-- Date -->
<!-- ====================================================================== -->
 <div class="pt-24">
  <hr>
  <div class="py-2">
    <time class="text-sm font-mono text-neutral-500 dark:text-neutral-400 uppercase tracking-wider" datetime="${escAttr(meta.date || "")}">
    ${escAttr(humanDate(meta.date))}
    </time>
  </div>
</div>

<!-- End margins -->
</div>

  <!-- Go back link -->
  <div class="page-container pt-6">
        <a href="/notebook.html" class="inline-block border-b-2 border-black dark:border-white pb-1 hover:opacity-50 transition text-lg tracking-widest">
          ← NOTEBOOK FRONT PAGE
        </a>
      </div>

${jsonld(meta, i.data, i.config, canonical, i.siteUrl)}
`;
}

/*
 * PREVIEW ONLY (/__pb/preview). Wraps the fragment in page_builder_app_v2/
 * shell.html, which is GENERATED by eleventy_njk/_builder_shell.njk from the
 * same nav.njk / footer.njk / base.njk the published page uses — so preview and
 * published output match by construction and the shell can never go stale.
 *
 * Export does NOT go through here; it writes the fragment and lets Eleventy do
 * the wrapping.
 */
export function assembleDocument(i: AssembleInput): string {
  const meta = ((i.data.root?.props ?? {}) as Partial<RootProps>).meta ?? ({} as PageMeta);
  const title = (meta.title || "").trim();
  const repl: Record<string, string> = {
    TITLE: escAttr(title || "Untitled"),
    CONTENT: assembleFragment(i),
  };
  // Single pass. A sequential split/join re-scanned each substituted value with
  // every later key, so a title containing "{{CONTENT}}" spliced the whole page
  // body into the meta tags. Unknown tokens pass through untouched.
  return i.shell.replace(/\{\{(\w+)\}\}/g, (m, k: string) =>
    Object.prototype.hasOwnProperty.call(repl, k) ? repl[k] : m,
  );
}

export function exportText(i: AssembleInput): string {
  const root = (i.data.root?.props ?? {}) as Partial<RootProps>;
  const meta = (root.meta ?? {}) as PageMeta;
  const navScroll = !!root.hasHero && !!root.hero?.navReveal;
  return frontmatterYaml(meta, navScroll) + "\n" + assembleFragment(i);
}

/*
 * PREVIEW SHELL -> a COMPLETE standalone document that describes THIS page.
 *
 * assembleDocument alone is not that. shell.html is base.njk rendered for the
 * SHELL's own permalink (eleventy_njk/_builder_shell.njk), so everything
 * base.njk derives from `title` rides {{TITLE}} through and is already correct,
 * but everything it derives from `page.url` or `description` is frozen at the
 * shell's values: canonical and og:url point at /page_builder_app_v2/shell, and
 * there is no description tag at all, because the shell's front matter has no
 * description to trigger base.njk's `{% if description %}` blocks.
 *
 * That is harmless for the in-app preview, which never leaves the machine. It
 * is not harmless in a file the user saves and may hand to someone or archive,
 * so the head is retargeted here.
 *
 * NB this is the ONLY place the exporter rewrites markup it did not generate.
 * The published page never comes through here — Eleventy builds that head from
 * base.njk with the page's real front matter, which is why the fragment export
 * needs none of this.
 */
export function assembleStandalone(i: AssembleInput): string {
  const meta = ((i.data.root?.props ?? {}) as Partial<RootProps>).meta ?? ({} as PageMeta);
  const slug = i.slug || slugify(meta.title);
  return retargetHead(
    assembleDocument(i),
    `${i.siteUrl}/notebook_pages/${slug}`,
    meta.description ?? "",
  );
}

/// The head tags whose value is a URL frozen at the shell's own permalink.
/// Matched on their identifying attribute rather than on the frozen URL string,
/// so regenerating the shell under a different permalink cannot silently turn
/// this into a no-op that ships someone else's canonical.
const CANONICAL_TAGS: RegExp[] = [
  /(<link\b[^>]*\brel="canonical"[^>]*\bhref=")[^"]*(")/i,
  /(<meta\b[^>]*\bproperty="og:url"[^>]*\bcontent=")[^"]*(")/i,
];

/// name/property, the tag to insert when the shell has none, in head order.
const DESCRIPTION_TAGS: [RegExp, (v: string) => string][] = [
  [
    /(<meta\b[^>]*\bname="description"[^>]*\bcontent=")[^"]*(")/i,
    (v) => `<meta name="description" content="${v}">`,
  ],
  [
    /(<meta\b[^>]*\bproperty="og:description"[^>]*\bcontent=")[^"]*(")/i,
    (v) => `<meta property="og:description" content="${v}" />`,
  ],
  [
    /(<meta\b[^>]*\bname="twitter:description"[^>]*\bcontent=")[^"]*(")/i,
    (v) => `<meta name="twitter:description" content="${v}" />`,
  ],
];

/*
 * Point the shell's canonical/og:url at this page and give it a description.
 *
 * Every replacement uses a FUNCTION replacer. A string replacement would let a
 * `$&` or `$1` in a description or title splice part of the document back into
 * the attribute — the same class of bug the single-pass placeholder
 * substitution in assembleDocument exists to avoid.
 *
 * A description tag that is already present is rewritten in place; one that is
 * absent is inserted after </title>, where base.njk puts it, so a shell
 * regenerated WITH a description and one regenerated without produce the same
 * head. Missing tags are inserted as a group in their declared order.
 */
export function retargetHead(html: string, canonical: string, description: string): string {
  const href = escAttr(canonical);
  let out = html;
  for (const re of CANONICAL_TAGS) {
    out = out.replace(re, (_m, pre: string, post: string) => pre + href + post);
  }

  const desc = (description || "").trim();
  if (!desc) return out;
  const v = escAttr(desc);

  const missing: string[] = [];
  for (const [re, tag] of DESCRIPTION_TAGS) {
    if (re.test(out)) out = out.replace(re, (_m, pre: string, post: string) => pre + v + post);
    else missing.push(tag(v));
  }
  if (missing.length) {
    out = out.replace(/<\/title>/i, (m) => `${m}\n    ${missing.join("\n    ")}`);
  }
  return out;
}
