/*
 * Shell freshness.
 *
 * `shell.html` is this app's private copy of the page boilerplate — nav,
 * footer, head assets. The real site's nav and footer live in the hand-written
 * pages and drift over time (a new menu item, a changed footer link). When they
 * drift, every page exported from here silently ships stale chrome.
 *
 * The Rust side already does the comparison: check_shell_freshness diffs the
 * shell's <nav> and <footer> against a REFERENCE_PAGE
 * (input_custom_html_pages/galdhopiggen.html), ignoring placeholders and
 * whitespace, and adopt_shell_region copies a region across. This is the UI for
 * those two commands — v1 had it in main.ts:569-636 and it was the one piece of
 * the port with no v2 equivalent.
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "../ui/toast";
import { ConfirmPrompt } from "./prompts";

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

export function ShellCheck() {
  const [report, setReport] = useState<FreshnessReport | null>(null);
  const [open, setOpen] = useState<RegionReport | null>(null);
  const [busy, setBusy] = useState(false);

  const check = () =>
    invoke<FreshnessReport>("check_shell_freshness")
      .then(setReport)
      // A missing reference page is not worth a toast on every boot — the
      // badge simply stays hidden.
      .catch(() => setReport(null));

  useEffect(() => {
    void check();
  }, []);

  const stale = report?.regions.filter((r) => !r.matches) ?? [];
  if (!report || stale.length === 0) return null;

  const adopt = async (region: RegionReport) => {
    setBusy(true);
    try {
      await invoke("adopt_shell_region", { region: region.name });
      toast(`Adopted <${region.name}> from ${report.reference}`);
      setOpen(null);
      await check();
    } catch (e) {
      toast(String(e), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="pb-shell">
        <div className="pb-shell__head">
          Shell out of date
          <span className="pb-shell__ref">vs {report.reference}</span>
        </div>
        <p className="pb-shell__body">
          Exported pages would ship stale page chrome. Adopt each region to copy
          it from the reference page.
        </p>
        {stale.map((r) => (
          <button
            key={r.name}
            type="button"
            className="pb-shell__region"
            disabled={!r.adoptable || busy}
            onClick={() => setOpen(r)}
            title={r.adoptable ? undefined : `<${r.name}> not found in one of the files`}
          >
            &lt;{r.name}&gt; differs{r.adoptable ? " — review" : " (cannot adopt)"}
          </button>
        ))}
      </div>

      {open && (
        <ConfirmPrompt
          title={`Adopt <${open.name}> from ${report.reference}?`}
          message={
            <>
              <p>
                This overwrites the <code>&lt;{open.name}&gt;</code> region of this
                app's <code>shell.html</code>. Placeholders are preserved.
              </p>
              <p className="pb-shell__label">Reference version:</p>
              <pre className="pb-shell__pre">{open.referenceExcerpt.slice(0, 1500)}</pre>
              <p className="pb-shell__label">Current shell version:</p>
              <pre className="pb-shell__pre">{open.shellExcerpt.slice(0, 1500)}</pre>
            </>
          }
          confirmLabel="Adopt"
          onCancel={() => setOpen(null)}
          onConfirm={() => void adopt(open)}
        />
      )}
    </>
  );
}
