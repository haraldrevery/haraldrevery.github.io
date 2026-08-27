/*
 * HTML formatting for the exported page.
 *
 * renderToStaticMarkup emits everything on one line. Exported pages are
 * COMMITTED TO GIT, so a one-line body would make every edit a single
 * unreadable diff line. This re-indents the {{HERO}} and {{CONTENT}} fragments
 * before they go into shell.html.
 *
 * Applied ONLY to those two fragments — never to shell.html itself or to the
 * YAML frontmatter. Both are already hand-formatted and must stay byte-stable.
 *
 * `wrap_line_length: 0` is the safety property. With wrapping off, js-beautify
 * only inserts newlines BETWEEN block-level elements and never reflows a run of
 * inline content. That matters for the per-word animation: wrapPlainWords emits
 * `<span class="word_animation">A</span> <span …>B</span>` where the literal
 * space between the spans is the word separator, and `.word_animation` is
 * `display:inline-block; white-space:pre` in the compiled main.css.
 *
 * tests/format.test.ts asserts structural and textual identity rather than
 * trusting these options.
 */
import { html as htmlBeautify } from "js-beautify";

/*
 * HTML void elements. React self-closes them (`<img/>`) and js-beautify then
 * spaces that out (`<img />`), but every hand-written page on this site uses the
 * plain HTML5 form (`<img>`, `<hr>`, `<br>`). The trailing slash is ignored by
 * the HTML parser, so this is purely about matching the house convention —
 * exported pages sit in git next to the hand-written ones.
 *
 * Listed by NAME on purpose: inside <svg>, foreign-content parsing rules make
 * `/>` meaningful, and `<path/>`, `<circle/>` etc. must keep their slash. None
 * of the names below occur in SVG markup.
 */
const VOID_ELEMENTS =
  "area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr";
const SELF_CLOSING_VOID = new RegExp(`<(${VOID_ELEMENTS})\\b([^>]*?)\\s*/>`, "gi");

export function formatHtml(src: string): string {
  if (!src.trim()) return "";
  return unSelfClose(htmlBeautify(src, {
    indent_size: 2,
    // never reflow inline runs — see above
    wrap_line_length: 0,
    preserve_newlines: true,
    max_preserve_newlines: 1,
    end_with_newline: false,
    // no blank line before specific tags; the renderer owns vertical rhythm
    extra_liners: [],
    // leave the internals of these alone: MathML from KaTeX, inline themed
    // SVG, and anything in a Raw block that is whitespace-sensitive
    content_unformatted: ["pre", "code", "textarea", "math", "svg"],
    unformatted: [],
  }));
}

function unSelfClose(html: string): string {
  return html.replace(SELF_CLOSING_VOID, "<$1$2>");
}
