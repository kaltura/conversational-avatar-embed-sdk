#!/usr/bin/env bash
# Shared helper: run a Playwright spec against a free local port.
#
# playwright.config.js hardcodes baseURL/webServer to port 8090 with
# reuseExistingServer:true. If an unrelated process already holds 8090 (this
# hit gates 3/5/6 during harness construction — a different project's dev
# server was running locally), Playwright silently reuses it and every test
# times out against the wrong app. Rather than editing the committed config
# or killing a process this harness doesn't own, generate a throwaway config
# on a free port, run against it, then delete it — every run, not just when
# 8090 happens to be busy.
#
# Usage: run-playwright.sh <spec-path> [-- <extra playwright args>]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

SPEC_PATH="$1"
shift || true

PORT=$(node -e '
const net = require("net");
const srv = net.createServer();
srv.listen(0, "127.0.0.1", () => {
  const { port } = srv.address();
  srv.close(() => console.log(port));
});
')

SCRATCH_CONFIG="$SDK_ROOT/playwright.harness-scratch.config.js"

node -e "
const base = require('$SDK_ROOT/playwright.config.js');
base.use.baseURL = 'http://localhost:$PORT';
base.webServer.port = $PORT;
base.webServer.command = 'python3 -m http.server $PORT --directory .';
base.webServer.reuseExistingServer = false;
require('fs').writeFileSync('$SCRATCH_CONFIG', 'module.exports = ' + JSON.stringify(base) + ';');
"

cleanup() { rm -f "$SCRATCH_CONFIG"; }
trap cleanup EXIT

(cd "$SDK_ROOT" && npx playwright test "$SPEC_PATH" --config="$SCRATCH_CONFIG" "$@")
