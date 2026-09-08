#!/usr/bin/env bash
# Wave 3 web walk — boot both portals from the integration worktree.
# Usage: boot.sh <flag-override-string> <tag>
set -euo pipefail

WT=/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-integration
OUT=/Users/kody/Code/patina-merged/artifacts/agreement-composed-2026-09-06/build/waves/w3/web-walk

FLAGS="${1:-agreement-parts:true,agreement-library:true,design-build:true,studio-workspaces:true}"
TAG="${2:-r1}"

eval "$(cd /Users/kody/Code/patina-merged && supabase status -o env | grep -E '^(ANON_KEY|SERVICE_ROLE_KEY)=')"

export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY="${ANON_KEY//\"/}"
export SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY//\"/}"
export NEXT_PUBLIC_FLAG_OVERRIDES="$FLAGS"
export NODE_ENV=development
export NEXT_TELEMETRY_DISABLED=1

# designer
(
  export NEXT_PUBLIC_SUPABASE_STORAGE_KEY=sb-localdesigner-auth-token
  export NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live
  export NEXT_PUBLIC_APP_URL=http://localhost:3000
  export NEXT_PUBLIC_CLIENT_PORTAL_URL=http://localhost:3002
  cd "$WT/apps/designer-portal"
  nohup pnpm dev > "$OUT/designer-$TAG.log" 2>&1 &
  echo $! > "$OUT/designer-$TAG.pid"
)

# client
(
  export NEXT_PUBLIC_SUPABASE_STORAGE_KEY=sb-localclient-auth-token
  export NEXT_PUBLIC_CLIENT_PORTAL_DATA_MODE=live
  export NEXT_PUBLIC_APP_URL=http://localhost:3002
  cd "$WT/apps/client-portal"
  nohup pnpm dev > "$OUT/client-$TAG.log" 2>&1 &
  echo $! > "$OUT/client-$TAG.pid"
)

echo "flags: $FLAGS"
echo "designer pid $(cat "$OUT/designer-$TAG.pid")  client pid $(cat "$OUT/client-$TAG.pid")"
