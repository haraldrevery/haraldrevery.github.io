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
import { FieldLabel } from "@measured/puck";
import { pickMedia } from "../../media";
import { recheckImages } from "../../export/fixups";
import type { GalleryItem } from "../components/Gallery";

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

  const patch = (i: number, next: Partial<GalleryItem>) =>
    onChange(items.map((it, n) => (n === i ? { ...it, ...next } : it)));

  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

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

  const add = async () => {
    const picked = await pickMedia("image", true, "photos");
    if (!picked.length) return;
    onChange([
      ...items,
      ...picked.map((p) => ({
        full: p.full,
        thumb: p.thumb,
        alt: "",
        title: "",
        description: "",
        thumbMissing: !p.thumbExists,
        w: p.width ?? undefined,
        h: p.height ?? undefined,
      })),
    ]);
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

      {items.length === 0 && <p className="pb-items__empty">No photos yet.</p>}

      {items.map((it, i) => (
        <div key={`${it.full}-${i}`} className="pb-item">
          <div className="pb-item__head">
            <img src={it.thumb || it.full} alt="" className="pb-item__thumb" />
            <div className="pb-item__meta">
              <code className="pb-item__path" title={it.full}>
                {it.full.split("/").pop()}
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
            <div className="pb-item__ops">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} title="Move down">↓</button>
              <button
                type="button"
                onClick={() => onChange(items.filter((_, n) => n !== i))}
                title="Remove"
              >
                ✕
              </button>
            </div>
          </div>

          <input
            className="pb-item__input"
            placeholder="alt (required)"
            value={it.alt}
            onChange={(e) => patch(i, { alt: e.target.value })}
          />
          <input
            className="pb-item__input"
            placeholder="lightbox title"
            value={it.title}
            onChange={(e) => patch(i, { title: e.target.value })}
          />
          <input
            className="pb-item__input"
            placeholder="lightbox description"
            value={it.description}
            onChange={(e) => patch(i, { description: e.target.value })}
          />
        </div>
      ))}
    </div>
    </FieldLabel>
  );
}
