-- Bring in a Deck — settle race (00687, SQ-383; found by the SQ-364 e2e).
--   1  repair: an import left 'resolving' with every piece found / not_found
--      is settled by one claim call, to 'ready' (what
--      _board_deck_import_settle sets); an import with a pending piece or a
--      live lease is left resolving; a second claim changes nothing
--   2  lock: _board_deck_import_record takes FOR UPDATE on the import row
--      (read with pgrowlocks while the import stays resolving), and every
--      piece-writing path locks the import row before the piece
--   3  the last record of an import settles it
-- Not covered here: two truly concurrent records need two sessions (dblink
-- from the local postgres role is refused without a password). The lock is
-- proven taken in one session and its order is read from the bodies.
-- claim_board_deck_import_items is global: assertions read this file's rows
-- only, never claim totals. The fixture imports are dated 2000 so the
-- bounded repair sweep (oldest first) reaches them before any live import.
-- Run after a fresh reset:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/deck_import/settle_race.test.sql

BEGIN;

SET LOCAL statement_timeout = '30s';

-- ── Fixtures ────────────────────────────────────────────────────────────────

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('d6870000-0000-4000-8000-000000000001', 'settle-race@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('d6870000-0000-4000-8000-000000000001', 'settle-race@test.invalid', 'Settle Race', now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

INSERT INTO public.projects (id, designer_id, client_id, created_by, name, status, studio_id)
VALUES
  ('d6872000-0000-4000-8000-000000000001', 'd6870000-0000-4000-8000-000000000001', NULL,
   'd6870000-0000-4000-8000-000000000001', 'Settle race P', 'active', NULL);

INSERT INTO public.proposal_boards (
  id, proposal_id, project_id, name, canvas_width, canvas_height,
  background_color, sections, status, sort_order
) VALUES
  ('d6873000-0000-4000-8000-000000000001', NULL, 'd6872000-0000-4000-8000-000000000001',
   'Settle race board', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0);

-- S: stuck (all settled, still resolving) · P: a piece still pending ·
-- L: settled pieces, one still under a live lease · R: the record lock probe
INSERT INTO public.board_deck_imports (
  id, board_id, created_by, source_format, file_sha256, file_name, status, created_at
) VALUES
  ('d6877000-0000-4000-8000-00000000000a', 'd6873000-0000-4000-8000-000000000001',
   'd6870000-0000-4000-8000-000000000001', 'deck', repeat('a1', 32), 'S.pptx', 'resolving', '2000-01-01'),
  ('d6877000-0000-4000-8000-00000000000b', 'd6873000-0000-4000-8000-000000000001',
   'd6870000-0000-4000-8000-000000000001', 'deck', repeat('b1', 32), 'P.pptx', 'resolving', '2000-01-02'),
  ('d6877000-0000-4000-8000-00000000000c', 'd6873000-0000-4000-8000-000000000001',
   'd6870000-0000-4000-8000-000000000001', 'deck', repeat('c1', 32), 'L.pptx', 'resolving', '2000-01-03'),
  ('d6877000-0000-4000-8000-00000000000d', 'd6873000-0000-4000-8000-000000000001',
   'd6870000-0000-4000-8000-000000000001', 'deck', repeat('d1', 32), 'R.pptx', 'resolving', '2000-01-04');

INSERT INTO public.board_deck_import_items (
  id, import_id, element_key, slide_index, role, state, found_by, candidates,
  attempts, next_attempt_at, lease_owner, lease_until
) VALUES
  -- S: one found, one not_found, nothing pending, no lease
  ('d6878000-0000-4000-8000-0000000000a1', 'd6877000-0000-4000-8000-00000000000a', 's:1', 0, 'product',
   'found', 'words',
   '[{"source":"words","band":"likely","rank":"1","extracted":{"name":"Chair"}}]'::jsonb,
   1, NULL, NULL, NULL),
  ('d6878000-0000-4000-8000-0000000000a2', 'd6877000-0000-4000-8000-00000000000a', 's:2', 1, 'product',
   'not_found', NULL, '[]'::jsonb, 2, NULL, NULL, NULL),
  -- P: one found, one pending (backed off, so no claim picks it now)
  ('d6878000-0000-4000-8000-0000000000b1', 'd6877000-0000-4000-8000-00000000000b', 'p:1', 0, 'product',
   'not_found', NULL, '[]'::jsonb, 1, NULL, NULL, NULL),
  ('d6878000-0000-4000-8000-0000000000b2', 'd6877000-0000-4000-8000-00000000000b', 'p:2', 1, 'product',
   'pending', NULL, '[]'::jsonb, 1, now() + interval '1 hour', NULL, NULL),
  -- L: nothing pending, but one settled piece still carries a live lease
  ('d6878000-0000-4000-8000-0000000000c1', 'd6877000-0000-4000-8000-00000000000c', 'l:1', 0, 'product',
   'not_found', NULL, '[]'::jsonb, 1, NULL, 'settle-race-live', now() + interval '2 minutes'),
  -- R: two pieces leased to one run; the first record leaves the second pending
  ('d6878000-0000-4000-8000-0000000000d1', 'd6877000-0000-4000-8000-00000000000d', 'r:1', 0, 'product',
   'pending', NULL, '[]'::jsonb, 1, NULL, 'settle-race-run', now() + interval '2 minutes'),
  ('d6878000-0000-4000-8000-0000000000d2', 'd6877000-0000-4000-8000-00000000000d', 'r:2', 1, 'product',
   'pending', NULL, '[]'::jsonb, 1, NULL, 'settle-race-run', now() + interval '2 minutes');

-- ── 1. Repair: one claim settles the stuck import ──────────────────────────

DO $$
DECLARE
  v_status text;
  v_finished timestamptz;
BEGIN
  -- The terminal status the settle function itself writes.
  ASSERT pg_get_functiondef('public._board_deck_import_settle(uuid)'::regprocedure)
    ~ 'SET status = ''ready''', '1: settle still sets ready';

  PERFORM public.claim_board_deck_import_items(1);

  SELECT status, finished_at INTO v_status, v_finished
  FROM public.board_deck_imports WHERE id = 'd6877000-0000-4000-8000-00000000000a';
  ASSERT v_status = 'ready', format('1: stuck import S settled (got %s)', v_status);
  ASSERT v_finished IS NOT NULL, '1: S finished_at stamped';

  SELECT status INTO v_status
  FROM public.board_deck_imports WHERE id = 'd6877000-0000-4000-8000-00000000000b';
  ASSERT v_status = 'resolving', format('1: P with a pending piece stays resolving (got %s)', v_status);

  SELECT status INTO v_status
  FROM public.board_deck_imports WHERE id = 'd6877000-0000-4000-8000-00000000000c';
  ASSERT v_status = 'resolving', format('1: L under a live lease stays resolving (got %s)', v_status);

  -- Idempotent: a second claim leaves S as it was.
  PERFORM public.claim_board_deck_import_items(1);
  ASSERT (SELECT status = 'ready' AND finished_at = v_finished
          FROM public.board_deck_imports WHERE id = 'd6877000-0000-4000-8000-00000000000a'),
    '1: a second claim changes nothing on S';
  ASSERT (SELECT state FROM public.board_deck_import_items
          WHERE id = 'd6878000-0000-4000-8000-0000000000a1') = 'found', '1: S pieces untouched';
END $$;

-- ── 2. Lock: record takes the import row first ─────────────────────────────

-- pgrowlocks reads the row's lock mode; created here, it goes with the
-- ROLLBACK.
CREATE EXTENSION IF NOT EXISTS pgrowlocks WITH SCHEMA extensions;

DO $$
DECLARE
  v_modes_before text[];
  v_modes_after text[];
  v_status text;
  v_def text;
  v_result jsonb;
BEGIN
  -- Inserting R's pieces took FOR KEY SHARE on R (the foreign-key check).
  SELECT lock.modes INTO v_modes_before
  FROM extensions.pgrowlocks('public.board_deck_imports') AS lock
  JOIN public.board_deck_imports AS deck_import ON deck_import.ctid = lock.locked_row
  WHERE deck_import.id = 'd6877000-0000-4000-8000-00000000000d';
  ASSERT NOT COALESCE('For Update' = ANY(v_modes_before), false),
    format('2: R starts without a FOR UPDATE lock (modes %s)', v_modes_before);

  -- r:2 is still pending, so settle does not update R: a FOR UPDATE on R can
  -- only come from the record itself.
  v_result := public.record_board_deck_import_resolution(
    'd6878000-0000-4000-8000-0000000000d1', 'not_found', NULL, '[]'::jsonb, 'settle-race-run');
  ASSERT (v_result->>'applied')::boolean, '2: first record applied';

  SELECT status INTO v_status
  FROM public.board_deck_imports WHERE id = 'd6877000-0000-4000-8000-00000000000d';
  ASSERT v_status = 'resolving', format('2: R still resolving with r:2 pending (got %s)', v_status);

  SELECT lock.modes INTO v_modes_after
  FROM extensions.pgrowlocks('public.board_deck_imports') AS lock
  JOIN public.board_deck_imports AS deck_import ON deck_import.ctid = lock.locked_row
  WHERE deck_import.id = 'd6877000-0000-4000-8000-00000000000d';
  ASSERT COALESCE('For Update' = ANY(v_modes_after), false),
    format('2: record took FOR UPDATE on the import row (modes %s)', v_modes_after);

  -- Order: the import row before the piece, on every piece-writing path.
  v_def := pg_get_functiondef(
    'public._board_deck_import_record(uuid, text, text, jsonb, text)'::regprocedure);
  ASSERT v_def ~ 'board_deck_imports WHERE id = v_import_id FOR UPDATE;.*SELECT \* INTO v_item\s+FROM public\.board_deck_import_items\s+WHERE id = p_item_id\s+FOR UPDATE',
    '2: _board_deck_import_record locks import, then piece';

  v_def := pg_get_functiondef('public._board_deck_import_lock_item(uuid)'::regprocedure);
  ASSERT v_def ~ 'FROM public\.board_deck_imports WHERE id = v_import_id\s+FOR UPDATE;.*SELECT \* INTO v_item\s+FROM public\.board_deck_import_items\s+WHERE id = p_item_id\s+FOR UPDATE',
    '2: _board_deck_import_lock_item (keep, swap, reference, unkeep) locks import, then piece';

  v_def := pg_get_functiondef(
    'public.pair_board_deck_import_link(uuid, uuid, jsonb)'::regprocedure);
  ASSERT v_def ~ 'board_deck_imports WHERE id = v_import_id FOR UPDATE;.*WHERE id = p_link_item_id FOR UPDATE',
    '2: pair_board_deck_import_link locks import, then pieces';

  v_def := pg_get_functiondef(
    'public.record_board_web_match_result(uuid, jsonb, jsonb)'::regprocedure);
  ASSERT v_def ~ 'board_deck_imports WHERE id = v_import_id FOR UPDATE;.*SELECT \* INTO v_item\s+FROM public\.board_deck_import_items\s+WHERE id = p_item_id\s+FOR UPDATE',
    '2: record_board_web_match_result locks import, then piece';

  v_def := pg_get_functiondef(
    'public.claim_board_deck_import_items_for_import(uuid, integer)'::regprocedure);
  ASSERT v_def ~ 'board_deck_imports WHERE id = p_import_id FOR UPDATE;.*UPDATE public\.board_deck_import_items',
    '2: claim_board_deck_import_items_for_import locks import, then pieces';

  v_def := pg_get_functiondef('public.claim_board_deck_import_items(integer)'::regprocedure);
  ASSERT v_def ~ 'FOR UPDATE OF deck_import SKIP LOCKED.*FOR UPDATE OF deck_import SKIP LOCKED.*UPDATE public\.board_deck_import_items.*FOR UPDATE OF item SKIP LOCKED',
    '2: claim_board_deck_import_items locks imports (skip locked), then pieces';
END $$;

-- ── 3. The last record settles the import ──────────────────────────────────

DO $$
DECLARE
  v_status text;
BEGIN
  PERFORM public.record_board_deck_import_resolution(
    'd6878000-0000-4000-8000-0000000000d2', 'not_found', NULL, '[]'::jsonb, 'settle-race-run');
  SELECT status INTO v_status
  FROM public.board_deck_imports WHERE id = 'd6877000-0000-4000-8000-00000000000d';
  ASSERT v_status = 'ready', format('3: last record settles R (got %s)', v_status);
END $$;

ROLLBACK;
