/*
 * The row id must survive an in-place edit.
 *
 * REGRESSION: typing in a Downloads / Icons / Gallery text field lost focus
 * after EVERY keystroke. The chain was: patch replaces the item with a new
 * object -> the WeakMap keyed on object identity misses -> a fresh id is minted
 * -> that id is the row's React key -> React unmounts and remounts the row,
 * including the <input> being typed into.
 *
 * These assertions cut the chain at its root. useListOps calls no React hooks,
 * so it runs directly here; the drag behaviour it feeds cannot be unit-tested
 * (dnd-kit needs real layout — see listops.test.ts), but the id contract can.
 */
import { describe, expect, test } from "bun:test";
import { itemId, useListOps } from "../src/puck/fields/itemList";

type Item = { label: string; src?: string };

/// Runs useListOps against a mutable cell, the way the editor's onChange does.
const ops = (initial: Item[]) => {
  let items = initial;
  const api = () => useListOps<Item>(items, (next) => { items = next; });
  return { get: () => items, ...{ patch: (i: number, p: Partial<Item>) => api().patch(i, p) },
           move: (i: number, d: number) => api().move(i, d),
           remove: (i: number) => api().remove(i) };
};

describe("row ids survive editing", () => {
  test("patching an item keeps its id — the focus regression", () => {
    const list = ops([{ label: "" }, { label: "b" }]);
    const before = list.get().map(itemId);

    // one keystroke
    list.patch(0, { label: "a" });
    const afterOne = list.get().map(itemId);
    expect(afterOne[0]).toBe(before[0]);
    expect(afterOne[1]).toBe(before[1]);

    // and it must keep holding across a whole typed word, not just once
    for (const ch of "rchive.zip") {
      const cur = list.get()[0].label;
      list.patch(0, { label: cur + ch });
    }
    expect(list.get()[0].label).toBe("archive.zip");
    expect(list.get().map(itemId)[0]).toBe(before[0]);
  });

  test("a genuinely new item still gets a new id", () => {
    const a: Item = { label: "a" };
    const b: Item = { label: "a" }; // same content, different object
    expect(itemId(a)).not.toBe(itemId(b));
  });

  test("move and remove preserve the ids of the items they keep", () => {
    const list = ops([{ label: "a" }, { label: "b" }, { label: "c" }]);
    const [ia, ib, ic] = list.get().map(itemId);

    list.move(0, 1); // a and b swap
    expect(list.get().map(itemId)).toEqual([ib, ia, ic]);

    list.remove(0);
    expect(list.get().map(itemId)).toEqual([ia, ic]);
  });

  test("patching one row does not disturb its neighbours' ids", () => {
    const list = ops([{ label: "a" }, { label: "b" }, { label: "c" }]);
    const before = list.get().map(itemId);
    list.patch(1, { label: "B" });
    expect(list.get().map(itemId)).toEqual(before);
  });
});
