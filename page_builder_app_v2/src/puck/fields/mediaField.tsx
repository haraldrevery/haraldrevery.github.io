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
 * sibling props the picker would have no way to set together. Pre-filling the
 * caption props beside the photo is the one exception, and goes through
 * updateBlock instead.
 */
import { FieldLabel, useGetPuck, type CustomField } from "@measured/puck";
import { pickMedia, prefetchSvg, type MediaKind } from "../../media";
import { textFill, type TextTargets } from "./photoText";
import { selectedBlockId, updateBlock } from "./updateBlock";

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
/// `text` names the block's caption props to pre-fill from the photo's
/// embedded title / description (see photoText.ts); the hero passes none.
export function imageField(startDir: string, label: string, text?: TextTargets): CustomField<PickedImage> {
  return {
    type: "custom",
    label,
    // Puck renders `render` as a component, so the picker may use hooks.
    render: ({ value, onChange }) => (
      <ImagePicker startDir={startDir} label={label} text={text} value={value} onChange={onChange} />
    ),
  };
}

function ImagePicker({
  startDir,
  label,
  text,
  value,
  onChange,
}: {
  startDir: string;
  label: string;
  text?: TextTargets;
  value?: PickedImage;
  onChange: (v: PickedImage) => void;
}) {
  const getPuck = useGetPuck();
  const v = value ?? EMPTY_IMAGE;

  const pick = async () => {
    // Taken BEFORE the dialog, while this block's sidebar is the one on screen.
    const id = selectedBlockId(getPuck());
    const [f] = await pickMedia("image", false, startDir);
    if (!f) return;
    const image: PickedImage = { full: f.full, thumb: f.thumb, thumbMissing: !f.thumbExists };
    if (id) {
      // The photo and any caption text it brings, as one write and one undo
      // step, to the block that opened the dialog — see updateBlock.ts.
      updateBlock(getPuck(), id, (props) => ({
        ...props,
        image,
        ...(text ? textFill(f.text, text, props) : {}),
      }));
    } else {
      // The hero: a root field, shown only while no block is selected.
      onChange(image);
    }
  };

  return (
    <>
      <Row
        title={label}
        label={v.full ? base(v.full) : "— none —"}
        onPick={pick}
        onClear={v.full ? () => onChange(EMPTY_IMAGE) : undefined}
      />
      {v.full && v.thumbMissing && (
        <span className="pb-warn" title="No _min thumbnail; using the full-size image">
          no _min
        </span>
      )}
    </>
  );
}
