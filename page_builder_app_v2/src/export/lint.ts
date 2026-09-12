/*
 * Page checks: heading outline (browser reader mode and search engines build
 * the document outline from it), the SEO basics the front matter feeds, and
 * the blocks that would publish broken or empty.
 *
 * Ported from v1's src/lint.ts. The tree walks (alt text, icons, downloads,
 * videos, empty blocks) live in src/export/collect.ts, and the "N hero blocks"
 * check is gone — the hero is a root field now, so there is exactly one by
 * construction.
 *
 * headingIssues deliberately runs on the RENDERED HTML rather than the tree, so
 * markdown '#' headings inside a Text block, standalone Heading blocks, column
 * content and raw HTML are all covered by the same scan. That HTML must include
 * the header (renderExportHeader): on a page with no hero, it carries the page
 * title as the H1.
 */
import type { Config, Data } from "@measured/puck";
import { collectA11yIssues } from "./collect";
import { splitTags, isIsoDate } from "./export";
import { hasSvgText } from "../blocks/svgStore";
import type { PageMeta } from "../puck/PageRoot";
import type { RootProps } from "../puck/PageRoot";

export interface LintIssue {
  severity: "warn" | "info";
  message: string;
}

/*
 * Every published <title> is this prefix plus the page title (base.njk), and
 * og:title / twitter:title repeat it, so the length a search result has to fit
 * is the two together. Keep in step with eleventy_settings/base.njk.
 */
const TITLE_PREFIX = "Harald Revery - ";
/// Roughly where search results start cutting a <title> off.
const TITLE_MAX = 60;

/*
 * `h1Source` names the field the page's H1 comes from. A builder page never
 * needs a "# Title" in its body: the page title (or the hero's title) IS the
 * H1, so advice to write one produces a second H1 the moment the title is set.
 */
export function headingIssues(
  html: string,
  hasContent: boolean,
  h1Source = "the page title",
): LintIssue[] {
  const issues: LintIssue[] = [];
  // FAQ question <h3>s are widget labels (about.html pattern), not part of the
  // document outline — drop them before scanning.
  //
  // Attribute-order-independent: React does not guarantee `class` comes first,
  // so v1's /<label[^>]*class="faq-question/ would silently stop matching.
  const scanned = html.replace(
    /<label[^>]*class="[^"]*faq-question[\s\S]*?<\/label>/g,
    "",
  );
  const headings = [...scanned.matchAll(/<h([1-6])[\s>]/gi)].map((m) => Number(m[1]));

  if (!headings.length) {
    if (hasContent) {
      issues.push({
        severity: "warn",
        message:
          `No headings — fill in ${h1Source}; it becomes the page's H1. Then use “## Section” in Text blocks for sections. Reader mode and search engines build the outline from them.`,
      });
    }
    return issues;
  }

  const h1s = headings.filter((h) => h === 1).length;
  if (h1s === 0) {
    issues.push({
      severity: "warn",
      message:
        `No H1 — the page starts at H${headings[0]}. The H1 is ${h1Source}: fill that in rather than writing “# Title” in a Text block.`,
    });
  } else {
    if (headings[0] !== 1) {
      issues.push({
        severity: "warn",
        message: `The first heading is H${headings[0]} — the H1 (${h1Source}) should come before other headings.`,
      });
    }
    if (h1s > 1) {
      issues.push({
        severity: "warn",
        message: `${h1s} H1 headings — keep exactly one, ${h1Source}, and use “##” and “###” for sections, or reader mode gets confused about the title.`,
      });
    }
  }

  let prev = headings[0];
  for (const h of headings.slice(1)) {
    if (h > prev + 1) {
      issues.push({
        severity: "warn",
        message: `Heading level jump H${prev} → H${h} — don't skip levels in the outline.`,
      });
      break;
    }
    prev = h;
  }
  return issues;
}

export interface LintInput {
  data: Data;
  config: Config;
  /// The rendered export markup: hero, header, then content — the H1 lives in
  /// the hero or the header, and has to count in the outline.
  html: string;
  /// Root-absolute paths the page publishes that are not on disk
  /// (findMissingMedia in fixups.ts). The lookup needs the backend, so the
  /// caller does it; omitted means "not checked", not "all present".
  missingFiles?: string[];
}

export function lintPage({ data, config, html, missingFiles = [] }: LintInput): LintIssue[] {
  const issues: LintIssue[] = [];
  const root = (data.root?.props ?? {}) as Partial<RootProps>;
  const meta = (root.meta ?? {}) as PageMeta;
  const hasContent = (data.content ?? []).length > 0 || !!root.hasHero;

  // Name the field that actually produces the H1 (Hero.tsx or staticHeader).
  const h1Source = root.hasHero
    ? "the hero's “Title (h1)” field"
    : "the Title under Page / SEO";
  issues.push(...headingIssues(html, hasContent, h1Source));

  // The hero-count check is gone: hasHero is a boolean, so "N heroes" cannot
  // happen. Its content checks still apply.
  if (root.hasHero && root.hero) {
    const h = root.hero;
    const bg = h.background;
    if ((bg === "backdrop" || bg === "cover") && !h.image?.full && !h.image?.thumb) {
      issues.push({ severity: "warn", message: "Hero has a photo background but no photo is picked." });
    }
    if (h.showSvg && !h.svgSrc) {
      issues.push({ severity: "warn", message: "Hero has 'show SVG' on but no file is picked." });
    }
    if (h.showSvg && h.svgSrc && !hasSvgText(h.svgSrc)) {
      issues.push({
        severity: "warn",
        message: `Hero SVG ${h.svgSrc} could not be read — the page would publish a “[svg … not loaded]” placeholder.`,
      });
    }
  }

  const a11y = collectA11yIssues(data, config);
  // Same class of problem as a missing download, and louder: an unreadable svg
  // does not just break a link, it publishes its placeholder text as body copy.
  if (a11y.missingSvgs) {
    issues.push({
      severity: "warn",
      message: `${a11y.missingSvgs} SVG${a11y.missingSvgs > 1 ? "s" : ""} could not be read — the page would publish a “[svg … not loaded]” placeholder instead of the artwork.`,
    });
  }
  if (missingFiles.length) {
    const n = missingFiles.length;
    const names = missingFiles.map((p) => p.split("/").pop() || p);
    const shown = names.slice(0, 3).join(", ") + (n > 3 ? ` and ${n - 3} more` : "");
    issues.push({
      severity: "warn",
      message: `${n} file${n > 1 ? "s" : ""} not found on disk: ${shown} — the page would publish ${n > 1 ? "them" : "it"} broken.`,
    });
  }
  if (a11y.emptyMedia.length) {
    const n = a11y.emptyMedia.length;
    const kinds = [...new Set(a11y.emptyMedia)].join(", ");
    const gap = a11y.emptyMedia.includes("Gallery") ? " (an empty gallery leaves a blank gap)" : "";
    issues.push({
      severity: "warn",
      message: `${n} empty media block${n > 1 ? "s" : ""} (${kinds}) — pick a file or delete ${n > 1 ? "them" : "it"}. As ${n > 1 ? "they are, they publish" : "it is, it publishes"} nothing${gap}.`,
    });
  }
  if (a11y.missingDownloads) {
    issues.push({
      severity: "warn",
      message: `${a11y.missingDownloads} download file${a11y.missingDownloads > 1 ? "s" : ""} missing on disk (broken link + stale hashes).`,
    });
  }
  if (a11y.unlabeledIcons) {
    issues.push({
      severity: "info",
      message: `${a11y.unlabeledIcons} icon${a11y.unlabeledIcons > 1 ? "s" : ""} without a label (screen readers announce it).`,
    });
  }

  const title = meta.title ?? "";
  if (!title.trim()) {
    issues.push({ severity: "warn", message: "No title — required for the file name, <title> tag and social cards." });
  } else {
    const shown = TITLE_PREFIX.length + title.length;
    if (shown > TITLE_MAX) {
      issues.push({
        severity: "info",
        message: `Title is ${shown} chars as published (“${TITLE_PREFIX}” + ${title.length}) — search results cut titles off around ${TITLE_MAX}.`,
      });
    }
  }

  /*
   * The date was the only front-matter field with no check at all, and it has
   * the worst failure modes of any of them — see frontmatterYaml.
   */
  const date = (meta.date ?? "").trim();
  if (!date) {
    issues.push({
      severity: "warn",
      message:
        "No date — the Eleventy build substitutes the day you publish, so the page dates itself to whenever you last ran the build and jumps to the top of the Notebook.",
    });
  } else if (!isIsoDate(date)) {
    issues.push({
      severity: "warn",
      message: `Date “${date}” is not YYYY-MM-DD — Eleventy cannot parse it, so the Notebook order and the sitemap entry both break.`,
    });
  }

  const description = meta.description ?? "";
  if (!description.trim()) {
    issues.push({
      severity: "warn",
      message: "No description — it becomes the search snippet, social card text and notebook card text.",
    });
  } else if (description.length > 160) {
    issues.push({
      severity: "info",
      message: `Description is ${description.length} chars — search engines truncate around 160.`,
    });
  }

  if (!(meta.image ?? "").trim()) {
    issues.push({
      severity: "info",
      message: "No card image — the notebook card is blank and social shares fall back to the generic image.",
    });
  }

  if (!splitTags(meta.tags ?? "").length) {
    issues.push({ severity: "info", message: "No tags — the page won't appear on any tag page." });
  }

  if (a11y.missingAlt) {
    issues.push({
      severity: "info",
      message: `${a11y.missingAlt} image${a11y.missingAlt > 1 ? "s" : ""} without alt text (image SEO + accessibility).`,
    });
  }

  // The glass panel is the Video block's whole look: poster, title, description.
  if (a11y.videosNoPoster) {
    const n = a11y.videosNoPoster;
    issues.push({
      severity: "info",
      message: `${n} video${n > 1 ? "s" : ""} without a poster image — the player is a black box until the video loads.`,
    });
  }
  if (a11y.videosNoTitle) {
    const n = a11y.videosNoTitle;
    issues.push({
      severity: "info",
      message: `${n} video${n > 1 ? "s" : ""} without a title — the glass panel has no heading.`,
    });
  }
  if (a11y.videosNoDescription) {
    const n = a11y.videosNoDescription;
    issues.push({
      severity: "info",
      message: `${n} video${n > 1 ? "s" : ""} without a description under the title.`,
    });
  }

  return issues;
}
