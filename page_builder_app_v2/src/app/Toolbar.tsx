/*
 * New / Open / Save / Save as / Export, plus the dirty marker.
 *
 * Rendered inside <Puck> so it can read live editor state via usePuck().
 */
import { usePuck } from "@measured/puck";
import { canSplit, splitIntoColumns, newColumnsId } from "../puck/splitColumns";

export interface ToolbarProps {
  projectName: string | null;
  dirty: boolean;
  busy: string | null;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onPreview: () => void;
  onExport: () => void;
}

export function Toolbar(p: ToolbarProps) {
  const { history, dispatch, appState, selectedItem } = usePuck();
  const editingBlock = !!appState.ui.itemSelector;

  /*
   * "Split into columns" — v1's affordance, rebuilt (README, "Known gaps").
   * Offered only on a block it can actually take: top level, and one the column
   * slots would accept. See splitColumns.ts for why both restrictions exist.
   *
   * setData is excluded from Puck's history by default (reducer/index.ts), so
   * recordHistory makes the split exactly one undo step rather than none. The
   * function form of `data` also avoids Puck's "setData is expensive" warning.
   */
  const splitId = selectedItem?.props?.id as string | undefined;
  const splittable = canSplit(appState.data, splitId);
  const doSplit = () =>
    dispatch({
      type: "setData",
      recordHistory: true,
      data: (prev) => splitIntoColumns(prev, splitId!, newColumnsId) ?? prev,
    });

  return (
    <div className="pb-toolbar">
      <div className="pb-toolbar__title">
        <strong>{p.projectName ?? "Untitled"}</strong>
        {p.dirty && <span className="pb-toolbar__dot" title="Unsaved changes">●</span>}
        {p.busy && <span className="pb-toolbar__busy">{p.busy}</span>}
      </div>

      {/*
        Breadcrumb. Puck's default header has one, but this is a custom layout
        built from Puck.Fields alone — without this there is no way back to the
        page-level fields (SEO + hero) once a block is selected, and typing
        aimed at the page lands in the block instead.
      */}
      <div className="pb-toolbar__crumbs">
        <button
          type="button"
          className={editingBlock ? "" : "is-current"}
          onClick={() => dispatch({ type: "setUi", ui: { itemSelector: null } })}
        >
          Page
        </button>
        {editingBlock && (
          <>
            <span className="pb-toolbar__sep">›</span>
            <span className="is-current">{selectedItem?.type ?? "Block"}</span>
            {/*
              Lives with the breadcrumb rather than in the file operations: it
              acts on the SELECTED block, and this is the only part of the
              toolbar that is about the selection. Shown disabled rather than
              hidden on a block it cannot take, so the reason is discoverable.
            */}
            <button
              type="button"
              className="pb-toolbar__split"
              onClick={doSplit}
              disabled={!splittable}
              title={
                splittable
                  ? "Wrap this block in a 2-column layout, with it in the left column"
                  : "This block cannot go inside a column"
              }
            >
              Split into columns
            </button>
          </>
        )}
      </div>

      <div className="pb-toolbar__ops">
        <button type="button" onClick={p.onNew}>New</button>
        <button type="button" onClick={p.onOpen}>Open…</button>
        <button type="button" onClick={p.onSave} disabled={!p.dirty && !!p.projectName}>
          Save
        </button>
        <button type="button" onClick={p.onSaveAs}>Save as…</button>
        <button type="button" onClick={() => history.back()} disabled={!history.hasPast}>
          Undo
        </button>
        <button type="button" onClick={() => history.forward()} disabled={!history.hasFuture}>
          Redo
        </button>
        <button type="button" onClick={p.onPreview} disabled={!!p.busy}>
          Preview
        </button>
        <button type="button" className="pb-toolbar__primary" onClick={p.onExport}>
          Export page
        </button>
      </div>
    </div>
  );
}
