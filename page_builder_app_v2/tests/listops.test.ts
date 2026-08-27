/*
 * The pure ordering logic behind the sidebar item editors.
 *
 * This is where the coverage for drag-and-drop lives. The drag itself cannot be
 * unit-tested — dnd-kit needs real layout (getBoundingClientRect, ResizeObserver,
 * pointer capture) that happy-dom does not provide — so all the arithmetic was
 * put here deliberately and the drag component was left with none.
 */
import { describe, expect, test } from "bun:test";
import {
  moveTo,
  swap,
  downloadName,
  sortDownloads,
  currentSortDir,
  nextSortDir,
  sameOrder,
} from "../src/puck/fields/listOps";

const ids = (xs: { id: string }[]) => xs.map((x) => x.id).join("");
const list = (s: string) => [...s].map((id) => ({ id }));

describe("moveTo (splice semantics — what a drag needs)", () => {
  test("moves an item forward, shifting the rest", () => {
    // a to index 2 lands it AFTER c, not swapped with c
    expect(ids(moveTo(list("abcd"), 0, 2))).toBe("bcad");
  });

  test("moves an item backward", () => {
    expect(ids(moveTo(list("abcd"), 3, 1))).toBe("adbc");
  });

  test("differs from swap — this is the whole reason both exist", () => {
    expect(ids(moveTo(list("abcd"), 0, 3))).toBe("bcda");
    expect(ids(swap(list("abcd"), 0, 3))).toBe("dbca");
  });

  test("same index is a no-op and returns the original reference", () => {
    const xs = list("abc");
    expect(moveTo(xs, 1, 1)).toBe(xs);
  });

  test("out-of-range indices are a no-op", () => {
    const xs = list("abc");
    expect(moveTo(xs, -1, 1)).toBe(xs);
    expect(moveTo(xs, 0, 9)).toBe(xs);
    expect(moveTo(xs, 9, 0)).toBe(xs);
  });

  test("never mutates its input", () => {
    // Puck diffs props objects; an in-place mutation produces a history entry
    // that undo cannot reverse.
    const xs = list("abcd");
    moveTo(xs, 0, 3);
    expect(ids(xs)).toBe("abcd");
  });
});

describe("swap (what the ±1 buttons need)", () => {
  test("trades two positions", () => {
    expect(ids(swap(list("abcd"), 1, 2))).toBe("acbd");
  });

  test("out-of-range is a no-op, so the end buttons are safe", () => {
    const xs = list("abc");
    expect(swap(xs, 0, -1)).toBe(xs);
    expect(swap(xs, 2, 3)).toBe(xs);
  });

  test("never mutates its input", () => {
    const xs = list("abc");
    swap(xs, 0, 1);
    expect(ids(xs)).toBe("abc");
  });
});

describe("downloadName — must match the name the table SHOWS", () => {
  test("an explicit label wins", () => {
    expect(downloadName({ label: "Route GPX", src: "/files/a.zip" })).toBe("Route GPX");
  });

  test("a blank label falls back to the file name", () => {
    expect(downloadName({ label: "", src: "/files/a.zip" })).toBe("a.zip");
  });

  test("a whitespace-only label also falls back", () => {
    // The placeholder promises "blank = file name"; a stray space should not
    // defeat that and leave the row sorting under " ".
    expect(downloadName({ label: "   ", src: "/files/a.zip" })).toBe("a.zip");
  });

  test("a src with no slash is its own name", () => {
    expect(downloadName({ src: "a.zip" })).toBe("a.zip");
  });

  test("missing fields do not throw", () => {
    expect(downloadName({})).toBe("");
  });
});

describe("sortDownloads", () => {
  const f = (label: string, size = 0) => ({ label, src: `/f/${label}`, size });

  test("by name, ascending and descending", () => {
    const xs = [f("charlie"), f("alpha"), f("bravo")];
    expect(sortDownloads(xs, "name", "asc").map((x) => x.label)).toEqual(["alpha", "bravo", "charlie"]);
    expect(sortDownloads(xs, "name", "desc").map((x) => x.label)).toEqual(["charlie", "bravo", "alpha"]);
  });

  test("numeric collation puts v1.9 before v1.10", () => {
    // Plain lexicographic ordering gets this backwards, and download lists are
    // release binaries, so it would be wrong in the common case.
    const xs = [f("app-1.10.zip"), f("app-1.9.zip"), f("app-1.2.zip")];
    expect(sortDownloads(xs, "name", "asc").map((x) => x.label)).toEqual([
      "app-1.2.zip",
      "app-1.9.zip",
      "app-1.10.zip",
    ]);
  });

  test("case does not split the ordering", () => {
    const xs = [f("Zebra"), f("apple"), f("Banana")];
    expect(sortDownloads(xs, "name", "asc").map((x) => x.label)).toEqual(["apple", "Banana", "Zebra"]);
  });

  test("sorts by the DISPLAYED name, not the raw path", () => {
    // src order is z,a but the labels are the visible column.
    const xs = [
      { label: "Alpha", src: "/f/zzz.zip", size: 0 },
      { label: "Beta", src: "/f/aaa.zip", size: 0 },
    ];
    expect(sortDownloads(xs, "name", "asc").map((x) => x.label)).toEqual(["Alpha", "Beta"]);
  });

  test("by size, ascending and descending", () => {
    const xs = [f("big", 3000), f("small", 10), f("mid", 500)];
    expect(sortDownloads(xs, "size", "asc").map((x) => x.label)).toEqual(["small", "mid", "big"]);
    expect(sortDownloads(xs, "size", "desc").map((x) => x.label)).toEqual(["big", "mid", "small"]);
  });

  test("equal sizes are broken by name, so the order is total", () => {
    const xs = [f("charlie", 100), f("alpha", 100), f("bravo", 100)];
    expect(sortDownloads(xs, "size", "asc").map((x) => x.label)).toEqual(["alpha", "bravo", "charlie"]);
  });

  test("desc is the EXACT reverse of asc, including tied rows", () => {
    // sort-then-reverse would preserve tie order instead of flipping it, which
    // makes the toggle look like it half-worked.
    const xs = [f("a", 100), f("b", 100), f("c", 5)];
    const asc = sortDownloads(xs, "size", "asc").map((x) => x.label);
    const desc = sortDownloads(xs, "size", "desc").map((x) => x.label);
    expect(desc).toEqual([...asc].reverse());
  });

  test("a missing file (size 0) clumps at the top ascending", () => {
    const xs = [f("real", 900), { label: "gone", src: "/f/gone", size: 0, missing: true }];
    expect(sortDownloads(xs, "size", "asc").map((x) => x.label)).toEqual(["gone", "real"]);
  });

  test("never mutates its input", () => {
    const xs = [f("c"), f("a"), f("b")];
    sortDownloads(xs, "name", "asc");
    expect(xs.map((x) => x.label)).toEqual(["c", "a", "b"]);
  });
});

describe("currentSortDir — the buttons derive direction rather than storing it", () => {
  const f = (label: string, size = 0) => ({ label, src: `/f/${label}`, size });

  test("reports asc for an ascending list", () => {
    expect(currentSortDir([f("a"), f("b"), f("c")], "name")).toBe("asc");
  });

  test("reports desc for a descending list", () => {
    expect(currentSortDir([f("c"), f("b"), f("a")], "name")).toBe("desc");
  });

  test("reports null for an unordered list", () => {
    expect(currentSortDir([f("b"), f("c"), f("a")], "name")).toBe(null);
  });

  test("a single item, or none, counts as asc", () => {
    expect(currentSortDir([], "name")).toBe("asc");
    expect(currentSortDir([f("a")], "name")).toBe("asc");
  });

  test("size and name are judged independently", () => {
    // name-ascending but size-descending
    const xs = [f("a", 900), f("b", 100)];
    expect(currentSortDir(xs, "name")).toBe("asc");
    expect(currentSortDir(xs, "size")).toBe("desc");
  });

  test("nextSortDir toggles: a click on an ascending list sorts descending", () => {
    const asc = [f("a"), f("b")];
    expect(nextSortDir(asc, "name")).toBe("desc");
    expect(nextSortDir([f("b"), f("a")], "name")).toBe("asc");
    // an unordered list ascends first
    expect(nextSortDir([f("b"), f("c"), f("a")], "name")).toBe("asc");
  });

  test("survives undo: direction follows the array, never a stale flag", () => {
    const xs = [f("c"), f("a"), f("b")];
    const sorted = sortDownloads(xs, "name", "asc");
    expect(nextSortDir(sorted, "name")).toBe("desc");
    // "undo" restores the old array — the next click ascends again, correctly
    expect(nextSortDir(xs, "name")).toBe("asc");
  });
});

describe("sameOrder — lets a no-op sort skip its undo entry", () => {
  test("true for an identical sequence", () => {
    const xs = list("abc");
    expect(sameOrder(xs, [...xs])).toBe(true);
  });

  test("false when the order differs, or the length does", () => {
    const xs = list("abc");
    expect(sameOrder(xs, swap(xs, 0, 1))).toBe(false);
    expect(sameOrder(xs, xs.slice(1))).toBe(false);
  });

  test("compares identity, not value — a rebuilt item counts as changed", () => {
    expect(sameOrder([{ id: "a" }], [{ id: "a" }])).toBe(false);
  });
});
