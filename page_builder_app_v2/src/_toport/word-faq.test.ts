/*
 * word_animation engine (deterministic delays, math/code-safe HTML wrapping)
 * and the FAQ accordion block.
 */
import { describe, expect, test } from "bun:test";
import { wordDelay, wrapPlainWords, wrapHtmlWords } from "../src/blocks/wordAnimate";
import { renderContent } from "../src/blocks/render";
import { newBlock } from "../src/blocks/defs";
import type { FaqBlock, HeadingBlock, ParagraphBlock } from "../src/blocks/model";

describe("word engine", () => {
  test("delays deterministic, in the site's 0.02–0.97 range, two decimals", () => {
    for (const seed of ["a", "b:0", "block:title:3"]) {
      const d = wordDelay(seed);
      expect(d).toBe(wordDelay(seed));
      expect(d).toMatch(/^0\.\d\d$/);
      const v = Number(d);
      expect(v).toBeGreaterThanOrEqual(0.02);
      expect(v).toBeLessThanOrEqual(0.97);
    }
    expect(wordDelay("x")).not.toBe(wordDelay("y"));
  });

  test("plain wrapping matches the about.html span pattern", () => {
    const out = wrapPlainWords("Music from the mountains", "seed");
    expect(out.match(/class="word_animation"/g)?.length).toBe(4);
    expect(out).toMatch(/<span class="word_animation" style="animation-delay: 0\.\d\ds">Music<\/span>/);
    expect(wrapPlainWords("Music from the mountains", "seed")).toBe(out);
  });

  test("html wrapping: link text wrapped, math/code/pre untouched", () => {
    const html =
      '<p>Visit <a href="https://x.com">my site</a> and <code>raw_code here</code> and <math><mi>x</mi></math> now</p>';
    const out = wrapHtmlWords(html, "s");
    expect(out).toContain('<a href="https://x.com"><span class="word_animation"');
    expect(out).toContain("<code>raw_code here</code>");
    expect(out).toContain("<math><mi>x</mi></math>");
    expect(out).toMatch(/>now<\/span>/);
    // attributes are never wrapped
    expect(out).toContain('href="https://x.com"');
  });

  test("heading + paragraph animate toggles flow through the renderer", () => {
    const h = newBlock("heading") as HeadingBlock;
    h.text = "Two Words";
    h.animate = true;
    const p = newBlock("paragraph") as ParagraphBlock;
    p.md = "Hello $E=mc^2$ world";
    p.animate = true;
    const out = renderContent([h, p]);
    expect(out.match(/class="word_animation"/g)!.length).toBeGreaterThanOrEqual(4);
    // math survives untouched inside the animated paragraph
    expect(out).toContain("<math");
    expect(out.replace(/<span class="word_animation"[^>]*>|<\/span>/g, "")).toContain("Hello");
    // off by default -> no spans
    const plain = newBlock("paragraph") as ParagraphBlock;
    plain.md = "Hello world";
    expect(renderContent([plain])).not.toContain("word_animation");
  });
});

describe("faq block", () => {
  function faq(): FaqBlock {
    const b = newBlock("faq") as FaqBlock;
    b.items = [
      { q: "First question?", a: "Answer with **bold**." },
      { q: "Second?", a: "Plain." },
    ];
    return b;
  }

  test("about.html accordion structure with unique prefixed ids", () => {
    const b = faq();
    const out = renderContent([b]);
    expect(out).toContain('class="faq-item border border-zinc-200 dark:border-white/10 rounded-lg overflow-hidden"');
    expect(out).toContain(`id="faq-${b.id}-0"`);
    expect(out).toContain(`for="faq-${b.id}-0"`);
    expect(out).toContain(`id="faq-${b.id}-1"`);
    expect(out).toContain('class="faq-toggle hidden"');
    expect(out).toContain('class="faq-answer"');
    expect(out).toContain('<span class="faq-icon text-3xl text-zinc-500 dark:text-zinc-400 flex-shrink-0">+</span>');
    expect(out).toContain("<strong>bold</strong>"); // markdown answers
    expect(out).not.toContain("<script");
  });

  test("two faq blocks never collide ids", () => {
    const a = faq();
    const b = faq();
    const out = renderContent([a, b]);
    const ids = [...out.matchAll(/id="(faq-[^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("faq h3s don't break the heading outline lint", async () => {
    const { lintPage } = await import("../src/lint");
    const h1 = newBlock("heading") as HeadingBlock;
    h1.level = 1;
    h1.text = "Title";
    const issues = lintPage(
      { title: "T", date: "2026-07-17", tags: "x", description: "Long enough description here.", image: "/x_min.jpg", draft: false },
      [h1, faq()]
    );
    expect(issues.filter((i) => i.severity === "warn")).toEqual([]);
  });

  test("faq works inside a column", () => {
    const col = newBlock("columns") as import("../src/blocks/model").ColumnsBlock;
    col.columns = [faq(), newBlock("paragraph")];
    expect(renderContent([col])).toContain("faq-question");
  });
});
