/*
 * Prose parity against v1's REAL renderer.
 *
 * The single biggest modelling change in the rewrite is folding v1's
 * heading/paragraph/hr blocks into one markdown Text block (see
 * src/puck/components/Text.tsx). The claim that justifies it is that the
 * emitted markup is unchanged — so this test imports v1's renderer from
 * ../../page_builder and asserts that, rather than trusting a transcription.
 *
 * If v1 is ever deleted, delete this file with it; the class-coverage and
 * spacing guards in render.test.tsx stand on their own.
 */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Render } from "@measured/puck/rsc";
import type { Data } from "@measured/puck";
import { config } from "../src/puck/config";
import { Hero } from "../src/puck/components/Hero";
import { DEFAULT_HERO } from "../src/puck/PageRoot";
import { stripReactPreloads } from "../src/export/renderHtml";

// @ts-expect-error — v1 is plain TS outside this project's tsconfig
import { renderContent, renderHero } from "../../page_builder/src/blocks/render.ts";
// @ts-expect-error — ditto
import { newBlock } from "../../page_builder/src/blocks/defs.ts";
// @ts-expect-error — ditto
import { setSvgText as setSvgTextV1 } from "../../page_builder/src/blocks/svgStore.ts";
import { setSvgText as setSvgTextV2 } from "../src/blocks/svgStore";

/// v1 and v2 have SEPARATE svg caches (separate module instances), so a test
/// comparing their output has to warm both or v2 renders its "not loaded"
/// placeholder against v1's real inlined svg.
const setSvgText = (src: string, text: string) => {
  setSvgTextV1(src, text);
  setSvgTextV2(src, text);
};

const contentConfig = {
  ...config,
  root: { ...config.root, render: ({ children }: any) => children },
} as typeof config;

const v2 = (content: any[]) =>
  stripReactPreloads(renderToStaticMarkup(<Render config={contentConfig} data={{ root: { props: {} }, content } as unknown as Data} />));

/// Collapse insignificant whitespace between tags so v1's hand-indented
/// template literals and React's single-line output are comparable. Whitespace
/// INSIDE a text run is preserved, which is what matters (word_animation spans
/// rely on the literal space between them).
///
/// Three formatting-only differences are normalised away. None of them change
/// how a browser parses the page; the exported HTML gets run through a
/// formatter anyway (src/export/format.ts).
///   1. v1 breaks attributes across lines inside a tag; React emits one line.
///   2. React self-closes void elements: <img …/> vs v1's <img …>.
///   3. v1 hand-writes style="a: 1; b: 2"; React serialises "a:1;b:2".
///   4. React cannot emit a bare valueless attribute: `controls` becomes
///      `controls=""`. The HTML parser treats both identically — presence is
///      what makes a boolean attribute true.
///   5. React escapes ' to &#x27; inside attribute values, so a CSS
///      url('/photos/a.jpg') comes out as url(&#x27;…&#x27;). The HTML parser
///      decodes it before CSS ever sees it, so the rule is identical. The
///      quotes stay (unquoted url() breaks on paths containing spaces).
const norm = (h: string) =>
  h
    .replace(/&#x27;/g, "'")
    .replace(/ (controls|download|autoplay|loop|muted|playsinline|defer|async|hidden|open)=""/g, " $1")
    // (1) + (2) — inside tags only, so whitespace in text runs is preserved
    // (word_animation spans rely on the literal space between them).
    .replace(/<[^>]+>/g, (tag) => tag.replace(/\s+/g, " ").replace(/\s*\/>$/, ">"))
    .replace(/>\s+</g, "><")
    // (3)
    .replace(/style="([^"]*)"/g, (_m, s) =>
      `style="${s.split(";").map((d: string) => d.trim().replace(/:\s+/, ":")).filter(Boolean).join(";")}"`,
    )
    .trim();

/// norm(), plus collapsing whitespace runs INSIDE text nodes.
///
/// Only for blocks whose text is a <video>/<audio> fallback message, where v1
/// indents the sentence and React does not. That text renders solely when the
/// browser cannot play the media, so its internal spacing is meaningless.
///
/// Never use this on word_animation output: there the single literal space
/// between spans IS the word separator, and collapsing would hide its loss.
const normLoose = (h: string) =>
  norm(h).replace(/>\s+/g, ">").replace(/\s+</g, "<").replace(/\s+/g, " ");

describe("prose parity with v1", () => {
  test("a heading + paragraph run produces one <article>, same markup", () => {
    const h = newBlock("heading");
    h.text = "Section";
    const p = newBlock("paragraph");
    p.md = "Body copy here.";

    const expected = renderContent([h, p]);

    // v2: the same content authored as ONE Text block
    const actual = v2([
      { type: "Text", props: { md: "## Section\n\nBody copy here.", animate: false, spacing: "normal", id: "t1" } },
    ]);

    expect(norm(actual)).toBe(norm(expected));
    expect(actual).toContain('<article class="prose dark:prose-invert max-w-none mb-16">');
    // The <h2> must be a DIRECT child — prose.css zeroes first/last child
    // margins with a direct-child selector, so a wrapper div would break it.
    expect(norm(actual)).toContain('max-w-none mb-16"><h2>');
  });

  test("markdown rules and multiple sections stay in one article", () => {
    const blocks = [
      Object.assign(newBlock("heading"), { text: "One" }),
      Object.assign(newBlock("paragraph"), { md: "First body." }),
      newBlock("hr"),
      Object.assign(newBlock("heading"), { text: "Two" }),
    ];
    const expected = renderContent(blocks);
    const actual = v2([
      {
        type: "Text",
        props: {
          md: "## One\n\nFirst body.\n\n---\n\n## Two",
          animate: false,
          spacing: "normal",
          id: "t2",
        },
      },
    ]);
    expect(norm(actual)).toBe(norm(expected));
  });

  test("a lone Heading block matches v1's lone heading", () => {
    const h = newBlock("heading");
    h.text = "Section";
    const expected = renderContent([h]);
    const actual = v2([
      { type: "Heading", props: { text: "Section", level: 2, align: "left", animate: false, spacing: "normal", id: "h1" } },
    ]);
    expect(norm(actual)).toBe(norm(expected));
  });

  test("a centred heading matches v1", () => {
    const h = newBlock("heading");
    h.text = "Centred";
    h.align = "center";
    const expected = renderContent([h]);
    const actual = v2([
      { type: "Heading", props: { text: "Centred", level: 2, align: "center", animate: false, spacing: "normal", id: "h2" } },
    ]);
    expect(norm(actual)).toBe(norm(expected));
  });

  test("word animation produces identical spans (same seed = same delays)", () => {
    const h = newBlock("heading");
    h.id = "seed-1";
    h.text = "Two words";
    h.animate = true;
    const expected = renderContent([h]);
    const actual = v2([
      { type: "Heading", props: { text: "Two words", level: 2, align: "left", animate: true, spacing: "normal", id: "seed-1" } },
    ]);
    expect(norm(actual)).toBe(norm(expected));
  });

  test("KaTeX math survives dangerouslySetInnerHTML as MathML", () => {
    const p = newBlock("paragraph");
    p.md = "Energy is $E = mc^2$ exactly.";
    const expected = renderContent([p]);
    const actual = v2([
      { type: "Text", props: { md: "Energy is $E = mc^2$ exactly.", animate: false, spacing: "normal", id: "t3" } },
    ]);
    expect(norm(actual)).toBe(norm(expected));
    // No runtime KaTeX on the page — math must already be MathML.
    expect(actual).toContain("<math");
  });
});

describe("gallery parity with v1", () => {
  const items = [
    { full: "/photos/a.jpg", thumb: "/photos/a_min.jpg", alt: "a", title: "t", description: "d", w: 4032, h: 3024 },
    { full: "/photos/b.jpg", thumb: "/photos/b_min.jpg", alt: "b", title: "", description: "", w: 3024, h: 4032 },
    { full: "/photos/c.jpg", thumb: "/photos/c_min.jpg", alt: "c", title: "", description: "" }, // no dims
  ];

  const v1Gallery = (over: Record<string, unknown> = {}) => {
    const g = newBlock("gallery");
    Object.assign(g, { items: items.map((i) => ({ ...i })), group: "gallery1", ...over });
    return renderContent([g]);
  };

  const v2Gallery = (over: Record<string, unknown> = {}) =>
    v2([
      {
        type: "Gallery",
        props: {
          items, layout: "justified", rowHeight: 320, columns: 3,
          aspect: "5/7", group: "gallery1", spacing: "normal", id: "g1",
          ...over,
        },
      },
    ]);

  test("justified layout: flex arithmetic matches exactly", () => {
    expect(norm(v2Gallery())).toBe(norm(v1Gallery()));
  });

  test("justified: a missing-dimension item falls back to 3/2", () => {
    const out = norm(v2Gallery());
    expect(out).toContain("aspect-ratio:3/2");
    // 4032/3024 = 1.3333 -> grow 133.33
    expect(out).toContain("flex-grow:133.33");
    // 3024/4032 = 0.75 -> grow 75, NOT 0.75: flexbox only distributes Sum(grow)
    // of the free space when that sum is < 1, so a lone portrait could never
    // fill its row.
    expect(out).toContain("flex-grow:75");
  });

  test("uniform layout matches, including the dynamic md:grid-cols-N", () => {
    for (const columns of [2, 3, 4, 5, 6]) {
      expect(norm(v2Gallery({ layout: "uniform", columns, aspect: "4/5" })))
        .toBe(norm(v1Gallery({ layout: "uniform", columns, aspect: "4/5" })));
    }
  });

  test("feature layout matches (first image spans 2x2)", () => {
    expect(norm(v2Gallery({ layout: "feature" }))).toBe(norm(v1Gallery({ layout: "feature" })));
  });

  test("GLightbox captions strip the structural ; and : characters", () => {
    const out = v2Gallery({
      items: [{ ...items[0], title: "A: first; second", description: "x: y" }],
    });
    expect(out).toContain('data-glightbox="title: A - first, second; description: x - y"');
  });
});

describe("columns parity with v1 (the Nested context)", () => {
  test("prose inside a column becomes a <div>, not an <article>", () => {
    const c = newBlock("columns");
    const p = newBlock("paragraph");
    p.md = "Left copy.";
    const h = newBlock("heading");
    h.text = "Right";
    c.columns = [p, h];
    const expected = renderContent([c]);

    const actual = v2([
      {
        type: "Columns",
        props: {
          count: 2, verticalAlign: "center", spacing: "normal", id: "c1",
          left: [{ type: "Text", props: { md: "Left copy.", animate: false, spacing: "normal", id: "L" } }],
          right: [{ type: "Heading", props: { text: "Right", level: 2, align: "left", animate: false, spacing: "normal", id: "R" } }],
        },
      },
    ]);

    expect(norm(actual)).toBe(norm(expected));
    // The whole point of the Nested context: no <article>, no <section>, and
    // crucially NO spacing class on the children — the columns section owns
    // their gap.
    expect(actual).toContain('<div class="prose dark:prose-invert max-w-none"><p>Left copy.</p></div>');
    expect(actual).not.toContain("<article");
  });

  test("a nested gallery emits no <section> wrapper and no gap class", () => {
    const c = newBlock("columns");
    const g = newBlock("gallery");
    g.items = [{ full: "/photos/a.jpg", thumb: "/photos/a_min.jpg", alt: "a", title: "", description: "", w: 100, h: 100 }];
    g.group = "gallery1";
    c.columns = [g, newBlock("paragraph")];
    c.count = 1;
    const expected = renderContent([c]);

    const actual = v2([
      {
        type: "Columns",
        props: {
          count: 1, verticalAlign: "center", spacing: "normal", id: "c2",
          left: [{
            type: "Gallery",
            props: {
              items: [{ full: "/photos/a.jpg", thumb: "/photos/a_min.jpg", alt: "a", title: "", description: "", w: 100, h: 100 }],
              layout: "justified", rowHeight: 320, columns: 3, aspect: "5/7",
              group: "gallery1", spacing: "normal", id: "G",
            },
          }],
          right: [],
        },
      },
    ]);

    expect(norm(actual)).toBe(norm(expected));
    // exactly one <section> — the columns block's own
    expect(actual.match(/<section/g)?.length).toBe(1);
    expect(actual).not.toContain("mb-16\"><div class=\"flex flex-wrap");
  });

  test("count 1 renders only the left slot but keeps the right slot's data", () => {
    const data = {
      type: "Columns",
      props: {
        count: 1, verticalAlign: "center", spacing: "normal", id: "c3",
        left: [{ type: "Text", props: { md: "Shown.", animate: false, spacing: "normal", id: "L" } }],
        right: [{ type: "Text", props: { md: "Hidden but preserved.", animate: false, spacing: "normal", id: "R" } }],
      },
    };
    const out = v2([data]);
    expect(out).toContain("Shown.");
    expect(out).not.toContain("Hidden but preserved.");
    // the data itself is untouched — switching back to 2 restores the work
    expect((data.props.right as any[]).length).toBe(1);
  });
});

describe("hero parity with v1", () => {
  // v1 renders heroes through renderHero(), into shell.html's {{HERO}} slot.
  const v1Hero = (over: Record<string, unknown> = {}) => {
    const h = newBlock("hero");
    Object.assign(h, { id: "hero", kicker: "K", title: "T", tagline: "L", ...over });
    return renderHero([h]);
  };

  const v2Hero = (over: Record<string, unknown> = {}) => {
    const { image, imageThumb, ...rest } = over as any;
    return stripReactPreloads(renderToStaticMarkup(
      <Hero
        {...(DEFAULT_HERO as any)}
        kicker="K"
        title="T"
        tagline="L"
        {...rest}
        {...(image || imageThumb ? { image: { full: image ?? "", thumb: imageThumb ?? "" } } : {})}
        id="hero"
      />,
    ));
  };

  test("default (blurred backdrop, no photo) matches", () => {
    expect(norm(v2Hero())).toBe(norm(v1Hero()));
  });

  test("backdrop with a photo matches", () => {
    const o = { image: "/photos/a.jpg", imageThumb: "/photos/a_min.jpg" };
    expect(norm(v2Hero(o))).toBe(norm(v1Hero(o)));
  });

  test("full-bleed cover, dark and light scrim, matches", () => {
    for (const coverStyle of ["dark", "light"]) {
      const o = { background: "cover", coverStyle, image: "/photos/a.jpg", imageThumb: "/photos/a_min.jpg" };
      expect(norm(v2Hero(o))).toBe(norm(v1Hero(o)));
    }
  });

  test("dot-grid background matches", () => {
    expect(norm(v2Hero({ background: "dots" }))).toBe(norm(v1Hero({ background: "dots" })));
  });

  test("centred + per-word animation matches", () => {
    const o = { align: "center", anim: "words" };
    expect(norm(v2Hero(o))).toBe(norm(v1Hero(o)));
  });

  test("back link and scroll prompt matches (both on = shared bottom row)", () => {
    const o = { backLink: true, scrollPrompt: "Welcome!\nScroll down" };
    expect(norm(v2Hero(o))).toBe(norm(v1Hero(o)));
    // the scroll target sits OUTSIDE the section
    expect(norm(v2Hero(o))).toContain('</section><div id="enter_site">');
  });

  test("anim none emits no fade class", () => {
    expect(norm(v2Hero({ anim: "none" }))).toBe(norm(v1Hero({ anim: "none" })));
  });
});

describe("the remaining nine block types match v1", () => {
  // v1 stored svg text in a synchronous cache; warm both sides identically.
  const SVG = '<svg viewBox="0 0 10 10"><path fill="#f00" d="M0 0h5v5H0z"/></svg>';

  /// Render one v1 block and one v2 component with equivalent props.
  const pair = (v1Type: string, v1Over: Record<string, unknown>, v2Type: string, v2Props: Record<string, unknown>) => {
    const b = newBlock(v1Type);
    Object.assign(b, { id: "b1", ...v1Over });
    return {
      expected: renderContent([b]),
      actual: v2([{ type: v2Type, props: { spacing: "normal", id: "b1", ...v2Props } }]),
    };
  };

  test("Divider matches the hr block", () => {
    const { expected, actual } = pair("hr", {}, "Divider", {});
    expect(norm(actual)).toBe(norm(expected));
  });

  test("Image matches, with lightbox and caption", () => {
    const { expected, actual } = pair(
      "image",
      { full: "/photos/a.jpg", thumb: "/photos/a_min.jpg", alt: "A", caption: "Cap", lightbox: true, widthPct: 100 },
      "Image",
      { image: { full: "/photos/a.jpg", thumb: "/photos/a_min.jpg" }, alt: "A", caption: "Cap", lightbox: true, widthPct: 100 },
    );
    expect(norm(actual)).toBe(norm(expected));
  });

  test("Image matches without a lightbox, at a reduced width", () => {
    const { expected, actual } = pair(
      "image",
      { full: "/photos/a.jpg", thumb: "/photos/a_min.jpg", alt: "A", caption: "", lightbox: false, widthPct: 60 },
      "Image",
      { image: { full: "/photos/a.jpg", thumb: "/photos/a_min.jpg" }, alt: "A", caption: "", lightbox: false, widthPct: 60 },
    );
    expect(norm(actual)).toBe(norm(expected));
    expect(actual).toContain("width:60%");
  });

  test("Video matches, with poster and caption", () => {
    const { expected, actual } = pair(
      "video",
      { src: "/video/a.mp4", poster: "/photos/a.jpg", caption: "Cap" },
      "Video",
      { src: "/video/a.mp4", poster: "/photos/a.jpg", caption: "Cap" },
    );
    expect(normLoose(actual)).toBe(normLoose(expected));
    // the caption is real content, so assert it exactly
    expect(actual).toContain("<figcaption>Cap</figcaption>");
  });

  test("Audio matches, plain and as a release panel", () => {
    for (const panel of [false, true]) {
      const { expected, actual } = pair(
        "audio",
        { src: "/audio/a.mp3", title: "T", panel },
        "Audio",
        { src: "/audio/a.mp3", title: "T", panel },
      );
      expect(normLoose(actual)).toBe(normLoose(expected));
    }
  });

  test("Raw matches (verbatim, inside the shared gap wrapper)", () => {
    const { expected, actual } = pair(
      "raw", { html: '<p class="x">hi</p>' },
      "Raw", { html: '<p class="x">hi</p>' },
    );
    expect(norm(actual)).toBe(norm(expected));
  });

  test("Svg matches when themed and inlined", () => {
    setSvgText("/svg/test.svg", SVG);
    const { expected, actual } = pair(
      "svg",
      { src: "/svg/test.svg", themed: true, hoverGrow: true, link: "https://x.test", alt: "Logo", widthPct: 40 },
      "Svg",
      { src: "/svg/test.svg", themed: true, hoverGrow: true, link: "https://x.test", alt: "Logo", widthPct: 40 },
    );
    expect(norm(actual)).toBe(norm(expected));
    // recoloured to follow the page theme
    expect(actual).toContain("currentColor");
  });

  test("Svg matches when not themed (plain linked img)", () => {
    const { expected, actual } = pair(
      "svg",
      { src: "/svg/test.svg", themed: false, hoverGrow: false, link: "", alt: "Logo", widthPct: 100 },
      "Svg",
      { src: "/svg/test.svg", themed: false, hoverGrow: false, link: "", alt: "Logo", widthPct: 100 },
    );
    expect(norm(actual)).toBe(norm(expected));
  });

  test("Icons matches, labelled panel and centred row", () => {
    setSvgText("/svg/test.svg", SVG);
    for (const label of ["", "Listen everywhere"]) {
      const items = [{ src: "/svg/test.svg", label: "Spotify", href: "https://open.spotify.com" }];
      const { expected, actual } = pair(
        "icons", { items, size: "medium", label },
        "Icons", { items, size: "medium", label },
      );
      expect(norm(actual)).toBe(norm(expected));
    }
  });

  test("Icons large size uses the inline 2.5rem style", () => {
    setSvgText("/svg/test.svg", SVG);
    const items = [{ src: "/svg/test.svg", label: "L", href: "#" }];
    const { expected, actual } = pair(
      "icons", { items, size: "large", label: "" },
      "Icons", { items, size: "large", label: "" },
    );
    expect(norm(actual)).toBe(norm(expected));
    expect(norm(actual)).toContain("width:2.5rem");
  });

  test("Faq matches, including the block-scoped checkbox ids", () => {
    const items = [{ q: "First?", a: "Yes **really**." }, { q: "Second?", a: "Also." }];
    const { expected, actual } = pair("faq", { items }, "Faq", { items });
    expect(norm(actual)).toBe(norm(expected));
    // ids are block-scoped so two FAQ blocks on one page cannot cross-toggle
    expect(actual).toContain('id="faq-b1-0"');
    expect(actual).toContain('id="faq-b1-1"');
  });

  test("Downloads matches, including human sizes", () => {
    const items = [
      { src: "/files/a.zip", label: "Album", size: 11200000, sha256: "aa", sha512: "bb" },
      { src: "/files/b.zip", label: "", size: 512, sha256: "cc", sha512: "dd" },
    ];
    const { expected, actual } = pair("downloads", { items }, "Downloads", { items });
    expect(norm(actual)).toBe(norm(expected));
    expect(actual).toContain("11.2 MB");
    expect(actual).toContain("512 B");
    // a blank label falls back to the file name
    expect(actual).toContain("b.zip");
  });
});
