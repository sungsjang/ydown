@echo off
cd /d "%~dp0"
if exist "dist\ydown.exe" (
  "dist\ydown.exe"
) else if exist ".venv\Scripts\pythonw.exe" (
  ".venv\Scripts\pythonw.exe" agent.py
) else (
  py -3 agent.py
)
