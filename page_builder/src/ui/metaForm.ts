/* Front-matter form: title / date / tags / description / card image / draft. */
import { el, clear } from "./dom";
import { textInput, checkbox, selectInput, row } from "./fields";
import { store } from "../state";
import { pickMedia } from "../media";
import type { SchemaChoice } from "../export";

export function renderMetaForm(container: HTMLElement): void {
  clear(container);
  // Read-time values for the initial render only. Every WRITE goes through
  // set(), which re-reads store.meta at call time: undo/redo replaces the whole
  // project object, so a captured `meta` becomes an orphan and edits made after
  // an undo would land on a detached object and vanish on save.
  const meta = store.meta;
  const edit = (fn: () => void) => store.mutateContent(fn);
  const set = <K extends keyof typeof meta>(k: K, v: (typeof meta)[K]) =>
    edit(() => {
      store.meta[k] = v;
    });

  const imageInput = el("input", {
    type: "text",
    value: meta.image,
    placeholder: "/notebook_thumbnails/…_min.jpg",
    oninput: (e: Event) => set("image", (e.target as HTMLInputElement).value),
  }) as HTMLInputElement;

  const pickImage = async () => {
    const files = await pickMedia("image", false, "notebook_thumbnails");
    if (!files.length) return;
    // notebook cards conventionally use the _min thumbnail
    set("image", files[0].thumb);
    imageInput.value = files[0].thumb;
  };

  container.append(
    textInput("Title", meta.title, (v) => set("title", v)),
    textInput("Date", meta.date, (v) => set("date", v), "YYYY-MM-DD"),
    textInput("Tags", meta.tags, (v) => set("tags", v), "photography, mountains"),
    textInput("Description", meta.description, (v) => set("description", v)),
    row("Card image", imageInput, el("button", { class: "secondary small", onclick: pickImage }, "Pick…")),
    selectInput(
      "Schema",
      meta.schemaType,
      [
        ["auto", "Auto (from content)"],
        ["blogposting", "Blog post"],
        ["article", "Article"],
        ["imagegallery", "Photo gallery"],
        ["faqpage", "FAQ page"],
      ],
      (v) => set("schemaType", v as SchemaChoice)
    ),
    checkbox("Draft (Eleventy skips it — not built, not indexed)", meta.draft, (v) =>
      set("draft", v)
    )
  );
}
