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
  frontmatterYaml, slugify, resolveSlug, humanDate, splitTags,
  resolveSchemaType, jsonld, assembleDocument, exportText, contentColumnClass,
} from "../src/export/export";
import { renderExportContent, renderExportHero } from "../src/export/renderExport";
import { lintPage } from "../src/export/lint";
import { setShell } from "../src/export/shellStore";
import { PageRoot } from "../src/puck/PageRoot";
import { renderToStaticMarkup } from "react-dom/server";

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

  test("resolveSlug cleans a typed file name the way it cleans a title", () => {
    // The prompt says "File name": the .html, a space and capitals are all
    // natural to type, and each used to reach the published URL as typed.
    expect(resolveSlug("My Trip.html", "Ignored")).toBe("my-trip");
    expect(resolveSlug("  notes.HTM ", "Ignored")).toBe("notes");
    expect(resolveSlug("a/b\\c", "Ignored")).toBe("abc");
    // Blank, or nothing left once ".html" is dropped: the title decides.
    expect(resolveSlug("", "Galdhøpiggen: a hike!")).toBe("galdhøpiggen-a-hike");
    expect(resolveSlug(".html", "Title")).toBe("title");
    expect(resolveSlug(undefined, undefined)).toBe("untitled");
    // A slug saved by an earlier export must come back unchanged.
    for (const s of ["galdhopiggen", "2015to2023", "my_post", "a-b-c"]) {
      expect(resolveSlug(s, "Other")).toBe(s);
    }
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
        // No `header: false`: post_body.njk adds the date/<h1>/back-link
        // header to a page without a hero. See the next test.
        // base.njk suppresses its own articleLd block when this is set, so the
        // page's resolved schema type (BlogPosting/ImageGallery/FAQPage) wins.
        'customJsonLd: true\n' +
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

  test("header: false is written for a hero page, and only for one", () => {
    // post_body.njk adds the date/<h1>/back-link header unless told not to. A
    // hero carries its own title and back link, so only a hero page opts out.
    const fm = (root: any) =>
      exportText({ data: mk([], root), config, siteUrl: SITE, slug: "t", heroHtml: "", contentHtml: "" });
    expect(fm({ hasHero: true, hero: { ...DEFAULT_HERO, title: "T" } })).toContain("\nheader: false\n");
    expect(fm({ hasHero: false })).not.toContain("header:");
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

  test("a title containing {{CONTENT}} is not expanded", () => {
    // v1 bug: a sequential replace re-scanned substituted values, splicing the
    // whole page body into the meta tags. Export no longer fills a shell at all,
    // so the guard now lives on the preview path, where TITLE is substituted.
    const data = mk([text("t", "Body copy here.")], { meta: meta({ title: "{{CONTENT}}" }) });
    const out = build(data);
    expect(out.match(/Body copy here\./g)?.length).toBe(1);
  });

  test("no hero -> the layout's header and its back link, no nav reveal", () => {
    const out = build(mk([text("t", "x")]));
    expect(out).toContain("← Back to Notebook");
    expect(out).not.toContain("navi_mechanic");
    expect(out).not.toContain("navbar_scroll_min.js");
  });

  test("the back link sits UNDER the title, inside the bordered header block", () => {
    // Order, not just presence: the whole point of the layout is that the page
    // announces itself before it offers the way out. The header comes from the
    // shell, i.e. from eleventy_settings/post_chrome.njk, which markdown posts
    // use too.
    const out = build(mk([text("t", "x")], { meta: { ...DEFAULT_META, title: "The Title" } }));
    // Scope to the header block — the title also appears in the frontmatter,
    // <title> and the og/twitter meta tags, all of which precede it.
    const start = out.indexOf('<div class="mb-8 pb-8 border-b border-neutral-200');
    expect(start).toBeGreaterThan(-1);
    const header = out.slice(start, out.indexOf("</div>", start));
    expect(header.indexOf("← Back to Notebook")).toBeGreaterThan(header.indexOf("<h1"));
    // and it is no longer in a wrapper of its own above the block
    expect(out).not.toContain('<div class="mb-8">');
  });

  test("hero -> its own fade-in back link only, plus the nav reveal", () => {
    const data = mk([text("t", "x")], { hasHero: true, hero: { ...DEFAULT_HERO, title: "T" } });
    const out = build(data);
    expect(out).toContain("release-hero");
    // The nav reveal is no longer markup in the page. base.njk owns the chrome,
    // so the fragment asks for it with `navScroll: true` in the front matter and
    // nav.njk + base.njk add .navi_mechanic and the script at build time.
    expect(out).not.toContain("navi_mechanic");
    const fm = exportText({
      data, config, siteUrl: SITE, slug: "t",
      heroHtml: renderExportHero(data),
      contentHtml: renderExportContent(data),
    });
    expect(fm).toContain("navScroll: true");
    // exactly one back link — the shell's header region is dropped
    expect(out.match(/← Back to Notebook/g)?.length).toBe(1);
    expect(out).toContain("fade_effect_long");
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
      data, config, siteUrl: SITE, slug: "t",
      heroHtml: "", contentHtml: renderExportContent(data),
    });
    expect(out.startsWith("---\n")).toBe(true);
    const end = out.indexOf("\n---\n", 4) + 5;
    const body = out.slice(end).trimStart();
    // A BODY FRAGMENT, never a document: base.njk supplies <!DOCTYPE>, <head>,
    // nav and footer at build time. Emitting a document here is what let the
    // old shell.html copy of the chrome go stale.
    expect(body).not.toContain("<!DOCTYPE");
    expect(body).not.toContain("<nav");
    expect(body).not.toContain("<footer");
    expect(body).toContain('<div class="page-container fade_effect">');
  });

  /*
   * THE regression. The layout (post_body.njk, via post_chrome.njk) adds the
   * header and the ending; a fragment that carries either shows it twice once
   * published — which every export did until 2026-09-19. tests/site-build.test.tsx
   * proves the published result; this pins the builder's half of the contract.
   */
  test("carries none of the layout's furniture, with or without a hero", () => {
    for (const root of [{ hasHero: false }, { hasHero: true, hero: { ...DEFAULT_HERO, title: "T" } }]) {
      const data = mk([text("t", "Body.")], root);
      const out = exportText({
        data, config, siteUrl: SITE, slug: "t",
        heroHtml: renderExportHero(data), contentHtml: renderExportContent(data),
      });
      expect(out).not.toContain("NOTEBOOK FRONT PAGE");
      expect(out).not.toContain("<hr");
      expect(out).not.toContain("<time");
      expect(out).not.toContain("mb-8 pb-8 border-b");
      // the only back link and <h1> a fragment may carry are its hero's
      expect(out.match(/← Back to Notebook/g)?.length ?? 0).toBe(root.hasHero ? 1 : 0);
      expect(out.match(/<h1/g)?.length ?? 0).toBe(root.hasHero ? 1 : 0);
    }
  });
});

describe("a page with no hero still gets a title", () => {
  // The layout's header (post_chrome.njk) supplies the date, the <h1> and the
  // back link, as it does for markdown posts. The preview takes it from the
  // shell, rendered from those same macros.
  const build = (data: Data, slug = "t") =>
    assembleDocument({
      shell, data, config, siteUrl: SITE, slug,
      heroHtml: renderExportHero(data),
      contentHtml: renderExportContent(data),
    });

  test("emits the date + h1 header block, matching post.njk", () => {
    const out = build(mk([text("t", "Body.")]));
    expect(out).toContain('<h1 class="text-5xl md:text-6xl text-zinc-900 dark:text-white mt-4 mb-4 uppercase tracking-wider">');
    expect(out).toContain("Galdhøpiggen");
    expect(out).toContain('<div class="mb-8 pb-8 border-b border-neutral-200 dark:border-neutral-800">');
    // isoStamp, as the layout stamps it
    expect(out).toContain('datetime="2025-08-17T00:00:00.000Z"');
    expect(out).toContain("August 17, 2025");
    // exactly one back link, and exactly one h1
    expect(out.match(/← Back to Notebook/g)?.length).toBe(1);
    expect(out.match(/<h1/g)?.length).toBe(1);
  });

  test("satisfies the page check's H1 requirement", () => {
    // The layout's <h1> is a real heading on the page, so the outline scan has
    // to count it even though no rendered fragment contains it.
    const data = mk([text("t", "Body with no heading.")]);
    const html = `${renderExportHero(data)}\n${renderExportContent(data)}`;
    const messages = lintPage({ data, config, html }).map((i) => i.message);
    expect(messages.some((m) => m.includes("No H1"))).toBe(false);
    expect(messages.some((m) => m.includes("No headings"))).toBe(false);
  });

  test("but an untitled page still warns — there is no h1 to find", () => {
    const data = mk([text("t", "Body.")], { meta: { ...DEFAULT_META, date: "2025-08-17" } });
    const html = `${renderExportHero(data)}\n${renderExportContent(data)}`;
    const messages = lintPage({ data, config, html }).map((i) => i.message);
    expect(messages.some((m) => m.includes("No headings"))).toBe(true);
  });

  test("a hero page gets neither — no duplicate title or back link", () => {
    const data = mk([text("t", "x")], { hasHero: true, hero: { ...DEFAULT_HERO, title: "Hero title" } });
    const out = build(data);
    expect(out.match(/← Back to Notebook/g)?.length).toBe(1);
    expect(out.match(/<h1/g)?.length).toBe(1);
    expect(out).toContain("release-hero__title");
    expect(out).not.toContain("mb-8 pb-8 border-b");
  });

  test("the content column uses only classes the compiled CSS has", () => {
    // The page header is layout markup now, compiled by the site's own Tailwind
    // build. What this app still emits around the blocks is the column.
    const css =
      readFileSync(new URL("../../main.css", import.meta.url).pathname, "utf8") +
      readFileSync(new URL("../../prose.css", import.meta.url).pathname, "utf8");
    const esc = (c: string) => c.replace(/([:\/\[\].])/g, "\\$1");
    for (const hasHero of [false, true]) {
      for (const c of contentColumnClass(hasHero).split(/\s+/)) {
        expect(css.includes("." + esc(c))).toBe(true);
      }
    }
  });
});

describe("the editor shows the layout's header", () => {
  // PageRoot takes it from the shell rather than keeping its own copy, so the
  // editor, the preview and the published page all show post_chrome.njk's.
  const root = (props: any) =>
    renderToStaticMarkup(<PageRoot {...props}><p>block</p></PageRoot>);

  test("from the shell, for a page without a hero", () => {
    setShell(shell);
    const out = root({ meta: meta({ title: "Editor Title" }), hasHero: false });
    expect(out).toContain("mb-8 pb-8 border-b");
    expect(out).toContain("Editor Title");
    expect(out).toContain('<div class="page-container fade_effect"><p>block</p></div>');
  });

  test("not at all for a hero page, whose content column keeps pt-24", () => {
    setShell(shell);
    const out = root({ meta: meta(), hasHero: true, hero: { ...DEFAULT_HERO, title: "H" } });
    expect(out).not.toContain("mb-8 pb-8 border-b");
    expect(out).toContain('<div class="page-container pt-24 fade_effect">');
  });

  test("and simply leaves it out until the shell has been read", () => {
    setShell("");
    const out = root({ meta: meta(), hasHero: false });
    expect(out).not.toContain("border-b");
    expect(out).toContain("<p>block</p>");
    setShell(shell);
  });
});
