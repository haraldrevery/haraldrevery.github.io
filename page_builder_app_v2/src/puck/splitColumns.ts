/*
 * "Split into columns" — wrap a top-level block in a 2-column Columns block,
 * with the original block as the left column's only child.
 *
 * This restores v1's split affordance (README, "Known gaps"), rebuilt on Puck's
 * data model: v1 stored real children in `columns: [Block, Block]`, here the
 * block simply MOVES into the Columns block's `left` slot keeping its own id
 * and props, so the operation is reversible by dragging it back out.
 *
 * Pure, and separate from the button that calls it, for the same reason
 * listOps.ts is separate from the drag wrapper: this is the part where a
 * mistake corrupts a project file, so it is the part that gets tested.
 *
 * TWO RESTRICTIONS, both load-bearing:
 *
 * 1. TOP-LEVEL ONLY. A block already inside a column cannot be split. Columns
 *    is deliberately absent from EMBEDDABLE — nesting columns in columns has no
 *    markup in the site's vocabulary — and splitting a nested block is exactly
 *    the operation that would create one.
 *
 * 2. EMBEDDABLE ONLY. The same list the slots themselves allow. Splitting a
 *    Featured would be silent data damage rather than an error: BlockShell
 *    emits NO wrapper when nested, so the card class — and with it the whole
 *    overlapping grid — would just vanish from the page.
 */
import type { Data } from "@measured/puck";
import { EMBEDDABLE } from "./config";

const topLevel = (data: Data): any[] => (data.content as any[]) ?? [];

/// Whether the block with this id is one this operation may touch. Drives the
/// button's disabled state, so the affordance is never offered where it would
/// be refused.
export function canSplit(data: Data, id: string | undefined): boolean {
  if (!id) return false;
  const item = topLevel(data).find((c) => c?.props?.id === id);
  return !!item && EMBEDDABLE.includes(item.type);
}

/// null when the block is not splittable — the caller leaves `data` untouched
/// rather than dispatching a no-op that would still cost an undo step.
export function splitIntoColumns(
  data: Data,
  id: string,
  newId: () => string,
): Data | null {
  if (!canSplit(data, id)) return null;
  const content = topLevel(data);
  const i = content.findIndex((c) => c?.props?.id === id);
  const block = content[i];

  const columns = {
    type: "Columns",
    props: {
      id: newId(),
      count: 2,
      verticalAlign: "center",
      left: [block],
      right: [],
      /*
       * Inherit the block's own gap rather than defaulting to "normal". The
       * block is about to stop emitting its spacing entirely (nested blocks
       * carry none — the columns section owns their gap), so without this a
       * split would silently change the page's vertical rhythm.
       */
      spacing: block?.props?.spacing ?? "normal",
    },
  };

  const next = [...content];
  next.splice(i, 1, columns);
  return { ...data, content: next } as Data;
}

/// Puck's own id shape (`generateId`, chunk-QIGVND56.mjs:253). It is internal,
/// so match the convention rather than importing it.
export const newColumnsId = () => `Columns-${crypto.randomUUID()}`;
