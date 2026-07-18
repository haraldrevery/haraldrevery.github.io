/*
 * Export pipeline (front matter, placeholders, SEO head, hero nav wiring) and
 * the page-check lint.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import {
  assembleDocument,
  exportText,
  slugify,
  humanDate,
  frontmatterYaml,
  jsonld,
  resolveSchemaType,
} from "../src/export";
import { lintPage } from "../src/lint";
import { newBlock } from "../src/blocks/defs";
import type { Block, ColumnsBlock, HeroBlock, ImageBlock } from "../src/blocks/model";
import type { Meta } from "../src/export";

const shell = readFileSync(new URL("../shell.html", import.meta.url), "utf8");
const SITE = "https://haraldrevery.com";

const meta = (over: Partial<Meta> = {}): Meta => ({
  title: "Golden Test: Export Pipeline",
  date: "2026-07-17",
  tags: "photography, test",
  description: "A description of sensible length for search snippets.",
  image: "/notebook_thumbnails/1dgraphplot_min.jpg",
  draft: true,
  schemaType: "auto",
  ...over,
});

function heroBlock(): HeroBlock {
  const h = newBlock("hero") as HeroBlock;
  h.image = "/photos/a.jpg";
  h.imageThumb = "/photos/a_min.jpg";
  h.title = "Big";
  return h;
}

describe("export helpers", () => {
  test("slugify (unicode kept, punctuation dropped)", () => {
    expect(slugify("Galdhøpiggen: The Ridge!")).toBe("galdhøpiggen-the-ridge");
    expect(slugify("  Photos 2024 — spring & summer  ")).toBe("photos-2024-spring-summer");
  });
  test("humanDate matches %B %-d, %Y", () => {
    expect(humanDate("2026-07-17")).toBe("July 17, 2026");
    expect(humanDate("bad")).toBe("bad");
  });
  test("front matter quotes colon values, draft flag optional", () => {
    const fm = frontmatterYaml(meta());
    expect(fm).toContain('title: "Golden Test: Export Pipeline"');
    expect(fm).toContain("tags: [photography, test]");
    expect(fm).toContain("draft: true");
    expect(frontmatterYaml(meta({ draft: false }))).not.toContain("draft:");
  });
});

describe("assembled document", () => {
  const blocks: Block[] = [
    (() => {
      const h = newBlock("heading");
      (h as Block & { text: string; level: number }).text = "T";
      (h as Block & { level: number }).level = 1;
      return h;
    })(),
    (() => {
      const p = newBlock("paragraph");
      (p as Block & { md: string }).md = "Math $E=mc^2$ and an [ext](https://example.com).";
      return p;
    })(),
  ];
  const doc = exportText(shell, meta(), blocks, SITE, "golden-test");

  test("no leftover placeholders, front matter first, MathML, no katex assets", () => {
    expect(doc).not.toContain("{{");
    expect(doc).toStartWith("---\n");
    expect(doc).toContain("<math");
    expect(doc).not.toContain("katex.css");
    expect(doc).not.toContain("data-pb-id");
  });
  test("SEO head matches base.njk conventions", () => {
    expect(doc).toContain('property="og:type" content="article"');
    expect(doc).toContain('property="og:site_name" content="Harald Revery"');
    expect(doc).toContain('name="twitter:card" content="summary_large_image"');
    expect(doc).toContain('og:title" content="Golden Test: Export Pipeline - Harald Revery"');
    expect(doc).toContain(`${SITE}/notebook_pages/golden-test`);
  });
  test("no hero: plain nav, no nav script, static back link present", () => {
    expect(doc).toContain('class="main-nav fixed');
    expect(doc).not.toContain("navbar_scroll");
    expect(doc.match(/← Back to Notebook/g)?.length).toBe(1);
  });
  test("with hero: navi_mechanic + fallback script + hero before container", () => {
    const withHero = assembleDocument(shell, meta(), [heroBlock(), ...blocks], SITE, "t");
    expect(withHero).toContain('class="main-nav navi_mechanic fixed');
    expect(withHero).toContain("/javascript/navbar_scroll_min.js");
    expect(withHero.indexOf("release-hero")).toBeLessThan(withHero.indexOf('class="page-container pt-24'));
  });
  test("with hero: exactly one back link (the hero's), static one suppressed", () => {
    const withHero = assembleDocument(shell, meta(), [heroBlock(), ...blocks], SITE, "t");
    expect(withHero.match(/← Back to Notebook/g)?.length).toBe(1);
    expect(withHero).toContain("extra_fade_effect_long");
    expect(withHero).not.toContain("{{BACKLINK}}");
  });
});

describe("schema", () => {
  const galleryWith = (n: number) => {
    const g = newBlock("gallery") as Block & { items: unknown[] };
    for (let i = 0; i < n; i++) {
      g.items.push({ full: `/photos/p${i}.jpg`, thumb: `/photos/p${i}_min.jpg`, alt: "", title: "", description: "", w: 4000, h: 3000 });
    }
    return g as Block;
  };
  const para = (text: string) => {
    const p = newBlock("paragraph") as Block & { md: string };
    p.md = text;
    return p as Block;
  };
  const faqWith = (n: number) => {
    const f = newBlock("faq") as Block & { items: { q: string; a: string }[] };
    f.items = Array.from({ length: n }, (_, i) => ({ q: `Q${i}?`, a: `A${i} with **bold**.` }));
    return f as Block;
  };

  test("auto: photo-dominated -> ImageGallery, text -> BlogPosting, FAQ-only -> FAQPage", () => {
    expect(resolveSchemaType(meta(), [galleryWith(6), para("short")])).toEqual({ type: "ImageGallery", auto: true });
    expect(resolveSchemaType(meta(), [para("a"), para("b"), para("c")])).toEqual({ type: "BlogPosting", auto: true });
    expect(resolveSchemaType(meta(), [faqWith(3)])).toEqual({ type: "FAQPage", auto: true });
  });

  test("manual override wins", () => {
    expect(resolveSchemaType(meta({ schemaType: "article" }), [galleryWith(9)])).toEqual({ type: "Article", auto: false });
  });

  test("jsonld: image array with real dimensions, keywords, wordCount", () => {
    const out = jsonld(meta(), [galleryWith(3), para("one two three four")], `${SITE}/notebook_pages/x`, SITE);
    const obj = JSON.parse(out.replace(/<\/?script[^>]*>/g, ""));
    expect(obj["@type"]).toBe("BlogPosting");
    expect(obj.image.length).toBe(4); // card + 3 gallery images
    expect(obj.image[1]).toEqual({ "@type": "ImageObject", url: `${SITE}/photos/p0.jpg`, width: 4000, height: 3000 });
    expect(obj.keywords).toBe("photography, test");
    expect(obj.wordCount).toBe(4);
    expect(obj.dateModified).toBe("2026-07-17");
  });

  test("jsonld: FAQ blocks become a FAQPage entity in @graph with rendered answers", () => {
    // three paragraphs -> text-dominant -> BlogPosting primary + FAQ entity
    const out = jsonld(meta(), [para("intro"), para("more"), para("text"), faqWith(2)], `${SITE}/x`, SITE);
    const obj = JSON.parse(out.replace(/<\/?script[^>]*>/g, ""));
    expect(obj["@graph"].length).toBe(2);
    expect(obj["@graph"][0]["@type"]).toBe("BlogPosting");
    expect(obj["@graph"][1]["@type"]).toBe("FAQPage");
    expect(obj["@graph"][1].mainEntity[0].name).toBe("Q0?");
    expect(obj["@graph"][1].mainEntity[0].acceptedAnswer.text).toContain("<strong>bold</strong>");
  });

  test("jsonld: FAQPage primary carries mainEntity directly (no graph)", () => {
    const out = jsonld(meta({ schemaType: "faqpage" }), [faqWith(2)], `${SITE}/x`, SITE);
    const obj = JSON.parse(out.replace(/<\/?script[^>]*>/g, ""));
    expect(obj["@type"]).toBe("FAQPage");
    expect(obj.mainEntity.length).toBe(2);
    expect(obj["@graph"]).toBeUndefined();
  });

  test("image cap at 6 and no duplicates", () => {
    const out = jsonld(meta(), [galleryWith(10)], `${SITE}/x`, SITE);
    const obj = JSON.parse(out.replace(/<\/?script[^>]*>/g, ""));
    expect(obj.image.length).toBe(6);
  });
});

describe("lint", () => {
  const H = (level: number) => {
    const h = newBlock("heading") as Block & { level: number; text: string };
    h.level = level;
    h.text = "t";
    return h as Block;
  };
  const warns = (m: Meta, blocks: Block[]) =>
    lintPage(m, blocks).filter((i) => i.severity === "warn").map((i) => i.message);

  test("heading outline", () => {
    expect(warns(meta(), [H(2)]).join()).toContain("No H1");
    expect(warns(meta(), [H(1), H(1)]).join()).toContain("2 H1");
    expect(warns(meta(), [H(1), H(3)]).join()).toContain("H1 → H3");
    expect(warns(meta(), [H(1), H(2), H(3), H(2)])).toEqual([]);
  });
  test("hero h1 satisfies the outline; multiple/incomplete heroes flagged", () => {
    expect(warns(meta(), [heroBlock(), H(2)])).toEqual([]);
    expect(warns(meta(), [heroBlock(), heroBlock()]).join()).toContain("hero blocks");
    const empty = newBlock("hero") as HeroBlock;
    expect(warns(meta(), [empty]).join()).toContain("no photo");
  });
  test("alt counting includes visible column children only", () => {
    const col = newBlock("columns") as ColumnsBlock;
    const img = newBlock("image") as ImageBlock;
    img.full = "/x.jpg";
    const hiddenImg = newBlock("image") as ImageBlock;
    hiddenImg.full = "/y.jpg";
    col.columns = [img, hiddenImg];
    col.count = 1;
    const issues = lintPage(meta(), [H(1), col]);
    const alt = issues.find((i) => i.message.includes("without alt"));
    expect(alt?.message).toStartWith("1 image");
  });
});
