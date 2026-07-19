# Harald Revery website — setup & build guide

Accurate as of **2026-07-14**. This file replaces the older
`README_sonnet_generated.md` and `SETUP_sonnet_generated_1/2/3.md`, which
describe a February 2026 version of the project and are wrong in several
important ways (see [What changed](#what-changed-since-the-old-docs) at the end).

The short version of the philosophy: **static site, as little JavaScript as
possible, no npm needed to build.**

---

## Table of contents

- [The 30-second version](#the-30-second-version)
- [What builds what](#what-builds-what)
- [Prerequisites](#prerequisites)
- [Project structure](#project-structure)
- [Running the build](#running-the-build)
- [Writing a notebook post](#writing-a-notebook-post)
- [Publishing a music release](#publishing-a-music-release)
- [Drafts](#drafts)
- [CSS / Tailwind](#css--tailwind)
- [SEO: sitemap, canonicals, JSON-LD](#seo-sitemap-canonicals-json-ld)
- [Security headers / CSP](#security-headers--csp)
- [Deploying](#deploying)
- [The side apps](#the-side-apps)
- [Troubleshooting](#troubleshooting)
- [What changed since the old docs](#what-changed-since-the-old-docs)

---

## The 30-second version

```bash
# Linux — CSS watchers (leave running while you edit)
chmod +x dev.sh tailwindcss-linux-x64
./dev.sh

# Build the site (notebook, releases, sitemap) — no Node, no npm
chmod +x eleventy-linux-x64
./eleventy-linux-x64
```

On Windows: double-click `dev.bat` for CSS, and run `eleventy-win-x64.exe`
from the site root to build.

Everything the site serves is committed to the repo. There is **no CI build
step** — whatever you build locally is what goes live, so always rebuild before
deploying.

---

## What builds what

Two separate build tools, deliberately kept independent:

| Tool | Input | Output |
|---|---|---|
| **Tailwind** (standalone binary) | `input.css`, `input_prose.css`, `theme.css` | `main.css`, `main_max.css`, `prose.css`, `prose_max.css` |
| **Eleventy** (standalone binary or Node) | `.njk` templates, `markdown_text/`, `html_extras/`, `release_input/` | `notebook.html`, `notebook_pages/`, `discography.html`, `release/`, `sitemap.xml` |

Hand-written pages (`index.html`, `music.html`, `about.html`, `contact.html`,
`download.html`, `legal.html`, `404.html`) are **not** touched by Eleventy —
they are listed in `.eleventyignore` and edited directly.

---

## Prerequisites

**Nothing to install for a normal content change.** The repo ships with:

- `eleventy-linux-x64` / `eleventy-win-x64.exe` — standalone Eleventy 3.1.2
  (bundles the config, markdown-it, KaTeX, gray-matter). Gitignored because
  each is ~95 MB and brushes GitHub's 100 MB file limit — they live in the zip
  backups. Recompile with `eleventy_binary/compile.sh`; see
  `eleventy_binary/README.md`.
- `tailwindcss-linux-x64` / `tw.exe` — standalone Tailwind CSS v4. The Linux
  binary currently reports **v4.3.1**; the root `README.md` still says v4.1.18,
  and `tw.exe` may lag behind — check with `./tailwindcss-linux-x64 --help`.
  Also gitignored (107 MB / 124 MB, over GitHub's limit), also in the zips.
- `node_modules/` — **committed on purpose** (~27 MB, pure JS, cross-platform)
  so the site still builds with Node if the npm registry is ever down.

`npm install` is therefore **not** part of the normal workflow. Only run it if
you are changing dependencies in `package.json`, and recompile the binaries
afterwards.

Optional, only for the side apps:
- **Python 3 + matplotlib + numpy** — the background SVG generators
  (`svg/svg_generator/`). These do need pip, unlike everything else here.
- **Rust + Bun** — only to rebuild the page builder (`page_builder/`). Running
  the prebuilt `page_builder_app` at the repo root needs neither.
- **Bun** — only to recompile the Eleventy binaries.

---

## Project structure

```
website_v2_123/
│
├── index.html, music.html, about.html,      # hand-written pages
│   contact.html, download.html,             # (Eleventy ignores these —
│   legal.html, 404.html, h.html             #  edit them directly)
│
├── notebook.html                            # GENERATED (blog.njk, page 1)
├── discography.html                         # GENERATED (discography.njk)
├── sitemap.xml                              # GENERATED (sitemap.njk)
├── notebook_pages/                          # GENERATED posts + tag pages
├── release/                                 # GENERATED release pages
│
├── eleventy_settings/                       # layouts / includes (Eleventy's `includes` dir)
│   ├── base.njk                             #   page shell (head, meta, CSS links)
│   ├── nav.njk, footer.njk                  #   shared nav + footer
│   └── post.njk                             #   notebook post layout (+ outline)
│
├── eleventy_njk/                            # templates that GENERATE pages
│   ├── blog.njk                             #   notebook index, 40/page
│   ├── blog-tag.njk                         #   per-tag pages
│   ├── discography.njk                      #   discography grid
│   ├── release.njk                          #   one page per release
│   └── sitemap.njk                          #   sitemap.xml
│
├── markdown_text/                           # SOURCE: markdown notebook posts
│   └── markdown_text.11tydata.js            #   draft handling + auto permalink/layout
├── html_extras/                             # SOURCE: hand-built HTML notebook posts
├── release_input/                           # SOURCE: one .json/.jsonc per release
├── notebook_templates/                      # Tailwind class mirror (see CSS section)
│
├── input.css  → main.css / main_max.css     # site CSS (Tailwind source → build)
├── input_prose.css → prose.css / prose_max.css  # article/prose CSS
├── theme.css                                # @theme design tokens (fonts, colors, sizes)
│
├── eleventy.config.js                       # collections, filters, JSON-LD, outline
├── .eleventyignore                          # what Eleventy must NOT process
├── dev.sh / dev.bat                         # Tailwind watchers (4 outputs)
├── _headers                                 # Cloudflare CSP + security headers
├── wrangler.jsonc                           # Cloudflare static-asset config
│
├── javascript/, fonts/, photos/, music/,    # assets
│   audio/, video/, svg/, graphics/,
│   artcover/, notebook_thumbnails/
│
├── page_builder/                            # Tauri app: build html_extras pages
├── revery_notebook/                         # standalone markdown editor
├── color_theme_app/                         # standalone color theme tool
├── eleventy_binary/                         # compile scripts for the binaries
└── licence/                                 # licences of bundled libraries
```

---

## Running the build

### CSS (Tailwind)

`dev.sh` / `dev.bat` starts **four** watchers at once:

| Source | Output | Notes |
|---|---|---|
| `input.css` | `main.css` | minified — what the site loads |
| `input.css` | `main_max.css` | unminified — for reading/debugging |
| `input_prose.css` | `prose.css` | minified — what articles load |
| `input_prose.css` | `prose_max.css` | unminified — for reading/debugging |

Leave it running while you edit; it rebuilds on save.

### Site (Eleventy)

```bash
./eleventy-linux-x64            # Linux
eleventy-win-x64.exe            # Windows, from the site root
./eleventy-linux-x64 --quiet    # less output
```

The binaries have **no dev server**. For live reload you need Node:

```bash
npm start        # eleventy --serve, http://localhost:8080
npm run build    # eleventy, one-off build
```

Editing content, posts, templates or layouts **never** requires recompiling the
binaries — only a change to `eleventy.config.js` or the npm dependencies does.

---

## Writing a notebook post

### Markdown (the normal way)

Create `markdown_text/my-post.md`:

```markdown
---
title: My Post Title
date: 2026-07-14
tags: [math, physics]
image: /notebook_thumbnails/my-post_min.jpg
description: Short summary shown on the notebook card.
---

Content here. **Markdown**, inline HTML, KaTeX math — all supported.

## A subheading

Inline math \(e^{i\pi} + 1 = 0\) and display math:

\[ \int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2} \]
```

**`permalink` and `layout` are NOT needed** — `markdown_text.11tydata.js`
computes them automatically (`notebook_pages/<fileslug>.html`, `post.njk`).
Do not add them by hand.

| Field | Required | Notes |
|---|---|---|
| `title` | yes | shown on the card and as `<title>` |
| `date` | yes | `YYYY-MM-DD`; sorts the index, feeds `<lastmod>` |
| `tags` | no | generates `notebook_pages/tag-<slug>.html` automatically |
| `image` | no | card thumbnail on the notebook index |
| `description` | no | card text + `<meta name="description">` |
| `draft` | no | `true` = excluded from the build entirely |

Markdown extras enabled in `eleventy.config.js`: `markdown-it-attrs`
(`{.class}` / `{#id}`), automatic `target="_blank" rel="noopener noreferrer"`
on external links, and KaTeX via `markdown-it-texmath` rendering to **MathML**
(no client-side JS).

**Article outline** — `post.njk` runs the `addAnchors` and `toc` filters at
build time: `<h2>`/`<h3>` get unique `id`s and a nested outline panel appears,
toggled by a pure-CSS checkbox in the corner. No JavaScript. It hides itself
automatically on posts with fewer than 2 headings.

### HTML posts (`html_extras/`)

For interactive pages (graphs, clocks, galleries) that need real markup. Write
a full HTML body with YAML frontmatter on top; on build, Eleventy's
`eleventy.before` hook strips the frontmatter and copies the file to
`notebook_pages/`, while the frontmatter feeds the notebook card.

Easiest route: use the **page builder** (`page_builder/`) — a desktop app with
a live click-to-edit preview that renders in the real site CSS. It assembles a
page from blocks (text, galleries, image, video, audio), picks media from the
repo, and exports straight into `html_extras/`.

---

## Publishing a music release

Drop one file per release in `release_input/`. Copy `_template.jsonc` (every
field is documented inline), drop the leading underscore, rename it.

Each release generates:
- `release/<slug>.html` — the full release page (`release.njk`)
- one tile on `discography.html` (`discography.njk`), newest first

Required fields: `type` (`Single`/`EP`/`Album`), `name`, `date`, `artcover`,
`artcoverMin`. Everything else (`streaming`, `tracklist`, `audio`, `video`,
`genres`, `about`, …) renders only when present. Full reference:
`release_input/README.txt`.

`.jsonc` files may contain `//` comments and trailing commas — the config's
own string-aware parser strips them, so `https://…` URLs are never harmed.

> **Note:** `release_input/README.txt` says the grid lands at
> `release/index.html`. That is stale — it is actually **`discography.html`**.

---

## Drafts

| Content type | How to mark a draft | Result |
|---|---|---|
| `markdown_text/*.md` | `draft: true` in frontmatter | no page rendered; excluded from index, tag pages, sitemap |
| `html_extras/*.html` | `draft: true` in frontmatter | not copied to `notebook_pages/`; excluded from collections |
| `release_input/*` | prefix filename with `_` | skipped by the releases collection |

Draft source files **stay tracked in git** so you can keep working on them —
set `draft: false` (or remove the line) to publish.

One gotcha: `npm start` (the dev server) writes generated pages to disk. Never
deploy a tree left over from a serve session without a clean rebuild first.

---

## CSS / Tailwind

- `theme.css` holds the `@theme` design tokens — fonts, text sizes, letter
  spacing, colors, the animated page backdrop gradient. **Global look changes
  go here.**
- `input.css` — site-wide styles, imports Tailwind + `theme.css`.
- `input_prose.css` — article styling, adds the `@tailwindcss/typography`
  plugin.
- Never edit `main.css` / `prose.css` (or their `_max` twins) — they are
  generated and overwritten on every build.
- `css_bkup/` is stale backups and is gitignored. Ignore it.

### The `notebook_templates/` trick (important)

The Tailwind content globs in `dev.sh`/`dev.bat` are:

```
./*.html, ./html_extras/**/*.{html,md}, ./notebook_templates/**/*.{html,md}
```

They **do not include `eleventy_njk/*.njk`**. So a class that exists only
inside a `.njk` template would get purged from the build. `notebook_templates/`
exists to solve this: it holds plain-HTML mirrors of the generated markup
(e.g. `njk_template.html` mirrors `blog.njk`) purely so Tailwind's scanner
sees those classes.

**If you add new Tailwind classes to a `.njk` template, mirror them into
`notebook_templates/` or they will vanish from the CSS.**

---

## SEO: sitemap, canonicals, JSON-LD

`sitemap.xml` is **generated on every build** by `eleventy_njk/sitemap.njk` —
no manual editing. It covers:

- hand-written static pages, listed in that file's frontmatter, with a real
  `<lastmod>` read from each file's modification time (`fileModDate` filter)
- every notebook post, every tag page
- the discography and every release page

URLs are emitted **without** the `.html` suffix via the `cleanUrl` filter,
matching the clean URLs Cloudflare serves (it 308-redirects `/foo.html` →
`/foo`). Keep each page's `<link rel="canonical">` consistent with this.

**When you add a new hand-written page, add it to `sitemap.njk`'s
`staticPages` list** — Eleventy ignores those pages, so it cannot discover
them on its own.

JSON-LD is generated by filters in `eleventy.config.js`:
- `musicAlbumLd` — a `MusicAlbum` per release page, built from the release JSON
  (tracks, ISRCs, ISO-8601 durations, streaming links as `sameAs`)
- `discographyLd` — breadcrumb + `CollectionPage`/`ItemList` for the grid
- both link to the single canonical artist entity (`/#artist`, declared in full
  in `index.html`) by `@id` rather than redeclaring it

---

## Security headers / CSP

Handled site-wide by `_headers` (Cloudflare), **not** by `<meta>` tags in pages.

The CSP is the union of what the site actually uses:

| Directive | Why |
|---|---|
| `script-src 'self' 'unsafe-inline' 'unsafe-eval'` | inline handlers on interactive notebook pages; Alpine.js and math.js evaluate expressions |
| `style-src 'self' 'unsafe-inline'` | the many inline `style=""` attributes |
| `img-src/media-src 'self' data: blob:` | clock canvas, jsPDF export |
| `default-src/connect-src/font-src 'self'` | every asset is self-hosted |
| `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'self'` | hardening |

Plus `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`,
`Permissions-Policy`.

If you ever embed a YouTube/Spotify player or add analytics, you must add those
origins (`frame-src` / `script-src` / `connect-src`) or they will be blocked.

---

## Deploying

The site is served by **Cloudflare** (`wrangler.jsonc` serves `./`, custom
domain `haraldrevery.com`). `CNAME` and `.nojekyll` are GitHub Pages leftovers;
Cloudflare is authoritative.

There is **no CI build**, so generated output must be committed:
`main.css`, `main_max.css`, `prose.css`, `prose_max.css`, `notebook.html`,
`notebook_pages/`, `discography.html`, `release/`, `sitemap.xml`.

Before deploying, always:

1. Run the Tailwind build (`dev.sh` / `dev.bat`) so CSS is current.
2. Run the Eleventy build (`./eleventy-linux-x64` or the `.exe`).
3. Commit the generated output along with your sources.

Terminal git/GitHub workflow: `update_to_git_guide.md` in the site root.

The Tailwind and Eleventy binaries are gitignored (GitHub's 100 MB file limit)
— they exist only locally and in the zip backups.

---

## The side apps

| Folder | What it is |
|---|---|
| `page_builder/` | Tauri v2 + TypeScript desktop app that assembles notebook pages from content blocks and exports to `html_extras/`. Prebuilt as `page_builder_app` at the repo root. See its README. |
| `revery_notebook/` | Standalone markdown editor (CodeMirror, markdown-it, KaTeX, highlight.js, DOMPurify) for drafting posts. |
| `color_theme_app/` | Standalone React tool for picking and generating theme colors. |
| `eleventy_binary/` | `compile.sh` + `build.mjs` — cross-compiles both Eleventy binaries with Bun. |

These are self-contained and excluded from the Eleventy build.

---

## Troubleshooting

**Pages don't update / look stale**
Delete everything inside `notebook_pages/` and rebuild.

**A class works in dev but disappears after a rebuild**
You added it to a `.njk` file. Mirror it into `notebook_templates/` — see the
[CSS section](#the-notebook_templates-trick-important).

**`Permission denied` running `./eleventy-linux-x64` or `./dev.sh`**
Zip backups don't preserve the executable bit:
```bash
chmod +x eleventy-linux-x64 tailwindcss-linux-x64 dev.sh
```

**A post doesn't show on the notebook index**
Check `draft: true` isn't set; check the frontmatter is valid YAML between
`---` fences; check `date` is `YYYY-MM-DD`; check the file is in
`markdown_text/` or `html_extras/`.

**A release doesn't show**
Filename starts with `_` (that's the draft mechanism), or the JSON is invalid —
the build will report the parse error.

**Binary output differs from `npx @11ty/eleventy`**
If it's only the `<lastmod>` dates in `sitemap.xml`, that's expected. Otherwise
the config bundled into the binary is stale — recompile with
`eleventy_binary/compile.sh`.

**Images broken**
Use absolute paths (`/photos/x.jpg`, not `photos/x.jpg`) and match case exactly.

**Windows SmartScreen blocks the `.exe`**
It's unsigned. *More info → Run anyway*, or right-click → Properties →
*Unblock*. Run it from the **site root**, not from inside `eleventy_binary/`.

---

## What changed since the old docs

For reference, the ways the `*_sonnet_generated*.md` files are now wrong:

1. **`npm install` is no longer part of the workflow.** Standalone Eleventy
   binaries + a committed `node_modules/` mean Node is optional.
2. **`npx @11ty/eleventy` is not the normal build command** — the binaries are.
3. **The host is Cloudflare, not "your web hosting"/GitHub Pages.**
4. **CSP/security headers live in `_headers`**, a file that did not exist then.
5. **`permalink` and `layout` are NOT required frontmatter** on markdown posts
   (the old table marked both "required"); they're computed automatically.
6. **Tag pages are `notebook_pages/tag-<slug>.html`**, not
   `notebook_pages/notebook_tag-music.html`.
7. **Templates are split across two folders** — `eleventy_settings/` (layouts)
   and `eleventy_njk/` (page generators). The old docs only knew the first, and
   listed `blog.njk`/`blog-tag.njk` in the wrong one.
8. **The whole releases/discography pipeline is new** (`release_input/`,
   `release.njk`, `discography.njk`, JSON-LD filters).
9. **`sitemap.xml` is generated now**, and there's a draft system, a build-time
   article outline, and KaTeX math — none of which existed in February.
10. **Four CSS outputs**, not two (`main_max.css` / `prose_max.css` for
    debugging).
