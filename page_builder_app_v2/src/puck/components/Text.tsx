/*
 * The workhorse prose block: headings, body copy and rules all in ONE markdown
 * field, rendered into ONE <article class="prose">.
 *
 * WHY THIS SHAPE. v1 kept heading/paragraph/hr as separate blocks and its
 * renderer buffered adjacent ones, flushing them into a single <article> so the
 * gaps between them stayed typographic — prose.css owns them — rather than
 * becoming 64px block gaps (page_builder/src/blocks/render.ts:724-758). Puck
 * renders siblings independently and has no API to merge them, so keeping the
 * blocks separate would silently turn every heading->paragraph gap from ~1em
 * into mb-16, on every page.
 *
 * Folding them into one markdown field reproduces v1's output exactly by making
 * adjacency impossible: you write "## Section" and the body in the same box, and
 * markdown-it emits the same <h2> + <p> inside the same wrapper. The Heading
 * block survives only for what markdown cannot express (centre align, per-word
 * animation).
 */
import type { PuckContext } from "@measured/puck";
import { ProseShell } from "../nesting";
import { EmptyHint } from "../EmptyHint";
import { renderMarkdown } from "../../markdown";
import { wrapHtmlWords } from "../../blocks/wordAnimate";
import type { Spacing } from "../spacing";

export interface TextProps {
  md: string;
  animate: boolean;
  spacing: Spacing;
  /// Puck injects this; the word_animation delay seed, so repeated renders and
  /// exports produce identical output rather than churning diffs.
  id?: string;
  puck?: PuckContext;
}

export function Text({ md, animate, spacing, id, puck }: TextProps) {
  // An empty Text block renders an empty <article>, which has zero height —
  // invisible, so a fresh drop looks like it failed. Show a hint instead while
  // editing. The export path (rsc Render) has isEditing false and still emits
  // the empty article, exactly as before.
  if (!(md ?? "").trim() && puck?.isEditing) {
    return <EmptyHint label="Empty text block — write markdown in the sidebar" />;
  }

  // `?? ""` because the early return above only fires while editing — on the
  // export path a project file missing `md` would reach markdown-it as undefined.
  const rendered = renderMarkdown(md ?? "");
  return (
    <ProseShell
      spacing={spacing}
      html={animate ? wrapHtmlWords(rendered, id ?? "") : rendered}
    />
  );
}
