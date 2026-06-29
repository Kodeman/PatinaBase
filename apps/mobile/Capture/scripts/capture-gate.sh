#!/usr/bin/env bash
# capture-gate.sh — build / test / lint gate for Patina Field Capture.
# Usage: scripts/capture-gate.sh [build|test|lint|all]   (default: all)
set -euo pipefail
cd "$(dirname "$0")/.."

SIM="${CAPTURE_SIM:-iPhone 17}"
DEST="platform=iOS Simulator,name=${SIM}"
CMD="${1:-all}"

generate() { ruby scripts/generate_project.rb >/dev/null; }

build() {
  generate
  xcodebuild build -project Capture.xcodeproj -scheme Capture \
    -sdk iphonesimulator -destination "$DEST" CODE_SIGNING_ALLOWED=NO -quiet
  echo "✔ build"
}

test_() {
  generate
  xcodebuild test -project Capture.xcodeproj -scheme CaptureKit \
    -sdk iphonesimulator -destination "$DEST" CODE_SIGNING_ALLOWED=NO -quiet
  echo "✔ tests"
}

lint() {
  if command -v swiftlint >/dev/null 2>&1; then
    swiftlint lint --quiet --strict || { echo "✘ swiftlint"; exit 1; }
    echo "✔ lint"
  else
    echo "… swiftlint not installed; skipping"
  fi
}

case "$CMD" in
  build) build ;;
  test)  test_ ;;
  lint)  lint ;;
  all)   build; test_; lint ;;
  *) echo "usage: $0 [build|test|lint|all]"; exit 2 ;;
esac
