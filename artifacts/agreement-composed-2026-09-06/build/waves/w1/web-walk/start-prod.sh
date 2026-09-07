#!/bin/zsh
set -u
WT=/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration
OUT=/Users/kody/Code/patina-merged/artifacts/agreement-composed-2026-09-06/build/waves/w1/web-walk
. "$OUT/.supastatus" 2>/dev/null
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
cd "$WT/apps/designer-portal"
exec pnpm exec next start -p 3000
