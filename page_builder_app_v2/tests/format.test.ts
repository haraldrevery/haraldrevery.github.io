/*
 * The formatter must be LOSSLESS. It runs over every exported page, so a
 * dropped attribute or a swallowed space would corrupt committed HTML silently.
 *
 * Two independent checks per case:
 *   1. structural — identical once insignificant inter-tag whitespace is removed
 *   2. textual    — identical visible text, via a real DOM parse
 *
 * (2) ignores whitespace ENTIRELY, comparing only the visible characters.
 * Indenting between block elements legitimately adds whitespace that a browser
 * never renders, so any whitespace-sensitive comparison here would fail on
 * correct output. What this still catches is text being dropped, duplicated or
 * reordered — the ways a formatter actually corrupts a document.
 *
 * Whitespace correctness is a separate, narrower question: it only matters
 * INSIDE a run of inline elements, where adding or removing a space changes
 * what the browser renders. That is exactly what `wrap_line_length: 0` exists
 * to prevent, and it gets its own precise tests below ("inline runs are never
 * reflowed") plus an explicit assertion on the word_animation case.
 */
import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { formatHtml } from "../src/export/format";

/// Void elements are normalised to the site's <img> form (see format.ts), so
/// compare with the slash removed on both sides.
const strip = (h: string) =>
  h.replace(/>\s+</g, "><").replace(/\s*\/>/g, ">").trim();
/// Visible characters only — whitespace carries no meaning between blocks.
const chars = (s: string) => s.replace(/\s+/g, "");

function text(html: string): string {
  const win = new Window();
  const doc = win.document;
  doc.body.innerHTML = html;
  return doc.body.textContent ?? "";
}

function assertLossless(src: string) {
  const out = formatHtml(src);
  expect(strip(out)).toBe(strip(src));
  expect(chars(text(out))).toBe(chars(text(src)));
  return out;
}

describe("formatHtml is lossless", () => {
  test("a prose article", () => {
    const out = assertLossless(
      '<article class="prose dark:prose-invert max-w-none mb-16"><h2>Section</h2><p>Body copy with <strong>bold</strong> and <a href="/x">a link</a>.</p><hr></article>',
    );
    // and it actually indents, otherwise the whole exercise is pointless
    expect(out).toContain("\n");
    expect(out.split("\n").length).toBeGreaterThan(3);
  });

  test("word_animation spans keep the literal space between them", () => {
    const src =
      '<h1 class="release-hero__title"><span class="word_animation" style="animation-delay: 0.44s">Two</span> <span class="word_animation" style="animation-delay: 0.25s">words</span></h1>';
    const out = assertLossless(src);
    expect(text(out)).toBe("Two words");
  });

  test("a justified gallery with inline style arithmetic", () => {
    assertLossless(
      '<section class="mb-16"><div class="flex flex-wrap gap-2"><a href="/photos/a.jpg" class="portfolio-item glightbox block" data-gallery="g1" data-glightbox="title: t; description: d" style="--delay:0.1s;aspect-ratio:4032/3024;flex-grow:133.33;flex-basis:calc(1.3333 * 240px);max-width:calc(1.3333 * 640px)"><div class="overlay"></div><img src="/photos/a_min.jpg" alt="a" class="w-full h-full object-cover" loading="lazy"/></a></div></section>',
    );
  });

  test("KaTeX MathML survives untouched", () => {
    const src =
      '<p>Energy is <eq><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></mrow></semantics></math></eq> exactly.</p>';
    const out = assertLossless(src);
    // content_unformatted keeps the math subtree on one line
    expect(out).toContain("<math");
  });

  test("inline SVG survives untouched", () => {
    assertLossless(
      '<div class="mx-auto" style="width:40%"><svg viewBox="0 0 10 10" fill="currentColor"><path d="M0 0h5v5H0z"/></svg></div>',
    );
  });

  test("a two-column block", () => {
    assertLossless(
      '<section class="extra_fade_effect mb-16"><div class="grid md:grid-cols-2 gap-16 items-center" style="row-gap:2rem"><div><div class="prose dark:prose-invert max-w-none"><p>Left.</p></div></div><div><div class="prose dark:prose-invert max-w-none"><h2>Right</h2></div></div></div></section>',
    );
  });

  test("a full hero", () => {
    assertLossless(
      '<section class="release-hero"><div class="release-hero__backdrop" style="background-image:url(&#x27;/photos/a_min.jpg&#x27;)"></div><div class="release-hero__scrim"></div><div class="page-container release-hero__inner"><div class="extra_fade_effect"><p class="release-hero__kicker">K</p><h1 class="release-hero__title">T</h1><p class="release-hero__tagline">L</p></div></div></section>',
    );
  });

  test("empty input stays empty", () => {
    expect(formatHtml("")).toBe("");
    expect(formatHtml("   \n  ")).toBe("");
  });

  test("is idempotent — re-formatting changes nothing", () => {
    const src =
      '<section class="mb-16"><div class="grid grid-cols-3 gap-4"><a href="/a.jpg" class="portfolio-item"><div class="overlay"></div><img src="/a_min.jpg" alt="a"/></a></div></section>';
    const once = formatHtml(src);
    expect(formatHtml(once)).toBe(once);
  });
});

describe("inline runs are never reflowed", () => {
  // This is what wrap_line_length: 0 buys. A browser collapses whitespace
  // between inline elements to a single space and renders NOTHING between
  // adjacent ones — so inserting or removing whitespace inside an inline run
  // changes the rendered text. Neither may happen.

  test("adjacent inline elements stay glued (no space inserted)", () => {
    const src = "<p><span>A</span><span>B</span></p>";
    expect(text(formatHtml(src))).toBe("AB");
  });

  test("a single separating space is preserved exactly", () => {
    const src = "<p><span>A</span> <span>B</span></p>";
    expect(text(formatHtml(src))).toBe("A B");
  });

  test("a long inline run is not wrapped, however long", () => {
    // 60 words: comfortably past any default wrap column.
    const words = Array.from({ length: 60 }, (_, i) => `w${i}`);
    const src =
      "<p>" + words.map((w) => `<span class="word_animation">${w}</span>`).join(" ") + "</p>";
    const out = formatHtml(src);
    expect(text(out)).toBe(words.join(" "));
    // the whole <p> stays on one line
    const pLine = out.split("\n").find((l) => l.includes("<span"));
    expect(pLine).toContain("w59");
  });

  test("text mixed with inline markup keeps its spacing", () => {
    const src = "<p>Body copy with <strong>bold</strong> and <em>italic</em> inline.</p>";
    expect(text(formatHtml(src))).toBe("Body copy with bold and italic inline.");
  });
});

describe("void elements match the site's hand-written convention", () => {
  test("React's self-closing void tags lose the slash", () => {
    expect(formatHtml('<p><img src="/a.jpg" alt="a"/><br/><hr/></p>')).not.toContain("/>");
  });

  test("<img> keeps every attribute", () => {
    const out = formatHtml('<img src="/a_min.jpg" alt="a" class="w-full" loading="lazy"/>');
    expect(out).toBe('<img src="/a_min.jpg" alt="a" class="w-full" loading="lazy">');
  });

  test("attribute values containing slashes are untouched", () => {
    const out = formatHtml('<img src="/photos/2025/a.jpg" alt="" style="aspect-ratio:4032/3024"/>');
    expect(out).toContain('src="/photos/2025/a.jpg"');
    expect(out).toContain("aspect-ratio:4032/3024");
    expect(out.endsWith(">")).toBe(true);
    expect(out).not.toContain("/>");
  });

  test("SVG children KEEP their self-closing slash (foreign content)", () => {
    // Inside <svg> the parser uses XML-ish rules, so <path/> must stay closed.
    const out = formatHtml('<svg viewBox="0 0 10 10"><path d="M0 0h5v5H0z"/><circle cx="1" cy="1" r="1"/></svg>');
    expect(out).toContain('<path d="M0 0h5v5H0z"/>');
    expect(out).toContain("<circle");
    expect(out).toContain("/>");
  });
});
