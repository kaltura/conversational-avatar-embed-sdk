#!/usr/bin/env bash
# Gate 3: multi-instance isolation.
#
# Proves spec rule 1.1 (issue #2): CommandTextBuffer state is per-instance,
# not shared/module-level. Runs the "isolation" test in sdk-unit.spec.js,
# which constructs 2 CommandTextBuffer instances and asserts no cross-talk.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if bash "$SCRIPT_DIR/lib/run-playwright.sh" tests/e2e/sdk-unit.spec.js -g "isolation"; then
  echo "GATE 3 (isolation): PASS"
else
  echo "GATE 3 (isolation): FAIL — see Playwright output above"
  exit 1
fi
