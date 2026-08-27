-- ═══════════════════════════════════════════════════════════════════════════
-- saved_items price snapshot tests (migration 00535)
--
-- SP-14 / SP-12. A save has to survive a reinstall and reach a second device,
-- and the Saved row has to be able to say what the piece cost the day it was
-- saved without inventing a figure (C5). `price_in_cents` already mirrors what
-- the piece costs TODAY; `price_cents_at_save` is the other half of that pair.
--
-- Covers:
--   1. price_cents_at_save exists, is integer, and is nullable (a guest save
--      reconciled at sign-in may genuinely not know the price at save time).
--   2. room_id already existed (00055:23) — asserted so a future reader does
--      not go looking for a column 00535's banner says it did not add.
--   3. The 00055 owner policies still hold with the new column in play: the
--      owner reads their own row, a second user reads zero.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rls/saved_items_snapshot_test.sql
--
-- Single transaction; ROLLBACK at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('d6000000-0000-4000-8000-000000000001', 'si-owner@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6000000-0000-4000-8000-000000000002', 'si-stranger@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('d6000000-0000-4000-8000-000000000001', 'si-owner@test.invalid',    'SI Owner',    NOW(), NOW()),
  ('d6000000-0000-4000-8000-000000000002', 'si-stranger@test.invalid', 'SI Stranger', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  u_owner    uuid := 'd6000000-0000-4000-8000-000000000001';
  u_stranger uuid := 'd6000000-0000-4000-8000-000000000002';
  v_count    int;
  v_snapshot int;
BEGIN
  -- ── 1. the column 00535 adds ──
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'saved_items'
                    AND column_name = 'price_cents_at_save'
                    AND data_type = 'integer' AND is_nullable = 'YES'),
    '00535 must add saved_items.price_cents_at_save as a nullable integer';

  -- ── 2. the column 00535 explicitly did NOT add (m8) ──
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'saved_items'
                    AND column_name = 'room_id' AND is_nullable = 'YES'),
    'saved_items.room_id has existed since 00055:23 and must still be nullable';

  -- ── 3. the 00055 owner policies still hold ──
  PERFORM pg_temp.assume_user(u_owner);
  INSERT INTO public.saved_items (user_id, name, price_in_cents, price_cents_at_save, source)
  VALUES (u_owner, 'Heirloom Oak Dining Table', 398000, 420000, 'emergence');

  SELECT count(*), max(price_cents_at_save) INTO v_count, v_snapshot
    FROM public.saved_items WHERE name = 'Heirloom Oak Dining Table';
  ASSERT v_count = 1, 'the owner must read their own saved item';
  ASSERT v_snapshot = 420000,
    'the snapshot must round-trip independently of the current price';
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user(u_stranger);
  SELECT count(*) INTO v_count
    FROM public.saved_items WHERE name = 'Heirloom Oak Dining Table';
  ASSERT v_count = 0, 'a second user must read zero of the owner''s saved items';
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'saved_items_snapshot_test: ALL ASSERTIONS PASSED';
END $$;

ROLLBACK;
