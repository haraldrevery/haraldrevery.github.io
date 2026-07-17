/*
 * Markdown pipeline — MUST stay an exact mirror of the site's Eleventy setup
 * (eleventy.config.js, "1. Markdown Library Settings"). Exported pages bypass
 * Eleventy's markdown engine (html_extras files are copied verbatim), so this
 * is what guarantees paragraphs/math/links come out identical to markdown_text
 * posts. If the Eleventy config changes, change this file the same way.
 *
 * KaTeX output is "mathml": math becomes native MathML at build time, so the
 * exported pages need no katex.css or katex.js.
 */
import MarkdownIt from "markdown-it";
import markdownItAttrs from "markdown-it-attrs";
import markdownItLinkAttributes from "markdown-it-link-attributes";
import markdownItTexmath from "markdown-it-texmath";
import katex from "katex";

export const md: MarkdownIt = new MarkdownIt({
  html: true,
  breaks: false,
  linkify: true,
})
  .use(markdownItAttrs)
  .use(markdownItLinkAttributes, {
    matcher(href: string) {
      return href.match(/^https?:\/\//);
    },
    attrs: {
      target: "_blank",
      rel: "noopener noreferrer",
    },
  })
  .use(markdownItTexmath, {
    engine: katex,
    delimiters: ["dollars", "brackets"],
    katexOptions: {
      output: "mathml",
      throwOnError: false,
    },
  });

export function renderMarkdown(src: string): string {
  return md.render(src ?? "").trim();
}

export function renderInlineMarkdown(src: string): string {
  return md.renderInline(src ?? "").trim();
}
