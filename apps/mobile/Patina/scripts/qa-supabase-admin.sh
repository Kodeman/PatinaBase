#!/usr/bin/env bash
# QA-only helper for the Supabase GoTrue admin API on api.patina.cloud.
# Operates only on auth users whose email begins with "qa+ios" as a guardrail
# against accidental modification of real accounts. Reads SERVICE_ROLE_KEY
# from infra/.env (gitignored).
#
# Usage:
#   qa-supabase-admin.sh confirm-email <email>
#   qa-supabase-admin.sh delete        <email>
#   qa-supabase-admin.sh lookup        <email>
set -euo pipefail

ACTION="${1:-}"
EMAIL="${2:-}"
BASE="https://api.patina.cloud/auth/v1/admin/users"

if [[ -z "$ACTION" || -z "$EMAIL" ]]; then
  echo "usage: $0 {confirm-email|delete|lookup} <email>" >&2
  exit 2
fi

if [[ "$EMAIL" != qa+ios* && "$EMAIL" != qa%2Bios* ]]; then
  echo "refusing: email must start with 'qa+ios' (got: $EMAIL)" >&2
  exit 3
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
ENV_FILE="$REPO_ROOT/infra/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing $ENV_FILE" >&2
  exit 4
fi

SRK="$(grep -E '^SERVICE_ROLE_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"')"
if [[ -z "$SRK" ]]; then
  echo "SERVICE_ROLE_KEY not found in $ENV_FILE" >&2
  exit 5
fi

EMAIL_ENC="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$EMAIL")"

lookup() {
  curl -sS -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
    "$BASE?email=$EMAIL_ENC"
}

case "$ACTION" in
  lookup)
    lookup
    echo
    ;;
  confirm-email)
    RESP="$(lookup)"
    USER_ID="$(python3 -c 'import sys,json; d=json.load(sys.stdin); print(next((u["id"] for u in d.get("users", []) if u.get("email","").lower()==sys.argv[1].lower()), ""))' "$EMAIL" <<<"$RESP")"
    if [[ -z "$USER_ID" ]]; then
      echo "user not found for email: $EMAIL" >&2
      exit 6
    fi
    echo "user_id=$USER_ID"
    curl -sS -X PUT -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
      -H "Content-Type: application/json" \
      -d '{"email_confirm": true}' \
      "$BASE/$USER_ID" \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); print("email_confirmed_at=", d.get("email_confirmed_at"), "confirmed_at=", d.get("confirmed_at"))'
    ;;
  delete)
    RESP="$(lookup)"
    USER_ID="$(python3 -c 'import sys,json; d=json.load(sys.stdin); print(next((u["id"] for u in d.get("users", []) if u.get("email","").lower()==sys.argv[1].lower()), ""))' "$EMAIL" <<<"$RESP")"
    if [[ -z "$USER_ID" ]]; then
      echo "user not found for email: $EMAIL" >&2
      exit 6
    fi
    curl -sS -X DELETE -H "apikey: $SRK" -H "Authorization: Bearer $SRK" "$BASE/$USER_ID" -w '\nHTTP %{http_code}\n'
    ;;
  *)
    echo "unknown action: $ACTION" >&2
    exit 2
    ;;
esac
