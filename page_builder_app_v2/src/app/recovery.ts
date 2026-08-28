/*
 * Crash-recovery draft — a periodic snapshot of unsaved work.
 *
 * The close guard already covers a deliberate quit. This covers what it cannot:
 * a crash, a power loss, or a mis-clicked "Discard". Until now the app had no
 * autosave of any kind, so any of those cost the whole session.
 *
 * WHAT IT IS NOT. It never writes to `projects/` and never touches the file the
 * user is editing. Autosaving over a real project would destroy the meaning of
 * both the dirty flag and "Discard" — the point of a safety net is that it
 * cannot itself lose anything. The draft lives beside config.json in the app's
 * config dir (repo::recovery_file) and is deleted the moment the work is safe.
 */
import { invoke } from "@tauri-apps/api/core";
import { PROJECT_VERSION, type ProjectFileV2 } from "./project";

/// How often to snapshot while there are unsaved changes. Long enough that a
/// typing burst does not mean a write per keystroke, short enough that a crash
/// costs a sentence rather than a session.
export const RECOVERY_MS = 15_000;

export interface RecoveryDraft {
  /// The project this work belonged to, or null if it was never named — the
  /// restore prompt needs to say WHICH page it found.
  name: string | null;
  file: ProjectFileV2;
}

export interface FoundDraft extends RecoveryDraft {
  /// Unix seconds, from the file's mtime rather than anything self-reported.
  modified: number;
}

interface RecoveryInfo {
  contents: string;
  modified: number;
}

export const writeRecovery = (draft: RecoveryDraft): Promise<void> =>
  invoke<void>("write_recovery", { contents: JSON.stringify(draft) });

export const clearRecovery = (): Promise<void> => invoke<void>("clear_recovery");

/*
 * null = nothing to restore.
 *
 * Anything unreadable, unparseable or of the wrong version is DELETED rather
 * than reported: this runs during boot, and a corrupt safety net that prompts
 * on every launch is worse than no safety net at all. The version check is the
 * same one the Open path makes — v2 refuses a v1 file rather than mangling it.
 */
export async function readRecovery(): Promise<FoundDraft | null> {
  const info = await invoke<RecoveryInfo | null>("read_recovery").catch(() => null);
  if (!info) return null;
  try {
    const draft = JSON.parse(info.contents) as RecoveryDraft;
    if (draft?.file?.version !== PROJECT_VERSION || !draft.file.data) {
      void clearRecovery();
      return null;
    }
    return { ...draft, modified: info.modified };
  } catch {
    void clearRecovery();
    return null;
  }
}

/// "4 minutes ago" — the prompt has to make it obvious whether the draft is
/// from the session that just crashed or from something long abandoned.
export function agoLabel(unixSeconds: number, now = Date.now()): string {
  const mins = Math.floor((now - unixSeconds * 1000) / 60000);
  if (mins < 1) return "moments ago";
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs === 1) return "1 hour ago";
  if (hrs < 24) return `${hrs} hours ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
