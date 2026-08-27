/*
 * Placeholder for a block that has no content yet.
 *
 * Without this, dropping an empty block is INVISIBLE: a Text block with no
 * markdown renders an empty <article>, which collapses to zero height, so the
 * drop looks like it silently failed. That is most acute inside a Columns
 * slot, where the column keeps showing its empty-zone outline. v1 had the same
 * problem and solved it with a "＋ pick content" affordance
 * (page_builder/src/blocks/render.ts:478-480).
 *
 * EDIT MODE ONLY. `puck.isEditing` is false in @measured/puck/rsc's Render,
 * which is what the export path uses, so this can never reach a published page
 * — asserted in tests/render.test.tsx.
 *
 * Styling lives in SiteFrame's FRAME_CSS, because this renders inside the
 * preview iframe where the app's stylesheet does not apply.
 */
export function EmptyHint({ label }: { label: string }) {
  return <div className="pb-empty-hint">{label}</div>;
}
