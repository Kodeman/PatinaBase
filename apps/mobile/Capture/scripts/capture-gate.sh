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
# quoted string containing "inbox"), and nothing a designer reads ever says
# "AI" — the two words `FieldCopyAudit.forbiddenWords` declares. The word
# "inbox" survives only as the wire contract (LocalCaptureSyncService), the §14
# analytics taxonomy (S5InboxTerminalScreen) and route/registry keys. The Swift
# test guards the *helper*, not the copy, so this sweep is the only thing
# standing between a reintroduced string and a green gate.
#
# Rooted at BOTH targets. `Capture/` alone was a hole: this wave moved a large
# share of designer-facing copy into `CaptureKit/` (FieldVisitChip,
# FieldTrayScope, FieldVoiceModeState, FieldTodayBand,
# FieldCompanionPresentation, FieldCopyAudit), where a reintroduced "inbox"
# passed the gate untouched.
#
# Matched by CONTENT, not line number — line numbers drift with every unrelated
# edit to these files.
SWEEP_ROOTS=(Capture/ CaptureKit/)

# Identifier-only matches the copy rule does not touch: screen ids, registry
# keys, accessibility ids, the §14 analytics taxonomy, and comments.
sweep_filter() {
  grep -v 'CaptureScreenID\|registryKey\|accessibilityIdentifier\|analytics.event\|analytics.screen\|// ' || true
}

# sweep_word <word> <expected-ERE>...
# Fails unless the surviving matches are EXACTLY the expected protected lines.
sweep_word() {
  local word="$1"; shift
  local expected=("$@")
  local out count missing=() pattern

  out="$({ grep -rniE "\"[^\"]*\b${word}\b[^\"]*\"" "${SWEEP_ROOTS[@]}" --include='*.swift' || true; } | sweep_filter)"
  count=$(printf '%s\n' "$out" | grep -c . || true)

  for pattern in "${expected[@]}"; do
    if ! printf '%s\n' "$out" | grep -qE "$pattern"; then
      missing+=("$pattern")
    fi
  done

  if [ "$count" -ne "${#expected[@]}" ] || [ "${#missing[@]}" -ne 0 ]; then
    cat <<EOF
✘ FC-R3 sweep failed for "${word}"

FC-R3: no designer-facing surface may use the word "${word}". This check greps
every quoted string containing "${word}" under ${SWEEP_ROOTS[*]}, filters out
identifier-only matches (CaptureScreenID, registryKey, accessibilityIdentifier,
analytics.event/.screen, comments), and expects EXACTLY these ${#expected[@]}
protected line(s) to remain:

$(printf '  %s\n' "${expected[@]}")

Got (${count} line(s)):
${out:-<nothing>}

Missing (${#missing[@]}):
$(printf '  %s\n' "${missing[@]:-<none>}")

If a screen just reintroduced copy like "Parked in your inbox", fix the copy.
If a genuinely new wire-contract, taxonomy or route-key use is correct, add it
to the expected list in this script.
EOF
    exit 1
  fi

  echo "✔ fc-r3 sweep (${word})"
}

fcr3_sweep() {
  sweep_word inbox \
    'LocalCaptureSyncService\.swift:[0-9]+: *destination = "inbox"' \
    'LocalCaptureSyncService\.swift:[0-9]+: *guard result\.status == "saved" \|\| result\.status == "inbox"' \
    'S5InboxTerminalScreen\.swift:[0-9]+: *\["destination": "inbox"\]\)' \
    'CaptureNavigation\.swift:[0-9]+: *case \.inboxTerminal' \
    'RouteRegistry\.swift:[0-9]+: *case \.inbox: return "inbox"' \
    'FieldCopyAudit\.swift:[0-9]+: *public static let forbiddenWords'

  # The second forbidden word, unchecked until now. Whole-word so "maintain"
  # and "available" do not trip it — the same rule `FieldCopyAudit.contains`
  # applies. Only the declaration itself survives the comment filter.
  sweep_word ai \
    'FieldCopyAudit\.swift:[0-9]+: *public static let forbiddenWords'
}

# Principle 4: `suggestion_confidence` ORDERS the tray and must NEVER be
# rendered. The Swift test pins the telemetry constructors, not the call sites,
# and a real violation this wave — a view building a whole `CaptureSuggestion`
# just to read `.basis` — was caught by a hand-grep while that test sat green.
# CaptureKit legitimately reads the field (`FieldTraySuggestionOrder.ordered`
# orders the tray with it, the payload encoder ships it, the Specimen accessor
# writes it); the APP TARGET, which is where views live, must not.
principle4_sweep() {
  local out
  out="$(grep -rn 'suggestionConfidence' Capture/ --include='*.swift' || true)"
  if [ -n "$out" ]; then
    cat <<EOF
✘ Principle 4 sweep failed

\`suggestion_confidence\` orders the tray; it is never shown to a designer.
Nothing in the app target (Capture/) may read it — ordering belongs to
CaptureKit (FieldTraySuggestionOrder.ordered), and a view that touches the
field is one edit away from rendering it.

Found:
${out}

If a view needs a suggestion's basis or label, read those fields directly
rather than building a CaptureSuggestion to get at them.
EOF
    exit 1
  fi
  echo "✔ principle-4 sweep"
}

case "$CMD" in
  build) build ;;
  test)  test_ ;;
  lint)  lint ;;
  fcr3)  fcr3_sweep ;;
  p4)    principle4_sweep ;;
  all)   build; test_; lint; fcr3_sweep; principle4_sweep ;;
  *) echo "usage: $0 [build|test|lint|fcr3|p4|all]"; exit 2 ;;
esac
