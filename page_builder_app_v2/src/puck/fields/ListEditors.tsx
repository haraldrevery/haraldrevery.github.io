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

function Ops({
  i,
  count,
  onMove,
  onRemove,
}: {
  i: number;
  count: number;
  onMove: (i: number, d: number) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="pb-item__ops">
      <button type="button" onClick={() => onMove(i, -1)} disabled={i === 0} title="Move up">↑</button>
      <button type="button" onClick={() => onMove(i, 1)} disabled={i === count - 1} title="Move down">↓</button>
      <button type="button" onClick={() => onRemove(i)} title="Remove">✕</button>
    </div>
  );
}

function useListOps<T>(items: T[], onChange: (v: T[]) => void) {
  return {
    patch: (i: number, next: Partial<T>) =>
      onChange(items.map((it, n) => (n === i ? { ...it, ...next } : it))),
    move: (i: number, d: number) => {
      const j = i + d;
      if (j < 0 || j >= items.length) return;
      const next = [...items];
      [next[i], next[j]] = [next[j], next[i]];
      onChange(next);
    },
    remove: (i: number) => onChange(items.filter((_, n) => n !== i)),
  };
}

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
        {items.map((it, i) => (
          <div key={`${it.src}-${i}`} className="pb-item">
            <div className="pb-item__head">
              <div className="pb-item__meta">
                <code className="pb-item__path" title={it.src}>{it.src.split("/").pop()}</code>
                {!it.label.trim() && (
                  <div className="pb-item__badges">
                    <span className="pb-warn" title="Screen readers announce this">no label</span>
                  </div>
                )}
              </div>
              <Ops i={i} count={items.length} onMove={move} onRemove={remove} />
            </div>
            <input
              className="pb-item__input"
              placeholder="accessible label (required)"
              value={it.label}
              onChange={(e) => patch(i, { label: e.target.value })}
            />
            <input
              className="pb-item__input"
              placeholder="link (https://… opens in a new tab)"
              value={it.href}
              onChange={(e) => patch(i, { href: e.target.value })}
            />
          </div>
        ))}
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
        {items.length === 0 && <p className="pb-items__empty">No files yet.</p>}
        {items.map((it, i) => (
          <div key={`${it.src}-${i}`} className="pb-item">
            <div className="pb-item__head">
              <div className="pb-item__meta">
                <code className="pb-item__path" title={it.src}>{it.src.split("/").pop()}</code>
                <div className="pb-item__badges">
                  <span className="pb-item__size">{humanSize(it.size)}</span>
                  {it.missing && (
                    <span className="pb-warn" title="Broken link and stale hashes">missing</span>
                  )}
                </div>
              </div>
              <Ops i={i} count={items.length} onMove={move} onRemove={remove} />
            </div>
            <input
              className="pb-item__input"
              placeholder="display name (blank = file name)"
              value={it.label}
              onChange={(e) => patch(i, { label: e.target.value })}
            />
          </div>
        ))}
      </div>
    </FieldLabel>
  );
}
