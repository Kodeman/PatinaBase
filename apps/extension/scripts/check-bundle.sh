#!/usr/bin/env bash
# Verifies the packaged extension bundle does not contain markers that should
# never ship: remote font fetches, the bundled OCR engine, and dev/canary
# React builds. See capture-launch W0-E1 / W2 for context — as of W0-E1 this
# script is EXPECTED to fail on fonts.googleapis and tesseract; those are
# removed in a later wave.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$REPO_ROOT" ]; then
  REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
fi
BUILD_DIR="${1:-"$REPO_ROOT/apps/extension/build/chrome-mv3-prod"}"

if [ ! -d "$BUILD_DIR" ]; then
  echo "check-bundle: build directory not found: $BUILD_DIR" >&2
  exit 1
fi

MARKERS=(
  "fonts.googleapis"
  "tesseract"
  "react.transitional.element"
  "\"19.2."
)

fail=0
for marker in "${MARKERS[@]}"; do
  count="$( { grep -rl -- "$marker" "$BUILD_DIR" 2>/dev/null || true; } | wc -l | tr -d ' ')"
  echo "$marker: $count file(s)"
  if [ "$count" -gt 0 ]; then
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  exit 1
fi

echo "check-bundle: OK"
