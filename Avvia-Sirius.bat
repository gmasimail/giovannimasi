@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Per avviare Sirius installa Node.js LTS da https://nodejs.org/
  echo Dopo l'installazione chiudi questa finestra e riapri Avvia-Sirius.bat.
  pause
  exit /b 1
)
echo Apri http://localhost:3000 nel browser dopo il messaggio di avvio.
echo Lascia aperta questa finestra mentre usi il sito. Premi Ctrl+C per fermarlo.
node server.mjs
if errorlevel 1 pause
