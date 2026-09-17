#!/usr/bin/env bash
# Field Companion W4 — designer-portal production deploy (Kody-run).
#
# Agent-side prep already done (2026-09-01, main @ b09607d52):
#   - type-check gate: PASSED (pnpm --filter @patina/designer-portal type-check)
#   - workspace dep dists: fresh (turbo cache warm — Phase 1 will be instant)
#   - migrations 00543-00545: already applied on Strata
#   - rollback target (pre-deploy live version): c2bb9a9a-de4f-4a76-9ac0-7359cc203ac3
#
# Why this script exists: agent-driven prod mutations are hook-blocked
# (scripts/hooks/core.mjs manual-production-approval). Run this from a plain
# terminal at the repo root on main @ b09607d52, or from an agent session
# launched with PATINA_ALLOW_LOCAL_PROD_DEPLOY=1.
#
# Every NEXT_PUBLIC_* value below is copied verbatim from
# apps/designer-portal/wrangler.jsonc top-level `vars` (the wrangler-vars
# export trap: NEXT_PUBLIC_* is inlined at build time from process env, and
# exported values beat apps/designer-portal/.env.local). No placeholders.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Pin: main must contain the visits-hint commit (b09607d52). Later main tips
# are fine — subsequent merges (C3 verb mount ef414781d) are iOS-only and do
# not change the portal bundle.
git merge-base --is-ancestor b09607d52 HEAD || {
  echo "ERROR: HEAD $(git rev-parse --short=9 HEAD) does not contain b09607d52 (visits hint)" >&2
  exit 1
}

export NEXT_PUBLIC_SUPABASE_URL="https://bkvcixdmuyejfzcijpdg.supabase.co"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrdmNpeGRtdXllamZ6Y2lqcGRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjg0MzIsImV4cCI6MjA4Mzg0NDQzMn0.SPl6jHaeTp9McfF-AmXJUDKTwRaXD7Qf0hlve72rVg0"
export NEXT_PUBLIC_SUPABASE_STORAGE_KEY="sb-bkvcixdmuyejfzcijpdg-auth-token"
export NEXT_PUBLIC_APP_URL="https://app.patina.cloud"
export NEXT_PUBLIC_CLIENT_PORTAL_URL="https://client.patina.cloud"
export NEXT_PUBLIC_ENV="production"
export NEXT_PUBLIC_POSTHOG_KEY="phc_D6Rf7ZYD5L7cTCgP1aBIV6kgANIFGnsbEgoYPXpsaNG"
export NEXT_PUBLIC_POSTHOG_HOST="https://us.i.posthog.com"
export NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_MODE="under_review"
export NEXT_PUBLIC_ENABLED_OAUTH_PROVIDERS="apple"
export NEXT_PUBLIC_EDGE_API_URL="https://api.patina.cloud"

./infra/deploy-portal.sh designer production

echo
echo "==> Liveness probe"
code="$(curl -s -o /dev/null -w '%{http_code}' https://app.patina.cloud/api/version)"
echo "GET https://app.patina.cloud/api/version -> $code"
case "$code" in
  200) echo "OK" ;;
  *) echo "WARN: expected 200" ;;
esac

echo
echo "==> Bottom row below must be NEWER than your deploy start (list is oldest-first):"
npx --prefix apps/designer-portal wrangler deployments list --name patina-designer-portal | tail -12

echo
echo "Rollback (previous good): npx wrangler rollback c2bb9a9a-de4f-4a76-9ac0-7359cc203ac3 --name patina-designer-portal --yes"
echo "Then have the agent run the served-chunk grep ('Field data unavailable' + useProjectVisits) and a ~60s tail."
