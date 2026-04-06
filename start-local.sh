#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d "node_modules" ]; then
  echo "[start-local] Installing dependencies..."
  npm install
fi

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-4176}"

echo "[start-local] Starting dev server at http://${HOST}:${PORT}"
npm run dev -- --host "$HOST" --port "$PORT"
