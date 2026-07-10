#!/usr/bin/env bash
# Regression harness for GitHub issue #2 (kaltura/conversational-avatar-embed-sdk).
#
# Runs 6 independent gates in order and fails loud on the first non-zero
# exit. This is permanent infra — the regression gate for any future change
# to command-text buffering / dual-source event reconciliation, not
# one-time scaffolding for this fix. Output goes to .harness-output/
# (gitignored) so re-runs never dirty the working tree.
#
# Usage: bash scripts/harness/verify-issue-2.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$SDK_ROOT/.harness-output"

mkdir -p "$OUTPUT_DIR"
cd "$SDK_ROOT"

GATES=(
  "gate1-lint.sh"
  "gate2-sast.sh"
  "gate3-isolation.sh"
  "gate4-deadcode.sh"
  "gate5-unit.sh"
  "gate6-e2e.sh"
)

RESULTS=()
FAILED=0

for gate in "${GATES[@]}"; do
  LOG_FILE="$OUTPUT_DIR/${gate%.sh}.log"
  echo "──────────────────────────────────────────────────────────"
  echo "Running $gate ..."
  if bash "$SCRIPT_DIR/$gate" 2>&1 | tee "$LOG_FILE"; then
    RESULTS+=("PASS  $gate")
  else
    RESULTS+=("FAIL  $gate")
    FAILED=1
  fi
done

echo "──────────────────────────────────────────────────────────"
echo "HARNESS SUMMARY (issue #2):"
for r in "${RESULTS[@]}"; do
  echo "  $r"
done

if [ "$FAILED" -ne 0 ]; then
  echo "HARNESS: FAIL — see logs in $OUTPUT_DIR"
  exit 1
fi

echo "HARNESS: PASS — all 6 gates green"
exit 0
