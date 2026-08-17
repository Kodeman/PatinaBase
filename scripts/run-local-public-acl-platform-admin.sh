#!/usr/bin/env bash
set -euo pipefail

# Local-only executor for the reviewed 00483 platform-admin closure phase.
# It intentionally has no host, port, container, user, database, credential,
# or SQL-path override. Remote and ad-hoc targets are outside this contract.

if (( $# != 0 )); then
  echo "usage: scripts/run-local-public-acl-platform-admin.sh" >&2
  exit 64
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd -- "${script_dir}/.." && pwd -P)"
config_file="${repo_root}/supabase/config.toml"
sql_file="${repo_root}/supabase/platform-admin/00483_public_acl_allowlist.sql"
container_name="supabase_db_supabase"

if [[ ! -f "${config_file}" || ! -f "${sql_file}" ]]; then
  echo "refusing: required checked-in config/SQL artifact is missing" >&2
  exit 1
fi

project_id="$({
  awk -F '=' '
    /^[[:space:]]*project_id[[:space:]]*=/ {
      value = $2
      gsub(/[[:space:]\"]/, "", value)
      print value
    }
  ' "${config_file}"
} | head -n 1)"

db_port="$(awk -F '=' '
  /^\[db\][[:space:]]*$/ { in_db = 1; next }
  /^\[/ { in_db = 0 }
  in_db && /^[[:space:]]*port[[:space:]]*=/ {
    value = $2
    gsub(/[[:space:]\"]/, "", value)
    print value
    exit
  }
' "${config_file}")"

if [[ "${project_id}" != "supabase" || "${db_port}" != "54322" ]]; then
  echo "refusing: config must be project_id=supabase with local db port 54322" >&2
  exit 1
fi

if [[ "$(docker inspect --format '{{.State.Running}}' "${container_name}" 2>/dev/null || true)" != "true" ]]; then
  echo "refusing: ${container_name} is not the running Supabase CLI database" >&2
  exit 1
fi

compose_project="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "${container_name}")"
cli_project="$(docker inspect --format '{{index .Config.Labels "com.supabase.cli.project"}}' "${container_name}")"

if [[ "${compose_project}" != "supabase" || "${cli_project}" != "supabase" ]]; then
  echo "refusing: container labels do not identify the local Supabase CLI project" >&2
  exit 1
fi

port_map="$(docker port "${container_name}" 5432/tcp)"
if [[ -z "${port_map}" ]]; then
  echo "refusing: container PostgreSQL port is not published" >&2
  exit 1
fi

while IFS= read -r mapped_endpoint; do
  if [[ "${mapped_endpoint}" != *:54322 ]]; then
    echo "refusing: unexpected PostgreSQL port mapping ${mapped_endpoint}" >&2
    exit 1
  fi
done <<< "${port_map}"

# Supabase CLI's fixed, non-secret local development password is `postgres`.
# Pass that literal into only this checked container; callers cannot override
# the credential.
docker exec -i -e PGPASSWORD=postgres "${container_name}" \
  psql -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < "${sql_file}"
