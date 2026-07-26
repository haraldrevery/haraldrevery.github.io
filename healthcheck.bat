@echo off
:: ---------------------------------------------------------------------------
:: healthcheck.bat - Windows launcher for healthcheck.ps1 (double-click me).
::
::   healthcheck.bat            full report
::   healthcheck.bat --quiet    only sections that found something
::   healthcheck.bat --help     usage and current thresholds
::
:: -ExecutionPolicy Bypass is required: Windows blocks unsigned .ps1 files by
:: default, so without it a double-click fails with a policy error instead of
:: running. -NoProfile keeps a slow or noisy user profile out of the output.
:: ---------------------------------------------------------------------------
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0healthcheck.ps1" %*
set RC=%errorlevel%

:: Double-clicked from Explorer the window would close before the report could
:: be read, so hold it open. Started from a prompt (cmdcmdline has /c) just exit.
echo %cmdcmdline% | find /i "%~0" >nul
if not errorlevel 1 (
    echo.
    pause
)
exit /b %RC%
