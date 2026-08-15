#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PRELUDE="$ROOT/supabase/tests/_support/pg_temp_function_acl_prelude.sql"
POSTLUDE="$ROOT/supabase/tests/_support/pg_temp_function_acl_postlude.sql"
DB_CONTAINER="supabase_db_supabase"

if [ "$#" -ne 1 ]; then
  printf 'usage: %s <supabase SQL test file>\n' "$0" >&2
  exit 2
fi

case "$1" in
  /*) TEST_FILE_INPUT="$1" ;;
  *) TEST_FILE_INPUT="$ROOT/$1" ;;
esac

if [ ! -f "$TEST_FILE_INPUT" ]; then
  printf 'SQL test file not found: %s\n' "$TEST_FILE_INPUT" >&2
  exit 2
fi

TEST_FILE="$(
  printf '%s' "$TEST_FILE_INPUT" | python3 -c '
import sys
from pathlib import Path

print(Path(sys.stdin.read()).resolve(strict=True))
'
)"

case "$TEST_FILE" in
  "$ROOT"/supabase/tests/*.sql) ;;
  *)
    printf 'SQL test must be under %s/supabase/tests: %s\n' "$ROOT" "$TEST_FILE" >&2
    exit 2
    ;;
esac

case "${SUPABASE_SQL_TEST_BACKEND:-auto}" in
  auto|docker) ;;
  *)
    printf 'SUPABASE_SQL_TEST_BACKEND must be auto or docker\n' >&2
    exit 2
    ;;
esac

if [ "${SUPABASE_SQL_TEST_BACKEND:-auto}" = "docker" ]; then
  TEST_BACKEND="docker"
elif [ -n "${SUPABASE_DB_URL:-}" ]; then
  TEST_BACKEND="url"
  DATABASE_URL="$SUPABASE_DB_URL"
elif command -v psql >/dev/null 2>&1; then
  TEST_BACKEND="url"
  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
else
  TEST_BACKEND="docker"
fi

if [ "$TEST_BACKEND" = "url" ]; then
  DATABASE_TARGET="$(
    printf '%s' "$DATABASE_URL" | python3 -c '
import sys
from urllib.parse import urlparse

try:
    parsed = urlparse(sys.stdin.read().strip())
    if (
        parsed.scheme not in {"postgres", "postgresql"}
        or not parsed.hostname
        or not parsed.username
        or parsed.query
        or parsed.fragment
        or parsed.params
    ):
        raise ValueError
    print(f"{parsed.hostname}:{parsed.port or 5432}")
except (TypeError, ValueError):
    sys.exit(2)
'
  )" || {
    printf 'SUPABASE_DB_URL must be an override-free PostgreSQL URL for the local test database\n' >&2
    exit 2
  }

  case "$DATABASE_TARGET" in
    127.0.0.1:54322|localhost:54322) ;;
    *)
      printf 'refusing to run mutating SQL tests against non-local host/port %s\n' \
        "$DATABASE_TARGET" >&2
      exit 2
      ;;
  esac

  if ! command -v psql >/dev/null 2>&1; then
    printf 'psql is required for the URL SQL-test backend\n' >&2
    exit 2
  fi
else
  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$DB_CONTAINER"; then
    printf 'local Supabase database container is not running: %s\n' \
      "$DB_CONTAINER" >&2
    exit 2
  fi

  if grep -Eq '^[[:space:]]*\\ir([[:space:]]|$)' "$TEST_FILE"; then
    printf '%s uses \\ir and requires local host psql; Docker stdin cannot resolve relative includes\n' \
      "${TEST_FILE#"$ROOT"/}" >&2
    exit 2
  fi
fi

run_local_psql() {
  env \
    -u PGHOST \
    -u PGHOSTADDR \
    -u PGPORT \
    -u PGDATABASE \
    -u PGUSER \
    -u PGPASSWORD \
    -u PGSERVICE \
    -u PGSERVICEFILE \
    -u PGOPTIONS \
    -u PGSSLMODE \
    -u PGTARGETSESSIONATTRS \
    PGCONNECT_TIMEOUT=5 \
    psql "$DATABASE_URL" "$@"
}

run_test_session() {
  if [ "$TEST_BACKEND" = "url" ]; then
    run_local_psql -X -v ON_ERROR_STOP=1 \
      -f "$PRELUDE" \
      -f "$TEST_FILE" \
      -f "$POSTLUDE"
  else
    {
      cat "$PRELUDE"
      printf '\n'
      cat "$TEST_FILE"
      printf '\n'
      cat "$POSTLUDE"
    } | docker exec -i "$DB_CONTAINER" \
      psql -U postgres -d postgres -X -v ON_ERROR_STOP=1
  fi
}

run_post_disconnect_check() {
  local query="$1"
  if [ "$TEST_BACKEND" = "url" ]; then
    run_local_psql -X -v ON_ERROR_STOP=1 -At -c "$query"
  else
    docker exec -i "$DB_CONTAINER" \
      psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -At -c "$query"
  fi
}

TEST_LOG="$(mktemp)"
cleanup() {
  rm -f "$TEST_LOG"
}
trap cleanup EXIT

set +e
run_test_session >"$TEST_LOG" 2>&1
TEST_STATUS=$?
set -e

cat "$TEST_LOG"

TEMP_SCHEMA="$(sed -n 's/^PATINA_TEST_TEMP_SCHEMA=//p' "$TEST_LOG" | tail -1)"
TEMP_SCHEMA_OID="$(sed -n 's/^PATINA_TEST_TEMP_SCHEMA_OID=//p' "$TEST_LOG" | tail -1)"
DEFAULT_ACL_FINGERPRINT="$(
  sed -n 's/^PATINA_TEST_PERSISTENT_DEFAULT_ACL_FINGERPRINT=//p' "$TEST_LOG" | tail -1
)"

if [[ ! "$TEMP_SCHEMA" =~ ^pg_temp_[0-9]+$ ]] \
   || [[ ! "$TEMP_SCHEMA_OID" =~ ^[0-9]+$ ]] \
   || [[ ! "$DEFAULT_ACL_FINGERPRINT" =~ ^[0-9a-f]{32}$ ]]; then
  printf 'SQL test prelude did not emit a valid temporary ACL identity\n' >&2
  exit 3
fi

POST_DISCONNECT_QUERY="
  SELECT NOT EXISTS (
           SELECT 1
             FROM pg_default_acl
            WHERE defaclnamespace = $TEMP_SCHEMA_OID
         )
     AND NOT EXISTS (
           SELECT 1 FROM pg_class WHERE relnamespace = $TEMP_SCHEMA_OID
         )
     AND NOT EXISTS (
           SELECT 1 FROM pg_proc WHERE pronamespace = $TEMP_SCHEMA_OID
         )
     AND NOT EXISTS (
           SELECT 1 FROM pg_type WHERE typnamespace = $TEMP_SCHEMA_OID
         )
     AND md5(
           COALESCE(
             string_agg(
               format(
                 '%s:%s:%s:%s',
                 defaults.defaclrole,
                 defaults.defaclnamespace,
                 defaults.defaclobjtype,
                 defaults.defaclacl::text
               ),
               '|' ORDER BY defaults.defaclrole,
                            defaults.defaclnamespace,
                            defaults.defaclobjtype,
                            defaults.defaclacl::text
             ),
             ''
           )
         ) = '$DEFAULT_ACL_FINGERPRINT'
    FROM pg_default_acl AS defaults;
"
POST_DISCONNECT_OK="$(run_post_disconnect_check "$POST_DISCONNECT_QUERY")"

if [ "$POST_DISCONNECT_OK" != "t" ]; then
  if [ "$TEST_STATUS" -ne 0 ]; then
    printf 'SQL test also exited with status %s before cleanup verification\n' \
      "$TEST_STATUS" >&2
  fi
  printf 'SQL test pg_temp object/ACL or persistent-default cleanup check failed\n' >&2
  exit 3
fi

if [ "$TEST_STATUS" -ne 0 ]; then
  exit "$TEST_STATUS"
fi

if ! grep -qx 'PATINA_TEST_SESSION_ACL_OK' "$TEST_LOG"; then
  printf 'SQL test did not reach the session ACL postlude\n' >&2
  exit 3
fi

printf 'pg_temp SQL-test object/ACL cleanup passed: %s\n' "${TEST_FILE#"$ROOT"/}"
