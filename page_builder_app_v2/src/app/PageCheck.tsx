/*
 * Live page check, shown under the fields panel. Re-runs on every edit, so the
 * heading outline and SEO warnings appear as you type rather than only at
 * export time — which is also when export re-runs it and asks for confirmation.
 */
import { useMemo } from "react";
import { usePuck } from "@measured/puck";
import { config } from "../puck/config";
import { lintPage } from "../export/lint";
import { renderExportContent, renderExportHero } from "../export/renderExport";

export function PageCheck() {
  const data = usePuck().appState.data;

  const issues = useMemo(() => {
    try {
      const html = `${renderExportHero(data as any)}\n${renderExportContent(data as any)}`;
      return lintPage({ data: data as any, config, html });
    } catch (e) {
      // A half-typed markdown block must never take the panel down with it.
      return [{ severity: "warn" as const, message: `Page check failed: ${String(e)}` }];
    }
  }, [data]);

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
