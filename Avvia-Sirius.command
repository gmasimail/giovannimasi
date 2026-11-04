#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Installa Node.js LTS da https://nodejs.org/ e riapri questo file."
  printf "Premi Invio per chiudere. "
  read -r answer
  exit 1
fi
echo "Apri http://localhost:3000 nel browser. Lascia aperta questa finestra."
exec node server.mjs
