/*
 * "Swap left and right" for the Columns block.
 *
 * WHY THIS IS NOT AN ORDINARY FIELD. A custom field's onChange can only write
 * its OWN prop (the same constraint that shaped mediaField and the item
 * editors), and this button has to write TWO — `left` and `right`. So it
 * reaches past onChange and dispatches a `setData` instead.
 *
 * The alternative — a `flipped` boolean that makes the renderer draw the slots
 * in reverse — was rejected: the sidebar's "Left"/"Right" drop targets would
 * then disagree with what the canvas shows, so dragging a block into "Left"
 * would land it on the right. Swapping the DATA keeps every surface honest;
 * afterwards, left really is left.
 *
 * Columns is deliberately absent from EMBEDDABLE (see config.tsx), so a Columns
 * block can only ever sit at the top level. That is what lets this be one map
 * over `content` instead of a recursive walk.
 */
import { FieldLabel, usePuck, type Data } from "@measured/puck";

export function SwapColumnsField() {
  // usePuck() returns the whole store; only createUsePuck() takes a selector.
  const { dispatch, selectedItem } = usePuck();
  // The Fields panel renders the fields of the SELECTED component, so this is
  // the Columns block the button belongs to.
  const id = selectedItem?.props?.id as string | undefined;

  const swap = () => {
    if (!id) return;
    dispatch({
      // Without this the swap is NOT undoable: Puck records history for the
      // actions its own UI dispatches, and a bare setData is not one of them —
      // verified in the app, where Undo stayed greyed out after a swap.
      recordHistory: true,
      type: "setData",
      data: (previous: Data) => ({
        ...previous,
        content: previous.content.map((item: any) =>
          item?.props?.id === id
            ? {
                ...item,
                props: {
                  ...item.props,
                  // ?? [] because a slot that has never been dropped into can
                  // be undefined, and a slot prop must always be an array.
                  left: item.props?.right ?? [],
                  right: item.props?.left ?? [],
                },
              }
            : item,
        ),
      }),
    });
  };

  return (
    <FieldLabel label="Column order" el="div">
      <div className="pb-items__sort">
        <button type="button" onClick={swap} disabled={!id} title="Move the left column's content to the right, and vice versa">
          ⇄ Swap left and right
        </button>
      </div>
    </FieldLabel>
  );
}
