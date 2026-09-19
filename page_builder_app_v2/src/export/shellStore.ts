/*
 * The generated preview shell (page_builder_app_v2/shell.html), held for the
 * EDITOR. PageRoot takes the page header from it (shellHeader in export.ts),
 * so the editor shows the header the layout will add without this app keeping
 * a copy of that markup.
 *
 * Pure module like svgStore — no Tauri import. App.tsx fills it on startup and
 * again whenever Preview or Export HTML reads the shell, so a site build made
 * while the app is open reaches the editor at the next of those.
 */
import { useSyncExternalStore } from "react";

let shell = "";
const listeners = new Set<() => void>();

export function setShell(text: string): void {
  if (text === shell) return;
  shell = text;
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => shell;

/// The current shell; "" until it has been read. The server snapshot is the
/// same value, so rendering PageRoot to a string (tests) works too.
export const useShell = (): string => useSyncExternalStore(subscribe, snapshot, snapshot);
