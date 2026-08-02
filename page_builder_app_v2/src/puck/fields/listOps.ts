/*
 * Array operations for the sidebar item editors, kept PURE.
 *
 * No React, no Tauri, no Puck imports — so tests exercise the ordering logic
 * directly, with no DOM and no module side effects. Same reasoning as
 * resolveThumb in export/fixups.ts: the branching that can silently produce a
 * wrong result is the part worth testing, and it does not need a component to
 * be tested.
 *
 * That matters more than usual here, because drag-and-drop itself cannot be
 * unit-tested (dnd-kit needs real layout that happy-dom does not provide). All
 * the arithmetic lives here; the drag component contains none.
 *
 * Types are structural rather than importing DownloadItem, so tests can pass
 * plain object literals and this module stays dependency-free.
 */

export type SortKey = "name" | "size";
export type SortDir = "asc" | "desc";

export interface NameLike {
  label?: string;
  src?: string;
}

export interface SortLike extends NameLike {
  size?: number;
}

// ------------------------------------------------------------------ reorder

/*
 * Move one item to a new index, shifting the rest — SPLICE semantics.
 *
 * This is what a drag needs: dragging row 0 onto row 3 must land it between the
 * old 2 and 3, not trade places with 3. The ±1 buttons use `swap` instead,
 * where the two are equivalent and a swap reads more predictably.
 *
 * Returns a NEW array; Puck diffs props objects, and mutating one in place
 * produces a history entry that undo cannot reverse.
 */
export function moveTo<T>(items: T[], from: number, to: number): T[] {
  if (from === to) return items;
  if (from < 0 || from >= items.length) return items;
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/// Trade two items' positions. Used by the ↑/↓ buttons.
export function swap<T>(items: T[], i: number, j: number): T[] {
  if (i === j) return items;
  if (i < 0 || i >= items.length) return items;
  if (j < 0 || j >= items.length) return items;
  const next = [...items];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// --------------------------------------------------------------------- sort

/*
 * The name a download row actually SHOWS (components/Lists.tsx: the File name
 * cell is `label || basename(src) || src`).
 *
 * Sorting the raw `src` instead would disagree with the visible column the
 * moment a label is set — the list would look unsorted.
 *
 * `.trim()` because the field's placeholder promises "blank = file name", and a
 * stray space should not defeat that.
 */
export function downloadName(it: NameLike): string {
  const label = (it.label ?? "").trim();
  if (label) return label;
  const src = it.src ?? "";
  return src.split("/").pop() || src;
}

/*
 * `numeric` is load-bearing: download lists are release binaries, and plain
 * lexicographic ordering puts app-1.10.zip BEFORE app-1.9.zip.
 * `sensitivity: "base"` so Foo.zip and foo.zip do not split into two groups.
 */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compare(a: SortLike, b: SortLike, key: SortKey): number {
  if (key === "size") {
    const d = (a.size ?? 0) - (b.size ?? 0);
    // Name as tiebreak, so the order is total. Identical sizes are common (a
    // .zip and its .tar.gz), and without a tiebreak "desc" would not be the
    // exact reverse of "asc" — the toggle looks broken on tied rows.
    if (d !== 0) return d;
  }
  return collator.compare(downloadName(a), downloadName(b));
}

/*
 * Direction is applied as `cmp * ±1`, not "sort ascending then reverse".
 * Reversing preserves the relative order of tied rows instead of flipping it,
 * which makes a toggle feel like it half-worked.
 */
export function sortDownloads<T extends SortLike>(items: T[], key: SortKey, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => compare(a, b, key) * sign);
}

/*
 * Which direction the array is ALREADY in for this key, or null if it is in no
 * particular order.
 *
 * The sort buttons derive their direction from this rather than storing it in
 * state. Stored state goes stale the instant the user hits undo — the array
 * reverts but the toggle does not — and it is a second source of truth for
 * something the array already fully encodes. Deriving also lets the button
 * label double as a status indicator.
 *
 * A 0/1-element or all-tied list is both; report "asc" so the first click
 * always produces a visible change.
 */
export function currentSortDir(items: SortLike[], key: SortKey): SortDir | null {
  if (items.length < 2) return "asc";
  let asc = true;
  let desc = true;
  for (let i = 1; i < items.length; i++) {
    const c = compare(items[i - 1], items[i], key);
    if (c > 0) asc = false;
    if (c < 0) desc = false;
  }
  if (asc) return "asc";
  if (desc) return "desc";
  return null;
}

/// What a click on `key` should do next: flip if already ascending, else ascend.
export function nextSortDir(items: SortLike[], key: SortKey): SortDir {
  return currentSortDir(items, key) === "asc" ? "desc" : "asc";
}

/// True when two arrays hold the same items in the same order (identity-wise).
/// Lets the caller skip a no-op onChange, which would otherwise be an undo step
/// that appears to do nothing.
export function sameOrder<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((it, i) => it === b[i]);
}
