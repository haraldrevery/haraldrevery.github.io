/*
 * The site's underlined text link-button — the "MUSIC →" / "ABOUT →" pair on
 * index.html:319,358 and "MORE →" on music.html:145.
 *
 * All three are the same anchor, character for character:
 *
 *   <a href="music.html" class="inline-block border-b-2 border-black
 *      dark:border-white pb-1 hover:opacity-50 transition text-lg
 *      tracking-widest">MUSIC →</a>
 *
 * so this block emits exactly that and varies only the wrapper. Every class is
 * present in the compiled main.css — tests/render.test.tsx enforces that, since
 * a class which is not there publishes as an invisible no-op: there is no CSS
 * build on export.
 *
 * The label is emitted verbatim, NOT force-uppercased. The hand-written pages
 * type it in caps rather than reaching for an `uppercase` utility, and matching
 * them keeps this block's output identical to what is already committed.
 *
 * Deliberately NOT emitted: the `pt-6` the site puts on the wrapper. There it
 * separates the button from the paragraph above; here the block-gap system
 * already owns vertical rhythm, and spacing.ts forbids top padding on a block
 * precisely because padding cannot margin-collapse — the previous block's
 * mb-16 plus a pt-6 would silently double-count to 88px.
 */
import type { PuckContext } from "@measured/puck";
import { BlockShell } from "../nesting";
import { EmptyHint } from "../EmptyHint";
import type { Spacing } from "../spacing";

export type LinkAlign = "left" | "center" | "right";

/*
 * Reveal timing.
 *
 * main.css `.extra_fade_effect` (1.2s from page load) is what music.html puts
 * on the MORE button — and it is deliberately NOT an option here, because
 * assembleFragment already wraps ALL exported content in `extra_fade_effect`
 * (export.ts:282). A second copy nested inside it starts at the same moment and
 * would change nothing on screen.
 *
 * `.extra_fade_effect_long` IS worth offering: the same 1.2s fade, delayed by
 * 2.8s, so the button arrives after the copy around it has settled. Both are
 * neutralised in edit mode by SiteFrame's FRAME_CSS, so the block stays visible
 * while you work and plays for real under Puck's preview mode (Ctrl/Cmd+I).
 */
export type LinkReveal = "none" | "delayed";

const REVEAL_CLASS: Record<LinkReveal, string> = {
  none: "",
  delayed: "extra_fade_effect_long",
};

/// The anchor is `inline-block`, so text-align on the wrapper positions it. No
/// flex row: `justify-end` is not in the compiled main.css, `text-right` is.
const ALIGN_CLASS: Record<LinkAlign, string> = {
  left: "",
  center: "text-center",
  right: "text-right",
};

export const LINK_BUTTON_CLASS =
  "inline-block border-b-2 border-black dark:border-white pb-1 hover:opacity-50 transition text-lg tracking-widest";

export interface LinkButtonProps {
  label: string;
  href: string;
  arrow: boolean;
  align: LinkAlign;
  reveal: LinkReveal;
  spacing: Spacing;
  puck?: PuckContext;
}

export function LinkButton({
  label, href, arrow, align, reveal, spacing, puck,
}: LinkButtonProps) {
  const text = (label || "").trim();
  if (!text || !(href || "").trim()) {
    // Same rule as Image/Video: publish nothing rather than an empty or dead
    // anchor, but say so in the editor, where it is actionable.
    return puck?.isEditing ? (
      <EmptyHint label="Link button — set a label and a link target in the sidebar" />
    ) : (
      <></>
    );
  }

  const wrap = [ALIGN_CLASS[align ?? "left"], REVEAL_CLASS[reveal ?? "none"]]
    .filter(Boolean)
    .join(" ");

  return (
    <BlockShell spacing={spacing}>
      {/* `|| undefined` so an unstyled wrapper emits a bare <div>, the same way
          BlockShell itself avoids publishing class="". */}
      <div className={wrap || undefined}>
        <a href={href} className={LINK_BUTTON_CLASS}>
          {arrow ? `${text} →` : text}
        </a>
      </div>
    </BlockShell>
  );
}
