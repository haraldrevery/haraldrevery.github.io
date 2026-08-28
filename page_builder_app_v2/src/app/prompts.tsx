/*
 * Small modal prompts. Puck owns the editor chrome but has nothing for "name
 * this project" / "overwrite?" / "pick a project", and the native `prompt()` is
 * unavailable in a Tauri webview.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

/*
 * Escape closes every prompt, and it is bound HERE, on the modal container —
 * never on window. PreviewModal already owns a window-level Escape listener,
 * and a prompt can be open on top of it (Ctrl+S reaches the parent document
 * through the preview overlay, so Save-As can mount above the preview). A
 * second window listener would close the prompt AND the preview on one key.
 * Keydown from a focused child bubbles to this div, which is all we need.
 */
function Modal({
  title,
  onCancel,
  children,
}: {
  title: string;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="pb-modal"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="pb-modal__box">
        <h2 className="pb-modal__title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function TextPrompt({
  title,
  label,
  initial,
  confirmLabel = "OK",
  allowEmpty = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  label: string;
  initial?: string;
  confirmLabel?: string;
  /// Some prompts have a meaningful empty value (export derives the file name
  /// from the page title). Without this the button contradicts its own label.
  allowEmpty?: boolean;
  onConfirm: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial ?? "");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.select(), []);
  const ok = allowEmpty || !!value.trim();

  return (
    <Modal title={title} onCancel={onCancel}>
      <label className="pb-modal__label">{label}</label>
      <input
        ref={ref}
        className="pb-modal__input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        // Escape is Modal's, via bubbling — binding it here too would just call
        // onCancel twice.
        onKeyDown={(e) => {
          if (e.key === "Enter" && ok) onConfirm(value.trim());
        }}
      />
      <div className="pb-modal__ops">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className="pb-modal__primary"
          disabled={!ok}
          onClick={() => onConfirm(value.trim())}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function ConfirmPrompt({
  title,
  message,
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  /// For prompts where declining is a real choice rather than an escape hatch
  /// ("Not now" on the recovery draft), so the button says what it does.
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  /*
   * Which button starts focused IS the Enter policy. A focused <button> is
   * activated by Enter natively, so there is deliberately no Enter handler
   * here — one would fire *alongside* the native activation and, with focus on
   * Cancel, both cancel and confirm the same prompt.
   *
   * Danger prompts focus Cancel, because every one of them is reached by
   * confirming the PREVIOUS prompt: TextPrompt's Enter closes it and mounts
   * the overwrite confirmation in the same tick, so a held or double-tapped
   * Enter would otherwise replace a file the user never agreed to replace.
   */
  const focus = useRef<HTMLButtonElement>(null);
  useEffect(() => focus.current?.focus(), []);

  return (
    <Modal title={title} onCancel={onCancel}>
      <div className="pb-modal__body">{message}</div>
      <div className="pb-modal__ops">
        <button ref={danger ? focus : undefined} type="button" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button
          ref={danger ? undefined : focus}
          type="button"
          className={danger ? "pb-modal__danger" : "pb-modal__primary"}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function ListPrompt({
  title,
  items,
  empty,
  onPick,
  onCancel,
}: {
  title: string;
  items: { name: string; sub?: string }[];
  empty: string;
  onPick: (name: string) => void;
  onCancel: () => void;
}) {
  /// Focus the first project so Enter opens it and Tab walks the list. Safe to
  /// make that the default action: doOpen runs the unsaved-changes guard BEFORE
  /// this list is ever shown, so picking one cannot discard unsaved work.
  const focus = useRef<HTMLButtonElement>(null);
  useEffect(() => focus.current?.focus(), []);

  return (
    <Modal title={title} onCancel={onCancel}>
      {items.length === 0 ? (
        <p className="pb-modal__body">{empty}</p>
      ) : (
        <ul className="pb-modal__list">
          {items.map((it, i) => (
            <li key={it.name}>
              <button
                ref={i === 0 ? focus : undefined}
                type="button"
                onClick={() => onPick(it.name)}
              >
                <span>{it.name}</span>
                {it.sub && <em>{it.sub}</em>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="pb-modal__ops">
        <button ref={items.length === 0 ? focus : undefined} type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
