# Notebook Page Builder v2

Desktop app (Tauri v2) for building Notebook pages visually, rewritten on
[Puck](https://puckeditor.com). The preview renders with the **real site CSS and
fonts**, and finished pages export into `input_custom_post/` where Eleventy
picks them up.

**Exports are body FRAGMENTS, not whole documents** — hero, content and JSON-LD,
nothing else. Eleventy wraps each one in `eleventy_settings/post_body.njk` and
`base.njk`, which supply the `<head>`, `nav.njk`, `footer.njk` and the post
furniture (the date/`<h1>`/back-link header and the closing date rule +
"← NOTEBOOK FRONT PAGE" link) at build time — so a change to any of them
reaches every page ever exported, on the next build, with nothing to keep in
sync. See "Who owns the page furniture". `shell.html` used to hold this app's
own copy of that chrome and silently drifted out of date; it is now GENERATED
build output (see "Preview"). `input_custom_html_pages/` still exists, for
complete standalone documents such as the browser apps — this app does not
write there.

v1 (`page_builder/`) was removed on 2026-09-12; see "v1".

## Run it

```bash
./page_builder_v2            # prebuilt binary at the repo root (Linux)
```

On Windows, `page_builder_v2.exe` at the repo root.

No runtime dependencies. The app finds the repo automatically when the binary is
at the repo root (or anywhere inside it); run from elsewhere and it asks once,
then remembers.

## Build it

```bash
bun install
bun run build                # typecheck + vite
bunx tauri dev               # dev app (port 5174)
bunx tauri build --no-bundle # release binary
bun test tests               # 293 tests (see Tests)
```

**Use `bunx tauri build`, not `cargo build`.** Plain cargo produces a binary that
tries to load `devUrl` and shows "Could not connect to localhost".

Copy `src-tauri/target/release/page_builder_v2` to the repo root (the binary is
named after `productName` in `tauri.conf.json`).

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
copy src-tauri\target\release\page_builder_v2.exe ..\page_builder_v2.exe
```

- `bun install` is required: `node_modules/` is gitignored, though `bun.lock`
  and `Cargo.lock` are committed, so you get the same dependency versions as the
  Linux build.
- The first Rust build compiles every dependency and takes a few minutes.
  Later builds are seconds.
- `--no-bundle` skips the MSI/NSIS installer. This is a plain portable .exe;
  `bundle.active` is false in `tauri.conf.json` anyway.
- The .exe is named after `productName` in `tauri.conf.json`
  (`page_builder_v2`), matching the Linux `page_builder_v2` at the repo root.
- **Rebuild it whenever the Linux binary is rebuilt.** The two drift apart
  otherwise, and an export from an out-of-date build can be in an older format
  — see "Known gaps".

**Check it works:** double-click `page_builder_v2.exe` at the repo root. It
should find the repo automatically (it looks for `eleventy.config.js` +
`eleventy_settings/` in its own ancestors) and open with the block palette on
the left. If it asks you to locate the folder, point it at the repo once and it
remembers.

Then commit it — both binaries live at the repo root, ~7 MB each:

```bat
git add ..\page_builder_v2.exe
```

Everything else is OS-agnostic. Paths are stored repo-relative and the export
pipeline is pure string work, so a page exported on Windows is byte-identical to
one exported on Linux.

**To run the dev app instead** (`bunx tauri dev`): it serves on port 5174.

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
- **Export HTML…** (toolbar) saves the page as one complete `<!DOCTYPE>`
  document, wherever the native Save dialog is pointed. See "Standalone HTML
  export" below. This is the side errand, not the publishing path.
- Export writes `input_custom_post/<slug>.html`: YAML front matter plus the body
  fragment — hero, content column and JSON-LD, and nothing else. Eleventy
  renders it through `post_body.njk` and `base.njk` to
  `notebook_pages/<slug>.html`, and those add the header and the ending (see
  "Who owns the page furniture"). Export never reads `shell.html`.
  The extension is `.html` even though `html` is not in Eleventy's
  `templateFormats`: `eleventy.config.js` reads the folder itself and registers
  each file with `addTemplate()` under a virtual `.njk` input path, passing
  `templateEngineOverride: false`. So the body is emitted verbatim and is never
  parsed as a template — which is what lets a page contain `{{`, `{%` or KaTeX
  braces such as `\frac{{a}}{{b}}` without breaking the build.
  `input_custom_post/_template.html` is the regression fixture for that.
  A page with a hero also gets `header: false`, because the hero carries its own
  `<h1>` and back link. This folder used to be `input_build_page/`, whose files
  had to be `.njk`; the two folders were redundant and it was removed.
  Two front-matter flags are read by `base.njk`, not by this app: `navScroll`
  (adds `.navi_mechanic` and loads `navbar_scroll_min.js` together) and
  `customJsonLd` (suppresses base.njk's Article block so this page's own
  resolved schema type wins).
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

## Who owns the page furniture

Every notebook post carries the same furniture: the date/`<h1>`/back-link
**header** at the top, and the **ending** — the date rule and the
"← NOTEBOOK FRONT PAGE" link — at the bottom. It is defined ONCE, as macros in
`eleventy_settings/post_chrome.njk`, and used by:

| | |
|---|---|
| `post.njk` | markdown posts |
| `post_body.njk` | block posts in `input_custom_post/` — hand-written or exported from here |
| `eleventy_njk/_builder_shell.njk` | this app's `shell.html`: Preview, Export HTML… and the editor's header |

**This app emits none of it.** Exports are hero + content + JSON-LD. The only
decision it makes is whether the layout's header appears at all, in
`layoutAddsHeader` (`src/export/export.ts`): yes, unless the page has a hero,
which carries its own `<h1>` and back link — so a hero page exports
`header: false`. The front matter, the preview, the editor and the page check
all ask that one function.

Until 2026-09-19 the split was different: exports carried their own header and
ending, `header: false` only switched off the layout's header, and every
published builder page showed the ending twice. Two guards keep that from
coming back:

- `eleventy.config.js` stops the build, naming the file, if a body in
  `input_custom_post/` carries its own "← NOTEBOOK FRONT PAGE" link. That
  catches an export from an out-of-date build of this app (see "Known gaps").
- `tests/site-build.test.tsx` builds a small real site from pages exported by
  this code and checks the published result, and that the preview matches it.

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

## v1

v1 (`page_builder/`) was removed on 2026-09-12 (commit `8d32c4d`); its source
is in the git history, which is where the "Transcribed from
page_builder/src/…" notes in `src/` point. What remains of the split:

- this app's config dir is `~/.config/page_builder_v2/`, and its dev port 5174,
  both chosen so the two could run side by side;
- **project formats are incompatible.** v1 stored `{version:1, meta, blocks}`,
  v2 stores `{version:2, exportSlug, data}` where `data` is Puck's. v2 refuses
  to open a v1 file rather than silently mangling it.

## Tests

```bash
bun install                      # in THIS folder
bun test tests                   # 293 tests
```

`site-build.test.tsx` also needs the repo root's `node_modules/` (committed, so
nothing to install) — it runs the site's own Eleventy.

- `site-build.test.tsx` — **the boundary test.** Builds a small real site with
  the repo's `eleventy.config.js` and layouts, from pages exported by this code
  plus a hand-written and a markdown post, and checks the PUBLISHED output: one
  header, one ending, one `<h1>`, balanced `<div>`s (footer inside
  `.bg-topology-map`), that the preview matches the published page, and that an
  old-format export stops the build. Every other test sees one side only; the
  duplicate ending lived between them.
- `render.test.tsx` — **the class-coverage guard** (greps the real `main.css`)
  and the one-gap-per-block rule, iterated over the whole registry.
- `format.test.ts` — the formatter is lossless, and never reflows an inline run.
- `collect.test.ts` — tree collectors, including that content in a hidden
  `count:1` column slot is excluded from JSON-LD and lint but never lost.
- `export.test.tsx` — frontmatter quoting, JSON-LD, placeholder substitution,
  and that a fragment carries none of the layout's furniture.
- `lint.test.tsx` — heading outline and SEO checks.
- `preview.test.tsx` — that the preview contains the export minus its front
  matter, shows the header and ending once, refuses an out-of-date shell, and
  that rendering one does not mutate the project.
- `regressions.test.tsx` — one describe per fixed defect, named for the symptom
  rather than the fix, so a failure says what broke for the user.

The Rust side has its own: `cargo test` in `src-tauri/` covers atomic writes,
the SHA-2 vectors, and that `/__pb/` is answered in full and never falls through
to a file read.

## Preview

**Preview** in the toolbar renders the current page and shows it running, in a
full-screen iframe pointed at `http://127.0.0.1:<port>/__pb/preview`.

- `buildPreview` (`src/app/project.ts`) calls **`assembleDocument`, not
  `exportText`**. The exported *file* is YAML front matter plus a fragment;
  `assembleDocument` puts the fragment into `shell.html`, which the site build
  renders from the same `base.njk` and `post_chrome.njk` as the published page.
  It fills `{{TITLE}}`, `{{DATE}}`, `{{DATE_ISO}}` and `{{CONTENT}}` in one pass,
  and keeps the `<!--pb:header-->` region only when `layoutAddsHeader` says so.
- A shell without that region predates this app's export format (the site has
  not been built since this app was updated). Preview and Export HTML… refuse
  it with "run the Eleventy build" rather than showing a page with no header and
  no ending. Export is unaffected — it never reads the shell.
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

## Window layout, and why it is a drag-and-drop concern

Three rules, all in `src/style.css`, all about **scroll containers around the
editor iframe**:

1. `body > #app` is `position: fixed; inset: 0; overflow: hidden`, so the app
   document itself can never scroll.
2. `body > #app > .Puck` carries the height down to `.pb-layout`.
3. `.pb-layout__center` is `overflow: hidden`, not `auto`.

Rule 2 exists because `<Puck>`, when given **children**, renders them inside its
own `<div class="Puck _Puck_…">` — and that div sets no height. `DragDropContext`
and the `puck` override emit no DOM, so `.pb-layout` is a direct child of it, and
`height: 100%` against an auto-height parent computes to `auto`. Measured in a
900px window, `.pb-layout` came out **2120px**: each side panel was stretched to
exactly its own content height, so `overflow-y: auto` never had anything to
scroll and everything past the window edge was clipped by rule 1, unreachable by
any means. The preview iframe is a flex sibling of those panels, so it was
stretched to that same 2120px while only the top 900px was visible — and Puck
maps pointer coordinates through the iframe's rect, so more than half the drop
surface sat outside the window. Flex rather than `height: 100%` on `.pb-layout`,
because `#puck-portal-root` is a sibling inside `.Puck` and would otherwise add
its height on top.

`height: 100vh` on `.pb-layout` was not enough. Nothing resets the UA's default
`body { margin: 8px }` — not this file, not `puck.css` (which carries no
html/body rule at all), not the Vite bundle — so a `100vh` child made the
document `100vh + 16px` tall and the whole app, toolbar included, could be
scrolled 16px inside its own window.

That 16px was also a **drag** bug, which is why this is not just cosmetic:

- dnd-kit's `Scroller` finds what to autoscroll with
  `getElementFromPoint(getDocument(source.element), pointer)`. Dragging from the
  drawer, `source.element` is in the APP document, and `elementFromPoint` does
  not pierce iframes — so over the canvas it returns the `<iframe>` element, and
  the scrollable ancestors it walks are the app's, not the page's.
- `isScrollable` tests the computed `overflow` value **only**, so
  `.pb-layout__center { overflow: auto }` counted as a scroll container whether
  or not it had anything to scroll, and `getScrollableAncestors` adds the
  document's `scrollingElement` unconditionally at the top.
- `canScroll` then gated on real scroll position: the centre pane had none, but
  `<html>` had those 16px. So dragging into the autoscroll trigger band — the
  band near the top and bottom edges of the canvas, i.e. exactly where you aim
  to drop at the start or end of a page — ran a `setInterval` scrolling the APP
  document under the drag.
- Puck maps pointer coordinates into the frame through the iframe's live
  `getBoundingClientRect` (`GlobalPosition`), so the frame moved while the
  pointer did not and the mapped in-frame point jumped by up to 16px.
  `findDeepestCandidate` then matched a different drop target, or none — the
  "it does not drop where I aimed, try again" symptom, intermittent because it
  only bites near the edges.

Same class of bug as the two `main.css` rules `SiteFrame`'s `FRAME_CSS`
neutralises (`scroll-behavior: smooth` and `overflow-x: hidden`); those are
INSIDE the frame, these are outside it. **The rule to keep: nothing between
the window and the editor iframe may be a scroll container.** The frame is
100% x 100% of its pane and scrolls internally; anything else that scrolls,
dnd-kit will scroll instead of the page.

The reset is scoped rather than written as `html, body { margin: 0 }` because
Puck's `CopyHostStyles` mirrors every `<style>` and `<link rel=stylesheet>` in
this document into the preview iframe — a bare html/body rule here would land on
the rendered page. `body > #app` matches only this app's mount point; in the
frame, page content sits under `#frame-root` and is never a direct child of
`<body>`.

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

## Standalone HTML export

**Export HTML…** writes the whole page as one `.html` document — head, nav,
content, footer — to wherever the native Save dialog is pointed. It is for
archive copies and for handing a page to someone; it does not publish anything.

- It does NOT go into `input_custom_post/` (Eleventy would wrap a whole document
  in the site layout a second time) and deliberately not into `input_custom_html_pages/` either,
  even though that is where v1 wrote and where the site keeps standalone
  documents. Eleventy publishes that folder, so a page exported both ways would
  go live twice, under two URLs, with two canonicals pointing at one of them.
  `save_html_document` is therefore the only write this app makes outside the
  repo; the frontend supplies a suggested file NAME, never a path.
- The document is `assembleDocument` — the same string Preview renders — with
  the head **retargeted** (`retargetHead`, `export/export.ts`). That step is
  needed because `shell.html` is `base.njk` rendered for the SHELL's own
  permalink: everything base.njk derives from `title` rides `{{TITLE}}` through
  and is already this page's, but `canonical` and `og:url` are frozen at
  `/page_builder_app_v2/shell` and there is no description tag at all, because
  the shell's front matter has none to trigger base.njk's `{% if description %}`
  blocks. Harmless in a preview that never leaves the machine; not harmless in a
  file someone keeps. The tags are matched on their identifying attribute rather
  than on the frozen URL string, so regenerating the shell under a different
  permalink cannot silently turn the fix into a no-op.
- It runs `revalidateThumbs` and `refreshDownloadHashes` like Export and unlike
  Preview — this ends up as a file on disk, and a published SHA that does not
  match the bytes is worse than none. Those passes mutate the project, so a
  drifted hash marks it unsaved and says so, exactly as Open does.
- No slug prompt and no page-check gate. The dialog is the name prompt, and the
  check panel is on screen anyway; blocking an archive copy on a missing meta
  description would be ceremony for a file Eleventy never sees.
- The fragment inside it is byte-identical to the export
  (`tests/standalone.test.tsx` asserts it), so this is not a second render path.

**Caveat:** `og:image` still comes from the shell (`/opengraphimg.jpg`), not from
the page's card image. base.njk builds it with the `imageMeta` filter, which
reads the file to get its intrinsic size, so it cannot be reduced to a
placeholder without an Eleventy build. The published page gets the right one.

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

**The shell is generated; there is nothing to keep fresh.** `shell.html` is
build output, written by `eleventy_njk/_builder_shell.njk` from the same
`base.njk` / `nav.njk` / `footer.njk` / `post_chrome.njk` every post uses, so
every site build refreshes it. It is used for Preview, Export HTML… and the
editor's page header — Export does not touch it. The app reads it on startup
and again on every Preview, so a site build made while the app is open reaches
the editor at the next Preview. Do not edit it; edit the partials.

This replaces the old shell-freshness badge, which diffed `shell.html` against
`input_custom_html_pages/galdhopiggen.html` — itself a builder-produced page
carrying the same stale chrome. It compared a stale copy to a stale copy,
reported "matches", and never fired, which is how every exported page ended up
with a duplicate `.main-nav` that disables the site's view transitions.

One deliberate preview difference: the shell is rendered without `navScroll`, so
preview always shows the nav bar even for a page that will hide-and-reveal it
once published.

## Photo titles and descriptions from the file

Picking a photo pre-fills its caption fields from the title and description
embedded in the file, so they are not typed twice:

| block | title → | description → |
|---|---|---|
| Gallery (per photo) | lightbox title | lightbox description |
| Image | — | caption |
| Featured | title | excerpt |

- **Only on import, only into empty fields.** Picking a photo (or the gallery's
  **✎ Fill empty titles & descriptions** button, for photos linked earlier)
  fills a field only while it is blank. Typed text is never replaced — including
  when a block's photo is swapped for another. Nothing happens on open or
  export, so a saved page is never edited behind your back.
- **Alt text is never pre-filled.** It is the author's to write, and the page
  check keeps asking for it.
- A description identical to the title beside it is skipped — the lightbox
  shows both, and would read the same line twice. The Image caption has no
  title beside it, so it keeps the description regardless.
- Hero and the card image are deliberately not wired: their text fields are the
  page's h1 and SEO description, not a photo caption.

**Read from XMP only** (`src-tauri/src/embedded_text.rs`, `dc:title` /
`dc:description`). Editors write the same caption into XMP, EXIF and IPTC, and
in this repo only the XMP copy is right: EXIF `ImageDescription` holds raw UTF-8
in a field the spec types as ASCII (a spec-following reader shows
"Galdhøpiggen" as `Galdh..piggen`), and IPTC holds Latin-1 with no charset
marker. Every photo with EXIF text also has it in XMP. The reader is header-only
like `dims_of` (a JPEG is read up to its start of scan; PNG iTXt and WebP `XMP `
chunks are found by seeking), resolves namespaces rather than trusting the `dc:`
prefix, prefers the `x-default` language, flattens whitespace, and returns
nothing — never an error — for anything it cannot read.

Two traps it exists to avoid: quick-xml reports `&quot;` / `&#39;` as separate
`GeneralRef` events, not as part of the text (many captions here use them —
dropping the event loses the quotes); and a caption with a newline would be
silently mangled by the single-line sidebar inputs.

**Writes go through `updateBlock`, not the field's `onChange`.** Puck's field
`onChange` writes to whichever block is selected *when it is called*
(`createOnChange` reads `selectedItem` at call time), and a pick calls it after
the native dialog closes — select another block while the dialog is open and the
photo lands there. `updateBlock` captures the block's id before the dialog,
looks the block up by id afterwards (inside a Columns slot too, via
`getSelectorForId`), builds on its current props, and writes photo + caption
text as one undoable `replace`. It is also the only way to set props beside the
one a custom field owns. The hero still uses `onChange`: it is a root field.

Tests: `tests/photo-text.test.ts` (the fill rules, and the action updateBlock
builds), `tests/update-block-puck.test.tsx` (updateBlock against a real Puck
store: a nested block, one undo step, onChange firing — note Puck records
history through a 300ms debounce), and the Rust tests in `embedded_text.rs`.

## Known gaps

- **`page_builder_v2.exe` predates the 2026-09-19 export format and must be
  rebuilt on Windows.** Its exports still carry their own header and ending.
  The Eleventy build refuses them with a message naming the file, so nothing
  broken is published — but nothing it exports builds until it is rebuilt. Its
  Preview also shows the new shell's `{{DATE}}` tokens unfilled. There is no
  cross-compile path (the MSVC linker only exists on Windows), so see
  "Building the Windows .exe" above and rebuild it there. The Linux
  `page_builder_v2` is current.
- **Preview still is not the Eleventy build.** Its page body matches the
  published one (`site-build.test.tsx`), but the `<head>` is the shell's, and
  front matter is omitted, so mistakes in `date:`/`tags:` — which drive the
  Notebook and tag collections — do not surface there. The page check is the
  tool for that. An untitled page previews with "Untitled" as its heading
  where the published page has none (the page check warns about the missing
  title). Styling is only as fresh as the last Tailwind build.
- Splitting is TOP-LEVEL only: a block already inside a column cannot be split
  again, because Columns is not in `EMBEDDABLE` and nesting columns in columns
  has no markup in the site's vocabulary.
- `revalidateThumbs` runs on open and on export, not continuously. Generate a
  `_min` file mid-session and use **↻ Re-check files** in the gallery editor to
  pick it up without reopening.
