#!/usr/bin/env bash
# =============================================================================
# Patina: repeatable production deploy
# =============================================================================
# Idempotent. Each step is safe to re-run.
#
# Usage (from monorepo root):
#   ./infra/deploy.sh                        # full deploy: build, push, migrate, recreate, seed
#   ./infra/deploy.sh --skip-build           # skip docker build+push (use existing :latest)
#   ./infra/deploy.sh --skip-migrate         # skip migration application
#   ./infra/deploy.sh --skip-seed            # skip kody@kochaver.com seed
#   ./infra/deploy.sh --compose-only         # only push docker-compose snapshot + recreate
#
# Prereqs:
#   - origin/main is up to date locally and is the branch you want to ship
#   - infra/coolify/.env.coolify has COOLIFY_TOKEN
#   - SSH access to ${PATINA_PROD_SSH:-kody@192.168.1.14}
#   - docker login ghcr.io -u kodeman is current
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SERVER="${PATINA_PROD_SSH:-kody@192.168.1.14}"
STACK_UUID="${PATINA_STACK_UUID:-oc8kggksw4s8sg08o4w0wsw4}"
STACK_DIR="/data/coolify/services/${STACK_UUID}"
DB_CONTAINER="${PATINA_DB_CONTAINER:-db-es8w8g0c00og4gsgg0k8w8o8}"

SKIP_BUILD=false
SKIP_MIGRATE=false
SKIP_SEED=false
COMPOSE_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --skip-build)   SKIP_BUILD=true ;;
    --skip-migrate) SKIP_MIGRATE=true ;;
    --skip-seed)    SKIP_SEED=true ;;
    --compose-only) COMPOSE_ONLY=true; SKIP_BUILD=true; SKIP_MIGRATE=true; SKIP_SEED=true ;;
    -h|--help)      sed -n '1,/^=====/p' "$0" | sed 's/^# //; s/^#//' ; exit 0 ;;
    *) echo "Unknown arg: $arg"; exit 2 ;;
  esac
done

cd "$REPO_ROOT"

# ─── 1. main is up to date ──────────────────────────────────────────────────
git fetch origin main >/dev/null 2>&1
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" != "$REMOTE" ]; then
  echo "ERROR: local HEAD ($LOCAL) does not match origin/main ($REMOTE)"
  echo "Pull or push as needed before deploying."
  exit 1
fi
echo "[deploy] origin/main = $LOCAL"

# ─── 2. Build + push ────────────────────────────────────────────────────────
if [ "$SKIP_BUILD" = false ]; then
  echo "[deploy] building + pushing all images via build-and-push.sh"
  ./infra/build-and-push.sh
fi

# ─── 3. Push compose snapshot if drifted ────────────────────────────────────
echo "[deploy] checking compose drift on $SERVER..."
LOCAL_COMPOSE="${REPO_ROOT}/infra/coolify/docker-compose.ghcr-apps.yml"
if ! ssh "$SERVER" "sudo diff -q ${STACK_DIR}/docker-compose.yml -" \
       < "$LOCAL_COMPOSE" >/dev/null 2>&1; then
  echo "[deploy] compose drifted — pushing snapshot"
  scp "$LOCAL_COMPOSE" "${SERVER}:/tmp/ghcr-apps-compose.yml"
  ssh "$SERVER" "sudo cp /tmp/ghcr-apps-compose.yml ${STACK_DIR}/docker-compose.yml"
fi

# ─── 4. Pull + recreate ─────────────────────────────────────────────────────
echo "[deploy] docker compose pull + up --force-recreate on $SERVER"
ssh "$SERVER" "sudo bash -c 'cd ${STACK_DIR} && docker compose pull && docker compose up -d --force-recreate'"

# ─── 5. Wait for portal health ──────────────────────────────────────────────
echo "[deploy] waiting for portals to come up..."
for url in https://app.patina.cloud https://admin.patina.cloud https://client.patina.cloud; do
  for _ in $(seq 1 60); do
    code=$(curl -sIo /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "000")
    case "$code" in 200|302|307) break ;; esac
    sleep 5
  done
  echo "  $url -> $code"
done

if [ "$COMPOSE_ONLY" = true ]; then
  echo "[deploy] compose-only mode — skipping migrate + seed"
  exit 0
fi

# ─── 6. Apply migrations (idempotent) ───────────────────────────────────────
if [ "$SKIP_MIGRATE" = false ]; then
  echo "[deploy] applying migrations 00128–00135 to prod DB"
  for m in 00128_ffe_categories_taxonomy 00129_products_status_column \
           00130_proposal_captures 00131_proposal_palettes \
           00132_paint_colors_catalog 00133_proposal_phase_deliverables \
           00134_proposal_phase_gates 00135_proposal_phase_templates; do
    if [ -f "supabase/migrations/${m}.sql" ]; then
      echo "  applying $m"
      ssh "$SERVER" "sudo docker exec -i ${DB_CONTAINER} \
          psql -U postgres -d postgres -v ON_ERROR_STOP=1" \
        < "supabase/migrations/${m}.sql" > /dev/null 2>&1 || {
          echo "  WARN: $m may have applied partially — re-runs are idempotent"
      }
    fi
  done

  if [ -f supabase/seed/paint_colors_seed.sql ]; then
    echo "  applying paint_colors_seed.sql"
    ssh "$SERVER" "sudo docker exec -i ${DB_CONTAINER} \
        psql -U postgres -d postgres" \
      < supabase/seed/paint_colors_seed.sql > /dev/null 2>&1 || true
  fi
fi

# ─── 7. Seed kody@kochaver.com ──────────────────────────────────────────────
if [ "$SKIP_SEED" = false ]; then
  echo "[deploy] seeding kody@kochaver.com test data"
  ./infra/seed-prod-test-account.sh
fi

echo
echo "[deploy] complete."
