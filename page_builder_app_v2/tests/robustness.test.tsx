/*
 * Every block type must survive the props it ACTUALLY receives in the app, not
 * just the fully-populated ones the other suites use.
 *
 * This exists because a real crash shipped: Puck's array field appends a BLANK
 * item when `defaultItemProps` is missing, and Faq read `.trim()` on it. 118
 * green tests missed it, because every one of them passed complete props.
 */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Render } from "@measured/puck/rsc";
import type { Data } from "@measured/puck";
import { config, type Components } from "../src/puck/config";
import { contentConfig } from "../src/puck/contentConfig";

type BlockType = keyof Components;
const TYPES = Object.keys(config.components) as BlockType[];

const render = (content: any[], root: any = {}) =>
  renderToStaticMarkup(
    <Render config={contentConfig} data={{ root: { props: root }, content } as unknown as Data} />,
  );

describe("a freshly dropped block never crashes", () => {
  for (const type of TYPES) {
    test(type, () => {
      const props = { ...(config.components[type].defaultProps as object), id: `${type}-1` };
      expect(() => render([{ type, props }])).not.toThrow();
    });
  }
});

describe("array fields declare defaults for the items they append", () => {
  // Puck appends `defaultItemProps` — or a blank object when it is absent,
  // which is what broke Faq.
  for (const type of TYPES) {
    const fields = (config.components[type].fields ?? {}) as Record<string, any>;
    for (const [name, field] of Object.entries(fields)) {
      if (field?.type !== "array") continue;
      test(`${type}.${name}`, () => {
        expect(field.defaultItemProps).toBeDefined();
        // and every sub-field must have a default, or the same hole reopens
        for (const sub of Object.keys(field.arrayFields ?? {})) {
          expect(field.defaultItemProps).toHaveProperty(sub);
        }
      });
    }
  }
});

describe("blocks tolerate malformed item data", () => {
  // Hand-edited project files and older saves can be missing any field.
  const itemBlocks: [BlockType, any[]][] = [
    ["Faq", [{}, { q: "only q" }, { a: "only a" }]],
    ["Icons", [{}, { src: "/svg/a.svg" }]],
    ["Downloads", [{}, { src: "/f/a.zip" }]],
    ["Gallery", [{}, { full: "/photos/a.jpg" }]],
  ];
  for (const [type, items] of itemBlocks) {
    test(type, () => {
      const props = { ...(config.components[type].defaultProps as object), items, id: type };
      expect(() => render([{ type, props }])).not.toThrow();
    });
  }
});

describe("the root tolerates missing props", () => {
  for (const [name, root] of [
    ["empty root", {}],
    ["hero on, no hero object", { hasHero: true }],
    ["hero on, empty hero object", { hasHero: true, hero: {} }],
    ["meta with no fields", { meta: {} }],
  ] as [string, any][]) {
    test(name, () => {
      expect(() => render([], root)).not.toThrow();
    });
  }
});

describe("unconfigured media blocks publish nothing, not a broken player", () => {
  // React drops an empty src attribute but still leaves `<video><source></video>`
  // or `<audio></audio>` on the page — a control widget for a file that does not
  // exist. v1 shipped exactly that.
  for (const type of ["Video", "Audio", "Svg", "Image"] as BlockType[]) {
    test(type, () => {
      const props = { ...(config.components[type].defaultProps as object), id: type };
      const out = render([{ type, props }]);
      expect(out).toBe("");
    });
  }

  test("but they still render once a file is set", () => {
    const out = render([
      { type: "Video", props: { ...(config.components.Video.defaultProps as object), src: "/v/a.mp4", id: "v" } },
    ]);
    expect(out).toContain("<video");
    expect(out).toContain('src="/v/a.mp4"');
  });

  test("no block emits an empty src or href", () => {
    for (const type of TYPES) {
      const props = { ...(config.components[type].defaultProps as object), id: type };
      const out = render([{ type, props }]);
      expect(out).not.toContain('src=""');
      expect(out).not.toContain('href=""');
    }
  });
});
