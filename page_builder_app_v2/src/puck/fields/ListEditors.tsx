/*
 * Item editors for Icons and Downloads.
 *
 * Same constraint as GalleryItemsEditor: both need a NATIVE file dialog to
 * create an item, and a Puck `array` field's add button can only append an
 * empty defaultProps entry. So each owns its whole items array as one `custom`
 * field.
 */
import { FieldLabel } from "@measured/puck";
import { hashFiles, pickMedia, prefetchSvgs } from "../../media";
import type { IconItem, DownloadItem } from "../components/Lists";
import { humanSize } from "../shared";
import { currentSortDir, nextSortDir, sameOrder, sortDownloads, type SortKey } from "./listOps";
import { Ops, SortableItems, useListOps } from "./itemList";

// --------------------------------------------------------------------- icons

export function IconItemsEditor({
  value,
  onChange,
  label = "Icons",
}: {
  value?: IconItem[];
  onChange: (v: IconItem[]) => void;
  label?: string;
}) {
  const items = value ?? [];
  const { patch, move, remove } = useListOps(items, onChange);

  const add = async () => {
    const picked = await pickMedia("svg", true, "svg");
    if (!picked.length) return;
    // The renderer inlines svg text from a SYNCHRONOUS cache, so warm it before
    // the next render or every new icon shows its "[no svg]" placeholder.
    await prefetchSvgs(picked.map((p) => p.web));
    onChange([...items, ...picked.map((p) => ({ src: p.web, label: "", href: "" }))]);
  };

  return (
    <FieldLabel label={label} el="div">
      <div className="pb-items">
        <button type="button" className="pb-items__add" onClick={add}>
          + Add SVG icons…
        </button>
        {items.length === 0 && <p className="pb-items__empty">No icons yet.</p>}
        <SortableItems items={items} onReorder={onChange}>
          {(it, i, row) => (
          <div ref={row.ref} className={`pb-item${row.isDragging ? " pb-item--dragging" : ""}`}>
            <div className="pb-item__head">
              <div className="pb-item__meta">
                {/* Defensive like Faq's renderer: a hand-edited or older
                    project file can be missing any of these fields. */}
                <code className="pb-item__path" title={it.src}>{(it.src ?? "").split("/").pop()}</code>
                {!(it.label ?? "").trim() && (
                  <div className="pb-item__badges">
                    <span className="pb-warn" title="Screen readers announce this">no label</span>
                  </div>
                )}
              </div>
              <Ops i={i} count={items.length} onMove={move} onRemove={remove} grip={row.grip} />
            </div>
            <input
              className="pb-item__input"
              placeholder="accessible label (required)"
              value={it.label ?? ""}
              onChange={(e) => patch(i, { label: e.target.value })}
            />
            <input
              className="pb-item__input"
              placeholder="link (https://… opens in a new tab)"
              value={it.href ?? ""}
              onChange={(e) => patch(i, { href: e.target.value })}
            />
          </div>
          )}
        </SortableItems>
      </div>
    </FieldLabel>
  );
}

// ----------------------------------------------------------------- downloads

export function DownloadItemsEditor({
  value,
  onChange,
  label = "Files",
}: {
  value?: DownloadItem[];
  onChange: (v: DownloadItem[]) => void;
  label?: string;
}) {
  const items = value ?? [];
  const { patch, move, remove } = useListOps(items, onChange);

  const add = async () => {
    const picked = await pickMedia("any", true, "");
    if (!picked.length) return;
    // Hashes are computed from the real bytes by the Rust side, streamed so a
    // large file does not load into memory. They are recomputed before every
    // export too, so a rebuilt binary can never ship a stale checksum.
    const info = await hashFiles(picked.map((p) => p.web));
    onChange([
      ...items,
      ...picked.map((p, n) => ({
        src: p.web,
        label: "",
        size: info[n]?.size ?? 0,
        sha256: info[n]?.sha256 ?? "",
        sha512: info[n]?.sha512 ?? "",
        missing: !info[n],
      })),
    ]);
  };

  const refresh = async () => {
    const info = await hashFiles(items.map((it) => it.src));
    onChange(
      items.map((it, n) => ({
        ...it,
        size: info[n]?.size ?? it.size,
        sha256: info[n]?.sha256 ?? it.sha256,
        sha512: info[n]?.sha512 ?? it.sha512,
        missing: !info[n],
      })),
    );
  };

  /*
   * Sort the stored array — a one-shot reorder, undoable like any other edit,
   * not a display setting the block has to carry.
   *
   * Direction is DERIVED from the array (see listOps.currentSortDir) rather
   * than held in state: a stored flag goes stale the moment the user hits undo,
   * because the array reverts and the flag does not.
   */
  const sortBy = (key: SortKey) => {
    const next = sortDownloads(items, key, nextSortDir(items, key));
    // Already in that order — committing would be an undo step that visibly
    // does nothing.
    if (!sameOrder(items, next)) onChange(next);
  };

  /// Arrow doubles as a status indicator: it shows the order the list is IN.
  const arrow = (key: SortKey) => {
    if (items.length < 2) return "";
    const dir = currentSortDir(items, key);
    return dir === "asc" ? " ↑" : dir === "desc" ? " ↓" : "";
  };

  return (
    <FieldLabel label={label} el="div">
      <div className="pb-items">
        <button type="button" className="pb-items__add" onClick={add}>
          + Add files…
        </button>
        {items.length > 0 && (
          <button type="button" className="pb-items__add" onClick={refresh}>
            ↻ Recompute hashes
          </button>
        )}
        {items.length > 1 && (
          <div className="pb-items__sort">
            <span>Sort</span>
            <button type="button" onClick={() => sortBy("name")} title="Sort by the displayed file name">
              Name{arrow("name")}
            </button>
            <button type="button" onClick={() => sortBy("size")} title="Sort by file size">
              Size{arrow("size")}
            </button>
          </div>
        )}
        {items.length === 0 && <p className="pb-items__empty">No files yet.</p>}
        <SortableItems items={items} onReorder={onChange}>
          {(it, i, row) => (
          <div ref={row.ref} className={`pb-item${row.isDragging ? " pb-item--dragging" : ""}`}>
            <div className="pb-item__head">
              <div className="pb-item__meta">
                <code className="pb-item__path" title={it.src}>{(it.src ?? "").split("/").pop()}</code>
                <div className="pb-item__badges">
                  <span className="pb-item__size">{humanSize(it.size)}</span>
                  {it.missing && (
                    <span className="pb-warn" title="Broken link and stale hashes">missing</span>
                  )}
                </div>
              </div>
              <Ops i={i} count={items.length} onMove={move} onRemove={remove} grip={row.grip} />
            </div>
            <input
              className="pb-item__input"
              placeholder="display name (blank = file name)"
              value={it.label ?? ""}
              onChange={(e) => patch(i, { label: e.target.value })}
            />
          </div>
          )}
        </SortableItems>
      </div>
    </FieldLabel>
  );
}
