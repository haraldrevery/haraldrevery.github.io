/*
 * Vertical spacing — every top-level block owns exactly ONE gap, the margin
 * below it. Never a top margin and never padding: padding cannot
 * margin-collapse, so a block with both sides set double-counts against its
 * neighbours and makes gaps depend on block order.
 *
 * BlockShell (nesting.tsx) is the only place that may emit a spacing class.
 * Column children carry no spacing at all — the columns section owns their gap.
 */

export type Spacing = "none" | "gallery" | "tight" | "normal" | "loose";

/*
 * Tailwind's --spacing base is .25rem, so these are 8 / 32 / 64 / 80 px.
 *
 * "none" omits the class rather than emitting mb-0. That is about output
 * stability — every hand-written page uses a bare wrapper — not availability;
 * mb-0 does exist in the current main.css.
 *
 * "gallery" is mb-2, which equals the gap-2 between images in the JUSTIFIED
 * gallery layout (components/Gallery.tsx). That is the default layout and the
 * signature look, so it is the gap worth matching: setting it on a block makes
 * the next block sit as close as two photos in a row do, which is what you want
 * when stacking galleries so they read as one grid. The other layouts use
 * larger gaps (feature gap-4 = 16px, uniform gap-6 = 24px).
 */
export const SPACING_CLASS: Record<Spacing, string> = {
  none: "",
  gallery: "mb-2",
  tight: "mb-8",
  normal: "mb-16",
  loose: "mb-20",
};

/// Spread into every top-level component's `fields`. Ordered smallest to
/// largest so the list reads as a scale.
export const spacingField = {
  type: "select" as const,
  label: "Space below",
  options: [
    { label: "None", value: "none" },
    { label: "Gallery gap (8px)", value: "gallery" },
    { label: "Tight (32px)", value: "tight" },
    { label: "Normal (64px)", value: "normal" },
    { label: "Loose (80px)", value: "loose" },
  ],
};
