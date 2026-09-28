#!/bin/bash
# Tailwind in watch mode while you work on styles. Ctrl+C stops it.
# For a one-off build of everything (CSS, then the site, then the healthcheck)
# use ./build.sh instead.
#
# One stylesheet: input.css imports input_prose.css, so there is no separate
# prose build any more. The files Tailwind scans are the @source lines at the
# top of input.css (the old --content flag was removed in Tailwind v4).
echo "Starting Tailwind Build Suite..."

# 1. Main Minified - the file every page loads.
# Piping an endless empty stream keeps stdin open, so the background watcher
# does not exit when this script's stdin closes.
tail -f /dev/null | ./tailwindcss-linux-x64 -i input.css -o main.css --watch --minify &

# 2. Main Unminified (Full) - a readable copy for debugging; no page loads it.
# Stays in the foreground, so Ctrl+C stops both.
echo "Watching main.css + main_max.css..."
./tailwindcss-linux-x64 -i input.css -o main_max.css --watch
