@echo off
cd /d "%~dp0"
echo ==========================================
echo NASZA LEGENDA PRO v0.4.1
echo Lokalny adres: http://localhost:8004
echo Zamkniecie serwera: CTRL+C
echo ==========================================
start "" http://localhost:8004
py -m http.server 8004 2>nul || python -m http.server 8004
pause
