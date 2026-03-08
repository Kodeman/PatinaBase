#!/usr/bin/env bash
# Patina Coolify Deploy & Monitor -- Orchestrated deployment with dependency ordering
#
# Usage: ./coolify-deploy.sh [command]
#   deploy-all       Deploy infra -> backends -> frontends (ordered, monitored)
#   deploy-infra     Deploy Supabase + Infrastructure stacks only
#   deploy-backends  Deploy all backend services (waits for infra)
#   deploy-frontends Deploy all frontend apps (waits for backends)
#   status           Show live status of all resources
#   logs <name>      Show recent deployment logs for an application
#   stop-all         Stop all resources (frontends -> backends -> infra)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load config from .env.coolify
if [ -f "${SCRIPT_DIR}/.env.coolify" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${SCRIPT_DIR}/.env.coolify"
  set +a
fi

# Required configuration
COOLIFY_FQDN="${COOLIFY_FQDN:?Set COOLIFY_FQDN in .env.coolify (e.g. https://coolify.patina.cloud)}"
COOLIFY_TOKEN="${COOLIFY_TOKEN:?Set COOLIFY_TOKEN in .env.coolify}"
COOLIFY_API="${COOLIFY_FQDN}/api/v1"

# Timeouts (seconds)
INFRA_TIMEOUT="${INFRA_TIMEOUT:-180}"
BACKEND_TIMEOUT="${BACKEND_TIMEOUT:-300}"
FRONTEND_TIMEOUT="${FRONTEND_TIMEOUT:-300}"
APP_RUNNING_TIMEOUT="${APP_RUNNING_TIMEOUT:-60}"
POLL_INTERVAL="${POLL_INTERVAL:-5}"

# All 3 backends are critical -- if any fails, abort before frontends
CRITICAL_BACKENDS="orders media projects"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Detect interactive terminal
if [ -t 1 ]; then
  INTERACTIVE=true
else
  INTERACTIVE=false
fi

log_info()  { echo -e "${GREEN}[INFO]${NC}  $1" >&2; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1" >&2; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
log_step()  { echo -e "${BLUE}[STEP]${NC}  $1" >&2; }

# =============================================================================
# API Helpers
# =============================================================================

api_get() {
  curl -sf -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
    -H "Content-Type: application/json" \
    "${COOLIFY_API}/$1" 2>/dev/null
}

api_post() {
  local response http_code
  response=$(curl -s -w "\n%{http_code}" -X POST -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "${2:-{}}" "${COOLIFY_API}/$1" 2>/dev/null)
  http_code=$(echo "$response" | tail -1)
  response=$(echo "$response" | sed '$d')

  if [ "$http_code" -ge 400 ] 2>/dev/null; then
    log_error "API POST $1 returned HTTP ${http_code}: ${response}" >&2
    return 1
  fi
  printf '%s' "$response"
}

find_service_by_name() {
  curl -sf -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
    -H "Content-Type: application/json" \
    "${COOLIFY_API}/services" 2>/dev/null \
    | jq -r ".[] | select(.name == \"$1\") | .uuid // empty" 2>/dev/null || echo ""
}

find_app_by_name() {
  curl -sf -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
    -H "Content-Type: application/json" \
    "${COOLIFY_API}/applications" 2>/dev/null \
    | jq -r ".[] | select(.name == \"$1\") | .uuid // empty" 2>/dev/null || echo ""
}

# =============================================================================
# Service Registry (matches coolify-setup.sh)
# =============================================================================

BACKENDS=(
  "orders:3015"
  "media:3014"
  "projects:3016"
)

FRONTENDS=(
  "designer-portal:3000"
  "admin-portal:3001"
  "client-portal:3002"
)

INFRA_SERVICES=("patina-supabase" "patina-infra")

# =============================================================================
# Formatting Helpers
# =============================================================================

format_elapsed() {
  local secs="$1"
  if [ "$secs" -ge 60 ]; then
    printf "%dm %02ds" $((secs / 60)) $((secs % 60))
  else
    printf "%ds" "$secs"
  fi
}

status_color() {
  local status="$1"
  case "$status" in
    *running*|*healthy*|finished)
      echo -e "${GREEN}${status}${NC}" ;;
    *building*|*starting*|*in_progress*|*progress*)
      echo -e "${YELLOW}${status}${NC}" ;;
    *failed*|*error*|*exited*)
      echo -e "${RED}${status}${NC}" ;;
    *)
      echo -e "${DIM}${status}${NC}" ;;
  esac
}

# =============================================================================
# Core: Wait for a compose service to become healthy
# =============================================================================

wait_for_service() {
  local uuid="$1" name="$2" timeout_secs="$3"
  local start_time elapsed status last_status=""

  start_time=$(date +%s)
  log_info "Waiting for service '${name}' to become healthy (timeout: ${timeout_secs}s)..."

  while true; do
    elapsed=$(( $(date +%s) - start_time ))

    status=$(api_get "services/${uuid}" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")

    # Accept running (fully healthy) or degraded (some non-critical containers exited)
    if [[ "$status" == *"running"* ]] || [[ "$status" == *"degraded"* ]]; then
      log_info "Service '${name}' is $(status_color "$status") [$(format_elapsed "$elapsed")]"
      if [[ "$status" == *"degraded"* ]]; then
        log_warn "Service '${name}' is degraded -- some containers may not be running"
        api_get "services/${uuid}" | jq -r '
          (.applications[]? | "  app: \(.name) -> \(.status)"),
          (.databases[]? | "  db:  \(.name) -> \(.status)")
        ' 2>/dev/null >&2 || true
      fi
      return 0
    fi

    if [ "$elapsed" -ge "$timeout_secs" ]; then
      log_error "Service '${name}' timed out after $(format_elapsed "$elapsed") (status: ${status})"
      api_get "services/${uuid}" | jq -r '
        (.applications[]? | "  app: \(.name) -> \(.status)"),
        (.databases[]? | "  db:  \(.name) -> \(.status)")
      ' 2>/dev/null >&2 || true
      return 1
    fi

    if [[ "$status" == *"failed"* ]] || [[ "$status" == *"error"* ]]; then
      log_error "Service '${name}' failed (status: ${status})"
      return 1
    fi

    # Only log when status changes or every ~30s to reduce noise
    if [[ "$status" != "$last_status" ]] || (( elapsed % 30 < POLL_INTERVAL )); then
      if "$INTERACTIVE"; then
        printf "\r  ${DIM}%-25s${NC} %-30s ${DIM}[%s]${NC}  " \
          "$name" "$(status_color "$status")" "$(format_elapsed "$elapsed")" >&2
      else
        log_info "  ${name}: ${status} [$(format_elapsed "$elapsed")]"
      fi
    fi
    last_status="$status"

    sleep "$POLL_INTERVAL"
  done
}

# =============================================================================
# Core: Deploy an application and get deployment UUID
# =============================================================================

deploy_app() {
  local uuid="$1" name="$2"
  local response deployment_uuid

  response=$(api_post "applications/${uuid}/start" "{}") || {
    log_error "Failed to start '${name}'"
    echo ""
    return 1
  }

  deployment_uuid=$(echo "$response" | jq -r '.deployment_uuid // empty' 2>/dev/null)

  if [ -z "$deployment_uuid" ]; then
    log_warn "No deployment_uuid returned for '${name}' -- will poll app status directly"
    echo ""
    return 0
  fi

  echo "$deployment_uuid"
}

# =============================================================================
# Core: Wait for a deployment to finish (build phase)
# =============================================================================

wait_for_deployment() {
  local deployment_uuid="$1" name="$2" timeout_secs="$3"
  local start_time elapsed status

  if [ -z "$deployment_uuid" ]; then
    return 0
  fi

  start_time=$(date +%s)

  while true; do
    elapsed=$(( $(date +%s) - start_time ))

    status=$(api_get "deployments/${deployment_uuid}" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")

    case "$status" in
      finished)
        return 0
        ;;
      failed)
        log_error "Deployment of '${name}' failed"
        show_deployment_logs_by_uuid "$deployment_uuid" 20
        return 1
        ;;
    esac

    if [ "$elapsed" -ge "$timeout_secs" ]; then
      log_error "Deployment of '${name}' timed out after $(format_elapsed "$elapsed")"
      return 1
    fi

    sleep "$POLL_INTERVAL"
  done
}

# =============================================================================
# Core: Wait for app to reach running status after build
# =============================================================================

wait_for_app_running() {
  local uuid="$1" name="$2" timeout_secs="${3:-$APP_RUNNING_TIMEOUT}"
  local start_time elapsed status

  start_time=$(date +%s)

  while true; do
    elapsed=$(( $(date +%s) - start_time ))

    status=$(api_get "applications/${uuid}" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")

    if [[ "$status" == *"running"* ]]; then
      return 0
    fi

    if [ "$elapsed" -ge "$timeout_secs" ]; then
      log_warn "'${name}' not yet running after build (status: ${status})"
      return 1
    fi

    if [[ "$status" == *"failed"* ]] || [[ "$status" == *"exited"* ]]; then
      log_error "'${name}' failed to start (status: ${status})"
      return 1
    fi

    sleep 3
  done
}

# =============================================================================
# Core: Show deployment logs
# =============================================================================

show_deployment_logs_by_uuid() {
  local deployment_uuid="$1" max_lines="${2:-50}"
  local logs_raw

  logs_raw=$(api_get "deployments/${deployment_uuid}" | jq -r '.logs // empty' 2>/dev/null) || return 0

  if [ -z "$logs_raw" ]; then
    echo "  (no logs available)" >&2
    return 0
  fi

  echo -e "\n${DIM}--- Last ${max_lines} lines of deployment logs ---${NC}" >&2
  # logs may be a JSON string or plain text
  if echo "$logs_raw" | jq -e . > /dev/null 2>&1; then
    echo "$logs_raw" | jq -r '.[]? // .' 2>/dev/null | tail -n "$max_lines" >&2
  else
    echo "$logs_raw" | tail -n "$max_lines" >&2
  fi
  echo -e "${DIM}--- end logs ---${NC}" >&2
}

# =============================================================================
# Parallel Backend/Frontend Deploy with Monitoring
# =============================================================================

deploy_and_monitor_apps() {
  local -n app_list=$1
  local timeout_secs="$2"
  local phase_name="$3"

  local total=${#app_list[@]}
  local succeeded=0 failed=0 failed_names=""
  local start_time
  start_time=$(date +%s)

  # Arrays to track deployments
  local app_names=() app_uuids=() deploy_uuids=() app_statuses=()

  log_step "Starting ${total} ${phase_name}..."

  # Phase 1: Fire all start requests
  for entry in "${app_list[@]}"; do
    IFS=: read -r name _ <<< "$entry"
    local uuid
    uuid=$(find_app_by_name "$name")

    if [ -z "$uuid" ]; then
      log_warn "App '${name}' not found in Coolify -- skipping"
      failed=$((failed + 1))
      failed_names="${failed_names} ${name}"
      continue
    fi

    local deployment_uuid
    deployment_uuid=$(deploy_app "$uuid" "$name")

    app_names+=("$name")
    app_uuids+=("$uuid")
    deploy_uuids+=("$deployment_uuid")
    app_statuses+=("starting")
  done

  local active_count=${#app_names[@]}
  if [ "$active_count" -eq 0 ]; then
    log_error "No apps to deploy"
    return 1
  fi

  log_info "Triggered ${active_count} deployments, monitoring progress..."

  # Phase 2: Poll loop
  while true; do
    local all_done=true
    local global_elapsed=$(( $(date +%s) - start_time ))
    local display_lines=()

    for i in "${!app_names[@]}"; do
      local name="${app_names[$i]}"
      local uuid="${app_uuids[$i]}"
      local dep_uuid="${deploy_uuids[$i]}"
      local current_status="${app_statuses[$i]}"

      # Skip already-resolved
      if [[ "$current_status" == "done" ]] || [[ "$current_status" == "failed" ]]; then
        display_lines+=("$(printf "  %-25s %s" "$name" "$(status_color "$current_status")")")
        continue
      fi

      all_done=false

      # Check deployment status if we have a deployment UUID
      if [ -n "$dep_uuid" ]; then
        local dep_status
        dep_status=$(api_get "deployments/${dep_uuid}" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")

        case "$dep_status" in
          finished)
            # Build done, check if app is running
            local app_status
            app_status=$(api_get "applications/${uuid}" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
            if [[ "$app_status" == *"running"* ]]; then
              app_statuses[$i]="done"
              succeeded=$((succeeded + 1))
              display_lines+=("$(printf "  %-25s %s" "$name" "$(status_color "running:healthy")")")
              continue
            fi
            display_lines+=("$(printf "  %-25s %s" "$name" "$(status_color "starting")")")
            ;;
          failed)
            app_statuses[$i]="failed"
            failed=$((failed + 1))
            failed_names="${failed_names} ${name}"
            log_error "Deployment of '${name}' failed"
            show_deployment_logs_by_uuid "$dep_uuid" 20
            display_lines+=("$(printf "  %-25s %s" "$name" "$(status_color "failed")")")
            ;;
          *)
            display_lines+=("$(printf "  %-25s %s" "$name" "$(status_color "$dep_status")")")
            ;;
        esac
      else
        # No deployment UUID -- poll app status directly
        local app_status
        app_status=$(api_get "applications/${uuid}" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")

        if [[ "$app_status" == *"running"* ]]; then
          app_statuses[$i]="done"
          succeeded=$((succeeded + 1))
          display_lines+=("$(printf "  %-25s %s" "$name" "$(status_color "running:healthy")")")
          continue
        elif [[ "$app_status" == *"failed"* ]] || [[ "$app_status" == *"exited"* ]]; then
          app_statuses[$i]="failed"
          failed=$((failed + 1))
          failed_names="${failed_names} ${name}"
          display_lines+=("$(printf "  %-25s %s" "$name" "$(status_color "$app_status")")")
          continue
        fi

        display_lines+=("$(printf "  %-25s %s" "$name" "$(status_color "$app_status")")")
      fi
    done

    # Display
    if "$INTERACTIVE"; then
      # Move cursor up and redraw
      if [ "$global_elapsed" -gt 0 ]; then
        local clear_count=$(( ${#display_lines[@]} + 2 ))
        for ((c = 0; c < clear_count; c++)); do
          printf "\033[A\033[2K" >&2
        done
      fi

      echo -e "\n${BOLD}${phase_name}:${NC}" >&2
      for line in "${display_lines[@]}"; do
        echo -e "$line" >&2
      done
      local done_count=$((succeeded + failed))
      echo -e "${DIM}  [${done_count}/${active_count} complete] Elapsed: $(format_elapsed "$global_elapsed")${NC}" >&2
    else
      # CI-friendly: only print on changes or every 30s
      if (( global_elapsed % 30 < POLL_INTERVAL )); then
        echo "" >&2
        echo "${phase_name} status ($(format_elapsed "$global_elapsed")):" >&2
        for line in "${display_lines[@]}"; do
          echo -e "$line" >&2
        done
      fi
    fi

    if "$all_done"; then
      break
    fi

    if [ "$global_elapsed" -ge "$timeout_secs" ]; then
      log_error "Global timeout reached ($(format_elapsed "$timeout_secs"))"
      # Mark remaining as failed
      for i in "${!app_names[@]}"; do
        if [[ "${app_statuses[$i]}" != "done" ]] && [[ "${app_statuses[$i]}" != "failed" ]]; then
          app_statuses[$i]="failed"
          failed=$((failed + 1))
          failed_names="${failed_names} ${app_names[$i]}"
        fi
      done
      break
    fi

    sleep "$POLL_INTERVAL"
  done

  # Summary
  echo "" >&2
  log_info "${phase_name} deployment summary: ${GREEN}${succeeded} succeeded${NC}, ${RED}${failed} failed${NC}"
  if [ "$failed" -gt 0 ]; then
    log_error "Failed:${failed_names}"
    return 1
  fi
  return 0
}

# =============================================================================
# Commands
# =============================================================================

cmd_deploy_infra() {
  log_step "Phase 1: Deploying infrastructure..."
  echo "" >&2

  local any_failed=false

  for name in "${INFRA_SERVICES[@]}"; do
    local uuid
    uuid=$(find_service_by_name "$name")

    if [ -z "$uuid" ]; then
      log_error "Service '${name}' not found -- run coolify-setup.sh setup-infra first"
      any_failed=true
      continue
    fi

    # Check if already running
    local status
    status=$(api_get "services/${uuid}" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")

    if [[ "$status" == *"running"* ]]; then
      log_info "Service '${name}' already $(status_color "$status"), skipping"
      continue
    fi

    log_info "Starting service '${name}'..."
    api_post "services/${uuid}/start" "{}" > /dev/null || {
      log_error "Failed to send start request for '${name}'"
      any_failed=true
      continue
    }

    local timeout="$INFRA_TIMEOUT"
    if [[ "$name" == "patina-supabase" ]] && [ "$timeout" -lt 300 ]; then
      timeout=300  # Supabase stack has many containers, needs more time
    fi

    if ! wait_for_service "$uuid" "$name" "$timeout"; then
      any_failed=true
    fi

    # Clear spinner line in interactive mode
    "$INTERACTIVE" && printf "\r\033[2K" >&2
  done

  if "$any_failed"; then
    log_error "Infrastructure deployment had failures"
    return 1
  fi

  log_info "Infrastructure is healthy"
}

cmd_deploy_backends() {
  log_step "Phase 2: Deploying backend services..."

  local backend_result=0
  deploy_and_monitor_apps BACKENDS "$BACKEND_TIMEOUT" "Backend Services" || backend_result=$?

  # Check if critical backends failed (all 3 are critical)
  if [ "$backend_result" -ne 0 ]; then
    for critical in $CRITICAL_BACKENDS; do
      local uuid
      uuid=$(find_app_by_name "$critical")
      if [ -n "$uuid" ]; then
        local status
        status=$(api_get "applications/${uuid}" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
        if [[ "$status" != *"running"* ]]; then
          log_error "Critical service '${critical}' is not running (${status}) -- aborting"
          return 2  # Return 2 to signal critical failure
        fi
      fi
    done
  fi

  return "$backend_result"
}

cmd_deploy_frontends() {
  log_step "Phase 3: Deploying frontend applications..."
  deploy_and_monitor_apps FRONTENDS "$FRONTEND_TIMEOUT" "Frontend Apps"
}

cmd_deploy_all() {
  local start_time
  start_time=$(date +%s)

  echo "" >&2
  echo -e "${BOLD}Deploying Patina to Coolify...${NC}" >&2
  echo "" >&2

  # Phase 1: Infrastructure
  if ! cmd_deploy_infra; then
    log_error "Infrastructure failed -- aborting deployment"
    return 1
  fi
  echo "" >&2

  # Phase 2: Backends
  local backend_result=0
  cmd_deploy_backends || backend_result=$?

  if [ "$backend_result" -eq 2 ]; then
    log_error "Critical backend failure -- skipping frontends"
    return 1
  fi
  echo "" >&2

  # Phase 3: Frontends (proceed even if non-critical backends failed)
  local frontend_result=0
  cmd_deploy_frontends || frontend_result=$?

  # Final summary
  local total_elapsed=$(( $(date +%s) - start_time ))
  echo "" >&2
  echo -e "${BOLD}======================================${NC}" >&2
  echo -e "${BOLD} Deployment complete in $(format_elapsed "$total_elapsed")${NC}" >&2
  echo -e "${BOLD}======================================${NC}" >&2

  if [ "$backend_result" -ne 0 ] || [ "$frontend_result" -ne 0 ]; then
    log_warn "Some deployments failed -- run './coolify-deploy.sh status' for details"
    return 1
  fi

  log_info "All services deployed successfully"
}

cmd_status() {
  echo "" >&2
  echo -e "${BOLD}Patina Deployment Status${NC}" >&2
  echo "" >&2

  echo -e "${BLUE}Infrastructure:${NC}" >&2
  for name in "${INFRA_SERVICES[@]}"; do
    local uuid
    uuid=$(find_service_by_name "$name")
    if [ -n "$uuid" ]; then
      local status
      status=$(api_get "services/${uuid}" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
      printf "  %-25s %s\n" "$name" "$(status_color "$status")" >&2
    else
      printf "  %-25s %s\n" "$name" "$(status_color "not created")" >&2
    fi
  done

  echo "" >&2
  echo -e "${BLUE}Backend Services:${NC}" >&2
  for entry in "${BACKENDS[@]}"; do
    IFS=: read -r name port <<< "$entry"
    local uuid
    uuid=$(find_app_by_name "$name")
    if [ -n "$uuid" ]; then
      local status
      status=$(api_get "applications/${uuid}" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
      printf "  %-25s %-25s %s\n" "$name" "$(status_color "$status")" "${DIM}:${port}${NC}" >&2
    else
      printf "  %-25s %s\n" "$name" "$(status_color "not created")" >&2
    fi
  done

  echo "" >&2
  echo -e "${BLUE}Frontend Apps:${NC}" >&2
  for entry in "${FRONTENDS[@]}"; do
    IFS=: read -r name port <<< "$entry"
    local uuid
    uuid=$(find_app_by_name "$name")
    if [ -n "$uuid" ]; then
      local status
      status=$(api_get "applications/${uuid}" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
      printf "  %-25s %s\n" "$name" "$(status_color "$status")" >&2
    else
      printf "  %-25s %s\n" "$name" "$(status_color "not created")" >&2
    fi
  done
  echo "" >&2
}

cmd_logs() {
  local name="${1:?Usage: coolify-deploy.sh logs <app-name>}"
  local uuid
  uuid=$(find_app_by_name "$name")

  if [ -z "$uuid" ]; then
    log_error "App '${name}' not found in Coolify"
    return 1
  fi

  log_info "Fetching latest deployment logs for '${name}'..."

  # Get the most recent deployment for this app
  local deployment
  deployment=$(api_get "deployments" | jq -r \
    "[.[] | select(.application_name == \"${name}\")] | sort_by(.created_at) | last // empty" 2>/dev/null)

  if [ -z "$deployment" ]; then
    log_warn "No deployments found for '${name}'"
    return 1
  fi

  local dep_uuid dep_status created_at finished_at
  dep_uuid=$(echo "$deployment" | jq -r '.deployment_uuid // empty')
  dep_status=$(echo "$deployment" | jq -r '.status // "unknown"')
  created_at=$(echo "$deployment" | jq -r '.created_at // "unknown"')
  finished_at=$(echo "$deployment" | jq -r '.finished_at // "in progress"')

  echo "" >&2
  echo -e "${BOLD}Deployment: ${dep_uuid}${NC}" >&2
  echo -e "  Status:   $(status_color "$dep_status")" >&2
  echo -e "  Started:  ${created_at}" >&2
  echo -e "  Finished: ${finished_at}" >&2
  echo "" >&2

  if [ -n "$dep_uuid" ]; then
    show_deployment_logs_by_uuid "$dep_uuid" 100
  fi
}

cmd_stop_all() {
  echo "" >&2
  echo -e "${BOLD}Stopping all Patina resources...${NC}" >&2
  echo "" >&2

  # Phase 1: Stop frontends
  log_step "Stopping frontend apps..."
  for entry in "${FRONTENDS[@]}"; do
    IFS=: read -r name _ <<< "$entry"
    local uuid
    uuid=$(find_app_by_name "$name")
    if [ -n "$uuid" ]; then
      api_post "applications/${uuid}/stop" "{}" > /dev/null 2>&1 && \
        log_info "Stopped '${name}'" || \
        log_warn "Failed to stop '${name}'"
    fi
  done

  # Phase 2: Stop backends
  log_step "Stopping backend services..."
  for entry in "${BACKENDS[@]}"; do
    IFS=: read -r name _ <<< "$entry"
    local uuid
    uuid=$(find_app_by_name "$name")
    if [ -n "$uuid" ]; then
      api_post "applications/${uuid}/stop" "{}" > /dev/null 2>&1 && \
        log_info "Stopped '${name}'" || \
        log_warn "Failed to stop '${name}'"
    fi
  done

  # Phase 3: Stop infrastructure
  log_step "Stopping infrastructure services..."
  for name in "${INFRA_SERVICES[@]}"; do
    local uuid
    uuid=$(find_service_by_name "$name")
    if [ -n "$uuid" ]; then
      api_post "services/${uuid}/stop" "{}" > /dev/null 2>&1 && \
        log_info "Stopped '${name}'" || \
        log_warn "Failed to stop '${name}'"
    fi
  done

  echo "" >&2

  # Poll until all are stopped (30s timeout)
  log_info "Waiting for resources to stop..."
  local stop_start
  stop_start=$(date +%s)
  local all_stopped=false

  while ! "$all_stopped" && [ $(( $(date +%s) - stop_start )) -lt 30 ]; do
    all_stopped=true

    for name in "${INFRA_SERVICES[@]}"; do
      local uuid
      uuid=$(find_service_by_name "$name")
      if [ -n "$uuid" ]; then
        local status
        status=$(api_get "services/${uuid}" | jq -r '.status // "exited"' 2>/dev/null || echo "exited")
        if [[ "$status" == *"running"* ]] || [[ "$status" == *"stopping"* ]]; then
          all_stopped=false
        fi
      fi
    done

    "$all_stopped" || sleep 3
  done

  log_info "All resources stopped"
}

# =============================================================================
# Main
# =============================================================================

case "${1:-help}" in
  deploy-all)
    cmd_deploy_all
    ;;
  deploy-infra)
    cmd_deploy_infra
    ;;
  deploy-backends)
    cmd_deploy_backends
    ;;
  deploy-frontends)
    cmd_deploy_frontends
    ;;
  status)
    cmd_status
    ;;
  logs)
    cmd_logs "${2:-}"
    ;;
  stop-all)
    cmd_stop_all
    ;;
  *)
    echo "Patina Coolify Deploy & Monitor -- Orchestrated deployment with status tracking"
    echo ""
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  deploy-all       Deploy infra -> backends -> frontends (ordered, monitored)"
    echo "  deploy-infra     Deploy Supabase + Infrastructure stacks only"
    echo "  deploy-backends  Deploy all backend services"
    echo "  deploy-frontends Deploy all frontend apps"
    echo "  status           Show status of all resources"
    echo "  logs <name>      Show recent deployment logs for an application"
    echo "  stop-all         Stop all resources (frontends -> backends -> infra)"
    echo ""
    echo "Configuration: .env.coolify (same as coolify-setup.sh)"
    echo ""
    echo "Timeouts (override via env vars):"
    echo "  INFRA_TIMEOUT=${INFRA_TIMEOUT}s  BACKEND_TIMEOUT=${BACKEND_TIMEOUT}s  FRONTEND_TIMEOUT=${FRONTEND_TIMEOUT}s"
    echo ""
    echo "Examples:"
    echo "  $0 status                    # Check current state (read-only)"
    echo "  $0 deploy-all                # Full orchestrated deployment"
    echo "  $0 deploy-infra              # Deploy infrastructure only"
    echo "  $0 logs orders               # View deployment logs for orders"
    echo "  $0 stop-all                  # Tear down everything"
    ;;
esac
