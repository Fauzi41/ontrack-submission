#!/usr/bin/env bash
# Membangun proof pack dari nol: impor ke basis data baru, lalu bekukan semua
# keluaran yang bisa diperiksa ke direktori proof/.
#
# Basis data kerja (backend/data/ontrack.db) tidak disentuh.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd -W)"   # path gaya Windows, karena node dan npm bukan program MSYS
PROOF=proof
rm -rf "$PROOF"
mkdir -p "$PROOF/json"

export ONTRACK_DB_PATH="$ROOT/$PROOF/ontrack.db"
export NO_COLOR=1
export FORCE_COLOR=0
echo "basis data: $ONTRACK_DB_PATH"

{
  echo "waktu (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "komit: $(git rev-parse --short HEAD)"
  echo "node: $(node -v)"
  echo "npm: $(npm -v)"
  echo "sistem: $(uname -s -r)"
} > "$PROOF/00-lingkungan.txt"

echo "1/8 impor"
npm run import -w backend > "$PROOF/01-impor.txt" 2>&1

echo "2/8 evaluasi"
npm run evaluate -w backend > "$PROOF/02-evaluasi.txt" 2>&1

echo "3/8 bekukan jawaban API"
npm run dump -w backend -- "$ROOT/$PROOF/json" > "$PROOF/03-dump.txt" 2>&1

echo "4/8 test"
npm test > "$PROOF/04-test.txt" 2>&1

echo "5/8 verifikasi rute"
npm run verify -w backend > "$PROOF/05-verifikasi.txt" 2>&1

echo "6/8 cakupan"
( cd backend && npx vitest run --coverage --coverage.reporter=text > "../$PROOF/06-cakupan.txt" 2>&1 )

echo "7/8 build frontend"
npm run build -w frontend > "$PROOF/07-build.txt" 2>&1

echo "8/8 riwayat versi record"
npm run probe:versions -w backend > "$PROOF/08-versi.txt" 2>&1

node scripts/proof-summary.mjs "$PROOF"

echo
echo "proof pack siap di $PROOF/"
