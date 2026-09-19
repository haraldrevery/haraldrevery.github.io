# Notebook input folders, and how `input_custom_post/` fits

Written 2026-09-09, when `input_custom_post/` was added.

Answers: *the pages in `input_custom_html_pages/` freeze a copy of the nav and
footer and go stale. Can I have a folder that doesn't, without touching those
pages?*

**Yes. Both coexist, and nothing in `input_custom_html_pages/` changed.**

---

## 1. The four notebook input folders

All four publish to `notebook_pages/<slug>.html`. They differ in what the source
file contains and how much of the page it owns.

| Folder | Source file | Chrome comes from | Use it for |
|---|---|---|---|
| `input_markdown/` | `.md` | `post.njk` → `base.njk` | prose-first articles |
| `input_custom_post/` | `.html` fragment | `post_body.njk` → `base.njk` | **block posts — hand-written or page-builder** |
| `input_custom_html_pages/` | `.html` **whole document** | itself | browser apps, one-offs |

Only the last one freezes its own nav and footer, and it does so on purpose:
whole-document pages need their own `<head>` and their own scripts. The
browser apps that used to live there have since moved out of the build and are
hand-maintained in their own folders: `rvry_ascii/`, `revery_notebook/`,
`color_theme_app/`, `clock/` (clock, timer and event card), and `h/`
(`1dgraph.html`, `2dphaseportrait.html`, the wallpapers).
`input_custom_html_pages/color_theme.html` is a leftover `draft: true` copy.

The four coexist because they are four independent producers of the same output
directory, guarded by a slug-collision check (§4).

---

## 2. What `input_custom_post/` is

One `.html` file per post: YAML front matter, then a raw HTML body fragment.

```
input_custom_post/
  README.txt        the format, the front matter, the two gotchas
  _template.html    a catalogue of fenced, copy-paste-ready blocks (draft)
  my-post.html      your post
```

Eleventy wraps each file in `eleventy_settings/post_body.njk`, which adds the
date/`<h1>`/back-link header and the closing date rule + "← NOTEBOOK FRONT
PAGE" link (both from `post_chrome.njk`, shared with markdown posts — see §7),
and under that `base.njk`, which supplies
`<!DOCTYPE>`, the whole `<head>` (title, description, OG, Twitter, canonical,
JSON-LD — all from the front matter), `nav.njk` and `footer.njk`.

Verified on the first build: the emitted nav and footer are **byte-identical**
to those of a markdown post, and the page appears in the Notebook index, the tag
pages, `search-index.json`, `sitemap.xml` and `feed.xml` with no special-casing
anywhere.

Write blocks by copying them out of `_template.html`. Read
`input_custom_post/README.txt` before writing a post; it is the reference.

### Why the files can be `.html` here

Worth writing down, because the folder this one replaced could not.

`"html"` is not in Eleventy's `templateFormats`, and it cannot be added:
`dir.input` and `dir.output` are both the repo root, so every HTML file in the
project would become a template and Eleventy would read its own output back in.
The old `input_build_page/` worked around that by naming its files `.njk`.

This folder takes the other route. `eleventy.config.js` reads the `.html` files
itself and registers each with `eleventyConfig.addTemplate()` under a **virtual**
`.njk` input path that no real file occupies. Eleventy treats the result as a
real template — layouts, collections, tag pages, sitemap, feed, search index all
work normally — while the file on disk keeps the extension that makes it
pleasant to edit and easy for a tool to write.

`templateEngineOverride: false` is passed with it and is load-bearing: the body
is arbitrary hand-written HTML and may contain `{{`, `{%` or KaTeX
`\frac{{a}}{{b}}`. With the override, Eleventy resolves the page to the "html"
engine with no preprocessor, whose `compile()` returns the string untouched,
while layouts still apply. The last block of `_template.html` is the regression
fixture; it was published once during development and those three sequences came
through literally.

---

## 3. What changed, and where

| File | Change | Recompile needed? |
|---|---|---|
| `eleventy.config.js` | `CUSTOM_POST_DIR`, the `addTemplate` loop, `isTemplatePost`, the collision guard | **yes — done** |
| `eleventy_settings/post_body.njk` | new layout | no (read from disk) |
| `input_custom_post/` | new folder: `README.txt`, `_template.html` | no |
| `input.css` | `@source` line, or classes used only here get purged | no |
| `healthcheck.sh` | `live_slugs` loop + a new "published no page" check | no |
| `.eleventyignore` | ignore `website_hrldthrslnd/` (see §6) | no |

Both standalone binaries were recompiled with `eleventy_binary/compile.sh` and
verified to publish a page from the new folder. **If you pull these changes onto
the Windows machine, recompile there too** — the binaries bundle
`eleventy.config.js`, and a stale one publishes none of these pages, silently.

`healthcheck.sh` now catches exactly that: a live source with no corresponding
page is reported as `live source that published no page (stale binary?)`. It was
tested by planting a file and confirming the error, then removing it.

A full rebuild produced **no diff** in any existing `notebook_pages/*.html`, so
nothing regressed.

---

## 4. The risks, and what each is guarded by

**Slug collisions.** Four folders write `notebook_pages/<slug>.html`. Eleventy's
own duplicate-output guard only compares real input templates, so it cannot see
the verbatim `fs.writeFileSync` that `input_custom_html_pages/` does from the
`eleventy.before` hook. The hand-rolled check in `eleventy.config.js` now covers
all four pairings and fails the build naming both files. A duplicate slug
*inside* `input_custom_post/` is impossible (one file, one slug) but a
`.html`/`.HTML` pair would collide, so that is checked too.

**Substring matching.** `isTemplatePost()` matches folders as substrings of a
file path. `"input_custom_post"` is deliberately **not** a substring of
`"input_custom_html_pages"`. Check that again before renaming either.

**The recompile tax.** Any `eleventy.config.js` edit means rebuilding two ~95 MB
binaries on a machine with Bun, and shipping both. This is why the layout, the
template and the docs all live outside that file — they can be changed freely.
The registration loop is the only part that costs a recompile, and it should not
need to change again.

**`npm start` does not see a NEW file.** The registration runs once, when the
config loads. A post added while the watcher is running is not registered and
simply does not appear. Editing an existing post rebuilds fine. Restart the
watcher after adding a file. The binaries have no watch mode, so this is an
`npm start` problem only.

**Tailwind purging.** A class used only on a page in this folder is dropped from
`main.css` unless `input.css` lists the folder. It does now. Rebuild the CSS
(`./dev.sh`) after using a class no other page uses.

**Committed build output.** `notebook_pages/` is in git, so a pipeline change
shows up as a large HTML diff. This change produced none; future ones should be
reviewed rather than trusted.

---

## 4b. What the stress test found

`input_custom_post/stress_test.html` and `stress_test_hero.html` carry every
block the page builder can emit, with the markup transcribed from
`page_builder_app_v2/src/puck/components/`. Both were rendered in headless
Firefox, light and dark, and checked class-by-class against the compiled CSS
using the same method as the builder's own `render.test.tsx` "class coverage"
test. Four things came out of it.

### Fixed: `input_prose.css` was missing two `@source` folders

This is the significant one, and it was a **live bug before this work**, not one
the new folder introduced.

Every page links two stylesheets, in this order:

```html
<link rel="stylesheet" href="/main.css">
<link rel="stylesheet" href="/prose.css">
```

Both are **complete Tailwind builds**, each with its own `@source` list. So
`prose.css`, arriving second, can override `main.css` — and it does whenever it
emits a plain utility whose responsive variant only `main.css` has.

`input_prose.css` listed neither the old `input_build_page/` nor `input_custom_post/`.
The concrete symptom: the page builder's Downloads block emits
`hidden md:table-cell` on its SHA-256 column. `main.css` had `.md\:table-cell`;
`prose.css` had `.hidden` but not `.md\:table-cell`, so the later `.hidden` won
and **the SHA-256 column never rendered, at any width**. Confirmed by having the
page report its own computed style: `SHA-256 Hash -> display:none` with
`matchMedia("(min-width:768px)")` returning `true`.

Both folders are now in `input_prose.css`, with a comment saying why. All four
stylesheets were rebuilt; growth was +167 bytes on `main.css` and +138 on
`prose.css`, purely additive.

**If you add another input folder, add it to BOTH `@source` lists.** One is not
enough, and the failure is silent.

### Not fixed — your call: a stray `</div>` in `post.njk`

[eleventy_settings/post.njk](../eleventy_settings/post.njk) line 69 has an
unmatched `</div>`. Every markdown post therefore emits malformed HTML: it
closes `base.njk`'s `<div class="bg-topology-map">` early, so the footer ends up
**outside** the textured background wrapper.

Measured across the site — footer nesting relative to `bg-topology-map`:

| page | |
|---|---|
| `notebook.html`, `about.html`, `galdhopiggen.html` | INSIDE (correct) |
| `stress_test.html`, `stress_test_hero.html` | INSIDE (correct) |
| `gamesettings.html`, `studieteknik.html` (markdown) | **OUTSIDE** |

So markdown posts are the odd ones out, and the new folder's pages match
everything else. The fix is deleting that one line, but it is a **visible
change** to the three existing markdown posts — their footer would gain the
topology texture every other page's footer has. Left alone deliberately, since
you asked not to risk the old pages. Delete it when you want them consistent.

### The builder and `download.html` disagree on breakpoints

`Lists.tsx` uses `md:table-cell` / `lg:table-cell`; the real `download.html`
uses `lg:table-cell` / `xl:table-cell`. Only the latter pair was ever compiled,
which is what made the bug above invisible for so long. It works now because the
stress test forces `md:table-cell` into both stylesheets, but the two ought to
agree. Changing `Lists.tsx` means rebuilding the Tauri app, so it is left as a
note rather than an edit.

### Three authoring gotchas, all now in `input_custom_post/README.txt`

- **No markdown pipeline.** No KaTeX, no linkify, no automatic image grid. Write
  MathML directly for maths — the site emits MathML from markdown anyway, so it
  renders identically.
- **A linked SVG cannot follow the colour scheme.** `<img src="/svg/logo.svg">`
  is invisible in dark mode for a black-on-transparent logo. Only an inlined
  `currentColor` svg flips. Both are in the stress test, one after the other.
- **`outline: true` reads every heading**, including FAQ questions and Featured
  card titles. Off by default for that reason.

### What rendered correctly

Everything else, in both colour schemes: the full prose set, all three gallery
layouts (justified packing verified with mixed portrait/landscape/panorama), the
markdown-style `.rvry-grid`, two-column, Featured (both orientations), video,
both audio variants, inlined and linked SVG, icons, FAQ (both blocks, ids
correctly namespaced), Downloads, all three link-button alignments, the spacing
scale, raw HTML, MathML, full-bleed, and all four hero backgrounds. The brace
fixture (`{{ }}`, `{% %}`, `{# #}`, `\frac{{a}}{{b}}`) survived literally, and
both pages are tag-balanced with exactly one `<h1>`.

One judgement call, not a bug: a cover hero over a bright photograph loses its
tagline to the fading scrim. Visible in `stress_test_hero.html`.

---

## 5. Deliberately not done

**Post folders with co-located assets** — the `input_custom_post/post_i/` shape
in `website_hrldthrslnd/`, where a folder holds the page plus its own images and
the build copies them to `/<slug>/`. It is genuinely nicer, and in that project
it is not a data file: it is a slug registry (`lib/slugs.js`), an asset-copy
build phase (`build.mjs`), an image pipeline that knows the pre-copy paths
(`lib/imagesize.js`) and a status check that enumerates folders
(`lib/status_check.js`). That is a build architecture, not a feature.

If it matters more than everything else, the honest move is to finish migrating
to that architecture, not to graft one phase of it onto this build. In the
meantime `input_custom_post/` reads flat `.html` files only; a subfolder is
ignored.

**Migrating the four content pages** currently in `input_custom_html_pages/` —
`galdhopiggen.html`, `2015to2023.html`, `2024photography.html`,
`revery_notebook_info.html`. These are articles, not apps: each is 40–66 kB
largely because it carries a frozen nav and footer, and each is a page that goes
stale when the nav changes. They are the natural first residents of the new
folder. Not moved, because you asked for those files not to be touched — move
them one at a time when you want to, diffing the old output against the new
before deleting the original.

---

## 6. Two loose ends found on the way

**`input_build_page/` is gone.** It held page-builder exports as `.njk`
fragments and did the same job this folder does, so the two were redundant. It
has been removed from `eleventy.config.js`, both Tailwind `@source` lists,
`healthcheck.sh` and the docs; the page builder (`commands.rs`, `project.ts`,
`export.ts`) now writes `.html` into `input_custom_post/`. (At the time it also
emitted its own date/`<h1>`/back-link block and ending — see §7 for why that
changed.)

`.eleventyignore` used to carry a tombstone entry for `input_build_page/`,
because an old build of the page builder still wrote `.njk` there, and a `.njk`
under the input root IS a template: `{% ... %}` fails the build and `{{ ... }}`
renders as empty. Both builder binaries have since been rebuilt against
`input_custom_post/` (checked in the binaries themselves), so the entry was
removed on 2026-09-19.

**`website_hrldthrslnd/` broke the build.** It is a whole other Eleventy project;
its `eleventy_njk/*.njk` use filters only its own config defines, so Eleventy
picked them up as input and died with `filter not found: absolute`. It is now in
`.eleventyignore`; delete that entry when the folder goes.

**Pre-existing, untouched:** `./healthcheck.sh` reports 16 broken references in
`discography.html` — extensionless `/release/<slug>` links where only
`/release/<slug>.html` exists. Unrelated to any of this, but it is the reason
the healthcheck currently exits 1.

---

## 7. 2026-09-19: the page furniture has one owner

**The bug.** Every page exported from the page builder published with the
closing date rule and "← NOTEBOOK FRONT PAGE" link TWICE. The builder wrote its
own header and ending into the fragment; `post_body.njk` added its ending
unconditionally, and `header: false` only switched off the layout's header.
Nothing caught it: the builder's tests checked the fragment alone, and its
preview shell was rendered with `base.njk` directly, skipping `post_body.njk`,
so the preview showed one ending while the site showed two.

**Also found.** The same header/ending markup existed in three places
(`post.njk`, `post_body.njk`, the builder's `Hero.tsx`/`export.ts`) and had
already drifted: `post.njk` carried a stray `</div>` that closed
`.bg-topology-map` early on every markdown post, so the NOTEBOOK link and the
footer sat outside the page's background wrapper.

**The fix.**

| File | Change |
|---|---|
| `eleventy_settings/post_chrome.njk` | NEW. `postHeader`, `postHeaderBlock`, `postEnding` macros — the only copy of that markup |
| `post.njk`, `post_body.njk` | use the macros; the stray `</div>` is gone |
| `eleventy_njk/_builder_shell.njk` | renders the same macros around `{{CONTENT}}`, header in a `<!--pb:header-->` region |
| `eleventy.config.js` | stops the build if an `input_custom_post/` body carries its own "← NOTEBOOK FRONT PAGE" link (an export from an out-of-date builder) — **binaries recompiled** |
| page builder | exports hero + content + JSON-LD only; `header: false` only for hero pages; preview and editor take the header and ending from `shell.html`; Export no longer reads `shell.html` at all |
| `page_builder_app_v2/tests/site-build.test.tsx` | NEW. Builds a real site from exported pages and checks the published output, including preview = published |

Markdown posts changed only by the removed `</div>` (verified by diffing every
generated page against a build from before the change). One unification: the
NOTEBOOK link no longer has `pb-12` under it on block posts — markdown posts
never had it, and the macro follows the markdown pages, which are the live ones.

**Still to do by hand:** rebuild `page_builder_v2.exe` on Windows. Until then
its exports are refused by the build with a message naming the file.
