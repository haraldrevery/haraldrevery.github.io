/*
 * Per-type editor forms. FORMS is a compile-checked Record over the Block
 * union — a new block type won't compile until it has a form. Column children
 * are real blocks, so their forms are reused verbatim inside the columns form.
 */
import { el, clear } from "./dom";
import { textInput, textArea, selectInput, checkbox, row, warnBadge, statusDot } from "./fields";
import { store } from "../state";
import { ASPECTS, GALLERY_COLUMNS } from "../blocks/model";
import {
  EMBEDDABLE_LABELS,
  newBlock,
  galleryItemStatus,
} from "../blocks/defs";
import type {
  Aspect,
  AudioBlock,
  Block,
  BlockType,
  ColumnsBlock,
  DownloadsBlock,
  FaqBlock,
  GalleryBlock,
  GalleryItem,
  GridLayout,
  HeadingBlock,
  HeroBlock,
  IconsBlock,
  ImageBlock,
  ParagraphBlock,
  RawBlock,
  SvgFields,
  VideoBlock,
} from "../blocks/model";
import { pickMedia, prefetchSvg, hashFiles } from "../media";
import { toast } from "./dom";

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

function widthPctInput(get: () => number, set: (v: number) => void): HTMLElement {
  return selectInput(
    "Width",
    String(get()),
    [["25", "25%"], ["33", "33%"], ["50", "50%"], ["66", "66%"], ["75", "75%"], ["100", "100%"]],
    (v) => edit(() => set(Number(v) || 100))
  );
}

// ------------------------------------------------------- shared sub-editors

/// Gallery-item list editor. Multi-select is enabled in the file picker
/// (ctrl/shift-click); per-item dots update live as the fields are typed.
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

  const itemNodes = items.map((it, i) => {
    const dot = statusDot(galleryItemStatus(it));
    const liveEdit = (fn: () => void) => {
      edit(fn);
      const status = galleryItemStatus(it);
      dot.className = `dot ${status}`;
      dot.title = status === "ok" ? "Image metadata complete" : "Missing alt, title or description";
    };
    const move = (delta: number) => {
      const j = i + delta;
      if (j < 0 || j >= items.length) return;
      editStructural(() => {
        [items[i], items[j]] = [items[j], items[i]];
      });
    };
    return el(
      "details",
      { class: "gallery-item" },
      el(
        "summary",
        {},
        dot,
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
          "span",
          { class: "gallery-item-actions" },
          el("button", { class: "small", title: "Move up", onclick: (e: Event) => { e.preventDefault(); e.stopPropagation(); move(-1); } }, "↑"),
          el("button", { class: "small", title: "Move down", onclick: (e: Event) => { e.preventDefault(); e.stopPropagation(); move(1); } }, "↓"),
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
        )
      ),
      textInput("Alt", it.alt, (v) => liveEdit(() => (it.alt = v))),
      textInput("Title", it.title, (v) => liveEdit(() => (it.title = v)), "lightbox caption title"),
      textInput("Desc", it.description, (v) => liveEdit(() => (it.description = v)), "lightbox caption text")
    );
  });

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
        ["feature", "Feature (first image 2×2 in a 3×3 grid)"],
      ],
      (v) => editStructural(() => (g.layout = v as GridLayout))
    ),
  ];
  if (g.layout === "feature") {
    out.push(
      el("p", { class: "hint" }, "First image spans 4 squares; the rest fill rows of three (about.html style). 6 images make a full 3×3 pattern.")
    );
  } else if (g.layout === "uniform") {
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

/// SVG fields, shared by the svg block form (and later the hero).
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
    widthPctInput(
      () => f.widthPct,
      (v) => (f.widthPct = v)
    ),
  ];
}

// ---------------------------------------------------------------- per type

function headingForm(b: HeadingBlock): HTMLElement[] {
  return [
    selectInput("Level", String(b.level), [["1", "H1"], ["2", "H2"], ["3", "H3"]], (v) =>
      edit(() => (b.level = Number(v)))
    ),
    textInput("Text", b.text, (v) => edit(() => (b.text = v))),
    selectInput("Align", b.align, [["left", "Left"], ["center", "Center"]], (v) =>
      edit(() => (b.align = v as "left" | "center"))
    ),
    checkbox("Animate words (random delayed fade-up, like about.html)", b.animate, (v) =>
      edit(() => (b.animate = v))
    ),
  ];
}

function paragraphForm(b: ParagraphBlock): HTMLElement[] {
  return [
    textArea("Text", b.md, (v) => edit(() => (b.md = v)), 10, MD_HINT),
    checkbox("Animate words (random delayed fade-up; math/code untouched)", b.animate, (v) =>
      edit(() => (b.animate = v))
    ),
  ];
}

function faqForm(b: FaqBlock): HTMLElement[] {
  const itemNodes = b.items.map((it, i) => {
    const move = (delta: number) => {
      const j = i + delta;
      if (j < 0 || j >= b.items.length) return;
      editStructural(() => {
        [b.items[i], b.items[j]] = [b.items[j], b.items[i]];
      });
    };
    return el(
      "details",
      { class: "gallery-item", open: true },
      el(
        "summary",
        {},
        el("span", { class: "gallery-item-name" }, it.q || `(question ${i + 1})`),
        el(
          "span",
          { class: "gallery-item-actions" },
          el("button", { class: "small", title: "Move up", onclick: (e: Event) => { e.preventDefault(); e.stopPropagation(); move(-1); } }, "↑"),
          el("button", { class: "small", title: "Move down", onclick: (e: Event) => { e.preventDefault(); e.stopPropagation(); move(1); } }, "↓"),
          el(
            "button",
            {
              class: "danger small",
              title: "Remove question",
              onclick: (e: Event) => {
                e.preventDefault();
                e.stopPropagation();
                editStructural(() => b.items.splice(i, 1));
              },
            },
            "✕"
          )
        )
      ),
      textInput("Question", it.q, (v) => edit(() => (it.q = v))),
      textArea("Answer", it.a, (v) => edit(() => (it.a = v)), 4, MD_HINT)
    );
  });
  return [
    el("div", { class: "gallery-items" }, ...itemNodes),
    el(
      "button",
      {
        class: "secondary",
        onclick: () => editStructural(() => b.items.push({ q: "", a: "" })),
      },
      "+ Add question"
    ),
  ];
}

function imageForm(b: ImageBlock): HTMLElement[] {
  const dot = statusDot(b.full ? (b.alt.trim() && b.caption.trim() ? "ok" : "partial") : "partial");
  const liveEdit = (fn: () => void) => {
    edit(fn);
    const s = b.full && b.alt.trim() && b.caption.trim() ? "ok" : "partial";
    dot.className = `dot ${s}`;
    dot.title = s === "ok" ? "Image metadata complete" : "Missing alt or caption";
  };
  const pick = async () => {
    const files = await pickMedia("image", false, "photos");
    if (!files.length) return;
    const f = files[0];
    editStructural(() => {
      b.full = f.full;
      b.thumb = f.thumb;
      b.thumbMissing = !f.thumbExists;
    });
  };
  return [
    el("div", { class: "field-check" }, dot, " alt + caption filled?"),
    mediaPickRow("Image", b.full, (v) => liveEdit(() => (b.full = v)), pick, b.thumbMissing),
    textInput("Thumbnail", b.thumb, (v) => edit(() => (b.thumb = v))),
    textInput("Alt text", b.alt, (v) => liveEdit(() => (b.alt = v))),
    textInput("Caption", b.caption, (v) => liveEdit(() => (b.caption = v))),
    widthPctInput(
      () => b.widthPct,
      (v) => (b.widthPct = v)
    ),
    checkbox("Click opens full-size (GLightbox)", b.lightbox, (v) => edit(() => (b.lightbox = v))),
  ];
}

function videoForm(b: VideoBlock): HTMLElement[] {
  const pickSrc = async () => {
    const files = await pickMedia("video", false, "video");
    if (files.length) editStructural(() => (b.src = files[0].web));
  };
  const pickPoster = async () => {
    const files = await pickMedia("image", false, "photos");
    if (files.length) editStructural(() => (b.poster = files[0].web));
  };
  return [
    mediaPickRow("Video file", b.src, (v) => edit(() => (b.src = v)), pickSrc),
    mediaPickRow("Poster image", b.poster, (v) => edit(() => (b.poster = v)), pickPoster),
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
    textInput("Label", b.title, (v) => edit(() => (b.title = v)), b.panel ? "panel caption (empty = “Preview”)" : ""),
    checkbox("Release-style frosted panel (preview card)", b.panel, (v) =>
      editStructural(() => (b.panel = v))
    ),
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

function heroForm(b: HeroBlock): HTMLElement[] {
  const out: HTMLElement[] = [
    selectInput(
      "Background",
      b.background,
      [
        ["none", "None (topology bg)"],
        ["dots", "Dot grid (index style)"],
        ["backdrop", "Photo — blurred backdrop"],
        ["cover", "Photo — full-bleed cover (fades out at bottom)"],
      ],
      (v) => editStructural(() => (b.background = v as HeroBlock["background"]))
    ),
  ];
  if (b.background === "backdrop" || b.background === "cover") {
    const pick = async () => {
      const files = await pickMedia("image", false, "photos");
      if (!files.length) return;
      editStructural(() => {
        b.image = files[0].full;
        b.imageThumb = files[0].thumb;
      });
    };
    out.push(mediaPickRow("Photo", b.image, (v) => edit(() => (b.image = v)), pick));
    if (b.background === "cover") {
      out.push(
        selectInput(
          "Cover tint",
          b.coverStyle,
          [["dark", "Dark scrim + white text"], ["light", "Light scrim + dark text"]],
          (v) => edit(() => (b.coverStyle = v as HeroBlock["coverStyle"]))
        )
      );
    }
  }
  out.push(
    checkbox("Show an SVG above the text", b.showSvg, (v) =>
      editStructural(() => (b.showSvg = v))
    )
  );
  if (b.showSvg) {
    const pickSvg = async () => {
      const files = await pickMedia("svg", false, "svg");
      if (!files.length) return;
      await prefetchSvg(files[0].web);
      editStructural(() => (b.svgSrc = files[0].web));
    };
    out.push(
      mediaPickRow("SVG file", b.svgSrc, (v) => {
        edit(() => (b.svgSrc = v));
        if (v.endsWith(".svg")) void prefetchSvg(v).then(() => store.emit("content"));
      }, pickSvg),
      textInput("SVG width (%)", String(b.svgWidthPct), (v) =>
        edit(() => (b.svgWidthPct = Number(v) || 40))
      ),
      textInput("SVG X offset (%)", String(b.svgX), (v) => edit(() => (b.svgX = Number(v) || 0)), "of its own width; negative = left"),
      textInput("SVG Y offset (%)", String(b.svgY), (v) => edit(() => (b.svgY = Number(v) || 0)), "of its own height; negative = up")
    );
  }
  out.push(
    textInput("Kicker", b.kicker, (v) => edit(() => (b.kicker = v)), "small uppercase line above the title"),
    textInput("Title (H1)", b.title, (v) => edit(() => (b.title = v))),
    textInput("Tagline", b.tagline, (v) => edit(() => (b.tagline = v))),
    selectInput("Align", b.align, [["left", "Left"], ["center", "Center"]], (v) =>
      edit(() => (b.align = v as "left" | "center"))
    ),
    selectInput(
      "In-animation",
      b.anim,
      [
        ["none", "None"],
        ["fade", "Fade in"],
        ["words", "Words (random delayed fade-up)"],
      ],
      (v) => edit(() => (b.anim = v as HeroBlock["anim"]))
    ),
    textArea(
      "Scroll prompt (empty = off; up to two rows, fades in late)",
      b.scrollPrompt,
      (v) => edit(() => (b.scrollPrompt = v)),
      2,
      "Welcome!\nScroll down to enter ↓"
    ),
    checkbox("Nav bar reveals on scroll (like index/release pages)", b.navReveal, (v) =>
      edit(() => (b.navReveal = v))
    ),
    checkbox("“← Back to Notebook” fades in (container left edge)", b.backLink, (v) =>
      edit(() => (b.backLink = v))
    )
  );
  return out;
}

function iconsForm(b: IconsBlock): HTMLElement[] {
  const addIcon = async () => {
    const files = await pickMedia("svg", true, "svg");
    if (!files.length) return;
    for (const f of files) await prefetchSvg(f.web);
    editStructural(() => {
      for (const f of files) {
        const name = (f.web.split("/").pop() || "").replace(/\.svg$/i, "");
        b.items.push({ src: f.web, label: name, href: "" });
      }
    });
  };
  const itemNodes = b.items.map((it, i) =>
    el(
      "details",
      { class: "gallery-item" },
      el(
        "summary",
        {},
        el("span", { class: "gallery-item-name" }, it.label || it.src.split("/").pop() || "(icon)"),
        el(
          "button",
          {
            class: "danger small",
            title: "Remove icon",
            onclick: (e: Event) => {
              e.preventDefault();
              e.stopPropagation();
              editStructural(() => b.items.splice(i, 1));
            },
          },
          "✕"
        )
      ),
      textInput("Label", it.label, (v) => edit(() => (it.label = v)), "screen-reader name"),
      textInput("Link", it.href, (v) => edit(() => (it.href = v)), "https://… or /page.html"),
      textInput("SVG", it.src, (v) => {
        edit(() => (it.src = v));
        if (v.endsWith(".svg")) void prefetchSvg(v).then(() => store.emit("content"));
      })
    )
  );
  return [
    textInput("Panel label", b.label, (v) => edit(() => (b.label = v)), "e.g. Listen everywhere (empty = centered row)"),
    selectInput(
      "Icon size",
      b.size,
      [["small", "Small (footer size)"], ["medium", "Medium"], ["large", "Large"]],
      (v) => edit(() => (b.size = v as IconsBlock["size"]))
    ),
    el("div", { class: "gallery-items" }, ...itemNodes),
    el("button", { class: "secondary", onclick: addIcon }, "Add icons… (multi-select svg)"),
  ];
}

function columnsForm(b: ColumnsBlock): HTMLElement[] {
  const out: HTMLElement[] = [
    selectInput("Columns", String(b.count), [["1", "1"], ["2", "2"]], (v) =>
      editStructural(() => (b.count = Number(v) as 1 | 2))
    ),
    selectInput(
      "Vertical align",
      b.verticalAlign,
      [["center", "Center"], ["top", "Top"]],
      (v) => edit(() => (b.verticalAlign = v as "center" | "top"))
    ),
  ];
  for (let i = 0; i < b.count; i++) {
    const child = b.columns[i];
    out.push(
      el(
        "div",
        { class: "column-editor" },
        el("h5", {}, b.count === 2 ? (i === 0 ? "Left column" : "Right column") : "Content"),
        selectInput("Type", child.type, EMBEDDABLE_LABELS, (v) =>
          editStructural(() => (b.columns[i] = newBlock(v as BlockType)))
        ),
        // child blocks reuse their full form — any embeddable type works here
        ...FORMS[child.type](child as never)
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

function downloadsForm(b: DownloadsBlock): HTMLElement[] {
  const addFiles = async () => {
    const files = await pickMedia("any", true, "download");
    if (!files.length) return;
    const paths = files.map((f) => f.web);
    const hashes = await hashFiles(paths).catch(() => paths.map(() => null));
    editStructural(() => {
      files.forEach((f, i) => {
        const h = hashes[i];
        b.items.push({
          src: f.web,
          label: "",
          size: h?.size ?? 0,
          sha256: h?.sha256 ?? "",
          sha512: h?.sha512 ?? "",
          missing: !h,
        });
      });
    });
  };

  const refreshAll = async () => {
    const paths = b.items.map((it) => it.src);
    const hashes = await hashFiles(paths).catch(() => paths.map(() => null));
    editStructural(() => {
      b.items.forEach((it, i) => {
        const h = hashes[i];
        it.missing = !h;
        if (h) {
          it.size = h.size;
          it.sha256 = h.sha256;
          it.sha512 = h.sha512;
        }
      });
    });
    toast("Hashes recomputed");
  };

  const itemNodes = b.items.map((it, i) =>
    el(
      "details",
      { class: "gallery-item" },
      el(
        "summary",
        {},
        el("span", { class: "gallery-item-name" }, it.label || it.src.split("/").pop() || "(file)"),
        it.missing ? warnBadge("File not found on disk") : "",
        el(
          "button",
          {
            class: "danger small",
            title: "Remove file",
            onclick: (e: Event) => {
              e.preventDefault();
              e.stopPropagation();
              editStructural(() => b.items.splice(i, 1));
            },
          },
          "✕"
        )
      ),
      textInput("Label", it.label, (v) => edit(() => (it.label = v)), "empty = file name"),
      el("p", { class: "hint" }, `${it.src} — ${it.size} bytes`),
      el("p", { class: "hint" }, `sha256: ${it.sha256 ? it.sha256.slice(0, 16) + "…" : "(not computed)"}`)
    )
  );
  return [
    el(
      "p",
      { class: "hint" },
      "Hashes are computed automatically and re-verified at every export (SHA-256 + SHA-512, streamed)."
    ),
    el("div", { class: "gallery-items" }, ...itemNodes),
    el("button", { class: "secondary", onclick: addFiles }, "Add files from repo… (multi-select)"),
    b.items.length ? el("button", { class: "secondary", onclick: refreshAll }, "↻ Recompute hashes now") : el("span", {}),
  ];
}

// ---------------------------------------------------------------- dispatcher

type FormFn = (b: never) => HTMLElement[];

function form<T extends Block>(fn: (b: T) => HTMLElement[]): FormFn {
  return fn as unknown as FormFn;
}

const FORMS: Record<BlockType, FormFn> = {
  faq: form<FaqBlock>(faqForm),
  downloads: form<DownloadsBlock>(downloadsForm),
  hero: form<HeroBlock>(heroForm),
  heading: form<HeadingBlock>(headingForm),
  paragraph: form<ParagraphBlock>(paragraphForm),
  hr: form<Block>(() => [el("p", { class: "hint" }, "A horizontal divider. No options.")]),
  gallery: form<GalleryBlock>(galleryForm),
  image: form<ImageBlock>(imageForm),
  svg: form<Block & SvgFields>((b) => svgFieldsEditor(b)),
  video: form<VideoBlock>(videoForm),
  columns: form<ColumnsBlock>(columnsForm),
  icons: form<IconsBlock>(iconsForm),
  audio: form<AudioBlock>(audioForm),
  raw: form<RawBlock>(rawForm),
};

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
  for (const f of FORMS[b.type](b as never)) container.appendChild(f);
}
