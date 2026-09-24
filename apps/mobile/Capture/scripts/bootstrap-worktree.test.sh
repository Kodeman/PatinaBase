#!/usr/bin/env bash
# bootstrap-worktree.test.sh — proves scripts/bootstrap-worktree.sh does what a
# fresh Field lane or CI checkout needs.
#
# It stands up a throwaway detached git worktree, checks out ONLY
# apps/mobile/Capture into it (a full checkout of this monorepo is ~1.1 GB and
# ~7s; the pathspec form is ~4 MB and instant), and asserts, in order:
#
#   1. the fresh worktree has no Secrets.swift — it is gitignored, so it is
#      never checked out. This is the bug the bootstrap exists to fix.
#   2. running the bootstrap there creates Secrets.swift, byte-identical to
#      Secrets.example.swift.
#   3. it does NOT create Secrets.xcconfig — BuildSettings.xcconfig `#include?`s
#      that file optionally and commits a working public PostHog key, so
#      inventing a placeholder override would make things worse, not better.
#   4. a second run leaves a MODIFIED Secrets.swift byte-for-byte untouched.
#      This is the one that matters on a developer's machine: the file there
#      holds a real anon key and the gate runs this script before every build.
#   5. the throwaway worktree is gone afterwards.
#
# The script under test is copied in from the working tree rather than read out
# of HEAD, so this tests the edit you are making, not the last commit.
set -euo pipefail
cd "$(dirname "$0")/.."

CAPTURE_DIR="$PWD"
REPO_ROOT="$(git rev-parse --show-toplevel)"
case "$CAPTURE_DIR" in
  "$REPO_ROOT"/*) REL="${CAPTURE_DIR#"$REPO_ROOT"/}" ;;
  *) echo "✘ $CAPTURE_DIR is not inside $REPO_ROOT" >&2; exit 1 ;;
esac

pass=0
ok()   { pass=$((pass + 1)); echo "  ✔ $1"; }
fail() { echo "  ✘ $1" >&2; exit 1; }

SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/capture-bootstrap-test.XXXXXX")"
WT="$SCRATCH/fresh-worktree"

# Only ever removes the worktree this run created, by its mktemp path. Never
# `git worktree prune` — the repo is shared with concurrent agent worktrees.
cleanup() {
  if ! git -C "$CAPTURE_DIR" worktree remove --force "$WT" >/dev/null 2>&1; then
    echo "  ! 'git worktree remove $WT' failed; the entry is left registered and prunable" >&2
  fi
  rm -rf "$SCRATCH"
}
trap cleanup EXIT

echo "bootstrap-worktree.test.sh"

git -C "$CAPTURE_DIR" worktree add --detach --no-checkout "$WT" HEAD >/dev/null
git -C "$WT" checkout HEAD -- "$REL"

WT_CAPTURE="$WT/$REL"
WT_CONFIG="$WT_CAPTURE/Capture/App/Configuration"
WT_SECRETS="$WT_CONFIG/Secrets.swift"

# 1 — the premise
[ -f "$WT_CONFIG/Secrets.example.swift" ] || fail "fresh worktree has no Secrets.example.swift to copy from"
if [ -e "$WT_SECRETS" ]; then fail "fresh worktree already had Secrets.swift — premise broken"; fi
ok "fresh worktree has no Secrets.swift (gitignored, never checked out)"

cp "$CAPTURE_DIR/scripts/bootstrap-worktree.sh" "$WT_CAPTURE/scripts/bootstrap-worktree.sh"
chmod +x "$WT_CAPTURE/scripts/bootstrap-worktree.sh"

# 2 — first run restores it
"$WT_CAPTURE/scripts/bootstrap-worktree.sh" >/dev/null
[ -f "$WT_SECRETS" ] || fail "first run did not create Secrets.swift"
cmp -s "$WT_SECRETS" "$WT_CONFIG/Secrets.example.swift" \
  || fail "created Secrets.swift does not match Secrets.example.swift"
ok "first run created Secrets.swift from Secrets.example.swift"

# 3 — Secrets.xcconfig is intentionally left alone
if [ -e "$WT_CONFIG/Secrets.xcconfig" ]; then
  fail "bootstrap created Secrets.xcconfig; BuildSettings.xcconfig #include?s it optionally and commits a working key"
fi
ok "left Secrets.xcconfig absent (optional #include?, committed key works)"

# 4 — a real key survives a second run
# printf, not a here-doc: a here-doc needs a writable temp file, which a
# sandboxed runner may refuse.
printf 'enum Secrets { static let supabaseAnonKey = "SENTINEL_STANDING_IN_FOR_A_REAL_KEY" }\n' \
  > "$WT_SECRETS"
before="$(shasum "$WT_SECRETS" | cut -d' ' -f1)"
"$WT_CAPTURE/scripts/bootstrap-worktree.sh" >/dev/null
after="$(shasum "$WT_SECRETS" | cut -d' ' -f1)"
[ "$before" = "$after" ] || fail "second run clobbered an existing Secrets.swift"
ok "second run left a modified Secrets.swift untouched"

# 5 — cleanup actually cleans up
scratch_name="$(basename "$SCRATCH")"   # unique per run; survives /tmp -> /private/tmp
cleanup
trap - EXIT
if [ -e "$WT" ]; then fail "throwaway worktree still on disk at $WT"; fi
if git -C "$CAPTURE_DIR" worktree list | grep -qF "$scratch_name"; then
  fail "throwaway worktree still registered with git"
fi
ok "throwaway worktree removed and deregistered"

echo "✔ bootstrap-worktree ($pass assertions)"
