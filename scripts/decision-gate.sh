#!/usr/bin/env bash
#
# decision-gate.sh — verification gate for the Decision Framework delivery program.
# Mirrors the iOS ios-gate.sh model: a single entrypoint each agent runs in its
# worktree before fast-merging to main. See docs/code-review/patina-decision-delivery-plan.md
#
# Usage:
#   scripts/decision-gate.sh <subcommand>
#
# Subcommands:
#   unit        Supabase hook unit tests (vitest)
#   types       Regenerate database.types.ts from local DB + tsc --noEmit (turbo)
#   lint        eslint across the workspace (turbo); LINT_DELTA=1 lints only changed files
#   e2e         Playwright decisions specs (needs local Supabase + dev server — see below)
#   build       Full turbo build
#   ios         DesignerSmoke UI tests via xcodebuild (territory T4)
#   web         unit + types + lint + build           (default for web territories T1/T2/T3/T6)
#   all         web + e2e
#
# Env:
#   SUPABASE_DB_URL   defaults to the local stack (postgresql://postgres:postgres@127.0.0.1:54322/postgres)
#   IOS_SIM           simulator name for `ios` (default: "iPhone 16 Pro")
#   LINT_DELTA=1      lint only files changed vs origin/main (per-file, no new findings)
#
# e2e prerequisites (run once in separate terminals before `e2e`/`all`):
#   pnpm supabase:start && pnpm supabase:reset      # seeds 5 decisions on designer@patina.dev
#   pnpm dev:designer                               # serves :3000
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

: "${SUPABASE_DB_URL:=postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
: "${IOS_SIM:=iPhone 16 Pro}"
export SUPABASE_DB_URL

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
run()  { bold "▶ $*"; "$@"; }

fail() { printf '\033[31m✗ gate failed: %s\033[0m\n' "$*" >&2; exit 1; }

gate_unit()  { run pnpm --filter @patina/supabase test || fail "unit"; }
gate_types() { run pnpm db:generate || fail "db:generate (is local Supabase up?)"; run pnpm type-check || fail "type-check"; }
gate_build() { run pnpm build || fail "build"; }

gate_lint() {
  if [ "${LINT_DELTA:-0}" = "1" ]; then
    # Per-file delta: only lint files changed vs origin/main; no NEW findings allowed.
    mapfile -t files < <(git diff --name-only origin/main...HEAD -- '*.ts' '*.tsx' 2>/dev/null || true)
    if [ "${#files[@]}" -eq 0 ]; then bold "no changed ts/tsx vs origin/main — lint-delta skipped"; return 0; fi
    bold "lint-delta on ${#files[@]} changed file(s)"
    run npx eslint "${files[@]}" || fail "lint-delta"
  else
    run pnpm lint || fail "lint"
  fi
}

gate_e2e() {
  # Playwright config testDir = e2e/ in the designer portal; pass the decisions/ folder.
  run pnpm --filter @patina/designer-portal test:e2e decisions/ || fail "e2e"
}

gate_ios() {
  run xcodebuild test \
    -scheme Patina \
    -only-testing:PatinaUITests/DesignerSmokeUITests \
    -destination "platform=iOS Simulator,name=${IOS_SIM}" \
    || fail "ios"
}

cmd="${1:-web}"
case "$cmd" in
  unit)  gate_unit ;;
  types) gate_types ;;
  lint)  gate_lint ;;
  build) gate_build ;;
  e2e)   gate_e2e ;;
  ios)   gate_ios ;;
  web)   gate_unit; gate_types; gate_lint; gate_build ;;
  all)   gate_unit; gate_types; gate_lint; gate_build; gate_e2e ;;
  *) echo "usage: scripts/decision-gate.sh <unit|types|lint|e2e|build|ios|web|all>" >&2; exit 2 ;;
esac

bold "✓ decision-gate: ${cmd} passed"
