/*
 * The gallery `items` editor, used as a Puck `custom` field.
 *
 * Why custom and not Puck's `array` field: an array field's "add" button
 * appends an empty item from defaultProps, and a custom field's onChange can
 * only write its OWN field — so there is no way to make "add" open a native
 * file dialog and append the picked files. Owning the whole items array here
 * gets the picker, the per-item metadata inputs and reordering in one place.
 *
 * This replaces v1's gallery-item pointer-drag state machine in
 * preview-harness/editor-bridge.js (~80 lines, untyped, untested) plus
 * store.reorderGalleryItem (state.ts:222-237) plus the galleryItemsEditor
 * section of ui/blockForms.ts.
 */
import { FieldLabel, useGetPuck } from "@measured/puck";
import { imageText, pickMedia } from "../../media";
import { recheckImages } from "../../export/fixups";
import { toast } from "../../ui/toast";
import type { GalleryItem } from "../components/Gallery";
import { Ops, SortableItems, inheritItemId, useListOps } from "./itemList";
import { GALLERY_TEXT, textFill } from "./photoText";
import { selectedBlockId, updateBlock } from "./updateBlock";

/// Green when alt + title + description are all filled, yellow when partial —
/// the media-completeness dot from v1 (defs.ts:249). Alt matters for
/// accessibility and the lint pass; title/description drive the lightbox caption.
function itemStatus(it: GalleryItem): "ok" | "partial" {
  const filled = [it.alt, it.title, it.description].filter((s) => (s || "").trim()).length;
  return filled === 3 ? "ok" : "partial";
}

export function GalleryItemsEditor({
  value,
  onChange,
  label = "Photos",
}: {
  value?: GalleryItem[];
  onChange: (v: GalleryItem[]) => void;
  /// Custom fields render their own label; Puck only does it for built-ins.
  label?: string;
}) {
  const items = value ?? [];
  const getPuck = useGetPuck();

  const { patch, move, remove } = useListOps(items, onChange);

  /*
   * Re-check every item against disk. The `_min` convention means you often
   * link a photo before generating its thumbnail, and nothing else refreshes
   * that state while the app is open — the on-open pass only runs on open.
   */
  const recheck = async () => {
    const next = items.map((it) => ({ ...it }));
    await recheckImages(next as any);
    onChange(next);
  };

  /*
   * Picked photos arrive with their embedded title and description already in
   * the caption fields (see photoText.ts). Alt stays empty — it is the
   * author's to write.
   *
   * Written by block id rather than onChange, because this runs after the
   * dialog closes — see updateBlock.ts. The id is taken BEFORE the dialog
   * opens, while this block's sidebar is the one on screen.
   */
  const add = async () => {
    const id = selectedBlockId(getPuck());
    const picked = await pickMedia("image", true, "photos");
    if (!picked.length) return;
    const fresh = picked.map((p) => {
      const it: GalleryItem = {
        full: p.full,
        thumb: p.thumb,
        alt: "",
        title: "",
        description: "",
        thumbMissing: !p.thumbExists,
        w: p.width ?? undefined,
        h: p.height ?? undefined,
      };
      return { ...it, ...textFill(p.text, GALLERY_TEXT, it) };
    });
    if (id) {
      updateBlock(getPuck(), id, (props) => ({ ...props, items: [...(props.items ?? []), ...fresh] }));
    } else {
      onChange([...items, ...fresh]);
    }
  };

  /*
   * The import-time fill, for photos that were linked before it existed: fill
   * EMPTY titles and descriptions from each photo's embedded text. Never
   * replaces typed text and never touches alt. Keyed by path, and applied to
   * the items as they are AFTER the disk read, so a row edited or added in the
   * meantime is built on rather than reverted.
   */
  const fillFromPhotos = async () => {
    const id = selectedBlockId(getPuck());
    const paths = [...new Set(items.map((it) => it.full).filter(Boolean))];
    const texts = await imageText(paths).catch((e) => {
      toast(`Could not read photo metadata: ${e}`, true);
      return null;
    });
    if (!texts || !id) return;
    const byPath = new Map(paths.map((p, n) => [p, texts[n]]));

    let filled = 0;
    updateBlock(getPuck(), id, (props) => {
      const next = ((props.items ?? []) as GalleryItem[]).map((it) => {
        const add = textFill(byPath.get(it.full), GALLERY_TEXT, it);
        if (!Object.keys(add).length) return it;
        filled++;
        const replaced = { ...it, ...add };
        inheritItemId(it, replaced); // the row's React key — see useListOps.patch
        return replaced;
      });
      // Nothing filled = no write, so no undo step that visibly does nothing.
      return filled ? { ...props, items: next } : null;
    });
    toast(
      filled
        ? `Filled ${filled} photo${filled === 1 ? "" : "s"} from embedded metadata.`
        : "Nothing to fill: no empty title or description has embedded text to take.",
    );
  };

  return (
    <FieldLabel label={label} el="div">
    <div className="pb-items">
      <button type="button" className="pb-items__add" onClick={add}>
        + Add photos…
      </button>
      {items.length > 0 && (
        <button
          type="button"
          className="pb-items__add"
          onClick={recheck}
          title="Adopt _min thumbnails generated since these photos were linked"
        >
          ↻ Re-check files
        </button>
      )}
      {items.length > 0 && (
        <button
          type="button"
          className="pb-items__add"
          onClick={fillFromPhotos}
          title="Fill EMPTY titles and descriptions from each photo's embedded metadata. Never replaces text you typed; alt text is left to you."
        >
          ✎ Fill empty titles &amp; descriptions
        </button>
      )}

      {items.length === 0 && <p className="pb-items__empty">No photos yet.</p>}

      <SortableItems items={items} onReorder={onChange}>
        {(it, i, row) => (
        <div ref={row.ref} className={`pb-item${row.isDragging ? " pb-item--dragging" : ""}`}>
          <div className="pb-item__head">
            {/* The grip is the only drag handle, so the native image drag is
                already unreachable — this is belt-and-braces for the moment a
                pointer-down lands on the thumb during a fast drag. */}
            <img src={it.thumb || it.full} alt="" className="pb-item__thumb" draggable={false} />
            <div className="pb-item__meta">
              <code className="pb-item__path" title={it.full}>
                {(it.full ?? "").split("/").pop()}
              </code>
              <div className="pb-item__badges">
                <span className={`pb-dot pb-dot--${itemStatus(it)}`} title="alt / title / description" />
                {/* Say BOTH things. "No badge" reads as "not checked yet"
                    rather than "fine", which is the state that matters when
                    the whole point is whether a _min exists. */}
                {it.thumbMissing ? (
                  <span className="pb-warn" title="No _min thumbnail; the full-size image is being used instead">
                    no _min
                  </span>
                ) : (
                  <span className="pb-ok" title={`Using thumbnail ${it.thumb}`}>✓ _min</span>
                )}
                {it.w ? (
                  <span className="pb-ok" title="Pixel size known — justified layout can use the real ratio">
                    {it.w}×{it.h}
                  </span>
                ) : (
                  <span className="pb-warn" title="Pixel size unknown — justified layout assumes 3/2">
                    no size
                  </span>
                )}
              </div>
            </div>
            <Ops i={i} count={items.length} onMove={move} onRemove={remove} grip={row.grip} />
          </div>

          <input
            className="pb-item__input"
            placeholder="alt (required)"
            value={it.alt ?? ""}
            onChange={(e) => patch(i, { alt: e.target.value })}
          />
          <input
            className="pb-item__input"
            placeholder="lightbox title"
            value={it.title ?? ""}
            onChange={(e) => patch(i, { title: e.target.value })}
          />
          <input
            className="pb-item__input"
            placeholder="lightbox description"
            value={it.description ?? ""}
            onChange={(e) => patch(i, { description: e.target.value })}
          />
        </div>
        )}
      </SortableItems>
    </div>
    </FieldLabel>
  );
}
