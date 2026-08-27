/*
 * Parent side of the preview protocol; the counterpart lives in
 * preview-harness/editor-bridge.js (served at /__pb/editor-bridge.js).
 */
export interface BridgeHandlers {
  onReady(): void;
  onBlockClick(id: string): void;
  onReorder(id: string, dropIndex: number): void;
  onInsertAt(index: number): void;
  onSplit(id: string): void;
  onColumnPick(id: string, col: number): void;
  onItemReorder(id: string, from: number, dropIndex: number): void;
}

export class PreviewBridge {
  private iframe: HTMLIFrameElement;
  private ready = false;
  private queued: unknown[] = [];

  constructor(iframe: HTMLIFrameElement, handlers: BridgeHandlers) {
    this.iframe = iframe;
    window.addEventListener("message", (e) => {
      if (e.source !== iframe.contentWindow) return;
      const m = (e.data ?? {}) as {
        type?: string;
        id?: string;
        dropIndex?: number;
        index?: number;
        col?: number;
        from?: number;
      };
      switch (m.type) {
        case "ready": {
          this.ready = true;
          const q = this.queued;
          this.queued = [];
          for (const msg of q) this.post(msg);
          handlers.onReady();
          break;
        }
        case "blockClick":
          if (m.id) handlers.onBlockClick(m.id);
          break;
        case "reorder":
          if (m.id != null && m.dropIndex != null) handlers.onReorder(m.id, m.dropIndex);
          break;
        case "insertAt":
          if (m.index != null) handlers.onInsertAt(m.index);
          break;
        case "split":
          if (m.id) handlers.onSplit(m.id);
          break;
        case "columnPick":
          if (m.id != null && m.col != null) handlers.onColumnPick(m.id, m.col);
          break;
        case "itemReorder":
          if (m.id != null && m.from != null && m.dropIndex != null) {
            handlers.onItemReorder(m.id, m.from, m.dropIndex);
          }
          break;
      }
    });
  }

  /// (Re)load the preview document; queued messages flush on the next "ready".
  load(port: number): void {
    this.ready = false;
    this.iframe.src = `http://127.0.0.1:${port}/__pb/preview`;
  }

  private post(msg: unknown): void {
    if (!this.ready) {
      this.queued.push(msg);
      return;
    }
    this.iframe.contentWindow?.postMessage(msg, "*");
  }

  render(
    html: string,
    heroHtml: string,
    backLinkHtml: string,
    dateHuman: string,
    navMechanic: boolean,
    scrollToId?: string
  ): void {
    this.post({ type: "render", html, heroHtml, backLinkHtml, dateHuman, navMechanic, scrollToId });
  }

  select(id: string | null, scroll = false): void {
    this.post({ type: "select", id, scroll });
  }

  setMode(value: "edit" | "preview"): void {
    this.post({ type: "mode", value });
  }
}
