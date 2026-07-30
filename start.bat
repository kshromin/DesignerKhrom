@echo off
rem Starts the local server on port 8730 and opens the configurator in a browser.
rem Optional argument: which page to open (default is the configurator itself).
rem
rem ASCII only, on purpose: cmd.exe reads .bat files in the console codepage, which
rem differs depending on where the file is launched from. Cyrillic bytes get misread
rem and break command parsing - even inside rem comments. See STRUCTURE.md.
cd /d "%~dp0"

set "PY="
where py >nul 2>nul && set "PY=py"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"

if not defined PY (
  echo.
  echo   Python not found. Install it from python.org and run this file again.
  echo.
  pause
  exit /b 1
)

rem If the server is already up, don't start a second one: it would just fail to bind
rem the port and show a confusing error. Reuse it and go straight to the browser.
set "RUNNING="
netstat -an | findstr "LISTENING" | findstr ":8730 " >nul 2>nul && set "RUNNING=1"

if not defined RUNNING (
  rem The server runs in its own window: close that window to stop it.
  start "DesignerKhrom server - close this window to stop" "%PY%" "scripts\dev-server.py" 8730

  rem Give the server a moment, otherwise the browser gets "page not found".
  rem ping, not timeout: timeout fails when the window has redirected input.
  ping -n 2 127.0.0.1 >nul
)

start "" "http://localhost:8730/%~1"

exit /b 0
