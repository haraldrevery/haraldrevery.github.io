import "./style.css";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, message } from "@tauri-apps/plugin-dialog";

import { el, clear, debounce, toast, promptModal, listModal, contentModal } from "./ui/dom";
import { store } from "./state";
import type { Project } from "./state";
import { renderContent, renderHero, heroNavReveal, STATIC_BACKLINK } from "./blocks/render";
import type { Block, GalleryItem } from "./blocks/model";
import { walkBlocks, newBlock } from "./blocks/defs";
import { collectSvgSrcs, hasSvgText } from "./blocks/svgStore";
import { normalizeProject } from "./blocks/normalize";
import { slugify, humanDate, exportText, resolveSchemaType } from "./export";
import { PreviewBridge } from "./preview/bridge";
import { renderMetaForm } from "./ui/metaForm";
import { renderBlockList, refreshBlockList, confirmDelete } from "./ui/blockList";
import { blockSummary } from "./blocks/defs";
import { renderBlockForm } from "./ui/blockForms";
import { showBlockPicker, showColumnTypePicker } from "./ui/palette";
import { checkFiles, deriveMinPath, imageDims, pickMedia, prefetchSvg, prefetchSvgs, hashFiles } from "./media";
import type { DownloadItem } from "./blocks/model";
import { lintPage } from "./lint";

interface Config {
  repoRoot: string | null;
  previewPort: number;
  siteUrl: string;
}
interface ExportResult {
  written: boolean;
  exists: boolean;
  path: string;
}
interface RegionReport {
  name: string;
  matches: boolean;
  adoptable: boolean;
  shellExcerpt: string;
  referenceExcerpt: string;
}
interface FreshnessReport {
  reference: string;
  regions: RegionReport[];
}

// ---------------------------------------------------------------- layout

const app = document.getElementById("app")!;

const metaForm = el("div", { id: "meta-form" });
const blockList = el("div", { id: "block-list" });
const blockEditor = el("div", { id: "block-editor" });
const shellWarning = el("div", { id: "shell-warning" });
const pageCheck = el("div", { id: "page-check" });
const modeBtn = el("button", { id: "mode-toggle", onclick: () => toggleMode() }, "👁 Preview mode");
const themeBtn = el("button", { id: "theme-toggle", title: "Preview color scheme", onclick: () => cycleTheme() }, "🌗 Auto");
const iframe = el("iframe", { id: "preview" }) as HTMLIFrameElement;

const toolbar = el(
  "header",
  { id: "toolbar" },
  el("button", { onclick: () => doNew() }, "New"),
  el("button", { onclick: () => doOpen() }, "Open"),
  el("button", { onclick: () => doSave(false) }, "Save"),
  el("button", { class: "secondary", onclick: () => doSave(true) }, "Save as"),
  el("button", { class: "primary", onclick: () => doExport() }, "Export"),
  themeBtn,
  modeBtn
);

// Site dark mode is prefers-color-scheme; flipping the window theme lets the
// user check themed svgs / dark styling without changing the OS setting.
type PreviewTheme = "auto" | "light" | "dark";
let previewTheme: PreviewTheme = "auto";

async function cycleTheme(): Promise<void> {
  const next: PreviewTheme =
    previewTheme === "auto" ? "light" : previewTheme === "light" ? "dark" : "auto";
  try {
    await getCurrentWindow().setTheme(next === "auto" ? null : next);
    previewTheme = next;
    themeBtn.textContent = next === "auto" ? "🌗 Auto" : next === "light" ? "☀ Light" : "🌙 Dark";
  } catch (e) {
    toast(`Theme switching not supported here: ${e}`, true);
  }
}

app.append(
  el(
    "aside",
    { id: "sidebar" },
    toolbar,
    shellWarning,
    pageCheck,
    el("details", { class: "panel", open: true }, el("summary", {}, "Page details (front matter)"), metaForm),
    el(
      "details",
      { class: "panel", open: true },
      el("summary", {}, "Blocks"),
      blockList,
      el("button", { class: "add-block", onclick: () => addBlockViaPicker() }, "+ Add block")
    ),
    blockEditor
  ),
  el("main", { id: "preview-pane" }, iframe)
);

// ---------------------------------------------------------------- preview

let selectionFromPreview = false;

const bridge = new PreviewBridge(iframe, {
  onReady() {
    pushRender();
    bridge.setMode(store.mode);
    if (store.selectedId) bridge.select(store.selectedId, false);
  },
  onBlockClick(id) {
    selectionFromPreview = true;
    store.select(id);
    selectionFromPreview = false;
  },
  onReorder(id, dropIndex) {
    store.reorderBlock(id, dropIndex);
  },
  async onInsertAt(index) {
    const type = await showBlockPicker();
    if (type) void afterInsert(store.addBlock(type, index));
  },
  onSplit(id) {
    store.splitIntoColumns(id);
  },
  onItemReorder(id, from, dropIndex) {
    store.reorderGalleryItem(id, from, dropIndex);
  },
  async onColumnPick(id, col) {
    const b = store.blocks.find((x) => x.id === id);
    if (!b || b.type !== "columns" || col < 0 || col > 1) return;
    const type = await showColumnTypePicker();
    if (!type) return;
    store.mutateStructure(() => {
      b.columns[col] = newBlock(type);
      store.selectedId = b.id;
    });
  },
});

function previewHtml(): string {
  if (!store.blocks.length) {
    return `<div class="pb-empty">Empty page — use “+ Add block” in the sidebar</div>`;
  }
  return renderContent(store.blocks, { editMode: store.mode === "edit" });
}

function pushRender(scrollToId?: string): void {
  const edit = store.mode === "edit";
  const hasHero = store.blocks.some((b) => b.type === "hero");
  bridge.render(
    previewHtml(),
    renderHero(store.blocks, { editMode: edit }),
    hasHero ? "" : STATIC_BACKLINK,
    humanDate(store.meta.date),
    heroNavReveal(store.blocks),
    scrollToId
  );
}

const debouncedRender = debounce((scrollToId?: string) => pushRender(scrollToId), 150);

function renderPageCheck(): void {
  clear(pageCheck);
  if (!store.blocks.length && !store.meta.title) return;
  const schema = resolveSchemaType(store.meta, store.blocks);
  pageCheck.appendChild(
    el(
      "div",
      { class: "page-check-ok" },
      `Schema: ${schema.type}${schema.auto ? " (auto)" : ""}`
    )
  );
  const issues = lintPage(store.meta, store.blocks);
  if (!issues.length) {
    pageCheck.appendChild(el("div", { class: "page-check-ok" }, "✓ Page check: no issues"));
    return;
  }
  pageCheck.appendChild(
    el(
      "div",
      { class: "page-check-list" },
      ...issues.map((i) =>
        el("div", { class: `page-check-item ${i.severity}` }, `${i.severity === "warn" ? "⚠" : "ℹ"} ${i.message}`)
      )
    )
  );
}

const debouncedLint = debounce(renderPageCheck, 400);

function toggleMode(): void {
  store.setMode(store.mode === "edit" ? "preview" : "edit");
}

function updateModeButton(): void {
  modeBtn.textContent = store.mode === "edit" ? "👁 Preview mode" : "✏ Edit mode";
  modeBtn.classList.toggle("active", store.mode === "preview");
}

function updateTitle(): void {
  document.title = `${store.projectName ?? "untitled"}${store.dirty ? " •" : ""} — Notebook Page Builder`;
  getCurrentWindow().setTitle(document.title).catch(() => {});
}

store.subscribe((kind) => {
  switch (kind) {
    case "structure":
      renderBlockList(blockList);
      renderBlockForm(blockEditor);
      debouncedRender(store.selectedId ?? undefined);
      bridge.select(store.selectedId, false);
      updateTitle();
      debouncedLint();
      break;
    case "content":
      refreshBlockList(blockList);
      debouncedRender();
      updateTitle();
      debouncedLint();
      break;
    case "selection":
      refreshBlockList(blockList);
      renderBlockForm(blockEditor);
      bridge.select(store.selectedId, !selectionFromPreview);
      break;
    case "mode":
      bridge.setMode(store.mode);
      pushRender();
      updateModeButton();
      break;
    case "project":
      renderMetaForm(metaForm);
      renderBlockList(blockList);
      renderBlockForm(blockEditor);
      pushRender();
      updateTitle();
      renderPageCheck();
      break;
  }
});

/// Media-first blocks immediately open the file picker after insertion —
/// galleries multi-select, so building an image grid is pick-once.
async function afterInsert(b: Block): Promise<void> {
  if (b.type === "gallery") {
    const files = await pickMedia("image", true, "photos");
    if (!files.length) return;
    store.mutateStructure(() => {
      b.items.push(
        ...files.map((f) => ({
          full: f.full,
          thumb: f.thumb,
          alt: "",
          title: "",
          description: "",
          thumbMissing: !f.thumbExists,
          w: f.width ?? undefined,
          h: f.height ?? undefined,
        }))
      );
    });
  } else if (b.type === "svg") {
    const files = await pickMedia("svg", false, "svg");
    if (!files.length) return;
    await prefetchSvg(files[0].web);
    store.mutateStructure(() => (b.src = files[0].web));
  } else if (b.type === "hero" && (b.background === "backdrop" || b.background === "cover")) {
    const files = await pickMedia("image", false, "photos");
    if (!files.length) return;
    store.mutateStructure(() => {
      b.image = files[0].full;
      b.imageThumb = files[0].thumb;
    });
  }
}

async function addBlockViaPicker(): Promise<void> {
  const type = await showBlockPicker();
  if (type) void afterInsert(store.addBlock(type));
}

// ---------------------------------------------------------------- project io


/// Re-check _min thumbnails on disk; auto-adopt ones that appeared since the
/// project was saved (link now, add files later — the intended workflow).
async function revalidateThumbs(project: Project): Promise<void> {
  interface Imageish {
    full: string;
    thumb: string;
    thumbMissing?: boolean;
  }
  const items: Imageish[] = [];
  const gridItems: GalleryItem[] = [];
  walkBlocks(project.blocks, (b) => {
    if (b.type === "gallery") gridItems.push(...b.items);
    else if (b.type === "image") items.push(b);
  });
  items.push(...gridItems);

  // justified layout needs pixel dimensions; fill in any that are missing
  // (e.g. files that appeared on disk since the project was saved)
  const needDims = gridItems.filter((it) => it.full && (!it.w || !it.h));
  if (needDims.length) {
    const dims = await imageDims(needDims.map((it) => it.full)).catch((e) => {
      toast(`Image dimension lookup failed: ${e}`, true);
      return needDims.map(() => null);
    });
    needDims.forEach((it, i) => {
      const d = dims[i];
      if (d) {
        it.w = d[0];
        it.h = d[1];
      }
    });
  }
  const paths = new Set<string>();
  for (const it of items) {
    if (!it.full) continue;
    paths.add(deriveMinPath(it.full));
    if (it.thumb) paths.add(it.thumb);
  }
  const list = [...paths];
  // permissive fallback (assume present) so a backend failure never blocks
  // opening — but say so instead of silently dropping the ⚠ thumb badges
  const results = await checkFiles(list).catch((e) => {
    toast(`Thumbnail check failed: ${e}`, true);
    return list.map(() => true);
  });
  const exists = new Map(list.map((p, i) => [p, results[i]]));
  for (const it of items) {
    if (!it.full) continue;
    if (!it.thumb) it.thumb = it.full;
    const expected = deriveMinPath(it.full);
    if (it.thumb === it.full && expected !== it.full) {
      if (exists.get(expected)) {
        it.thumb = expected;
        it.thumbMissing = false;
      } else {
        it.thumbMissing = true;
      }
    } else {
      it.thumbMissing = !exists.get(it.thumb);
    }
  }
}

/// Recompute download-block hashes from the actual file bytes (the published
/// hashes must never go stale). Mutates items in place; the caller decides
/// what to do with the result. Not undoable by design — it's verification,
/// not an edit.
async function refreshDownloadHashes(
  blocks: Block[]
): Promise<{ changed: string[]; missing: string[]; dirtied: boolean }> {
  const items: DownloadItem[] = [];
  walkBlocks(blocks, (b) => {
    if (b.type === "downloads") items.push(...b.items.filter((it) => it.src));
  });
  if (!items.length) return { changed: [], missing: [], dirtied: false };
  // a backend failure is not "every file is missing" — report it and leave
  // the stored hashes untouched
  const hashes = await hashFiles(items.map((it) => it.src)).catch((e) => {
    toast(`Download hash check failed: ${e}`, true);
    return null;
  });
  if (!hashes) return { changed: [], missing: [], dirtied: false };
  const changed: string[] = [];
  const missing: string[] = [];
  let dirtied = false;
  items.forEach((it, i) => {
    const h = hashes[i];
    const name = it.src.split("/").pop() || it.src;
    if (!h) {
      if (!it.missing) dirtied = true;
      it.missing = true;
      missing.push(name);
      return;
    }
    if (it.missing) dirtied = true;
    it.missing = false;
    if (it.sha256 !== h.sha256 || it.sha512 !== h.sha512 || it.size !== h.size) {
      if (it.sha256) changed.push(name); // only report real changes, not first fills
      it.sha256 = h.sha256;
      it.sha512 = h.sha512;
      it.size = h.size;
      dirtied = true;
    }
  });
  return { changed, missing, dirtied };
}

async function doNew(): Promise<void> {
  if (store.dirty && !(await ask("Discard unsaved changes?", { title: "New page" }))) return;
  store.newProject();
}

async function doOpen(): Promise<void> {
  if (store.dirty && !(await ask("Discard unsaved changes?", { title: "Open project" }))) return;
  const projects = await invoke<{ name: string; modified: number }[]>("list_projects");
  const name = await listModal<string>(
    "Open project",
    projects.map((p) => ({
      label: p.name,
      hint: p.modified ? new Date(p.modified * 1000).toLocaleString() : "",
      value: p.name,
    }))
  );
  if (!name) return;
  try {
    const raw = await invoke<string>("load_project", { name });
    const project = normalizeProject(JSON.parse(raw));
    await revalidateThumbs(project);
    await prefetchSvgs(collectSvgSrcs(project.blocks));
    const hashState = await refreshDownloadHashes(project.blocks);
    store.loadProject(name, project);
    if (hashState.changed.length) {
      toast(`Opened ${name} — download hashes updated: ${hashState.changed.join(", ")}`);
    } else {
      toast(`Opened ${name}`);
    }
  } catch (e) {
    toast(String(e), true);
  }
}

async function doSave(saveAs: boolean): Promise<void> {
  let name = store.projectName;
  if (!name || saveAs) {
    name = await promptModal(
      "Save project as",
      name ?? slugify(store.meta.title),
      "Saved to page_builder/projects/<name>.json"
    );
    if (!name) return;
  }
  try {
    const path = await invoke<string>("save_project", {
      name,
      data: JSON.stringify(store.project, null, 2),
    });
    store.projectName = name;
    store.dirty = false;
    updateTitle();
    toast(`Saved ${path}`);
  } catch (e) {
    toast(String(e), true);
  }
}

async function doExport(): Promise<void> {
  if (!store.meta.title.trim()) {
    await message("Set a page title first — it becomes the file name and the page slug.", {
      title: "Export",
    });
    return;
  }
  // themed svgs are inlined at render time — load them before linting/export;
  // download hashes are recomputed so the published values match the bytes
  await prefetchSvgs(collectSvgSrcs(store.blocks));
  const hashState = await refreshDownloadHashes(store.blocks);
  if (hashState.dirtied) {
    store.dirty = true;
    store.emit("content");
  }
  const warns = lintPage(store.meta, store.blocks).filter((i) => i.severity === "warn");
  for (const name of hashState.missing) {
    warns.push({
      severity: "warn",
      message: `Download file ${name} is missing on disk — its link and hashes would be broken.`,
    });
  }
  for (const src of collectSvgSrcs(store.blocks)) {
    if (!hasSvgText(src)) {
      warns.push({
        severity: "warn",
        message: `SVG ${src} could not be read — a placeholder would be exported.`,
      });
    }
  }
  if (warns.length) {
    const ok = await ask(
      `The page check found:\n\n${warns.map((w) => `• ${w.message}`).join("\n")}\n\nExport anyway?`,
      { title: "Page check" }
    );
    if (!ok) return;
  }
  const remembered = store.project.exportSlug;
  const input = await promptModal(
    "Export as html_extras/<name>.html",
    remembered ?? slugify(store.meta.title),
    "The name is also the page slug (canonical URL)."
  );
  if (!input) return;
  const slug = slugify(input);
  try {
    const shell = await invoke<string>("read_shell");
    const contents = exportText(shell, store.meta, store.blocks, store.siteUrl, slug);
    // re-exporting to the slug this project already owns skips the confirm
    let res = await invoke<ExportResult>("export_page", {
      fileName: `${slug}.html`,
      contents,
      overwrite: slug === remembered,
    });
    if (res.exists) {
      const ok = await ask(`${res.path} already exists.\nOverwrite it?`, { title: "Export" });
      if (!ok) return;
      res = await invoke<ExportResult>("export_page", {
        fileName: `${slug}.html`,
        contents,
        overwrite: true,
      });
    }
    if (store.project.exportSlug !== slug) {
      store.project.exportSlug = slug;
      store.dirty = true;
      updateTitle();
    }
    const hashNote = hashState.changed.length
      ? ` (download hashes refreshed: ${hashState.changed.join(", ")})`
      : "";
    toast(`Exported ${res.path} — run the Eleventy build to publish it${hashNote}`);
  } catch (e) {
    toast(String(e), true);
  }
}

// ---------------------------------------------------------------- shell check

function renderShellBadge(report: FreshnessReport): void {
  clear(shellWarning);
  const stale = report.regions.filter((r) => !r.matches);
  if (!stale.length) return;
  shellWarning.appendChild(
    el(
      "div",
      { class: "shell-badge" },
      el("span", {}, `⚠ shell.html may be stale (${stale.map((r) => r.name).join(", ")} differ from ${report.reference})`),
      el("button", { class: "small", onclick: () => showShellDiff(report) }, "Details")
    )
  );
}

function showShellDiff(report: FreshnessReport): void {
  const content = el("div", { class: "shell-diff" });
  for (const region of report.regions) {
    const section = el(
      "section",
      {},
      el("h4", {}, `${region.name} — ${region.matches ? "✓ matches" : "✗ differs"}`)
    );
    if (!region.matches) {
      section.append(
        el(
          "div",
          { class: "diff-cols" },
          el("div", {}, el("h5", {}, "shell.html"), el("pre", {}, region.shellExcerpt)),
          el("div", {}, el("h5", {}, report.reference), el("pre", {}, region.referenceExcerpt))
        )
      );
      if (region.adoptable) {
        section.append(
          el(
            "button",
            {
              onclick: async () => {
                try {
                  await invoke("adopt_shell_region", { region: region.name });
                  toast(`Adopted <${region.name}> from ${report.reference}`);
                  close();
                  await checkShell();
                  bridge.load(store.previewPort); // shell changed -> reload preview doc
                } catch (e) {
                  toast(String(e), true);
                }
              },
            },
            `Adopt ${region.name} from reference`
          )
        );
      }
    }
    content.appendChild(section);
  }
  const close = contentModal("Shell freshness", content);
}

async function checkShell(): Promise<void> {
  try {
    const report = await invoke<FreshnessReport>("check_shell_freshness");
    renderShellBadge(report);
  } catch (e) {
    // e.g. the reference page was renamed/retired — staleness detection is
    // dead until REFERENCE_PAGE in commands.rs is updated, so make it visible
    toast(`Shell freshness check failed: ${e}`, true);
  }
}

// ---------------------------------------------------------------- keyboard & close guard

document.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && key === "s") {
    e.preventDefault();
    void doSave(false);
  } else if (mod && !typing && key === "z" && !e.shiftKey) {
    e.preventDefault();
    store.undo();
  } else if (mod && !typing && (key === "y" || (key === "z" && e.shiftKey))) {
    e.preventDefault();
    store.redo();
  } else if (!typing && e.key === "Delete" && store.selectedBlock) {
    e.preventDefault();
    void confirmDelete(store.selectedBlock.id, blockSummary(store.selectedBlock));
  } else if (mod && !typing && key === "d" && store.selectedId) {
    e.preventDefault();
    store.duplicateBlock(store.selectedId);
  }
});

getCurrentWindow()
  .onCloseRequested(async (event) => {
    if (!store.dirty) return;
    event.preventDefault();
    const ok = await ask("There are unsaved changes. Close anyway?", { title: "Unsaved changes" });
    if (ok) {
      store.dirty = false;
      void getCurrentWindow().close();
    }
  })
  .catch(() => {});

// ---------------------------------------------------------------- boot

function showLocateOverlay(): void {
  const err = el("p", { class: "error" });
  const overlay = el(
    "div",
    { class: "locate-overlay" },
    el(
      "div",
      { class: "modal-box" },
      el("h3", {}, "Site repo not found"),
      el(
        "p",
        { class: "hint" },
        "Point the builder at your website folder (the one containing eleventy.config.js and html_extras/)."
      ),
      err,
      el(
        "button",
        {
          onclick: async () => {
            try {
              const root = await invoke<string | null>("locate_repo");
              if (root) {
                store.repoRoot = root;
                overlay.remove();
                bridge.load(store.previewPort);
                void checkShell();
              }
            } catch (e) {
              err.textContent = String(e);
            }
          },
        },
        "Locate repo…"
      )
    )
  );
  document.body.appendChild(overlay);
}

async function init(): Promise<void> {
  const cfg = await invoke<Config>("get_config");
  store.repoRoot = cfg.repoRoot;
  store.previewPort = cfg.previewPort;
  store.siteUrl = cfg.siteUrl;

  renderMetaForm(metaForm);
  renderBlockList(blockList);
  renderBlockForm(blockEditor);
  updateModeButton();
  updateTitle();
  renderPageCheck();

  if (!cfg.repoRoot) {
    showLocateOverlay();
  } else {
    bridge.load(cfg.previewPort);
    void checkShell();
  }
}

void init();
