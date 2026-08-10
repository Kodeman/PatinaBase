#!/usr/bin/env bash
set -euo pipefail

input="$(cat)"
command_text="$(printf '%s' "$input" | jq -r '.tool_input.command // ""')"

deny() {
  jq -nc --arg message "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$message}}'
  exit 0
}

notice() {
  jq -nc --arg message "$1" '{systemMessage:$message,hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$message}}'
}

case "$command_text" in
  *"pnpm supabase:reset"*|*"supabase db reset"*|*"seed:"*)
    for env_file in apps/designer-portal/.env.local apps/admin-portal/.env.local apps/client-portal/.env.local; do
      if [[ -f "$env_file" ]] && grep -Eq '^NEXT_PUBLIC_SUPABASE_URL=.*\.supabase\.co' "$env_file"; then
        deny "Refusing a local database mutation because $env_file points at Supabase Cloud. Switch to the localhost profile first."
      fi
    done
    ;;
esac

case "$command_text" in
  *"pnpm dev:designer"*|*"pnpm dev:minimal"*|*"pnpm dev:client"*|*"pnpm dev:admin"*|*"pnpm dev:frontend"*)
    env_file="apps/designer-portal/.env.local"
    missing=""
    if [[ ! -f "$env_file" ]]; then
      missing="environment file"
    else
      grep -q '^NEXT_PUBLIC_POSTHOG_KEY=phc_' "$env_file" || missing="$missing PostHog-key"
      grep -q '^NEXT_PUBLIC_POSTHOG_HOST=' "$env_file" || missing="$missing PostHog-host"
      grep -q '^NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV=true' "$env_file" || missing="$missing PostHog-dev-toggle"
    fi
    if [[ -n "$missing" ]]; then
      notice "Local feature flags may fail closed. Missing in $env_file:$missing. Use the local PostHog profile or NEXT_PUBLIC_FLAG_OVERRIDES; no values were read or printed."
    fi
    ;;
esac

exit 0
