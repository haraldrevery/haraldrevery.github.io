# Notebook Page Builder

A small desktop app for assembling notebook blog pages out of **content blocks**
(text, photo galleries, images, video, audio) without hand-writing HTML. Pick
media straight from the repo — it fills in the `/photos/...` paths and `_min`
thumbnails for you — then **export a complete `html_extras/` page**.

Pure Python standard library (tkinter). No `pip install`, no dependencies.

## Run
```bash
# Linux/macOS
python3 notebook_builder.py      # or: ./page_builder.sh
# Windows
python notebook_builder.py       # or: double-click page_builder.bat
```
Requires Python 3 with tkinter (already present on this machine: Python 3.12 +
tkinter 8.6). On a bare Linux box you may need `sudo apt install python3-tk`.

## How to use
1. **Page details** (top): title, date, tags, description, and the card image
   (the thumbnail shown on the Notebook index — "Pick…" grabs the `_min`).
   Tick **Draft** to build the page *unlisted* (not shown in the index/sitemap).
2. **Blocks** (left): **+ Add** a block, reorder with ↑ / ↓, **Dup**licate, **Del**ete.
3. **Block editor** (right): fill the selected block's fields.
   - **Photo gallery** → "Add images from repo…" multi-selects photos; each gets
     its full-size + `_min` thumbnail + a caption you can edit per image.
   - **Single image / Video / Audio** → pick the file; paths are auto-built.
4. **Preview in browser** — renders the page with the real CSS/images/lightbox.
5. **Export HTML…** — writes the finished page (default into `html_extras/`).
   Then run `npm start` (Eleventy) to build it into the site. Not draft → it
   also appears as a card on the Notebook index.
6. **Save project…** / **Open project…** — `.revproj` (JSON) files in
   `projects/`, so you can re-edit a page later.

## Files
- `notebook_builder.py` — the app (GUI + save/load/export/preview).
- `blocks.py` — block → HTML renderers (mirror the real site markup).
- `shell.html` — the page boilerplate (head + nav + footer + scripts) with
  `{{PLACEHOLDERS}}`. **Exported pages carry no `<meta>` CSP** — the site-wide
  `_headers` file governs CSP now.
- `projects/` — your saved `.revproj` project files.

## Keeping `shell.html` in sync
`shell.html` was extracted from a real page (`html_extras/galdhopiggen.html`).
If you change the site **nav or footer** later, re-sync it: copy a current
`html_extras/*.html`, drop the YAML frontmatter and the `<meta>` CSP, and replace
the head fields + content region + date + JSON-LD with the `{{PLACEHOLDERS}}`
(`{{TITLE}} {{DESCRIPTION}} {{KEYWORDS}} {{OG_TITLE}} {{OG_DESC}} {{OG_IMAGE}}
{{OG_URL}} {{CANONICAL}} {{CONTENT}} {{DATE_ISO}} {{DATE_HUMAN}} {{JSONLD}}`).
