/*
 * Regressions from the 2026-08 bug hunt. One describe per defect, each named
 * for the symptom rather than the fix, so a failure says what broke for the user.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import type { Data } from "@measured/puck";
import { config } from "../src/puck/config";
import { DEFAULT_HERO, DEFAULT_META } from "../src/puck/PageRoot";
import {
  exportText, frontmatterYaml, splitTags, isIsoDate, assembleDocument,
} from "../src/export/export";
import { renderExportContent, renderExportHero, renderExportHeader } from "../src/export/renderExport";
import { humanDate } from "../src/export/export";
import { lintPage } from "../src/export/lint";
import { runPageCheck } from "../src/app/PageCheck";
import { wrapHtmlWords } from "../src/blocks/wordAnimate";
import { prepareSvgForInline, setSvgText } from "../src/blocks/svgStore";
import { sameOrder, moveTo } from "../src/puck/fields/listOps";
import { liveValue, settledValue } from "../src/puck/fields/numberOps";

const SITE = "https://haraldrevery.com";
const shell = readFileSync(new URL("../shell.html", import.meta.url).pathname, "utf8");

const mk = (content: any[] = [], root: any = {}): Data =>
  ({ root: { props: root }, content }) as unknown as Data;

const fullExport = (data: Data) =>
  exportText({
    shell, data, config, siteUrl: SITE, slug: "x",
    heroHtml: renderExportHero(data),
    headerHtml: renderExportHeader(data, humanDate),
    contentHtml: renderExportContent(data),
  });

const lint = (data: Data) => lintPage({ data, config, html: "" }).map((i) => i.message);

// ---------------------------------------------------------------------------

describe("a brand-new page can be previewed and exported", () => {
  /// App.tsx's EMPTY — what liveData.current holds until Puck's first onChange.
  /// Clicking Preview or Export before touching anything threw
  /// "undefined is not an object (evaluating 'tags.split')" and did nothing.
  const EMPTY: Data = { root: { props: {} }, content: [] } as unknown as Data;

  test("exportText does not throw on root.props = {}", () => {
    expect(() => fullExport(EMPTY)).not.toThrow();
    expect(fullExport(EMPTY)).toContain("<!DOCTYPE html>");
  });

  test("splitTags tolerates undefined and null", () => {
    expect(splitTags(undefined)).toEqual([]);
    expect(splitTags(null)).toEqual([]);
    expect(splitTags("a, b")).toEqual(["a", "b"]);
  });

  test("a project file with a partial meta still exports", () => {
    const partial = mk([], { meta: { title: "T" } });
    expect(() => fullExport(partial)).not.toThrow();
  });
});

describe("the date can never break the Eleventy build", () => {
  const fm = (date: string) => frontmatterYaml({ ...DEFAULT_META, title: "T", date });

  test("a valid ISO date stays bare, byte-compatible with the committed pages", () => {
    expect(fm("2025-08-17")).toContain("\ndate: 2025-08-17\n");
  });

  test("a date containing ':' is quoted — bare, gray-matter throws on it", () => {
    // The failure this prevents is total: gray-matter throws while parsing the
    // front matter, so the whole site build stops.
    expect(fm("Aug 17: summit")).toContain('\ndate: "Aug 17: summit"\n');
  });

  test("an empty date stays empty rather than becoming a quoted empty string", () => {
    expect(fm("")).toContain("\ndate: \n");
  });

  test("the page check flags a missing or malformed date", () => {
    expect(lint(mk([], { meta: { ...DEFAULT_META, title: "T" } })).join(" ")).toContain("No date");
    expect(
      lint(mk([], { meta: { ...DEFAULT_META, title: "T", date: "17/08/2025" } })).join(" "),
    ).toContain("not YYYY-MM-DD");
    expect(
      lint(mk([], { meta: { ...DEFAULT_META, title: "T", date: "2025-08-17" } })).join(" "),
    ).not.toContain("date");
  });

  test("isIsoDate accepts only the shape humanDate can format", () => {
    expect(isIsoDate("2025-08-17")).toBe(true);
    expect(isIsoDate("2025-8-17")).toBe(false);
    expect(isIsoDate("")).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });
});

describe("an unreadable SVG is caught before it is published", () => {
  test("the page check warns instead of letting the placeholder ship", () => {
    const data = mk([
      { type: "Svg", props: { id: "s1", src: "/svg/missing.svg", themed: true, alt: "a", widthPct: 100, spacing: "normal" } },
    ]);
    expect(lint(data).join(" ")).toContain("could not be read");
  });

  test("a readable one is silent", () => {
    setSvgText("/svg/present.svg", "<svg viewBox='0 0 1 1'></svg>");
    const data = mk([
      { type: "Svg", props: { id: "s1", src: "/svg/present.svg", themed: true, alt: "a", widthPct: 100, spacing: "normal" } },
    ]);
    expect(lint(data).join(" ")).not.toContain("could not be read");
  });

  test("a hero SVG is covered too", () => {
    const data = mk([], {
      meta: { ...DEFAULT_META, title: "T", date: "2025-08-17" },
      hasHero: true,
      hero: { ...DEFAULT_HERO, showSvg: true, svgSrc: "/svg/also-missing.svg" },
    });
    expect(lint(data).join(" ")).toContain("could not be read");
  });
});

describe("word animation leaves HTML comments intact", () => {
  test("a comment containing '>' is not torn apart", () => {
    const out = wrapHtmlWords("<p>hi</p><!-- a > b --><p>bye</p>", "s");
    // The whole comment survives verbatim, so "-->" cannot leak into the page
    // as visible text inside a word_animation span.
    expect(out).toContain("<!-- a > b -->");
    expect(out).not.toMatch(/<span[^>]*>-->/);
  });

  test("ordinary comments and real tags still behave", () => {
    expect(wrapHtmlWords("<!-- plain -->", "s")).toBe("<!-- plain -->");
    expect(wrapHtmlWords("<p>one</p>", "s")).toContain('class="word_animation"');
    // unterminated comment: emit the rest verbatim rather than wrapping it
    expect(wrapHtmlWords("<p>a</p><!-- oops", "s")).toContain("<!-- oops");
  });
});

describe("inlined SVGs always get their sizing style", () => {
  test("a single-quoted style attribute is extended, not duplicated", () => {
    const out = prepareSvgForInline(`<svg style='fill:red' viewBox="0 0 1 1"></svg>`);
    expect(out.match(/style\s*=/g)).toHaveLength(1);
    expect(out).toContain("width:100%;height:auto");
  });

  test("double-quoted and absent styles are unchanged in behaviour", () => {
    expect(prepareSvgForInline(`<svg style="fill:red"></svg>`)).toContain(
      'style="fill:red;width:100%;height:auto"',
    );
    expect(prepareSvgForInline(`<svg viewBox="0 0 1 1"></svg>`)).toContain(
      'style="width:100%;height:auto"',
    );
  });
});

describe("dragging a row away and back is not an undo step", () => {
  test("sameOrder sees through the fresh arrays every drag-over creates", () => {
    const items = [{ n: 1 }, { n: 2 }, { n: 3 }];
    const roundTrip = moveTo(moveTo(items, 0, 1), 1, 0);
    expect(roundTrip).not.toBe(items); // a different object …
    expect(sameOrder(roundTrip, items)).toBe(true); // … holding the same order
  });
});

describe("a gallery's target row height can be typed, not just stepped", () => {
  /*
   * Puck's own number field rejects an out-of-range keystroke by not calling
   * onChange, which on a controlled input erases it. With min 60 that froze the
   * field completely — every first digit is below 60, so no multi-digit number
   * was reachable and the spinner buttons were the only way to change it.
   */
  const MIN = 60, MAX = 900;

  test("every prefix of 320 survives on the way to 320", () => {
    // The old field died on the first of these. null means "held in the box",
    // which is the pass condition — what must NOT happen is a clamp to 60.
    expect(liveValue("3", MIN, MAX)).toBeNull();
    expect(liveValue("32", MIN, MAX)).toBeNull();
    expect(liveValue("320", MIN, MAX)).toBe(320);
  });

  test("a legal value publishes immediately, so the spinners still commit", () => {
    expect(liveValue("321", MIN, MAX)).toBe(321);
    expect(liveValue("60", MIN, MAX)).toBe(60);
    expect(liveValue("900", MIN, MAX)).toBe(900);
  });

  test("out of range is held while typing and clamped on leaving", () => {
    expect(liveValue("9999", MIN, MAX)).toBeNull();
    expect(settledValue("9999", MIN, MAX)).toBe(MAX);
    expect(settledValue("1", MIN, MAX)).toBe(MIN);
  });

  test("an emptied box reverts instead of becoming 0 or the minimum", () => {
    expect(settledValue("", MIN, MAX)).toBeNull();
    expect(settledValue("   ", MIN, MAX)).toBeNull();
    expect(settledValue("abc", MIN, MAX)).toBeNull();
  });

  test("an unbounded field still accepts a negative offset", () => {
    // The hero's SVG offsets have no min/max and were never broken; they must
    // keep working now that they route through the same code.
    expect(liveValue("-40")).toBe(-40);
    expect(settledValue("-40")).toBe(-40);
  });
});

describe("the page check still checks the same things after debouncing", () => {
  /// runPageCheck is the body the debounced component calls. Extracting it must
  /// not have changed what the panel reports, and it must still swallow a throw
  /// rather than taking the sidebar down with it.
  test("it agrees with calling lintPage directly", () => {
    const data = mk([{ type: "Text", props: { id: "t", md: "Body.", animate: false, spacing: "normal" } }], {
      meta: { ...DEFAULT_META, title: "T" },
    });
    const direct = lintPage({
      data, config,
      html: [
        renderExportHero(data),
        renderExportHeader(data, humanDate),
        renderExportContent(data),
      ].join("\n"),
    });
    expect(runPageCheck(data)).toEqual(direct);
  });

  test("a throw becomes a warning rather than an exception", () => {
    // A corrupted project file: `items` is not an array, so the gallery's .map
    // throws inside the renderer. (An unknown component TYPE does not throw —
    // Puck skips it — so it would not exercise the guard.)
    const broken = mk([
      { type: "Gallery", props: { id: "g", items: 5, layout: "justified", rowHeight: 320, columns: 3, aspect: "5/7", group: "g", spacing: "normal" } },
    ]);
    const issues = runPageCheck(broken);
    expect(issues.some((i) => i.message.startsWith("Page check failed:"))).toBe(true);
  });

  test("it runs on a brand-new page without throwing", () => {
    expect(() => runPageCheck({ root: { props: {} }, content: [] } as unknown as Data)).not.toThrow();
  });
});

describe("assembleDocument leaves nothing unsubstituted", () => {
  test("even for a page with no meta at all", () => {
    const out = assembleDocument({
      shell, data: mk(), config, siteUrl: SITE, slug: "x", heroHtml: "", contentHtml: "",
    });
    expect(out).not.toMatch(/\{\{\w+\}\}/);
  });
});
