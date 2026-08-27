/*
 * Page checks: heading outline (browser reader mode and search engines build
 * the document outline from it) and the SEO basics the front matter feeds.
 *
 * Ported from v1's src/lint.ts. The heading scan and the meta checks are
 * verbatim; the two tree walks (alt text, icons/downloads) moved onto
 * src/export/collect.ts, and the "N hero blocks" check is gone — the hero is a
 * root field now, so there is exactly one by construction.
 *
 * headingIssues deliberately runs on the RENDERED HTML rather than the tree, so
 * markdown '#' headings inside a Text block, standalone Heading blocks, column
 * content and (later) raw HTML are all covered by the same scan.
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

export function headingIssues(html: string, hasContent: boolean): LintIssue[] {
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
          "No headings — start the page with one H1 title (a Heading block at level 1, or “# Title” in a Text block). Reader mode and search engines build the outline from it.",
      });
    }
    return issues;
  }

  const h1s = headings.filter((h) => h === 1).length;
  if (h1s === 0) {
    issues.push({
      severity: "warn",
      message:
        "No H1 — the page starts at H" +
        headings[0] +
        ". Use exactly one H1 as the main title (“# Title”), then H2 for sections.",
    });
  } else {
    if (headings[0] !== 1) {
      issues.push({
        severity: "warn",
        message: `The first heading is H${headings[0]} — the H1 title should come before other headings.`,
      });
    }
    if (h1s > 1) {
      issues.push({
        severity: "warn",
        message: `${h1s} H1 headings — keep exactly one H1 and use H2/H3 for sections, or reader mode gets confused about the title.`,
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
  /// The rendered export markup: hero first, then content — the hero's <h1>
  /// has to count in the outline.
  html: string;
}

export function lintPage({ data, config, html }: LintInput): LintIssue[] {
  const issues: LintIssue[] = [];
  const root = (data.root?.props ?? {}) as Partial<RootProps>;
  const meta = (root.meta ?? {}) as PageMeta;
  const hasContent = (data.content ?? []).length > 0 || !!root.hasHero;

  issues.push(...headingIssues(html, hasContent));

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
  } else if (title.length > 55) {
    issues.push({
      severity: "info",
      message: `Title is ${title.length} chars — search results truncate around 55–60.`,
    });
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

  return issues;
}
