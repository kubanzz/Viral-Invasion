@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto no_node
node "%~dp0scripts\start-local.mjs" %*
if errorlevel 1 (
  echo Workspace launch failed. The previous build was not opened.
  pause
  exit /b 1
)
exit /b 0

:no_node
echo Node.js was not found. Artwork cannot be synchronized or rebuilt.
if not "%~1"=="" (
  echo Validation and preparation options require Node.js.
  pause
  exit /b 1
)
if not exist "%~dp0dist\index.html" (
  echo No local build exists. Install Node.js and project dependencies, then build the game.
  pause
  exit /b 1
)
if not exist "%~dp0dist\game.js" (
  echo The local build is incomplete. No game was opened.
  pause
  exit /b 1
)
echo Opening the existing snapshot. It may not include your latest artwork or source changes.
start "" "%~dp0dist\index.html"
pause
exit /b 0
