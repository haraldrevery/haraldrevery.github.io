# Standalone Eleventy build binaries

`eleventy-linux-x64` and `eleventy-win-x64.exe` (in the site root) build the
site exactly like `npx @11ty/eleventy` / `npm run build`, but need **no
Node.js, no npm, no node_modules** — same idea as the standalone Tailwind
binaries (`tailwindcss-linux-x64` / `tw.exe`).

## Using them

Run from the site root:

    ./eleventy-linux-x64            # Linux
    eleventy-win-x64.exe            # Windows (from cmd/PowerShell in the site root)

Optional flag: `--quiet`. The dev server is NOT included — for live reload
keep using `npm start`.

The binaries bundle Eleventy v3.1.2 **and** `eleventy.config.js` (with
markdown-it, KaTeX, gray-matter). Everything else — templates, layouts in
`eleventy_settings/`, posts, and `markdown_text/markdown_text.11tydata.js` —
is read from disk on every run, so **editing content or posts never requires
recompiling**.

## When to recompile

Only when one of these changes:

- `eleventy.config.js`
- Eleventy (or the markdown/KaTeX packages) is updated in `package.json`

## How to recompile

One-time setup: install [Bun](https://bun.sh) (compile-time tool only):

    curl -fsSL https://bun.sh/install | bash

Then:

    ./compile.sh

This cross-compiles BOTH binaries (Linux + Windows) from Linux, via
`build.mjs`. The binaries are ~95 MB each and are **gitignored** (same reason
as the Tailwind binaries: GitHub's file size limit) — keep them in your zip
backups.
