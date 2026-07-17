# Notebook Page Builder

Desktop app (Tauri v2) for building Notebook pages visually — a live, click-to-edit
preview that renders with the **real site CSS/JS**, exporting finished pages into
`html_extras/` where Eleventy picks them up.

Successor to the tkinter builder in `old_page_builder/` (kept for reference).

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
- Blocks: heading, text (markdown + KaTeX), divider, photo gallery, single
  image, SVG, video, columns, audio, raw HTML. Consecutive prose blocks are
  grouped into one `<article class="prose ...">` exactly like the old builder.
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
  (old projects convert on open).
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
  missing tags, images without alt text. No separate SEO menu: the front-matter
  fields (title/description/tags/card image) are the SEO data, and the export
  fills everything else automatically — `<title>`, meta description/keywords,
  canonical, Open Graph (`og:type article`, `og:site_name`), Twitter Card, and
  JSON-LD BlogPosting, matching the site's own `base.njk` head.

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
