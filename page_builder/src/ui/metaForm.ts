/* Front-matter form: title / date / tags / description / card image / draft. */
import { el, clear } from "./dom";
import { textInput, checkbox, selectInput, row } from "./fields";
import { store } from "../state";
import { pickMedia } from "../media";
import type { SchemaChoice } from "../export";

export function renderMetaForm(container: HTMLElement): void {
  clear(container);
  const meta = store.meta;
  const edit = (fn: () => void) => store.mutateContent(fn);

  const imageInput = el("input", {
    type: "text",
    value: meta.image,
    placeholder: "/notebook_thumbnails/…_min.jpg",
    oninput: (e: Event) => edit(() => (meta.image = (e.target as HTMLInputElement).value)),
  }) as HTMLInputElement;

  const pickImage = async () => {
    const files = await pickMedia("image", false, "notebook_thumbnails");
    if (!files.length) return;
    // notebook cards conventionally use the _min thumbnail
    edit(() => (meta.image = files[0].thumb));
    imageInput.value = files[0].thumb;
  };

  container.append(
    textInput("Title", meta.title, (v) => edit(() => (meta.title = v))),
    textInput("Date", meta.date, (v) => edit(() => (meta.date = v)), "YYYY-MM-DD"),
    textInput("Tags", meta.tags, (v) => edit(() => (meta.tags = v)), "photography, mountains"),
    textInput("Description", meta.description, (v) => edit(() => (meta.description = v))),
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
      (v) => edit(() => (meta.schemaType = v as SchemaChoice))
    ),
    checkbox("Draft (Eleventy skips it — not built, not indexed)", meta.draft, (v) =>
      edit(() => (meta.draft = v))
    )
  );
}
