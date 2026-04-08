#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR"
npm run test:bench:charts

REPORT_PATH="$SCRIPT_DIR/bench-report.html"

if [[ -n "${CI:-}" ]]; then
  echo "Benchmark report generated at: $REPORT_PATH"
  exit 0
fi

if command -v open >/dev/null 2>&1; then
  open "$REPORT_PATH" || echo "Benchmark report generated at: $REPORT_PATH"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$REPORT_PATH" || echo "Benchmark report generated at: $REPORT_PATH"
elif command -v cmd.exe >/dev/null 2>&1; then
  WINDOWS_REPORT_PATH="$REPORT_PATH"
  if command -v cygpath >/dev/null 2>&1; then
    WINDOWS_REPORT_PATH="$(cygpath -w "$REPORT_PATH")"
  fi
  cmd.exe /c start "" "$WINDOWS_REPORT_PATH" || echo "Benchmark report generated at: $REPORT_PATH"
else
  echo "Benchmark report generated at: $REPORT_PATH"
fi
