#!/bin/bash
# Compile the standalone Eleventy build binaries (Linux + Windows, x64 + arm64).
# Bun is only needed HERE, at compile time — install once with:
#   curl -fsSL https://bun.sh/install | bash
# The resulting binaries need neither Bun, Node, npm nor node_modules.
#
# NOTE: don't call `bun build --compile` directly — a bundler plugin and a
# config fingerprint in build.mjs are required (see the comments there).
#
# Afterwards, re-zip each binary (the .zip files are what git carries) — see
# "After recompiling" in README.md.
set -e
cd "$(dirname "$0")"

BUN="${BUN:-$HOME/.bun/bin/bun}"
"$BUN" build.mjs

echo
ls -lh ../eleventy-linux-x64 ../eleventy-linux-arm64 ../eleventy-win-x64.exe ../eleventy-win-arm64.exe
