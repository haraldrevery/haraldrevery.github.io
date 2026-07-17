import { newBlock } from "./blocks/model";
import type { Block, BlockType } from "./blocks/model";
import type { Meta } from "./export";

export type EmitKind =
  | "structure" // blocks added/removed/reordered or project swapped
  | "content" // a field of an existing block or the meta changed
  | "selection"
  | "mode"
  | "project"; // whole project replaced (new/open)

export interface Project {
  version: 1;
  meta: Meta;
  blocks: Block[];
}

export function defaultMeta(): Meta {
  return {
    title: "",
    date: new Date().toISOString().slice(0, 10),
    tags: "",
    description: "",
    image: "",
    draft: false,
  };
}

class Store {
  project: Project = { version: 1, meta: defaultMeta(), blocks: [] };
  projectName: string | null = null;
  dirty = false;
  selectedId: string | null = null;
  mode: "edit" | "preview" = "edit";

  repoRoot: string | null = null;
  previewPort = 0;
  siteUrl = "https://haraldrevery.com";

  private listeners: ((kind: EmitKind) => void)[] = [];
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private lastSnapshotAt = 0;

  subscribe(fn: (kind: EmitKind) => void): void {
    this.listeners.push(fn);
  }

  emit(kind: EmitKind): void {
    for (const fn of this.listeners) fn(kind);
  }

  get blocks(): Block[] {
    return this.project.blocks;
  }
  get meta(): Meta {
    return this.project.meta;
  }
  get selectedBlock(): Block | null {
    return this.blocks.find((b) => b.id === this.selectedId) ?? null;
  }
  indexOf(id: string): number {
    return this.blocks.findIndex((b) => b.id === id);
  }

  private currentSnapshot(): string {
    return JSON.stringify({ project: this.project, selectedId: this.selectedId });
  }

  private restore(snap: string): void {
    const s = JSON.parse(snap);
    this.project = s.project;
    this.selectedId = s.selectedId;
    this.dirty = true;
    this.lastSnapshotAt = 0; // next edit snapshots immediately
    this.emit("structure");
  }

  // Coalesce per-keystroke edits into one undo step per ~800ms burst.
  // Any new edit invalidates the redo history.
  private snapshot(force = false): void {
    this.redoStack = [];
    const now = Date.now();
    if (!force && now - this.lastSnapshotAt < 800) return;
    this.undoStack.push(this.currentSnapshot());
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.lastSnapshotAt = now;
  }

  undo(): void {
    const snap = this.undoStack.pop();
    if (!snap) return;
    this.redoStack.push(this.currentSnapshot());
    this.restore(snap);
  }

  redo(): void {
    const snap = this.redoStack.pop();
    if (!snap) return;
    this.undoStack.push(this.currentSnapshot());
    this.restore(snap);
  }

  mutateContent(fn: () => void): void {
    this.snapshot();
    fn();
    this.dirty = true;
    this.emit("content");
  }

  mutateStructure(fn: () => void): void {
    this.snapshot(true);
    fn();
    this.dirty = true;
    this.emit("structure");
  }

  addBlock(type: BlockType, index?: number): Block {
    const b = newBlock(type);
    this.mutateStructure(() => {
      const at =
        index ??
        (this.selectedId ? this.indexOf(this.selectedId) + 1 : this.blocks.length);
      this.blocks.splice(Math.max(0, Math.min(at, this.blocks.length)), 0, b);
      this.selectedId = b.id;
    });
    return b;
  }

  removeBlock(id: string): void {
    const i = this.indexOf(id);
    if (i < 0) return;
    this.mutateStructure(() => {
      this.blocks.splice(i, 1);
      this.selectedId = this.blocks[Math.min(i, this.blocks.length - 1)]?.id ?? null;
    });
  }

  duplicateBlock(id: string): void {
    const i = this.indexOf(id);
    if (i < 0) return;
    this.mutateStructure(() => {
      const copy: Block = structuredClone(this.blocks[i]);
      copy.id = crypto.randomUUID();
      this.blocks.splice(i + 1, 0, copy);
      this.selectedId = copy.id;
    });
  }

  moveBlock(id: string, delta: number): void {
    const i = this.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= this.blocks.length) return;
    this.mutateStructure(() => {
      [this.blocks[i], this.blocks[j]] = [this.blocks[j], this.blocks[i]];
    });
  }

  /// dropIndex counts gaps in the current list (dragged block still present).
  reorderBlock(id: string, dropIndex: number): void {
    const from = this.indexOf(id);
    if (from < 0) return;
    let to = Math.max(0, Math.min(dropIndex, this.blocks.length));
    if (from < to) to--;
    if (to === from) return;
    this.mutateStructure(() => {
      const [b] = this.blocks.splice(from, 1);
      this.blocks.splice(to, 0, b);
      this.selectedId = id;
    });
  }

  select(id: string | null): void {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.emit("selection");
  }

  setMode(mode: "edit" | "preview"): void {
    this.mode = mode;
    this.emit("mode");
  }

  loadProject(name: string | null, project: Project): void {
    this.project = project;
    this.projectName = name;
    this.dirty = false;
    this.selectedId = null;
    this.undoStack = [];
    this.emit("project");
  }

  newProject(): void {
    this.loadProject(null, { version: 1, meta: defaultMeta(), blocks: [] });
  }
}

export const store = new Store();
