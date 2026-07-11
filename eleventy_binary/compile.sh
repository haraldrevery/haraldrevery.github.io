#!/bin/bash
# Compile the standalone Eleventy build binaries (Linux + Windows).
# Bun is only needed HERE, at compile time — install once with:
#   curl -fsSL https://bun.sh/install | bash
# The resulting binaries need neither Bun, Node, npm nor node_modules.
#
# NOTE: don't call `bun build --compile` directly — a bundler plugin in
# build.mjs is required (see the comment there for why).
set -e
cd "$(dirname "$0")"

BUN="${BUN:-$HOME/.bun/bin/bun}"
"$BUN" build.mjs

echo
ls -lh ../eleventy-linux-x64 ../eleventy-win-x64.exe
