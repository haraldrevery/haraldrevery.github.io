---
name: verify
description: Build/launch/drive recipe for verifying RVRY_ASCII changes end-to-end in a real browser.
---

# Verifying RVRY_ASCII

Static site, no build step. Must be served over HTTP (file:// taints the canvas).

## Launch

```bash
python3 -m http.server 8931   # from the project root
```

Only Firefox is installed here (no Chromium/Playwright). Drive it headless with a
fresh profile so the user's real profile and localStorage stay untouched:

```bash
PROF=$(mktemp -d); firefox --headless --no-remote --profile "$PROF" <url>
firefox --headless --screenshot out.png <url>   # boot screenshot
```

## Drive

Headless Firefox has no automation driver, so use a same-origin driver page:
serve a `driver.html` (from the scratchpad, via a small custom HTTP server that
also accepts `POST /result/<name>` and writes the body to disk) that loads
`/index.html` in an iframe and drives the real UI with real DOM events, then
POSTs a JSON report back. Patterns that work:

- **File drops** (the real input path): `new DataTransfer()`, `dt.items.add(file)`,
  `new DragEvent('drop', {bubbles:true, dataTransfer:dt})` on `#img-drop` /
  `#obf-drop` / `#ply-drop`. Test images: draw on a canvas, `toBlob`, wrap in `File`.
- **Sliders**: set `.value` then dispatch `input` (bubbles). Selects/checkboxes:
  set then dispatch `change`.
- **Exports**: downloads go through a created `<a>.click()` — override
  `app.HTMLAnchorElement.prototype.click` in the iframe window to capture
  `{href, download}`, then `fetch(href)` the blob URL to inspect content
  (`createImageBitmap` for PNG dimensions).
- **Cropper**: pointer handlers call `stage.setPointerCapture`, which throws for
  synthetic events — stub it (`stage.setPointerCapture = ()=>{}`) before
  dispatching `PointerEvent`s. Drag a `.crop-handle` element (its `dataset.dir`
  selects resize mode).
- **Minimal test GIF**: a hand-built 1×1 2-frame GIF89a decodes fine through
  `RVRY.decodeGif` (see git-less history: GCE `21 F9 04 04 0A 00 00 00` + image
  `2C 00×8 … 00 02 02 44 01 00`, twice, `3B` trailer).
- **Code-art Python check**: capture `#obf-out` text, POST it back, run it with
  `python3` — it must execute unchanged.

## Gotchas

- Image loads are async: after a drop, wait for `#img-thumb` to unhide *and*
  settle before opening the cropper or asserting, or a late `setImage` will
  reset crop state mid-test.
- `rafThrottle` renders on the next animation frame — poll with ~100ms waits,
  don't assert immediately after dispatching.
- All app modules are IIFEs on `window.RVRY`; internal closures (e.g. the
  `render` reference inside `renderColorHTML`) can't be spied via `RVRY.*`.
