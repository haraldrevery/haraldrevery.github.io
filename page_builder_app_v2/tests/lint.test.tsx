/*
 * Page checks. The heading scan runs on the RENDERED markup, so a "# Title" in
 * a markdown Text block and a standalone Heading block are treated identically
 * — which is the whole reason it works on HTML rather than on the tree.
 *
 * Every lint() below goes through runPageCheck, the function the live panel
 * calls, so it sees the same hero + header + content markup the app does. The
 * header matters: on a page with no hero it carries the page title as the H1.
 * A helper that left it out once let this suite pass a page the app flags for
 * two H1s.
 */
import { describe, expect, test } from "bun:test";
import type { Data } from "@measured/puck";
import { config } from "../src/puck/config";
import { DEFAULT_HERO, DEFAULT_META } from "../src/puck/PageRoot";
import { headingIssues } from "../src/export/lint";
import { runPageCheck } from "../src/app/PageCheck";

const mk = (content: any[] = [], root: any = {}): Data =>
  ({ root: { props: { meta: DEFAULT_META, hasHero: false, hero: DEFAULT_HERO, ...root } }, content }) as unknown as Data;

const text = (md: string, id = "t") => ({ type: "Text", props: { id, md, animate: false, spacing: "normal" } });

const gallery = (items: any[]) => ({
  type: "Gallery",
  props: { id: "g", items, layout: "justified", rowHeight: 320, columns: 3, aspect: "5/7", group: "g", spacing: "normal" },
});

const video = (over: any, id = "v") => ({
  type: "Video",
  props: { ...config.components.Video.defaultProps, id, ...over },
});

// `date` is part of "fully filled": an empty one makes Eleventy substitute the
// build date, so the page check treats it as a warning like any other missing
// front-matter field.
const full = {
  meta: { ...DEFAULT_META, title: "A good title", date: "2025-08-17", description: "A good description.", image: "/x_min.jpg", tags: "photography" },
};

const lint = (data: Data, missingFiles: string[] = []) => runPageCheck(data, missingFiles);
const messages = (data: Data, missingFiles: string[] = []) => lint(data, missingFiles).map((i) => i.message);
const has = (data: Data, needle: string, missingFiles: string[] = []) =>
  messages(data, missingFiles).some((m) => m.includes(needle));

describe("heading outline", () => {
  // These pages have no title, so the header carries no H1 and the body's
  // headings are the whole outline — which isolates the scan itself.
  test("an empty page does not complain about headings", () => {
    expect(headingIssues("", false)).toEqual([]);
  });

  test("content with no heading at all warns", () => {
    expect(has(mk([text("Just a paragraph.")]), "No headings")).toBe(true);
  });

  test("the scan sees markdown headings, not just Heading blocks", () => {
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
    // The hero renders before the content — its <h1> is the page title, so a
    // page with a hero title plus H2 sections is well-formed.
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

describe("where the H1 comes from", () => {
  test("on a page with no hero, the page title IS the H1", () => {
    const msgs = messages(mk([text("## Section\n\nBody.")], full));
    expect(msgs.filter((m) => m.includes("H1") || m.toLowerCase().includes("heading"))).toEqual([]);
  });

  test("a '# Title' in the body next to a page title is a second H1", () => {
    expect(has(mk([text("# Title\n\nBody.")], full), "2 H1 headings")).toBe(true);
  });

  test("an untitled page is sent to the Title field, not told to write '# Title'", () => {
    const m = messages(mk([text("## Section")])).find((x) => x.startsWith("No H1"));
    expect(m).toContain("the Title under Page / SEO");
    expect(m).toContain("rather than writing “# Title”");
  });

  test("a hero with an empty title is sent to the hero's title field", () => {
    const data = mk([text("## Section")], { hasHero: true, hero: { ...DEFAULT_HERO, title: "" } });
    expect(messages(data).find((x) => x.startsWith("No H1"))).toContain("the hero's “Title (h1)” field");
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
  test("a fully filled page has no complaints at all", () => {
    // "## Section", not "# Title": with a title set, the header already
    // supplies the page's H1.
    expect(messages(mk([text("## Section")], full))).toEqual([]);
  });

  test("missing title, description, image and tags are all reported", () => {
    const data = mk([text("# Title")]);
    expect(has(data, "No title")).toBe(true);
    expect(has(data, "No description")).toBe(true);
    expect(has(data, "No card image")).toBe(true);
    expect(has(data, "No tags")).toBe(true);
  });

  test("over-long title and description are reported as info", () => {
    const data = mk([text("## Section")], {
      meta: { ...full.meta, title: "x".repeat(60), description: "y".repeat(170) },
    });
    expect(has(data, "76 chars")).toBe(true); // "Harald Revery - " is 16
    expect(has(data, "170 chars")).toBe(true);
    expect(lint(data).every((i) => i.severity === "info")).toBe(true);
  });

  test("the title length counts the “Harald Revery - ” prefix every <title> carries", () => {
    const titled = (n: number) => mk([text("## Section")], { meta: { ...full.meta, title: "x".repeat(n) } });
    expect(has(titled(44), "Title is")).toBe(false); // 16 + 44 = 60
    expect(has(titled(45), "Title is 61 chars")).toBe(true);
  });
});

describe("images", () => {
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

  test("an Image with only a thumbnail still needs alt text — it renders", () => {
    const data = mk([{
      type: "Image",
      props: { ...config.components.Image.defaultProps, id: "i", image: { full: "", thumb: "/photos/a_min.jpg" } },
    }]);
    expect(has(data, "1 image without alt text")).toBe(true);
    expect(has(data, "empty media block")).toBe(false);
  });
});

describe("videos", () => {
  const page = (...content: any[]) => mk([text("## Section"), ...content], full);

  test("a finished video raises nothing", () => {
    const v = video({ src: "/video/a.mp4", poster: "/video/thumbnail/a.jpg", title: "T", caption: "D" });
    expect(messages(page(v))).toEqual([]);
  });

  test("a missing poster, title and description are each noted, as info", () => {
    const issues = lint(page(video({ src: "/video/a.mp4" })));
    const msgs = issues.map((i) => i.message);
    expect(msgs.some((m) => m.startsWith("1 video without a poster"))).toBe(true);
    expect(msgs.some((m) => m.startsWith("1 video without a title"))).toBe(true);
    expect(msgs.some((m) => m.startsWith("1 video without a description"))).toBe(true);
    expect(issues.every((i) => i.severity === "info")).toBe(true);
  });

  test("the counts are per video", () => {
    const data = page(video({ src: "/video/a.mp4" }, "v1"), video({ src: "/video/b.mp4" }, "v2"));
    expect(has(data, "2 videos without a poster")).toBe(true);
  });

  test("a Video block with no file warns — it publishes nothing", () => {
    const issues = lint(page(video({ poster: "/video/thumbnail/a.jpg", title: "T" })));
    const m = issues.find((i) => i.message.includes("empty media block"));
    expect(m?.severity).toBe("warn");
    expect(m?.message).toContain("(Video)");
    // no panel is published, so there is nothing to be missing a poster
    expect(issues.some((i) => i.message.includes("poster"))).toBe(false);
  });

  test("a video in a hidden count-1 right column is not checked", () => {
    const data = page({
      type: "Columns",
      props: { id: "c", count: 1, verticalAlign: "center", spacing: "normal", left: [], right: [video({ src: "/video/a.mp4" })] },
    });
    expect(messages(data)).toEqual([]);
  });
});

describe("empty media blocks", () => {
  test("an empty gallery warns — it publishes a blank gap", () => {
    const m = messages(mk([text("## Section"), gallery([])], full)).find((x) => x.includes("empty media block"));
    expect(m).toContain("(Gallery)");
    expect(m).toContain("blank gap");
  });

  test("several are counted together and each type named once", () => {
    const data = mk([text("## Section"), video({}, "v1"), video({}, "v2"), gallery([])], full);
    expect(has(data, "3 empty media blocks (Video, Gallery)")).toBe(true);
  });
});

describe("files missing on disk", () => {
  const page = mk([text("## Section")], full);

  test("a missing file is a warning that names it", () => {
    const m = lint(page, ["/video/under_25_mb/gone.mp4"]).find((i) => i.message.includes("not found on disk"));
    expect(m?.severity).toBe("warn");
    expect(m?.message).toContain("1 file not found on disk: gone.mp4");
  });

  test("a long list is shortened", () => {
    const files = ["/a/1.jpg", "/a/2.jpg", "/a/3.jpg", "/a/4.jpg", "/a/5.jpg"];
    expect(has(page, "5 files not found on disk: 1.jpg, 2.jpg, 3.jpg and 2 more", files)).toBe(true);
  });

  test("not checked means nothing reported", () => {
    expect(has(page, "not found on disk")).toBe(false);
  });
});
