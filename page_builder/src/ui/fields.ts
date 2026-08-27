/* Shared form-field builders used by the meta form and block forms. */
import { el } from "./dom";

export function row(label: string, ...controls: (Node | string)[]): HTMLElement {
  return el("div", { class: "field-row" }, el("label", {}, label), ...controls);
}

export function textInput(
  label: string,
  value: string,
  onInput: (v: string) => void,
  placeholder = ""
): HTMLElement {
  const input = el("input", {
    type: "text",
    value,
    placeholder,
    oninput: (e: Event) => onInput((e.target as HTMLInputElement).value),
  });
  return row(label, input);
}

export function textArea(
  label: string,
  value: string,
  onInput: (v: string) => void,
  rows = 6,
  placeholder = ""
): HTMLElement {
  const area = el("textarea", {
    rows,
    placeholder,
    oninput: (e: Event) => onInput((e.target as HTMLTextAreaElement).value),
  }) as HTMLTextAreaElement;
  area.value = value;
  return el("div", { class: "field-col" }, el("label", {}, label), area);
}

export function selectInput(
  label: string,
  value: string,
  options: [string, string][],
  onChange: (v: string) => void
): HTMLElement {
  const sel = el(
    "select",
    { onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value) },
    ...options.map(([v, l]) => el("option", { value: v, selected: v === value }, l))
  );
  return row(label, sel);
}

export function checkbox(
  label: string,
  checked: boolean,
  onChange: (v: boolean) => void
): HTMLElement {
  const input = el("input", {
    type: "checkbox",
    checked,
    onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked),
  });
  return el("div", { class: "field-check" }, el("label", {}, input, " ", label));
}

export function warnBadge(text: string): HTMLElement {
  return el("span", { class: "badge-warn", title: text }, "⚠ no _min");
}

/// Green = alt/title/description complete, yellow = something missing.
export function statusDot(status: "ok" | "partial"): HTMLElement {
  return el("span", {
    class: `dot ${status}`,
    title:
      status === "ok"
        ? "Image metadata complete"
        : "Missing alt, title or description",
  });
}
