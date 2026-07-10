#!/usr/bin/env bash
# Gate 6: E2E reproduction of the real user flow (issue #2), with recorded
# proof — a screenshot written to .harness-output/gate6/, plus Playwright's
# own video/trace (test.use({ video: 'on', trace: 'on' }) in the spec).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if bash "$SCRIPT_DIR/lib/run-playwright.sh" tests/e2e/command-truncation-e2e.spec.js; then
  echo "GATE 6 (E2E): PASS"
  ls -la "$SDK_ROOT/.harness-output/gate6/" 2>/dev/null || true
else
  echo "GATE 6 (E2E): FAIL — see Playwright output above"
  exit 1
fi
