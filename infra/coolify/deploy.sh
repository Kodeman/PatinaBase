#!/usr/bin/env bash
# Patina Coolify Deployment Helper
# Usage: ./deploy.sh <command>
#
# Commands:
#   init-db       Run schema initialization on Supabase DB
#   push-schemas  Push all Prisma schemas to their respective schemas
#   seed          Seed all databases
#   verify        Verify all service schemas exist and have tables
#   status        Check health of all infrastructure services

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Configuration (validated lazily — only commands that need DB access check these)
SUPABASE_DB_HOST="${SUPABASE_DB_HOST:-db-es8w8g0c00og4gsgg0k8w8o8}"
SUPABASE_DB_PORT="${SUPABASE_DB_PORT:-5432}"
SUPABASE_DB_USER="${SUPABASE_DB_USER:-postgres}"
SUPABASE_DB_NAME="${SUPABASE_DB_NAME:-postgres}"

# Schema mapping: service_dir:schema_name (bash 3.2 compatible)
SERVICES=(
  "orders:svc_orders"
  "media:svc_media"
  "projects:svc_projects"
)

require_db_password() {
  if [ -z "${POSTGRES_PASSWORD:-}" ]; then
    log_error "POSTGRES_PASSWORD is required. Set it via environment or .env.coolify"
    exit 1
  fi
  DIRECT_URL_BASE="postgresql://${SUPABASE_DB_USER}:${POSTGRES_PASSWORD}@${SUPABASE_DB_HOST}:${SUPABASE_DB_PORT}/${SUPABASE_DB_NAME}"
}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

cmd_init_db() {
  require_db_password
  log_info "Initializing schemas and extensions on Supabase DB..."
  PGPASSWORD="${POSTGRES_PASSWORD}" psql \
    -h "${SUPABASE_DB_HOST}" \
    -p "${SUPABASE_DB_PORT}" \
    -U "${SUPABASE_DB_USER}" \
    -d "${SUPABASE_DB_NAME}" \
    -f "${SCRIPT_DIR}/init-schemas.sql"
  log_info "Schema initialization complete."
}

cmd_push_schemas() {
  require_db_password
  log_info "Pushing Prisma schemas to Supabase (schema-per-service)..."

  local failed=0
  for entry in "${SERVICES[@]}"; do
    IFS=: read -r service_dir schema <<< "$entry"
    local prisma_dir="${REPO_ROOT}/services/${service_dir}/prisma"

    if [ ! -f "${prisma_dir}/schema.prisma" ]; then
      log_warn "No schema.prisma found for ${service_dir}, skipping"
      continue
    fi

    log_info "Pushing schema for ${service_dir} -> ${schema}..."
    local db_url="${DIRECT_URL_BASE}?schema=${schema}"

    if DATABASE_URL="${db_url}" DIRECT_URL="${db_url}" \
       npx prisma db push --schema="${prisma_dir}/schema.prisma" --skip-generate 2>&1; then
      log_info "  ${service_dir} -> ${schema} OK"
    else
      log_error "  ${service_dir} -> ${schema} FAILED"
      failed=$((failed + 1))
    fi
  done

  if [ $failed -gt 0 ]; then
    log_error "${failed} schema(s) failed to push"
    return 1
  fi
  log_info "All schemas pushed successfully."
}

cmd_seed() {
  require_db_password
  log_info "Seeding databases..."

  for entry in "${SERVICES[@]}"; do
    IFS=: read -r service_dir schema <<< "$entry"
    local seed_file="${REPO_ROOT}/services/${service_dir}/prisma/seed.js"
    local seed_ts="${REPO_ROOT}/services/${service_dir}/prisma/seed.ts"

    if [ -f "${seed_file}" ] || [ -f "${seed_ts}" ]; then
      log_info "Seeding ${service_dir} (${schema})..."
      local db_url="${DIRECT_URL_BASE}?schema=${schema}"
      DATABASE_URL="${db_url}" DIRECT_URL="${db_url}" \
        npx prisma db seed --schema="${REPO_ROOT}/services/${service_dir}/prisma/schema.prisma" 2>&1 || \
        log_warn "  Seed for ${service_dir} failed (may not have seed script configured)"
    fi
  done

  log_info "Seeding complete."
}

cmd_verify() {
  require_db_password
  log_info "Verifying schema isolation..."

  local all_ok=true
  for entry in "${SERVICES[@]}"; do
    IFS=: read -r service_dir schema <<< "$entry"
    local table_count
    table_count=$(PGPASSWORD="${POSTGRES_PASSWORD}" psql \
      -h "${SUPABASE_DB_HOST}" \
      -p "${SUPABASE_DB_PORT}" \
      -U "${SUPABASE_DB_USER}" \
      -d "${SUPABASE_DB_NAME}" \
      -t -A -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${schema}' AND table_type = 'BASE TABLE';" 2>/dev/null || echo "0")

    if [ "${table_count}" -gt 0 ] 2>/dev/null; then
      log_info "  ${schema}: ${table_count} tables"
    else
      log_warn "  ${schema}: no tables found (run push-schemas first)"
      all_ok=false
    fi
  done

  # Check extensions
  log_info "Checking extensions..."
  PGPASSWORD="${POSTGRES_PASSWORD}" psql \
    -h "${SUPABASE_DB_HOST}" \
    -p "${SUPABASE_DB_PORT}" \
    -U "${SUPABASE_DB_USER}" \
    -d "${SUPABASE_DB_NAME}" \
    -c "SELECT extname, extversion FROM pg_extension WHERE extname IN ('uuid-ossp');"

  if [ "${all_ok}" = true ]; then
    log_info "All schemas verified."
  else
    log_warn "Some schemas are empty. Run './deploy.sh push-schemas' first."
  fi
}

cmd_status() {
  require_db_password
  log_info "Checking infrastructure health..."

  # PostgreSQL
  if PGPASSWORD="${POSTGRES_PASSWORD}" psql \
    -h "${SUPABASE_DB_HOST}" -p "${SUPABASE_DB_PORT}" \
    -U "${SUPABASE_DB_USER}" -d "${SUPABASE_DB_NAME}" \
    -c "SELECT 1;" > /dev/null 2>&1; then
    log_info "  PostgreSQL (direct): OK"
  else
    log_error "  PostgreSQL (direct): FAILED"
  fi

  # Redis
  if redis-cli -h "${REDIS_HOST:-patina-redis}" -p "${REDIS_PORT:-6379}" \
    -a "${REDIS_PASSWORD:-}" ping > /dev/null 2>&1; then
    log_info "  Redis: OK"
  else
    log_warn "  Redis: not reachable (may need REDIS_HOST/REDIS_PASSWORD)"
  fi

  # MinIO
  if curl -sf "http://${MINIO_HOST:-patina-minio}:9000/minio/health/live" > /dev/null 2>&1; then
    log_info "  MinIO: OK"
  else
    log_warn "  MinIO: not reachable"
  fi
}

# Main
case "${1:-help}" in
  init-db)       cmd_init_db ;;
  push-schemas)  cmd_push_schemas ;;
  seed)          cmd_seed ;;
  verify)        cmd_verify ;;
  status)        cmd_status ;;
  *)
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  init-db       Run schema initialization SQL on Supabase DB"
    echo "  push-schemas  Push all Prisma schemas (prisma db push per service)"
    echo "  seed          Run seed scripts for all services"
    echo "  verify        Verify schemas exist and have tables"
    echo "  status        Check health of infrastructure services"
    echo ""
    echo "Environment variables:"
    echo "  POSTGRES_PASSWORD     (required) PostgreSQL password"
    echo "  SUPABASE_DB_HOST      (default: supabase-db)"
    echo "  SUPABASE_DB_PORT      (default: 5432)"
    echo "  SUPABASE_DB_USER      (default: postgres)"
    echo "  SUPABASE_DB_NAME      (default: postgres)"
    ;;
esac
