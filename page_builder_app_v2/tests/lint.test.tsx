/*
 * Page checks. The heading scan runs on the RENDERED markup, so a "# Title" in
 * a markdown Text block and a standalone Heading block are treated identically
 * — which is the whole reason it works on HTML rather than on the tree.
 */
import { describe, expect, test } from "bun:test";
import type { Data } from "@measured/puck";
import { config } from "../src/puck/config";
import { DEFAULT_HERO, DEFAULT_META } from "../src/puck/PageRoot";
import { lintPage, headingIssues } from "../src/export/lint";
import { renderExportContent, renderExportHero } from "../src/export/renderExport";

const mk = (content: any[] = [], root: any = {}): Data =>
  ({ root: { props: { meta: DEFAULT_META, hasHero: false, hero: DEFAULT_HERO, ...root } }, content }) as unknown as Data;

const text = (md: string, id = "t") => ({ type: "Text", props: { id, md, animate: false, spacing: "normal" } });

const lint = (data: Data) =>
  lintPage({ data, config, html: renderExportHero(data) + "\n" + renderExportContent(data) });

const messages = (data: Data) => lint(data).map((i) => i.message);
const has = (data: Data, needle: string) => messages(data).some((m) => m.includes(needle));

describe("heading outline", () => {
  test("an empty page does not complain about headings", () => {
    expect(headingIssues("", false)).toEqual([]);
  });

  test("content with no heading at all warns", () => {
    expect(has(mk([text("Just a paragraph.")]), "No headings")).toBe(true);
  });

  test("markdown '# Title' satisfies the H1 requirement", () => {
    // The point of scanning rendered HTML: this is a Text block, not a Heading.
    expect(has(mk([text("# Title\n\nBody.")]), "No H1")).toBe(false);
    expect(has(mk([text("# Title\n\nBody.")]), "No headings")).toBe(false);
  });

  test("a level jump is reported", () => {
    expect(has(mk([text("# Title\n\n### Skipped")]), "Heading level jump H1 → H3")).toBe(true);
  });

  test("two H1s are reported", () => {
    expect(has(mk([text("# One\n\n# Two")]), "2 H1 headings")).toBe(true);
  });

  test("an H2 before the H1 is reported", () => {
    expect(has(mk([text("## Section\n\n# Title")]), "first heading is H2")).toBe(true);
  });

  test("a clean outline produces no heading warnings", () => {
    const msgs = messages(mk([text("# Title\n\n## A\n\n### A1\n\n## B")]));
    expect(msgs.filter((m) => m.toLowerCase().includes("heading"))).toEqual([]);
  });

  test("the hero's H1 counts toward the outline", () => {
    // The hero renders into {{HERO}}, before the content — its <h1> is the page
    // title, so a page with a hero title plus H2 sections is well-formed.
    const data = mk([text("## Section")], {
      hasHero: true,
      hero: { ...DEFAULT_HERO, title: "Page title" },
    });
    expect(has(data, "No H1")).toBe(false);
    expect(has(data, "first heading is H2")).toBe(false);
  });

  test("FAQ question labels are excluded from the outline", () => {
    // about.html pattern: the <h3> inside a faq-question label is a widget
    // label, not a document heading. Attribute order must not matter.
    const html =
      '<h1>Title</h1><label for="q1" class="faq-toggle faq-question"><h3>A question?</h3></label>';
    expect(headingIssues(html, true)).toEqual([]);
  });
});

describe("hero checks", () => {
  test("a photo background with no photo warns", () => {
    const data = mk([], { hasHero: true, hero: { ...DEFAULT_HERO, background: "backdrop" } });
    expect(has(data, "photo background but no photo")).toBe(true);
  });

  test("no warning once a photo is picked", () => {
    const data = mk([], {
      hasHero: true,
      hero: { ...DEFAULT_HERO, background: "backdrop", image: { full: "/photos/a.jpg", thumb: "/photos/a_min.jpg" } },
    });
    expect(has(data, "photo background but no photo")).toBe(false);
  });

  test("showSvg with no file warns", () => {
    const data = mk([], { hasHero: true, hero: { ...DEFAULT_HERO, showSvg: true } });
    expect(has(data, "'show SVG' on but no file")).toBe(true);
  });

  test("a hero that is off is not checked at all", () => {
    const data = mk([], { hasHero: false, hero: { ...DEFAULT_HERO, background: "cover", showSvg: true } });
    expect(has(data, "photo background")).toBe(false);
    expect(has(data, "show SVG")).toBe(false);
  });
});

describe("SEO / front matter", () => {
  // `date` is part of "fully filled": an empty one makes Eleventy substitute the
  // build date, so the page check treats it as a warning like any other missing
  // front-matter field.
  const full = {
    meta: { ...DEFAULT_META, title: "A good title", date: "2025-08-17", description: "A good description.", image: "/x_min.jpg", tags: "photography" },
  };

  test("a fully filled page has no meta complaints", () => {
    const msgs = messages(mk([text("# Title")], full));
    expect(msgs).toEqual([]);
  });

  test("missing title, description, image and tags are all reported", () => {
    const data = mk([text("# Title")]);
    expect(has(data, "No title")).toBe(true);
    expect(has(data, "No description")).toBe(true);
    expect(has(data, "No card image")).toBe(true);
    expect(has(data, "No tags")).toBe(true);
  });

  test("over-long title and description are reported as info", () => {
    const data = mk([text("# Title")], {
      meta: { ...full.meta, title: "x".repeat(60), description: "y".repeat(170) },
    });
    expect(has(data, "60 chars")).toBe(true);
    expect(has(data, "170 chars")).toBe(true);
    expect(lint(data).every((i) => i.severity === "info")).toBe(true);
  });
});

describe("images", () => {
  const gallery = (items: any[]) => ({
    type: "Gallery",
    props: { id: "g", items, layout: "justified", rowHeight: 320, columns: 3, aspect: "5/7", group: "g", spacing: "normal" },
  });
  const img = (alt: string) => ({ full: "/photos/a.jpg", thumb: "", alt, title: "", description: "", w: 10, h: 10 });

  test("missing alt text is reported", () => {
    expect(has(mk([gallery([img("ok"), img(""), img("  ")])]), "2 images without alt text")).toBe(true);
  });

  test("images hidden in a count-1 right column are not counted", () => {
    const data = mk([
      { type: "Columns", props: { id: "c", count: 1, verticalAlign: "center", spacing: "normal", left: [], right: [gallery([img("")])] } },
    ]);
    expect(has(data, "without alt text")).toBe(false);
  });
});
