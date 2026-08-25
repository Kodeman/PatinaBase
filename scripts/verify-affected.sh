#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--" ]]; then
  shift
fi

BASE_REF="${1:-origin/main}"
HEAD_REF="${2:-HEAD}"
DRY_RUN="${VERIFY_AFFECTED_DRY_RUN:-0}"

run() {
  printf '+ '
  printf '%q ' "$@"
  printf '\n'
  [[ "$DRY_RUN" == 1 ]] || "$@"
}

changed_files="$(git diff --name-only "$BASE_REF...$HEAD_REF")"
if [[ "$HEAD_REF" == HEAD ]]; then
  changed_files="$({
    printf '%s\n' "$changed_files"
    git diff --name-only HEAD
    git ls-files --others --exclude-standard
  } | sed '/^$/d' | sort -u)"
fi
if [[ -z "$changed_files" ]]; then
  printf 'verify-affected: no changed files between %s and %s\n' "$BASE_REF" "$HEAD_REF"
  exit 0
fi

matches() { printf '%s\n' "$changed_files" | grep -Eq "$1"; }

run pnpm lint:skills

if matches '^apps/designer-portal/'; then
  run pnpm --filter @patina/designer-portal type-check
  run pnpm --filter @patina/designer-portal test -- --runInBand
fi
if matches '^apps/admin-portal/'; then
  run pnpm --filter @patina/admin-portal build
  run pnpm --filter @patina/admin-portal test -- --runInBand
fi
if matches '^apps/client-portal/'; then
  run pnpm --filter @patina/client-portal type-check
  run pnpm --filter @patina/client-portal test -- --runInBand
fi
if matches '^apps/manufacturer-portal/'; then
  run pnpm --filter @patina/manufacturer-portal type-check
fi

for service in orders media projects; do
  if matches "^services/$service/"; then
    run pnpm --filter "@patina/$service" build
    run pnpm --filter "@patina/$service" test -- --runInBand
  fi
done

if matches '^infra/edge-api-worker/'; then
  run pnpm --filter patina-edge-api-worker type-check
  run pnpm --filter patina-edge-api-worker test
  run pnpm --filter patina-edge-api-worker test:workerd
fi

if matches '^packages/'; then
  # Route through turbo, not raw `pnpm --filter`, for every task below: turbo.json's
  # `type-check`/`build`/`test` tasks declare `"dependsOn": ["^build"]`, so `turbo run`
  # builds a changed package's own workspace dependencies (and, for the three downstream
  # checks, the changed package itself) before type-checking a consumer. A raw
  # `pnpm --filter <pkg> <task>` call bypasses that graph entirely — the exact gap that let
  # `@patina/patina-design-system`'s Media components (which import `@patina/types/media`,
  # a `dist`-only subpath export) get type-checked via designer-portal/client-portal/
  # admin-portal before `@patina/types` had ever been built. See
  # docs/follow-ups/media-type-debt-2026-08.md.
  while IFS= read -r package_dir; do
    [[ -f "$package_dir/package.json" ]] || continue
    package_name="$(node -e 'const p=require(require("path").resolve(process.argv[1])); process.stdout.write(p.name || "")' "$package_dir/package.json")"
    [[ -n "$package_name" ]] || continue
    for task in build type-check test; do
      if node -e 'const p=require(require("path").resolve(process.argv[1])); process.exit(p.scripts && p.scripts[process.argv[2]] ? 0 : 1)' "$package_dir/package.json" "$task"; then
        run pnpm exec turbo run "$task" --filter="$package_name"
      fi
    done
  done < <(printf '%s\n' "$changed_files" | sed -n 's#^\(packages/[^/]*\)/.*#\1#p' | sort -u)
  run pnpm exec turbo run type-check --filter=@patina/designer-portal
  run pnpm exec turbo run type-check --filter=@patina/client-portal
  run pnpm exec turbo run build --filter=@patina/admin-portal
fi

if matches '^supabase/functions/.*\.ts$'; then
  while IFS= read -r file; do
    [[ -f "$file" ]] || continue
    run deno check --config supabase/functions/deno.json "$file"
    case "$file" in *.test.ts) run deno test --config supabase/functions/deno.json "$file" ;; esac
  done < <(printf '%s\n' "$changed_files" | grep -E '^supabase/functions/.*\.ts$' || true)
fi

if matches '^supabase/migrations/|^supabase/seed/|^supabase/config\.toml$'; then
  for env_file in apps/designer-portal/.env.local apps/admin-portal/.env.local apps/client-portal/.env.local; do
    if [[ -f "$env_file" ]] && grep -Eq '^NEXT_PUBLIC_SUPABASE_URL=.*\.supabase\.co' "$env_file"; then
      printf 'verify-affected: refusing DB verification because %s points to Supabase Cloud\n' "$env_file" >&2
      exit 1
    fi
  done
  run pnpm supabase:start
  run pnpm supabase:reset
  run env SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
  run git diff --exit-code -- packages/supabase/src/database.types.ts
fi

printf '%s\n' 'verify-affected: completed all detected gates'
