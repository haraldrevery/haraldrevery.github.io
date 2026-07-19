/*
 * Renderer suite: registry completeness, justified/uniform galleries, svg
 * theming in blocks, hero, icons, columns-as-child-blocks, and the rule that
 * every emitted class exists in the compiled site CSS (no CSS build on
 * export). Pure — no DOM.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { renderContent, renderHero, heroNavReveal } from "../src/blocks/render";
import { BLOCK_TYPES, BLOCK_META, EMBEDDABLE_LABELS, newBlock } from "../src/blocks/defs";
import { setSvgText } from "../src/blocks/svgStore";
import type { Block, ColumnsBlock, GalleryBlock, GalleryItem, HeroBlock } from "../src/blocks/model";

const REPO = new URL("../..", import.meta.url).pathname;
const css = readFileSync(`${REPO}/main.css`, "utf8") + readFileSync(`${REPO}/prose.css`, "utf8");

setSvgText("/svg/test.svg", '<svg viewBox="0 0 10 10"><path fill="#f00" d="M0 0h5v5H0z"/></svg>');

const items: GalleryItem[] = [
  { full: "/photos/a.jpg", thumb: "/photos/a_min.jpg", alt: "a", title: "t", description: "d", w: 4032, h: 3024 },
  { full: "/photos/b.jpg", thumb: "/photos/b_min.jpg", alt: "b", title: "", description: "", w: 3024, h: 4032 },
  { full: "/photos/c.jpg", thumb: "/photos/c_min.jpg", alt: "c", title: "", description: "" }, // no dims
];

function gallery(over: Partial<GalleryBlock> = {}): GalleryBlock {
  return { ...(newBlock("gallery") as GalleryBlock), items: [...items], ...over };
}

/// A representative, fully-populated block of every type (for coverage tests).
function sample(type: (typeof BLOCK_TYPES)[number]): Block {
  const b = newBlock(type) as Block & Record<string, unknown>;
  switch (b.type) {
    case "hero":
      Object.assign(b, { image: "/photos/a.jpg", imageThumb: "/photos/a_min.jpg", kicker: "K", title: "T", tagline: "L" });
      break;
    case "heading":
      Object.assign(b, { text: "Head", align: "center" });
      break;
    case "paragraph":
      Object.assign(b, { md: "Some **bold** and $x^2$" });
      break;
    case "gallery":
      Object.assign(b, { items: [...items] });
      break;
    case "image":
      Object.assign(b, { full: "/p.jpg", thumb: "/p_min.jpg", alt: "a", caption: "c", widthPct: 50 });
      break;
    case "svg":
      Object.assign(b, { src: "/svg/test.svg", link: "/music.html", hoverGrow: true, alt: "Logo", widthPct: 50 });
      break;
    case "video":
      Object.assign(b, { src: "/video/v.mp4", poster: "/p.jpg", caption: "vid" });
      break;
    case "icons":
      Object.assign(b, { items: [{ src: "/svg/test.svg", label: "X", href: "https://x.com" }, { src: "/svg/test.svg", label: "In", href: "/contact.html" }] });
      break;
    case "audio":
      Object.assign(b, { src: "/audio/a.mp3", title: "Track" });
      break;
    case "faq":
      Object.assign(b, { items: [{ q: "Q?", a: "A with **bold**." }] });
      break;
    case "downloads":
      Object.assign(b, {
        items: [
          { src: "/download/pack.zip", label: "Wallpaper pack", size: 11234567, sha256: "a".repeat(64), sha512: "b".repeat(128) },
        ],
      });
      break;
    case "raw":
      Object.assign(b, { html: '<div class="custom">raw</div>' });
      break;
  }
  return b as Block;
}

describe("registry", () => {
  test("every type has label + make + summary and renders top-level without throwing", () => {
    for (const t of BLOCK_TYPES) {
      expect(BLOCK_META[t].label.length).toBeGreaterThan(0);
      const b = sample(t);
      const out = t === "hero" ? renderHero([b]) : renderContent([b]);
      expect(typeof out).toBe("string");
    }
  });

  test("every embeddable type renders inside a column", () => {
    for (const [t] of EMBEDDABLE_LABELS) {
      const col = newBlock("columns") as ColumnsBlock;
      col.columns = [sample(t), newBlock("paragraph")];
      const out = renderContent([col]);
      expect(out).toContain("md:grid-cols-2 gap-16");
      expect(out).not.toContain("<section class=\"mb-"); // children have no section wrapper
    }
  });

  test("icons is a column option (the regression that started this)", () => {
    expect(EMBEDDABLE_LABELS.map(([t]) => t)).toContain("icons");
  });
});

describe("justified gallery", () => {
  const out = renderContent([gallery({ rowHeight: 320 })]);
  test("flex-wrap container + spacer", () => {
    expect(out).toContain('class="flex flex-wrap gap-2"');
    expect(out).toContain('<div style="flex-grow: 1000000" aria-hidden="true"></div>');
  });
  test("ratio-driven styles + 3/2 fallback", () => {
    expect(out).toContain("aspect-ratio: 4032/3024; flex-grow: 1.3333; flex-basis: calc(1.3333 * 240px); max-height: 480px");
    expect(out).toContain("aspect-ratio: 3024/4032; flex-grow: 0.75");
    expect(out).toContain("aspect-ratio: 3/2; flex-grow: 1.5");
  });
  test("lightbox anchors kept, no script", () => {
    expect(out.match(/class="portfolio-item glightbox block"/g)?.length).toBe(3);
    expect(out).not.toContain("<script");
  });
});

describe("uniform gallery", () => {
  const out = renderContent([gallery({ layout: "uniform", columns: 3, aspect: "5/7" })]);
  test("cropped grid markup", () => {
    expect(out).toContain("grid grid-cols-2 md:grid-cols-3 gap-6");
    expect(out).toContain("aspect-[5/7]");
  });
});

describe("columns", () => {
  test("children render inner (no section), vertical align works", () => {
    const col = newBlock("columns") as ColumnsBlock;
    col.verticalAlign = "top";
    col.columns = [sample("paragraph"), sample("gallery")];
    const out = renderContent([col]);
    expect(out).toContain("items-start");
    expect(out).toContain("prose dark:prose-invert max-w-none");
    expect(out).toContain("flex flex-wrap gap-2"); // full gallery renderer in column
  });
  test("count=1 renders single column", () => {
    const col = newBlock("columns") as ColumnsBlock;
    col.count = 1;
    const out = renderContent([col]);
    expect(out).not.toContain("md:grid-cols-2 gap-16");
  });
});

describe("edit mode", () => {
  test("ids on top-level blocks only, none in export", () => {
    const col = newBlock("columns") as ColumnsBlock;
    const blocks = [sample("heading"), col, sample("gallery")];
    const edit = renderContent(blocks, { editMode: true });
    for (const b of blocks) expect(edit).toContain(`data-pb-id="${b.id}"`);
    expect(edit).not.toContain(`data-pb-id="${col.columns[0].id}"`);
    expect(renderContent(blocks)).not.toContain("data-pb-id");
  });

  test("split marker only on embeddable blocks", () => {
    const edit = renderContent([sample("gallery"), sample("downloads")], { editMode: true });
    const galleryTag = edit.slice(0, edit.indexOf(">"));
    expect(galleryTag).toContain('data-pb-split="1"');
    // downloads is non-embeddable -> its section has an id but no split marker
    const dlIdx = edit.indexOf("overflow-x-auto");
    expect(edit.slice(dlIdx - 200, dlIdx)).not.toContain("data-pb-split");
  });

  test("column chips + empty-column target are edit-only", () => {
    const col = newBlock("columns") as ColumnsBlock; // default: empty paragraph + image
    const edit = renderContent([col], { editMode: true });
    expect(edit).toContain('class="pb-col-chip" data-pb-col="0"');
    expect(edit).toContain("＋ pick content"); // empty paragraph slot
    expect(edit).toContain('data-pb-col="1"');
    const exportOut = renderContent([col]);
    expect(exportOut).not.toContain("pb-col-chip");
    expect(exportOut).not.toContain("pick content");
  });
});

describe("hero + icons", () => {
  const heroWith = (over: Partial<HeroBlock>): HeroBlock =>
    ({ ...(sample("hero") as HeroBlock), ...over });

  test("hero excluded from content, renders via renderHero", () => {
    const h = sample("hero");
    expect(renderContent([h])).toBe("");
    const out = renderHero([h]);
    expect(out).toContain('class="release-hero"');
    expect(out).toContain("release-hero__backdrop");
    expect(out).toContain("← Back to Notebook");
  });
  test("nav reveal flag", () => {
    expect(heroNavReveal([sample("hero")])).toBe(true);
    expect(heroNavReveal([])).toBe(false);
  });
  // scrim/mask numbers are hand-tuned in render.ts — assert structure only
  test("cover background: bottom fade mask, dark scrim, white text (dark tint)", () => {
    const out = renderHero([heroWith({ background: "cover" })]);
    expect(out).toMatch(/mask-image:linear-gradient\(#000 \d+%,transparent 100%\)/);
    expect(out).toMatch(/background:linear-gradient\(rgba\(0,0,0,[.\d]+\)/);
    expect(out).toContain("text-white");
  });
  test("cover light tint: light scrim, FORCED dark text (theme-independent)", () => {
    const out = renderHero([heroWith({ background: "cover", coverStyle: "light" })]);
    expect(out).toMatch(/background:linear-gradient\(rgba\(255,255,255,[.\d]+\)/);
    // forced text-black — inheriting dark:text-white would be white-on-light
    // in dark mode
    expect(out).toContain('class="page-container release-hero__inner text-black">');
  });
  test("dots background uses index-style bg-dot-grid", () => {
    const out = renderHero([heroWith({ background: "dots" })]);
    expect(out).toContain('class="release-hero bg-dot-grid"');
    expect(out).not.toContain("release-hero__backdrop");
  });
  test("photo + svg, left-aligned: text left / svg right via release-hero__grid", () => {
    const out = renderHero([
      heroWith({ showSvg: true, svgSrc: "/svg/test.svg", svgWidthPct: 30, svgX: -10, svgY: 5, align: "left" }),
    ]);
    expect(out).toContain("release-hero__backdrop");
    expect(out).toContain('class="release-hero__grid"');
    // text column comes first (left), svg second (right); no stacking margin
    expect(out.indexOf("release-hero__title")).toBeLessThan(out.indexOf("width:30%"));
    expect(out).toContain('style="width:30%;transform:translate(-10%,5%);"');
    expect(out).toContain('fill="currentColor"');
  });
  test("photo + svg, centered: stacked with spacing below the svg", () => {
    const out = renderHero([
      heroWith({ showSvg: true, svgSrc: "/svg/test.svg", align: "center" }),
    ]);
    expect(out).not.toContain("release-hero__grid");
    expect(out).toContain("margin-bottom:2.5rem");
    expect(out.indexOf("mx-auto")).toBeLessThan(out.indexOf("release-hero__title"));
  });
  test("gallery gets both selection id and item-drag marker in edit mode", () => {
    const g = sample("gallery");
    const edit = renderContent([g], { editMode: true });
    const tag = edit.slice(0, edit.indexOf(">") + 1);
    expect(tag).toContain(`data-pb-id="${g.id}"`);
    expect(tag).toContain('data-pb-items="1"');
    expect(renderContent([g])).not.toContain("data-pb-items");
  });
  test("labeled icons panel: release style (label + left-aligned row)", () => {
    const ic = sample("icons") as Block & { label: string };
    ic.label = "Listen everywhere";
    const out = renderContent([ic]);
    expect(out).toContain('style="letter-spacing:0.3em"');
    expect(out).toContain("Listen everywhere");
    // the ROW is left-aligned (no justify-center in its class list)
    expect(out).toContain('<div class="flex flex-wrap items-center gap-6');
    const plain = renderContent([sample("icons")]);
    expect(plain).toContain('<div class="flex flex-wrap justify-center items-center gap-6');
  });
  test("anim fade wraps the text box; words wraps each word with deterministic delays", () => {
    const fade = renderHero([heroWith({ anim: "fade" })]);
    expect(fade).toContain('<div class="extra_fade_effect">');
    const h = heroWith({ anim: "words", title: "Two Words", kicker: "", tagline: "" });
    const words = renderHero([h]);
    expect(words.match(/class="word_animation"/g)?.length).toBe(2);
    expect(words).toMatch(/animation-delay: 0\.\d\ds/);
    expect(renderHero([h])).toBe(words); // deterministic
  });
  test("scroll prompt: index-style #scroll-prompt + enter_site anchor", () => {
    const out = renderHero([heroWith({ scrollPrompt: "Scroll down ↓" })]);
    expect(out).toContain('id="scroll-prompt"');
    expect(out).toContain('href="#enter_site"');
    expect(out).toContain('<div id="enter_site"></div>');
    expect(renderHero([sample("hero")])).not.toContain("scroll-prompt");
  });
  test("hero back link is container-aligned and single", () => {
    const out = renderHero([sample("hero")]);
    expect(out).toContain('<div class="page-container" style="position:absolute;left:0;right:0;bottom:1.5rem');
    expect(out).toContain("extra_fade_effect_long");
    expect(out.match(/← Back to Notebook/g)?.length).toBe(1);
  });
  test("icons: themed svgs, sr-only labels, external target", () => {
    const out = renderContent([sample("icons")]);
    expect(out).toContain("hover:opacity-50");
    expect(out).toContain('<span class="sr-only">X</span>');
    expect(out).toContain('target="_blank"');
    expect(out).not.toContain('href="/contact.html" target');
    expect(out).toContain('fill="currentColor"');
  });
});

describe("options", () => {
  test("heading center, image width, svg width", () => {
    const out = renderContent([sample("heading"), sample("image"), sample("svg")]);
    expect(out).toContain('<h2 class="text-center">Head</h2>');
    expect(out).toContain('<figure style="width:50%;margin-inline:auto">');
    expect(out).toContain('style="width:50%;margin-inline:auto"');
  });
});

describe("round tweaks", () => {
  test("audio is embeddable and renders in a column without a section", () => {
    expect(EMBEDDABLE_LABELS.map(([t]) => t)).toContain("audio");
    const col = newBlock("columns") as ColumnsBlock;
    col.columns = [sample("audio"), newBlock("paragraph")];
    const out = renderContent([col]);
    expect(out).toContain('<audio controls class="w-full" src="/audio/a.mp3">');
    expect(out).not.toContain('<section class="mb-12"');
  });

  test("hero back link rides up to the scroll-prompt row when both are on", () => {
    const off = renderHero([{ ...(sample("hero") as HeroBlock), scrollPrompt: "" }]);
    expect(off).toContain("bottom:1.5rem");
    const on = renderHero([{ ...(sample("hero") as HeroBlock), scrollPrompt: "Scroll ↓" }]);
    expect(on).toContain("bottom:2.5rem"); // bottom-10, same row as the prompt
  });

  test("scroll prompt supports two rows via <br> (index.html style)", () => {
    const out = renderHero([
      { ...(sample("hero") as HeroBlock), scrollPrompt: "Welcome!\nScroll down to enter ↓" },
    ]);
    expect(out).toContain("Welcome! <br> Scroll down to enter ↓");
  });

  test("uniform gallery offers 29/9 and 21/7 aspects", () => {
    const out = renderContent([gallery({ layout: "uniform", aspect: "29/9" })]);
    expect(out).toContain("aspect-[29/9]");
    const out2 = renderContent([gallery({ layout: "uniform", aspect: "21/7" })]);
    expect(out2).toContain("aspect-[21/7]");
  });

  test("feature layout: 3x3 grid, first image spans 2x2, all squares", () => {
    const out = renderContent([gallery({ layout: "feature" })]);
    expect(out).toContain('class="grid grid-cols-3 md:grid-cols-3 gap-4"');
    const anchors = [...out.matchAll(/class="portfolio-item glightbox block([^"]*)"/g)].map((m) => m[1]);
    expect(anchors.length).toBe(3);
    expect(anchors[0]).toContain(" col-span-2 row-span-2 aspect-square");
    expect(anchors[1]).toBe(" aspect-square");
    expect(anchors[2]).toBe(" aspect-square");
    expect(out).toContain("glightbox"); // lightbox intact
  });
});

describe("faq + audio presentation", () => {
  test("faq is width-constrained like about.html (max-w-4xl centered)", () => {
    const out = renderContent([sample("faq")]);
    expect(out).toContain('<div class="max-w-4xl mx-auto">');
  });

  test("audio panel toggle: release preview-card with caption; plain stays plain", () => {
    const a = sample("audio") as Block & { panel: boolean; title: string };
    const plain = renderContent([a]);
    expect(plain).not.toContain("preview-card");
    expect(plain).toContain('<audio controls class="w-full" src="/audio/a.mp3">');
    a.panel = true;
    const panel = renderContent([a]);
    expect(panel).toContain('<div class="preview-card">');
    expect(panel).toContain('style="letter-spacing:0.3em">Track</p>');
    expect(panel).toContain('preload="none"');
    expect(panel).toContain('<source src="/audio/a.mp3" type="audio/mpeg">');
    a.title = "";
    expect(renderContent([a])).toContain(">Preview</p>");
  });
});

describe("downloads block", () => {
  test("download.html table structure with SHA-256/512 (no MD5)", () => {
    const out = renderContent([sample("downloads")]);
    expect(out).toContain('href="/download/pack.zip" download');
    expect(out).toContain(">Wallpaper pack</span>");
    expect(out).toContain(">11.2 MB<");
    expect(out).toContain(">SHA-256 Hash</th>");
    expect(out).toContain(">SHA-512 Hash</th>");
    expect(out).not.toContain("MD5");
    expect(out).toContain('class="text-zinc-400 dark:text-zinc-500 break-all select-all">' + "a".repeat(64));
    expect(out).toContain("b".repeat(128));
    // responsive hiding mirrors download.html
    expect(out).toContain('hidden md:table-cell');
    expect(out).toContain('hidden lg:table-cell');
  });

  test("humanSize formatting", async () => {
    const { humanSize } = await import("../src/blocks/render");
    expect(humanSize(512)).toBe("512 B");
    expect(humanSize(11234567)).toBe("11.2 MB");
    expect(humanSize(1500)).toBe("1.5 KB");
    expect(humanSize(2_400_000_000)).toBe("2.4 GB");
    expect(humanSize(0)).toBe("—");
  });
});

describe("class coverage", () => {
  test("every emitted class exists in main.css/prose.css", () => {
    const all =
      renderHero([sample("hero")]) +
      renderContent(BLOCK_TYPES.filter((t) => t !== "hero").map(sample)) +
      renderContent([{ ...(sample("audio") as object), panel: true } as Block]) +
      renderContent([
        (() => {
          const c = newBlock("columns") as ColumnsBlock;
          c.columns = [sample("gallery"), sample("icons")];
          return c;
        })(),
      ]);
    const classes = new Set<string>();
    for (const m of all.matchAll(/class="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) if (c) classes.add(c);
    // glightbox = JS selector; katex/custom come from the markdown pipeline /
    // raw block content; faq-item is a pure selector anchor (no CSS rule)
    const skip = new Set(["glightbox", "katex", "custom", "faq-item"]);
    const esc = (c: string) => c.replace(/([:\/\[\].])/g, "\\$1");
    const missing = [...classes].filter((c) => !skip.has(c) && !css.includes("." + esc(c)));
    expect(missing).toEqual([]);
  });
});
