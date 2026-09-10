@echo off
cd /d "%~dp0"
if not exist "ydown.exe" (
  echo ydown.exe를 찾을 수 없습니다: %CD%\ydown.exe
  pause
  exit /b 1
)
"%CD%\ydown.exe"
