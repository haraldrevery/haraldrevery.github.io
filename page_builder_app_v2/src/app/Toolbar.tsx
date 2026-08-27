/*
 * New / Open / Save / Save as / Export, plus the dirty marker.
 *
 * Rendered inside <Puck> so it can read live editor state via usePuck().
 */
import { usePuck } from "@measured/puck";

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
