#!/usr/bin/env bash
# capture-gate.sh — build / test / lint gate for Patina Field Capture.
# Usage: scripts/capture-gate.sh [build|test|ui|lint|fcr3|p4|all]   (default: all)
#
# The build/test/ui/all tiers require CAPTURE_SIM_UDID — this lane's own simulator
# clone. See sim_destination(); this gate does not guess.
set -euo pipefail
cd "$(dirname "$0")/.."

CMD="${1:-all}"

# --- per-worktree DerivedData: two concurrent Field lanes ---------------------
# Sharing the default DerivedData means sharing its module cache and its lock.
# `error: unable to attach DB … database is locked` is the documented symptom
# (docs/design/ios-ux-review-2026-07/integration-log.md:22) and it fails the
# lane that did nothing wrong. Same treatment as
# apps/mobile/Patina/scripts/ios-gate.sh:44. `.build/` is gitignored, so this
# never reaches the pbxproj commit generate() produces.
PROJECT_DIR="$PWD"                                   # apps/mobile/Capture
DERIVED="$PROJECT_DIR/.build/DerivedData"

# --- the destination is explicit, or the gate refuses to guess ----------------
# This was `platform=iOS Simulator,name=${CAPTURE_SIM:-iPhone 17}`. A name
# resolves to the SAME device in every concurrent lane, so two lanes running
# `test` install over each other and one lane's bundle can run against the
# other's installed app. A name is also not guaranteed to resolve at all — the
# installed device set need not contain "iPhone 17" — turning the gate red for
# a reason that has nothing to do with the change under test.
#
# Same contract as ios-gate.sh sim_destination(): echo the destination and
# RETURN a status, never `exit`. This only ever runs as `$(sim_destination)`,
# where an `exit` kills the command substitution's subshell rather than the
# gate. Every caller must test the status — see build().
sim_destination() {
  if [[ -n "${CAPTURE_SIM_UDID:-}" ]]; then
    echo "platform=iOS Simulator,id=$CAPTURE_SIM_UDID"; return 0
  fi
  # printf rather than a heredoc: ios-gate.sh writes this refusal with plain
  # redirected echoes, and a heredoc needs a writable temp file — which a
  # sandboxed runner can refuse, swallowing the very message that explains the
  # failure.
  printf '%s\n' \
    "✘ CAPTURE_SIM_UDID is unset." \
    "" \
    "The build/test/ui/all tiers need an explicit simulator udid: this lane's OWN" \
    "clone. Never a shared device, never 'booted', and never a device name —" \
    "Field runs two concurrent lanes, and a name resolves to the same device in" \
    "both, so one lane's test run installs over the other's." \
    "" \
    "Create this lane's clone and export its udid:" \
    "" \
    "  xcrun simctl list devices                   # pick a source; note its udid" \
    "  xcrun simctl shutdown <source-udid>         # clone refuses a booted source" \
    "                                              # (SimError 405)" \
    '  export CAPTURE_SIM_UDID="$(xcrun simctl clone <source-udid> field-<lane>)"' \
    "" \
    'Retire it with the lane: xcrun simctl delete "$CAPTURE_SIM_UDID"' \
    "" \
    "CAPTURE_SIM (a device NAME) is no longer read — not by this gate, and not" \
    "by capture-run.sh or capture-shots.sh, which take CAPTURE_SIM_UDID too." >&2
  return 2
}

# Restore the gitignored Secrets.swift first. generate_project.rb globs *.swift
# off disk, so in a fresh worktree or a CI checkout — where the gitignored file
# was never checked out — it generates an app target missing the `Secrets` enum
# that AppConfiguration.swift references, and the build fails for reasons that
# have nothing to do with the change under test. Inside generate() so neither
# build nor test can skip it. Never overwrites an existing file; see
# scripts/bootstrap-worktree.sh.
generate() {
  scripts/bootstrap-worktree.sh
  ruby scripts/generate_project.rb >/dev/null
}

build() {
  local dest
  # Resolved BEFORE generate(). generate() rm -rf's the TRACKED Capture.xcodeproj
  # and rebuilds it, so a gate that is going to refuse must refuse before it has
  # rewritten the working tree. `|| return $?` is load-bearing: without it the
  # failed assignment is swallowed and xcodebuild runs with -destination "".
  dest="$(sim_destination)" || return $?
  generate
  xcodebuild build -project Capture.xcodeproj -scheme Capture \
    -sdk iphonesimulator -destination "$dest" \
    -derivedDataPath "$DERIVED" CODE_SIGNING_ALLOWED=NO -quiet
  echo "✔ build"
}

test_() {
  local dest
  # Before generate(), and `|| return $?` tested — see build().
  dest="$(sim_destination)" || return $?
  generate
  xcodebuild test -project Capture.xcodeproj -scheme CaptureKit \
    -sdk iphonesimulator -destination "$dest" \
    -derivedDataPath "$DERIVED" CODE_SIGNING_ALLOWED=NO -quiet
  echo "✔ tests"
}

# XCUITest, app-hosted. The CaptureKit scheme has no app to host a UI test, so
# this runs the Capture scheme narrowed to CaptureUITests (that scheme also
# carries the CaptureTests logic bundle, which test_() already runs).
ui() {
  local dest
  # Before generate(), and `|| return $?` tested — see build().
  dest="$(sim_destination)" || return $?
  generate
  xcodebuild test -project Capture.xcodeproj -scheme Capture \
    -only-testing:CaptureUITests \
    -sdk iphonesimulator -destination "$dest" \
    -derivedDataPath "$DERIVED" CODE_SIGNING_ALLOWED=NO -quiet
  echo "✔ ui tests"
}

# Pinned so `--strict` means the same thing on every machine and runner.
# Bump this only alongside a deliberate `brew upgrade swiftlint` + a lint
# fix-up pass for whatever the new version starts flagging.
SWIFTLINT_VERSION="0.65.1"

lint() {
  if ! command -v swiftlint >/dev/null 2>&1; then
    echo "✘ swiftlint not installed"
    echo "The Capture lint tier requires SwiftLint ${SWIFTLINT_VERSION}. Absent tooling"
    echo "is a gate failure, not a skip — CI does not install swiftlint either"
    echo "(.github/workflows/policy-quality.yml), so this is the only place that check"
    echo "runs."
    echo "Install it with: brew install swiftlint"
    exit 1
  fi

  local actual
  actual="$(swiftlint version)"
  if [ "$actual" != "$SWIFTLINT_VERSION" ]; then
    echo "✘ swiftlint version mismatch"
    echo "Expected SwiftLint ${SWIFTLINT_VERSION} (pinned in this script), found ${actual}."
    echo "This gate runs with --strict, so a different SwiftLint version can flip this"
    echo "tier red (or green) for a change that did not cause it."
    echo "Install the pinned version with: brew install swiftlint@${SWIFTLINT_VERSION}"
    echo "(or brew upgrade/downgrade swiftlint to ${SWIFTLINT_VERSION})"
    exit 1
  fi

  swiftlint lint --quiet --strict || { echo "✘ swiftlint"; exit 1; }
  echo "✔ lint"
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
  ui)    ui ;;
  lint)  lint ;;
  fcr3)  fcr3_sweep ;;
  p4)    principle4_sweep ;;
  all)   build; test_; ui; lint; fcr3_sweep; principle4_sweep ;;
  *) echo "usage: $0 [build|test|ui|lint|fcr3|p4|all]"; exit 2 ;;
esac
