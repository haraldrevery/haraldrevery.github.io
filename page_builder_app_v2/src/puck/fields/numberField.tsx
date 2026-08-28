/*
 * A typeable replacement for Puck's built-in `number` field.
 *
 * THE BUG IT EXISTS FOR. Puck's DefaultField validates a bounded number on
 * every keystroke and `return`s WITHOUT calling onChange when the value falls
 * outside [min, max]:
 *
 *     const numberValue = Number(e.currentTarget.value);
 *     if (typeof field.min !== "undefined" && numberValue < field.min) return;
 *
 * The input is controlled, so a rejected keystroke is immediately re-rendered
 * away and the box cannot be typed into at all. With `min: 60` on the gallery's
 * row height, EVERY first digit is below 60 — so "320" is unreachable one
 * character at a time and the spinner buttons are the only way to change it.
 * The higher the min, the more completely the field is frozen; fields with no
 * min/max (the hero's SVG offsets) type fine, which is the tell.
 *
 * THE FIX. Hold what the user is typing in local state, and only publish a
 * value once it parses in range — clamping whatever is left on blur or Enter.
 * The bounds are still enforced, just at commit time rather than per keystroke,
 * which is the only point at which "3" on the way to "320" is distinguishable
 * from "3" as a final answer.
 */
import { FieldLabel, type CustomField } from "@measured/puck";
import { useEffect, useState } from "react";
import { liveValue, settledValue } from "./numberOps";

function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const [draft, setDraft] = useState(() => (value == null ? "" : String(value)));

  /*
   * Re-seed from an authoritative value: selecting another block, an undo, or
   * our own clamp below. This cannot fight the user mid-edit, because typing an
   * out-of-range value deliberately does not publish one — so `value` only
   * changes here when something other than this keystroke changed it.
   */
  useEffect(() => setDraft(value == null ? "" : String(value)), [value]);

  const commit = () => {
    const settled = settledValue(draft, min, max);
    // null = nothing usable in the box; put the last good value back rather
    // than inventing one, since 0 would be a silent edit nobody asked for.
    // A clamp that lands on the current value produces no onChange and so no
    // re-seed, which is the other case that has to correct the text here.
    if (settled === null || settled === value) {
      setDraft(value == null ? "" : String(value));
      return;
    }
    onChange(settled);
  };

  return (
    <FieldLabel label={label} el="div">
      <input
        className="pb-number"
        type="number"
        value={draft}
        min={min}
        max={max}
        onChange={(e) => {
          const next = e.currentTarget.value;
          setDraft(next);
          /*
           * Publish the moment the text is a legal value, so a spinner click and
           * a finished number both land immediately — the same per-keystroke
           * feel as Puck's own text fields. Intermediate values simply sit in
           * the draft until they become legal or the field is blurred.
           */
          const live = liveValue(next, min, max);
          if (live !== null) onChange(live);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
    </FieldLabel>
  );
}

/// `min`/`max` are optional: with neither, this behaves like Puck's field but
/// still routes through the draft, so there is one number-field behaviour.
export function numberField(label: string, min?: number, max?: number): CustomField<number> {
  return {
    type: "custom",
    label,
    render: ({ value, onChange }) => (
      <NumberInput label={label} value={value} onChange={onChange} min={min} max={max} />
    ),
  };
}
