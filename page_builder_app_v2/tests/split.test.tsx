/*
 * "Split into columns" — the transform that moves a top-level block into a new
 * 2-column Columns block.
 *
 * The assertions that matter are about the PUBLISHED markup, not the shape of
 * the data: a split must produce exactly the page a hand-built Columns block
 * would, and must never be offered where it would damage the block.
 */
import { describe, expect, test } from "bun:test";
import type { Data } from "@measured/puck";
import { config } from "../src/puck/config";
import { canSplit, splitIntoColumns, newColumnsId } from "../src/puck/splitColumns";
import { renderExportContent } from "../src/export/renderExport";
import { visitComponents } from "../src/export/collect";

const mk = (content: any[]): Data => ({ root: { props: {} }, content }) as unknown as Data;

const text = (id: string, md = "Body.", spacing = "normal") => ({
  type: "Text",
  props: { id, md, animate: false, spacing },
});

// A deterministic id, so a diff of the output is readable.
let n = 0;
const stubId = () => `Columns-test-${++n}`;

describe("splitting a block into columns", () => {
  test("the block moves into the left slot, keeping its id and props", () => {
    const out = splitIntoColumns(mk([text("t1")]), "t1", stubId)!;
    expect(out).not.toBeNull();
    const [block] = out.content as any[];
    expect(block.type).toBe("Columns");
    expect(block.props.count).toBe(2);
    expect(block.props.left).toHaveLength(1);
    expect(block.props.left[0]).toEqual(text("t1"));
    expect(block.props.right).toEqual([]);
  });

  test("it publishes the same markup a hand-built Columns block would", () => {
    const split = splitIntoColumns(mk([text("t1")]), "t1", stubId)!;
    const byHand = mk([
      {
        type: "Columns",
        props: {
          id: "Columns-test-x", count: 2, verticalAlign: "center",
          left: [text("t1")], right: [], spacing: "normal",
        },
      },
    ]);
    expect(renderExportContent(split)).toBe(renderExportContent(byHand));
  });

  test("the split block renders in its NESTED shape, not its top-level one", () => {
    const html = renderExportContent(splitIntoColumns(mk([text("t1")]), "t1", stubId)!);
    // nested prose is a <div> with no gap class; the <article class="… mb-16">
    // of a top-level Text block must be gone.
    expect(html).toContain('<div class="prose dark:prose-invert max-w-none">');
    expect(html).not.toContain("<article");
    expect(html).toContain("md:grid-cols-2");
  });

  test("the page's vertical rhythm survives — the gap moves to the Columns", () => {
    const out = splitIntoColumns(mk([text("t1", "Body.", "loose")]), "t1", stubId)!;
    expect((out.content as any[])[0].props.spacing).toBe("loose");
  });

  test("the content is still visible to the page check and JSON-LD", () => {
    const out = splitIntoColumns(mk([text("t1", "Some words here.")]), "t1", stubId)!;
    const seen: { type: string; visible: boolean }[] = [];
    visitComponents(out, config as any, (c) => seen.push({ type: c.type, visible: c.visible }));
    expect(seen).toContainEqual({ type: "Text", visible: true });
  });

  test("neighbours keep their order and are untouched", () => {
    const out = splitIntoColumns(mk([text("a"), text("b"), text("c")]), "b", stubId)!;
    const types = (out.content as any[]).map((c) => c.type);
    expect(types).toEqual(["Text", "Columns", "Text"]);
    expect((out.content as any[])[0]).toEqual(text("a"));
    expect((out.content as any[])[2]).toEqual(text("c"));
  });

  test("the source data is not mutated", () => {
    const before = mk([text("t1")]);
    const snapshot = JSON.stringify(before);
    splitIntoColumns(before, "t1", stubId);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("splitting is refused where it would damage the page", () => {
  test("a block that is not embeddable cannot be split", () => {
    // Featured is the dangerous one: nested, BlockShell emits no wrapper, so
    // the card class and the whole overlapping grid would silently vanish.
    for (const type of ["Featured", "Divider", "Downloads"]) {
      const data = mk([{ type, props: { id: "x", spacing: "normal" } }]);
      expect(canSplit(data, "x")).toBe(false);
      expect(splitIntoColumns(data, "x", stubId)).toBeNull();
    }
  });

  test("a Columns block cannot be split — that would nest columns in columns", () => {
    const data = mk([
      { type: "Columns", props: { id: "c1", count: 2, verticalAlign: "center", left: [], right: [], spacing: "normal" } },
    ]);
    expect(canSplit(data, "c1")).toBe(false);
    expect(splitIntoColumns(data, "c1", stubId)).toBeNull();
  });

  test("a block already inside a column cannot be split", () => {
    const data = mk([
      {
        type: "Columns",
        props: {
          id: "c1", count: 2, verticalAlign: "center",
          left: [text("inner")], right: [], spacing: "normal",
        },
      },
    ]);
    // `inner` is real content, but it is not top level — the search must not
    // reach into slots, or splitting it would build a Columns inside a Columns.
    expect(canSplit(data, "inner")).toBe(false);
    expect(splitIntoColumns(data, "inner", stubId)).toBeNull();
  });

  test("an unknown or absent id is refused rather than throwing", () => {
    const data = mk([text("t1")]);
    expect(canSplit(data, "nope")).toBe(false);
    expect(canSplit(data, undefined)).toBe(false);
    expect(splitIntoColumns(data, "nope", stubId)).toBeNull();
  });

  test("an empty page is refused rather than throwing", () => {
    expect(canSplit(mk([]), "t1")).toBe(false);
    expect(() => splitIntoColumns({ root: { props: {} } } as unknown as Data, "t1", stubId)).not.toThrow();
  });
});

describe("the generated Columns id", () => {
  test("matches Puck's own shape and is unique", () => {
    const a = newColumnsId(), b = newColumnsId();
    expect(a).toMatch(/^Columns-[0-9a-f-]{36}$/);
    expect(a).not.toBe(b);
  });
});
