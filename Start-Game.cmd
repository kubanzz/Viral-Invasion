@echo off
if not exist "%~dp0dist\index.html" (
  echo Please build the game first: npm ci ^&^& npm run build
  pause
  exit /b 1
)
start "" "%~dp0dist\index.html"
