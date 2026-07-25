/*
 * Project normalization (legacy conversions, columns-as-blocks) and store
 * behaviour (undo/redo, hero pinning, splitIntoColumns).
 */
import { describe, expect, test } from "bun:test";
import { normalizeProject } from "../src/blocks/normalize";
import { store } from "../src/state";
import { newBlock } from "../src/blocks/defs";
import type { ColumnsBlock, GalleryBlock, ImageBlock, ParagraphBlock } from "../src/blocks/model";

describe("normalizeProject", () => {
  test("list -> markdown, blockquote -> markdown", () => {
    const p = normalizeProject({
      blocks: [
        { type: "list", ordered: true, items: ["one", "two"] },
        { type: "blockquote", quote: "Deep", cite: "Someone" },
      ],
    });
    expect(p.blocks[0].type).toBe("paragraph");
    expect((p.blocks[0] as ParagraphBlock).md).toBe("1. one\n2. two");
    expect((p.blocks[1] as ParagraphBlock).md).toStartWith("> Deep");
    expect((p.blocks[1] as ParagraphBlock).md).toContain("*Someone*");
  });

  test("two_column -> columns with real child blocks", () => {
    const p = normalizeProject({
      blocks: [
        {
          type: "two_column",
          media_side: "right",
          media_type: "image",
          full: "/photos/x.jpg",
          thumb: "/photos/x_min.jpg",
          heading: "Old",
          text: "Body",
        },
      ],
    });
    const c = p.blocks[0] as ColumnsBlock;
    expect(c.type).toBe("columns");
    expect(c.columns[0].type).toBe("paragraph");
    expect((c.columns[0] as ParagraphBlock).md).toStartWith("## Old");
    expect(c.columns[1].type).toBe("image");
    expect((c.columns[1] as ImageBlock).full).toBe("/photos/x.jpg");
    expect(c.columns[0].id).toBeTruthy();
  });

  test("old column kinds map to block types (markdown->paragraph, grid->gallery)", () => {
    const p = normalizeProject({
      blocks: [
        {
          type: "columns",
          count: 2,
          columns: [
            { kind: "markdown", md: "hello" },
            { kind: "grid", layout: "justified", rowHeight: 240, items: [{ full: "/a.jpg", thumb: "/a.jpg", alt: "", title: "", description: "" }] },
          ],
        },
      ],
    });
    const c = p.blocks[0] as ColumnsBlock;
    expect(c.columns[0].type).toBe("paragraph");
    expect((c.columns[0] as ParagraphBlock).md).toBe("hello");
    expect(c.columns[1].type).toBe("gallery");
    expect((c.columns[1] as GalleryBlock).items.length).toBe(1);
  });

  test("non-embeddable / garbage children fall back to paragraph", () => {
    const p = normalizeProject({
      blocks: [{ type: "columns", count: 2, columns: [{ type: "hero" }, null] }],
    });
    const c = p.blocks[0] as ColumnsBlock;
    expect(c.columns[0].type).toBe("paragraph");
    expect(c.columns[1].type).toBe("paragraph");
  });

  test("heroes are pinned to the front", () => {
    const p = normalizeProject({
      blocks: [{ type: "paragraph", md: "x" }, { type: "hero", title: "H" }],
    });
    expect(p.blocks[0].type).toBe("hero");
  });

  test("a valid spacing survives, a bad one is dropped back to the default", () => {
    const p = normalizeProject({
      blocks: [
        { type: "image", full: "a", spacing: "tight" },
        { type: "image", full: "b", spacing: "enormous" },
        { type: "image", full: "c", spacing: 42 },
        { type: "image", full: "d", spacing: null },
        { type: "image", full: "e" },
      ],
    });
    expect(p.blocks.map((b) => b.spacing)).toEqual([
      "tight",
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  test("column children get the spacing clamp too", () => {
    const p = normalizeProject({
      blocks: [
        {
          type: "columns",
          count: 2,
          columns: [
            { type: "image", full: "a", spacing: "loose" },
            { type: "image", full: "b", spacing: "wat" },
          ],
        },
      ],
    });
    const cols = (p.blocks[0] as ColumnsBlock).columns;
    expect(cols[0].spacing).toBe("loose"); // valid: kept (renderer ignores it)
    expect(cols[1].spacing).toBeUndefined();
  });
});

describe("store", () => {
  test("undo/redo with redo cleared by a new edit", () => {
    store.newProject();
    store.addBlock("heading");
    store.addBlock("paragraph");
    expect(store.blocks.length).toBe(2);
    store.undo();
    expect(store.blocks.length).toBe(1);
    store.redo();
    expect(store.blocks.length).toBe(2);
    store.undo();
    store.addBlock("hr"); // must clear redo
    store.redo();
    expect(store.blocks.map((b) => b.type)).toEqual(["heading", "hr"]);
  });

  test("hero pins to index 0; other blocks can't move above it", () => {
    store.newProject();
    store.addBlock("paragraph");
    store.addBlock("hero");
    expect(store.blocks[0].type).toBe("hero");
    const para = store.blocks[1];
    store.moveBlock(para.id, -1);
    expect(store.blocks[0].type).toBe("hero");
    store.reorderBlock(para.id, 0);
    expect(store.blocks[0].type).toBe("hero");
  });

  test("splitIntoColumns wraps an embeddable block", () => {
    store.newProject();
    const b = store.addBlock("image");
    store.splitIntoColumns(b.id);
    expect(store.blocks.length).toBe(1);
    const col = store.blocks[0] as ColumnsBlock;
    expect(col.type).toBe("columns");
    expect(col.columns[0].id).toBe(b.id);
    expect(col.columns[1].type).toBe("paragraph");
    expect(store.selectedId).toBe(col.id);
    // undo restores the original block
    store.undo();
    expect(store.blocks[0].id).toBe(b.id);
  });

  test("splitIntoColumns refuses non-embeddable blocks", () => {
    store.newProject();
    const h = store.addBlock("hero");
    store.splitIntoColumns(h.id);
    expect(store.blocks[0].type).toBe("hero");
  });

  test("reorderGalleryItem moves items (preview drag-drop semantics)", () => {
    store.newProject();
    const g = store.addBlock("gallery") as GalleryBlock;
    const mk = (n: string) => ({ full: n, thumb: n, alt: "", title: "", description: "" });
    store.mutateStructure(() => g.items.push(mk("a"), mk("b"), mk("c")));
    // drag "a" (0) to after "c" (gap index 3)
    store.reorderGalleryItem(g.id, 0, 3);
    expect(g.items.map((i) => i.full)).toEqual(["b", "c", "a"]);
    // drag "a" (2) back before "b" (gap 0)
    store.reorderGalleryItem(g.id, 2, 0);
    expect(g.items.map((i) => i.full)).toEqual(["a", "b", "c"]);
    // no-op drop on itself
    store.reorderGalleryItem(g.id, 1, 1);
    expect(g.items.map((i) => i.full)).toEqual(["a", "b", "c"]);
    // undo restores the order before the last drag (re-read from the store —
    // undo swaps the whole project object)
    store.undo();
    const restored = store.blocks[0] as GalleryBlock;
    expect(restored.items.map((i) => i.full)).toEqual(["b", "c", "a"]);
  });

  test("reorderGalleryItem finds galleries inside columns too", () => {
    store.newProject();
    const col = store.addBlock("columns") as ColumnsBlock;
    const g = newBlock("gallery") as GalleryBlock;
    store.mutateStructure(() => {
      col.columns[0] = g;
      g.items.push(
        { full: "x", thumb: "x", alt: "", title: "", description: "" },
        { full: "y", thumb: "y", alt: "", title: "", description: "" }
      );
    });
    store.reorderGalleryItem(g.id, 0, 2);
    expect(g.items.map((i) => i.full)).toEqual(["y", "x"]);
  });
});

describe("undo/redo safety", () => {
  test("redo after opening another project does not resurrect the old one", () => {
    // Regression: loadProject cleared undoStack but not redoStack, so a redo
    // pasted project A's content under project B's name — and the next Ctrl+S
    // wrote A over B's file.
    store.newProject();
    store.meta.title = "PROJECT-A";
    store.mutateStructure(() => store.blocks.push(newBlock("paragraph")));
    store.undo(); // redoStack now holds A

    store.loadProject("B", {
      version: 1,
      meta: { ...store.meta, title: "PROJECT-B" },
      blocks: [],
    } as never);

    store.redo();
    expect(store.projectName).toBe("B");
    expect(store.meta.title).toBe("PROJECT-B"); // must NOT be PROJECT-A
    expect(store.dirty).toBe(false); // a no-op redo must not mark the file dirty
  });

  test("undo back to the saved state reports clean, not dirty", () => {
    // restore() forced dirty=true unconditionally, so undoing to exactly the
    // last-saved state still armed the quit/open confirmations.
    store.newProject();
    expect(store.dirty).toBe(false);
    store.mutateStructure(() => store.blocks.push(newBlock("paragraph")));
    expect(store.dirty).toBe(true);
    store.undo();
    expect(store.blocks.length).toBe(0);
    expect(store.dirty).toBe(false);
  });

  test("redo back to an edited state reports dirty again", () => {
    store.newProject();
    store.mutateStructure(() => store.blocks.push(newBlock("paragraph")));
    store.undo();
    store.redo();
    expect(store.blocks.length).toBe(1);
    expect(store.dirty).toBe(true);
  });

  test("rev advances on every mutation so a save can detect edits during the write", () => {
    store.newProject();
    const before = store.rev;
    store.mutateContent(() => (store.meta.title = "x"));
    expect(store.rev).toBeGreaterThan(before);
  });
});
