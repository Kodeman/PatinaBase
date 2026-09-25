#!/usr/bin/env bash
#
# ios-gate-guard.test.sh — regression test for the IOS_GATE_UDID guard in ios-gate.sh.
#
# The bug this pins (W0-04): sim_destination() used to end in `exit 2`, but it is
# only ever called as a command substitution — `dest="$(sim_destination)"` — so the
# `exit` killed the substitution's subshell, not the gate. The assignment's status
# was 2, but because `cmd_test` is invoked in a NON-FINAL position of the `all`
# tier's `&&` list, bash suppresses `set -e` for the whole call, so cmd_test ran on
# to `xcodebuild test -destination ""`. `unit`/`ui` put cmd_test last, so errexit
# did fire there — which is why the guard looked like it worked.
#
# Runs with NO simulator, NO Xcode and NO network: xcodebuild/swiftlint/xcbeautify
# are replaced by stubs on PATH. The xcodebuild stub always SUCCEEDS, so the guard
# is the only thing that can stop the &&-chain — if the guard is broken, the tier
# reaches `xcodebuild test` and this test sees it in the stub's argv log.
#
#   bash apps/mobile/Patina/scripts/ios-gate-guard.test.sh
#
# Exit 0 = guard holds on every destination-taking tier.
set -uo pipefail   # deliberately NOT -e: this test runs failing commands on purpose

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$SCRIPT_DIR/ios-gate.sh"
FAKE_UDID="DEADBEEF-0000-0000-0000-000000000000"

# An explicit template: bare `mktemp -d` is a GNU-ism that BSD/macOS mktemp answers
# from _CS_DARWIN_USER_TEMP_DIR, which is not always writable (it is not under a
# sandboxed agent). A silently-empty STUB_DIR would point every path below at `/`.
STUB_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ios-gate-guard.XXXXXX")" || STUB_DIR=""
if [[ -z "$STUB_DIR" || ! -d "$STUB_DIR" ]]; then
  echo "ios-gate-guard: could not create a temp dir under '${TMPDIR:-/tmp}'" >&2
  exit 1
fi
trap 'rm -rf "$STUB_DIR"' EXIT
LOG="$STUB_DIR/xcodebuild-argv.log"
OUT="$STUB_DIR/gate-output.txt"
export IOS_GATE_TEST_LOG="$LOG"
# The gate writes a CHECKOUT marker under its DerivedData root before every
# xcodebuild; keep that inside this temp dir, not the real cache.
export PATINA_DERIVED_ROOT="$STUB_DIR/derived"

# ---- stubs ---------------------------------------------------------------------
# One tab-separated line per invocation. An EMPTY argument shows up as two adjacent
# tabs, which is exactly how `-destination ""` is detected below.
# Written with printf, not a heredoc: bash stages every heredoc in a temp file of
# its own choosing, which a sandboxed shell may be refused — and then the stubs
# silently do not exist and the real toolchain runs instead.
# shellcheck disable=SC2016  # single quotes are the point: this is stub SOURCE
printf '%s\n' \
  '#!/usr/bin/env bash' \
  '{ printf "%s\t" "$@"; printf "\n"; } >> "$IOS_GATE_TEST_LOG"' \
  'exit 0' > "$STUB_DIR/xcodebuild"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'case " $* " in *" --reporter json "*) echo "[]" ;; esac' \
  'exit 0' > "$STUB_DIR/swiftlint"
# Shadow any real xcbeautify so run_xcb takes the same branch on every machine.
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'cat' > "$STUB_DIR/xcbeautify"
chmod +x "$STUB_DIR/xcodebuild" "$STUB_DIR/swiftlint" "$STUB_DIR/xcbeautify"
for stub in xcodebuild swiftlint xcbeautify; do
  [[ -x "$STUB_DIR/$stub" ]] || { echo "ios-gate-guard: stub '$stub' was not created" >&2; exit 1; }
done
export PATH="$STUB_DIR:$PATH"

# ---- harness -------------------------------------------------------------------
failures=0
ok()  { printf '    ok   %s\n' "$1"; }
bad() { printf '    FAIL %s\n' "$1"; failures=$((failures + 1)); }
check() { if [[ $1 == 0 ]]; then ok "$2"; else bad "$2"; fi; }

GATE_STATUS=0
run_gate() {
  : > "$LOG"; : > "$OUT"
  "$GATE" "$@" > "$OUT" 2>&1
  GATE_STATUS=$?
}

# NB: every pattern goes through `grep -e`. These patterns start with `-`, and a
# bare `grep "$pat"` parses `-destination…` as a (bogus) option instead.
log_has() { [[ -f "$LOG" ]] && grep -q -e "$1" "$LOG"; }

# Predicates, so every `check $?` below reads the status of a COMMAND. Calling
# `check $?` straight after a bare `[[ ]]` works but is the same class of
# status-handling trap this whole file exists to pin (shellcheck SC2319).
gate_failed()    { [[ $GATE_STATUS -ne 0 ]]; }
gate_succeeded() { [[ $GATE_STATUS -eq 0 ]]; }

logged_a_test_build() { log_has "$(printf '^test\t')"; }
logged_empty_destination() {
  log_has "$(printf -- '-destination\t\t')" || log_has "$(printf -- '-destination\t$')"
}

# ---- 1. every destination-taking tier must refuse when IOS_GATE_UDID is unset ----
unset IOS_GATE_UDID
for tier in unit ui all; do
  printf '  tier %-6s (IOS_GATE_UDID unset)\n' "$tier"
  run_gate "$tier"

  gate_failed; check $? "exits non-zero (got $GATE_STATUS)"

  # Proves the stubs really are on PATH and the &&-chain really reached the gate,
  # so the 'never invoked test' assertion below cannot pass vacuously.
  log_has "$(printf '^build\t')"; check $? "did invoke 'xcodebuild build' first"

  ! logged_a_test_build; check $? "never invoked 'xcodebuild test'"

  ! logged_empty_destination; check $? "never passed an empty -destination"
  if logged_empty_destination; then
    printf '         offending argv (tabs shown as |): %s\n' \
      "$(grep -e "$(printf '^test\t')" "$LOG" | head -1 | tr '\t' '|')"
  fi

  grep -q 'IOS_GATE_UDID is unset' "$OUT"; check $? "printed the guard's error message"
done

# ---- 2. when the udid IS set, the destination is unchanged ----------------------
# Pins the deliberate behaviour W0-04 must not disturb: an explicit clone udid,
# never 'booted' and never a simctl guess.
printf '  tier %-6s (IOS_GATE_UDID set)\n' "unit"
export IOS_GATE_UDID="$FAKE_UDID"
run_gate unit

gate_succeeded; check $? "exits zero (got $GATE_STATUS)"

logged_a_test_build; check $? "invoked 'xcodebuild test'"

log_has "$(printf -- '-destination\tplatform=iOS Simulator,id=%s\t' "$FAKE_UDID")"
check $? "destination is platform=iOS Simulator,id=\$IOS_GATE_UDID"

# ---- verdict --------------------------------------------------------------------
if [[ $failures -ne 0 ]]; then
  printf '\nios-gate-guard: %d assertion(s) FAILED\n' "$failures" >&2
  exit 1
fi
printf '\nios-gate-guard: all assertions passed\n'
