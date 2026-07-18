@echo off
cd /d "%~dp0"
start "" http://localhost:8005
py -m http.server 8005
if errorlevel 1 python -m http.server 8005
pause
