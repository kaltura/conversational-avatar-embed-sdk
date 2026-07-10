#!/usr/bin/env bash
# Gate 4: dead-code scan.
#
# Runs eslint against src/kaltura-avatar-sdk.js with no-unused-vars and
# no-unreachable escalated to "error" (via a one-off --rule override, not by
# editing .eslintrc.json — that file's baseline is calibrated for gate 1).
# Any finding not already present in gate4-baseline.json is treated as newly
# introduced dead code and fails the gate. Findings present in the baseline
# but no longer reported (i.e. someone cleaned up the code) do not fail.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

ESLINT_BIN="$SDK_ROOT/node_modules/.bin/eslint"
TARGET_FILE="$SDK_ROOT/src/kaltura-avatar-sdk.js"
BASELINE_FILE="$SCRIPT_DIR/gate4-baseline.json"

if [ ! -x "$ESLINT_BIN" ]; then
  echo "GATE 4 (dead-code): FAIL — eslint not found at $ESLINT_BIN" >&2
  exit 1
fi

if [ ! -f "$BASELINE_FILE" ]; then
  echo "GATE 4 (dead-code): FAIL — baseline file not found at $BASELINE_FILE" >&2
  exit 1
fi

ESLINT_JSON="$("$ESLINT_BIN" "$TARGET_FILE" \
  --format json \
  --rule '{"no-unused-vars": "error", "no-unreachable": "error"}' \
  || true)"

node --input-type=commonjs -e '
const current = JSON.parse(process.argv[1]);
const baseline = JSON.parse(require("fs").readFileSync(process.argv[2], "utf8"));

const key = (f) => `${f.ruleId}:${f.line}`;
const baselineKeys = new Set(baseline.map(key));

const currentFindings = [];
for (const file of current) {
  for (const m of file.messages) {
    if (m.severity === 2) currentFindings.push({ ruleId: m.ruleId, line: m.line, message: m.message });
  }
}

const known = currentFindings.filter((f) => baselineKeys.has(key(f)));
const unknown = currentFindings.filter((f) => !baselineKeys.has(key(f)));

if (unknown.length > 0) {
  console.log(`GATE 4 (dead-code): FAIL — ${unknown.length} new dead-code finding(s):`);
  for (const f of unknown) {
    console.log(`  [${f.ruleId}] line ${f.line}: ${f.message}`);
  }
  process.exit(1);
} else {
  console.log(`GATE 4 (dead-code): PASS — ${known.length} known pre-existing finding(s), 0 new`);
  process.exit(0);
}
' "$ESLINT_JSON" "$BASELINE_FILE"
