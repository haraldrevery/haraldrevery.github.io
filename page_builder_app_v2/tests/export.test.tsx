/*
 * Export pipeline: frontmatter, JSON-LD and placeholder substitution.
 *
 * The frontmatter is what Eleventy's before-hook parses to build the Notebook
 * index, so its quoting rules are load-bearing — see yamlValue in export.ts for
 * why every value is double-quoted.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import type { Data } from "@measured/puck";
import { config } from "../src/puck/config";
import { DEFAULT_HERO, DEFAULT_META } from "../src/puck/PageRoot";
import {
  frontmatterYaml, slugify, humanDate, splitTags,
  resolveSchemaType, jsonld, assembleDocument, exportText,
} from "../src/export/export";
import { renderExportContent, renderExportHero } from "../src/export/renderExport";

const SITE = "https://haraldrevery.com";
const shell = readFileSync(new URL("../shell.html", import.meta.url).pathname, "utf8");

const meta = (over = {}) => ({ ...DEFAULT_META, title: "Galdhøpiggen", date: "2025-08-17", tags: "photography", ...over });

const mk = (content: any[] = [], root: any = {}): Data =>
  ({ root: { props: { meta: meta(), hasHero: false, hero: DEFAULT_HERO, ...root } }, content }) as unknown as Data;

const text = (id: string, md: string) => ({ type: "Text", props: { id, md, animate: false, spacing: "normal" } });

describe("slug and date helpers", () => {
  test("slugify strips punctuation and keeps letters from any script", () => {
    expect(slugify("Galdhøpiggen: a hike!")).toBe("galdhøpiggen-a-hike");
    expect(slugify("")).toBe("untitled");
    expect(slugify("  --- ")).toBe("untitled");
  });

  test("humanDate formats ISO dates and passes anything else through", () => {
    expect(humanDate("2025-08-17")).toBe("August 17, 2025");
    expect(humanDate("not a date")).toBe("not a date");
    expect(humanDate("")).toBe("");
  });

  test("splitTags accepts commas and whitespace", () => {
    expect(splitTags("a, b  c,,d")).toEqual(["a", "b", "c", "d"]);
  });
});

describe("frontmatter", () => {
  test("golden output", () => {
    expect(frontmatterYaml(meta({ description: "Photos from a hike.", image: "/notebook_thumbnails/g_min.jpg" })))
      .toBe(
        '---\n' +
        'title: "Galdhøpiggen"\n' +
        'date: 2025-08-17\n' +
        'tags: ["photography"]\n' +
        'image: "/notebook_thumbnails/g_min.jpg"\n' +
        'description: "Photos from a hike."\n' +
        '---',
      );
  });

  test("values that would break bare YAML are quoted and escaped", () => {
    const out = frontmatterYaml(meta({ title: 'He said: "no" # really', description: "line1\nline2" }));
    // a raw newline would inject a SECOND front-matter key
    expect(out).toContain('title: "He said: \\"no\\" # really"');
    expect(out).toContain('description: "line1\\nline2"');
    expect(out.split("\n").filter((l) => l.startsWith("description")).length).toBe(1);
  });

  test("implicit YAML typing cannot bite", () => {
    // unquoted, these become a number / a boolean / a timestamp
    for (const t of ["2024", "No", "On", "2025-01-01"]) {
      expect(frontmatterYaml(meta({ title: t }))).toContain(`title: "${t}"`);
    }
  });

  test("draft only appears when set", () => {
    expect(frontmatterYaml(meta())).not.toContain("draft");
    expect(frontmatterYaml(meta({ draft: true }))).toContain("draft: true");
  });
});

describe("JSON-LD", () => {
  const ld = (data: Data) => {
    const raw = jsonld((data.root!.props as any).meta, data, config, `${SITE}/notebook_pages/x`, SITE);
    return JSON.parse(raw.replace(/^<script[^>]*>\n/, "").replace(/\n<\/script>$/, "").replace(/\\u003c/g, "<"));
  };

  test("defaults to BlogPosting with a word count", () => {
    const obj = ld(mk([text("t", "one two three four five")]));
    expect(obj["@type"]).toBe("BlogPosting");
    expect(obj.wordCount).toBe(5);
    expect(obj.keywords).toBe("photography");
  });

  test("auto-detects a photo-dominated page as ImageGallery", () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      full: `/photos/${i}.jpg`, thumb: "", alt: "a", title: "", description: "", w: 100, h: 80,
    }));
    const obj = ld(mk([{ type: "Gallery", props: { id: "g", items, layout: "justified", rowHeight: 320, columns: 3, aspect: "5/7", group: "g", spacing: "normal" } }]));
    expect(obj["@type"]).toBe("ImageGallery");
    // images carry real pixel dimensions, capped at 6
    expect(obj.image[0]).toMatchObject({ "@type": "ImageObject", width: 100, height: 80 });
  });

  test("an explicit schemaType overrides the heuristic", () => {
    const data = mk([text("t", "short")], { meta: meta({ schemaType: "article" }) });
    expect(ld(data)["@type"]).toBe("Article");
  });

  test("a </script> in the title cannot break out of the element", () => {
    const data = mk([], { meta: meta({ title: "</script><img src=x onerror=alert(1)>" }) });
    const raw = jsonld((data.root!.props as any).meta, data, config, "c", SITE);
    expect(raw).not.toContain("</script><img");
    expect(raw).toContain("\\u003c/script");
    // exactly one closing tag: the real one
    expect(raw.match(/<\/script>/g)?.length).toBe(1);
  });
});

describe("assembleDocument", () => {
  const build = (data: Data, slug = "test") =>
    assembleDocument({
      shell, data, config, siteUrl: SITE, slug,
      heroHtml: renderExportHero(data),
      contentHtml: renderExportContent(data),
    });

  test("fills every placeholder — none are left in the output", () => {
    const out = build(mk([text("t", "Body.")]));
    expect(out).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  test("a description containing {{CONTENT}} is not expanded", () => {
    // v1 bug: a sequential replace re-scanned substituted values, splicing the
    // whole page body into the meta description.
    const data = mk([text("t", "Body copy here.")], { meta: meta({ description: "{{CONTENT}}" }) });
    const out = build(data);
    expect(out).toContain('content="{{CONTENT}}"');
    expect(out.match(/Body copy here\./g)?.length).toBe(1);
  });

  test("no hero -> static back link, no nav reveal", () => {
    const out = build(mk([text("t", "x")]));
    expect(out).toContain("← Back to Notebook");
    expect(out).not.toContain("navi_mechanic");
    expect(out).not.toContain("navbar_scroll_min.js");
  });

  test("hero -> its own fade-in back link only, plus the nav reveal", () => {
    const data = mk([text("t", "x")], { hasHero: true, hero: { ...DEFAULT_HERO, title: "T" } });
    const out = build(data);
    expect(out).toContain("release-hero");
    expect(out).toContain("navi_mechanic");
    expect(out).toContain("navbar_scroll_min.js");
    // exactly one back link — never the static one as well
    expect(out.match(/← Back to Notebook/g)?.length).toBe(1);
    expect(out).toContain("extra_fade_effect_long");
  });

  test("canonical drops the .html extension", () => {
    const out = build(mk([]), "galdhopiggen");
    expect(out).toContain(`${SITE}/notebook_pages/galdhopiggen`);
    expect(out).not.toContain("/notebook_pages/galdhopiggen.html");
  });

  test("exported markup carries no editor attributes", () => {
    const out = build(mk([text("t", "x")], { hasHero: true }));
    expect(out).not.toContain("data-puck");
    expect(out).not.toContain("data-pb-");
  });

  test("React's hoisted image preloads never reach the rendered fragments", () => {
    // React 19 emits <link rel="preload" as="image"> before any eager <img>.
    // Inside {{HERO}} that lands in <body>, where <link> is not valid HTML5.
    // NB shell.html has its own legitimate font preloads in <head>, so this
    // must be asserted on the FRAGMENT, not the assembled document.
    const data = mk([], { hasHero: true, hero: { ...DEFAULT_HERO, background: "cover", image: { full: "/photos/a.jpg", thumb: "/photos/a_min.jpg" } } });
    const heroHtml = renderExportHero(data);
    expect(heroHtml).toContain("release-hero");
    expect(heroHtml).toContain('<img src="/photos/a.jpg"');
    expect(heroHtml).not.toContain("preload");
    // and the lowercase attribute, matching every hand-written page
    expect(heroHtml).toContain('fetchpriority="high"');
    expect(heroHtml).not.toContain("fetchPriority");
  });
});

describe("exportText", () => {
  test("is frontmatter, a blank line, then the document", () => {
    const data = mk([text("t", "Body.")]);
    const out = exportText({
      shell, data, config, siteUrl: SITE, slug: "t",
      heroHtml: "", contentHtml: renderExportContent(data),
    });
    expect(out.startsWith("---\n")).toBe(true);
    const end = out.indexOf("\n---\n", 4) + 5;
    expect(out.slice(end).trimStart().startsWith("<!DOCTYPE")).toBe(true);
  });
});
