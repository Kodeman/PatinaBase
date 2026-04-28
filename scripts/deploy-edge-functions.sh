#!/usr/bin/env bash
# Deploy all email / engagement Supabase Edge Functions to the linked project.
#
# Usage:
#   ./scripts/deploy-edge-functions.sh              # deploy everything
#   ./scripts/deploy-edge-functions.sh campaign     # pattern match
#
# Requires `supabase` CLI + an active project link (`supabase link`).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PATTERN="${1:-}"

# JWT-protected functions (called from our portals / services with service key).
JWT_PROTECTED=(
  notification-dispatch
  campaign-dispatch
  campaign-scheduler
  automation-processor
  price-drop-check
  lead-expiration-check
  back-in-stock-check
)

# No-JWT functions (receive webhooks from external providers).
NO_JWT=(
  resend-webhook
)

matches() {
  local fn="$1"
  [[ -z "$PATTERN" ]] && return 0
  [[ "$fn" == *"$PATTERN"* ]]
}

echo "▸ Deploying JWT-protected functions"
for fn in "${JWT_PROTECTED[@]}"; do
  if matches "$fn"; then
    echo "  - $fn"
    supabase functions deploy "$fn"
  fi
done

echo "▸ Deploying public (no-JWT) functions"
for fn in "${NO_JWT[@]}"; do
  if matches "$fn"; then
    echo "  - $fn"
    supabase functions deploy "$fn" --no-verify-jwt
  fi
done

echo "✓ Done."
