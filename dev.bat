@echo off
:: Tailwind in watch mode while you work on styles. Close the windows to stop.
:: For a one-off build of everything (CSS, then the site, then the healthcheck)
:: double-click build.bat instead.
::
:: One stylesheet: input.css imports input_prose.css, so there is no separate
:: prose build any more. The files Tailwind scans are the @source lines at the
:: top of input.css (the old --content flag was removed in Tailwind v4).
echo Starting Tailwind Build Suite...

:: 1. Main Minified - the file every page loads.
start "Main Min" cmd /c ".\tw.exe -i input.css -o main.css --watch --minify"

:: 2. Main Unminified (Full) - a readable copy for debugging; no page loads it.
echo Watching main.css + main_max.css...
.\tw.exe -i input.css -o main_max.css --watch
