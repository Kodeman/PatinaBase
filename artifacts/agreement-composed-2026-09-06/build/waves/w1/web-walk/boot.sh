#!/bin/zsh
# Boot one portal for the Wave 1 web walk.
# usage: boot.sh <designer|client> <flagoverrides-or-empty>
set -u
WT=/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration
OUT=/Users/kody/Code/patina-merged/artifacts/agreement-composed-2026-09-06/build/waves/w1/web-walk
. "$OUT/.supastatus" 2>/dev/null
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_FLAG_OVERRIDES="${2:-}"
cd "$WT"
if [ "$1" = "designer" ]; then
  export NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live
  exec pnpm --filter @patina/designer-portal dev
else
  exec pnpm --filter @patina/client-portal dev
fi
