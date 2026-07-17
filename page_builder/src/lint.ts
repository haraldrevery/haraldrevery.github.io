/*
 * Page checks: heading outline (browser reader mode + SEO take the document
 * outline from it) and the SEO basics the front matter feeds. Pure module —
 * runs on the rendered export HTML so markdown '#' headings, heading blocks,
 * column text and raw HTML are all covered the same way.
 */
import { renderContent, renderHero } from "./blocks/render";
import { splitTags } from "./export";
import type { Meta } from "./export";
import type { Block } from "./blocks/model";

export interface LintIssue {
  severity: "warn" | "info";
  message: string;
}

function headingIssues(html: string, hasBlocks: boolean): LintIssue[] {
  const issues: LintIssue[] = [];
  const headings = [...html.matchAll(/<h([1-6])[\s>]/gi)].map((m) => Number(m[1]));

  if (!headings.length) {
    if (hasBlocks) {
      issues.push({
        severity: "warn",
        message:
          "No headings — start the page with one H1 title (Heading block level 1, or “# Title” in markdown). Reader mode and search engines build the outline from it.",
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

function altIssues(blocks: Block[]): LintIssue[] {
  let missing = 0;
  const countItem = (alt: string) => {
    if (!alt.trim()) missing++;
  };
  for (const b of blocks) {
    if (b.type === "gallery") b.items.forEach((it) => countItem(it.alt));
    else if (b.type === "image") countItem(b.alt);
    else if (b.type === "svg") countItem(b.alt);
    else if (b.type === "columns") {
      for (const c of b.columns.slice(0, b.count)) {
        if (c.kind === "image") countItem(c.alt);
        else if (c.kind === "grid") c.items.forEach((it) => countItem(it.alt));
        else if (c.kind === "svg") countItem(c.alt);
      }
    }
  }
  return missing
    ? [
        {
          severity: "info",
          message: `${missing} image${missing > 1 ? "s" : ""} without alt text (image SEO + accessibility).`,
        },
      ]
    : [];
}

export function lintPage(meta: Meta, blocks: Block[]): LintIssue[] {
  const issues: LintIssue[] = [];
  // hero renders before content — include it so its <h1> counts in the outline
  const html = renderHero(blocks, { editMode: false }) + "\n" + renderContent(blocks, { editMode: false });

  issues.push(...headingIssues(html, blocks.length > 0));

  const heroes = blocks.filter((b) => b.type === "hero");
  if (heroes.length > 1) {
    issues.push({ severity: "warn", message: `${heroes.length} hero blocks — a page should have one.` });
  }
  for (const h of heroes) {
    if (h.variant === "photo" && !h.image && !h.imageThumb) {
      issues.push({ severity: "warn", message: "Hero is set to photo but no photo is picked." });
    }
    if (h.variant === "svg" && !h.svgSrc) {
      issues.push({ severity: "warn", message: "Hero is set to SVG but no file is picked." });
    }
  }

  let unlabeledIcons = 0;
  for (const b of blocks) {
    if (b.type === "icons") {
      for (const it of b.items) if (!it.label.trim()) unlabeledIcons++;
    }
  }
  if (unlabeledIcons) {
    issues.push({
      severity: "info",
      message: `${unlabeledIcons} icon${unlabeledIcons > 1 ? "s" : ""} without a label (screen readers announce it).`,
    });
  }

  if (!meta.title.trim()) {
    issues.push({ severity: "warn", message: "No title — required for the file name, <title> tag and social cards." });
  } else if (meta.title.length > 55) {
    issues.push({
      severity: "info",
      message: `Title is ${meta.title.length} chars — search results truncate around 55–60.`,
    });
  }

  if (!meta.description.trim()) {
    issues.push({
      severity: "warn",
      message: "No description — it becomes the search snippet, social card text and notebook card text.",
    });
  } else if (meta.description.length > 160) {
    issues.push({
      severity: "info",
      message: `Description is ${meta.description.length} chars — search engines truncate around 160.`,
    });
  }

  if (!meta.image.trim()) {
    issues.push({
      severity: "info",
      message: "No card image — the notebook card is blank and social shares fall back to the generic image.",
    });
  }

  if (!splitTags(meta.tags).length) {
    issues.push({ severity: "info", message: "No tags — the page won't appear on any tag page." });
  }

  issues.push(...altIssues(blocks));
  return issues;
}
