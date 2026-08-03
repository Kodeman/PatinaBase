#!/usr/bin/env bash
set -euo pipefail

# AC2.17 upgrade regression.
#
# This deliberately rewinds ONLY the local Supabase database to 00405, creates
# a proposal-scoped share under the pre-board-share schema, captures the legacy
# resolver output, applies 00406 and every later migration, then byte-compares
# the same token's result. The normal seed supplies the proposal/designer rows.

MOOD_BOARD_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MOOD_BOARD_DB_URL="${MOOD_BOARD_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
MOOD_BOARD_RAW_TOKEN="ac21700000000000000000000000000000000000000000000000000000000000"
MOOD_BOARD_SHARE_ID="c4061200-0000-4000-8000-000000000017"
MOOD_BOARD_SCHEMA_CURRENT=false

case "$MOOD_BOARD_DB_URL" in
  postgresql://postgres:postgres@127.0.0.1:54322/* | \
  postgresql://postgres:postgres@localhost:54322/*)
    ;;
  *)
    echo "Refusing to reset a non-local database: $MOOD_BOARD_DB_URL" >&2
    exit 2
    ;;
esac

MOOD_BOARD_TMP_DIR="$(mktemp -d)"

restore_on_failure() {
  local mood_board_exit_code=$?
  trap - EXIT
  if [ -d "$MOOD_BOARD_TMP_DIR" ]; then
    rm -r "$MOOD_BOARD_TMP_DIR"
  fi
  if [ "$mood_board_exit_code" -ne 0 ] && [ "$MOOD_BOARD_SCHEMA_CURRENT" != true ]; then
    echo "Upgrade regression failed; restoring the current local schema…" >&2
    (
      cd "$MOOD_BOARD_REPO_ROOT"
      pnpm exec supabase db reset --local
    ) || true
  fi
  exit "$mood_board_exit_code"
}
trap restore_on_failure EXIT

cd "$MOOD_BOARD_REPO_ROOT"

pnpm exec supabase db reset --local --version 00405

psql "$MOOD_BOARD_DB_URL" -v ON_ERROR_STOP=1 \
  -v raw_token="$MOOD_BOARD_RAW_TOKEN" \
  -v share_id="$MOOD_BOARD_SHARE_ID" <<'SQL'
INSERT INTO public.document_shares (
  id,
  proposal_id,
  spec_book_artifact_id,
  token_hash,
  label,
  visibility,
  status,
  expires_at,
  created_by
)
VALUES (
  :'share_id'::uuid,
  'b3900000-0000-4000-8000-000000000001'::uuid,
  NULL,
  encode(extensions.digest(:'raw_token', 'sha256'), 'hex'),
  'AC2.17 pre-00406 share',
  '{"feedbackEnabled":false}'::jsonb,
  'active',
  now() + interval '1 day',
  'a0000000-0000-0000-0000-000000000004'::uuid
);
SQL

psql "$MOOD_BOARD_DB_URL" -v ON_ERROR_STOP=1 -At \
  -v raw_token="$MOOD_BOARD_RAW_TOKEN" \
  -c "SELECT row_to_json(resolved)::text FROM public.resolve_document_share(:'raw_token') AS resolved" \
  -o "$MOOD_BOARD_TMP_DIR/before.txt"

test -s "$MOOD_BOARD_TMP_DIR/before.txt"

pnpm exec supabase migration up --local
MOOD_BOARD_SCHEMA_CURRENT=true

psql "$MOOD_BOARD_DB_URL" -v ON_ERROR_STOP=1 -At \
  -v raw_token="$MOOD_BOARD_RAW_TOKEN" \
  -c "SELECT row_to_json(resolved)::text FROM public.resolve_document_share(:'raw_token') AS resolved" \
  -o "$MOOD_BOARD_TMP_DIR/after.txt"

cmp "$MOOD_BOARD_TMP_DIR/before.txt" "$MOOD_BOARD_TMP_DIR/after.txt"

psql "$MOOD_BOARD_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  v_share public.document_shares;
  v_matches integer;
BEGIN
  SELECT * INTO STRICT v_share
  FROM public.document_shares
  WHERE id = 'c4061200-0000-4000-8000-000000000017'::uuid;

  ASSERT v_share.proposal_id =
      'b3900000-0000-4000-8000-000000000001'::uuid
    AND v_share.spec_book_artifact_id IS NULL
    AND v_share.board_id IS NULL
    AND v_share.token_hash =
      encode(
        extensions.digest(
          'ac21700000000000000000000000000000000000000000000000000000000000',
          'sha256'
        ),
        'hex'
      ),
    '00406+ must preserve the exact legacy proposal share row';

  SELECT count(*) INTO v_matches
  FROM public.resolve_document_share(
    'ac21700000000000000000000000000000000000000000000000000000000000'
  );
  ASSERT v_matches = 1,
    'pre-00406 proposal token must still resolve exactly once';
END;
$$;
SQL

echo "AC2.17 legacy proposal-share upgrade regression passed."
