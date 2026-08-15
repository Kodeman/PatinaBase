#!/usr/bin/env bash
#
# aesthete-gate.sh — verification gate for the Aesthete Engine delivery program.
# Mirrors the decision-gate.sh model: a single entrypoint each agent runs in its
# worktree before fast-merging to main; the conductor re-runs it on main at every
# wave barrier. See docs/prds/AE/aesthete-engine-delivery-plan.md ("The gate").
#
# Usage:
#   scripts/aesthete-gate.sh <tier> [--no-reset]
#
# Tiers:
#   db      `supabase db reset` + every supabase/tests/aesthete/*.sql via the
#           same-session SQL-test runner. --no-reset runs suites without
#           resetting (worktree agents: the wave's migration owner owns resets).
#   edge    `deno test` over each supabase/functions/aesthete-*/ that has tests,
#           plus supabase/functions/_shared/ (G3 decision #3: the shared-helper
#           suites — aesthete-events et al — must ride the same tier)
#   worker  pytest in services/aesthete-inference (honors a Makefile `test` target)
#   ts      pnpm turbo type-check (whole repo)
#   walk    seeded curl-level e2e: anon submit_style_quiz -> get_aesthete_matches
#           against local PostgREST, asserting profile shape, >=1 match with a
#           `why`, and the Sec.14.7 latency bar (quiz->results < 2 s)
#   all     db -> edge -> worker -> ts -> walk, then a final summary table
#
# Every tier skips-with-notice while its target doesn't exist yet, so the gate
# is green from Wave 0 onward. Exit is non-zero iff any tier FAILs.
#
# Env:
#   SUPABASE_REST_URL   PostgREST base for `walk` (default http://localhost:54321)
#   SUPABASE_ANON_KEY   anon key for `walk`; else read from `supabase status -o env`,
#                       else the standard local demo key
#   WALK_BUDGET_MS      end-to-end budget for `walk` (default 2000 — design Sec.14.7)
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

: "${SUPABASE_REST_URL:=http://localhost:54321}"
: "${WALK_BUDGET_MS:=2000}"

# Standard local-dev demo anon key (iss: supabase-demo) — used when
# `supabase status -o env` is unavailable.
DEMO_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

DB_CONTAINER="supabase_db_supabase"
TESTS_DIR="$ROOT/supabase/tests/aesthete"

# ── output helpers ───────────────────────────────────────────────────────────
bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
run()   { bold "▶ $*"; "$@"; }

ANY_FAIL=0
RESULTS=()   # "tier<TAB>STATUS<TAB>detail"

tier_pass() { printf '\033[32m✓ %s: PASS\033[0m — %s\n' "$1" "$2"; RESULTS+=("$1"$'\t'"PASS"$'\t'"$2"); }
tier_skip() { printf '\033[33m− %s: SKIP\033[0m — %s\n' "$1" "$2"; RESULTS+=("$1"$'\t'"SKIP"$'\t'"$2"); }
tier_fail() { printf '\033[31m✗ %s: FAIL\033[0m — %s\n' "$1" "$2" >&2; RESULTS+=("$1"$'\t'"FAIL"$'\t'"$2"); ANY_FAIL=1; }

now_ms() { python3 -c 'import time; print(int(time.time()*1000))'; }

# ── db ───────────────────────────────────────────────────────────────────────
gate_db() {
  shopt -s nullglob
  local suites=("$TESTS_DIR"/*.sql)
  shopt -u nullglob

  if [ ! -d "$TESTS_DIR" ] || [ "${#suites[@]}" -eq 0 ]; then
    tier_skip db "no aesthete SQL suites yet ($TESTS_DIR)"
    return 0
  fi

  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$DB_CONTAINER"; then
    tier_fail db "container $DB_CONTAINER not running — pnpm supabase:start"
    return 1
  fi

  if [ "$NO_RESET" -eq 0 ]; then
    if ! (cd "$ROOT/supabase" && run supabase db reset); then
      tier_fail db "supabase db reset failed"
      return 1
    fi
  else
    bold "db: --no-reset — running suites against the current local DB state"
  fi

  local failed=0 total=0
  local f
  for f in "${suites[@]}"; do
    total=$((total + 1))
    bold "▶ suite: ${f#"$ROOT"/}"
    if ! SUPABASE_SQL_TEST_BACKEND=docker \
      "$ROOT/scripts/run-supabase-sql-test.sh" "$f"; then
      printf '\033[31m  suite failed: %s\033[0m\n' "${f#"$ROOT"/}" >&2
      failed=$((failed + 1))
    fi
  done

  if [ "$failed" -gt 0 ]; then
    tier_fail db "$failed/$total SQL suite(s) failed"
    return 1
  fi
  tier_pass db "$total SQL suite(s) green"
}

# ── edge ─────────────────────────────────────────────────────────────────────
gate_edge() {
  shopt -s nullglob
  local dirs=("$ROOT"/supabase/functions/aesthete-*/)
  shopt -u nullglob

  # _shared rides the edge tier too (G3 decision #3 → Wave 4C): its helpers
  # (aesthete.ts, aesthete-events.ts, …) are imported by every aesthete fn.
  if [ -d "$ROOT/supabase/functions/_shared" ]; then
    dirs+=("$ROOT/supabase/functions/_shared/")
  fi

  if [ "${#dirs[@]}" -eq 0 ]; then
    tier_skip edge "no aesthete-* edge functions yet (arrive Wave 2)"
    return 0
  fi

  if ! command -v deno >/dev/null 2>&1; then
    tier_skip edge "deno not installed — brew install deno (or curl -fsSL https://deno.land/install.sh | sh)"
    return 0
  fi

  local ran=0 failed=0
  local d
  for d in "${dirs[@]}"; do
    local tests
    tests=$(find "$d" -name '*.test.ts' 2>/dev/null)
    if [ -z "$tests" ]; then
      bold "edge: no *.test.ts in ${d#"$ROOT"/} — skipped"
      continue
    fi
    ran=$((ran + 1))
    if ! run deno test --allow-all --config "$ROOT/supabase/functions/deno.json" "$d"; then
      failed=$((failed + 1))
    fi
  done

  if [ "$ran" -eq 0 ]; then
    tier_skip edge "aesthete-* function dirs exist but carry no *.test.ts yet"
    return 0
  fi
  if [ "$failed" -gt 0 ]; then
    tier_fail edge "$failed/$ran function test suite(s) failed"
    return 1
  fi
  tier_pass edge "$ran function test suite(s) green"
}

# ── worker ───────────────────────────────────────────────────────────────────
gate_worker() {
  local dir="$ROOT/services/aesthete-inference"
  if [ ! -d "$dir" ]; then
    tier_skip worker "services/aesthete-inference not present yet (arrives Wave 1C)"
    return 0
  fi

  if [ -f "$dir/Makefile" ] && grep -qE '^test:' "$dir/Makefile"; then
    if run make -C "$dir" test; then
      tier_pass worker "make test green"
    else
      tier_fail worker "make test failed"
      return 1
    fi
    return 0
  fi

  if ! command -v python3 >/dev/null 2>&1; then
    tier_skip worker "python3 not on PATH — install python3 to run the worker suite"
    return 0
  fi

  if (cd "$dir" && run python3 -m pytest); then
    tier_pass worker "pytest green"
  else
    tier_fail worker "pytest failed"
    return 1
  fi
}

# ── ts ───────────────────────────────────────────────────────────────────────
# Baseline-delta: the repo has pre-existing type-check failures recorded in
# scripts/aesthete-ts-baseline.txt (G0 decision, delivery log 2026-07-01).
# PASS iff the set of failing tasks is a subset of the baseline; any NEW
# failing task fails the tier. Green repo (exit 0) always passes.
gate_ts() {
  local baseline="$ROOT/scripts/aesthete-ts-baseline.txt"
  local out
  out="$(mktemp)"
  if pnpm turbo type-check --continue >"$out" 2>&1; then
    tier_pass ts "whole-repo type-check green"
    rm -f "$out"
    return 0
  fi
  local failed
  failed="$(sed -n 's/^[[:space:]]*Failed:[[:space:]]*//p' "$out" | tr -d ' ' | tr ',' '\n' | sort -u | sed '/^$/d')"
  if [ -z "$failed" ]; then
    tier_fail ts "type-check failed but no Failed: summary parsed — inspect $out"
    return 1
  fi
  local new_failures=""
  while IFS= read -r task; do
    if ! grep -qxF "$task" "$baseline" 2>/dev/null; then
      new_failures="${new_failures}${task} "
    fi
  done <<< "$failed"
  rm -f "$out"
  if [ -n "$new_failures" ]; then
    tier_fail ts "NEW type-check failures beyond baseline: ${new_failures}"
    return 1
  fi
  local n
  n="$(printf '%s\n' "$failed" | wc -l | tr -d ' ')"
  tier_pass ts "no new failures (${n} pre-existing baseline failures — see aesthete-ts-baseline.txt)"
}

# ── walk ─────────────────────────────────────────────────────────────────────
resolve_anon_key() {
  if [ -n "${SUPABASE_ANON_KEY:-}" ]; then
    printf '%s' "$SUPABASE_ANON_KEY"
    return 0
  fi
  local from_status
  from_status=$( (cd "$ROOT/supabase" && supabase status -o env 2>/dev/null) \
    | grep -E '^(SUPABASE_)?ANON_KEY=' | head -1 | cut -d= -f2- | tr -d '"' ) || true
  if [ -n "$from_status" ]; then
    printf '%s' "$from_status"
    return 0
  fi
  printf '%s' "$DEMO_ANON_KEY"
}

gate_walk() {
  local anon rest="$SUPABASE_REST_URL"
  anon="$(resolve_anon_key)"

  # Probe 1 — is local PostgREST up at all? (cheap root select)
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
    -H "apikey: $anon" "$rest/rest/v1/" || true)
  if [ "$code" != "200" ]; then
    tier_skip walk "local Supabase not reachable at $rest (HTTP ${code:-none}) — pnpm supabase:start"
    return 0
  fi

  # Probe 2 — do the RPCs exist yet? (OpenAPI root lists every /rpc/ path)
  local openapi
  openapi=$(curl -s --max-time 10 -H "apikey: $anon" "$rest/rest/v1/")
  local missing=()
  echo "$openapi" | grep -q '"/rpc/submit_style_quiz"'    || missing+=("submit_style_quiz (Wave 1B)")
  echo "$openapi" | grep -q '"/rpc/get_aesthete_matches"' || missing+=("get_aesthete_matches (Wave 2A)")
  if [ "${#missing[@]}" -gt 0 ]; then
    tier_skip walk "RPC(s) not present yet: ${missing[*]}"
    return 0
  fi

  local session_key
  session_key=$(uuidgen 2>/dev/null | tr '[:upper:]' '[:lower:]') \
    || session_key=$(python3 -c 'import uuid; print(uuid.uuid4())')

  # Persona payload: "The Hendersons" (scripts/aesthete-eval/personas.json),
  # option keys per design Sec.7.1/Sec.7.2.
  local quiz_body
  quiz_body=$(cat <<JSON
{
  "p_session_key": "$session_key",
  "p_source": "client_portal",
  "p_answers": {
    "visual_resonance": "warm_minimal",
    "lifestyle": ["family", "entertaining"],
    "material": "weathered_oak",
    "investment": "heirloom",
    "catalyst": "new_home"
  },
  "p_timings": {},
  "p_attribution": {"utm_source": "aesthete-gate-walk"}
}
JSON
)

  local t0 t1 elapsed
  t0=$(now_ms)

  bold "▶ POST /rest/v1/rpc/submit_style_quiz (session $session_key)"
  local quiz_resp quiz_code
  quiz_resp=$(curl -s --max-time 10 -w $'\n%{http_code}' \
    -X POST "$rest/rest/v1/rpc/submit_style_quiz" \
    -H "apikey: $anon" -H "Authorization: Bearer $anon" \
    -H "Content-Type: application/json" \
    -d "$quiz_body")
  quiz_code=$(echo "$quiz_resp" | tail -1)
  quiz_resp=$(echo "$quiz_resp" | sed '$d')

  if [ "$quiz_code" != "200" ]; then
    tier_fail walk "submit_style_quiz HTTP $quiz_code — $quiz_resp"
    return 1
  fi
  if ! echo "$quiz_resp" | jq -e '
      (if type == "array" then .[0] else . end).spectrums
      | has("warmth") and has("complexity") and has("formality")
        and has("timelessness") and has("boldness") and has("craftsmanship")
    ' >/dev/null 2>&1; then
    tier_fail walk "profile JSON missing one of the six spectrums — got: $(echo "$quiz_resp" | head -c 400)"
    return 1
  fi

  bold "▶ POST /rest/v1/rpc/get_aesthete_matches"
  local match_resp match_code
  match_resp=$(curl -s --max-time 10 -w $'\n%{http_code}' \
    -X POST "$rest/rest/v1/rpc/get_aesthete_matches" \
    -H "apikey: $anon" -H "Authorization: Bearer $anon" \
    -H "Content-Type: application/json" \
    -d "{\"p_session_key\": \"$session_key\", \"p_limit\": 10}")
  match_code=$(echo "$match_resp" | tail -1)
  match_resp=$(echo "$match_resp" | sed '$d')

  t1=$(now_ms)
  elapsed=$((t1 - t0))

  if [ "$match_code" != "200" ]; then
    tier_fail walk "get_aesthete_matches HTTP $match_code — $match_resp"
    return 1
  fi
  if ! echo "$match_resp" | jq -e '
      (if type == "array" then . else (.matches // []) end)
      | (length >= 1) and (.[0] | has("why"))
    ' >/dev/null 2>&1; then
    tier_fail walk "expected >=1 match row carrying a \`why\` — got: $(echo "$match_resp" | head -c 400)"
    return 1
  fi
  if [ "$elapsed" -ge "$WALK_BUDGET_MS" ]; then
    tier_fail walk "quiz->matches took ${elapsed}ms (budget ${WALK_BUDGET_MS}ms — design Sec.14.7)"
    return 1
  fi

  tier_pass walk "quiz -> profile (6 spectrums) -> matches with whys in ${elapsed}ms (< ${WALK_BUDGET_MS}ms)"
}

# ── summary ──────────────────────────────────────────────────────────────────
print_table() {
  printf '\n'
  bold "aesthete-gate summary"
  printf '%s\n' "────────────────────────────────────────────────────────────"
  printf ' %-8s %-6s %s\n' "tier" "status" "detail"
  printf '%s\n' "────────────────────────────────────────────────────────────"
  local row tier status detail color
  for row in "${RESULTS[@]}"; do
    IFS=$'\t' read -r tier status detail <<< "$row"
    case "$status" in
      PASS) color=$'\033[32m' ;;
      SKIP) color=$'\033[33m' ;;
      *)    color=$'\033[31m' ;;
    esac
    printf ' %-8s %s%-6s\033[0m %s\n' "$tier" "$color" "$status" "$detail"
  done
  printf '%s\n' "────────────────────────────────────────────────────────────"
}

# ── entrypoint ───────────────────────────────────────────────────────────────
usage() {
  echo "usage: scripts/aesthete-gate.sh <db|edge|worker|ts|walk|all> [--no-reset]" >&2
}

CMD=""
NO_RESET=0
for arg in "$@"; do
  case "$arg" in
    --no-reset) NO_RESET=1 ;;
    db|edge|worker|ts|walk|all) CMD="$arg" ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac
done
CMD="${CMD:-all}"

case "$CMD" in
  db)     gate_db ;;
  edge)   gate_edge ;;
  worker) gate_worker ;;
  ts)     gate_ts ;;
  walk)   gate_walk ;;
  all)
    gate_db
    gate_edge
    gate_worker
    gate_ts
    gate_walk
    print_table
    ;;
esac

if [ "$ANY_FAIL" -ne 0 ]; then
  printf '\033[31m✗ aesthete-gate: %s failed\033[0m\n' "$CMD" >&2
  exit 1
fi
bold "✓ aesthete-gate: ${CMD} passed"
