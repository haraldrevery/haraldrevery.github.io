/*
 * List-shaped blocks: Icons, Faq, Downloads.
 * Transcribed from page_builder/src/blocks/render.ts:348-466.
 */
import type { PuckContext } from "@measured/puck";
import { BlockShell } from "../nesting";
import { EmptyHint } from "../EmptyHint";
import { getSvgText, themeSvgText, prepareSvgForInline } from "../../blocks/svgStore";
import { renderMarkdown } from "../../markdown";
import { humanSize } from "../shared";
import type { Spacing } from "../spacing";

// --------------------------------------------------------------------- icons

export interface IconItem {
  src: string;
  /// Accessible name; rendered sr-only. The lint pass flags empty ones.
  label: string;
  href: string;
}

export interface IconsProps {
  size: "small" | "medium" | "large";
  /// Optional panel label (release-page "Listen everywhere" style). When set,
  /// the row is left-aligned under the label instead of centred.
  label: string;
  items: IconItem[];
  spacing: Spacing;
  puck?: PuckContext;
}

/// Social/icon link row, mirroring the footer pattern: inlined currentColor
/// svgs, sr-only labels, hover:opacity-50 muting.
export function Icons({ size, label, items, spacing, puck }: IconsProps) {
  const list = items ?? [];
  if (list.length === 0 && puck?.isEditing) {
    return <EmptyHint label="No icons — add SVGs in the sidebar" />;
  }

  const sizeCls = size === "small" ? "w-6 h-6" : size === "medium" ? "w-8 h-8" : "";
  const sizeStyle = size === "large" ? { width: "2.5rem", height: "2.5rem" } : undefined;

  const links = list.map((it, i) => {
    const external = /^https?:\/\//.test(it.href);
    const text = it.src ? getSvgText(it.src) : undefined;
    return (
      <a
        key={i}
        className="transition-opacity duration-300 hover:opacity-50"
        href={it.href || "#"}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        <span className="sr-only">{it.label}</span>
        {/* The inlined svg becomes this div's OWN innerHTML — a <span> around
            it would be an element v1 never emitted. */}
        {text !== undefined ? (
          <div
            className={`${sizeCls} flex items-center justify-center`}
            style={sizeStyle}
            dangerouslySetInnerHTML={{ __html: prepareSvgForInline(themeSvgText(text)) }}
          />
        ) : (
          <div className={`${sizeCls} flex items-center justify-center`} style={sizeStyle}>
            <span className="font-mono text-sm">[{it.src || "no svg"}]</span>
          </div>
        )}
      </a>
    );
  });

  // A labelled panel mirrors the release pages ("Listen everywhere"): mono
  // uppercase label + left-aligned row. Unlabelled = centred footer style.
  // letter-spacing is inline because tracking-eyebrow only ships if a scanned
  // file uses it, so it may not be in the compiled css.
  return (
    <BlockShell spacing={spacing}>
      {label.trim() ? (
        <>
          <p className="font-mono text-xs uppercase opacity-50 mb-4" style={{ letterSpacing: "0.3em" }}>
            {label}
          </p>
          <div className="flex flex-wrap items-center gap-6 text-gray-600 dark:text-gray-300">
            {links}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap justify-center items-center gap-6 text-gray-600 dark:text-gray-300">
          {links}
        </div>
      )}
    </BlockShell>
  );
}

// ----------------------------------------------------------------------- faq

export interface FaqItem {
  q: string;
  /// markdown
  a: string;
}

export interface FaqProps {
  items: FaqItem[];
  spacing: Spacing;
  id?: string;
  puck?: PuckContext;
}

/*
 * about.html-style CSS-only accordion: a hidden checkbox plus a label toggle
 * .faq-answer's max-height through :checked sibling selectors. No JS.
 *
 * Checkbox ids are prefixed with the block id so two FAQ blocks on one page
 * cannot collide — clicking one question would otherwise open the other's answer.
 */
export function Faq({ items, spacing, id, puck }: FaqProps) {
  const list = (items ?? []).filter((it) => it.q.trim() || it.a.trim());
  if (list.length === 0 && puck?.isEditing) {
    return <EmptyHint label="No questions — add some in the sidebar" />;
  }

  const inner = (
    <div className="space-y-2">
      {list.map((it, i) => {
        const cid = `faq-${id ?? "x"}-${i}`;
        return (
          <div
            key={i}
            className="faq-item border border-zinc-200 dark:border-white/10 rounded-lg overflow-hidden"
          >
            <input type="checkbox" id={cid} className="faq-toggle hidden" />
            <label
              htmlFor={cid}
              className="faq-question block p-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-medium text-zinc-900 dark:text-white pr-8">{it.q}</h3>
                <span className="faq-icon text-3xl text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                  +
                </span>
              </div>
            </label>
            <div className="faq-answer">
              <div
                className="p-4 text-zinc-800 dark:text-zinc-200"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(it.a) }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );

  // about.html constrains its FAQ to max-w-4xl centred — match it at top level.
  return (
    <BlockShell spacing={spacing}>
      <div className="max-w-4xl mx-auto">{inner}</div>
    </BlockShell>
  );
}

// ----------------------------------------------------------------- downloads

export interface DownloadItem {
  src: string;
  /// Display name; empty falls back to the file name.
  label: string;
  size: number;
  sha256: string;
  sha512: string;
  /// File not found on disk at the last check. The lint pass flags these —
  /// a missing file means a broken link AND stale hashes.
  missing?: boolean;
}

export interface DownloadsProps {
  items: DownloadItem[];
  spacing: Spacing;
  puck?: PuckContext;
}

/// download.html's verification table, with SHA-256/SHA-512 instead of MD5.
/// Kept responsive the same way: sha-256 appears from md, sha-512 from lg.
export function Downloads({ items, spacing, puck }: DownloadsProps) {
  const list = (items ?? []).filter((it) => it.src);
  if (list.length === 0 && puck?.isEditing) {
    return <EmptyHint label="No downloads — add files in the sidebar" />;
  }

  return (
    <BlockShell spacing={spacing}>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse font-mono text-[0.85rem]">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-white/10 text-zinc-500 uppercase text-[0.9rem]">
              <th className="py-4 pr-2 font-medium">Download Link</th>
              <th className="py-4 px-2 font-medium">File name</th>
              <th className="py-4 px-1 font-medium">Size</th>
              <th className="py-4 px-2 font-medium hidden md:table-cell">SHA-256 Hash</th>
              <th className="py-4 pl-2 font-medium hidden lg:table-cell">SHA-512 Hash</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
            {list.map((it, i) => (
              <tr key={i} className="hover:opacity-50 transition-opacity">
                <td className="py-5 pr-2">
                  <a
                    href={it.src}
                    download
                    className="inline-block px-2 py-1 bg-zinc-900 rounded-sm dark:bg-white text-white dark:text-zinc-900 hover:opacity-80 transition-opacity uppercase text-[0.9rem] tracking-wider"
                  >
                    Download
                  </a>
                </td>
                <td className="py-5 pr-2">
                  <span className="py-5 px-2 text-zinc-600 dark:text-zinc-400">
                    {it.label || it.src.split("/").pop() || it.src}
                  </span>
                </td>
                <td className="py-5 px-1 text-zinc-600 dark:text-zinc-400">{humanSize(it.size)}</td>
                <td className="py-5 px-2 hidden md:table-cell">
                  <code className="text-zinc-400 dark:text-zinc-500 break-all select-all">
                    {it.sha256}
                  </code>
                </td>
                <td className="py-5 pl-2 hidden lg:table-cell">
                  <code className="text-zinc-400 dark:text-zinc-500 break-all select-all">
                    {it.sha512}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BlockShell>
  );
}
