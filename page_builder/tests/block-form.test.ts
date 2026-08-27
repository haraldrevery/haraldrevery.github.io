/*
 * Editor form mounting (needs happy-dom). Covers the shared "Space below"
 * control: that it reaches every top-level block, never reaches column
 * children, and actually writes through to the store.
 */
import { describe, expect, test, beforeEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { BLOCK_TYPES, PROSE_TYPES } from "../src/blocks/defs";
import type { BlockType, ColumnsBlock } from "../src/blocks/model";

// guarded: bun shares one process across test files, and registering twice throws
if (!globalThis.document) GlobalRegistrator.register();
const { renderBlockForm } = await import("../src/ui/blockForms");
const { store } = await import("../src/state");

/// The .field-row wrappers whose label is exactly "Space below".
function spacingRows(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll(".field-row")].filter(
    (r) => r.querySelector("label")?.textContent === "Space below"
  ) as HTMLElement[];
}

/// Which option the markup marks as current. Read the attribute, not
/// select.value / selectedIndex: happy-dom does not recompute those from the
/// `selected` attribute when options are appended (it reports index 1 for
/// everything). Real Gecko honours the attribute — verified in a browser.
function markedOption(row: HTMLElement): string | undefined {
  return [...row.querySelectorAll("option")].find((o) => o.hasAttribute("selected"))
    ?.getAttribute("value") ?? undefined;
}

function mount(type: BlockType): { box: HTMLElement; rows: HTMLElement[] } {
  store.newProject();
  store.addBlock(type); // addBlock selects the block it adds
  const box = document.createElement("div");
  renderBlockForm(box);
  return { box, rows: spacingRows(box) };
}

describe("Space below control", () => {
  beforeEach(() => store.newProject());

  test("reaches every block type except hero", () => {
    for (const t of BLOCK_TYPES) {
      const { rows } = mount(t);
      if (t === "hero") {
        expect(rows.length).toBe(0); // renders outside the content flow
      } else {
        expect(rows.length).toBe(1);
      }
    }
  });

  test("a columns block gets one control, not one per child", () => {
    // columnsForm splices in FORMS[child.type] for both children, so a control
    // added inside the per-type forms would come along three times over.
    const { box, rows } = mount("columns");
    expect((store.selectedBlock as ColumnsBlock).count).toBe(2);
    expect(box.querySelectorAll(".column-editor").length).toBe(2); // children are there
    expect(rows.length).toBe(1); // but only the parent has spacing
  });

  test("defaults to normal and writes the chosen value to the store", () => {
    const { rows } = mount("image");
    expect(markedOption(rows[0])).toBe("normal"); // absent spacing shows as normal
    expect(store.selectedBlock!.spacing).toBeUndefined();

    const sel = rows[0].querySelector("select") as HTMLSelectElement;
    sel.value = "tight";
    sel.dispatchEvent(new Event("change"));
    expect(store.selectedBlock!.spacing).toBe("tight");

    sel.value = "none";
    sel.dispatchEvent(new Event("change"));
    expect(store.selectedBlock!.spacing).toBe("none");
  });

  test("an already-set value is reflected back into the control", () => {
    mount("gallery");
    store.selectedBlock!.spacing = "loose";
    const fresh = document.createElement("div");
    renderBlockForm(fresh);
    expect(markedOption(spacingRows(fresh)[0])).toBe("loose");
  });

  test("only prose types explain the run-grouping caveat", () => {
    for (const t of BLOCK_TYPES) {
      if (t === "hero") continue;
      const { box } = mount(t);
      const hints = [...box.querySelectorAll("p.hint")].map((p) => p.textContent ?? "");
      const hasRunHint = hints.some((h) => h.includes("last text block"));
      expect(hasRunHint).toBe(PROSE_TYPES.has(t));
    }
  });
});
