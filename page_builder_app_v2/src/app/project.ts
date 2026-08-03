/*
 * Project persistence and the export flow.
 *
 * The on-disk format is {version, exportSlug?, data}. `exportSlug` sits OUTSIDE
 * `data` deliberately: it is not user-edited content and must not become an
 * undo step.
 *
 * Save/open/export go through the existing Rust commands unchanged — atomic
 * writes, name sanitising and the two-phase overwrite prompt all still apply.
 */
import { invoke } from "@tauri-apps/api/core";
import type { Data } from "@measured/puck";
import { config } from "../puck/config";
import { assembleDocument, exportText, slugify, humanDate } from "../export/export";
import { renderExportContent, renderExportHero, renderExportHeader } from "../export/renderExport";
import { lintPage, type LintIssue } from "../export/lint";
import { collectSvgSrcs } from "../export/collect";
import { revalidateThumbs, refreshDownloadHashes, type HashReport } from "../export/fixups";
import { prefetchSvgs } from "../media";
import type { RootProps } from "../puck/PageRoot";

export const PROJECT_VERSION = 2;

export interface ProjectFileV2 {
  version: number;
  exportSlug?: string;
  data: Data;
}

export interface ProjectInfo {
  name: string;
  modified: number;
}

interface SaveResult {
  written: boolean;
  exists: boolean;
  name: string;
  path: string;
}

interface ExportResult {
  written: boolean;
  exists: boolean;
  path: string;
}

export const listProjects = () => invoke<ProjectInfo[]>("list_projects");

export async function saveProject(
  name: string,
  file: ProjectFileV2,
  overwrite: boolean,
): Promise<SaveResult> {
  return invoke<SaveResult>("save_project", {
    name,
    data: JSON.stringify(file, null, 2),
    overwrite,
  });
}

export interface OpenedProject {
  file: ProjectFileV2;
  hashes: HashReport;
}

/*
 * Load, then run the fix-up passes BEFORE the editor sees the data.
 *
 * prefetchSvgs is the non-negotiable one: the renderer reads svg text from a
 * SYNCHRONOUS cache, so it must be warm before the first render or every themed
 * svg shows its "[svg … not loaded]" placeholder.
 *
 * The other two reconcile the saved project against what is on disk NOW —
 * thumbnails generated since, files rebuilt or deleted. They mutate `file.data`
 * in place, which is safe here because Puck has not mounted yet.
 *
 * The caller owns the epoch guard: these are sequential awaits, so a second
 * Open can still finish first, and React does not help with that.
 */
export async function loadProject(name: string): Promise<OpenedProject> {
  const raw = await invoke<string>("load_project", { name });
  const file = JSON.parse(raw) as ProjectFileV2;
  if (!file || typeof file !== "object" || !file.data) {
    throw new Error(`${name}.json is not a page-builder project`);
  }
  if (file.version !== PROJECT_VERSION) {
    // v1 projects store {version:1, meta, blocks} and cannot be read here —
    // see the plan's "start clean" decision.
    throw new Error(
      `${name}.json is version ${file.version}; this app reads version ${PROJECT_VERSION}.`,
    );
  }
  await prefetchSvgs(collectSvgSrcs(file.data, config));
  await revalidateThumbs(file.data, config);
  const hashes = await refreshDownloadHashes(file.data, config);
  return { file, hashes };
}

// ------------------------------------------------------------------- export

export interface ExportBundle {
  slug: string;
  fileName: string;
  contents: string;
  issues: LintIssue[];
}

/// The three markup slots, rendered in the order the page presents them.
/// Shared by buildExport and buildPreview so neither can drift from the other.
function renderParts(data: Data) {
  return {
    heroHtml: renderExportHero(data),
    headerHtml: renderExportHeader(data, humanDate),
    contentHtml: renderExportContent(data),
  };
}

const pageSlug = (data: Data, slugOverride?: string) =>
  slugOverride?.trim() ||
  slugify(((data.root?.props ?? {}) as Partial<RootProps>).meta?.title ?? "");

/// Render + lint, without writing anything. Split out so the UI can show the
/// page check and ask for confirmation before touching the repo.
export async function buildExport(
  data: Data,
  shell: string,
  siteUrl: string,
  slugOverride?: string,
): Promise<ExportBundle> {
  // Warm the svg cache first: an svg picked and then exported in the same
  // session would otherwise render its placeholder into the committed file.
  await prefetchSvgs(collectSvgSrcs(data, config));
  // Thumbnails may have appeared since the photos were picked, and rebuilding a
  // binary changes its bytes without touching the project — a published SHA
  // that does not match the file is worse than no SHA at all.
  await revalidateThumbs(data, config);
  await refreshDownloadHashes(data, config);

  const slug = pageSlug(data, slugOverride);
  const { heroHtml, headerHtml, contentHtml } = renderParts(data);

  const contents = exportText({
    shell, data, config, siteUrl, slug, heroHtml, contentHtml, headerHtml,
  });

  // The header's <h1> is part of the outline, so the check must see it in the
  // same order the page renders: hero, then header, then content.
  const issues = lintPage({
    data, config,
    html: `${heroHtml}\n${headerHtml}\n${contentHtml}`,
  });

  return { slug, fileName: `${slug}.html`, contents, issues };
}

// ------------------------------------------------------------------ preview

/*
 * Render the page exactly as it will be PUBLISHED, for /__pb/preview.
 *
 * assembleDocument, not exportText: exportText prepends the YAML front matter,
 * which Eleventy strips before copying the body to notebook_pages/. Previewing
 * the exported *file* would put raw YAML at the top of the page; previewing the
 * document gives byte-for-byte what ends up on the site.
 *
 * prefetchSvgs is kept — it only warms a read cache, and without it every themed
 * svg renders its "[svg … not loaded]" placeholder.
 *
 * revalidateThumbs and refreshDownloadHashes are deliberately NOT run. Both
 * mutate `data` in place (fixups.ts), so calling them here would mean that
 * merely looking at a page silently edits the project and can flip the dirty
 * flag. Export still runs them, so a preview may show a stale SHA — the export
 * is what has to be correct.
 */
export async function buildPreview(
  data: Data,
  shell: string,
  siteUrl: string,
  slugOverride?: string,
): Promise<string> {
  await prefetchSvgs(collectSvgSrcs(data, config));
  return assembleDocument({
    shell, data, config, siteUrl,
    slug: pageSlug(data, slugOverride),
    ...renderParts(data),
  });
}

/// Hand the rendered document to the Rust server thread. "" clears it.
export const setPreviewHtml = (contents: string) =>
  invoke<void>("set_preview_html", { contents });

export const readShell = () => invoke<string>("read_shell");

export async function writeExport(
  fileName: string,
  contents: string,
  overwrite: boolean,
): Promise<ExportResult> {
  return invoke<ExportResult>("export_page", { fileName, contents, overwrite });
}
