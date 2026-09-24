#!/usr/bin/env bash
# bootstrap-worktree.sh — restore the gitignored files a fresh checkout of
# apps/mobile/Patina cannot compile without. Safe to run from anywhere, any
# number of times; it never overwrites a file that is already on disk.
#
# Two files are gitignored (.gitignore) AND required at compile time:
#
#   Patina/App/Configuration/Secrets.swift
#     APIConfiguration reads `Secrets.supabaseAnonKey` and PostHogService reads
#     `Secrets.postHogAPIKey` — compile-time symbols, not runtime lookups.
#     Restored from the committed Secrets.example.swift, whose anon key is the
#     empty string: enough to compile and run the suites, not enough to reach
#     Supabase. Paste the real key in afterwards; this script won't clobber it.
#
#   Patina/Generated/GitCommit.swift
#     AppConfiguration.gitCommit reads `GitCommit.sha`.
#
# Why the "Stamp Git SHA" build phase is not enough for GitCommit.swift, even
# though it declares the file as its output and is already ordered AHEAD of
# Sources in the Patina target: the target takes its sources from a
# PBXFileSystemSynchronizedRootGroup (`Patina/`). Xcode enumerates that folder
# when it PLANS the build, before any phase runs. A file that is not on disk at
# plan time is not a member of Sources for that build, so the first build of a
# fresh checkout fails with "cannot find 'GitCommit' in scope" even though the
# stamp phase wrote the file seconds earlier — and then succeeds on the second
# build, which is exactly the confusing shape this defect had. No re-ordering of
# build phases can fix that; the file has to exist before xcodebuild is invoked.
# Hence a placeholder written here rather than a committed file: the generated
# file stays gitignored, so a real SHA can never be committed by accident.
#
# The placeholder's sha is the EMPTY string — byte-identical to what the stamp
# phase itself writes for a non-Debug build, so a Release build short-circuits
# on it instead of rewriting. AppConfiguration maps "" to nil, so a build that
# somehow never re-stamps reports no SHA rather than a stale or wrong one.
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIG_DIR="Patina/App/Configuration"
SECRETS="$CONFIG_DIR/Secrets.swift"
SECRETS_EXAMPLE="$CONFIG_DIR/Secrets.example.swift"
GENERATED_DIR="Patina/Generated"
GIT_COMMIT="$GENERATED_DIR/GitCommit.swift"

if [ ! -f "$SECRETS" ]; then
  if [ ! -f "$SECRETS_EXAMPLE" ]; then
    echo "✘ bootstrap: $SECRETS_EXAMPLE is missing — cannot restore $SECRETS" >&2
    exit 1
  fi
  cp "$SECRETS_EXAMPLE" "$SECRETS"
  echo "✔ bootstrap: created $SECRETS from Secrets.example.swift"
  echo "  Its anon key is EMPTY — the app compiles but cannot sign in until you"
  echo "  paste the real Strata anon key into it."
fi

if [ ! -f "$GIT_COMMIT" ]; then
  mkdir -p "$GENERATED_DIR"
  # printf, not a here-doc: a here-doc needs a writable temp file, which a
  # sandboxed runner may refuse. Keep this byte-identical to the non-Debug
  # output of the "Stamp Git SHA" phase in Patina.xcodeproj/project.pbxproj.
  printf '%s\n' \
    '// GENERATED — rewritten by the "Stamp Git SHA" Run Script phase.' \
    '// Do not edit by hand.' \
    '' \
    'import Foundation' \
    '' \
    'public enum GitCommit {' \
    '    public static let sha: String = ""' \
    '}' \
    > "$GIT_COMMIT"
  echo "✔ bootstrap: created $GIT_COMMIT with an empty SHA"
  echo "  The \"Stamp Git SHA\" phase rewrites it with the real short SHA on the"
  echo "  next Debug build."
fi
