/*
 * React tree -> the two HTML fragments shell.html needs.
 *
 * `Render` comes from @measured/puck/rsc: a pure tree walk with no client
 * hooks, which sets puck.isEditing = false on every component. That is the
 * right renderer for producing a string.
 *
 * Hero and content are rendered SEPARATELY because shell.html has them as two
 * placeholders — {{HERO}} sits before the page container, {{CONTENT}} inside
 * it. Content therefore goes through contentConfig, whose root render is a
 * passthrough: the bg-topology-map / page-container chrome comes from the
 * shell, and rendering PageRoot here would nest a second copy inside it.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { Render } from "@measured/puck/rsc";
import type { Data } from "@measured/puck";
import { contentConfig } from "../puck/contentConfig";
import { Hero } from "../puck/components/Hero";
import { DEFAULT_HERO, type RootProps } from "../puck/PageRoot";
import { stripReactPreloads } from "./renderHtml";
import { formatHtml } from "./format";

const toHtml = (node: React.ReactElement) =>
  formatHtml(stripReactPreloads(renderToStaticMarkup(node)));

export function renderExportContent(data: Data): string {
  // `data` is the generic Puck Data; contentConfig is typed against this app's
  // component map, so the cast is the boundary between the two.
  return toHtml(<Render config={contentConfig} data={data as never} />);
}

export function renderExportHero(data: Data): string {
  const root = (data.root?.props ?? {}) as Partial<RootProps>;
  if (!root.hasHero) return "";
  return toHtml(<Hero {...{ ...DEFAULT_HERO, ...root.hero }} id="hero" />);
}
