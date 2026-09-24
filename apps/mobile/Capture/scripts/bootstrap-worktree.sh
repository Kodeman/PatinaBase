#!/usr/bin/env bash
# bootstrap-worktree.sh — restore the gitignored files a fresh checkout cannot
# compile without. Safe to run anywhere, any number of times.
#
# Why this exists: `Capture/App/Configuration/Secrets.swift` is gitignored (see
# .gitignore), but `AppConfiguration.supabaseAnonKey` reads `Secrets.supabaseAnonKey`
# — a compile-time symbol, not a runtime lookup. `generate_project.rb` globs
# `**/*.swift` off disk, so a file that is not there is simply not in the target
# and the app does not build. A brand-new worktree or a CI checkout therefore
# fails to compile for reasons that have nothing to do with its changes; the
# main checkout only works because the file happens to be sitting there.
#
# Secrets.xcconfig is deliberately NOT bootstrapped. BuildSettings.xcconfig
# commits the real (public, by design) PostHog project key and pulls the
# gitignored override in with `#include?` — the `?` makes it optional, so a
# checkout without Secrets.xcconfig builds fine. Creating one from the example
# would only shadow the working committed key with a placeholder.
#
# The restored Secrets.swift carries the example's PLACEHOLDER anon key: enough
# to compile and to run the test suites, not enough to talk to Supabase. Paste
# the real key in afterwards — this script never overwrites an existing file.
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIG_DIR="Capture/App/Configuration"
SECRETS="$CONFIG_DIR/Secrets.swift"
SECRETS_EXAMPLE="$CONFIG_DIR/Secrets.example.swift"

if [ -f "$SECRETS" ]; then
  exit 0
fi

if [ ! -f "$SECRETS_EXAMPLE" ]; then
  echo "✘ bootstrap: $SECRETS_EXAMPLE is missing — cannot restore $SECRETS" >&2
  exit 1
fi

cp "$SECRETS_EXAMPLE" "$SECRETS"
echo "✔ bootstrap: created $SECRETS from Secrets.example.swift"
echo "  It holds the PLACEHOLDER anon key — the app compiles but cannot sign in"
echo "  until you paste the real Strata anon key into it."
