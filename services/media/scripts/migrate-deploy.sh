#!/usr/bin/env bash
set -euo pipefail

readonly BASELINE_MIGRATION="20260803180000_existing_schema_baseline"
readonly LEDGER_MIGRATION="20260803190000_background_removal_ledger"
readonly ACTIVE_TARGET_MIGRATION="20260803210000_background_removal_active_target"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SERVICE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

: "${DATABASE_URL:?DATABASE_URL must target the svc_media schema}"
: "${DIRECT_URL:?DIRECT_URL must be the direct/session connection for svc_media}"

case "${DATABASE_URL}" in
  *"schema=svc_media"*) ;;
  *)
    echo "Refusing to migrate: DATABASE_URL must include schema=svc_media." >&2
    exit 1
    ;;
esac

case "${DIRECT_URL}" in
  *"schema=svc_media"*) ;;
  *)
    echo "Refusing to migrate: DIRECT_URL must include schema=svc_media." >&2
    exit 1
    ;;
esac

command -v psql >/dev/null 2>&1 || {
  echo "psql is required for the preflight schema checks." >&2
  exit 1
}

# libpq does not recognize Prisma's `schema` URL parameter. Remove only that
# parameter without ever printing the connection string.
readonly PSQL_URL="$(DIRECT_URL="${DIRECT_URL}" node <<'NODE'
const url = new URL(process.env.DIRECT_URL);
url.searchParams.delete('schema');
process.stdout.write(url.toString());
NODE
)"

psql_value() {
  psql "${PSQL_URL}" -X -q -A -t -v ON_ERROR_STOP=1 "$@"
}

readonly MISSING_BASELINE_OBJECTS="$(psql_value <<'SQL'
WITH expected(kind, object_name, present) AS (
  VALUES
    ('table', 'media_assets', to_regclass('svc_media.media_assets') IS NOT NULL),
    ('table', 'asset_renditions', to_regclass('svc_media.asset_renditions') IS NOT NULL),
    ('table', 'three_d_assets', to_regclass('svc_media.three_d_assets') IS NOT NULL),
    ('table', 'process_jobs', to_regclass('svc_media.process_jobs') IS NOT NULL),
    ('table', 'upload_sessions', to_regclass('svc_media.upload_sessions') IS NOT NULL),
    ('table', 'license_records', to_regclass('svc_media.license_records') IS NOT NULL),
    ('table', 'outbox_events', to_regclass('svc_media.outbox_events') IS NOT NULL),
    ('type', 'asset_kind', to_regtype('svc_media.asset_kind') IS NOT NULL),
    ('type', 'asset_role', to_regtype('svc_media.asset_role') IS NOT NULL),
    ('type', 'asset_status', to_regtype('svc_media.asset_status') IS NOT NULL),
    ('type', 'scan_status', to_regtype('svc_media.scan_status') IS NOT NULL),
    ('type', 'rendition_format', to_regtype('svc_media.rendition_format') IS NOT NULL),
    ('type', 'rendition_purpose', to_regtype('svc_media.rendition_purpose') IS NOT NULL),
    ('type', 'job_type', to_regtype('svc_media.job_type') IS NOT NULL),
    ('type', 'job_state', to_regtype('svc_media.job_state') IS NOT NULL),
    ('type', 'upload_status', to_regtype('svc_media.upload_status') IS NOT NULL)
)
SELECT COALESCE(string_agg(kind || ':' || object_name, ', ' ORDER BY kind, object_name), '')
FROM expected
WHERE NOT present;
SQL
)"

if [[ -n "${MISSING_BASELINE_OBJECTS}" ]]; then
  echo "Refusing to adopt the Prisma baseline; missing svc_media objects: ${MISSING_BASELINE_OBJECTS}." >&2
  echo "Apply supabase/migrations/00053_svc_media_schema.sql before this command." >&2
  exit 1
fi

readonly HAS_MIGRATION_TABLE="$(psql_value -c "SELECT CASE WHEN to_regclass('svc_media._prisma_migrations') IS NULL THEN 'false' ELSE 'true' END")"
baseline_recorded="false"
ledger_recorded="false"
active_target_recorded="false"

if [[ "${HAS_MIGRATION_TABLE}" == "true" ]]; then
  baseline_recorded="$(psql_value -c "SELECT CASE WHEN EXISTS (SELECT 1 FROM svc_media._prisma_migrations WHERE migration_name = '${BASELINE_MIGRATION}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN 'true' ELSE 'false' END")"
  ledger_recorded="$(psql_value -c "SELECT CASE WHEN EXISTS (SELECT 1 FROM svc_media._prisma_migrations WHERE migration_name = '${LEDGER_MIGRATION}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN 'true' ELSE 'false' END")"
  active_target_recorded="$(psql_value -c "SELECT CASE WHEN EXISTS (SELECT 1 FROM svc_media._prisma_migrations WHERE migration_name = '${ACTIVE_TARGET_MIGRATION}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN 'true' ELSE 'false' END")"
fi

readonly HAS_BACKGROUND_OBJECTS="$(psql_value -c "SELECT CASE WHEN to_regclass('svc_media.background_removal_requests') IS NOT NULL OR to_regtype('svc_media.background_removal_status') IS NOT NULL OR to_regtype('svc_media.background_removal_outcome') IS NOT NULL THEN 'true' ELSE 'false' END")"

if [[ "${baseline_recorded}" != "true" ]]; then
  if [[ "${ledger_recorded}" == "true" || "${active_target_recorded}" == "true" || "${HAS_BACKGROUND_OBJECTS}" == "true" ]]; then
    echo "Refusing automatic baseline adoption: background-removal schema/history is already partially present." >&2
    exit 1
  fi

  echo "Adopting the verified pre-Prisma svc_media schema baseline."
  pnpm --dir "${SERVICE_DIR}" exec prisma migrate resolve --applied "${BASELINE_MIGRATION}"
fi

pnpm --dir "${SERVICE_DIR}" exec prisma migrate deploy

readonly MISSING_RELEASE_OBJECTS="$(psql_value <<'SQL'
WITH expected(object_name, present) AS (
  VALUES
    ('background_removal_requests', to_regclass('svc_media.background_removal_requests') IS NOT NULL),
    ('background_removal_status', to_regtype('svc_media.background_removal_status') IS NOT NULL),
    ('background_removal_outcome', to_regtype('svc_media.background_removal_outcome') IS NOT NULL),
    ('background_removal_requests_active_target_unique', to_regclass('svc_media.background_removal_requests_active_target_unique') IS NOT NULL)
)
SELECT COALESCE(string_agg(object_name, ', ' ORDER BY object_name), '')
FROM expected
WHERE NOT present;
SQL
)"

if [[ -n "${MISSING_RELEASE_OBJECTS}" ]]; then
  echo "Migration command completed but required objects are missing: ${MISSING_RELEASE_OBJECTS}." >&2
  exit 1
fi

echo "svc_media migrations are current and verified."
