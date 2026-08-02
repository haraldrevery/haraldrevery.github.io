/*
 * Block wrappers. Replaces v1's `Renderer { top, inner }` pair
 * (page_builder/src/blocks/render.ts:638).
 *
 * v1 gave every block type two render paths: `top` (standalone, with its own
 * wrapper) and `inner` (inside a column). Here there is ONE component per type,
 * and the shells below decide which shape to emit by reading a context that
 * <Nested> provides.
 *
 * Why context and not a prop: slot children get their props from `data`, not
 * from the parent component, so a `nested` prop cannot be passed down. Context
 * also works at arbitrary depth for free, whereas v1's top/inner split
 * hardcoded exactly one level.
 *
 * Context propagates through Puck's slot render functions AND through
 * renderToStaticMarkup, so the editor, the interactive preview and the export
 * all take the same path — which is the whole point of the rewrite.
 *
 * The four shapes, verified against v1's renderer output:
 *   top-level prose      <article class="prose dark:prose-invert max-w-none mb-16">
 *   nested prose         <div class="prose dark:prose-invert max-w-none">
 *   top-level non-prose  <section class="mb-16">
 *   nested non-prose     (no wrapper — the column cell <div> is the wrapper)
 */
import { createContext, useContext, type ReactNode } from "react";
import { SPACING_CLASS, type Spacing } from "./spacing";

const NestedContext = createContext(false);

export function Nested({ children }: { children: ReactNode }) {
  return <NestedContext.Provider value={true}>{children}</NestedContext.Provider>;
}

const PROSE_CLASSES = "prose dark:prose-invert max-w-none";

/// Wrapper for non-prose blocks (gallery, image, columns, video, …).
export function BlockShell({
  spacing,
  extra,
  html,
  children,
}: {
  spacing?: Spacing;
  /// Fixed classes emitted BEFORE the gap class, so class order reads the way
  /// it always has in the committed pages (v1's gapAttr, render.ts:95).
  extra?: string;
  /// Raw markup to become the wrapper's OWN innerHTML. Use this rather than
  /// passing a <div dangerouslySetInnerHTML> as children: that div would be an
  /// extra element v1 never emitted, on every page using the block.
  html?: string;
  children?: ReactNode;
}) {
  const nested = useContext(NestedContext);
  if (nested) {
    // No wrapper when nested — the column cell <div> is the wrapper. React
    // cannot attach innerHTML to a fragment, so raw markup keeps a <div> here;
    // this is the one place v2's markup differs from v1's inner rendering.
    return html !== undefined ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <>{children}</>;
  }

  const cls = [extra, SPACING_CLASS[spacing ?? "normal"]].filter(Boolean).join(" ");
  // `|| undefined` is load-bearing: React omits the attribute entirely for
  // undefined, reproducing a bare <section> for spacing "none". Emitting
  // class="" instead would be a diff against every committed page.
  return html !== undefined ? (
    <section className={cls || undefined} dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <section className={cls || undefined}>{children}</section>
  );
}

/// Wrapper for prose blocks (Text, Heading).
///
/// Pass `html` for markdown/animated output and `children` for plain JSX — the
/// wrapper itself carries both the prose classes AND the content, with nothing
/// in between. That adjacency is required: prose.css zeroes the first/last
/// child's margin with a DIRECT-child selector, so an intermediate <div> would
/// leave a stray margin at the top of every prose block.
export function ProseShell({
  spacing,
  html,
  children,
}: {
  spacing?: Spacing;
  html?: string;
  children?: ReactNode;
}) {
  const nested = useContext(NestedContext);
  // Column children carry no spacing at all — the columns section owns their gap.
  const cls = nested
    ? PROSE_CLASSES
    : [PROSE_CLASSES, SPACING_CLASS[spacing ?? "normal"]].filter(Boolean).join(" ").trim();
  const Tag = nested ? "div" : "article";

  return html !== undefined ? (
    <Tag className={cls} dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <Tag className={cls}>{children}</Tag>
  );
}
