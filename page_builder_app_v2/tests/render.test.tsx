/*
 * Renderer suite — the port of v1's tests/render.test.ts onto Puck components
 * rendered through renderToStaticMarkup. Pure: no DOM, no happy-dom.
 *
 * The load-bearing test here is "class coverage". There is no CSS build on
 * export, so the renderer may only emit Tailwind utilities that already exist
 * in the compiled main.css/prose.css. This test greps the REAL committed CSS,
 * which is what stops a plausible-looking `mb-24` or `aspect-[1/1]` from
 * shipping as an invisible no-op. Keep it green.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { renderToStaticMarkup } from "react-dom/server";
import { Render } from "@measured/puck/rsc";
import type { Data } from "@measured/puck";
import { config, type Components } from "../src/puck/config";
import { contentConfig } from "../src/puck/contentConfig";
import { Text } from "../src/puck/components/Text";

// tests/ sits at the same depth as v1's, so this still resolves to the repo root.
const REPO = new URL("../..", import.meta.url).pathname;
const css = readFileSync(`${REPO}/main.css`, "utf8") + readFileSync(`${REPO}/prose.css`, "utf8");

type BlockType = keyof Components;
const BLOCK_TYPES = Object.keys(config.components) as BlockType[];

/// A representative, fully-populated component of every type — the analogue of
/// v1's sample() at tests/render.test.ts:30.
function sample(type: BlockType) {
  const defaults = config.components[type].defaultProps ?? {};
  const img = { full: "/photos/a.jpg", thumb: "/photos/a_min.jpg", alt: "a", title: "t", description: "d", w: 4032, h: 3024 };
  const over: Record<string, unknown> =
    ({
      Heading: { text: "Head", align: "center" },
      Text: { md: "Some **bold** and $x^2$" },
      Gallery: { items: [img] },
      Image: { image: { full: img.full, thumb: img.thumb }, alt: "a", caption: "c" },
      Svg: { src: "/svg/test.svg", alt: "s" },
      Video: { src: "/video/a.mp4", poster: "/photos/a.jpg", caption: "c" },
      Audio: { src: "/audio/a.mp3", title: "T" },
      Icons: { items: [{ src: "/svg/test.svg", label: "L", href: "https://example.com" }], label: "Listen" },
      Faq: { items: [{ q: "Q?", a: "A." }] },
      Downloads: { items: [{ src: "/files/a.zip", label: "A", size: 1234567, sha256: "abc", sha512: "def" }] },
      Raw: { html: "<p>raw</p>" },
    } as Record<string, Record<string, unknown>>)[type] ?? {};
  return { type, props: { ...defaults, ...over, id: `${type}-1` } };
}

/// Renders through contentConfig (passthrough root), because these tests assert
/// on the markup that goes into shell.html's {{CONTENT}} slot — PageRoot's
/// bg-topology-map / page-container chrome comes from the shell, not from here.
function html(content: ReturnType<typeof sample>[]): string {
  const data = { root: { props: {} }, content } as unknown as Data;
  return renderToStaticMarkup(<Render config={contentConfig} data={data} />);
}

describe("class coverage", () => {
  test("every emitted class exists in main.css/prose.css", () => {
    const all = html(BLOCK_TYPES.map(sample));

    const classes = new Set<string>();
    // React emits double-quoted class="..." for className, so v1's regex works
    // unchanged.
    for (const m of all.matchAll(/class="([^"]+)"/g)) {
      for (const c of m[1].split(/\s+/)) if (c) classes.add(c);
    }

    // glightbox = JS selector; katex/custom come from the markdown pipeline /
    // raw block content; faq-item is a pure selector anchor (no CSS rule).
    const skip = new Set(["glightbox", "katex", "custom", "faq-item"]);
    const esc = (c: string) => c.replace(/([:\/\[\].])/g, "\\$1");
    const missing = [...classes].filter((c) => !skip.has(c) && !css.includes("." + esc(c)));
    expect(missing).toEqual([]);
  });

  test("the guard actually fires on a class that is not in the CSS", () => {
    // Proves the test above can fail rather than vacuously passing. These read
    // as obviously valid Tailwind and are absent from the compiled bundles.
    //
    // NB: v1's comments naming the unavailable classes are now STALE. mb-0 and
    // mb-24 (blocks/render.ts:84-85) and aspect-[1/1] (blocks/model.ts:18-20)
    // are all present in the current compiled CSS — the bundles grew after
    // those comments were written. BlockShell still drops the class attribute
    // for spacing "none" rather than emitting mb-0, but the reason is output
    // stability (every committed page has a bare <section>), not availability.
    for (const c of ["mb-72", "text-9xl"]) {
      const esc = c.replace(/([:\/\[\].])/g, "\\$1");
      expect(css.includes("." + esc)).toBe(false);
    }
    expect(css.includes(".mb-16")).toBe(true);
  });
});

describe("vertical spacing", () => {
  // Every top-level block owns exactly one gap: the margin below it. Mixing
  // padding in (v1's columns once used py-12) made gaps non-collapsible and
  // therefore order-dependent — image->columns was 112px but columns->image
  // was 48px.
  //
  // Iterating the registry (not a fixed list) is the point: a future block type
  // that wraps itself in padding or an off-scale margin fails here rather than
  // passing every test and quietly reintroducing order-dependent gaps.
  test("every block type defaults to exactly one mb-16 and no top spacing", () => {
    for (const t of BLOCK_TYPES) {
      const out = html([sample(t)]);
      const open = out.slice(0, out.indexOf(">") + 1);
      expect(open).toContain("mb-16");
      for (const c of ["py-", "pt-", "pb-", "mt-", "mb-8", "mb-12", "mb-20"]) {
        expect(open).not.toContain(c);
      }
    }
  });

  test('spacing "none" drops the gap class rather than emitting mb-0', () => {
    // Prose blocks wrap in <article>, non-prose in <section> — verified against
    // v1's renderer in prose-parity.test.tsx.
    const out = html([{ type: "Heading", props: { ...sample("Heading").props, spacing: "none" } }]);
    expect(out).not.toContain("mb-0");
    expect(out).toContain('<article class="prose dark:prose-invert max-w-none">');
  });
});

describe("export output", () => {
  test("carries no editor attributes", () => {
    const out = html(BLOCK_TYPES.map(sample));
    expect(out).not.toContain("data-puck");
    expect(out).not.toContain("data-pb-");
  });
});

describe("empty-state hints are editor-only", () => {
  // EmptyHint makes a freshly-dropped block visible in the editor. It renders
  // on `puck.isEditing`, which the rsc Render used for export sets to false —
  // but that is exactly the kind of thing that silently regresses, so assert it.
  test("an empty Text block emits no hint on the export path", () => {
    const out = html([{ type: "Text", props: { id: "t", md: "", animate: false, spacing: "normal" } }]);
    expect(out).not.toContain("pb-empty-hint");
    expect(out).not.toContain("sidebar");
    // still the empty prose article, exactly as before
    expect(out).toContain('<article class="prose dark:prose-invert max-w-none mb-16">');
  });

  test("an empty Gallery emits no hint on the export path", () => {
    const out = html([{
      type: "Gallery",
      props: { id: "g", items: [], layout: "justified", rowHeight: 320, columns: 3, aspect: "5/7", group: "g", spacing: "normal" },
    }]);
    expect(out).not.toContain("pb-empty-hint");
    expect(out).toContain('<div class="flex flex-wrap gap-2">');
  });

  test("the hint DOES render when isEditing is true", () => {
    // Proves the test above is not vacuous.
    const editing = renderToStaticMarkup(
      <Text md="" animate={false} spacing="normal" id="t" puck={{ isEditing: true } as any} />,
    );
    expect(editing).toContain("pb-empty-hint");
  });
});
