#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && git rev-parse --show-toplevel)"
SOURCE_CHECKOUT="${PATINA_ENV_SOURCE_CHECKOUT:-/Users/kody/Code/patina-merged}"
PROFILE_ROOT="${PATINA_LOCAL_ENV_DIR:-$HOME/.config/patina/env/local}"

status_env="$(cd "$REPO_ROOT/supabase" && supabase status -o env 2>/dev/null)" || {
  printf '%s\n' 'init-local-env-profile: local Supabase is not running; start it before creating the profile' >&2
  exit 1
}

extract_status_value() {
  local key="$1"
  printf '%s\n' "$status_env" | sed -n "s/^${key}=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" | head -1
}

api_url="$(extract_status_value API_URL)"
anon_key="$(extract_status_value ANON_KEY)"
service_role_key="$(extract_status_value SERVICE_ROLE_KEY)"

if [[ "$api_url" != http://127.0.0.1:* && "$api_url" != http://localhost:* ]]; then
  printf '%s\n' 'init-local-env-profile: Supabase CLI did not report a localhost API URL' >&2
  exit 1
fi
if [[ -z "$anon_key" || -z "$service_role_key" ]]; then
  printf '%s\n' 'init-local-env-profile: Supabase CLI did not report the required local keys' >&2
  exit 1
fi

write_portal_profile() {
  local relative_path="$1"
  local destination="$PROFILE_ROOT/$relative_path"
  mkdir -p "$(dirname "$destination")"
  : > "$destination"
  chmod 600 "$destination"
  {
    printf 'NEXT_PUBLIC_SUPABASE_URL=%s\n' "$api_url"
    printf 'NEXT_PUBLIC_SUPABASE_ANON_KEY=%s\n' "$anon_key"
    printf 'SUPABASE_SERVICE_ROLE_KEY=%s\n' "$service_role_key"
    printf '%s\n' 'NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live'
    printf '%s\n' 'NEXT_PUBLIC_FLAG_OVERRIDES=procurement-workspace-pilot:true,the-document-pilot:true'
  } >> "$destination"
}

write_portal_profile apps/admin-portal/.env.local
write_portal_profile apps/client-portal/.env.local
write_portal_profile apps/designer-portal/.env.local

while IFS= read -r relative_path || [[ -n "$relative_path" ]]; do
  case "$relative_path" in ''|'#'*|apps/admin-portal/.env.local|apps/client-portal/.env.local|apps/designer-portal/.env.local) continue ;; esac
  case "$relative_path" in
    services/media/.env|services/orders/.env|services/projects/.env) ;;
    *)
      printf 'init-local-env-profile: skipped opaque environment file pending manual review: %s\n' "$relative_path"
      continue
      ;;
  esac
  source_path="$SOURCE_CHECKOUT/$relative_path"
  destination="$PROFILE_ROOT/$relative_path"
  [[ -f "$source_path" ]] || continue
  if grep -Eq '(https?://[^[:space:]]*\.supabase\.co|DATABASE_URL=[^[:space:]]*@[^/:]*(supabase\.co|pooler\.supabase\.com))' "$source_path"; then
    printf 'init-local-env-profile: skipped cloud-pointed file: %s\n' "$relative_path"
    continue
  fi
  if grep -Eq '^DATABASE_URL=' "$source_path" && ! grep -Eq '^DATABASE_URL=.*@(127\.0\.0\.1|localhost)(:|/)' "$source_path"; then
    printf 'init-local-env-profile: skipped non-local database file: %s\n' "$relative_path"
    continue
  fi
  mkdir -p "$(dirname "$destination")"
  cp "$source_path" "$destination"
  chmod 600 "$destination"
done < "$REPO_ROOT/.worktreeinclude"

printf 'init-local-env-profile: created restricted localhost profile at %s\n' "$PROFILE_ROOT"
