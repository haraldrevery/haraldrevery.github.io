/*
 * Vertical spacing — every top-level block owns exactly ONE gap, the margin
 * below it. Never a top margin and never padding: padding cannot
 * margin-collapse, so a block with both sides set double-counts against its
 * neighbours and makes gaps depend on block order.
 *
 * BlockShell (nesting.tsx) is the only place that may emit a spacing class.
 * Column children carry no spacing at all — the columns section owns their gap.
 */

export type Spacing = "none" | "tight" | "normal" | "loose";

/// "none" omits the class rather than emitting mb-0, and "loose" is 80px
/// rather than a rounder 96px, because mb-0 and mb-24 are not in main.css.
export const SPACING_CLASS: Record<Spacing, string> = {
  none: "",
  tight: "mb-8",
  normal: "mb-16",
  loose: "mb-20",
};

/// Spread into every top-level component's `fields`.
export const spacingField = {
  type: "select" as const,
  label: "Space below",
  options: [
    { label: "None", value: "none" },
    { label: "Tight", value: "tight" },
    { label: "Normal", value: "normal" },
    { label: "Loose", value: "loose" },
  ],
};
