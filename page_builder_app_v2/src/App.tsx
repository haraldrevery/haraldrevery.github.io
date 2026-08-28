import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Puck, type Data } from "@measured/puck";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { config } from "./puck/config";
import { makeSiteFrame } from "./puck/SiteFrame";
import { useAppConfig } from "./appConfig";
import { toast } from "./ui/toast";
import {
  RECOVERY_MS, agoLabel, clearRecovery, readRecovery, writeRecovery,
  type FoundDraft,
} from "./app/recovery";
import { Toolbar } from "./app/Toolbar";
import { PageCheck } from "./app/PageCheck";
import { ShellCheck } from "./app/ShellCheck";
import { ConfirmPrompt, ListPrompt, TextPrompt } from "./app/prompts";
import { PreviewModal } from "./app/PreviewModal";
import { useSaveShortcut, useTextUndoShim } from "./app/keyboard";
import {
  PROJECT_VERSION, buildExport, buildPreview, listProjects, loadProject, readShell,
  saveProject, setPreviewHtml, writeExport, type ProjectFileV2, type ProjectInfo,
} from "./app/project";

const EMPTY: Data = { root: { props: {} }, content: [] } as unknown as Data;

type Dialog =
  | { kind: "none" }
  | { kind: "saveAs"; initial: string }
  | { kind: "open"; items: ProjectInfo[] }
  | { kind: "confirmSaveOverwrite"; name: string }
  | { kind: "exportSlug"; initial: string }
  | { kind: "exportWarn"; slug: string; issues: string[] }
  | { kind: "confirmExportOverwrite"; slug: string; fileName: string; contents: string; path: string }
  | { kind: "discard"; then: () => void }
  | { kind: "restore"; draft: FoundDraft };

export default function App() {
  const cfg = useAppConfig();

  const [data, setData] = useState<Data>(EMPTY);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [exportSlug, setExportSlug] = useState<string | undefined>(undefined);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [previewOpen, setPreviewOpen] = useState(false);

  /// Puck's `data` prop is INITIAL state — it is copied into Puck's store on
  /// mount and changing it afterwards does not re-sync. Bumping this key
  /// remounts Puck, which is the reliable way to load a different project.
  const [puckKey, setPuckKey] = useState(0);

  /// Guards against a second Open finishing before the first: four sequential
  /// awaits still race, and React does not help with that.
  const openEpoch = useRef(0);
  const liveData = useRef<Data>(EMPTY);

  const overrides = useMemo(
    () => (cfg ? { iframe: makeSiteFrame(cfg.previewPort) } : undefined),
    [cfg?.previewPort],
  );

  const onChange = useCallback((next: Data) => {
    liveData.current = next;
    setDirty(true);
  }, []);

  const loadInto = (file: ProjectFileV2, name: string | null) => {
    // The open preview belongs to the outgoing page; keeping it up would show a
    // document that no longer corresponds to anything in the editor.
    setPreviewOpen(false);
    setData(file.data);
    liveData.current = file.data;
    setExportSlug(file.exportSlug);
    setProjectName(name);
    setDirty(false);
    setPuckKey((k) => k + 1);
  };

  // --------------------------------------------------------------- new / open

  const guardUnsaved = (then: () => void) => {
    if (dirty) setDialog({ kind: "discard", then });
    else then();
  };

  const doNew = () =>
    guardUnsaved(() => {
      // Whatever the draft held, the user has just said to abandon it.
      void clearRecovery();
      loadInto({ version: PROJECT_VERSION, data: EMPTY }, null);
    });

  const doOpen = () =>
    guardUnsaved(async () => {
      try {
        setDialog({ kind: "open", items: await listProjects() });
      } catch (e) {
        toast(String(e), true);
      }
    });

  const openNamed = async (name: string) => {
    const epoch = ++openEpoch.current;
    setDialog({ kind: "none" });
    setBusy("Opening…");
    try {
      const { file, hashes } = await loadProject(name);
      if (epoch !== openEpoch.current) return; // a later Open won
      void clearRecovery();
      loadInto(file, name);
      // Report reconciliation against disk. `dirtied` means the project on disk
      // no longer matches what was just loaded, so mark it unsaved.
      if (hashes.missing.length) {
        toast(`Missing on disk: ${hashes.missing.join(", ")}`, true);
      } else if (hashes.changed.length) {
        toast(`Hashes updated for ${hashes.changed.join(", ")} — save to keep them.`);
      }
      if (hashes.dirtied) setDirty(true);
    } catch (e) {
      toast(String(e), true);
    } finally {
      if (epoch === openEpoch.current) setBusy(null);
    }
  };

  // --------------------------------------------------------------- recovery

  /*
   * Offer any draft a crash left behind. Runs once, and only once the repo is
   * located: a draft is not actionable in an app that cannot open or export
   * anything, and the boot screen is already showing that as the real problem.
   */
  const checkedRecovery = useRef(false);
  useEffect(() => {
    if (!cfg?.repoRoot || checkedRecovery.current) return;
    checkedRecovery.current = true;
    void readRecovery().then((draft) => {
      if (draft) setDialog({ kind: "restore", draft });
    });
  }, [cfg?.repoRoot]);

  /*
   * Snapshot while — and only while — there are unsaved changes. The effect is
   * keyed on `dirty`, so a clean project costs nothing and the interval stops
   * itself the moment the work is saved.
   *
   * Writes once immediately as well as on the interval: dirty goes false->true
   * exactly once per edit session, so that is one extra write, and without it a
   * crash in the first 15 seconds would still cost everything.
   *
   * A failed snapshot is deliberately silent. This runs every 15s in the
   * background; a toast per failure would bury the errors that matter under the
   * one error the user cannot act on anyway.
   */
  useEffect(() => {
    if (!dirty) return;
    const snapshot = () => {
      void writeRecovery({
        name: projectName,
        file: { version: PROJECT_VERSION, exportSlug, data: liveData.current },
      }).catch(() => {});
    };
    snapshot();
    const t = setInterval(snapshot, RECOVERY_MS);
    return () => clearInterval(t);
  }, [dirty, projectName, exportSlug]);

  // ------------------------------------------------------------------- save

  const writeProject = async (name: string, overwrite: boolean) => {
    const file: ProjectFileV2 = {
      version: PROJECT_VERSION,
      exportSlug,
      data: liveData.current,
    };
    setBusy("Saving…");
    try {
      const res = await saveProject(name, file, overwrite);
      if (!res.written && res.exists) {
        setDialog({ kind: "confirmSaveOverwrite", name });
        return;
      }
      // Sanitising is lossy, so adopt the name the backend actually used or the
      // title bar and the Open list disagree.
      setProjectName(res.name);
      setDirty(false);
      // The work is on disk; the safety net has nothing left to protect.
      void clearRecovery();
      toast(`Saved ${res.name}.json`);
    } catch (e) {
      toast(String(e), true);
    } finally {
      setBusy(null);
    }
  };

  const doSave = useCallback(() => {
    if (projectName) void writeProject(projectName, true);
    else setDialog({ kind: "saveAs", initial: suggestName(liveData.current) });
  }, [projectName, exportSlug]);

  // ---------------------------------------------------------------- preview

  /// Render the live editor state and hand it to the Rust server, which serves
  /// it at /__pb/preview. Nothing is written to the repo, and buildPreview does
  /// not mutate `data`, so opening a preview never dirties the project.
  const renderPreview = async () => {
    const shell = await readShell();
    await setPreviewHtml(await buildPreview(liveData.current, shell, cfg!.siteUrl, exportSlug));
  };

  const doPreview = async () => {
    setBusy("Rendering…");
    try {
      await renderPreview();
      setPreviewOpen(true);
    } catch (e) {
      toast(String(e), true);
    } finally {
      setBusy(null);
    }
  };

  // ----------------------------------------------------------------- export

  const startExport = () => setDialog({ kind: "exportSlug", initial: exportSlug ?? "" });

  /*
   * Record the slug the page was just published under. Both export paths end
   * here — the direct write and the overwrite confirmation — because the slug
   * is part of the project file, so forgetting it on one path leaves the title
   * bar, the next Export dialog and the preview's canonical URL describing a
   * file that is no longer the one on disk.
   *
   * A changed slug is an unsaved change: without the dirty flag you could
   * export under a new name, close on the "no changes" path, and lose the
   * association silently.
   */
  const adoptExportSlug = (slug: string) => {
    if (slug !== exportSlug) setDirty(true);
    setExportSlug(slug);
  };

  const runExport = async (slugInput: string, skipWarnings: boolean) => {
    setBusy("Rendering…");
    try {
      const shell = await readShell();
      const bundle = await buildExport(liveData.current, shell, cfg!.siteUrl, slugInput);

      const warns = bundle.issues.filter((i) => i.severity === "warn").map((i) => i.message);
      if (warns.length && !skipWarnings) {
        setDialog({ kind: "exportWarn", slug: bundle.slug, issues: warns });
        return;
      }

      const res = await writeExport(bundle.fileName, bundle.contents, false);
      if (!res.written && res.exists) {
        setDialog({
          kind: "confirmExportOverwrite",
          slug: bundle.slug,
          fileName: bundle.fileName,
          contents: bundle.contents,
          path: res.path,
        });
        return;
      }
      adoptExportSlug(bundle.slug);
      toast(`Exported ${bundle.fileName} — run the Eleventy build to publish.`);
    } catch (e) {
      toast(String(e), true);
    } finally {
      setBusy(null);
    }
  };

  // -------------------------------------------------------------- shortcuts

  useSaveShortcut(doSave);
  useTextUndoShim();

  /*
   * Close guard. destroy(), not close(): close() fires another close-requested
   * event, so calling it from inside the handler re-enters this code and the
   * window never actually goes away.
   */
  useEffect(() => {
    const win = getCurrentWindow();
    const un = win.onCloseRequested(async (e) => {
      if (!dirty) return;
      e.preventDefault();
      setDialog({
        kind: "discard",
        then: () => {
          // Clear BEFORE destroying: the user chose to discard, so being
          // offered the same work again on next launch would ignore that.
          void clearRecovery().finally(() => void win.destroy());
        },
      });
    });
    return () => {
      void un.then((f) => f());
    };
  }, [dirty]);

  useEffect(() => {
    void getCurrentWindow().setTitle(
      `${dirty ? "● " : ""}${projectName ?? "Untitled"} — Notebook Page Builder v2`,
    );
  }, [projectName, dirty]);

  // ------------------------------------------------------------------ boot

  if (!cfg) return <div className="pb-boot">Locating site repo…</div>;
  if (!cfg.repoRoot) {
    return (
      <div className="pb-boot pb-boot--error">
        Site repo not located. It must contain both <code>eleventy.config.js</code> and{" "}
        <code>eleventy_settings/</code>.
      </div>
    );
  }

  return (
    <>
      <Puck
        key={puckKey}
        config={config}
        data={data}
        onChange={onChange}
        iframe={{ enabled: true, waitForStyles: true }}
        overrides={overrides}
      >
        <div className="pb-layout">
          <Toolbar
            projectName={projectName}
            dirty={dirty}
            busy={busy}
            onNew={doNew}
            onOpen={doOpen}
            onSave={doSave}
            onSaveAs={() => setDialog({ kind: "saveAs", initial: projectName ?? suggestName(liveData.current) })}
            onPreview={() => void doPreview()}
            onExport={startExport}
          />
          <div className="pb-layout__body">
            <aside className="pb-layout__left">
              <Puck.Components />
              <Puck.Outline />
            </aside>
            <main className="pb-layout__center">
              <Puck.Preview />
            </main>
            <aside className="pb-layout__right">
              <Puck.Fields />
              <PageCheck />
              <ShellCheck />
            </aside>
          </div>
        </div>
      </Puck>

      {previewOpen && (
        <PreviewModal
          previewPort={cfg.previewPort}
          title={pageTitle(liveData.current)}
          onClose={() => setPreviewOpen(false)}
          onReload={renderPreview}
        />
      )}

      {renderDialog()}
    </>
  );

  function renderDialog() {
    const close = () => setDialog({ kind: "none" });
    switch (dialog.kind) {
      case "none":
        return null;

      case "restore":
        return (
          <ConfirmPrompt
            title="Unsaved work found"
            message={
              <>
                <p>
                  Changes to <strong>{dialog.draft.name ?? "an untitled page"}</strong> were
                  never saved ({agoLabel(dialog.draft.modified)}). Restore them?
                </p>
                <p>
                  “Not now” keeps the draft — it is discarded once you save, open
                  another project, or start a new page.
                </p>
              </>
            }
            confirmLabel="Restore"
            cancelLabel="Not now"
            onCancel={close}
            onConfirm={() => {
              close();
              loadInto(dialog.draft.file, dialog.draft.name);
              // Restored work is still unsaved work: the dot stays, the close
              // guard still fires, and the autosave keeps snapshotting it.
              setDirty(true);
              toast("Unsaved work restored — save it to keep it.");
            }}
          />
        );

      case "discard":
        return (
          <ConfirmPrompt
            title="Unsaved changes"
            message="This page has changes that have not been saved. Discard them?"
            confirmLabel="Discard"
            danger
            onCancel={close}
            onConfirm={() => {
              close();
              dialog.then();
            }}
          />
        );

      case "saveAs":
        return (
          <TextPrompt
            title="Save project as"
            label="Project name (letters, numbers, - and _)"
            initial={dialog.initial}
            confirmLabel="Save"
            onCancel={close}
            onConfirm={(v) => {
              close();
              void writeProject(v, false);
            }}
          />
        );

      case "confirmSaveOverwrite":
        return (
          <ConfirmPrompt
            title="Project exists"
            message={<>A project named <code>{dialog.name}</code> already exists. Overwrite it?</>}
            confirmLabel="Overwrite"
            danger
            onCancel={close}
            onConfirm={() => {
              close();
              void writeProject(dialog.name, true);
            }}
          />
        );

      case "open":
        return (
          <ListPrompt
            title="Open project"
            items={dialog.items.map((p) => ({
              name: p.name,
              sub: new Date(p.modified * 1000).toLocaleString(),
            }))}
            empty="No saved projects yet."
            onCancel={close}
            onPick={(n) => void openNamed(n)}
          />
        );

      case "exportSlug":
        return (
          <TextPrompt
            title="Export page"
            label="File name (leave blank to derive it from the title)"
            initial={dialog.initial}
            confirmLabel="Export"
            allowEmpty
            onCancel={close}
            onConfirm={(v) => {
              close();
              void runExport(v, false);
            }}
          />
        );

      case "exportWarn":
        return (
          <ConfirmPrompt
            title="Page check"
            message={
              <>
                <p>Export anyway?</p>
                <ul className="pb-modal__issues">
                  {dialog.issues.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </>
            }
            confirmLabel="Export anyway"
            onCancel={close}
            onConfirm={() => {
              close();
              void runExport(dialog.slug, true);
            }}
          />
        );

      case "confirmExportOverwrite":
        return (
          <ConfirmPrompt
            title="Page exists"
            message={<>Overwrite <code>{dialog.path}</code>?</>}
            confirmLabel="Overwrite"
            danger
            onCancel={close}
            onConfirm={async () => {
              close();
              setBusy("Writing…");
              try {
                await writeExport(dialog.fileName, dialog.contents, true);
                adoptExportSlug(dialog.slug);
                toast(`Exported ${dialog.fileName} — run the Eleventy build to publish.`);
              } catch (e) {
                toast(String(e), true);
              } finally {
                setBusy(null);
              }
            }}
          />
        );
    }
  }
}

/// The page's own SEO title, unsanitised — for display only.
function pageTitle(data: Data): string {
  return String(((data.root?.props ?? {}) as any)?.meta?.title ?? "").trim();
}

/// A save-as default derived from the page title, so the common case is Enter.
function suggestName(data: Data): string {
  return pageTitle(data).replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
}
