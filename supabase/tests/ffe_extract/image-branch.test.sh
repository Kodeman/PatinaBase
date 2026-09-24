#!/usr/bin/env bash
#
# image-branch.test.sh — migration 00660 and CONTRACT A §A.3 + CONTRACT B
# (artifacts/ios27-delivery-plan-2026-09-23/execute/contracts/).
#
#   1. Deno: project-ffe-document-extract. An image upload registers as a
#            source_document with its sniffed type and is sent as an image
#            block; a PDF uploaded as an image is refused by the sniff (415)
#            before registration; a retried registration is idempotent; the
#            rest of the function's suite still passes.
#   2. SQL:  supabase/tests/ffe_extract/image_branch_test.sql — 00455 registers
#            the same upload once however often it is retried, an image
#            source_document stages a `photo` batch through the 00661/00666
#            wrappers, and a committed photo row is placed as
#            `document-extraction`. Needs a LOCAL database with every migration
#            through 00666 (`pnpm supabase:reset`). The SQL file runs in one
#            transaction and rolls back.
#
# Usage: bash supabase/tests/ffe_extract/image-branch.test.sh
# Env:   SUPABASE_DB_URL (default postgresql://postgres:postgres@127.0.0.1:54322/postgres)

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." >/dev/null 2>&1 && pwd -P)"
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "image-branch: refusing to run against a non-local database" >&2; exit 2 ;;
esac

echo "== deno: supabase/functions/project-ffe-document-extract"
(cd "$ROOT/supabase/functions" && deno test --allow-all --config deno.json project-ffe-document-extract/)

echo "== sql: supabase/tests/ffe_extract/image_branch_test.sql"
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/ffe_extract/image_branch_test.sql"

echo "image-branch: all checks passed"
