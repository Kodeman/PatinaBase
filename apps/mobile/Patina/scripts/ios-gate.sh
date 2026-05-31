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
#   lint                full SwiftLint over the project
#   lint-delta [BASE]   FAIL if a touched file gained SwiftLint warnings vs BASE
#                       (BASE defaults to `main`; compares per-file counts)
#   all                 build + unit + lint-delta   (standard codemod / new-file gate)
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

# ---- pretty-printer (optional) ------------------------------------------------
run_xcb() {
  if command -v xcbeautify >/dev/null 2>&1; then
    set -o pipefail; "$@" | xcbeautify
  else
    "$@"
  fi
}

# ---- resolve a concrete booted-or-bootable iOS simulator for test tiers --------
sim_destination() {
  local udid
  udid="$(xcrun simctl list devices available 2>/dev/null \
    | grep -iE 'iPhone (17|16|Air)' | grep -oE '[0-9A-F-]{36}' | head -1 || true)"
  if [[ -z "$udid" ]]; then
    echo "ERROR: no available iPhone simulator found" >&2; exit 2
  fi
  echo "platform=iOS Simulator,id=$udid"
}

cmd_build() {
  echo "▶ build (generic iOS Simulator)"
  run_xcb xcodebuild build \
    -project "$PROJECT" -scheme "$SCHEME" -configuration Debug \
    -destination 'generic/platform=iOS Simulator' \
    CODE_SIGNING_ALLOWED=NO
}

cmd_test() {
  local target="$1"; local dest; dest="$(sim_destination)"
  echo "▶ test $target ($dest)"
  run_xcb xcodebuild test \
    -project "$PROJECT" -scheme "$SCHEME" -configuration Debug \
    -destination "$dest" -only-testing:"$target" \
    CODE_SIGNING_ALLOWED=NO
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

  local tmp; tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' RETURN
  # HEAD counts
  ( cd "$PROJECT_DIR" && swiftlint lint --quiet --config "$CONFIG" --reporter json $touched ) \
    > "$tmp/head.json" 2>/dev/null || true

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
    lint)        cmd_lint ;;
    lint-delta)  cmd_lint_delta "${1:-main}" ;;
    all)         cmd_build && cmd_test PatinaTests && cmd_lint_delta "${1:-main}" ;;
    *) echo "usage: $0 {build|unit|ui|lint|lint-delta [BASE]|all}" >&2; exit 64 ;;
  esac
}
main "$@"
