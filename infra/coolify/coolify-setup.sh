#!/usr/bin/env bash
# Patina Coolify Setup - Automates resource creation via Coolify REST API
#
# Usage: ./coolify-setup.sh [command]
#   setup-all        Create all resources (infra + backends + frontends)
#   setup-infra      Create Supabase + Infrastructure compose stacks only
#   setup-backends   Create all backend service applications
#   setup-frontends  Create all frontend applications
#   deploy-all       Trigger deploy on all resources
#   status           Show status of all resources
#   update-envs      Re-push env vars from config to all resources

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load config from .env.coolify if it exists
if [ -f "${SCRIPT_DIR}/.env.coolify" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${SCRIPT_DIR}/.env.coolify"
  set +a
fi

# Required configuration
COOLIFY_FQDN="${COOLIFY_FQDN:?Set COOLIFY_FQDN in .env.coolify (e.g. http://your-server:8000)}"
COOLIFY_TOKEN="${COOLIFY_TOKEN:?Set COOLIFY_TOKEN in .env.coolify}"
COOLIFY_PROJECT_UUID="${COOLIFY_PROJECT_UUID:?Set COOLIFY_PROJECT_UUID in .env.coolify}"
COOLIFY_SERVER_UUID="${COOLIFY_SERVER_UUID:?Set COOLIFY_SERVER_UUID in .env.coolify}"
COOLIFY_ENVIRONMENT="${COOLIFY_ENVIRONMENT:-production}"

COOLIFY_API="${COOLIFY_FQDN}/api/v1"

# Git config
GIT_REPOSITORY="${GIT_REPOSITORY:?Set GIT_REPOSITORY in .env.coolify}"
GIT_BRANCH="${GIT_BRANCH:-main}"

# Shared secrets (required for env var pushes)
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
JWT_SECRET="${JWT_SECRET:-}"
CORS_ORIGINS="${CORS_ORIGINS:-https://app.patina.cloud,https://admin.patina.cloud,https://client.patina.cloud}"

# Supabase auth vars
ANON_KEY="${ANON_KEY:-}"
SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:-}"
NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-https://api.patina.cloud}"
NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-${ANON_KEY}}"

# Service-specific vars
STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-}"
STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-}"
EASYPOST_API_KEY="${EASYPOST_API_KEY:-}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-patina}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-}"
S3_BUCKET="${S3_BUCKET:-patina-media}"
S3_REGION="${S3_REGION:-us-east-1}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $1" >&2; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1" >&2; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
log_step()  { echo -e "${BLUE}[STEP]${NC}  $1" >&2; }

# =============================================================================
# API Helper Functions
# =============================================================================

api_get() {
  local response
  response=$(curl -sf -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
    -H "Content-Type: application/json" \
    "${COOLIFY_API}/$1" 2>/dev/null) || {
    log_error "API GET /$1 failed"
    return 1
  }
  echo "$response"
}

api_post() {
  local response
  response=$(curl -sf -X POST -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$2" "${COOLIFY_API}/$1" 2>/dev/null) || {
    log_error "API POST /$1 failed"
    return 1
  }
  echo "$response"
}

api_patch() {
  local response
  response=$(curl -sf -X PATCH -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$2" "${COOLIFY_API}/$1" 2>/dev/null) || {
    log_error "API PATCH /$1 failed"
    return 1
  }
  echo "$response"
}

find_service_by_name() {
  local name="$1"
  api_get "services" | jq -r ".[] | select(.name == \"${name}\") | .uuid // empty" 2>/dev/null || echo ""
}

find_app_by_name() {
  local name="$1"
  api_get "applications" | jq -r ".[] | select(.name == \"${name}\") | .uuid // empty" 2>/dev/null || echo ""
}

push_env() {
  local resource_type="$1" uuid="$2" key="$3" value="$4"
  local payload
  payload=$(jq -n --arg k "$key" --arg v "$value" \
    '{key: $k, value: $v, is_literal: true}')
  # Try POST (create), fall back to PATCH (update) if already exists
  api_post "${resource_type}/${uuid}/envs" "$payload" > /dev/null 2>&1 || \
    api_patch "${resource_type}/${uuid}/envs" "$payload" > /dev/null 2>&1 || \
    log_warn "  Failed to set ${key} on ${resource_type}/${uuid}"
}

# =============================================================================
# Service Registry
# =============================================================================

# Backend services: name:port:schema
BACKENDS=(
  "orders:3015:svc_orders"
  "media:3014:svc_media"
  "projects:3016:svc_projects"
)

# Frontend apps: name:port:domain
FRONTENDS=(
  "designer-portal:3000:app.patina.cloud"
  "admin-portal:3001:admin.patina.cloud"
  "client-portal:3002:client.patina.cloud"
)

# =============================================================================
# Compose Stack Setup (Supabase + Infrastructure)
# =============================================================================

setup_compose_stack() {
  local name="$1" compose_file="$2"
  local uuid

  uuid=$(find_service_by_name "$name")

  if [ -n "$uuid" ]; then
    log_info "Service '${name}' already exists (${uuid}), skipping creation"
    echo "$uuid"
    return
  fi

  if [ ! -f "$compose_file" ]; then
    log_error "Compose file not found: ${compose_file}"
    return 1
  fi

  local yaml_b64
  yaml_b64=$(base64 -i "$compose_file")

  local payload
  payload=$(jq -n \
    --arg project "$COOLIFY_PROJECT_UUID" \
    --arg server "$COOLIFY_SERVER_UUID" \
    --arg env "$COOLIFY_ENVIRONMENT" \
    --arg name "$name" \
    --arg compose "$yaml_b64" \
    '{
      project_uuid: $project,
      server_uuid: $server,
      environment_name: $env,
      name: $name,
      docker_compose_raw: $compose
    }')

  uuid=$(api_post "services" "$payload" | jq -r '.uuid // empty')

  if [ -z "$uuid" ]; then
    log_error "Failed to create service '${name}'"
    return 1
  fi

  log_info "Created service '${name}' (${uuid})"
  echo "$uuid"
}

setup_supabase_stack() {
  log_step "Setting up Supabase stack..."
  local uuid
  uuid=$(setup_compose_stack "patina-supabase" "${SCRIPT_DIR}/../docker-compose.supabase.yml")

  if [ -n "$uuid" ] && [ -n "$POSTGRES_PASSWORD" ]; then
    log_info "Pushing Supabase env vars..."
    push_env "services" "$uuid" "POSTGRES_PASSWORD" "$POSTGRES_PASSWORD"
    push_env "services" "$uuid" "JWT_SECRET" "$JWT_SECRET"
    push_env "services" "$uuid" "ANON_KEY" "$ANON_KEY"
    push_env "services" "$uuid" "SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY"
    push_env "services" "$uuid" "SITE_URL" "${SITE_URL:-https://app.patina.cloud}"
    push_env "services" "$uuid" "API_EXTERNAL_URL" "${API_EXTERNAL_URL:-https://api.patina.cloud}"
    push_env "services" "$uuid" "DASHBOARD_USERNAME" "${DASHBOARD_USERNAME:-supabase}"
    push_env "services" "$uuid" "DASHBOARD_PASSWORD" "${DASHBOARD_PASSWORD:-}"
    # SMTP
    push_env "services" "$uuid" "SMTP_HOST" "${SMTP_HOST:-smtp.resend.com}"
    push_env "services" "$uuid" "SMTP_PORT" "${SMTP_PORT:-587}"
    push_env "services" "$uuid" "SMTP_USER" "${SMTP_USER:-}"
    push_env "services" "$uuid" "SMTP_PASS" "${SMTP_PASS:-}"
    push_env "services" "$uuid" "SMTP_ADMIN_EMAIL" "${SMTP_ADMIN_EMAIL:-hello@patina.cloud}"
    log_info "Supabase env vars pushed"
  fi
}

setup_infra_stack() {
  log_step "Setting up Infrastructure stack (Redis + MinIO)..."
  local uuid
  uuid=$(setup_compose_stack "patina-infra" "${SCRIPT_DIR}/docker-compose.infra.yml")

  if [ -n "$uuid" ] && [ -n "$REDIS_PASSWORD" ]; then
    log_info "Pushing Infrastructure env vars..."
    push_env "services" "$uuid" "REDIS_PASSWORD" "$REDIS_PASSWORD"
    push_env "services" "$uuid" "MINIO_ROOT_USER" "$MINIO_ROOT_USER"
    push_env "services" "$uuid" "MINIO_ROOT_PASSWORD" "${MINIO_ROOT_PASSWORD:-$(openssl rand -base64 24)}"
    log_info "Infrastructure env vars pushed"
  fi
}

# =============================================================================
# Backend Service Setup
# =============================================================================

setup_backend() {
  local name="$1" port="$2" schema="$3"
  local uuid

  uuid=$(find_app_by_name "$name")

  if [ -n "$uuid" ]; then
    log_info "App '${name}' already exists (${uuid}), updating envs only"
  else
    local payload
    payload=$(jq -n \
      --arg project "$COOLIFY_PROJECT_UUID" \
      --arg server "$COOLIFY_SERVER_UUID" \
      --arg env "$COOLIFY_ENVIRONMENT" \
      --arg name "$name" \
      --arg repo "$GIT_REPOSITORY" \
      --arg branch "$GIT_BRANCH" \
      --arg port "$port" \
      '{
        project_uuid: $project,
        server_uuid: $server,
        environment_name: $env,
        name: $name,
        git_repository: $repo,
        git_branch: $branch,
        build_pack: "dockerfile",
        dockerfile: "infra/Dockerfile.nestjs",
        ports_exposes: $port
      }')

    uuid=$(api_post "applications/public" "$payload" | jq -r '.uuid // empty')

    if [ -z "$uuid" ]; then
      log_error "Failed to create app '${name}'"
      return 1
    fi

    log_info "Created app '${name}' (${uuid})"

    # Set build args for the centralized Dockerfile
    api_patch "applications/${uuid}" \
      "$(jq -n --arg svc "$name" '{docker_compose_custom_build_command: ("--build-arg SERVICE_NAME=" + $svc)}')" \
      > /dev/null 2>&1 || \
      log_warn "Failed to set build args on '${name}' — set SERVICE_NAME build arg manually"
  fi

  # Push standard env vars
  if [ -n "$POSTGRES_PASSWORD" ]; then
    push_env "applications" "$uuid" "NODE_ENV" "production"
    push_env "applications" "$uuid" "PORT" "$port"
    push_env "applications" "$uuid" "DATABASE_URL" \
      "postgresql://postgres:${POSTGRES_PASSWORD}@supabase-db:5432/postgres?schema=${schema}"
    push_env "applications" "$uuid" "REDIS_HOST" "patina-redis"
    push_env "applications" "$uuid" "REDIS_PORT" "6379"
    push_env "applications" "$uuid" "REDIS_PASSWORD" "$REDIS_PASSWORD"
    push_env "applications" "$uuid" "SUPABASE_JWT_SECRET" "$JWT_SECRET"
    push_env "applications" "$uuid" "CORS_ORIGINS" "$CORS_ORIGINS"

    # Per-service env vars
    case "$name" in
      orders)
        push_env "applications" "$uuid" "STRIPE_SECRET_KEY" "$STRIPE_SECRET_KEY"
        push_env "applications" "$uuid" "STRIPE_WEBHOOK_SECRET" "$STRIPE_WEBHOOK_SECRET"
        push_env "applications" "$uuid" "EASYPOST_API_KEY" "$EASYPOST_API_KEY"
        ;;
      media)
        push_env "applications" "$uuid" "S3_ENDPOINT" "http://patina-minio:9000"
        push_env "applications" "$uuid" "S3_ACCESS_KEY" "$MINIO_ROOT_USER"
        push_env "applications" "$uuid" "S3_SECRET_KEY" "$MINIO_ROOT_PASSWORD"
        push_env "applications" "$uuid" "S3_BUCKET" "$S3_BUCKET"
        push_env "applications" "$uuid" "S3_REGION" "$S3_REGION"
        ;;
      projects)
        # No additional config needed
        ;;
    esac

    log_info "Env vars pushed for '${name}'"
  else
    log_warn "Skipping env vars for '${name}' (POSTGRES_PASSWORD not set)"
  fi
}

setup_all_backends() {
  log_step "Setting up backend services..."
  for entry in "${BACKENDS[@]}"; do
    IFS=: read -r name port schema <<< "$entry"
    setup_backend "$name" "$port" "$schema"
  done
  log_info "All backend services configured"
}

# =============================================================================
# Frontend App Setup
# =============================================================================

setup_frontend() {
  local name="$1" port="$2" domain="$3"
  local uuid

  uuid=$(find_app_by_name "$name")

  if [ -n "$uuid" ]; then
    log_info "App '${name}' already exists (${uuid}), updating envs only"
  else
    local payload
    payload=$(jq -n \
      --arg project "$COOLIFY_PROJECT_UUID" \
      --arg server "$COOLIFY_SERVER_UUID" \
      --arg env "$COOLIFY_ENVIRONMENT" \
      --arg name "$name" \
      --arg repo "$GIT_REPOSITORY" \
      --arg branch "$GIT_BRANCH" \
      --arg port "$port" \
      '{
        project_uuid: $project,
        server_uuid: $server,
        environment_name: $env,
        name: $name,
        git_repository: $repo,
        git_branch: $branch,
        build_pack: "dockerfile",
        dockerfile: "infra/Dockerfile.nextjs",
        ports_exposes: $port
      }')

    uuid=$(api_post "applications/public" "$payload" | jq -r '.uuid // empty')

    if [ -z "$uuid" ]; then
      log_error "Failed to create app '${name}'"
      return 1
    fi

    log_info "Created app '${name}' (${uuid})"

    # Set domain via PATCH (not allowed during creation)
    api_patch "applications/${uuid}" \
      "$(jq -n --arg d "https://${domain}" '{domains: $d}')" > /dev/null 2>&1 && \
      log_info "Set domain https://${domain} on '${name}'" || \
      log_warn "Failed to set domain on '${name}' -- set manually in Coolify UI"

    # Set build args for centralized Dockerfile
    local build_args="--build-arg APP_NAME=${name}"
    build_args="${build_args} --build-arg NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}"
    build_args="${build_args} --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}"
    build_args="${build_args} --build-arg NEXT_PUBLIC_APP_URL=https://${domain}"

    api_patch "applications/${uuid}" \
      "$(jq -n --arg args "$build_args" '{docker_compose_custom_build_command: $args}')" \
      > /dev/null 2>&1 || \
      log_warn "Failed to set build args on '${name}' -- set APP_NAME build arg manually"
  fi

  # Push frontend env vars (Supabase Auth, not NextAuth)
  push_env "applications" "$uuid" "NODE_ENV" "production"
  push_env "applications" "$uuid" "NEXT_PUBLIC_SUPABASE_URL" "$NEXT_PUBLIC_SUPABASE_URL"
  push_env "applications" "$uuid" "NEXT_PUBLIC_SUPABASE_ANON_KEY" "$NEXT_PUBLIC_SUPABASE_ANON_KEY"
  push_env "applications" "$uuid" "NEXT_PUBLIC_APP_URL" "https://${domain}"
  push_env "applications" "$uuid" "NEXT_PUBLIC_API_URL" "/api"

  # Inter-service URLs (server-side only, 3 backends)
  push_env "applications" "$uuid" "ORDERS_SERVICE_URL" "http://patina-orders:3015"
  push_env "applications" "$uuid" "MEDIA_SERVICE_URL" "http://patina-media:3014"
  push_env "applications" "$uuid" "PROJECTS_SERVICE_URL" "http://patina-projects:3016"

  log_info "Env vars pushed for '${name}'"
}

setup_all_frontends() {
  log_step "Setting up frontend applications..."
  for entry in "${FRONTENDS[@]}"; do
    IFS=: read -r name port domain <<< "$entry"
    setup_frontend "$name" "$port" "$domain"
  done
  log_info "All frontend applications configured"
}

# =============================================================================
# Deploy Commands
# =============================================================================

deploy_services() {
  log_step "Deploying compose stacks..."
  for name in "patina-supabase" "patina-infra"; do
    local uuid
    uuid=$(find_service_by_name "$name")
    if [ -n "$uuid" ]; then
      api_post "services/${uuid}/start" "{}" > /dev/null 2>&1 && \
        log_info "Started service '${name}'" || \
        log_error "Failed to start '${name}'"
    else
      log_warn "Service '${name}' not found, skipping"
    fi
  done
}

deploy_applications() {
  log_step "Deploying applications..."
  local all_apps=("${BACKENDS[@]}" "${FRONTENDS[@]}")
  for entry in "${all_apps[@]}"; do
    IFS=: read -r name _ _ <<< "$entry"
    local uuid
    uuid=$(find_app_by_name "$name")
    if [ -n "$uuid" ]; then
      api_post "applications/${uuid}/start" "{}" > /dev/null 2>&1 && \
        log_info "Deployed '${name}'" || \
        log_error "Failed to deploy '${name}'"
    else
      log_warn "App '${name}' not found, skipping"
    fi
  done
}

# =============================================================================
# Status Command
# =============================================================================

cmd_status() {
  log_step "Checking Coolify resources..."

  echo ""
  echo -e "${BLUE}Compose Stacks:${NC}"
  for name in "patina-supabase" "patina-infra"; do
    local uuid
    uuid=$(find_service_by_name "$name")
    if [ -n "$uuid" ]; then
      local status
      status=$(api_get "services/${uuid}" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
      echo -e "  ${name}: ${GREEN}${uuid}${NC} (${status})"
    else
      echo -e "  ${name}: ${RED}not created${NC}"
    fi
  done

  echo ""
  echo -e "${BLUE}Backend Services:${NC}"
  for entry in "${BACKENDS[@]}"; do
    IFS=: read -r name port _ <<< "$entry"
    local uuid
    uuid=$(find_app_by_name "$name")
    if [ -n "$uuid" ]; then
      local status
      status=$(api_get "applications/${uuid}" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
      echo -e "  ${name} (:${port}): ${GREEN}${uuid}${NC} (${status})"
    else
      echo -e "  ${name} (:${port}): ${RED}not created${NC}"
    fi
  done

  echo ""
  echo -e "${BLUE}Frontend Apps:${NC}"
  for entry in "${FRONTENDS[@]}"; do
    IFS=: read -r name port domain <<< "$entry"
    local uuid
    uuid=$(find_app_by_name "$name")
    if [ -n "$uuid" ]; then
      local status
      status=$(api_get "applications/${uuid}" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
      echo -e "  ${name} (${domain}): ${GREEN}${uuid}${NC} (${status})"
    else
      echo -e "  ${name} (${domain}): ${RED}not created${NC}"
    fi
  done
  echo ""
}

# =============================================================================
# Update Envs Command
# =============================================================================

cmd_update_envs() {
  log_step "Re-pushing env vars to all resources..."

  # Re-push backend envs
  for entry in "${BACKENDS[@]}"; do
    IFS=: read -r name port schema <<< "$entry"
    local uuid
    uuid=$(find_app_by_name "$name")
    if [ -n "$uuid" ]; then
      setup_backend "$name" "$port" "$schema"
    else
      log_warn "App '${name}' not found, skipping env update"
    fi
  done

  # Re-push frontend envs
  for entry in "${FRONTENDS[@]}"; do
    IFS=: read -r name port domain <<< "$entry"
    local uuid
    uuid=$(find_app_by_name "$name")
    if [ -n "$uuid" ]; then
      setup_frontend "$name" "$port" "$domain"
    else
      log_warn "App '${name}' not found, skipping env update"
    fi
  done

  log_info "All env vars updated"
}

# =============================================================================
# Main
# =============================================================================

case "${1:-help}" in
  setup-all)
    setup_supabase_stack
    setup_infra_stack
    setup_all_backends
    setup_all_frontends
    echo ""
    log_info "All resources created. Run './coolify-setup.sh deploy-all' to deploy."
    ;;
  setup-infra)
    setup_supabase_stack
    setup_infra_stack
    ;;
  setup-backends)
    setup_all_backends
    ;;
  setup-frontends)
    setup_all_frontends
    ;;
  deploy-all)
    deploy_services
    deploy_applications
    log_info "All deployments triggered"
    ;;
  status)
    cmd_status
    ;;
  update-envs)
    cmd_update_envs
    ;;
  *)
    echo "Patina Coolify Setup - Automates resource creation via Coolify API"
    echo ""
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  setup-all        Create all resources (infra + backends + frontends)"
    echo "  setup-infra      Create Supabase + Infrastructure compose stacks only"
    echo "  setup-backends   Create all backend service applications"
    echo "  setup-frontends  Create all frontend applications"
    echo "  deploy-all       Trigger deploy on all resources"
    echo "  status           Show status of all resources"
    echo "  update-envs      Re-push env vars from config to all resources"
    echo ""
    echo "Prerequisites:"
    echo "  1. Copy .env.coolify.example to .env.coolify and fill in values"
    echo "  2. Requires: curl, jq"
    echo ""
    echo "Environment:"
    echo "  COOLIFY_FQDN             Coolify server URL (e.g. http://your-server:8000)"
    echo "  COOLIFY_TOKEN            API token (Settings -> Keys & Tokens)"
    echo "  COOLIFY_PROJECT_UUID     Project UUID (from GET /api/v1/projects)"
    echo "  COOLIFY_SERVER_UUID      Server UUID (from GET /api/v1/servers)"
    ;;
esac
