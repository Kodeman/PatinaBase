#!/usr/bin/env bash
#
# run-eval.sh — the frozen invocation surface for the Aesthete eval harness
# (contract: scripts/aesthete-eval/run-eval.md, Wave 0A; implementation:
# run-eval.ts, Wave 3D — deno, zero-install alongside the edge-fn toolchain).
#
#   bash scripts/aesthete-eval/run-eval.sh <suite> [--json] [--out <dir>]
#
# Suites: personas | g1 | g2 | backtest | replay | all
# Env:    SUPABASE_REST_URL, SUPABASE_ANON_KEY, WALK_BUDGET_MS,
#         EVAL_MATCH_SAMPLES, AESTHETE_EVAL_OUT — see run-eval.md.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v deno >/dev/null 2>&1; then
  echo "deno not installed — brew install deno (or curl -fsSL https://deno.land/install.sh | sh)" >&2
  exit 2
fi

exec deno run --allow-net --allow-env --allow-read --allow-write --allow-run=supabase \
  "$DIR/run-eval.ts" "$@"
