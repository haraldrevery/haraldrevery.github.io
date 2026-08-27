/*
 * Small modal prompts. Puck owns the editor chrome but has nothing for "name
 * this project" / "overwrite?" / "pick a project", and the native `prompt()` is
 * unavailable in a Tauri webview.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

function Modal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pb-modal">
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
    <Modal title={title}>
      <label className="pb-modal__label">{label}</label>
      <input
        ref={ref}
        className="pb-modal__input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && ok) onConfirm(value.trim());
          if (e.key === "Escape") onCancel();
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
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title}>
      <div className="pb-modal__body">{message}</div>
      <div className="pb-modal__ops">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button
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
  return (
    <Modal title={title}>
      {items.length === 0 ? (
        <p className="pb-modal__body">{empty}</p>
      ) : (
        <ul className="pb-modal__list">
          {items.map((it) => (
            <li key={it.name}>
              <button type="button" onClick={() => onPick(it.name)}>
                <span>{it.name}</span>
                {it.sub && <em>{it.sub}</em>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="pb-modal__ops">
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </Modal>
  );
}
