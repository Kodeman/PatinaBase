#!/usr/bin/env bash
# =============================================================================
# PATINA: Build Docker images locally and push to GitHub Container Registry
# =============================================================================
#
# Usage (from monorepo root):
#   ./infra/build-and-push.sh                     # Build + push all 6 services
#   ./infra/build-and-push.sh designer-portal      # Build + push one service
#   ./infra/build-and-push.sh --no-push            # Build only, don't push
#   ./infra/build-and-push.sh --deploy             # Build + push + restart Coolify
#   ./infra/build-and-push.sh --no-push orders     # Build one service locally
#
# Prerequisites:
#   1. docker login ghcr.io -u kodeman
#   2. docker buildx create --name patina-builder --driver docker-container --use
#   3. Fill in infra/.env with production values
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
REGISTRY="ghcr.io/kodeman"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

NEXTJS_APPS=(designer-portal admin-portal client-portal)
NESTJS_SERVICES=(orders media projects)

# App URL mapping (baked into Next.js at build time)
get_app_url() {
  case "$1" in
    designer-portal) echo "https://app.patina.cloud" ;;
    admin-portal)    echo "https://admin.patina.cloud" ;;
    client-portal)   echo "https://client.patina.cloud" ;;
  esac
}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# -----------------------------------------------------------------------------
# Parse arguments
# -----------------------------------------------------------------------------
PUSH=true
DEPLOY=false
TARGET=""

for arg in "$@"; do
  case "$arg" in
    --no-push)  PUSH=false ;;
    --deploy)   DEPLOY=true ;;
    --help|-h)
      head -20 "$0" | grep -E "^#" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      if [[ -z "$TARGET" ]]; then
        TARGET="$arg"
      else
        echo -e "${RED}Error: unexpected argument '$arg'${NC}" >&2
        exit 1
      fi
      ;;
  esac
done

# -----------------------------------------------------------------------------
# Validate environment
# -----------------------------------------------------------------------------
cd "$REPO_ROOT"

if [[ ! -f pnpm-workspace.yaml ]]; then
  echo -e "${RED}Error: must run from the monorepo root (or the script resolves it)${NC}" >&2
  exit 1
fi

if ! command -v docker &>/dev/null; then
  echo -e "${RED}Error: docker is not installed${NC}" >&2
  exit 1
fi

# Ensure buildx is available
if ! docker buildx version &>/dev/null; then
  echo -e "${RED}Error: docker buildx is required. Install Docker Desktop or buildx plugin.${NC}" >&2
  exit 1
fi

# Set up builder if it doesn't exist
if ! docker buildx inspect patina-builder &>/dev/null 2>&1; then
  echo -e "${YELLOW}Creating buildx builder 'patina-builder'...${NC}"
  docker buildx create --name patina-builder --driver docker-container --use
else
  docker buildx use patina-builder 2>/dev/null || true
fi

# Validate target if specified
if [[ -n "$TARGET" ]]; then
  VALID=false
  for app in "${NEXTJS_APPS[@]}" "${NESTJS_SERVICES[@]}"; do
    if [[ "$app" == "$TARGET" ]]; then
      VALID=true
      break
    fi
  done
  if [[ "$VALID" != "true" ]]; then
    echo -e "${RED}Error: unknown service '$TARGET'${NC}" >&2
    echo "Valid services: ${NEXTJS_APPS[*]} ${NESTJS_SERVICES[*]}"
    exit 1
  fi
fi

# -----------------------------------------------------------------------------
# Load environment variables for Next.js build args
# -----------------------------------------------------------------------------
if [[ -f "${SCRIPT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${SCRIPT_DIR}/.env"
  set +a
else
  echo -e "${YELLOW}Warning: infra/.env not found. Next.js NEXT_PUBLIC_* vars will be empty.${NC}"
fi

# Map ANON_KEY to NEXT_PUBLIC_SUPABASE_ANON_KEY if not already set
NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-${ANON_KEY:-}}"
NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-https://api.patina.cloud}"

# Git SHA for tagging
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  Patina Docker Build → GHCR                         ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Registry:  ${BLUE}${REGISTRY}${NC}"
echo -e "  Git SHA:   ${BLUE}${GIT_SHA}${NC}"
echo -e "  Push:      $(${PUSH} && echo -e "${GREEN}yes${NC}" || echo -e "${YELLOW}no${NC}")"
echo -e "  Deploy:    $(${DEPLOY} && echo -e "${GREEN}yes${NC}" || echo -e "${YELLOW}no${NC}")"
echo -e "  Target:    ${BLUE}${TARGET:-all}${NC}"
echo ""

# Buildx output flag
if $PUSH; then
  OUTPUT="--push"
else
  OUTPUT="--load"
  # --load only supports single platform
  PLATFORM="linux/amd64"
fi
PLATFORM="${PLATFORM:-linux/amd64}"

# -----------------------------------------------------------------------------
# Build functions
# -----------------------------------------------------------------------------
build_nextjs() {
  local app="$1"
  local app_url
  app_url="$(get_app_url "$app")"

  echo -e "${BLUE}━━━ Building ${BOLD}${app}${NC}${BLUE} (Next.js) ━━━${NC}"
  echo -e "  Image: ${REGISTRY}/${app}:${GIT_SHA}"

  docker buildx build \
    --platform "${PLATFORM}" \
    --build-arg APP_NAME="${app}" \
    --build-arg NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}" \
    --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
    --build-arg NEXT_PUBLIC_APP_URL="${app_url}" \
    --build-arg NEXT_PUBLIC_POSTHOG_KEY="${POSTHOG_KEY:-}" \
    --build-arg NEXT_PUBLIC_POSTHOG_HOST="${POSTHOG_HOST:-}" \
    -t "${REGISTRY}/${app}:latest" \
    -t "${REGISTRY}/${app}:${GIT_SHA}" \
    -f infra/Dockerfile.nextjs \
    ${OUTPUT} \
    .

  echo -e "${GREEN}  ✓ ${app} built${PUSH:+ and pushed}${NC}"
  echo ""
}

build_nestjs() {
  local svc="$1"

  echo -e "${BLUE}━━━ Building ${BOLD}${svc}${NC}${BLUE} (NestJS) ━━━${NC}"
  echo -e "  Image: ${REGISTRY}/${svc}:${GIT_SHA}"

  docker buildx build \
    --platform "${PLATFORM}" \
    --build-arg SERVICE_NAME="${svc}" \
    -t "${REGISTRY}/${svc}:latest" \
    -t "${REGISTRY}/${svc}:${GIT_SHA}" \
    -f infra/Dockerfile.nestjs \
    ${OUTPUT} \
    .

  echo -e "${GREEN}  ✓ ${svc} built${PUSH:+ and pushed}${NC}"
  echo ""
}

# -----------------------------------------------------------------------------
# Build
# -----------------------------------------------------------------------------
BUILT=()

if [[ -n "$TARGET" ]]; then
  # Build single target
  for app in "${NEXTJS_APPS[@]}"; do
    if [[ "$app" == "$TARGET" ]]; then
      build_nextjs "$TARGET"
      BUILT+=("$TARGET")
    fi
  done
  for svc in "${NESTJS_SERVICES[@]}"; do
    if [[ "$svc" == "$TARGET" ]]; then
      build_nestjs "$TARGET"
      BUILT+=("$TARGET")
    fi
  done
else
  # Build all
  for app in "${NEXTJS_APPS[@]}"; do
    build_nextjs "$app"
    BUILT+=("$app")
  done
  for svc in "${NESTJS_SERVICES[@]}"; do
    build_nestjs "$svc"
    BUILT+=("$svc")
  done
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  Build Complete                                      ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
for name in "${BUILT[@]}"; do
  echo -e "  ${GREEN}✓${NC} ${REGISTRY}/${name}:${GIT_SHA}"
  if $PUSH; then
    echo -e "    ${REGISTRY}/${name}:latest"
  fi
done
echo ""

# -----------------------------------------------------------------------------
# Deploy (optional)
# -----------------------------------------------------------------------------
if $DEPLOY; then
  echo -e "${BLUE}Triggering Coolify deployment...${NC}"

  if [[ ! -f "${SCRIPT_DIR}/coolify/.env.coolify" ]]; then
    echo -e "${RED}Error: infra/coolify/.env.coolify not found. Cannot trigger deploy.${NC}" >&2
    exit 1
  fi

  set -a
  # shellcheck disable=SC1091
  source "${SCRIPT_DIR}/coolify/.env.coolify"
  set +a

  COOLIFY_API="${COOLIFY_FQDN}/api/v1"

  # Restart the backend services compose resource
  echo -e "  Restarting backend services..."
  curl -s -X POST "${COOLIFY_API}/services/${BACKEND_SERVICES_UUID:-vo0gs8wg0s0o8wcgsg8c0o8k}/restart" \
    -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
    -H "Content-Type: application/json" || echo "  (backend restart request sent)"

  # Restart frontend apps (if they're compose-based)
  # If deployed as individual Coolify apps, restart each one
  for uuid_var in DESIGNER_PORTAL_UUID ADMIN_PORTAL_UUID CLIENT_PORTAL_UUID; do
    uuid="${!uuid_var:-}"
    if [[ -n "$uuid" ]]; then
      echo -e "  Restarting ${uuid_var}..."
      curl -s -X POST "${COOLIFY_API}/applications/${uuid}/restart" \
        -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
        -H "Content-Type: application/json" || true
    fi
  done

  echo -e "${GREEN}Deploy triggered. Monitor at ${COOLIFY_FQDN}${NC}"
fi

echo -e "${GREEN}Done.${NC}"
