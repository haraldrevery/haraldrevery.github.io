/*
 * One or two columns of arbitrary embeddable blocks. Transcribed from
 * page_builder/src/blocks/render.ts:470-494.
 *
 * v1 stored real child blocks in `columns: [Block, Block]` and rendered them
 * through a second `inner` render path. Here each column is a Puck SLOT: the
 * children are ordinary components in `data`, draggable in and out, with their
 * own sidebar forms — all of which v1 hand-built (the `data-pb-col` chips, the
 * "＋ pick content" target, showColumnTypePicker, and columnsForm's recursive
 * splicing of a child's entire form).
 *
 * <Nested> is what makes the children render in their column shape (no
 * <section> wrapper, no spacing, prose in a <div> rather than an <article>) —
 * see nesting.tsx. The context reaches them through Puck's slot render
 * function, so the editor and the export take the same path.
 *
 * Slot props arrive as render FUNCTIONS, hence the capitalised destructuring.
 *
 * Puck renders each slot inside a bare <div> of its own. That div IS the grid
 * cell — wrapping it in a hand-written column <div> as well would add a nesting
 * level v1's markup does not have, to every committed page. (DropZoneProps also
 * takes className/style if a cell ever needs classes of its own.)
 */
import { BlockShell, Nested } from "../nesting";
import type { Spacing } from "../spacing";
import type { Slot } from "@measured/puck";

export interface ColumnsProps {
  count: 1 | 2;
  verticalAlign: "center" | "top";
  left: Slot;
  right: Slot;
  spacing: Spacing;
}

export function Columns({
  count,
  verticalAlign,
  left: Left,
  right: Right,
  spacing,
}: Omit<ColumnsProps, "left" | "right"> & { left: any; right: any }) {
  const align = verticalAlign === "top" ? "items-start" : "items-center";

  const inner =
    count === 2 ? (
      // gap-16 is the COLUMN gap; below md the grid collapses to one column and
      // that 64px would leak in as a row gap wider than the gap between whole
      // blocks, so pin the row gap tighter (inert on desktop, where there is
      // only one row). Inline style because md:gap-* is not in the compiled
      // main.css.
      <div className={`grid md:grid-cols-2 gap-16 ${align}`} style={{ rowGap: "2rem" }}>
        <Nested>
          <Left minEmptyHeight={120} />
        </Nested>
        <Nested>
          <Right minEmptyHeight={120} />
        </Nested>
      </div>
    ) : (
      // count 1 renders only the left slot; the right slot's DATA survives, so
      // switching 2 -> 1 -> 2 keeps the work (matches v1's model.ts:178-180).
      <Nested>
        <Left minEmptyHeight={120} />
      </Nested>
    );

  return (
    <BlockShell spacing={spacing} extra="extra_fade_effect">
      {inner}
    </BlockShell>
  );
}
