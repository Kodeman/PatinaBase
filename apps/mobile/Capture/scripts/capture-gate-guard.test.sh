#!/usr/bin/env bash
# shellcheck disable=SC2016  # single-quoted stub SOURCE below must not expand here
#
# capture-gate-guard.test.sh — regression test for the CAPTURE_SIM_UDID guard in
# capture-gate.sh, capture-run.sh and capture-shots.sh.
#
# What this pins: every Field script that needs a simulator takes this lane's OWN
# clone by udid, and REFUSES — before doing anything else — when none is given.
# A device name resolves to the same simulator in every concurrent lane, so two
# lanes install over each other's app.
#
# "Before anything else" is the part that matters most. Each script regenerates
# the project first, and generate_project.rb rm -rf's the TRACKED
# Capture.xcodeproj. A refusal that fires after that has already rewritten the
# working tree, so this test asserts the pbxproj is byte-identical by HASH.
#
# Runs with NO simulator, NO Xcode and NO network. The three scripts are copied,
# byte for byte, into a throwaway fixture that holds a copy of the real pbxproj,
# and ruby / xcodebuild / xcrun / open are stubs on PATH. The ruby stub does what
# generate_project.rb does to the pbxproj — deletes and rewrites it — but only
# inside the fixture, so a broken guard shows up as a changed hash here instead
# of a destroyed tracked file in the checkout.
#
#   bash apps/mobile/Capture/scripts/capture-gate-guard.test.sh
#
# Exit 0 = the guard holds for every simulator-taking entry point.
set -uo pipefail   # deliberately NOT -e: this test runs failing commands on purpose

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REAL_PBXPROJ="$SCRIPT_DIR/../Capture.xcodeproj/project.pbxproj"
FAKE_UDID="DEADBEEF-0000-0000-0000-000000000000"

[[ -f "$REAL_PBXPROJ" ]] || { echo "capture-gate-guard: $REAL_PBXPROJ not found" >&2; exit 1; }

# An explicit template: bare `mktemp -d` is a GNU-ism that BSD/macOS mktemp answers
# from _CS_DARWIN_USER_TEMP_DIR, which is not always writable (it is not under a
# sandboxed agent). A silently-empty WORK would point every path below at `/`.
WORK="$(mktemp -d "${TMPDIR:-/tmp}/capture-gate-guard.XXXXXX")" || WORK=""
if [[ -z "$WORK" || ! -d "$WORK" ]]; then
  echo "capture-gate-guard: could not create a temp dir under '${TMPDIR:-/tmp}'" >&2
  exit 1
fi
trap 'rm -rf "$WORK"' EXIT
# Physical path: the scripts `cd "$(dirname "$0")/.."`, and the -derivedDataPath
# assertion below compares against the directory they land in.
WORK="$(cd "$WORK" && pwd -P)"

STUB_DIR="$WORK/bin"
LOGS="$WORK/logs"
FIX="$WORK/Capture"          # stands in for apps/mobile/Capture
OUT="$WORK/output.txt"
mkdir -p "$STUB_DIR" "$LOGS" "$FIX/scripts" "$FIX/Capture.xcodeproj" || exit 1

for script in capture-gate.sh capture-run.sh capture-shots.sh; do
  cp "$SCRIPT_DIR/$script" "$FIX/scripts/$script" || exit 1
done
cp "$REAL_PBXPROJ" "$FIX/Capture.xcodeproj/project.pbxproj" || exit 1

export CAPTURE_GUARD_LOGS="$LOGS"
export CAPTURE_GUARD_FIXTURE="$FIX"

# ---- stubs ---------------------------------------------------------------------
# One tab-separated argv line per invocation, one log per tool.
# Written with printf, not a heredoc: bash stages every heredoc in a temp file of
# its own choosing, which a sandboxed shell may be refused — and then the stubs
# silently do not exist and the real toolchain runs instead.
LOG_ARGV='{ printf "%s\t" "$@"; printf "\n"; } >> "$CAPTURE_GUARD_LOGS/$(basename "$0").log"'

# xcodebuild: log, then leave a Capture.app where run/shots look for one.
printf '%s\n' \
  '#!/usr/bin/env bash' \
  "$LOG_ARGV" \
  'dd=""; prev=""' \
  'for a in "$@"; do [[ $prev == -derivedDataPath ]] && dd=$a; prev=$a; done' \
  'if [[ -n $dd ]]; then mkdir -p "$dd/Build/Products/Debug-iphonesimulator/Capture.app"; fi' \
  'exit 0' > "$STUB_DIR/xcodebuild"
# ruby: generate_project.rb's effect on the pbxproj — rm -rf and rewrite — and
# only ever inside the fixture.
printf '%s\n' \
  '#!/usr/bin/env bash' \
  "$LOG_ARGV" \
  'if [[ ${1:-} == scripts/generate_project.rb && $PWD == "$CAPTURE_GUARD_FIXTURE" ]]; then' \
  '  rm -rf Capture.xcodeproj && mkdir Capture.xcodeproj' \
  '  printf "regenerated\n" > Capture.xcodeproj/project.pbxproj' \
  'fi' \
  'exit 0' > "$STUB_DIR/ruby"
printf '%s\n' '#!/usr/bin/env bash' "$LOG_ARGV" 'exit 0' > "$STUB_DIR/xcrun"
printf '%s\n' '#!/usr/bin/env bash' "$LOG_ARGV" 'exit 0' > "$STUB_DIR/open"
# The gate's generate() runs this by relative path; the real one would restore a
# gitignored file, which this fixture has no business doing.
printf '%s\n' '#!/usr/bin/env bash' "$LOG_ARGV" 'exit 0' > "$FIX/scripts/bootstrap-worktree.sh"

chmod +x "$STUB_DIR"/* "$FIX/scripts/bootstrap-worktree.sh"
for stub in xcodebuild ruby xcrun open; do
  [[ -x "$STUB_DIR/$stub" ]] || { echo "capture-gate-guard: stub '$stub' was not created" >&2; exit 1; }
done
export PATH="$STUB_DIR:$PATH"

# ---- harness -------------------------------------------------------------------
failures=0
ok()  { printf '    ok   %s\n' "$1"; }
bad() { printf '    FAIL %s\n' "$1"; failures=$((failures + 1)); }
check() { if [[ $1 == 0 ]]; then ok "$2"; else bad "$2"; fi; }

hash_of() {
  if [[ -f "$1" ]]; then shasum -a 256 "$1" | cut -d' ' -f1; else echo MISSING; fi
}
REAL_HASH_BEFORE="$(hash_of "$REAL_PBXPROJ")"
PBX_HASH="$(hash_of "$FIX/Capture.xcodeproj/project.pbxproj")"

STATUS=0
# run <script> [args...] — from a clean fixture: fresh logs, pristine pbxproj.
run() {
  local script="$1"; shift
  rm -f "$LOGS"/*.log
  rm -rf "$FIX/Capture.xcodeproj" "$FIX/.build"
  mkdir -p "$FIX/Capture.xcodeproj"
  cp "$REAL_PBXPROJ" "$FIX/Capture.xcodeproj/project.pbxproj"
  bash "$FIX/scripts/$script" "$@" > "$OUT" 2>&1
  STATUS=$?
}

# NB: every pattern goes through `grep -e`. These patterns start with `-`, and a
# bare `grep "$pat"` parses `-destination…` as a (bogus) option instead.
log_has() { [[ -f "$LOGS/$1.log" ]] && grep -q -e "$2" "$LOGS/$1.log"; }
invoked()  { [[ -s "$LOGS/$1.log" ]]; }

# Predicates, so every `check $?` below reads the status of a COMMAND.
failed()         { [[ $STATUS -ne 0 ]]; }
succeeded()      { [[ $STATUS -eq 0 ]]; }
pbxproj_intact() { [[ "$(hash_of "$FIX/Capture.xcodeproj/project.pbxproj")" == "$PBX_HASH" ]]; }

# ---- 1. every simulator-taking entry point refuses when the udid is unset ------
# CAPTURE_SIM is set on purpose: the old NAME variable must no longer satisfy it.
unset CAPTURE_SIM_UDID
export CAPTURE_SIM="iPhone 17"
for entry in "capture-gate.sh build" "capture-gate.sh test" "capture-gate.sh ui" "capture-gate.sh all" \
             "capture-run.sh" "capture-run.sh C5.specimen-sheet" \
             "capture-shots.sh" "capture-shots.sh C5"; do
  printf '  %-34s (CAPTURE_SIM_UDID unset)\n' "$entry"
  # shellcheck disable=SC2086  # word-splitting "script args" is the point
  run $entry

  failed; check $? "exits non-zero (got $STATUS)"
  pbxproj_intact; check $? "Capture.xcodeproj/project.pbxproj is byte-identical (sha256)"
  ! invoked xcodebuild; check $? "never invoked xcodebuild"
  ! invoked ruby; check $? "never ran generate_project.rb"
  ! invoked bootstrap-worktree.sh; check $? "never ran bootstrap-worktree.sh"
  ! invoked xcrun; check $? "never touched a simulator (xcrun)"
  grep -q 'CAPTURE_SIM_UDID is unset' "$OUT"; check $? "printed the guard's error message"
done
unset CAPTURE_SIM

# ---- 2. with the udid set, it is the destination and DerivedData is local ------
# Also proves the harness can see a violation: here generate DOES run, and the
# stub DOES rewrite the fixture pbxproj — so the hash check above is not vacuous.
export CAPTURE_SIM_UDID="$FAKE_UDID"
export CAPTURE_SHOTS_DIR="$WORK/shots" CAPTURE_SHOT_SETTLE=0
DEST="$(printf -- '-destination\tplatform=iOS Simulator,id=%s\t' "$FAKE_UDID")"
DERIVED="$(printf -- '-derivedDataPath\t%s/.build/DerivedData\t' "$FIX")"
for entry in "capture-gate.sh build" "capture-gate.sh test" "capture-gate.sh ui" \
             "capture-run.sh C5.specimen-sheet" "capture-shots.sh C5"; do
  printf '  %-34s (CAPTURE_SIM_UDID set)\n' "$entry"
  # shellcheck disable=SC2086
  run $entry

  succeeded; check $? "exits zero (got $STATUS)"
  ! pbxproj_intact; check $? "generate ran (the stub rewrote the fixture pbxproj)"
  log_has xcodebuild "$DEST"; check $? "destination is platform=iOS Simulator,id=\$CAPTURE_SIM_UDID"
  log_has xcodebuild "$DERIVED"; check $? "-derivedDataPath is this checkout's .build/DerivedData"
  case "$entry" in
    "capture-gate.sh ui")
      log_has xcodebuild "$(printf -- '-scheme\tCapture\t-only-testing:CaptureUITests\t')"
      check $? "runs CaptureUITests through the Capture scheme"
      ;;
    capture-run.sh*|capture-shots.sh*)
      log_has xcrun "$(printf 'simctl\tinstall\t%s\t' "$FAKE_UDID")"
      check $? "installs onto \$CAPTURE_SIM_UDID"
      ! log_has xcrun booted; check $? "never targets 'booted'"
      ;;
  esac
done

# ---- 3. the checkout itself was never touched ----------------------------------
printf '  %-34s\n' "tracked pbxproj in this checkout"
[[ "$(hash_of "$REAL_PBXPROJ")" == "$REAL_HASH_BEFORE" ]]
check $? "apps/mobile/Capture/Capture.xcodeproj/project.pbxproj is byte-identical (sha256)"

# ---- verdict --------------------------------------------------------------------
if [[ $failures -ne 0 ]]; then
  printf '\ncapture-gate-guard: %d assertion(s) FAILED\n' "$failures" >&2
  exit 1
fi
printf '\ncapture-gate-guard: all assertions passed\n'
