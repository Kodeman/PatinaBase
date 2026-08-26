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

# FC-R3: no user-facing surface may say "Parked in your inbox" (or any other
# quoted string containing "inbox") — the word survives only as the wire
# contract (LocalCaptureSyncService) and the §14 analytics taxonomy
# (S5InboxTerminalScreen). The Swift test guards the *helper*, not the copy,
# so this sweep is the only thing standing between a reintroduced "inbox"
# string and a green gate. Matched by CONTENT, not line number — line numbers
# drift with every unrelated edit to these files.
fcr3_sweep() {
  local out
  out="$(grep -rniE '"[^"]*\binbox\b[^"]*"' Capture/ --include='*.swift' \
    | grep -v 'CaptureScreenID\|registryKey\|accessibilityIdentifier\|analytics.event\|analytics.screen\|// ' || true)"

  local expected=(
    'LocalCaptureSyncService\.swift:[0-9]+: *destination = "inbox"'
    'LocalCaptureSyncService\.swift:[0-9]+: *guard result\.status == "saved" \|\| result\.status == "inbox"'
    'S5InboxTerminalScreen\.swift:[0-9]+: *\["destination": "inbox"\]\)'
  )

  local count
  count=$(printf '%s\n' "$out" | grep -c . || true)

  local missing=()
  local pattern
  for pattern in "${expected[@]}"; do
    if ! printf '%s\n' "$out" | grep -qE "$pattern"; then
      missing+=("$pattern")
    fi
  done

  if [ "$count" -ne 3 ] || [ "${#missing[@]}" -ne 0 ]; then
    cat <<EOF
✘ FC-R3 sweep failed

FC-R3: no designer-facing surface may say "Parked in your inbox" (or any
other quoted string containing "inbox"). This check greps every quoted
string containing "inbox" under Capture/, filters out identifier-only
matches (CaptureScreenID, registryKey, accessibilityIdentifier,
analytics.event/.screen, comments), and expects EXACTLY these three
protected lines to remain — the wire contract and the §14 taxonomy, which
FC-R3 does not touch:

  LocalCaptureSyncService:  destination = "inbox"
  LocalCaptureSyncService:  guard result.status == "saved" || result.status == "inbox"
  S5InboxTerminalScreen:    ["destination": "inbox"]

Got (${count} line(s)):
${out:-<nothing>}

If a screen just reintroduced copy like "Parked in your inbox", fix the
copy. If a genuinely new wire-contract or taxonomy use of "inbox" is
correct, add it to the expected list in this script.
EOF
    exit 1
  fi

  echo "✔ fc-r3 sweep"
}

case "$CMD" in
  build) build ;;
  test)  test_ ;;
  lint)  lint ;;
  fcr3)  fcr3_sweep ;;
  all)   build; test_; lint; fcr3_sweep ;;
  *) echo "usage: $0 [build|test|lint|fcr3|all]"; exit 2 ;;
esac
