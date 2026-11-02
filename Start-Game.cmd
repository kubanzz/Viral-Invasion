@echo off
setlocal
cd /d "%~dp0"
set "GAME_NODE="
for /f "delims=" %%I in ('where node.exe 2^>nul') do if not defined GAME_NODE set "GAME_NODE=%%I"
if not defined GAME_NODE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "GAME_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined GAME_NODE if exist "%ProgramFiles%\nodejs\node.exe" set "GAME_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined GAME_NODE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "GAME_NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined GAME_NODE goto no_node
"%GAME_NODE%" "%~dp0scripts\start-local.mjs" %*
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
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%~dp0dist\index.html"
  exit /b 0
)
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
  start "" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" "%~dp0dist\index.html"
  exit /b 0
)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%~dp0dist\index.html"
  exit /b 0
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" "%~dp0dist\index.html"
  exit /b 0
)
echo A supported browser was not found. Open dist\index.html with Microsoft Edge or Google Chrome.
pause
exit /b 1
