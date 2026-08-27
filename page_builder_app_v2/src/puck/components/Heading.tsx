/*
 * Standalone heading — kept alongside the markdown Text block ONLY for the two
 * things markdown cannot express: centre alignment and the per-word fade-up.
 * An ordinary `## Section` heading belongs inside a Text block, where it shares
 * one <article class="prose"> with its body copy and the gap between them stays
 * typographic. See Text.tsx.
 *
 * Transcribed from page_builder/src/blocks/render.ts:102-107 (headingHtml).
 */
import { ProseShell } from "../nesting";
import { wrapPlainWords } from "../../blocks/wordAnimate";
import type { Spacing } from "../spacing";

export interface HeadingProps {
  level: number;
  text: string;
  align: "left" | "center";
  animate: boolean;
  spacing: Spacing;
  /// Puck injects this; the word_animation delay seed.
  id?: string;
}

/// Matches v1's escText (render.ts:59) — the three characters that change
/// parsing in element content. Only needed on the animated path, where the
/// text is spliced into an HTML string; React escapes the plain path itself.
function escapeText(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function Heading({ level, text, align, animate, spacing, id }: HeadingProps) {
  const lvl = Math.max(1, Math.min(3, level || 2));
  const Tag = `h${lvl}` as "h1" | "h2" | "h3";
  const className = align === "center" ? "text-center" : undefined;

  return (
    <ProseShell spacing={spacing}>
      {animate ? (
        <Tag
          className={className}
          dangerouslySetInnerHTML={{ __html: wrapPlainWords(escapeText(text), id ?? "") }}
        />
      ) : (
        <Tag className={className}>{text}</Tag>
      )}
    </ProseShell>
  );
}
