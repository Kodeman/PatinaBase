#!/usr/bin/env bash
# bootstrap-worktree.test.sh — proves scripts/bootstrap-worktree.sh does what a
# fresh Patina lane or CI checkout needs. Needs no Xcode, no simulator and no
# network; run it anywhere:
#
#   bash apps/mobile/Patina/scripts/bootstrap-worktree.test.sh
#
# It stands up a throwaway detached git worktree, checks out ONLY
# apps/mobile/Patina into it (the pathspec form is a few MB and instant, where a
# full checkout of this monorepo is ~1.1 GB), and asserts, in order:
#
#   1. the fresh worktree has NEITHER Secrets.swift NOR Generated/GitCommit.swift
#      — both are gitignored, so neither is ever checked out. That is the bug.
#   2. running the bootstrap there creates both. Secrets.swift is byte-identical
#      to Secrets.example.swift; GitCommit.swift compiles to an EMPTY sha.
#   3. the placeholder carries no real commit SHA — the file is gitignored
#      precisely so a hash can never be committed, and the placeholder must not
#      smuggle one back in.
#   4. the placeholder is byte-identical to what the "Stamp Git SHA" phase in
#      Patina.xcodeproj writes for a non-Debug build, reconstructed from the
#      pbxproj itself. This is the drift guard: change the generated shape in
#      the project and this test fails until the placeholder follows.
#   5. a second run leaves a MODIFIED Secrets.swift and a MODIFIED
#      GitCommit.swift byte-for-byte untouched. This is the one that matters on
#      a developer's machine: Secrets.swift there holds a real anon key and the
#      gate runs this script before every xcodebuild.
#   6. both consumers still call the bootstrap, so the hook cannot quietly rot.
#   7. the throwaway worktree is gone afterwards.
#
# What this test deliberately does NOT do is compile. The Patina target depends
# on the local package ../PatinaDesignKit and on three remote SPM packages, so a
# pathspec checkout of apps/mobile/Patina alone can never build and a full one
# needs the network. The compile proof is a real `xcodebuild build` in a fresh
# worktree after bootstrapping; SQ-188 recorded that run. This test is the
# regression guard that keeps the bootstrap able to deliver it.
#
# The script under test is copied in from the working tree rather than read out
# of HEAD, so this tests the edit you are making, not the last commit.
set -euo pipefail
cd "$(dirname "$0")/.."

PATINA_DIR="$PWD"
REPO_ROOT="$(git rev-parse --show-toplevel)"
case "$PATINA_DIR" in
  "$REPO_ROOT"/*) REL="${PATINA_DIR#"$REPO_ROOT"/}" ;;
  *) echo "✘ $PATINA_DIR is not inside $REPO_ROOT" >&2; exit 1 ;;
esac

pass=0
ok()   { pass=$((pass + 1)); echo "  ✔ $1"; }
fail() { echo "  ✘ $1" >&2; exit 1; }

SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/patina-bootstrap-test.XXXXXX")"
WT="$SCRATCH/fresh-worktree"

# Only ever removes the worktree this run created, by its mktemp path. Never
# `git worktree prune` — the repo is shared with concurrent agent worktrees.
cleanup() {
  if ! git -C "$PATINA_DIR" worktree remove --force "$WT" >/dev/null 2>&1; then
    echo "  ! 'git worktree remove $WT' failed; the entry is left registered and prunable" >&2
  fi
  rm -rf "$SCRATCH"
}
trap cleanup EXIT

echo "bootstrap-worktree.test.sh"

git -C "$PATINA_DIR" worktree add --detach --no-checkout "$WT" HEAD >/dev/null
git -C "$WT" checkout HEAD -- "$REL"

WT_PATINA="$WT/$REL"
WT_CONFIG="$WT_PATINA/Patina/App/Configuration"
WT_SECRETS="$WT_CONFIG/Secrets.swift"
WT_GIT_COMMIT="$WT_PATINA/Patina/Generated/GitCommit.swift"

# 1 — the premise
[ -f "$WT_CONFIG/Secrets.example.swift" ] || fail "fresh worktree has no Secrets.example.swift to copy from"
if [ -e "$WT_SECRETS" ]; then fail "fresh worktree already had Secrets.swift — premise broken"; fi
if [ -e "$WT_GIT_COMMIT" ]; then fail "fresh worktree already had Generated/GitCommit.swift — premise broken"; fi
ok "fresh worktree has neither Secrets.swift nor Generated/GitCommit.swift"

cp "$PATINA_DIR/scripts/bootstrap-worktree.sh" "$WT_PATINA/scripts/bootstrap-worktree.sh"
chmod +x "$WT_PATINA/scripts/bootstrap-worktree.sh"

# 2 — first run restores both
"$WT_PATINA/scripts/bootstrap-worktree.sh" >/dev/null
[ -f "$WT_SECRETS" ] || fail "first run did not create Secrets.swift"
cmp -s "$WT_SECRETS" "$WT_CONFIG/Secrets.example.swift" \
  || fail "created Secrets.swift does not match Secrets.example.swift"
[ -f "$WT_GIT_COMMIT" ] || fail "first run did not create Generated/GitCommit.swift"
grep -q 'public enum GitCommit' "$WT_GIT_COMMIT" \
  || fail "created GitCommit.swift does not declare 'public enum GitCommit'"
grep -q 'public static let sha: String = ""' "$WT_GIT_COMMIT" \
  || fail "created GitCommit.swift does not declare an empty sha"
ok "first run created Secrets.swift and Generated/GitCommit.swift"

# 3 — no real hash smuggled into the placeholder
placeholder_sha="$(sed -n 's/.*public static let sha: String = "\(.*\)".*/\1/p' "$WT_GIT_COMMIT")"
[ -z "$placeholder_sha" ] || fail "placeholder carries a SHA ('$placeholder_sha'); it must be empty"
ok "placeholder carries no commit SHA"

# 4 — drift guard against the "Stamp Git SHA" phase in the pbxproj
PBXPROJ="$WT_PATINA/Patina.xcodeproj/project.pbxproj"
grep -qF 'SRCROOT}/Patina/Generated/GitCommit.swift' "$PBXPROJ" \
  || fail "the stamp phase no longer writes Patina/Generated/GitCommit.swift"
# The shellScript is one escaped pbxproj string on a single line. Pull it out
# and undo the escaping in ONE left-to-right pass — two passes would turn the
# script's own literal '\\n' (in printf '%s\n') into a stray backslash.
STAMP_SH="$SCRATCH/stamp.sh"
grep -F 'shellScript = "set -e\nOUT=' "$PBXPROJ" \
  | sed -e 's/^[[:space:]]*shellScript = "//' -e 's/";$//' \
  | perl -pe 's/\\(.)/ $1 eq "n" ? "\n" : ($1 eq "t" ? "\t" : $1) /ge' > "$STAMP_SH"
[ -s "$STAMP_SH" ] || fail "could not extract the 'Stamp Git SHA' shellScript from the pbxproj"
STAMP_ROOT="$SCRATCH/stamp-root"
mkdir -p "$STAMP_ROOT"
( cd "$STAMP_ROOT" && SRCROOT="$STAMP_ROOT" CONFIGURATION="Release" /bin/sh "$STAMP_SH" )
STAMPED="$STAMP_ROOT/Patina/Generated/GitCommit.swift"
[ -f "$STAMPED" ] || fail "the extracted stamp phase produced no file"
cmp -s "$WT_GIT_COMMIT" "$STAMPED" \
  || fail "placeholder differs from the stamp phase's Release output:$(printf '\n')$(diff "$WT_GIT_COMMIT" "$STAMPED" || true)"
ok "placeholder is byte-identical to the stamp phase's Release output"

# 5 — real local edits survive a second run
# printf, not a here-doc: a here-doc needs a writable temp file, which a
# sandboxed runner may refuse.
printf 'enum Secrets { static let supabaseAnonKey = "SENTINEL_STANDING_IN_FOR_A_REAL_KEY" }\n' \
  > "$WT_SECRETS"
printf 'public enum GitCommit { public static let sha: String = "SENTINEL" }\n' \
  > "$WT_GIT_COMMIT"
before_secrets="$(shasum "$WT_SECRETS" | cut -d' ' -f1)"
before_commit="$(shasum "$WT_GIT_COMMIT" | cut -d' ' -f1)"
"$WT_PATINA/scripts/bootstrap-worktree.sh" >/dev/null
[ "$before_secrets" = "$(shasum "$WT_SECRETS" | cut -d' ' -f1)" ] \
  || fail "second run clobbered an existing Secrets.swift"
[ "$before_commit" = "$(shasum "$WT_GIT_COMMIT" | cut -d' ' -f1)" ] \
  || fail "second run clobbered an existing Generated/GitCommit.swift"
ok "second run left both modified files untouched"

# 6 — the hook is still wired into everything that runs xcodebuild. Read from
# the working tree, like the script under test: this must hold for the edit you
# are making, not for whatever HEAD happens to say.
grep -qF 'bootstrap-worktree.sh' "$PATINA_DIR/scripts/ios-gate.sh" \
  || fail "ios-gate.sh no longer calls bootstrap-worktree.sh"
grep -qF 'bootstrap-worktree.sh' "$PATINA_DIR/scripts/archive-testflight.sh" \
  || fail "archive-testflight.sh no longer calls bootstrap-worktree.sh"
ok "ios-gate.sh and archive-testflight.sh both call the bootstrap"

# 7 — cleanup actually cleans up
scratch_name="$(basename "$SCRATCH")"   # unique per run; survives /tmp -> /private/tmp
cleanup
trap - EXIT
if [ -e "$WT" ]; then fail "throwaway worktree still on disk at $WT"; fi
if git -C "$PATINA_DIR" worktree list | grep -qF "$scratch_name"; then
  fail "throwaway worktree still registered with git"
fi
ok "throwaway worktree removed and deregistered"

echo "✔ bootstrap-worktree ($pass assertions)"
