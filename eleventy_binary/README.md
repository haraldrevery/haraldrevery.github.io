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

## Troubleshooting

**`./compile.sh: Permission denied`** — the file lost its executable bit
(common after unzipping a backup, or on a fresh clone). Either add it back:

    chmod +x compile.sh

…or just run it through bash, which ignores the bit:

    bash compile.sh

The same applies to `./eleventy-linux-x64` — if it says *Permission denied*,
run `chmod +x eleventy-linux-x64` once (zip backups don't preserve the bit).

**`compile.sh: bun: command not found`** (or `$HOME/.bun/bin/bun ... No such
file`) — Bun isn't installed, or isn't where the script looks. Install it:

    curl -fsSL https://bun.sh/install | bash

If you installed Bun somewhere else, point the script at it:

    BUN=/path/to/bun ./compile.sh

**`Cannot find module '/package.json'`** when running a freshly compiled
binary — the package.json shim in `build.mjs` didn't apply. This happens if an
Eleventy update renamed `getEleventyPackageJson` in
`node_modules/@11ty/eleventy/src/Util/ImportJsonSync.js`; `build.mjs` throws a
clear error at compile time if it can't find that function. Update the `marker`
string in `build.mjs` to match the new function name and recompile.

**Binary runs but output differs from `npx @11ty/eleventy`** — first check it
isn't just the `<lastmod>` build date in `sitemap.xml` (expected: it's
regenerated each build). If real pages differ, the bundled `eleventy.config.js`
is stale — recompile with `./compile.sh` so the binary picks up your config
changes.

**`bun: not found` only when cross-compiling / downloads stall** — the first
`bun build --compile` for a target downloads that platform's Bun runtime
(~40 MB). It needs network access once; after that it's cached in `~/.bun`.

**Windows: "Windows protected your PC" / SmartScreen** — the `.exe` is
unsigned. Click *More info → Run anyway*, or unblock it:
right-click → Properties → check *Unblock*. Run it from the **site root**, not
from inside `eleventy_binary/`.
