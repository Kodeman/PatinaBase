-- ═══════════════════════════════════════════════════════════════════════════
-- 00537 tests — the house on Today
--
-- Covers every item in the migration:
--   1. rooms.budget_cents        — exists, integer, nullable, documented;
--   2. profiles.last_seen_at     — exists, timestamptz, nullable, documented;
--   3. the two partial unique indexes on saved_items:
--        a. a second unroomed save of the same piece is REFUSED;
--        b. a second save of the same piece in the same room is REFUSED;
--        c. the same piece in TWO DIFFERENT rooms is ALLOWED (SP-11 — the two
--           indexes must not collapse "put it in a room" into one row);
--        d. an unroomed save AND a roomed save of the same piece coexist (the
--           two partial indexes are disjoint on room_id IS NULL);
--        e. two saves with a NULL product_id are ALLOWED — NULLs are distinct
--           in a btree unique, and a save with no product reference has no key
--           to be the duplicate of (00055:19). Stated so a later reader does
--           not file it as a bug;
--   4. the de-duplication keeps the EARLIEST row per key, not the latest;
--   5. project_rooms is NOT touched by 00537 — the client SELECT policy the
--      build plan held open already exists (00066:249-253) and this migration
--      adds nothing to that table. Asserted so a re-mint is not proposed again.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rooms/house_on_today_test.sql
--
-- Single transaction; ROLLBACK at the end. Nothing survives the run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('d9000000-0000-4000-8000-000000000001', 'hot-client@test.invalid', '', NOW(), NOW(), NOW(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES ('d9000000-0000-4000-8000-000000000001', 'hot-client@test.invalid', 'HOT Client', false, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.rooms (id, user_id, name, type)
VALUES ('d9010000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'HOT Living Room', 'living_room'),
       ('d9010000-0000-4000-8000-000000000002', 'd9000000-0000-4000-8000-000000000001', 'HOT Dining Room', 'dining_room');

-- ─── assertions ────────────────────────────────────────────────────────────

DO $$
DECLARE
  u_client   uuid := 'd9000000-0000-4000-8000-000000000001';
  r_living   uuid := 'd9010000-0000-4000-8000-000000000001';
  r_dining   uuid := 'd9010000-0000-4000-8000-000000000002';
  p_piece    uuid;
  v_type     text;
  v_null     text;
  v_comment  text;
  v_count    int;
  v_survivor uuid;
BEGIN
  SELECT id INTO p_piece FROM public.products ORDER BY id LIMIT 1;
  ASSERT p_piece IS NOT NULL, 'the seed must carry at least one product to save';

  -- ── 1. rooms.budget_cents ──
  SELECT data_type, is_nullable INTO v_type, v_null
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'rooms' AND column_name = 'budget_cents';
  ASSERT v_type = 'integer',
    'rooms.budget_cents must exist as integer cents, got ' || COALESCE(v_type, '<missing>');
  ASSERT v_null = 'YES',
    'rooms.budget_cents must be nullable — an unset budget says nothing (C5)';
  SELECT col_description('public.rooms'::regclass,
           (SELECT attnum FROM pg_attribute
             WHERE attrelid = 'public.rooms'::regclass AND attname = 'budget_cents'))
    INTO v_comment;
  ASSERT v_comment IS NOT NULL, 'rooms.budget_cents must carry a comment';

  UPDATE public.rooms SET budget_cents = 1250000 WHERE id = r_living;
  SELECT budget_cents INTO v_count FROM public.rooms WHERE id = r_living;
  ASSERT v_count = 1250000, 'and hold integer cents, got ' || COALESCE(v_count::text, '<null>');

  -- ── 2. profiles.last_seen_at ──
  SELECT data_type, is_nullable INTO v_type, v_null
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_seen_at';
  ASSERT v_type = 'timestamp with time zone',
    'profiles.last_seen_at must exist as timestamptz, got ' || COALESCE(v_type, '<missing>');
  ASSERT v_null = 'YES', 'profiles.last_seen_at must be nullable';
  SELECT col_description('public.profiles'::regclass,
           (SELECT attnum FROM pg_attribute
             WHERE attrelid = 'public.profiles'::regclass AND attname = 'last_seen_at'))
    INTO v_comment;
  ASSERT v_comment IS NOT NULL, 'profiles.last_seen_at must carry a comment';
  SELECT last_seen_at::text INTO v_comment FROM public.profiles WHERE id = u_client;
  ASSERT v_comment IS NULL,
    'and start NULL — nothing in W2 counts days away at the person (C5)';

  -- ── 3a. a second unroomed save of the same piece is refused ──
  INSERT INTO public.saved_items (user_id, product_id, name, source)
  VALUES (u_client, p_piece, 'HOT Piece', 'emergence');
  BEGIN
    INSERT INTO public.saved_items (user_id, product_id, name, source)
    VALUES (u_client, p_piece, 'HOT Piece again', 'search');
    ASSERT false, 'a second unroomed save of the same piece must be refused (SP-14)';
  EXCEPTION WHEN unique_violation THEN
    NULL;  -- expected
  END;

  -- ── 3d. an unroomed save and a ROOMED save of the same piece coexist ──
  INSERT INTO public.saved_items (user_id, product_id, room_id, name, source)
  VALUES (u_client, p_piece, r_living, 'HOT Piece in the living room', 'emergence');

  -- ── 3b. a second save of the same piece in the SAME room is refused ──
  BEGIN
    INSERT INTO public.saved_items (user_id, product_id, room_id, name, source)
    VALUES (u_client, p_piece, r_living, 'HOT Piece in the living room again', 'search');
    ASSERT false, 'a second save of the same piece in the same room must be refused';
  EXCEPTION WHEN unique_violation THEN
    NULL;  -- expected
  END;

  -- ── 3c. the same piece in a DIFFERENT room is allowed ──
  INSERT INTO public.saved_items (user_id, product_id, room_id, name, source)
  VALUES (u_client, p_piece, r_dining, 'HOT Piece in the dining room', 'emergence');

  SELECT count(*) INTO v_count FROM public.saved_items
   WHERE user_id = u_client AND product_id = p_piece;
  ASSERT v_count = 3,
    'one unroomed save plus one per room must all stand, got ' || v_count;

  -- ── 3e. two saves with a NULL product_id are allowed ──
  INSERT INTO public.saved_items (user_id, name, source)
  VALUES (u_client, 'HOT External Piece', 'extension'),
         (u_client, 'HOT External Piece', 'extension');
  SELECT count(*) INTO v_count FROM public.saved_items
   WHERE user_id = u_client AND product_id IS NULL;
  ASSERT v_count = 2,
    'a save with no product reference has no key to duplicate, got ' || v_count;

  -- ── 4. the de-duplication keeps the EARLIEST row ──
  -- The indexes forbid writing duplicates, so drop them for the length of this
  -- block, fixture three rows with known times, and re-run the migration's own
  -- de-dup statement. Everything here is inside the test transaction.
  DROP INDEX public.saved_items_user_product_unroomed_key;
  DELETE FROM public.saved_items WHERE user_id = u_client;

  INSERT INTO public.saved_items (id, user_id, product_id, name, source, created_at)
  VALUES ('d9020000-0000-4000-8000-000000000001', u_client, p_piece, 'oldest',  'emergence', now() - interval '3 days'),
         ('d9020000-0000-4000-8000-000000000002', u_client, p_piece, 'middle',  'search',    now() - interval '2 days'),
         ('d9020000-0000-4000-8000-000000000003', u_client, p_piece, 'newest',  'companion', now() - interval '1 day');

  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY user_id, product_id
             ORDER BY created_at ASC, id ASC
           ) AS rn
      FROM public.saved_items
     WHERE product_id IS NOT NULL
       AND room_id IS NULL
  )
  DELETE FROM public.saved_items AS item
   USING ranked
   WHERE item.id = ranked.id
     AND ranked.rn > 1;

  SELECT count(*) INTO v_count FROM public.saved_items
   WHERE user_id = u_client AND product_id = p_piece AND room_id IS NULL;
  ASSERT v_count = 1, 'de-duplication must leave exactly one row, got ' || v_count;
  SELECT id INTO v_survivor FROM public.saved_items
   WHERE user_id = u_client AND product_id = p_piece AND room_id IS NULL;
  ASSERT v_survivor = 'd9020000-0000-4000-8000-000000000001',
    'and it must be the EARLIEST row, got ' || v_survivor;

  -- ── 5. 00537 added nothing to project_rooms ──
  -- The client-scoped SELECT policy already exists (00066:249-253) and was
  -- proved against this database before W2 started (steward.md §5c).
  ASSERT EXISTS (
    SELECT 1 FROM pg_policy
     WHERE polrelid = 'public.project_rooms'::regclass
       AND polname = 'Clients can view their project rooms'),
    'the client project_rooms policy must already exist — 00537 must not re-mint it';

  RAISE NOTICE 'house_on_today_test: ALL ASSERTIONS PASSED';
END $$;

ROLLBACK;
