#!/usr/bin/env bash
# Gate 5: unit/integration tests proving each Phase-1 spec rule (issue #2).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if bash "$SCRIPT_DIR/lib/run-playwright.sh" tests/e2e/command-text-buffer.spec.js; then
  echo "GATE 5 (unit/integration): PASS"
else
  echo "GATE 5 (unit/integration): FAIL — see Playwright output above"
  exit 1
fi
