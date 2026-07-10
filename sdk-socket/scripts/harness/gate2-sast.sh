#!/usr/bin/env bash
# Gate 2: SAST scan.
#
# Runs semgrep against the SDK source. Findings already present in
# gate2-baseline.json (pre-existing, reviewed, out-of-scope for issue #2 —
# console.error template-literal format-string audits inside catch blocks
# with no attacker-controlled input) do not fail the gate. Any new finding
# not in the baseline fails loud.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

SEMGREP_BIN="$(command -v semgrep || true)"
TARGET_FILE="$SDK_ROOT/src/kaltura-avatar-sdk.js"
BASELINE_FILE="$SCRIPT_DIR/gate2-baseline.json"

if [ -z "$SEMGREP_BIN" ]; then
  echo "GATE 2 (SAST): FAIL — semgrep not found on PATH (pipx install semgrep)" >&2
  exit 1
fi

SEMGREP_JSON="$("$SEMGREP_BIN" --config auto --config p/javascript --config p/security-audit \
  --json --quiet "$TARGET_FILE" 2>/dev/null || true)"

node --input-type=commonjs -e '
const current = JSON.parse(process.argv[1]);
const baseline = JSON.parse(require("fs").readFileSync(process.argv[2], "utf8"));

const key = (f) => `${f.checkId}:${f.line}`;
const baselineKeys = new Set(baseline.map(key));

const currentFindings = (current.results || []).map((r) => ({
  checkId: r.check_id,
  line: r.start.line,
  message: r.extra.message
}));

const known = currentFindings.filter((f) => baselineKeys.has(key(f)));
const unknown = currentFindings.filter((f) => !baselineKeys.has(key(f)));

if (unknown.length > 0) {
  console.log(`GATE 2 (SAST): FAIL — ${unknown.length} new finding(s):`);
  for (const f of unknown) {
    console.log(`  [${f.checkId}] line ${f.line}: ${f.message}`);
  }
  process.exit(1);
} else {
  console.log(`GATE 2 (SAST): PASS — ${known.length} known pre-existing finding(s), 0 new`);
  process.exit(0);
}
' "$SEMGREP_JSON" "$BASELINE_FILE"
