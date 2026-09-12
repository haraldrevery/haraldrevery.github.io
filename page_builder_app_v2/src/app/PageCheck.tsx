/*
 * Live page check, shown under the fields panel.
 *
 * The check is NOT cheap. It runs the REAL export renderers —
 * renderToStaticMarkup over the whole tree, then js-beautify — so that what it
 * scans is exactly the markup that would be written to disk, rather than a
 * cheaper approximation that could disagree with the export. On a long page
 * that is tens of milliseconds, and it used to run once per keystroke, on
 * React's synchronous render path: type a paragraph and the editor renders the
 * entire page as many times as you typed characters.
 *
 * The fix debounces the DATA the check runs against, not the render. The panel
 * keeps showing its last result and re-checks once typing pauses, so a burst of
 * N keystrokes costs one render instead of N. The export path is untouched and
 * still renders on demand — one render path, as before.
 *
 * Deliberately no "stale" indicator: the result is at most RECHECK_DELAY_MS old,
 * which is below the threshold where anyone would be misled, and a badge that
 * flickered on every keystroke would be more distracting than the lag it
 * describes. The trade-off is that typing continuously for a long time keeps
 * showing the result from the last pause.
 *
 * The one part that needs the backend is the on-disk file check, so it runs
 * as an async effect on the same debounced data and is folded in when it
 * lands. Until then the panel keeps the previous file list: files go missing
 * far more rarely than text changes, and blanking the warning on every pause
 * would make it flicker.
 */
import { useEffect, useMemo, useState } from "react";
import { usePuck, type Data } from "@measured/puck";
import { config } from "../puck/config";
import { lintPage, type LintIssue } from "../export/lint";
import { renderExportContent, renderExportHero, renderExportHeader } from "../export/renderExport";
import { humanDate } from "../export/export";
import { findMissingMedia } from "../export/fixups";

/// Long enough that a normal typing burst collapses into one run, short enough
/// that the panel still feels live when you stop.
const RECHECK_DELAY_MS = 300;

/*
 * The whole check, as a plain function of the data — no hooks, so it is
 * testable without a React renderer and the component below stays pure glue.
 * Same split as listOps.ts: the part worth testing carries no React.
 *
 * `missingFiles` is the result of the async on-disk lookup; empty = none
 * found, or not looked up yet.
 */
export function runPageCheck(data: Data, missingFiles: string[] = []): LintIssue[] {
  try {
    const html = [
      renderExportHero(data),
      renderExportHeader(data, humanDate),
      renderExportContent(data),
    ].join("\n");
    return lintPage({ data, config, html, missingFiles });
  } catch (e) {
    // A half-typed markdown block must never take the panel down with it.
    return [{ severity: "warn" as const, message: `Page check failed: ${String(e)}` }];
  }
}

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

export function PageCheck() {
  const data = usePuck().appState.data as Data;

  /*
   * The data the displayed result was computed from.
   *
   * Seeded with the mount-time data on purpose: Puck remounts this on every
   * project open, and a debounce that also delayed the FIRST result would make
   * opening a page look like the panel was broken for a third of a second.
   */
  const [checked, setChecked] = useState(data);
  const behind = checked !== data;

  useEffect(() => {
    if (!behind) return;
    const t = setTimeout(() => setChecked(data), RECHECK_DELAY_MS);
    // Each new keystroke clears the pending run before scheduling its own, so
    // this is a trailing debounce rather than a queue of stale renders. Also
    // cancels on unmount, so no run can outlive the panel.
    return () => clearTimeout(t);
  }, [data, behind]);

  const [missingFiles, setMissingFiles] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    findMissingMedia(checked, config).then((files) => {
      // Keep the same array when nothing changed, so an unchanged result does
      // not re-run the whole render below.
      if (live) setMissingFiles((prev) => (sameList(prev, files) ? prev : files));
    });
    // A slow lookup for older data must not overwrite a newer result.
    return () => {
      live = false;
    };
  }, [checked]);

  const issues = useMemo(() => runPageCheck(checked, missingFiles), [checked, missingFiles]);

  const warns = issues.filter((i) => i.severity === "warn").length;

  return (
    <div className="pb-check">
      <div className="pb-check__head">
        Page check
        {issues.length === 0 ? (
          <span className="pb-check__ok">all clear</span>
        ) : (
          <span className={warns ? "pb-check__warn" : "pb-check__info"}>
            {warns ? `${warns} to fix` : `${issues.length} note${issues.length > 1 ? "s" : ""}`}
          </span>
        )}
      </div>
      {issues.length > 0 && (
        <ul className="pb-check__list">
          {issues.map((i, n) => (
            <li key={n} className={`pb-check__item pb-check__item--${i.severity}`}>
              {i.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
