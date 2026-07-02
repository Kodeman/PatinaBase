#!/usr/bin/env bash
#
# aesthete-drill.sh — the §12.1 inference-down drill, automated (Wave 4C).
# Proves the degradation ladder against the LIVE local stack:
#
#   rung 1  quiz → matches is pure SQL — green with the worker in ANY state.
#   rung 2  aesthete-ask degrades to FTS-only ({degraded: true}) when the
#           worker is unreachable; recovers to the vector rung when it's back.
#   rung 3  embed jobs burn NO attempts against a dead worker (the
#           embed-worker fn probes /healthz before claiming) and the drain
#           resumes on recovery — nothing lost.
#
# Worker windows: if the inference worker is up and owned by someone else,
# the drill makes a TINY down-window by SIGSTOPping the process (kernel keeps
# the socket; requests just hang into the 1.5 s/2 s budgets — a realistic
# "down") and SIGCONTs it right after. Initial state is always restored:
#   up at start   → pause → down-phase → resume → up-phase       (ends up)
#   down at start → down-phase → (start our own for the up-phase
#                    unless NO_WORKER_START=1) → stop ours        (ends down)
#
# Requirements: local Supabase running; `supabase functions serve` (or the
# CLI's edge runtime) serving aesthete-ask/aesthete-embed-worker with
# INFERENCE_URL pointing at the worker. JWTs are minted HS256 with the local
# demo secret (override SUPABASE_JWT_SECRET).
#
# Env:
#   SUPABASE_REST_URL    default http://localhost:54321
#   FUNCTIONS_URL        default $SUPABASE_REST_URL/functions/v1
#   WORKER_HEALTH_URL    default http://localhost:8321/healthz
#   WORKER_DIR           default services/aesthete-inference (up-phase start)
#   WORKER_PORT          default 8321
#   SUPABASE_JWT_SECRET  default the local demo secret
#   NO_WORKER_START=1    never start a worker of our own
#   NO_WORKER_PAUSE=1    never SIGSTOP someone else's worker (skips the
#                        down-phase when the worker is up)
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

: "${SUPABASE_REST_URL:=http://localhost:54321}"
: "${FUNCTIONS_URL:=$SUPABASE_REST_URL/functions/v1}"
: "${WORKER_HEALTH_URL:=http://localhost:8321/healthz}"
: "${WORKER_DIR:=$ROOT/services/aesthete-inference}"
: "${WORKER_PORT:=8321}"
: "${SUPABASE_JWT_SECRET:=super-secret-jwt-token-with-at-least-32-characters-long}"

DB_CONTAINER="supabase_db_supabase"
DESIGNER_UUID="a0000000-0000-0000-0000-000000000004"   # designer@patina.dev (dev seed)

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
RESULTS=()
ANY_FAIL=0
step_pass() { printf '\033[32m✓ %s\033[0m — %s\n' "$1" "$2"; RESULTS+=("$1"$'\t'"PASS"$'\t'"$2"); }
step_skip() { printf '\033[33m− %s\033[0m — %s\n' "$1" "$2"; RESULTS+=("$1"$'\t'"SKIP"$'\t'"$2"); }
step_fail() { printf '\033[31m✗ %s\033[0m — %s\n' "$1" "$2" >&2; RESULTS+=("$1"$'\t'"FAIL"$'\t'"$2"); ANY_FAIL=1; }

# ── HS256 JWT mint (local functions-serve curl idiom, delivery log G2) ──────
mint_jwt() { # $1 = role, $2 = sub ('' for none)
  python3 - "$SUPABASE_JWT_SECRET" "$1" "$2" << 'PY'
import base64, hashlib, hmac, json, sys, time
secret, role, sub = sys.argv[1], sys.argv[2], sys.argv[3]
def b64(d): return base64.urlsafe_b64encode(d).rstrip(b'=')
header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
claims = {"role": role, "iss": "supabase-demo", "exp": int(time.time()) + 3600}
if sub: claims["sub"] = sub
payload = b64(json.dumps(claims).encode())
sig = b64(hmac.new(secret.encode(), header + b"." + payload, hashlib.sha256).digest())
print((header + b"." + payload + b"." + sig).decode())
PY
}

psql_c() { docker exec "$DB_CONTAINER" psql -U postgres -d postgres -tAc "$1"; }
uuid() { uuidgen 2>/dev/null | tr '[:upper:]' '[:lower:]' || python3 -c 'import uuid; print(uuid.uuid4())'; }

worker_up() {
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$WORKER_HEALTH_URL" || true)" = "200" ]
}

worker_pid() { lsof -nP -tiTCP:"$WORKER_PORT" -sTCP:LISTEN 2>/dev/null | head -1; }

# ── rung 1: quiz → matches (pure SQL) ────────────────────────────────────────
rung1() { # $1 = label suffix
  local sk resp code
  sk=$(uuid)
  resp=$(curl -s --max-time 10 -w $'\n%{http_code}' \
    -X POST "$SUPABASE_REST_URL/rest/v1/rpc/submit_style_quiz" \
    -H "apikey: $ANON_JWT" -H "Authorization: Bearer $ANON_JWT" \
    -H "Content-Type: application/json" \
    -d "{\"p_session_key\":\"$sk\",\"p_source\":\"client_portal\",\"p_answers\":{\"visual_resonance\":\"warm_minimal\",\"lifestyle\":[\"family\"],\"material\":\"weathered_oak\",\"investment\":\"heirloom\",\"catalyst\":\"new_home\"},\"p_timings\":{},\"p_attribution\":{\"utm_source\":\"aesthete-drill\"}}")
  code=$(echo "$resp" | tail -1)
  if [ "$code" != "200" ]; then
    step_fail "rung1 $1" "submit_style_quiz HTTP $code"
    return 1
  fi
  resp=$(curl -s --max-time 10 -w $'\n%{http_code}' \
    -X POST "$SUPABASE_REST_URL/rest/v1/rpc/get_aesthete_matches" \
    -H "apikey: $ANON_JWT" -H "Authorization: Bearer $ANON_JWT" \
    -H "Content-Type: application/json" \
    -d "{\"p_session_key\":\"$sk\",\"p_limit\":10}")
  code=$(echo "$resp" | tail -1)
  local body; body=$(echo "$resp" | sed '$d')
  if [ "$code" = "200" ] && echo "$body" | jq -e 'length >= 1 and (.[0] | has("why"))' > /dev/null 2>&1; then
    step_pass "rung1 $1" "quiz → $(echo "$body" | jq 'length') matches with whys (pure SQL, worker-independent)"
    # tidy the drill's own rows (bearer session, service-side delete)
    psql_c "DO \$\$
      DECLARE v_ids uuid[];
      BEGIN
        SELECT array_agg(quiz_session_id) INTO v_ids
          FROM client_style_profiles
         WHERE session_key = '$sk' AND quiz_session_id IS NOT NULL;
        DELETE FROM match_events WHERE session_key = '$sk';
        DELETE FROM client_style_profiles WHERE session_key = '$sk';
        DELETE FROM quiz_sessions WHERE id = ANY(COALESCE(v_ids, '{}'));
      END \$\$;" > /dev/null
  else
    step_fail "rung1 $1" "get_aesthete_matches HTTP $code — $(echo "$body" | head -c 200)"
  fi
}

# ── rung 2: the ask (degraded vs vector) ─────────────────────────────────────
ask() { # $1 = unique ask text; sets ASK_CODE + ASK_BODY (no subshell — globals)
  local resp
  resp=$(curl -s --max-time 15 -w $'\n%{http_code}' \
    -X POST "$FUNCTIONS_URL/aesthete-ask" \
    -H "Authorization: Bearer $USER_JWT" -H "apikey: $ANON_JWT" \
    -H "Content-Type: application/json" \
    -d "{\"ask\": \"$1\", \"limit\": 5}")
  ASK_CODE=$(echo "$resp" | tail -1)
  ASK_BODY=$(echo "$resp" | sed '$d')
}

rung2_down() {
  ask "drill oak sideboard $(uuid)"
  if [ "$ASK_CODE" != "200" ]; then
    step_fail "rung2 down" "aesthete-ask HTTP $ASK_CODE — $(echo "$ASK_BODY" | head -c 200)"
    return
  fi
  if echo "$ASK_BODY" | jq -e '.degraded == true' > /dev/null 2>&1; then
    step_pass "rung2 down" "ask answered FTS-only, degraded:true ($(echo "$ASK_BODY" | jq -r '.result_count') items, $(echo "$ASK_BODY" | jq -r '.latency_ms') ms) — \"the Engine is resting\""
  else
    step_fail "rung2 down" "expected degraded:true with the worker down — got $(echo "$ASK_BODY" | jq -c '{degraded, result_count}' 2>/dev/null)"
  fi
}

rung2_up() {
  ask "drill walnut credenza $(uuid)"
  if [ "$ASK_CODE" != "200" ]; then
    step_fail "rung2 up" "aesthete-ask HTTP $ASK_CODE — $(echo "$ASK_BODY" | head -c 200)"
    return
  fi
  if echo "$ASK_BODY" | jq -e '.degraded == false' > /dev/null 2>&1; then
    step_pass "rung2 up" "ask on the vector rung, degraded:false ($(echo "$ASK_BODY" | jq -r '.result_count') items, $(echo "$ASK_BODY" | jq -r '.latency_ms') ms)"
  else
    step_fail "rung2 up" "expected degraded:false with the worker up — got $(echo "$ASK_BODY" | jq -c '{degraded, result_count}' 2>/dev/null)"
  fi
}

# ── rung 3: jobs burn no attempts down; drain resumes up ─────────────────────
invoke_embed_worker() {
  curl -s --max-time 55 -X POST "$FUNCTIONS_URL/aesthete-embed-worker" \
    -H "Authorization: Bearer $SERVICE_JWT" -H "apikey: $ANON_JWT" \
    -H "Content-Type: application/json" -d '{}'
}

rung3_down() {
  local before after resp
  before=$(psql_c "SELECT COALESCE(sum(attempts), 0) || ':' || count(*) FROM aesthete_jobs WHERE kind IN ('embed_text','embed_fused') AND status = 'pending';")
  resp=$(invoke_embed_worker)
  after=$(psql_c "SELECT COALESCE(sum(attempts), 0) || ':' || count(*) FROM aesthete_jobs WHERE kind IN ('embed_text','embed_fused') AND status = 'pending';")
  if ! echo "$resp" | jq -e '.skipped == "inference_unavailable" and .claimed == 0' > /dev/null 2>&1; then
    step_fail "rung3 down" "embed-worker should skip on a dead worker (healthz-before-claim) — got $(echo "$resp" | head -c 200)"
    return
  fi
  if [ "$before" = "$after" ]; then
    step_pass "rung3 down" "healthz-before-claim: 0 claimed, pending attempts unchanged ($before → $after)"
  else
    step_fail "rung3 down" "pending jobs burned attempts against a dead worker ($before → $after)"
  fi
}

rung3_up() {
  # Guarantee ≥1 pending embed job by re-touching one product (the 00241
  # trigger resurrects done jobs; description value is unchanged).
  local pid resp
  pid=$(psql_c "SELECT id FROM products WHERE layer = 'catalog' AND status = 'published' AND description IS NOT NULL LIMIT 1;")
  if [ -z "$pid" ]; then
    step_skip "rung3 up" "no catalog product to re-enqueue"
    return
  fi
  psql_c "UPDATE products SET description = description WHERE id = '$pid';" > /dev/null
  resp=$(invoke_embed_worker)
  if echo "$resp" | jq -e '.claimed >= 1 and .done >= 1' > /dev/null 2>&1; then
    step_pass "rung3 up" "drain resumed: claimed $(echo "$resp" | jq -r '.claimed'), done $(echo "$resp" | jq -r '.done') (nothing lost)"
  else
    step_fail "rung3 up" "expected the drain to resume — got $(echo "$resp" | head -c 200)"
  fi
}

# ── orchestration ────────────────────────────────────────────────────────────
bold "aesthete-drill — §12.1 degradation ladder"

command -v jq > /dev/null || { echo "jq required" >&2; exit 2; }

ANON_JWT=$(mint_jwt anon "")
USER_JWT=$(mint_jwt authenticated "$DESIGNER_UUID")
SERVICE_JWT=$(mint_jwt service_role "")

# Preconditions.
if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -H "apikey: $ANON_JWT" "$SUPABASE_REST_URL/rest/v1/" || true)" != "200" ]; then
  echo "local Supabase not reachable at $SUPABASE_REST_URL — pnpm supabase:start" >&2
  exit 2
fi
FUNCTIONS_OK=1
if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X OPTIONS "$FUNCTIONS_URL/aesthete-ask" || true)" != "200" ]; then
  FUNCTIONS_OK=0
fi

WORKER_WAS_UP=0
worker_up && WORKER_WAS_UP=1
bold "initial state: worker $([ "$WORKER_WAS_UP" = 1 ] && echo UP || echo DOWN) · functions $([ "$FUNCTIONS_OK" = 1 ] && echo SERVING || echo ABSENT)"

# ── DOWN phase ──
PAUSED_PID=""
if [ "$WORKER_WAS_UP" = 1 ]; then
  if [ "${NO_WORKER_PAUSE:-0}" = 1 ]; then
    step_skip "down-phase" "worker is up and NO_WORKER_PAUSE=1 — down rungs not exercised"
  else
    PAUSED_PID=$(worker_pid)
    if [ -n "$PAUSED_PID" ]; then
      bold "pausing worker pid $PAUSED_PID (SIGSTOP — tiny window, restored below)"
      kill -STOP "$PAUSED_PID"
      trap '[ -n "$PAUSED_PID" ] && kill -CONT "$PAUSED_PID" 2>/dev/null' EXIT
    else
      step_skip "down-phase" "worker up but pid not found on :$WORKER_PORT (remote?) — down rungs not exercised"
    fi
  fi
fi

if [ "$WORKER_WAS_UP" = 0 ] || [ -n "$PAUSED_PID" ]; then
  rung1 "(worker down)"
  if [ "$FUNCTIONS_OK" = 1 ]; then
    rung2_down
    rung3_down
  else
    step_skip "rung2 down" "no edge runtime serving — supabase functions serve"
    step_skip "rung3 down" "no edge runtime serving"
  fi
fi

# ── restore / UP phase ──
STARTED_OUR_OWN=0
if [ -n "$PAUSED_PID" ]; then
  bold "resuming worker pid $PAUSED_PID (SIGCONT)"
  kill -CONT "$PAUSED_PID"
  PAUSED_PID=""
  trap - EXIT
  sleep 1
elif [ "$WORKER_WAS_UP" = 0 ] && [ "${NO_WORKER_START:-0}" != 1 ] && [ -d "$WORKER_DIR" ]; then
  bold "starting a temporary worker for the up-phase (uvicorn :$WORKER_PORT)"
  ( cd "$WORKER_DIR" && PYTHONDONTWRITEBYTECODE=1 \
      INFERENCE_TOKEN="${INFERENCE_TOKEN:-local-ask-token}" \
      .venv/bin/python -m uvicorn app.main:create_app --factory --host 0.0.0.0 --port "$WORKER_PORT" \
      > /tmp/aesthete-drill-worker.log 2>&1 ) &
  STARTED_OUR_OWN=$!
  for _ in $(seq 1 60); do worker_up && break; sleep 1; done
fi

if worker_up; then
  rung1 "(worker up)"
  if [ "$FUNCTIONS_OK" = 1 ]; then
    rung2_up
    rung3_up
  else
    step_skip "rung2 up" "no edge runtime serving"
    step_skip "rung3 up" "no edge runtime serving"
  fi
else
  step_skip "up-phase" "no worker available (NO_WORKER_START=1 or start failed) — up rungs not exercised"
fi

# Restore initial state: if we started our own worker, stop it.
if [ "$STARTED_OUR_OWN" != 0 ]; then
  bold "stopping the temporary worker (restoring initial DOWN state)"
  kill "$STARTED_OUR_OWN" 2>/dev/null
  pkill -f "uvicorn app.main:create_app.*$WORKER_PORT" 2>/dev/null || true
fi

# ── ladder ──
printf '\n'; bold "the ladder"
printf '%s\n' "──────────────────────────────────────────────────────────────"
for row in "${RESULTS[@]}"; do
  IFS=$'\t' read -r step status detail <<< "$row"
  case "$status" in
    PASS) c=$'\033[32m' ;;
    SKIP) c=$'\033[33m' ;;
    *) c=$'\033[31m' ;;
  esac
  printf ' %-20s %s%-5s\033[0m %s\n' "$step" "$c" "$status" "$detail"
done
printf '%s\n' "──────────────────────────────────────────────────────────────"

if [ "$ANY_FAIL" -ne 0 ]; then
  printf '\033[31m✗ aesthete-drill: FAILED\033[0m\n' >&2
  exit 1
fi
bold "✓ aesthete-drill: ladder holds"
