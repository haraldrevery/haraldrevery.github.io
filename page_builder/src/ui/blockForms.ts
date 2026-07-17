/* Per-type editor form for the currently selected block. */
import { el, clear } from "./dom";
import { textInput, textArea, selectInput, checkbox, row, warnBadge } from "./fields";
import { store } from "../state";
import { ASPECTS, GALLERY_COLUMNS, COLUMN_KIND_LABELS, newColumnContent } from "../blocks/model";
import type {
  Aspect,
  AudioBlock,
  Block,
  ColumnContent,
  ColumnKind,
  ColumnsBlock,
  GalleryBlock,
  GalleryItem,
  GridLayout,
  HeadingBlock,
  ImageBlock,
  ParagraphBlock,
  RawBlock,
  SvgFields,
  VideoBlock,
} from "../blocks/model";
import { pickMedia, prefetchSvg } from "../media";

const MD_HINT = "Markdown + KaTeX: $E=mc^2$ inline, $$…$$ display, {.class} attributes";

function edit(fn: () => void): void {
  store.mutateContent(fn);
}

/// Field changes that alter which fields exist (media picks, kind switches)
/// rebuild the form via a structure emit.
function editStructural(fn: () => void): void {
  store.mutateStructure(fn);
}

function mediaPickRow(
  label: string,
  value: string,
  onInput: (v: string) => void,
  onPick: () => void,
  missing = false
): HTMLElement {
  const input = el("input", {
    type: "text",
    value,
    oninput: (e: Event) => onInput((e.target as HTMLInputElement).value),
  });
  const btn = el("button", { class: "secondary small", onclick: onPick }, "Pick…");
  return row(
    label,
    input,
    btn,
    missing
      ? warnBadge("No _min thumbnail found on disk — using the full-size image until you add one")
      : ""
  );
}

// ------------------------------------------------------- shared sub-editors

/// Gallery-item list editor, shared by the gallery block and grid columns.
/// Multi-select is enabled in the file picker (ctrl/shift-click).
function galleryItemsEditor(items: GalleryItem[]): HTMLElement[] {
  const addImages = async () => {
    const files = await pickMedia("image", true, "photos");
    if (!files.length) return;
    editStructural(() => {
      for (const f of files) {
        items.push({
          full: f.full,
          thumb: f.thumb,
          alt: "",
          title: "",
          description: "",
          thumbMissing: !f.thumbExists,
          w: f.width ?? undefined,
          h: f.height ?? undefined,
        });
      }
    });
  };

  const itemNodes = items.map((it, i) =>
    el(
      "details",
      { class: "gallery-item" },
      el(
        "summary",
        {},
        el("span", { class: "gallery-item-name" }, it.full.split("/").pop() || "(unset)"),
        it.thumbMissing ? warnBadge("No _min thumbnail found on disk") : "",
        !it.w || !it.h
          ? el(
              "span",
              { class: "badge-warn", title: "Image dimensions unknown — justified layout assumes 3:2 until the file exists" },
              "? size"
            )
          : "",
        el(
          "button",
          {
            class: "danger small",
            title: "Remove image",
            onclick: (e: Event) => {
              e.preventDefault();
              e.stopPropagation();
              editStructural(() => items.splice(i, 1));
            },
          },
          "✕"
        )
      ),
      textInput("Alt", it.alt, (v) => edit(() => (it.alt = v))),
      textInput("Title", it.title, (v) => edit(() => (it.title = v)), "lightbox caption title"),
      textInput("Desc", it.description, (v) => edit(() => (it.description = v)), "lightbox caption text")
    )
  );

  return [
    el("div", { class: "gallery-items" }, ...itemNodes),
    el(
      "button",
      { class: "secondary", onclick: addImages },
      "Add images from repo… (multi-select)"
    ),
  ];
}

function gridSettings(
  g: { layout: GridLayout; rowHeight: number; columns: number; aspect: Aspect; group: string },
  colLabel = "Columns (md+)"
): HTMLElement[] {
  const out: HTMLElement[] = [
    selectInput(
      "Layout",
      g.layout,
      [
        ["justified", "Justified (native ratios)"],
        ["uniform", "Uniform (cropped grid)"],
      ],
      (v) => editStructural(() => (g.layout = v as GridLayout))
    ),
  ];
  if (g.layout === "uniform") {
    out.push(
      selectInput(
        colLabel,
        String(g.columns),
        GALLERY_COLUMNS.map((c) => [String(c), String(c)] as [string, string]),
        (v) => edit(() => (g.columns = Number(v)))
      ),
      selectInput(
        "Aspect",
        g.aspect,
        ASPECTS.map((a) => [a, a] as [string, string]),
        (v) => edit(() => (g.aspect = v as Aspect))
      )
    );
  } else {
    out.push(
      textInput("Row height (px)", String(g.rowHeight), (v) =>
        edit(() => (g.rowHeight = Number(v) || 320))
      )
    );
  }
  out.push(textInput("Lightbox group", g.group, (v) => edit(() => (g.group = v))));
  return out;
}

/// SVG fields, shared by the svg block and svg columns.
function svgFieldsEditor(f: SvgFields): HTMLElement[] {
  const pick = async () => {
    const files = await pickMedia("svg", false, "svg");
    if (!files.length) return;
    const src = files[0].web;
    await prefetchSvg(src);
    editStructural(() => (f.src = src));
  };
  const onSrcInput = (v: string) => {
    edit(() => (f.src = v));
    if (v.endsWith(".svg")) void prefetchSvg(v).then(() => store.emit("content"));
  };
  return [
    mediaPickRow("SVG file", f.src, onSrcInput, pick),
    checkbox("Follow light/dark theme (inline, recolored to text color)", f.themed, (v) =>
      edit(() => (f.themed = v))
    ),
    checkbox("Grow slightly on hover", f.hoverGrow, (v) => edit(() => (f.hoverGrow = v))),
    textInput("Link (optional)", f.link, (v) => edit(() => (f.link = v)), "/music.html or https://…"),
    textInput("Alt / label", f.alt, (v) => edit(() => (f.alt = v))),
    textInput("Max width (px)", f.maxWidth, (v) => edit(() => (f.maxWidth = v)), "empty = full width"),
  ];
}

function imageFieldsEditor(c: {
  full: string;
  thumb: string;
  alt: string;
  lightbox: boolean;
  thumbMissing?: boolean;
}): HTMLElement[] {
  const pick = async () => {
    const files = await pickMedia("image", false, "photos");
    if (!files.length) return;
    const f = files[0];
    editStructural(() => {
      c.full = f.full;
      c.thumb = f.thumb;
      c.thumbMissing = !f.thumbExists;
    });
  };
  return [
    mediaPickRow("Image", c.full, (v) => edit(() => (c.full = v)), pick, c.thumbMissing),
    textInput("Thumbnail", c.thumb, (v) => edit(() => (c.thumb = v))),
    textInput("Alt text", c.alt, (v) => edit(() => (c.alt = v))),
    checkbox("Click opens full-size (GLightbox)", c.lightbox, (v) => edit(() => (c.lightbox = v))),
  ];
}

function videoFieldsEditor(c: { src: string; poster: string }): HTMLElement[] {
  const pickSrc = async () => {
    const files = await pickMedia("video", false, "video");
    if (files.length) editStructural(() => (c.src = files[0].web));
  };
  const pickPoster = async () => {
    const files = await pickMedia("image", false, "photos");
    if (files.length) editStructural(() => (c.poster = files[0].web));
  };
  return [
    mediaPickRow("Video file", c.src, (v) => edit(() => (c.src = v)), pickSrc),
    mediaPickRow("Poster image", c.poster, (v) => edit(() => (c.poster = v)), pickPoster),
  ];
}

// ---------------------------------------------------------------- per type

function headingForm(b: HeadingBlock): HTMLElement[] {
  return [
    selectInput("Level", String(b.level), [["1", "H1"], ["2", "H2"], ["3", "H3"]], (v) =>
      edit(() => (b.level = Number(v)))
    ),
    textInput("Text", b.text, (v) => edit(() => (b.text = v))),
  ];
}

function paragraphForm(b: ParagraphBlock): HTMLElement[] {
  return [textArea("Text", b.md, (v) => edit(() => (b.md = v)), 10, MD_HINT)];
}

function imageForm(b: ImageBlock): HTMLElement[] {
  return [
    ...imageFieldsEditor(b),
    textInput("Caption", b.caption, (v) => edit(() => (b.caption = v))),
  ];
}

function videoForm(b: VideoBlock): HTMLElement[] {
  return [
    ...videoFieldsEditor(b),
    textInput("Caption", b.caption, (v) => edit(() => (b.caption = v))),
  ];
}

function audioForm(b: AudioBlock): HTMLElement[] {
  const pickSrc = async () => {
    const files = await pickMedia("audio", false, "audio");
    if (files.length) editStructural(() => (b.src = files[0].web));
  };
  return [
    mediaPickRow("Audio file", b.src, (v) => edit(() => (b.src = v)), pickSrc),
    textInput("Label", b.title, (v) => edit(() => (b.title = v))),
  ];
}

function rawForm(b: RawBlock): HTMLElement[] {
  return [
    textArea("Raw HTML (inserted verbatim; scripts run in the preview too)", b.html, (v) =>
      edit(() => (b.html = v)), 12
    ),
  ];
}

function galleryForm(b: GalleryBlock): HTMLElement[] {
  return [...gridSettings(b), ...galleryItemsEditor(b.items)];
}

function columnContentEditor(c: ColumnContent): HTMLElement[] {
  switch (c.kind) {
    case "markdown":
      return [textArea("Text", c.md, (v) => edit(() => (c.md = v)), 8, MD_HINT)];
    case "image":
      return imageFieldsEditor(c);
    case "grid":
      return [...gridSettings(c, "Grid columns"), ...galleryItemsEditor(c.items)];
    case "video":
      return videoFieldsEditor(c);
    case "svg":
      return svgFieldsEditor(c);
    case "raw":
      return [textArea("Raw HTML", c.html, (v) => edit(() => (c.html = v)), 8)];
  }
}

function columnsForm(b: ColumnsBlock): HTMLElement[] {
  const out: HTMLElement[] = [
    selectInput("Columns", String(b.count), [["1", "1"], ["2", "2"]], (v) =>
      editStructural(() => (b.count = Number(v) as 1 | 2))
    ),
  ];
  for (let i = 0; i < b.count; i++) {
    const c = b.columns[i];
    out.push(
      el(
        "div",
        { class: "column-editor" },
        el("h5", {}, b.count === 2 ? (i === 0 ? "Left column" : "Right column") : "Content"),
        selectInput("Type", c.kind, COLUMN_KIND_LABELS, (v) =>
          editStructural(() => (b.columns[i] = newColumnContent(v as ColumnKind)))
        ),
        ...columnContentEditor(c)
      )
    );
  }
  if (b.count === 2) {
    out.push(
      el(
        "button",
        {
          class: "secondary",
          onclick: () => editStructural(() => b.columns.reverse()),
        },
        "⇄ Swap columns"
      )
    );
  }
  return out;
}

// ---------------------------------------------------------------- dispatcher

function formFor(b: Block): HTMLElement[] {
  switch (b.type) {
    case "heading":
      return headingForm(b);
    case "paragraph":
      return paragraphForm(b);
    case "hr":
      return [el("p", { class: "hint" }, "A horizontal divider. No options.")];
    case "gallery":
      return galleryForm(b);
    case "image":
      return imageForm(b);
    case "svg":
      return svgFieldsEditor(b);
    case "video":
      return videoForm(b);
    case "columns":
      return columnsForm(b);
    case "audio":
      return audioForm(b);
    case "raw":
      return rawForm(b);
  }
}

export function renderBlockForm(container: HTMLElement): void {
  clear(container);
  const b = store.selectedBlock;
  if (!b) {
    container.appendChild(
      el("p", { class: "hint" }, "Select a block in the preview or the list to edit it.")
    );
    return;
  }
  container.appendChild(el("h4", {}, b.type.replace("_", " ")));
  for (const f of formFor(b)) container.appendChild(f);
}
