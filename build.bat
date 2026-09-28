@echo off
:: ---------------------------------------------------------------------------
:: build.bat - build the whole site once (Windows twin of build.sh). Double-click
:: it, or run it from cmd/PowerShell in the site root.
::
::   1. CSS    main.css + main_max.css from input.css (tw.exe, one-shot)
::   2. pages  Eleventy: every generated page, the sitemap, feed, search index
::   3. check  healthcheck.ps1 (report only - it never changes a file)
::
::   build.bat            full healthcheck report
::   build.bat --quiet    only the healthcheck sections that found something
::
:: The order matters: every page links /main.css?v=<hash of main.css>
:: (_data/assets.js), so the CSS has to be final before Eleventy runs.
:: Exit code 1 when a step fails or the healthcheck finds an ERROR.
:: ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"
set RC=0

:: --- 1. CSS ------------------------------------------------------------------
if not exist tw.exe (
    echo BUILD FAILED: tw.exe not found. It is kept zipped in git: unzip tw.zip here.
    set RC=1
    goto end
)
echo == 1/3 CSS
.\tw.exe -i input.css -o main.css --minify
if errorlevel 1 ( echo BUILD FAILED: Tailwind could not build main.css & set RC=1 & goto end )
.\tw.exe -i input.css -o main_max.css
if errorlevel 1 ( echo BUILD FAILED: Tailwind could not build main_max.css & set RC=1 & goto end )

:: --- 2. pages ----------------------------------------------------------------
:: The standalone binary (no Node needed); Node only when the binary is missing.
:: If the binary prints "eleventy.config.js has changed since this binary was
:: compiled", recompile it (eleventy_binary\README.md) or run: npm run build
echo.
echo == 2/3 pages
set ELEVENTY=eleventy-win-x64.exe
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set ELEVENTY=eleventy-win-arm64.exe
if exist %ELEVENTY% (
    %ELEVENTY% --quiet
) else (
    where node >nul 2>nul
    if errorlevel 1 (
        echo BUILD FAILED: %ELEVENTY% not found and Node is not installed. Unzip %ELEVENTY:.exe=.zip% here.
        set RC=1
        goto end
    )
    echo ^(%ELEVENTY% not found - building with Node^)
    node node_modules\@11ty\eleventy\cmd.cjs --quiet
)
if errorlevel 1 ( echo BUILD FAILED: Eleventy stopped, see the message above & set RC=1 & goto end )

:: --- 3. check ----------------------------------------------------------------
echo.
echo == 3/3 healthcheck
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0healthcheck.ps1" %*
if errorlevel 1 set RC=1

:end
:: Double-clicked from Explorer the window would close before the report could
:: be read, so hold it open. Started from a prompt (cmdcmdline has /c) just exit.
echo %cmdcmdline% | find /i "%~0" >nul
if not errorlevel 1 (
    echo.
    pause
)
exit /b %RC%
