#!/usr/bin/env bash
#
# 00767_unsorted_prune_concurrency.test.sh — SQ-844 (the SQ-842 review, F3 and
# F8a): the Unsorted prune under two concurrent sessions.
#
#   1. (F3) Session A files a new uncategorised line into Unsorted and holds
#      its transaction open; session B moves Unsorted's last committed line
#      out. B's prune must wait for A, then keep Unsorted with A's line in it
#      (before SQ-844 it deleted the chapter and ON DELETE SET NULL orphaned
#      A's line).
#   2. (F8a) Unsorted holds two lines; A moves one out and holds its
#      transaction open; B moves the other out. B's prune must wait for A, then
#      delete the now-empty Unsorted (before SQ-844 each saw the other's line
#      and neither deleted it).
#   Each scenario also checks that B's statement waited at least a second, so
#   the two sessions really overlapped.
#
# Needs a LOCAL database with 00767 applied. Unlike the .sql suites this one
# must COMMIT its fixture (two sessions cannot share a transaction): it uses
# ids 76710000-…, removes any stale copy first, and removes it on exit.
#
# Usage: bash supabase/tests/spec_books/00767_unsorted_prune_concurrency.test.sh
# Env:   SUPABASE_DB_URL (default postgresql://postgres:postgres@127.0.0.1:54322/postgres)

set -euo pipefail

DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "00767-prune-concurrency: refusing to run against a non-local database" >&2; exit 2 ;;
esac

PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
WORK="$(mktemp -d)"

USER_ID='76710000-0000-4000-8000-000000000001'
PROJECT_ID='76710000-0000-4000-8000-000000000101'
ROOM_ID='76710000-0000-4000-8000-000000000201'
BOOK_ID='76710000-0000-4000-8000-000000000601'
L1='76710000-0000-4000-8000-000000000501'
L2='76710000-0000-4000-8000-000000000502'
L3='76710000-0000-4000-8000-000000000503'

purge_fixture() {
  "${PSQL[@]}" <<SQL
BEGIN;
DELETE FROM public.spec_books WHERE id = '$BOOK_ID';
-- Each line is the primary of its own selection thread (00434, RESTRICT both
-- ways), so lines and threads leave in one statement (trade_scope_test.sql).
WITH dropped_threads AS (
  DELETE FROM public.project_ffe_selection_threads WHERE project_id = '$PROJECT_ID'
  RETURNING id
)
DELETE FROM public.project_ffe_items WHERE project_id = '$PROJECT_ID';
DELETE FROM public.project_rooms WHERE project_id = '$PROJECT_ID';
DELETE FROM public.projects WHERE id = '$PROJECT_ID';
DELETE FROM public.profiles WHERE id = '$USER_ID';
DELETE FROM auth.users WHERE id = '$USER_ID';
COMMIT;
SQL
}
cleanup() {
  purge_fixture || echo "00767-prune-concurrency: WARNING — fixture cleanup failed (ids 76710000-…)" >&2
  rm -rf "$WORK"
}
trap cleanup EXIT
purge_fixture

fail() { echo "00767-prune-concurrency: FAIL — $*" >&2; exit 1; }

"${PSQL[@]}" <<SQL
BEGIN;
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('$USER_ID', 'prune-race@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES ('$USER_ID', 'prune-race@test.invalid', 'Leah Prune Race', now(), now())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
-- No studio: filing and pruning never read one, and a system category
-- ('seating') resolves without it.
INSERT INTO public.projects (id, name, designer_id, client_id, created_by)
VALUES ('$PROJECT_ID', 'Prune Race Job', '$USER_ID', NULL, '$USER_ID');
INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES ('$ROOM_ID', '$PROJECT_ID', 'Hall', 0);
INSERT INTO public.spec_books (id, project_id, title, template_id, created_by)
VALUES ('$BOOK_ID', '$PROJECT_ID', 'Prune Race Job — Spec Book', '8f6e2600-6f25-4f20-a63d-d68d49c35a01', '$USER_ID');
-- The book exists, so the attach trigger files L1 (no category) into Unsorted.
INSERT INTO public.project_ffe_items (id, project_id, project_room_id, assignment_scope, name, doc_code, status, quantity, sort_order, ffe_category)
VALUES ('$L1', '$PROJECT_ID', '$ROOM_ID', 'room', 'Race line 1', 'PR-01', 'specified', 1, 0, NULL);
COMMIT;
SQL

unsorted_id() {
  "${PSQL[@]}" -c "SELECT COALESCE((SELECT id::text FROM public.spec_book_chapters WHERE spec_book_id = '$BOOK_ID' AND trade = 'unsorted'), '-')"
}
chapter_of() {
  "${PSQL[@]}" -c "SELECT COALESCE((SELECT COALESCE(c.trade, '!') FROM public.spec_book_item_settings s LEFT JOIN public.spec_book_chapters c ON c.id = s.chapter_id WHERE s.ffe_item_id = '$1'), '-')"
}

[ "$(chapter_of "$L1")" = "unsorted" ] || fail "setup: L1 is not in Unsorted"

# ── 1. F3: a concurrent filing into Unsorted is never orphaned ──────────────
cat > "$WORK/a1.sql" <<SQL
BEGIN;
INSERT INTO public.project_ffe_items (id, project_id, project_room_id, assignment_scope, name, doc_code, status, quantity, sort_order, ffe_category)
VALUES ('$L2', '$PROJECT_ID', '$ROOM_ID', 'room', 'Race line 2', 'PR-02', 'specified', 1, 1, NULL);
SELECT pg_sleep(3);
COMMIT;
SQL
cat > "$WORK/b1.sql" <<SQL
SET lock_timeout = '15s';
SELECT pg_sleep(1);
SELECT clock_timestamp() AS t0 \gset
UPDATE public.project_ffe_items SET ffe_category = 'seating' WHERE id = '$L1';
SELECT (clock_timestamp() - :'t0'::timestamptz) >= interval '1 second' AS waited \gset
\echo waited=:waited
SQL
"${PSQL[@]}" -f "$WORK/a1.sql" > "$WORK/a1.out" 2>&1 & PID_A=$!
"${PSQL[@]}" -f "$WORK/b1.sql" > "$WORK/b1.out" 2>&1 & PID_B=$!
wait "$PID_A" || { cat "$WORK/a1.out" >&2; fail "1: session A errored"; }
wait "$PID_B" || { cat "$WORK/b1.out" >&2; fail "1: session B errored"; }

grep -q '^waited=t$' "$WORK/b1.out" || { cat "$WORK/b1.out" >&2; fail "1: session B did not wait for A (no overlap)"; }
[ "$(chapter_of "$L1")" = "seating" ] || fail "1: L1 did not move to Seating"
[ "$(chapter_of "$L2")" = "unsorted" ] || fail "1: A's concurrently filed line lost its chapter (got $(chapter_of "$L2"))"
[ "$(unsorted_id)" != "-" ] || fail "1: Unsorted was deleted while A's line was being filed into it"
echo "1 (F3): a line filed into Unsorted while its last line leaves keeps Unsorted and its chapter"

# ── 2. F8a: two concurrent departures leave no empty Unsorted ────────────────
"${PSQL[@]}" -c "INSERT INTO public.project_ffe_items (id, project_id, project_room_id, assignment_scope, name, doc_code, status, quantity, sort_order, ffe_category) VALUES ('$L3', '$PROJECT_ID', '$ROOM_ID', 'room', 'Race line 3', 'PR-03', 'specified', 1, 2, NULL)"
[ "$(chapter_of "$L3")" = "unsorted" ] || fail "2: setup: L3 is not in Unsorted"
SEATING="$("${PSQL[@]}" -c "SELECT id FROM public.spec_book_chapters WHERE spec_book_id = '$BOOK_ID' AND trade = 'seating'")"

cat > "$WORK/a2.sql" <<SQL
BEGIN;
UPDATE public.spec_book_item_settings SET chapter_id = '$SEATING' WHERE ffe_item_id = '$L2';
SELECT pg_sleep(3);
COMMIT;
SQL
cat > "$WORK/b2.sql" <<SQL
SET lock_timeout = '15s';
SELECT pg_sleep(1);
SELECT clock_timestamp() AS t0 \gset
UPDATE public.spec_book_item_settings SET chapter_id = '$SEATING' WHERE ffe_item_id = '$L3';
SELECT (clock_timestamp() - :'t0'::timestamptz) >= interval '1 second' AS waited \gset
\echo waited=:waited
SQL
"${PSQL[@]}" -f "$WORK/a2.sql" > "$WORK/a2.out" 2>&1 & PID_A=$!
"${PSQL[@]}" -f "$WORK/b2.sql" > "$WORK/b2.out" 2>&1 & PID_B=$!
wait "$PID_A" || { cat "$WORK/a2.out" >&2; fail "2: session A errored"; }
wait "$PID_B" || { cat "$WORK/b2.out" >&2; fail "2: session B errored"; }

grep -q '^waited=t$' "$WORK/b2.out" || { cat "$WORK/b2.out" >&2; fail "2: session B did not wait for A (no overlap)"; }
[ "$(chapter_of "$L2")" = "seating" ] && [ "$(chapter_of "$L3")" = "seating" ] || fail "2: the two lines did not both move"
[ "$(unsorted_id)" = "-" ] || fail "2: two concurrent departures left an empty Unsorted"
echo "2 (F8a): two concurrent departures of Unsorted's last lines remove it"

echo "00767-prune-concurrency: all checks passed"
