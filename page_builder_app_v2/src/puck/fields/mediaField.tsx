/*
 * File pickers as Puck `custom` fields, backed by the native OS dialog.
 *
 * Not Puck's `external` field: that renders a searchable table for picking from
 * a remote data source. The native dialog already implemented in
 * commands.rs::pick_media is strictly better here — it links rather than copies,
 * derives the _min thumbnail, probes pixel dimensions, and rejects files outside
 * the repo.
 *
 * CONSTRAINT that shapes these: a custom field's onChange can only write its
 * OWN prop. So anything that needs both a full-size path and its _min twin
 * stores them as ONE object-valued prop (see PickedImage) rather than as two
 * sibling props the picker would have no way to set together.
 */
import { FieldLabel, type CustomField } from "@measured/puck";
import { pickMedia, prefetchSvg, type MediaKind } from "../../media";

export interface PickedImage {
  full: string;
  thumb: string;
  /// Reported by the picker; the "no _min" warning reads it.
  thumbMissing?: boolean;
}

export const EMPTY_IMAGE: PickedImage = { full: "", thumb: "" };

function Row({
  title,
  label,
  onPick,
  onClear,
}: {
  /// Puck renders `label` itself for its BUILT-IN field types, but a custom
  /// field renders whatever we return — including its own label.
  title: string;
  label: string;
  onPick: () => void;
  onClear?: () => void;
}) {
  return (
    <FieldLabel label={title} el="div">
    <div className="pb-media">
      <code className="pb-media__path" title={label}>
        {label}
      </code>
      <div className="pb-media__ops">
        <button type="button" onClick={onPick}>
          Pick…
        </button>
        {onClear && (
          <button type="button" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
    </div>
    </FieldLabel>
  );
}

const base = (p: string) => p.split("/").pop() || "";

/// Value IS the root-absolute web path. For svg / video / audio / single files.
export function pathField(kind: MediaKind, startDir: string, label: string): CustomField<string> {
  return {
    type: "custom",
    label,
    render: ({ value, onChange }) => (
      <Row
        title={label}
        label={value ? base(value) : "— none —"}
        onPick={async () => {
          const [f] = await pickMedia(kind, false, startDir);
          if (!f) return;
          // The renderer reads svg text from a SYNCHRONOUS cache, so it must be
          // warm before the next render or the hero shows the "[svg … not
          // loaded]" placeholder.
          if (kind === "svg") await prefetchSvg(f.web);
          onChange(f.web);
        }}
        onClear={value ? () => onChange("") : undefined}
      />
    ),
  };
}

/// Value is {full, thumb} — one prop, so the picker can set both at once.
export function imageField(startDir: string, label: string): CustomField<PickedImage> {
  return {
    type: "custom",
    label,
    render: ({ value, onChange }) => {
      const v = value ?? EMPTY_IMAGE;
      return (
        <>
          <Row
            title={label}
            label={v.full ? base(v.full) : "— none —"}
            onPick={async () => {
              const [f] = await pickMedia("image", false, startDir);
              if (!f) return;
              onChange({ full: f.full, thumb: f.thumb, thumbMissing: !f.thumbExists });
            }}
            onClear={v.full ? () => onChange(EMPTY_IMAGE) : undefined}
          />
          {v.full && v.thumbMissing && (
            <span className="pb-warn" title="No _min thumbnail; using the full-size image">
              no _min
            </span>
          )}
        </>
      );
    },
  };
}
