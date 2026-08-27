/*
 * Tree collectors, with emphasis on the visibility rule: a Columns block with
 * count 1 keeps its `right` slot data but does not render it, and Puck's
 * walkTree visits that slot regardless. Counting it would produce lint warnings
 * and JSON-LD entries for markup nobody can see.
 */
import { describe, expect, test } from "bun:test";
import type { Data } from "@measured/puck";
import { config } from "../src/puck/config";
import {
  visitComponents,
  collectStats,
  collectSvgSrcs,
  collectA11yIssues,
} from "../src/export/collect";
import { DEFAULT_HERO } from "../src/puck/PageRoot";

const text = (id: string, md: string) => ({
  type: "Text",
  props: { id, md, animate: false, spacing: "normal" },
});

const gallery = (id: string, items: any[]) => ({
  type: "Gallery",
  props: {
    id, items, layout: "justified", rowHeight: 320, columns: 3,
    aspect: "5/7", group: "g", spacing: "normal",
  },
});

const columns = (id: string, count: 1 | 2, left: any[], right: any[]) => ({
  type: "Columns",
  props: { id, count, verticalAlign: "center", spacing: "normal", left, right },
});

const mk = (content: any[], root: any = {}): Data =>
  ({ root: { props: root }, content }) as unknown as Data;

const img = (n: string, alt = "") => ({
  full: `/photos/${n}.jpg`, thumb: `/photos/${n}_min.jpg`,
  alt, title: "", description: "", w: 100, h: 100,
});

describe("visitComponents", () => {
  test("reaches components nested in column slots", () => {
    const data = mk([columns("c1", 2, [text("L", "left")], [text("R", "right")])]);
    const seen: string[] = [];
    visitComponents(data, config, (c) => seen.push(`${c.type}#${c.props.id}`));
    expect(seen.sort()).toEqual(["Columns#c1", "Text#L", "Text#R"]);
  });

  test("marks a count-1 Columns' right slot as not visible", () => {
    const data = mk([columns("c1", 1, [text("L", "shown")], [text("R", "hidden")])]);
    const vis = new Map<string, boolean>();
    visitComponents(data, config, (c) => vis.set(c.props.id, c.visible));
    expect(vis.get("L")).toBe(true);
    expect(vis.get("R")).toBe(false);
    // still VISITED — the data is there and must not be lost
    expect(vis.has("R")).toBe(true);
  });

  test("does not mutate the data it walks", () => {
    const data = mk([columns("c1", 2, [text("L", "l")], [text("R", "r")])]);
    const before = JSON.stringify(data);
    visitComponents(data, config, () => {});
    expect(JSON.stringify(data)).toBe(before);
  });
});

describe("collectStats", () => {
  test("counts words across Text and Heading", () => {
    const data = mk([
      text("t1", "one two three"),
      { type: "Heading", props: { id: "h1", text: "four five", level: 2, align: "left", animate: false, spacing: "normal" } },
    ]);
    expect(collectStats(data, config).wordCount).toBe(5);
  });

  test("collects gallery images with their pixel dimensions", () => {
    const data = mk([gallery("g1", [img("a", "A"), img("b", "B")])]);
    const s = collectStats(data, config);
    expect(s.images.map((i) => i.src)).toEqual(["/photos/a.jpg", "/photos/b.jpg"]);
    expect(s.images[0]).toMatchObject({ w: 100, h: 100, alt: "A" });
    expect(s.galleryCount).toBe(1);
  });

  test("EXCLUDES content in a hidden count-1 right slot", () => {
    const data = mk([
      columns("c1", 1, [text("L", "one two")], [text("R", "three four five"), gallery("g", [img("z")])]),
    ]);
    const s = collectStats(data, config);
    expect(s.wordCount).toBe(2); // only the left slot
    expect(s.images).toEqual([]); // the hidden gallery contributes nothing
    expect(s.galleryCount).toBe(0);
  });

  test("counts that same content once the column is switched back to 2", () => {
    const data = mk([
      columns("c1", 2, [text("L", "one two")], [text("R", "three four five")]),
    ]);
    expect(collectStats(data, config).wordCount).toBe(5);
  });
});

describe("collectSvgSrcs", () => {
  test("includes the hero svg when the hero is on and showSvg is set", () => {
    const data = mk([], {
      hasHero: true,
      hero: { ...DEFAULT_HERO, showSvg: true, svgSrc: "/svg/logo.svg" },
    });
    expect(collectSvgSrcs(data, config)).toEqual(["/svg/logo.svg"]);
  });

  test("ignores the hero svg when the hero is off", () => {
    const data = mk([], {
      hasHero: false,
      hero: { ...DEFAULT_HERO, showSvg: true, svgSrc: "/svg/logo.svg" },
    });
    expect(collectSvgSrcs(data, config)).toEqual([]);
  });
});

describe("collectA11yIssues", () => {
  test("counts gallery images missing alt text", () => {
    const data = mk([gallery("g1", [img("a", "has alt"), img("b"), img("c", "  ")])]);
    const r = collectA11yIssues(data, config);
    expect(r.totalImages).toBe(3);
    expect(r.missingAlt).toBe(2); // empty and whitespace-only both count
  });

  test("ignores images hidden in a count-1 right slot", () => {
    const data = mk([columns("c1", 1, [], [gallery("g", [img("a"), img("b")])])]);
    expect(collectA11yIssues(data, config).totalImages).toBe(0);
  });
});

describe("collectors handle every block type's real prop shape", () => {
  // Regression guard: collect.ts was written before Image/Svg existed and
  // assumed a flat `full` prop. Image actually stores {full, thumb} as one
  // prop, so images were silently missing from JSON-LD and the alt-text lint.
  const image = (alt: string) => ({
    type: "Image",
    props: { id: "i", image: { full: "/photos/a.jpg", thumb: "/photos/a_min.jpg" }, alt, caption: "", lightbox: true, widthPct: 100, spacing: "normal" },
  });

  test("an Image block contributes to the JSON-LD image list", () => {
    const s = collectStats(mk([image("A")]), config);
    expect(s.images.map((i) => i.src)).toEqual(["/photos/a.jpg"]);
  });

  test("an Image with no alt is flagged", () => {
    const r = collectA11yIssues(mk([image("")]), config);
    expect(r.totalImages).toBe(1);
    expect(r.missingAlt).toBe(1);
  });

  test("an Svg with no alt is flagged (v1 counted these too)", () => {
    const data = mk([{ type: "Svg", props: { id: "s", src: "/svg/a.svg", themed: true, hoverGrow: false, link: "", alt: "", widthPct: 100, spacing: "normal" } }]);
    expect(collectA11yIssues(data, config).missingAlt).toBe(1);
  });

  test("Icons without labels are flagged and their svgs are collected", () => {
    const data = mk([{ type: "Icons", props: { id: "ic", items: [{ src: "/svg/a.svg", label: "", href: "#" }, { src: "/svg/b.svg", label: "O", href: "#" }], size: "medium", label: "", spacing: "normal" } }]);
    expect(collectA11yIssues(data, config).unlabeledIcons).toBe(1);
    expect(collectSvgSrcs(data, config).sort()).toEqual(["/svg/a.svg", "/svg/b.svg"]);
  });

  test("Faq items reach the JSON-LD stats", () => {
    const data = mk([{ type: "Faq", props: { id: "f", items: [{ q: "Q?", a: "A." }], spacing: "normal" } }]);
    expect(collectStats(data, config).faq).toEqual([{ q: "Q?", a: "A." }]);
  });

  test("missing download files are flagged", () => {
    const data = mk([{ type: "Downloads", props: { id: "d", items: [{ src: "/f/a.zip", label: "", size: 0, sha256: "", sha512: "", missing: true }], spacing: "normal" } }]);
    expect(collectA11yIssues(data, config).missingDownloads).toBe(1);
  });
});
