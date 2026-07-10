#!/usr/bin/env bash
# Gate 1: lint.
#
# Runs the project's ESLint config (sdk-socket/.eslintrc.json) against the
# SDK source. The config is calibrated so it passes cleanly (0 errors) on
# pre-existing legacy patterns (UMD `define`, intentional unused callback
# params) while still catching real issues as errors.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

ESLINT_BIN="$SDK_ROOT/node_modules/.bin/eslint"
TARGET_FILE="$SDK_ROOT/src/kaltura-avatar-sdk.js"

if [ ! -x "$ESLINT_BIN" ]; then
  echo "GATE 1 (lint): FAIL — eslint not found at $ESLINT_BIN (run npm install)" >&2
  exit 1
fi

if "$ESLINT_BIN" "$TARGET_FILE"; then
  echo "GATE 1 (lint): PASS"
else
  echo "GATE 1 (lint): FAIL — eslint reported errors above"
  exit 1
fi
