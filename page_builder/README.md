# Notebook Page Builder

Desktop app (Tauri v2) for building Notebook pages visually — a live, click-to-edit
preview that renders with the **real site CSS/JS**, exporting finished pages into
`html_extras/` where Eleventy picks them up.

Successor to the earlier tkinter builder.

## Run it

```bash
./page_builder_app        # the prebuilt binary at the repo root (Linux)
```

No dependencies needed at runtime. The app finds the repo automatically when the
binary lives at the repo root (or anywhere inside it); run from elsewhere and it
asks you to locate the folder once, then remembers.

## How it works

- A tiny localhost server (127.0.0.1, random port, GET-only, repo-jailed) serves
  the **repo root**, so root-absolute paths (`/main.css`, `/photos/...`) resolve
  exactly like on the live site. The preview iframe is pixel-accurate: real
  Tailwind build, real fonts, real GLightbox.
- **Edit mode**: click a block in the preview to select and edit it; hover for
  the floating handle — drag `⠿` to reorder, `+↑`/`+↓` to insert between blocks.
  Clicks never trigger links/lightbox in edit mode.
- **Preview mode** (toolbar toggle): GLightbox works for real (groups, captions,
  zoom); navigation away is still blocked.
- Blocks: hero, heading, text (markdown + KaTeX), divider, photo gallery,
  single image, SVG, video, columns, social icons, FAQ accordion, audio,
  raw HTML. Consecutive prose blocks are grouped into one
  `<article class="prose ...">` exactly like the old builder.
- **Block registry**: every type is defined once in
  `src/blocks/defs.ts` (label, defaults, embeddability, summary), with
  compile-checked Records for its renderer (`src/blocks/render.ts`) and form
  (`src/ui/blockForms.ts`). Adding a block type = add it to the model union
  and the compiler lists every missing piece; embeddable types automatically
  appear as column content and get the preview "split" affordance.
- **Columns hold real blocks** — any embeddable type (text, image, gallery
  with all its layouts, video, SVG, icons, FAQ, raw) works as a column, with
  its full form reused. In edit mode each column shows a type chip (click to
  swap content type) and empty slots show a "＋ pick content" target; the
  floating handle's ⿲ button splits any embeddable block into 2 columns.
- **Hero** (always renders first, whatever its list position — it's pinned to
  the top of the block list and injected before the page container).
  **Background** (none / dot grid like index.html / blurred photo backdrop /
  full-bleed photo cover that fades out at the bottom) combines freely with
  the **foreground**: optional themed SVG (width %, x/y offset in % of its own
  box, spacing to the text) plus kicker + H1 title + tagline, left or
  centered. Left-aligned text + SVG renders side by side (text left, svg
  right, `release-hero__grid`); centered stacks them. The cover has a long
  bottom fade-out and a **tint choice** (dark scrim + white text, or light
  scrim + dark text for bright photos). **In-animation**: fade
  (`extra_fade_effect`), per-word random-delay fade-up (`word_animation`,
  like about.html), or **wave echo** (the index.html imploding-outline effect
  applied to the hero SVG). Optional custom
  **scroll prompt** that fades in late exactly like index.html's
  `#scroll-prompt`. Hero pages have exactly ONE "← Back to Notebook": the
  hero's late-fading link aligned to the page container's left edge — the
  shell's normal static link is suppressed via the `{{BACKLINK}}` placeholder.
  Nav reveal on scroll uses the site's own `navi_mechanic` CSS scroll-timeline
  + `navbar_scroll` fallback (the **one** JS exception, existing site code).
  Everything else is JS-free.
- **Word animation** toggles on heading and text blocks wrap every word in
  the site's `word_animation` spans with deterministic pseudo-random delays
  (stable across re-exports); math, code and inline svg are left untouched.
- **FAQ accordion**: about.html's CSS-only checkbox accordion, markdown
  answers, ids prefixed with the block id so multiple FAQ blocks coexist.
- **Downloads block**: download.html's verification table with **SHA-256 +
  SHA-512** columns (MD5 deliberately dropped — it's broken). Pick files from
  the repo and the backend streams both hashes (1 MiB chunks, big zips never
  load into RAM). Hashes are **recomputed at every export and on project
  open**, so the published values always match the actual bytes; replaced
  files are reported, missing ones block the export with a warning.
- **Social icons panel**: a row of themed SVG icons with hover-mute
  (`hover:opacity-50`), sr-only labels, and per-icon links — mirrors the footer
  / release-page social rows. External links open in a new tab automatically.
  An optional **panel label** switches it to the release-page "Listen
  everywhere" look (mono uppercase label + left-aligned row).
- **Gallery drag-drop**: with a gallery selected in edit mode, drag its images
  directly in the preview to reorder them (a small movement threshold keeps
  plain clicks working; the sidebar ↑↓ buttons remain for column galleries).
- **Galleries have two layouts.** *Justified* (default): Behance/Flickr-style
  rows where every image keeps its native aspect ratio — pure CSS in the
  export (flex-grow proportional to each image's ratio + `aspect-ratio`, zero
  JS; the app reads image dimensions from the files when you pick them). The
  "Row height" setting is a target: rows land between ~0.75× and 1.5× of it.
  *Uniform*: the previous fixed-aspect crop grid (columns + aspect preset).
  (Lists and quotes are plain markdown now — `- item`, `> quote` — so they have
  no separate block type; old projects containing them convert automatically.)
- **Columns**: 1 or 2 columns, each holding any content — text, image,
  image grid, video, SVG, or raw HTML. Replaces the old fixed two-column block
  (old projects convert on open). Vertical alignment is center or top.
- **Alignment & size**: headings align left or centered; images and SVGs have a
  width setting (25–100% of the container, auto-centered when below 100%).
- **SVG**: linked like other media, with options. "Follow light/dark theme"
  inlines the file with all colors replaced by `currentColor`, so it recolors
  with the site theme; off = plain `<img>` link. Optional smooth grow-on-hover
  (uses `hover:scale-105` utilities already in main.css) and an optional link
  wrap. `fill="none"` and gradient `url(#…)` references are preserved, and
  files with no fill attributes at all (typical Illustrator exports) get
  `currentColor` on the root — SVG's default would otherwise stay black in
  dark mode.
- **Preview theme toggle** (🌗 Auto / ☀ Light / 🌙 Dark in the toolbar): the
  site's dark mode is `prefers-color-scheme`, so this flips the window theme
  to check both modes — e.g. themed SVGs — without changing the OS setting.

## Markdown + KaTeX

Text blocks are markdown rendered through **the exact same pipeline as the
site's Eleventy config** (`src/markdown.ts` mirrors `eleventy.config.js` —
markdown-it + attrs + link-attributes + texmath/KaTeX with **MathML output**).
Math needs no katex.css/js in exported pages. `$...$` inline, `$$...$$` display,
`{.class}` attributes, external links get `target="_blank"` automatically.

**If you change the markdown settings in `eleventy.config.js`, mirror the change
in `src/markdown.ts`** (and keep the pinned versions in `package.json` matching
the repo's node_modules).

## Media

Picking media only **links** it (no copying). Paths become root-absolute
(`/photos/...`) and the `_min` thumbnail is derived automatically
(`foo.jpg` → `foo_min.jpg`). If the `_min` file doesn't exist yet you get a
⚠ badge (the full-size image is used meanwhile); add the file later and reopen
the project — it upgrades automatically. Files outside the repo are rejected.

Gallery/grid pickers are **multi-select** (ctrl/shift-click in the file
dialog), and inserting a gallery or SVG block opens the picker right away, so
an image grid is one pick.

## Projects & export

- **Save/Open**: projects are JSON in `projects/` (committed with the repo).
- **Export**: writes front matter + full HTML to `html_extras/<slug>.html`
  (asks before overwriting). Then run the Eleventy build as usual — the page is
  copied to `notebook_pages/` and indexed on the Notebook. `Draft` pages are
  skipped by the build.
- The exported page never contains editor markup; export and preview come from
  the same renderer.

## Page check (headings + SEO)

A live panel under the toolbar lints the page while you edit, and Export asks
for confirmation if warnings remain:

- **Heading outline** — exactly one H1 first, no level jumps (H1 → H3). This is
  what browser reader mode and search engines build the article outline from,
  and it covers heading blocks, markdown `#` headings, columns and raw HTML
  alike (it checks the rendered output).
- **SEO fields** — missing/overlong title and description, missing card image,
  missing tags, images without alt text, unlabeled icons, multiple/incomplete
  heroes, missing download files. No separate SEO menu: the front-matter
  fields (title/description/tags/card image) are the SEO data, and the export
  fills everything else automatically — `<title>`, meta description/keywords,
  canonical, Open Graph (`og:type article`, `og:site_name`), Twitter Card, and
  JSON-LD, matching the site's own `base.njk` head.
- **Schema (JSON-LD) is content-accurate.** The "Schema" select in page
  details defaults to **Auto**: photo-dominated pages emit `ImageGallery`,
  FAQ-dominated pages `FAQPage`, everything else `BlogPosting` (overrides:
  Blog post / Article / Photo gallery / FAQ page). Whatever the type, the
  entity is enriched from the real page: an image array with actual pixel
  dimensions, FAQ blocks as a machine-readable `FAQPage` entity (`@graph`),
  `wordCount`, keywords, `dateModified`. The page check shows what Auto
  resolved to.
- The block list shows a **green/yellow dot** per image-bearing block: green
  when alt/title/description are all filled, yellow when something's missing.

## Editing safety

- **Undo/redo**: Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z). Rapid keystrokes coalesce
  into one step; a new edit after undo clears the redo history.
- Deleting a block asks for confirmation (and is undoable anyway). The Delete
  key removes the selected block; Ctrl+D duplicates it.
- Closing with unsaved changes asks first; Ctrl+S saves.
- Export remembers the slug per project: re-exporting to the same file skips
  the overwrite question, and a missing themed-SVG file blocks with a warning
  instead of silently exporting a placeholder.

## shell.html staleness

`shell.html` here is the page boilerplate (head/SEO/nav/footer), originally
extracted from `html_extras/galdhopiggen.html`. On start the app compares its
`<nav>`, `<footer>` and head asset links against that reference page and shows
a ⚠ badge with a diff + one-click **Adopt from reference** if the site's chrome
has changed. (If galdhopiggen.html itself gets retired, change `REFERENCE_PAGE`
in `src-tauri/src/commands.rs`.)

## Development

```bash
cd page_builder
bun install
bun test                      # unit suite (renderer/export/lint/store/svg/modals)
bunx tauri dev                # dev app (vite + cargo, hot reload)
bunx tauri build --no-bundle  # release binary
cp src-tauri/target/release/page_builder ../page_builder_app
```

### Building the Windows binary

Build natively on the Windows machine (one-time setup: install
[rustup](https://rustup.rs) with the default MSVC toolchain — it offers to pull
the VS Build Tools — and [Bun](https://bun.sh); WebView2 is preinstalled on
Windows 10/11):

```bat
cd page_builder
bun install
bunx tauri build --no-bundle
copy src-tauri\target\release\page_builder.exe ..\page_builder_app.exe
```

Both binaries live side by side at the repo root (`page_builder_app` for Linux,
`page_builder_app.exe` for Windows), each ~7 MB — both safe to commit. All the
path handling is OS-agnostic; exported pages are identical from either OS.

(Cross-compiling the .exe from Linux is possible with `cargo-xwin` +
clang/lld installed, but native builds are simpler and better tested.)

Layout: `src/` frontend (vanilla TS — state, block renderer, export pipeline,
UI panels), `preview-harness/editor-bridge.js` (script injected into the
preview document; compiled into the binary), `src-tauri/src/` (repo discovery,
static server, fs/dialog commands).

Notes:
- Raw HTML blocks are inserted verbatim — `<script>` in them runs in the
  preview too. It's a single-author tool; mind what you paste.
- The renderer may only emit Tailwind classes that already exist in the
  compiled `main.css` (there is no CSS build on export). That's why the old
  `1/1` aspect preset is gone — `square` is the same thing and exists.
- The preview engine is WebKit (webkit2gtk), not Chromium; double-check final
  pages in your normal browser via the regular Eleventy build.
