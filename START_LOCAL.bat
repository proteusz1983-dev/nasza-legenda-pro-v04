@echo off
cd /d "%~dp0"
echo.
echo NASZA LEGENDA 0.5 - serwer lokalny
echo Nie zamykaj tego okna podczas testu.
echo.
start "" http://localhost:8005
py -m http.server 8005 2>nul || python -m http.server 8005
pause
