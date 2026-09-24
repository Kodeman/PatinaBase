#!/usr/bin/env bash
#
# ios-gate.sh — local verification gate for the Patina iOS parallel-delivery program.
#
# There is no iOS CI. This script is the substitute. Run it on your worktree
# BEFORE opening a PR, and again by the merger before fast-merging to `main`.
#
# Tiers:
#   build               compile the app (generic iOS Simulator, no signing)
#   unit                build + run PatinaTests   (Swift Testing)
#   ui                  build + run PatinaUITests (XCTest UI)
#   release             compile Release for a generic iOS device (no signing)
#   archive             Release archive with automatic signing — KODY'S MACHINE ONLY
#   lint                full SwiftLint over the project
#   lint-delta [BASE]   FAIL if a touched file gained SwiftLint warnings vs BASE
#                       (BASE defaults to `main`; compares per-file counts)
#   all                 build + unit + lint-delta   (standard codemod / new-file gate)
#
# `release` is deliberately NOT part of `all`: it is a whole-module optimised
# compile of ~92k LOC and `all` runs on every fix round in every concurrent
# lane. Wire it in beside `all`, not inside it, until L2-G measures the cost.
# `archive` is in neither — it needs an authenticated Xcode account, network
# round trips to App Store Connect and a distribution keychain that can prompt.
#
# The unit/ui/all tiers require IOS_GATE_UDID. See sim_destination().
# That guard is pinned by scripts/ios-gate-guard.test.sh, which needs no
# simulator, no Xcode and no network:
#   bash apps/mobile/Patina/scripts/ios-gate-guard.test.sh
#
# Exit non-zero on any failure. Designed to be safe to run from any CWD.
set -euo pipefail

# ---- locate the project regardless of CWD -------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"          # apps/mobile/Patina
REPO_ROOT="$(git -C "$PROJECT_DIR" rev-parse --show-toplevel)"
PROJECT="$PROJECT_DIR/Patina.xcodeproj"
SCHEME="Patina"
CONFIG="$PROJECT_DIR/.swiftlint.yml"
PROJECT_DIR_REL="${PROJECT_DIR#"$REPO_ROOT"/}"       # apps/mobile/Patina

# --- per-worktree DerivedData: six lanes compiling into one shared tree -------
# produces transient failures the Daily Return already paid for.
DERIVED="$PROJECT_DIR/.build/DerivedData"

# ---- every xcodebuild in this file goes through here --------------------------
# The bootstrap call lives INSIDE the funnel, not in main(), so no tier can be
# added later that reaches xcodebuild without it. It restores the two gitignored
# files a fresh worktree cannot compile without (Secrets.swift and
# Generated/GitCommit.swift) and is a no-op once they exist — see
# scripts/bootstrap-worktree.sh for why the "Stamp Git SHA" phase cannot do it.
run_xcb() {
  "$SCRIPT_DIR/bootstrap-worktree.sh"
  if command -v xcbeautify >/dev/null 2>&1; then
    set -o pipefail; "$@" | xcbeautify
  else
    "$@"
  fi
}

# --- the destination is explicit, or the gate refuses to guess -----------------
# Before this, `simctl list … | head -1`, which with six lane clones named
# ff-w1-* plus the protected review device 973D1724-90BF-4A0A-B02D-481D561547B3
# present will happily run one lane's tests on another lane's clone. That is the
# program's Hard Rule 1, broken by the gate that enforces it.
#
# Echoes the destination and RETURNS a status — it must never `exit`. This is only
# ever run as `$(sim_destination)`, where an `exit` kills the command
# substitution's subshell and not the gate. The assignment then carries status 2,
# but bash suppresses `set -e` inside a function invoked from a NON-FINAL position
# of an `&&` list — so `all` (where cmd_test is followed by cmd_lint_delta) sailed
# straight past the failed assignment into `xcodebuild test -destination ""`, while
# `unit`/`ui` (cmd_test last) aborted and made the guard look sound.
# Every caller must therefore test the status. ios-gate-guard.test.sh pins this.
sim_destination() {
  if [[ -n "${IOS_GATE_UDID:-}" ]]; then
    echo "platform=iOS Simulator,id=$IOS_GATE_UDID"; return 0
  fi
  echo "ERROR: IOS_GATE_UDID is unset. The unit/ui/all tiers need an explicit clone udid." >&2
  echo "       export IOS_GATE_UDID=<this lane's own clone>  (never 'booted')"        >&2
  return 2
}

cmd_build() {
  echo "▶ build (generic iOS Simulator)"
  run_xcb xcodebuild build \
    -project "$PROJECT" -scheme "$SCHEME" -configuration Debug \
    -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath "$DERIVED" \
    CODE_SIGNING_ALLOWED=NO
}

cmd_test() {
  local target="$1"; local dest
  # `|| return` is load-bearing, not defensive: it is the only thing that stops
  # this function in tiers where errexit is suppressed (see sim_destination).
  dest="$(sim_destination)" || return $?
  echo "▶ test $target ($dest)"
  run_xcb xcodebuild test \
    -project "$PROJECT" -scheme "$SCHEME" -configuration Debug \
    -destination "$dest" -only-testing:"$target" \
    -derivedDataPath "$DERIVED" \
    CODE_SIGNING_ALLOWED=NO
}

cmd_release() {
  echo "▶ release compile (generic iOS device, no signing)"
  run_xcb xcodebuild build \
    -project "$PROJECT" -scheme "$SCHEME" -configuration Release \
    -destination 'generic/platform=iOS' \
    -derivedDataPath "$DERIVED" \
    CODE_SIGNING_ALLOWED=NO
}

cmd_archive() {
  echo "▶ archive (Release, automatic signing) — Kody's machine only"
  run_xcb xcodebuild archive \
    -project "$PROJECT" -scheme "$SCHEME" -configuration Release \
    -destination 'generic/platform=iOS' \
    -archivePath "$PROJECT_DIR/.build/archives/Patina.xcarchive" \
    -derivedDataPath "$DERIVED" \
    -allowProvisioningUpdates
}

cmd_lint() {
  echo "▶ swiftlint (full)"
  ( cd "$PROJECT_DIR" && swiftlint lint --quiet --config "$CONFIG" )
}

# lint-delta: fail only when a TOUCHED file gained warnings vs BASE (per-file).
cmd_lint_delta() {
  local base="${1:-main}"
  local merge_base; merge_base="$(git -C "$REPO_ROOT" merge-base HEAD "$base" 2>/dev/null || true)"
  if [[ -z "$merge_base" ]]; then
    echo "⚠ lint-delta: cannot resolve merge-base with '$base'; running full lint instead"
    cmd_lint; return $?
  fi

  # touched swift files under the project, project-relative
  local touched
  touched="$(git -C "$REPO_ROOT" diff --name-only "$merge_base"...HEAD -- '*.swift' \
    | grep -E "^$PROJECT_DIR_REL/" | sed "s#^$PROJECT_DIR_REL/##" || true)"
  if [[ -z "$touched" ]]; then
    echo "✓ lint-delta: no touched Swift files under $PROJECT_DIR_REL"; return 0
  fi

  # NB: expand $tmp NOW (double quotes) — with a deferred single-quote trap,
  # the RETURN trap fires after the `local` is out of scope and `set -u`
  # aborts the whole gate with "tmp: unbound variable" even when every tier
  # passed (first tripped by R27 Wave 0, which touched Patina Swift files).
  local tmp; tmp="$(mktemp -d)"; trap "rm -rf '$tmp'" RETURN
  # HEAD counts — only files that still exist at HEAD. Passing a deleted
  # file's path makes swiftlint silently fall back to linting the ENTIRE
  # project, which poisons the delta with hundreds of unrelated files
  # (first tripped by Wave 1, which deleted DailyRoomEmptyState.swift).
  local head_files=""; local hf
  while IFS= read -r hf; do [[ -f "$PROJECT_DIR/$hf" ]] && head_files+="$hf "; done <<< "$touched"
  if [[ -n "${head_files// }" ]]; then
    ( cd "$PROJECT_DIR" && swiftlint lint --quiet --config "$CONFIG" --reporter json $head_files ) \
      > "$tmp/head.json" 2>/dev/null || true
  else
    echo "[]" > "$tmp/head.json"
  fi

  # BASE counts via detached worktree
  local wt="$tmp/base"
  if git -C "$REPO_ROOT" worktree add --detach -q "$wt" "$merge_base" 2>/dev/null; then
    local base_proj="$wt/$PROJECT_DIR_REL"
    # only files that existed at merge_base
    local base_files=""; local f
    while IFS= read -r f; do [[ -f "$base_proj/$f" ]] && base_files+="$f "; done <<< "$touched"
    if [[ -n "${base_files// }" ]]; then
      ( cd "$base_proj" && swiftlint lint --quiet --config "$CONFIG" --reporter json $base_files ) \
        > "$tmp/base.json" 2>/dev/null || true
    else
      echo "[]" > "$tmp/base.json"
    fi
    git -C "$REPO_ROOT" worktree remove --force "$wt" 2>/dev/null || true
  else
    echo "⚠ lint-delta: could not create base worktree; treating base warnings as 0 (strict)"
    echo "[]" > "$tmp/base.json"
  fi
  [[ -s "$tmp/head.json" ]] || echo "[]" > "$tmp/head.json"

  python3 - "$tmp/head.json" "$tmp/base.json" "$PROJECT_DIR" <<'PY'
import json, sys, os
head_p, base_p, proj = sys.argv[1], sys.argv[2], sys.argv[3]
def counts(path):
    try: data = json.load(open(path))
    except Exception: return {}
    c = {}
    for v in data:
        if str(v.get("severity","")).lower() != "warning": continue
        f = v.get("file","")
        rel = os.path.relpath(f, proj) if os.path.isabs(f) else f
        rel = rel.split("/apps/mobile/Patina/")[-1]  # normalize across worktrees
        c[rel] = c.get(rel, 0) + 1
    return c
h, b = counts(head_p), counts(base_p)
regressions = [(f, b.get(f,0), n) for f, n in h.items() if n > b.get(f, 0)]
if regressions:
    print("✗ lint-delta: NEW SwiftLint warnings in touched files:")
    for f, was, now in sorted(regressions):
        print(f"    {f}: {was} → {now}")
    sys.exit(1)
print("✓ lint-delta: no new warnings in touched files")
PY
}

main() {
  local tier="${1:-all}"; shift || true
  case "$tier" in
    build)       cmd_build ;;
    unit)        cmd_build && cmd_test PatinaTests ;;
    ui)          cmd_build && cmd_test PatinaUITests ;;
    release)     cmd_release ;;
    archive)     cmd_archive ;;
    lint)        cmd_lint ;;
    lint-delta)  cmd_lint_delta "${1:-main}" ;;
    all)         cmd_build && cmd_test PatinaTests && cmd_lint_delta "${1:-main}" ;;
    *) echo "usage: $0 {build|unit|ui|release|archive|lint|lint-delta [BASE]|all}" >&2; exit 64 ;;
  esac
}
main "$@"
