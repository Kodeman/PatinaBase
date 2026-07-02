#!/usr/bin/env bash
#
# aesthete-load-sanity.sh — 20 rps × 60 s against get_aesthete_matches
# (Wave 4C; design §12.3: quiz → top-10 must hold < 250 ms in SQL).
#
# Shape: one anon quiz session is created, then RPS parallel workers each
# fire one request per second for DURATION_S seconds (xargs -P fan-out,
# per-worker 1 Hz pacing) — a steady RPS×DURATION_S load, not a burst.
#
# Two latency reads:
#   • HTTP wall-clock (curl time_total) — client-observed, includes
#     PostgREST/Kong overhead.
#   • SQL-side latency_ms from the RPC's own match_events rows for this
#     session — the number the 250 ms budget governs.
#
# The run writes RPS×DURATION_S match_events rows; they are deleted at the
# end (pass --keep to keep them for inspection).
#
# Env: SUPABASE_REST_URL (default http://localhost:54321) · RPS (20) ·
#      DURATION_S (60) · BUDGET_MS (250) · MAX_ERROR_RATE (0.01) ·
#      SUPABASE_ANON_KEY (else minted HS256 from SUPABASE_JWT_SECRET).
#
# Known local-dev artifact: the Supabase CLI's postgres image preloads
# plpgsql_check, whose pldbgapi2 statement-stack tracking races under
# concurrent plpgsql — a small number of requests (≈0.5% at 20 rps) return
# HTTP 500 {"code":"XX000","message":"cannot find parent statement on
# pldbgapi2 call stack"}. That is instrumentation, not the RPC. ONLY that
# signature is tolerated (matched in the response body), up to MAX_ERROR_RATE
# (default 1%); ANY other non-200 fails the run regardless of rate, so a real
# 500/429/503 is never masked. Expect 0% on a stack that doesn't preload
# plpgsql_check.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

: "${SUPABASE_REST_URL:=http://localhost:54321}"
: "${RPS:=20}"
: "${DURATION_S:=60}"
: "${BUDGET_MS:=250}"
: "${MAX_ERROR_RATE:=0.01}"
: "${SUPABASE_JWT_SECRET:=super-secret-jwt-token-with-at-least-32-characters-long}"

DB_CONTAINER="supabase_db_supabase"
KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
psql_c() { docker exec "$DB_CONTAINER" psql -U postgres -d postgres -tAc "$1"; }

command -v jq > /dev/null || { echo "jq required" >&2; exit 2; }

ANON_KEY="${SUPABASE_ANON_KEY:-}"
if [ -z "$ANON_KEY" ]; then
  ANON_KEY=$(python3 - "$SUPABASE_JWT_SECRET" << 'PY'
import base64, hashlib, hmac, json, sys, time
secret = sys.argv[1]
def b64(d): return base64.urlsafe_b64encode(d).rstrip(b'=')
h = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
p = b64(json.dumps({"role": "anon", "iss": "supabase-demo", "exp": int(time.time()) + 7200}).encode())
s = b64(hmac.new(secret.encode(), h + b"." + p, hashlib.sha256).digest())
print((h + b"." + p + b"." + s).decode())
PY
)
fi

SESSION_KEY=$(uuidgen 2>/dev/null | tr '[:upper:]' '[:lower:]' || python3 -c 'import uuid; print(uuid.uuid4())')

bold "aesthete-load-sanity — ${RPS} rps × ${DURATION_S}s against get_aesthete_matches (budget: SQL p95 < ${BUDGET_MS} ms)"

# ── setup: one anon quiz session ─────────────────────────────────────────────
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
  -X POST "$SUPABASE_REST_URL/rest/v1/rpc/submit_style_quiz" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"p_session_key\":\"$SESSION_KEY\",\"p_source\":\"client_portal\",\"p_answers\":{\"visual_resonance\":\"warm_minimal\",\"lifestyle\":[\"family\"],\"material\":\"weathered_oak\",\"investment\":\"heirloom\",\"catalyst\":\"new_home\"},\"p_timings\":{},\"p_attribution\":{\"utm_source\":\"aesthete-load-sanity\"}}")
if [ "$code" != "200" ]; then
  echo "setup failed: submit_style_quiz HTTP $code" >&2
  exit 1
fi

TIMES_FILE=$(mktemp)
export TIMES_FILE SESSION_KEY ANON_KEY SUPABASE_REST_URL DURATION_S

# ── fire: RPS workers × DURATION_S requests, 1 Hz per worker ─────────────────
T_START=$(date +%s)
seq 1 "$RPS" | xargs -P "$RPS" -n 1 -I '{}' sh -c '
  i=0
  while [ "$i" -lt "$DURATION_S" ]; do
    resp=$(curl -s -w "\n%{http_code} %{time_total}" --max-time 10 \
      -X POST "$SUPABASE_REST_URL/rest/v1/rpc/get_aesthete_matches" \
      -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"p_session_key\": \"$SESSION_KEY\", \"p_limit\": 10}")
    meta=$(printf "%s" "$resp" | tail -1)
    body=$(printf "%s" "$resp" | sed "\$d")
    code=$(printf "%s" "$meta" | awk "{print \$1}")
    elapsed=$(printf "%s" "$meta" | awk "{print \$2}")
    # Classify non-200s: the known local plpgsql_check/pldbgapi2 race vs a
    # real failure. Only the race is tolerated (by rate) at the end.
    sig=ok
    if [ "$code" != "200" ]; then
      if printf "%s" "$body" | grep -q "pldbgapi2 call stack"; then sig=race; else sig=other; fi
    fi
    echo "$code $elapsed $sig" >> "$TIMES_FILE"
    # pace to ~1 request/second per worker
    sleep "$(awk -v e="$elapsed" "BEGIN { s = 1 - e; print (s > 0 ? s : 0) }")"
    i=$((i + 1))
  done
'
T_END=$(date +%s)

TOTAL=$(wc -l < "$TIMES_FILE" | tr -d ' ')
ERRORS=$(awk '$1 != 200' "$TIMES_FILE" | wc -l | tr -d ' ')
RACE=$(awk '$1 != 200 && $3 == "race"' "$TIMES_FILE" | wc -l | tr -d ' ')
OTHER=$(awk '$1 != 200 && $3 != "race"' "$TIMES_FILE" | wc -l | tr -d ' ')
ERROR_CODES=$(awk '$1 != 200 { print $1"/"$3 }' "$TIMES_FILE" | sort | uniq -c | tr '\n' ' ' | sed 's/  */ /g')
WALL=$((T_END - T_START))
EFFECTIVE_RPS=$(awk -v n="$TOTAL" -v w="$WALL" 'BEGIN { printf "%.1f", n / (w > 0 ? w : 1) }')

# ── report: HTTP wall-clock ──────────────────────────────────────────────────
read -r H_P50 H_P95 H_MAX << EOF
$(awk '$1 == 200 { print $2 * 1000 }' "$TIMES_FILE" | sort -n | awk '
  { a[NR] = $1 }
  END {
    if (NR == 0) { print "0 0 0"; exit }
    p50 = a[int(NR * 0.50) + (NR * 0.50 == int(NR * 0.50) ? 0 : 1)]
    p95 = a[int(NR * 0.95) + (NR * 0.95 == int(NR * 0.95) ? 0 : 1)]
    printf "%.1f %.1f %.1f\n", p50, p95, a[NR]
  }')
EOF

# ── report: SQL-side latency (the RPC stamps latency_ms per event) ───────────
SQL_STATS=$(psql_c "
  SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::numeric, 1) || ' ' ||
         round(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::numeric, 1) || ' ' ||
         max(latency_ms) || ' ' || count(*)
    FROM match_events WHERE session_key = '$SESSION_KEY';")
read -r S_P50 S_P95 S_MAX S_N <<< "$SQL_STATS"

printf '\n'
bold "results (${TOTAL} requests over ${WALL}s ≈ ${EFFECTIVE_RPS} rps; ${ERRORS} non-200${ERRORS:+${ERROR_CODES:+ — codes:$ERROR_CODES}})"
printf '%s\n' "─────────────────────────────────────────────────────────"
printf ' %-26s %8s %8s %8s\n' "" "p50" "p95" "max"
printf ' %-26s %7sms %7sms %7sms\n' "HTTP wall-clock" "$H_P50" "$H_P95" "$H_MAX"
printf ' %-26s %7sms %7sms %7sms   (n=%s)\n' "SQL (match_events)" "$S_P50" "$S_P95" "$S_MAX" "$S_N"
printf '%s\n' "─────────────────────────────────────────────────────────"

# ── cleanup ──────────────────────────────────────────────────────────────────
if [ "$KEEP" = 0 ]; then
  psql_c "DO \$\$
    DECLARE v_ids uuid[];
    BEGIN
      SELECT array_agg(quiz_session_id) INTO v_ids
        FROM client_style_profiles
       WHERE session_key = '$SESSION_KEY' AND quiz_session_id IS NOT NULL;
      DELETE FROM match_events WHERE session_key = '$SESSION_KEY';
      DELETE FROM client_style_profiles WHERE session_key = '$SESSION_KEY';
      DELETE FROM quiz_sessions WHERE id = ANY(COALESCE(v_ids, '{}'));
    END \$\$;" > /dev/null
  bold "cleaned up the run's match_events/profile/session rows (--keep to retain)"
else
  bold "kept rows for session $SESSION_KEY"
fi
rm -f "$TIMES_FILE"

FAIL=0
# Real failures: any non-200 that ISN'T the known pldbgapi2 race fails hard,
# with no rate tolerance (a genuine 500/429/503 is a product problem even once).
if [ "$OTHER" -gt 0 ]; then
  printf '\033[31m✗ %s/%s non-200 are NOT the known pldbgapi2 race — real failures — codes:%s\033[0m\n' \
    "$OTHER" "$TOTAL" "$ERROR_CODES" >&2
  FAIL=1
fi
# The local plpgsql_check/pldbgapi2 statement-stack race (see header): tolerated
# up to MAX_ERROR_RATE — beyond that the stack is unhealthy, not just noisy.
if [ "$RACE" -gt 0 ]; then
  if awk -v e="$RACE" -v n="$TOTAL" -v r="$MAX_ERROR_RATE" 'BEGIN { exit !(e / n > r) }'; then
    printf '\033[31m✗ %s/%s pldbgapi2-race non-200 exceed MAX_ERROR_RATE %s — codes:%s\033[0m\n' \
      "$RACE" "$TOTAL" "$MAX_ERROR_RATE" "$ERROR_CODES" >&2
    FAIL=1
  else
    printf '\033[33m! %s/%s non-200 are the known local plpgsql_check/pldbgapi2 race (within tolerance %s) — codes:%s\033[0m\n' \
      "$RACE" "$TOTAL" "$MAX_ERROR_RATE" "$ERROR_CODES"
  fi
fi
if awk -v p="$S_P95" -v b="$BUDGET_MS" 'BEGIN { exit !(p >= b) }'; then
  printf '\033[31m✗ SQL p95 %sms ≥ budget %sms (§12.3)\033[0m\n' "$S_P95" "$BUDGET_MS" >&2
  FAIL=1
fi
[ "$FAIL" -ne 0 ] && exit 1
bold "✓ aesthete-load-sanity: SQL p95 ${S_P95}ms < ${BUDGET_MS}ms budget"
