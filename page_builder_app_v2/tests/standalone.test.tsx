/*
 * The standalone HTML export ("Export HTML…").
 *
 * It is assembleDocument — the same document Preview renders — with the head
 * retargeted, because shell.html IS base.njk rendered for the SHELL's own
 * permalink. Everything base.njk derives from `title` rides {{TITLE}} through
 * and is already this page's; everything it derives from `page.url` or
 * `description` is frozen at the shell's, and a file the user keeps has to
 * describe the page, not the shell.
 *
 * The tests below therefore assert two different things:
 *
 *   - retargetHead is exercised against SYNTHETIC heads, so the rules hold for
 *     shells that already carry a description as well as for today's, which
 *     does not. Otherwise a shell regenerated with `description:` in its front
 *     matter would start emitting two description tags with nobody noticing.
 *   - assembleStandalone is exercised against the REAL committed shell.html, so
 *     "no frozen shell URL survives" is a claim about the actual file.
 *
 * The body must be untouched: the fragment is the one render path the whole
 * design hangs on, and this export is not allowed to be a second one.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import type { Data } from "@measured/puck";
import { DEFAULT_HERO, DEFAULT_META } from "../src/puck/PageRoot";
import {
  assembleDocument, assembleStandalone, assembleFragment, retargetHead,
} from "../src/export/export";
import { config } from "../src/puck/config";

const SITE = "https://haraldrevery.com";
const shell = readFileSync(new URL("../shell.html", import.meta.url).pathname, "utf8");

const mk = (over = {}): Data =>
  ({
    root: {
      props: {
        meta: { ...DEFAULT_META, title: "Galdhøpiggen", date: "2025-08-17", ...over },
        hasHero: false,
        hero: DEFAULT_HERO,
      },
    },
    content: [],
  }) as unknown as Data;

const input = (data: Data, slug?: string) => ({
  shell, data, config, siteUrl: SITE, slug,
  heroHtml: "", contentHtml: "<p>body</p>", headerHtml: "<h1>Galdhøpiggen</h1>",
});

describe("retargetHead", () => {
  const head = (extra = "") =>
    `<!DOCTYPE html><html><head><title>Harald Revery - T</title>${extra}` +
    `<link rel="canonical" href="https://haraldrevery.com/page_builder_app_v2/shell">` +
    `<meta property="og:url" content="https://haraldrevery.com/page_builder_app_v2/shell" />` +
    `</head><body>x</body></html>`;

  test("points canonical and og:url at this page", () => {
    const out = retargetHead(head(), `${SITE}/notebook_pages/x`, "");
    expect(out).toContain(`<link rel="canonical" href="${SITE}/notebook_pages/x">`);
    expect(out).toContain(`<meta property="og:url" content="${SITE}/notebook_pages/x" />`);
    expect(out).not.toContain("page_builder_app_v2/shell");
  });

  test("inserts the three description tags after </title> when the shell has none", () => {
    const out = retargetHead(head(), `${SITE}/x`, "A walk up a hill.");
    expect(out).toContain(`<meta name="description" content="A walk up a hill.">`);
    expect(out).toContain(`<meta property="og:description" content="A walk up a hill." />`);
    expect(out).toContain(`<meta name="twitter:description" content="A walk up a hill." />`);
    // Placed where base.njk puts it, not appended somewhere arbitrary.
    expect(out.indexOf("</title>")).toBeLessThan(out.indexOf('name="description"'));
    expect(out.indexOf('name="description"')).toBeLessThan(out.indexOf('rel="canonical"'));
  });

  /*
   * The regression that matters if the shell template ever gains a
   * `description:`. Rewriting in place and inserting are mutually exclusive;
   * doing both would give the page two contradictory descriptions and let a
   * crawler pick either.
   */
  test("rewrites a description the shell already carries instead of adding a second", () => {
    const existing = head(`<meta name="description" content="the shell's own">`);
    const out = retargetHead(existing, `${SITE}/x`, "this page");
    expect(out).toContain(`<meta name="description" content="this page">`);
    expect(out).not.toContain("the shell's own");
    expect(out.match(/name="description"/g)).toHaveLength(1);
  });

  test("leaves the head alone when there is no description to set", () => {
    const out = retargetHead(head(), `${SITE}/x`, "   ");
    expect(out).not.toContain("description");
  });

  /*
   * Every replacement uses a function replacer. With a string replacement a `$&`
   * in a description would splice the matched tag back into its own attribute,
   * and `$1` would splice the capture — the same class of bug the single-pass
   * placeholder substitution in assembleDocument exists to avoid.
   */
  test("a description containing $& or $1 lands verbatim", () => {
    const out = retargetHead(head(), `${SITE}/x`, "cost: $1 and $& more");
    expect(out).toContain(`content="cost: $1 and $&amp; more"`);
  });

  test("escapes quotes and angle brackets rather than breaking out of the attribute", () => {
    const out = retargetHead(head(), `${SITE}/x`, 'she said "hi" <b>');
    expect(out).toContain(`content="she said &quot;hi&quot; &lt;b&gt;"`);
  });
});

describe("assembleStandalone", () => {
  test("is assembleDocument with only the head changed", () => {
    const i = input(mk({ description: "A walk up a hill." }), "galdhopiggen");
    const doc = assembleDocument(i);
    const standalone = assembleStandalone(i);

    // The body — the one render path — is byte-identical.
    const body = (s: string) => s.slice(s.indexOf("</head>"));
    expect(body(standalone)).toBe(body(doc));
    expect(standalone).toContain(assembleFragment(i));
  });

  test("no frozen shell URL survives in the real shell.html", () => {
    const out = assembleStandalone(input(mk(), "galdhopiggen"));
    expect(out).toContain(`href="${SITE}/notebook_pages/galdhopiggen"`);
    expect(out).toContain(`content="${SITE}/notebook_pages/galdhopiggen"`);
    expect(out).not.toContain("page_builder_app_v2/shell");
  });

  /// Same canonical the JSON-LD in the body already claims — two different
  /// canonicals in one document is worse than a stale one.
  test("the head canonical matches the one the body's JSON-LD claims", () => {
    const out = assembleStandalone(input(mk(), "galdhopiggen"));
    expect(out).toContain(`"mainEntityOfPage": "${SITE}/notebook_pages/galdhopiggen"`);
    expect(out).toContain(`<link rel="canonical" href="${SITE}/notebook_pages/galdhopiggen">`);
  });

  test("falls back to the slugified title when no slug is given", () => {
    const out = assembleStandalone(input(mk({ title: "Two Words" })));
    expect(out).toContain(`href="${SITE}/notebook_pages/two-words"`);
  });

  test("still produces a complete document", () => {
    const out = assembleStandalone(input(mk(), "x"));
    expect(out.trimStart().startsWith("<!DOCTYPE html>")).toBe(true);
    expect(out).toContain("</html>");
    // and no placeholder is left behind
    expect(out).not.toMatch(/\{\{[A-Z]+\}\}/);
  });
});
