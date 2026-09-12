/*
 * Rewrite one block's props, finding the block by ID at the moment of writing.
 *
 * WHY NOT THE FIELD'S OWN onChange. Puck's field onChange writes to whichever
 * block is selected WHEN IT IS CALLED — createOnChange reads `selectedItem`
 * from the store at call time, not the block whose sidebar created it. The
 * callers here all call it after an await (a native file dialog, a disk read),
 * so selecting another block in the meantime would land the write on THAT
 * block. Looking the block up by id also reads its CURRENT props, so an edit
 * made during the wait is built on rather than reverted.
 *
 * It is also the only way to write several props at once: a custom field's
 * onChange writes its own prop only (the same constraint as SwapColumns).
 * getSelectorForId finds a block inside a Columns slot too, which SwapColumns'
 * top-level map over `content` would not — Image is embeddable.
 */
import type { PuckApi } from "@measured/puck";

type Props = Record<string, any>;

/// `update` returns the new props, or null for "nothing to change". Returns
/// whether anything was written: false when the block no longer exists (it was
/// deleted during the wait) or the update was a no-op.
export function updateBlock(puck: PuckApi, id: string, update: (props: Props) => Props | null): boolean {
  const item = puck.getItemById(id);
  const at = puck.getSelectorForId(id);
  if (!item || !at) return false;
  const props = update(item.props);
  if (!props) return false;
  puck.dispatch({
    // Explicit, like SwapColumns: one pick is one undo step.
    recordHistory: true,
    type: "replace",
    destinationIndex: at.index,
    destinationZone: at.zone,
    // id re-asserted: Puck's replace throws if it changes, and no caller means to.
    data: { ...item, props: { ...props, id } },
  });
  return true;
}

/// The id of the block whose sidebar is showing — the Fields panel renders the
/// SELECTED component's fields. Undefined in the page (root) fields.
export function selectedBlockId(puck: PuckApi): string | undefined {
  return puck.selectedItem?.props?.id as string | undefined;
}
