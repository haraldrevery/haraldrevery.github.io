# Standalone Eleventy build binaries

`eleventy-linux-x64` and `eleventy-win-x64.exe` (plus the `-arm64` builds of
each, in the site root) build the site exactly like `npx @11ty/eleventy` /
`npm run build`, but need **no Node.js, no npm, no node_modules** — same idea
as the standalone Tailwind binaries (`tailwindcss-linux-x64` / `tw.exe`).

## Using them

Run from the site root:

    ./eleventy-linux-x64            # Linux
    eleventy-win-x64.exe            # Windows (from cmd/PowerShell in the site root)

On Windows you can also double-click the `.exe`: the window then stays open
until you press Enter, so the result can be read. Run from a terminal, it exits
normally.

Optional flag: `--quiet`. The dev server is NOT included — for live reload
keep using `npm start`.

On top of what Eleventy does, the binaries (see `runner.mjs`):

- refuse to run outside the site root (no `eleventy.config.js` in the folder);
- **fail** (exit code 1) when the build wrote 0 files, which Eleventy on its
  own reports as a success;
- warn when `eleventy.config.js` on disk no longer matches the copy bundled
  into the binary (line endings are ignored).

The binaries bundle Eleventy v3.1.2 **and** `eleventy.config.js` (with
markdown-it, KaTeX, gray-matter). Everything else — templates, layouts in
`eleventy_settings/`, posts, and `input_markdown/input_markdown.11tydata.js` —
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

This cross-compiles all four binaries (Linux + Windows, x64 + arm64) from
Linux, via `build.mjs`. The binaries are ~95 MB each and are **gitignored**
(GitHub's file size limit). What git carries is one `.zip` per binary.

## After recompiling

1. Re-zip each binary, or a Windows checkout keeps getting the old one:

       cd ..   # site root
       for f in eleventy-linux-x64 eleventy-linux-arm64 eleventy-win-x64.exe eleventy-win-arm64.exe; do
         rm -f "${f%.exe}.zip" && zip -q "${f%.exe}.zip" "$f"
       done

2. Check that the Windows binary really builds. It is compiled by a different
   Bun runtime from the Linux one, and that runtime has broken the build
   before (`bun-windows-fs-fix.mjs`). With Wine installed, from the site root:

       wine ./eleventy-win-x64.exe      # must say "Wrote N files", same N as ./eleventy-linux-x64

   No Wine: run it on the Windows machine before relying on it.

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

**"ERROR: the build wrote 0 files" / "Wrote 0 files"** — Eleventy found no
templates at all, so `notebook.html`, the posts and every other page were left
as they were. Your content is not the cause. This is how the Windows binary
failed before `bun-windows-fs-fix.mjs` existed: Bun's Windows runtime answered
`fs.existsSync("./") === false`, so Eleventy searched only the repo root for
templates. To see what it searched for:

    DEBUG=Eleventy:EleventyFiles ./eleventy-linux-x64     # look for "Searching for"

A healthy build searches `./**/*.{njk,md}`. `.//*.{njk,md}` (no `**`) means
that bug, or one like it, is back, most likely after a Bun upgrade. Meanwhile,
`node node_modules/@11ty/eleventy/cmd.cjs` builds the same site with Node.

**"WARNING: eleventy.config.js has changed since this binary was compiled"** —
the build used the config bundled inside the binary, not your edited file.
Recompile with `./compile.sh`, then follow "After recompiling".

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
