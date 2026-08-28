# Notebook Page Builder v2

Desktop app (Tauri v2) for building Notebook pages visually, rewritten on
[Puck](https://puckeditor.com). The preview renders with the **real site CSS and
fonts**, and finished pages export into `input_custom_html_pages/` where Eleventy
picks them up.

v1 lives on untouched in `../page_builder/` and still builds. This is a separate
app with its own binary, config dir and project folder — see "Coexistence".

## Run it

```bash
./page_builder_v2_app        # prebuilt binary at the repo root (Linux)
```

No runtime dependencies. The app finds the repo automatically when the binary is
at the repo root (or anywhere inside it); run from elsewhere and it asks once,
then remembers.

## Build it

```bash
bun install
bun run build                # typecheck + vite
bunx tauri dev               # dev app (port 5174 — v1 uses 5173)
bunx tauri build --no-bundle # release binary
bun test tests               # 254 tests (see Tests: v1 deps required)
```

**Use `bunx tauri build`, not `cargo build`.** Plain cargo produces a binary that
tries to load `devUrl` and shows "Could not connect to localhost".

Copy the result to the repo root as `page_builder_v2_app` (the obvious name
`page_builder_app_v2` is taken by this source folder).

### Building the Windows .exe

Build it **natively on the Windows machine**. Cross-compiling from Linux is
possible with `cargo-xwin` + clang/lld, but it is fiddly, needs the Windows SDK
headers pulled down separately, and produces a binary nobody can smoke-test on
the machine that built it.

**One-time setup** (each installer is a normal wizard; accept the defaults):

1. **Rust** — [rustup.rs](https://rustup.rs). Take the default `x86_64-pc-windows-msvc`
   toolchain. It will offer to install the Visual Studio C++ Build Tools; say
   yes — the linker will not work without them.
2. **Bun** — [bun.sh](https://bun.sh), or in PowerShell:
   `powershell -c "irm bun.sh/install.ps1 | iex"`
3. **WebView2** — already on Windows 10 and 11. Nothing to do.

Close and reopen the terminal afterwards so `cargo` and `bun` are on PATH.
Check with `cargo --version` and `bun --version`.

**Every build** — from the repo root, in `cmd` or PowerShell:

```bat
cd page_builder_app_v2
bun install
bunx tauri build --no-bundle
copy src-tauri\target\release\page_builder_v2.exe ..\page_builder_v2_app.exe
```

- `bun install` is required: `node_modules/` is gitignored, though `bun.lock`
  and `Cargo.lock` are committed, so you get the same dependency versions as the
  Linux build.
- The first Rust build compiles every dependency and takes a few minutes.
  Later builds are seconds.
- `--no-bundle` skips the MSI/NSIS installer. This is a plain portable .exe;
  `bundle.active` is false in `tauri.conf.json` anyway.
- The .exe is named after `productName` in `tauri.conf.json`
  (`page_builder_v2`), which is why the copy renames it — the repo root uses
  `page_builder_v2_app.exe`, matching the Linux `page_builder_v2_app` and v1's
  `page_builder_app.exe`.

**Check it works:** double-click `page_builder_v2_app.exe` at the repo root. It
should find the repo automatically (it looks for `eleventy.config.js` +
`eleventy_settings/` in its own ancestors) and open with the block palette on
the left. If it asks you to locate the folder, point it at the repo once and it
remembers.

Then commit it — both binaries live at the repo root, ~7 MB each:

```bat
git add ..\page_builder_v2_app.exe
```

Everything else is OS-agnostic. Paths are stored repo-relative and the export
pipeline is pure string work, so a page exported on Windows is byte-identical to
one exported on Linux.

**To run the dev app instead** (`bunx tauri dev`): it serves on port 5174, so v1
on 5173 can run at the same time.

## Why the rewrite

v1 hand-rolled its editor: a 759-line string-concatenating renderer, 738 lines of
imperative form builders, a 406-line untyped preview bridge with two pointer-drag
state machines, and a hand-written undo store. Puck provides drag-and-drop,
undo/redo, the outline, the component palette and — the big one — **generates
every sidebar form from a declarative field schema**. Roughly 2,900 lines of
plumbing went away.

## How it works

- A tiny localhost server (127.0.0.1, random port, GET-only, repo-jailed) serves
  the **repo root**. The preview iframe gets a `<base href>` pointing at it, so
  root-absolute paths (`/main.css`, `/photos/…`) resolve exactly as on the live
  site — **with zero change to the emitted markup**. Preview and export render
  byte-identical HTML, which is the property the whole design hangs on.
- The fixed `<nav>` is deliberately not rendered in the **editor** frame (it
  would sit on top of Puck's drop targets). Editor fidelity is "content region
  accurate, page chrome omitted".
- `Ctrl/Cmd+I` toggles Puck's interactive mode, which plays the real entry
  animations. That is v1's edit/preview toggle, for free.
- **Preview** (toolbar) closes the gap: it renders the page exactly as it will be
  published and serves it from that same server at `/__pb/preview`, in a
  full-screen iframe. Because the frame *navigates* rather than using `srcDoc`,
  root-absolute URLs resolve natively — so nav, footer, fonts, GLightbox, Alpine
  and the one-shot entry animations are all the real thing. See "Preview" below.
- Export writes `input_custom_html_pages/<slug>.html`: YAML front matter plus
  `shell.html` with every `{{PLACEHOLDER}}` filled. Eleventy's before-hook then
  copies the body **verbatim** to `notebook_pages/`. Verified byte-identical.
- The live **page check** runs the real export renderers, so what it scans is
  exactly what would be written — which also makes it cost a full page render
  (~7 ms on a 24-block page). The DATA it runs against is therefore debounced by
  300 ms, so a typing burst costs one render instead of one per character. The
  export path is unchanged and still renders on demand; `runPageCheck` in
  `app/PageCheck.tsx` is a plain function of the data so it stays testable
  without a React renderer.
- Every front-matter value is double-quoted **except `date`**, which stays bare
  when it is a plain `YYYY-MM-DD` — that is what the committed pages carry, and
  what lets YAML type it as a timestamp. Anything else gets quoted, because an
  unquoted date containing `": "` makes gray-matter throw and stops the whole
  site build. The page check warns on both a missing date (Eleventy silently
  substitutes the build date) and a non-ISO one.

## Two rules that constrain everything

1. **No CSS build on export.** Only Tailwind classes already present in the
   compiled `main.css`/`prose.css` may be emitted. `tests/render.test.tsx` greps
   the real committed CSS to enforce this. A plausible-looking `mb-24` that isn't
   in the bundle ships as an invisible no-op.
2. **Every top-level block owns exactly ONE gap: the margin below it.** Never a
   top margin, never padding — padding cannot margin-collapse, so a block with
   both sides set double-counts against its neighbours and makes gaps depend on
   block order. `BlockShell`/`ProseShell` are the only places a spacing class may
   be emitted.

   The scale is `src/puck/spacing.ts`: **None** (no class at all — mb-0 exists
   but every hand-written page uses a bare wrapper), **Gallery gap** 8px,
   **Tight** 32px, **Normal** 64px, **Loose** 80px. "Gallery gap" is `mb-2`,
   which equals the `gap-2` between images in the justified gallery layout — set
   it to make the next block sit as close as two photos in a row, e.g. when
   stacking galleries so they read as one grid. A test asserts the two values
   stay equal.

## Block anatomy

Four shapes, decided by `nesting.tsx` reading a React context that `<Nested>`
provides inside column slots:

| | top level | nested in a column |
|---|---|---|
| prose (Text, Heading, Divider) | `<article class="prose … mb-16">` | `<div class="prose …">` |
| everything else | `<section class="mb-16">` | no wrapper — the slot div is the wrapper |

The content must be a **direct child** of the element carrying `prose`:
`prose.css` zeroes first/last-child margins with a direct-child selector, so an
intermediate `<div>` leaves a stray margin at the top of every prose block.

## Adding a block type

Four artifacts. TypeScript will not compile until all of them exist, which is the
same "add a type and everything else fails loudly" property v1 got from its three
parallel `Record<BlockType, …>` maps.

**1. A props interface** — next to the component, exported.

```tsx
export interface QuoteProps {
  text: string;
  cite: string;
  spacing: Spacing;
  puck?: PuckContext;   // only if you need isEditing
}
```

**2. A component** in `src/puck/components/`, returning a `BlockShell` (or
`ProseShell` for prose). Transcribe the body from the matching `*Inner()` in v1's
`src/blocks/render.ts`: `class` → `className`, `style="a:b"` → `style={{a:"b"}}`,
raw HTML strings → `dangerouslySetInnerHTML`.

```tsx
export function Quote({ text, cite, spacing, puck }: QuoteProps) {
  if (!text.trim() && puck?.isEditing) {
    return <EmptyHint label="Empty quote — write it in the sidebar" />;
  }
  return (
    <BlockShell spacing={spacing}>
      <blockquote className="…">{text}</blockquote>
    </BlockShell>
  );
}
```

*Raw markup goes through `BlockShell`'s `html` prop, never a
`<div dangerouslySetInnerHTML>` child — that div would be an extra element on
every page using the block.*

**3. One entry in `src/puck/config.tsx`** — label, fields, defaults, renderer.
`fields` is a mechanical translation of the matching builder in v1's
`ui/blockForms.ts`:

| v1 form control | Puck field |
|---|---|
| text input | `{ type: "text" }` |
| textarea | `{ type: "textarea" }` |
| dropdown | `{ type: "select", options }` |
| checkbox | `{ type: "radio", options: [Off/On] }` — use the `onOff()` helper |
| number | `numberField(label, min?, max?)` — **not** `{ type: "number" }`, see below |
| repeated text group | `{ type: "array", arrayFields, getItemSummary }` |
| **anything needing a file** | `{ type: "custom" }` — see below |

*Use `numberField()` for every number, bounded or not. Puck's built-in
`number` field validates on each keystroke and drops the event when the value is
outside `[min, max]`; the input is controlled, so the keystroke is erased and a
field with a `min` above 9 cannot be typed into at all — only stepped with the
spinners. `fields/numberField.tsx` holds the in-progress text locally and
enforces the bounds on commit instead. The decisions are pure and tested in
`fields/numberOps.ts`.*

Fields that only apply in some states use `resolveFields` with
`visible: false` — **not** omission, which does not typecheck (`Fields<Props>`
requires every prop to have a field).

**4. Add it to `EMBEDDABLE`** in `config.tsx` if it may live inside a column.

Then, if the block feeds structured data or checks, extend `src/export/collect.ts`
(JSON-LD images/word count, svg prefetch, download hashes, alt-text lint), and add
a case to `sample()` in `tests/render.test.tsx` so the class-coverage and spacing
guards actually cover it.

### Why file pickers are `custom`, not `array`

A `custom` field's `onChange` can only write **its own prop**. An `array` field's
add button appends an empty `defaultProps` entry, and there is no hook to make it
open a native dialog instead. So anything that creates items from files owns its
whole array as one custom field — see `GalleryItemsEditor`, `ListEditors`.

The same constraint is why the Image block and the hero store their photo as one
`{full, thumb}` prop rather than two: the picker has to set both at once.

Custom fields also render their own label — wrap them in Puck's `FieldLabel` or
the field appears unlabelled.

## React quirks that bite

- **React 19 hoists `<link rel="preload" as="image">` in front of every eager
  `<img>`** — even with no fetch-priority attribute. That would land inside
  `<body>`, where `<link>` is not valid HTML5. `stripReactPreloads()` removes
  them; it must stay applied on every path that turns React into HTML.
- React cannot emit a bare valueless attribute (`controls` becomes `controls=""`)
  and self-closes void elements. Both are harmless; `format.ts` normalises void
  elements back to the site's `<img>` convention for readable git diffs.
- `usePuck()` takes no selector — only `createUsePuck()` does.
- `<Puck data>` is **initial** state, copied into Puck's store on mount. Changing
  it afterwards does not re-sync; loading a project remounts Puck via `key`.

## Coexistence with v1

Everything is isolated so a v2 bug cannot damage v1:

| | v1 | v2 |
|---|---|---|
| source | `page_builder/` | `page_builder_app_v2/` |
| binary | `page_builder_app` | `page_builder_v2_app` |
| dev port | 5173 | 5174 |
| config | `~/.config/page_builder/` | `~/.config/page_builder_v2/` |
| projects | `page_builder/projects/` | `page_builder_app_v2/projects/` |
| `shell.html` | its own | its own |

Only the export target `input_custom_html_pages/` is shared — both are front ends
for the same Eleventy input.

**Project formats are incompatible.** v1 stores `{version:1, meta, blocks}`, v2
stores `{version:2, exportSlug, data}` where `data` is Puck's. v2 refuses to open
a v1 file rather than silently mangling it.

## Tests

```bash
bun install                      # in THIS folder
(cd ../page_builder && bun install)   # and in v1 — see below
bun test tests                   # 254 tests
```

`prose-parity.test.tsx` imports v1's real renderer from `../page_builder/src/`,
so it resolves v1's own `markdown-it` out of v1's `node_modules/`. Both folders
gitignore `node_modules/`, so on a fresh clone the suite fails with
`Cannot find package 'markdown-it'` until v1 has been installed too. That is the
cost of testing against the real v1 renderer rather than a copy of it; the rest
of the suite has no such dependency.

- `render.test.tsx` — **the class-coverage guard** (greps the real `main.css`)
  and the one-gap-per-block rule, iterated over the whole registry.
- `prose-parity.test.tsx` — renders each block with **v1's actual renderer** and
  diffs. This is what proves the port rather than arguing it. Delete this file if
  v1 is ever removed; the guards above stand on their own.
- `format.test.ts` — the formatter is lossless, and never reflows an inline run.
- `collect.test.ts` — tree collectors, including that content in a hidden
  `count:1` column slot is excluded from JSON-LD and lint but never lost.
- `export.test.tsx` — frontmatter quoting, JSON-LD, placeholder substitution.
- `lint.test.tsx` — heading outline and SEO checks.
- `preview.test.tsx` — that the preview equals the export minus its front matter,
  and that rendering one does not mutate the project.
- `regressions.test.tsx` — one describe per fixed defect, named for the symptom
  rather than the fix, so a failure says what broke for the user.

The Rust side has its own: `cargo test` in `src-tauri/` covers atomic writes,
the SHA-2 vectors, and that `/__pb/` is answered in full and never falls through
to a file read.

## Preview

**Preview** in the toolbar renders the current page and shows it running, in a
full-screen iframe pointed at `http://127.0.0.1:<port>/__pb/preview`.

- `buildPreview` (`src/app/project.ts`) calls **`assembleDocument`, not
  `exportText`** — the difference is the YAML front matter, which Eleventy strips
  before copying the body to `notebook_pages/`. Previewing the exported *file*
  would put raw YAML at the top of the page.
- It deliberately skips `revalidateThumbs` and `refreshDownloadHashes`. Both
  mutate `data` in place, so reusing `buildExport` here would mean that merely
  *looking* at a page silently edits the project and flips the dirty flag. A
  preview can therefore show a stale SHA; the export is what has to be right.
- The document lives in Rust memory (`AppState.preview`), handed over by
  `set_preview_html` and cleared when the modal closes. **Nothing is written to
  the repo** — that is the point of previewing before exporting.
- `server.rs` reserves the whole `/__pb/` prefix and answers it in full; an
  unknown path under it is a 404, never a file read. A file at
  `<repo>/__pb/preview` cannot shadow the route, and the route cannot shadow it.
- **It executes author-supplied JavaScript** — `Raw` blocks and markdown with
  `html: true` are unsanitised by design, and running them is the point. Note
  this is *safer* than the editor frame: Puck's frame is `srcDoc` and inherits
  the app's origin, so script in a Raw block can reach
  `parent.__TAURI_INTERNALS__`. A frame navigated to 127.0.0.1 is cross-origin
  and cannot. Do not add a CSP to the route — it would block GLightbox and
  Alpine, which is exactly what the preview exists to verify.
- **Reload re-points `src`; it never calls `location.reload()`.** The preview's
  nav and back-links are live, so by the time you press it you may have clicked
  through to `/notebook.html` on the repo server — reload would faithfully
  reload *that* instead of returning you to your draft.
- **Dark mode.** The site has no `data-theme`; it is pure
  `prefers-color-scheme`, so the only lever is the window theme. WebKitGTK does
  not resolve that identically for a `srcDoc` frame and a network-loaded one —
  on a GTK dark theme with `color-scheme` at `default`, the editor renders dark
  and the preview came up light. The modal therefore pins the app document's own
  resolved scheme on open and puts *that* back on close. Restoring `"system"`
  would not do: `setTheme(null)` is not the same as never having called
  `setTheme`, and would leave the editor lighter than it started.

## Split into columns

The breadcrumb carries a **Split into columns** button while a block is
selected. It wraps that block in a 2-column `Columns` block with the block as
the left column's only child — v1's split affordance, rebuilt on Puck's data
model. The block keeps its own id and props and simply moves, so the operation
is undone by dragging it back out (or with one Ctrl+Z: `setData` is excluded
from Puck's history by default, so the dispatch passes `recordHistory`).

- The new Columns block **inherits the split block's spacing**. A nested block
  emits no gap of its own — the columns section owns it — so without that, a
  split would silently change the page's vertical rhythm.
- It is offered only on top-level blocks whose type is in `EMBEDDABLE`, and is
  shown disabled rather than hidden elsewhere so the reason is discoverable.
  Splitting a `Featured` would be silent data damage rather than an error:
  nested, `BlockShell` emits no wrapper, so the card class and the whole
  overlapping grid would just vanish.
- `tests/split.test.tsx` asserts the split renders byte-identical to a
  hand-built Columns block, which is what makes it a move rather than a rewrite.

## Crash recovery

There is no autosave over your project files — deliberately; that would destroy
the meaning of both the dirty flag and "Discard". Instead, while a page has
unsaved changes the app snapshots it every 15s to `recovery.json` **in the
config dir** (`~/.config/page_builder_v2/`), never into `projects/` where it
would appear in the Open list and be committed to git.

On the next launch a draft is offered back ("Restore" / "Not now"). It is
deleted the moment the work is safe: on save, on opening another project, on
starting a new page, and on closing through the discard prompt. Anything
unparseable, or from v1, is deleted rather than offered — a corrupt safety net
that prompts on every launch is worse than none.

## Reconciliation with disk

Opening a project and exporting both re-check the project against what is
actually on disk (`src/export/fixups.ts`):

- **Thumbnails.** A `_min` file that appeared since the photo was linked is
  adopted automatically — linking first and generating thumbnails later is the
  intended workflow. Missing pixel dimensions are backfilled, which the
  justified gallery layout needs for its flex ratios.
- **Download hashes** are recomputed from the actual bytes. This one matters:
  rebuilding a binary changes its bytes without touching the project, and a
  published SHA that does not match the file is worse than no SHA at all.
  Opening a project whose hashes drifted marks it unsaved and says so.

**Shell freshness.** `shell.html` is this app's private copy of the page
boilerplate. When its `<nav>` or `<footer>` drifts from the reference page
(`input_custom_html_pages/galdhopiggen.html`), a badge appears under the page
check and offers to adopt each region — showing both versions first.
Placeholders like `{{NAV_EXTRA}}` are preserved. Note that adopting copies the
reference page's *indentation* too, so the region is re-formatted; the content
is what matters.

## Known gaps

- **No Windows binary committed yet** — v1 ships `page_builder_app.exe`, v2 does
  not. See "Building the Windows .exe" above; it has to be built on Windows.
- **Preview still is not the Eleventy build.** It renders the published document
  faithfully, but front matter is omitted (Eleventy strips it anyway), so
  mistakes in `date:`/`tags:` — which drive the Notebook and tag collections —
  do not surface there. The page check is the tool for that. Styling is also
  only as fresh as the last Tailwind build.
- Splitting is TOP-LEVEL only: a block already inside a column cannot be split
  again, because Columns is not in `EMBEDDABLE` and nesting columns in columns
  has no markup in the site's vocabulary.
- `revalidateThumbs` runs on open and on export, not continuously. Generate a
  `_min` file mid-session and use **↻ Re-check files** in the gallery editor to
  pick it up without reopening.
- Adopting a shell region copies the reference page's indentation too, so the
  region is re-formatted; only its content is meaningful.
