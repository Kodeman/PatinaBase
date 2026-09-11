-- ═══════════════════════════════════════════════════════════════════════════
-- studio_member_rates authorization and history (migration 00598, HT-3)
--
-- Asserted PER ROLE, because "owner/admin only" is a claim about five actors:
--   (a) owner  — may SELECT, INSERT, UPDATE.
--   (b) admin  — the same (is_org_admin_or_owner, 00484:604-623, admits both).
--   (c) member — may SELECT their OWN row and nothing else: no INSERT, no
--       UPDATE, and no read of a colleague's rate. The self leg is deliberate
--       (a studio member may see what they are worth); it is asserted, not
--       implied, so a later narrowing is a decision and not an accident.
--   (d) guest  — may not write and may not read a colleague's row. NOTE: the
--       policy's self leg is `user_id = auth.uid()` with no status test, so a
--       guest who has a rate row of their own CAN read it. That is asserted
--       below as the shape that ships, rather than quietly left out of the
--       "guest may nothing" claim.
--   (e) a cross-studio owner — may nothing at all, on any verb.
--   (f) NOBODY may DELETE: there is no DELETE policy AND no DELETE grant, so
--       the attempt fails on privilege, not on a zero-row no-op.
--   (g) the open-row ladder: a later rate closes the prior one at
--       effective_from - 1, and exactly ONE open row per (studio, member)
--       survives — including when the second rate is BACKDATED.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rls/studio_member_rates_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
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

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c2200000-0000-4000-8000-000000000001', 'smr-owner@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c2200000-0000-4000-8000-000000000002', 'smr-admin@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c2200000-0000-4000-8000-000000000003', 'smr-member@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c2200000-0000-4000-8000-000000000004', 'smr-guest@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c2200000-0000-4000-8000-000000000005', 'smr-outside@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('c2200000-0000-4000-8000-000000000001', 'smr-owner@test.invalid',   'SMR Owner',   NOW(), NOW()),
  ('c2200000-0000-4000-8000-000000000002', 'smr-admin@test.invalid',   'SMR Admin',   NOW(), NOW()),
  ('c2200000-0000-4000-8000-000000000003', 'smr-member@test.invalid',  'SMR Member',  NOW(), NOW()),
  ('c2200000-0000-4000-8000-000000000004', 'smr-guest@test.invalid',   'SMR Guest',   NOW(), NOW()),
  ('c2200000-0000-4000-8000-000000000005', 'smr-outside@test.invalid', 'SMR Outside', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('c2200000-0000-4000-8000-0000000000a1', 'design_studio', 'SMR Studio',  'smr-studio-test',  'active'),
  ('c2200000-0000-4000-8000-0000000000a2', 'design_studio', 'SMR Outside', 'smr-outside-test', 'active');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('c2200000-0000-4000-8000-0000000000c1', 'c2200000-0000-4000-8000-000000000001', 'c2200000-0000-4000-8000-0000000000a1', 'owner',  'active', NOW()),
  ('c2200000-0000-4000-8000-0000000000c2', 'c2200000-0000-4000-8000-000000000002', 'c2200000-0000-4000-8000-0000000000a1', 'admin',  'active', NOW()),
  ('c2200000-0000-4000-8000-0000000000c3', 'c2200000-0000-4000-8000-000000000003', 'c2200000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('c2200000-0000-4000-8000-0000000000c4', 'c2200000-0000-4000-8000-000000000004', 'c2200000-0000-4000-8000-0000000000a1', 'guest',  'active', NOW()),
  ('c2200000-0000-4000-8000-0000000000c5', 'c2200000-0000-4000-8000-000000000005', 'c2200000-0000-4000-8000-0000000000a2', 'owner',  'active', NOW());

-- ─── (a) the owner may write and read ──────────────────────────────────────
DO $$
DECLARE v_seen INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('c2200000-0000-4000-8000-000000000001');
  INSERT INTO public.studio_member_rates (id, studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('c2200000-0000-4000-8000-0000000000f1', 'c2200000-0000-4000-8000-0000000000a1',
          'c2200000-0000-4000-8000-000000000003', 15000, CURRENT_DATE - 30,
          'c2200000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_seen FROM public.studio_member_rates
   WHERE studio_id = 'c2200000-0000-4000-8000-0000000000a1';
  ASSERT v_seen = 1, 'FAIL a1: the owner must read the studio''s rate rows, saw ' || v_seen;

  UPDATE public.studio_member_rates SET hourly_rate_cents = 15500
   WHERE id = 'c2200000-0000-4000-8000-0000000000f1';
  ASSERT (SELECT hourly_rate_cents FROM public.studio_member_rates
           WHERE id = 'c2200000-0000-4000-8000-0000000000f1') = 15500,
    'FAIL a2: the owner must be able to correct a rate row';
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'studio_member_rates: case (a) passed.';
END
$$;

-- ─── (b) an admin may write and read ───────────────────────────────────────
DO $$
DECLARE v_seen INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('c2200000-0000-4000-8000-000000000002');
  INSERT INTO public.studio_member_rates (id, studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('c2200000-0000-4000-8000-0000000000f2', 'c2200000-0000-4000-8000-0000000000a1',
          'c2200000-0000-4000-8000-000000000004', 9000, CURRENT_DATE - 30,
          'c2200000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_seen FROM public.studio_member_rates
   WHERE studio_id = 'c2200000-0000-4000-8000-0000000000a1';
  ASSERT v_seen = 2, 'FAIL b1: an admin must read the studio''s rate rows, saw ' || v_seen;

  UPDATE public.studio_member_rates SET hourly_rate_cents = 9500
   WHERE id = 'c2200000-0000-4000-8000-0000000000f2';
  ASSERT (SELECT hourly_rate_cents FROM public.studio_member_rates
           WHERE id = 'c2200000-0000-4000-8000-0000000000f2') = 9500,
    'FAIL b2: an admin must be able to correct a rate row';
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'studio_member_rates: case (b) passed.';
END
$$;

-- ─── (b2) created_by must be the actor (no writing in someone else's name) ─
DO $$
DECLARE v_raised BOOLEAN := false;
BEGIN
  PERFORM pg_temp.assume_user('c2200000-0000-4000-8000-000000000002');
  BEGIN
    INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
    VALUES ('c2200000-0000-4000-8000-0000000000a1', 'c2200000-0000-4000-8000-000000000003',
            11000, CURRENT_DATE - 10, 'c2200000-0000-4000-8000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_raised, 'FAIL b3: created_by must equal auth.uid() (the WITH CHECK leg)';
  RAISE NOTICE 'studio_member_rates: case (b2) passed.';
END
$$;

-- ─── (c) a plain member: own row only, no writes ───────────────────────────
DO $$
DECLARE
  v_own    INTEGER;
  v_others INTEGER;
  v_insert BOOLEAN := false;
  v_update BOOLEAN := false;
BEGIN
  PERFORM pg_temp.assume_user('c2200000-0000-4000-8000-000000000003');

  SELECT count(*) INTO v_own FROM public.studio_member_rates
   WHERE user_id = 'c2200000-0000-4000-8000-000000000003';
  ASSERT v_own = 1, 'FAIL c1: a member must see their own rate row, saw ' || v_own;

  SELECT count(*) INTO v_others FROM public.studio_member_rates
   WHERE user_id <> 'c2200000-0000-4000-8000-000000000003';
  ASSERT v_others = 0, 'FAIL c2: a member must not read a colleague''s rate, saw ' || v_others;

  BEGIN
    INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
    VALUES ('c2200000-0000-4000-8000-0000000000a1', 'c2200000-0000-4000-8000-000000000003',
            99000, CURRENT_DATE, 'c2200000-0000-4000-8000-000000000003');
  EXCEPTION WHEN insufficient_privilege THEN v_insert := true;
  END;
  ASSERT v_insert, 'FAIL c3: a member must not set their own rate';

  UPDATE public.studio_member_rates SET hourly_rate_cents = 99000
   WHERE id = 'c2200000-0000-4000-8000-0000000000f1';
  IF (SELECT hourly_rate_cents FROM public.studio_member_rates
       WHERE id = 'c2200000-0000-4000-8000-0000000000f1') = 15500 THEN
    v_update := true;   -- the UPDATE matched no row under the member's policies
  END IF;
  PERFORM pg_temp.reset_role();
  ASSERT v_update, 'FAIL c4: a member must not be able to raise their own rate';

  RAISE NOTICE 'studio_member_rates: case (c) passed.';
END
$$;

-- ─── (d) a guest: no writes, no colleague's row (own row IS readable) ──────
DO $$
DECLARE
  v_others INTEGER;
  v_own    INTEGER;
  v_insert BOOLEAN := false;
BEGIN
  PERFORM pg_temp.assume_user('c2200000-0000-4000-8000-000000000004');

  SELECT count(*) INTO v_others FROM public.studio_member_rates
   WHERE user_id <> 'c2200000-0000-4000-8000-000000000004';
  ASSERT v_others = 0, 'FAIL d1: a guest must not read anyone else''s rate, saw ' || v_others;

  SELECT count(*) INTO v_own FROM public.studio_member_rates
   WHERE user_id = 'c2200000-0000-4000-8000-000000000004';
  ASSERT v_own = 1,
    'FAIL d2: the self leg has no status test, so a guest reads their OWN rate row — '
    'asserted as shipped, not assumed away; saw ' || v_own;

  BEGIN
    INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
    VALUES ('c2200000-0000-4000-8000-0000000000a1', 'c2200000-0000-4000-8000-000000000004',
            99000, CURRENT_DATE, 'c2200000-0000-4000-8000-000000000004');
  EXCEPTION WHEN insufficient_privilege THEN v_insert := true;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_insert, 'FAIL d3: a guest must not write rate rows';

  RAISE NOTICE 'studio_member_rates: case (d) passed.';
END
$$;

-- ─── (e) a cross-studio owner: nothing, on any verb ───────────────────────
DO $$
DECLARE
  v_seen   INTEGER;
  v_insert BOOLEAN := false;
BEGIN
  PERFORM pg_temp.assume_user('c2200000-0000-4000-8000-000000000005');

  SELECT count(*) INTO v_seen FROM public.studio_member_rates;
  ASSERT v_seen = 0, 'FAIL e1: another studio''s owner must read nothing here, saw ' || v_seen;

  BEGIN
    INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
    VALUES ('c2200000-0000-4000-8000-0000000000a1', 'c2200000-0000-4000-8000-000000000003',
            1, CURRENT_DATE, 'c2200000-0000-4000-8000-000000000005');
  EXCEPTION WHEN insufficient_privilege THEN v_insert := true;
  END;
  ASSERT v_insert, 'FAIL e2: another studio''s owner must not write here';

  UPDATE public.studio_member_rates SET hourly_rate_cents = 1
   WHERE id = 'c2200000-0000-4000-8000-0000000000f1';
  PERFORM pg_temp.reset_role();
  ASSERT (SELECT hourly_rate_cents FROM public.studio_member_rates
           WHERE id = 'c2200000-0000-4000-8000-0000000000f1') = 15500,
    'FAIL e3: another studio''s owner must not change a rate';

  RAISE NOTICE 'studio_member_rates: case (e) passed.';
END
$$;

-- ─── (f) nobody may DELETE — history is a fact ────────────────────────────
DO $$
DECLARE
  v_owner_raised  INTEGER := 0;
  v_admin_raised  INTEGER := 0;
BEGIN
  PERFORM pg_temp.assume_user('c2200000-0000-4000-8000-000000000001');
  BEGIN
    DELETE FROM public.studio_member_rates WHERE id = 'c2200000-0000-4000-8000-0000000000f1';
  EXCEPTION WHEN insufficient_privilege THEN v_owner_raised := 1;
  END;
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('c2200000-0000-4000-8000-000000000002');
  BEGIN
    DELETE FROM public.studio_member_rates WHERE id = 'c2200000-0000-4000-8000-0000000000f2';
  EXCEPTION WHEN insufficient_privilege THEN v_admin_raised := 1;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_owner_raised = 1, 'FAIL f1: even the owner must not DELETE a rate row';
  ASSERT v_admin_raised = 1, 'FAIL f2: even an admin must not DELETE a rate row';
  ASSERT (SELECT count(*) FROM public.studio_member_rates
           WHERE id IN ('c2200000-0000-4000-8000-0000000000f1','c2200000-0000-4000-8000-0000000000f2')) = 2,
    'FAIL f3: both rows must still be there';

  RAISE NOTICE 'studio_member_rates: case (f) passed.';
END
$$;

-- ─── (g) the open-row ladder, forwards and backdated ─────────────────────
DO $$
DECLARE
  v_open   INTEGER;
  v_closed DATE;
  v_new_to DATE;
BEGIN
  PERFORM pg_temp.assume_user('c2200000-0000-4000-8000-000000000001');
  -- A raise, effective today: the 30-days-ago row closes yesterday.
  INSERT INTO public.studio_member_rates (id, studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('c2200000-0000-4000-8000-0000000000f3', 'c2200000-0000-4000-8000-0000000000a1',
          'c2200000-0000-4000-8000-000000000003', 18000, CURRENT_DATE,
          'c2200000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_open FROM public.studio_member_rates
   WHERE studio_id = 'c2200000-0000-4000-8000-0000000000a1'
     AND user_id   = 'c2200000-0000-4000-8000-000000000003'
     AND effective_to IS NULL;
  ASSERT v_open = 1, 'FAIL g1: exactly one open row per (studio, member), found ' || v_open;

  SELECT effective_to INTO v_closed FROM public.studio_member_rates
   WHERE id = 'c2200000-0000-4000-8000-0000000000f1';
  ASSERT v_closed = CURRENT_DATE - 1,
    'FAIL g2: the prior row must close at the new row''s effective_from - 1, got ' || v_closed;

  -- A BACKDATED correction: it cannot close the row that starts later, so it
  -- closes ITSELF and the invariant still holds.
  INSERT INTO public.studio_member_rates (id, studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('c2200000-0000-4000-8000-0000000000f4', 'c2200000-0000-4000-8000-0000000000a1',
          'c2200000-0000-4000-8000-000000000003', 16000, CURRENT_DATE - 10,
          'c2200000-0000-4000-8000-000000000001');
  PERFORM pg_temp.reset_role();

  SELECT count(*) INTO v_open FROM public.studio_member_rates
   WHERE studio_id = 'c2200000-0000-4000-8000-0000000000a1'
     AND user_id   = 'c2200000-0000-4000-8000-000000000003'
     AND effective_to IS NULL;
  ASSERT v_open = 1,
    'FAIL g3: a backdated rate must not leave two open rows, found ' || v_open;

  SELECT effective_to INTO v_new_to FROM public.studio_member_rates
   WHERE id = 'c2200000-0000-4000-8000-0000000000f4';
  ASSERT v_new_to = CURRENT_DATE - 1,
    'FAIL g4: the backdated row must close the day before the next row begins, got ' || v_new_to;

  RAISE NOTICE 'studio_member_rates: case (g) passed.';
  RAISE NOTICE 'All studio_member_rates assertions passed.';
END
$$;

ROLLBACK;
