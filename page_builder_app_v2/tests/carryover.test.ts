/*
 * Direct tests for the two modules carried over from v1 VERBATIM:
 * blocks/svgStore.ts and blocks/wordAnimate.ts.
 *
 * Ported from v1's svg-modal.test.ts and word-faq.test.ts. Everything else in
 * those files tested code that no longer exists (ui/dom.ts modals, the v1 block
 * renderer) or is already covered here — the FAQ half by prose-parity and lint.
 *
 * Worth having as direct tests rather than leaning on prose-parity: these are
 * the fiddliest transforms in the codebase, and parity only exercises the paths
 * the sample data happens to hit. The theming edge cases below had NO coverage.
 *
 * The svg tests read the repo's REAL files, so they also catch a logo being
 * re-exported from Illustrator in a shape the recolouring cannot handle.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { themeSvgText, prepareSvgForInline } from "../src/blocks/svgStore";
import { wordDelay, wrapPlainWords, wrapHtmlWords } from "../src/blocks/wordAnimate";

const REPO = new URL("../..", import.meta.url).pathname;

describe("svg theming", () => {
  // Recolouring to currentColor is what makes an inlined svg follow the site's
  // light/dark theme, since the body carries `text-black dark:text-white`.

  test("an Illustrator export with no fills gets currentColor on the root", () => {
    // SVG's default fill is black, so a file with no fill at all would ignore
    // the theme entirely and stay invisible in dark mode.
    const logo = readFileSync(`${REPO}/svg/haraldreverylogo.svg`, "utf8");
    expect(themeSvgText(logo)).toMatch(/<svg fill="currentColor"/i);
  });

  test("the QR code's root fill is recoloured but viewport-fill is not", () => {
    // The lookbehind exists for exactly this: a naive /fill=/ replace mangles
    // `viewport-fill` and the QR loses its quiet zone.
    const qr = readFileSync(`${REPO}/svg/haraldreverycomqrcode.svg`, "utf8");
    const themed = themeSvgText(qr);
    expect(themed).toContain('fill="currentColor"');
    expect(themed).toContain('viewport-fill="rgb(255,255,255)"');
  });

  test("fill none and url() references survive; style fills are recoloured", () => {
    // `none` means "deliberately not painted" and `url(#…)` is a gradient
    // reference — recolouring either would destroy the artwork.
    const t = themeSvgText(
      '<svg><path fill="#f00"/><circle fill="none"/><rect style="fill:#0f0;stroke:#000"/><path fill="url(#g)"/></svg>',
    );
    expect(t).toContain('fill="currentColor"');
    expect(t).toContain('fill="none"');
    expect(t).toContain('fill="url(#g)"');
    expect(t).toContain("fill:currentColor");
    expect(t).toContain("stroke:currentColor");
  });

  test("inline prep strips the prolog, makes the root fluid, keeps the viewBox", () => {
    // An XML prolog is invalid inside HTML, and a fixed width/height would
    // ignore the block's width setting. The viewBox is what preserves the
    // aspect ratio once the dimensions are gone.
    const s = prepareSvgForInline(
      '<?xml version="1.0"?><svg width="10" height="5" viewBox="0 0 10 5"><path d="M0 0"/></svg>',
    );
    expect(s).not.toContain("<?xml");
    expect(s).not.toContain('width="10"');
    expect(s).toContain("width:100%;height:auto");
    expect(s).toContain('viewBox="0 0 10 5"');
  });
});

describe("word animation engine", () => {
  test("delays are deterministic, two decimals, within the site's 0.02–0.97 range", () => {
    // Deterministic is the point: a random delay would churn the git diff of
    // every exported page on every re-export.
    for (const seed of ["a", "b:0", "block:title:3"]) {
      const d = wordDelay(seed);
      expect(d).toBe(wordDelay(seed));
      expect(d).toMatch(/^0\.\d\d$/);
      expect(Number(d)).toBeGreaterThanOrEqual(0.02);
      expect(Number(d)).toBeLessThanOrEqual(0.97);
    }
    expect(wordDelay("x")).not.toBe(wordDelay("y"));
  });

  test("plain wrapping matches the about.html span pattern", () => {
    const out = wrapPlainWords("Music from the mountains", "seed");
    expect(out.match(/class="word_animation"/g)?.length).toBe(4);
    expect(out).toMatch(
      /<span class="word_animation" style="animation-delay: 0\.\d\ds">Music<\/span>/,
    );
    expect(wrapPlainWords("Music from the mountains", "seed")).toBe(out);
  });

  test("words are separated by a literal space", () => {
    // .word_animation is display:inline-block with white-space:pre, so that
    // single space IS the word separator. format.ts must never reflow it.
    const out = wrapPlainWords("two words", "s");
    expect(out).toContain("</span> <span");
  });

  test("html wrapping leaves math, code and pre subtrees alone", () => {
    // Wrapping inside MathML or a code block would corrupt the content.
    const html =
      '<p>Visit <a href="https://x.com">my site</a> and <code>raw_code here</code> and <math><mi>x</mi></math> now</p>';
    const out = wrapHtmlWords(html, "s");
    expect(out).toContain('<a href="https://x.com"><span class="word_animation"');
    expect(out).toContain("<code>raw_code here</code>");
    expect(out).toContain("<math><mi>x</mi></math>");
    expect(out).toMatch(/>now<\/span>/);
    // and attribute values are never treated as text
    expect(out).toContain('href="https://x.com"');
  });
});
