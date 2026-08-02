/*
 * Shared chrome for the three sidebar item editors (Gallery, Icons, Downloads).
 *
 * They all render the same `.pb-item` row shape, so the ↑/↓/✕ controls, the
 * mutation helpers and the drag wrapper live here rather than in any one
 * editor — a sibling editor importing from another editor's module is a
 * dependency direction that rots.
 *
 * All ordering arithmetic is in the pure `listOps.ts`; nothing here computes an
 * index. That split is deliberate: drag cannot be unit-tested (dnd-kit needs
 * real layout that happy-dom does not provide), so the untestable part is kept
 * free of logic worth testing.
 */
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { PointerSensor } from "@dnd-kit/dom";
import { moveTo, swap } from "./listOps";

// ------------------------------------------------------------ row controls

export function Ops({
  i,
  count,
  onMove,
  onRemove,
  grip,
}: {
  i: number;
  count: number;
  onMove: (i: number, d: number) => void;
  onRemove: (i: number) => void;
  /// The drag handle, rendered first. Passed in rather than built here because
  /// only a row inside a SortableItems knows its own handleRef.
  grip?: ReactNode;
}) {
  return (
    <div className="pb-item__ops">
      {grip}
      <button type="button" onClick={() => onMove(i, -1)} disabled={i === 0} title="Move up">↑</button>
      <button type="button" onClick={() => onMove(i, 1)} disabled={i === count - 1} title="Move down">↓</button>
      <button type="button" onClick={() => onRemove(i)} title="Remove">✕</button>
    </div>
  );
}

export function useListOps<T>(items: T[], onChange: (v: T[]) => void) {
  return {
    patch: (i: number, next: Partial<T>) =>
      onChange(items.map((it, n) => (n === i ? { ...it, ...next } : it))),
    /// The ±1 buttons. Swap rather than splice — for a single step the two are
    /// equivalent and a swap reads more predictably.
    move: (i: number, d: number) => {
      const next = swap(items, i, i + d);
      if (next !== items) onChange(next);
    },
    remove: (i: number) => onChange(items.filter((_, n) => n !== i)),
  };
}

// ---------------------------------------------------------------- drag ids

/*
 * dnd-kit needs an id that sticks to the ITEM, not to its position.
 *
 * None of these item types has an id field, and the obvious candidates are not
 * unique — the same photo may legitimately appear in a gallery twice. Object
 * identity is an id we already have, so key a WeakMap on it.
 *
 * Adding a real `id` field instead would mean migrating saved {version:2}
 * project JSON, updating the parity fixtures, and writing editor bookkeeping
 * permanently into the user's data — all to serve an affordance that exists for
 * about 300ms at a time.
 *
 * Identity loss is harmless: the only window where stability matters is between
 * drag start and drop, and in that window we deliberately never call onChange,
 * so Puck cannot re-dispatch and the array cannot be rebuilt. Outside it, a
 * fresh id costs one re-registration on an idle list.
 *
 * Using it as the React key also fixes a real collision — the old
 * `${it.full}-${i}` key repeated when the same photo appeared twice.
 */
function useItemIds<T extends object>(items: T[]): string[] {
  const ids = useRef(new WeakMap<T, string>());
  const next = useRef(0);
  return items.map((it) => {
    let id = ids.current.get(it);
    if (!id) {
      id = `it${next.current++}`;
      ids.current.set(it, id);
    }
    return id;
  });
}

// ------------------------------------------------------------------- drag

interface RowProps {
  /// Goes on the row element.
  ref: (el: Element | null) => void;
  /// The ⠿ button to hand to Ops.
  grip: ReactNode;
  isDragging: boolean;
}

function SortableRow({
  id,
  index,
  children,
}: {
  id: string;
  index: number;
  children: (p: RowProps) => ReactNode;
}) {
  // `data` is not derived from `index` — dnd-kit exposes only what you put there
  // on `operation.source` / `operation.target`, so the handler below cannot read
  // the position without this. Puck's own sortable passes the same pair.
  const { ref, handleRef, isDragging } = useSortable({ id, index, data: { index } });
  return (
    <>
      {children({
        ref,
        isDragging,
        grip: (
          <button
            type="button"
            className="pb-item__grip"
            ref={handleRef}
            title="Drag to reorder"
            aria-label="Drag to reorder"
          >
            ⠿
          </button>
        ),
      })}
    </>
  );
}

/*
 * Drag-to-reorder for a list of `.pb-item` rows.
 *
 * Two things here are load-bearing and easy to get wrong:
 *
 * 1. The reorder is held in LOCAL state for the duration of the drag and
 *    committed exactly once, on drop. A custom field's onChange dispatches a
 *    Puck `replace`, which the history interceptor records — committing every
 *    intermediate position would turn one drag into N undo steps. Puck's own
 *    ArrayField solves this with a private setUi(..., false) that is not
 *    available to us, so not calling onChange is the only lever.
 *
 * 2. onDragOver must preventDefault. dnd-kit's OptimisticSortingPlugin bails
 *    when the event is defaultPrevented; without it, dnd-kit reorders the DOM
 *    itself and competes with React for the same job.
 *
 * The default plugin preset supplies what v1 hand-rolled in ~97 lines of
 * editor-bridge.js: the activation threshold, post-drop click suppression, the
 * grabbing cursor, suppressed text selection, and sidebar autoscroll. The gap
 * left where the dragged row was — plus the live reorder of its neighbours —
 * is the drop indicator, so there is nothing to draw.
 */
export function SortableItems<T extends object>({
  items,
  onReorder,
  children,
}: {
  items: T[];
  onReorder: (next: T[]) => void;
  children: (item: T, index: number, row: RowProps) => ReactNode;
}) {
  const [dragOrder, setDragOrder] = useState<T[] | null>(null);
  /// setState is async and onDragEnd needs the final order immediately.
  const live = useRef(items);

  const shown = dragOrder ?? items;
  const ids = useItemIds(shown);

  /// A new authoritative value arrived — our own commit, an undo, or a project
  /// open. Drop the local override; keeping it would pin the list to a stale
  /// order that no longer matches the data.
  useEffect(() => setDragOrder(null), [items]);

  // 5px before a drag starts, matching Puck's own array field, so a plain click
  // on the grip is not treated as a drag.
  const sensors = useMemo(
    () => [PointerSensor.configure({ activationConstraints: { distance: { value: 5 } } })],
    [],
  );

  if (items.length < 2) {
    // Nothing to reorder — skip the provider entirely rather than register
    // sortables that can never fire. Keys still come from here, so callers
    // never have to supply one for either path.
    return (
      <>
        {items.map((it, i) => (
          <Fragment key={ids[i]}>
            {children(it, i, { ref: () => {}, grip: null, isDragging: false })}
          </Fragment>
        ))}
      </>
    );
  }

  return (
    <DragDropProvider
      sensors={sensors}
      onDragStart={() => {
        // Without this the ref still holds the PREVIOUS drag's result, and a
        // drag that ends without ever crossing a neighbour would commit it.
        live.current = items;
      }}
      onDragOver={(event: any) => {
        event.preventDefault();
        const from = event.operation?.source?.data?.index;
        const to = event.operation?.target?.data?.index;
        if (typeof from !== "number" || typeof to !== "number" || from === to) return;
        setDragOrder((prev) => (live.current = moveTo(prev ?? items, from, to)));
      }}
      onDragEnd={() => {
        // 250ms is dnd-kit's drop-settle animation; committing inside it
        // re-renders mid-animation and the row visibly snaps.
        const next = live.current;
        setTimeout(() => {
          if (next !== items) onReorder(next);
          else setDragOrder(null);
        }, 250);
      }}
    >
      {shown.map((it, i) => (
        <SortableRow key={ids[i]} id={ids[i]} index={i}>
          {(row) => children(it, i, row)}
        </SortableRow>
      ))}
    </DragDropProvider>
  );
}
