#!/bin/bash
# ---------------------------------------------------------------------------
# build.sh - build the whole site once, in the only order that is correct:
#
#   1. CSS    main.css + main_max.css from input.css (Tailwind, one-shot)
#   2. pages  Eleventy: every generated page, the sitemap, feed, search index
#   3. check  the healthcheck (report only - it never changes a file)
#
#   ./build.sh            full healthcheck report
#   ./build.sh --quiet    only the healthcheck sections that found something
#
# Why the order matters: every page links /main.css?v=<hash of main.css>
# (_data/assets.js). Pages built before the CSS carry the old hash, and
# visitors keep the old cached stylesheet for months.
#
# Exit code: non-zero when a step fails or the healthcheck finds an ERROR
# (warnings do not count). githooks/pre-commit runs this before every commit.
#
# For live preview while writing use `npm start` (pages) and ./dev.sh (CSS)
# instead; this script is the "make everything current" button.
# On Windows double-click build.bat, which does the same thing. This script
# also runs in Git Bash (that is how the pre-commit hook runs on Windows).
# ---------------------------------------------------------------------------
cd "$(dirname "$0")" || exit 2

case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) WIN=1 ;;
    *)                    WIN=0 ;;
esac
case "$(uname -m)" in
    aarch64|arm64) ARCH=arm64 ;;
    *)             ARCH=x64 ;;
esac

fail() { printf '\nBUILD FAILED: %s\n' "$*" >&2; exit 1; }

# --- 1. CSS ----------------------------------------------------------------
if [ "$WIN" = 1 ]; then TW=./tw.exe; ZIP=tw.zip; else TW=./tailwindcss-linux-x64; ZIP=tailwindcss-linux-x64.zip; fi
[ -f "$TW" ] || fail "$TW not found. It is kept zipped in git: unzip $ZIP here (see README.md)."
[ "$WIN" = 1 ] || [ -x "$TW" ] || chmod +x "$TW" 2>/dev/null || fail "$TW is not executable: chmod +x $TW"

echo "== 1/3 CSS"
"$TW" -i input.css -o main.css --minify || fail "Tailwind could not build main.css"
"$TW" -i input.css -o main_max.css      || fail "Tailwind could not build main_max.css"

# --- 2. pages ----------------------------------------------------------------
# The standalone binary first (no Node needed). Node is the fallback when the
# binary is missing, or when it says its bundled eleventy.config.js is older
# than the one on disk - its pages would then come from the old config.
if [ "$WIN" = 1 ]; then BIN=./eleventy-win-$ARCH.exe; else BIN=./eleventy-linux-$ARCH; fi
NODE_BUILD="node node_modules/@11ty/eleventy/cmd.cjs --quiet"

echo
echo "== 2/3 pages"
use_node=0
if [ -f "$BIN" ]; then
    [ "$WIN" = 1 ] || [ -x "$BIN" ] || chmod +x "$BIN" 2>/dev/null
    out=$("$BIN" --quiet 2>&1); rc=$?
    printf '%s\n' "$out" | grep -v '^Processed \|^Skipped \|^Published licence/'
    if printf '%s' "$out" | grep -q 'has changed since this binary was compiled'; then
        if command -v node >/dev/null 2>&1; then
            echo "(the binary is older than eleventy.config.js - building again with Node;"
            echo " recompile with eleventy_binary/compile.sh to stop this)"
            use_node=1
        fi
    elif [ "$rc" -ne 0 ]; then
        fail "Eleventy stopped (message above)"
    fi
elif command -v node >/dev/null 2>&1; then
    echo "($BIN not found - building with Node. The binary is kept zipped in git: unzip ${BIN#./}.zip)"
    use_node=1
else
    fail "$BIN not found and Node is not installed. Unzip ${BIN#./}.zip here (see eleventy_binary/README.md)."
fi
if [ "$use_node" = 1 ]; then
    $NODE_BUILD 2>&1 | grep -v '^Processed \|^Skipped \|^Published licence/'
    [ "${PIPESTATUS[0]}" -eq 0 ] || fail "Eleventy stopped (message above)"
fi

# --- 3. check ----------------------------------------------------------------
echo
echo "== 3/3 healthcheck"
if [ "$WIN" = 1 ]; then
    powershell -NoProfile -ExecutionPolicy Bypass -File ./healthcheck.ps1 "$@"
else
    ./healthcheck.sh "$@"
fi
