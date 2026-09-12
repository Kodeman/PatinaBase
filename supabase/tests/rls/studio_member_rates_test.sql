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
--   (d) guest  — may not write, and may not read anything. AMENDED IN REVIEW
--       ROUND 1 (W1-R1-09): a guest can no longer HAVE a rate row, because the
--       INSERT policy now requires the SUBJECT to be an active non-guest member
--       of the studio. The arm that used to assert "a guest reads their own row"
--       is replaced by its cause — the owner's attempt to create that row is
--       refused.
--   (e) a cross-studio owner — may nothing at all, on any verb.
--   (f) NOBODY may DELETE: there is no DELETE policy AND no DELETE grant, so
--       the attempt fails on privilege, not on a zero-row no-op.
--   (g) the open-row ladder: a later rate closes the prior one at
--       effective_from - 1, and exactly ONE open row per (studio, member)
--       survives — including when the second rate is BACKDATED. Extended in
--       review round 1 (W1-R1-06) with the THREE-ROW INTERLEAVE: a rate
--       backdated INTO an already-closed row's span used to leave two rows
--       covering the same dates, which the earlier arm could not see because it
--       only read the backdated row's own effective_to. The arm now asserts that
--       exactly ONE row covers every date in the whole span.
--   (h) the closed-row freeze (W1-R1-08): "history is a fact" was enforced
--       against DELETE only, so an owner or admin could rewrite a CLOSED row's
--       rate or dates in place. Asserted per role, with the open row still
--       correctable so the settings page's blur-save idiom is not broken.
--   (i) W1-R1-09: a rate row cannot be created for a profile that is not an
--       active non-guest member of the studio — neither a guest nor an outsider.
--   (j) W1-R2-04 (review round 2): in a studio with TWO owner/admins, the second
--       may correct a rate the first set the SAME DAY — written as the hook writes
--       it, an upsert on (studio_id, user_id, effective_from) that carries
--       created_by. The freeze used to cover created_by, so that correction raised
--       and the second admin's number was silently lost. (a2)/(b2) could not catch
--       it: they update the rate alone, as the same actor.
--   (k) W1-R3-04 (review round 3): a caller-supplied effective_to is REFUSED, and
--       the one-rate-per-day invariant (g6) still holds afterwards. An owner could
--       otherwise hand-close a backdated row and leave two rows covering the same
--       dates — or leave NO open row at all, after which every new hour resolves
--       'none' and prints "rate pending" until somebody inserts again. Case (g)
--       could not catch it: it never supplies the column.
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
  ('c2200000-0000-4000-8000-000000000005', 'smr-outside@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  -- A SECOND active plain member, added in review round 1: the admin's rate row
  -- used to be written against the guest, which W1-R1-09's membership leg now
  -- refuses. The subject of a rate has to be someone who could log studio time.
  ('c2200000-0000-4000-8000-000000000006', 'smr-second@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('c2200000-0000-4000-8000-000000000001', 'smr-owner@test.invalid',   'SMR Owner',   NOW(), NOW()),
  ('c2200000-0000-4000-8000-000000000002', 'smr-admin@test.invalid',   'SMR Admin',   NOW(), NOW()),
  ('c2200000-0000-4000-8000-000000000003', 'smr-member@test.invalid',  'SMR Member',  NOW(), NOW()),
  ('c2200000-0000-4000-8000-000000000004', 'smr-guest@test.invalid',   'SMR Guest',   NOW(), NOW()),
  ('c2200000-0000-4000-8000-000000000005', 'smr-outside@test.invalid', 'SMR Outside', NOW(), NOW()),
  ('c2200000-0000-4000-8000-000000000006', 'smr-second@test.invalid',  'SMR Second',  NOW(), NOW())
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
  ('c2200000-0000-4000-8000-0000000000c5', 'c2200000-0000-4000-8000-000000000005', 'c2200000-0000-4000-8000-0000000000a2', 'owner',  'active', NOW()),
  ('c2200000-0000-4000-8000-0000000000c6', 'c2200000-0000-4000-8000-000000000006', 'c2200000-0000-4000-8000-0000000000a1', 'member', 'active', NOW());

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
          'c2200000-0000-4000-8000-000000000006', 9000, CURRENT_DATE - 30,
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

-- ─── (d) a guest: no writes, nothing to read ───────────────────────────────
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
  ASSERT v_own = 0,
    'FAIL d2 (W1-R1-09): a guest cannot HAVE a rate row — the INSERT policy requires '
    'an active non-guest membership for the subject, and is_studio_comember (00556:68) '
    'refuses a guest, so a guest rate is one the resolver could never reach; saw ' || v_own;

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
  v_open    INTEGER;
  v_closed  DATE;
  v_new_to  DATE;
  v_covered INTEGER;
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

  -- A BACKDATED correction, landing INSIDE the already-closed first row's span.
  -- This is the W1-R1-06 shape: before the repair the close matched only rows that
  -- were still OPEN, so the first row kept covering [-30, today-1] while this one
  -- covered [-10, today-1] and two rows priced every day in between. The close now
  -- matches every row whose span CONTAINS the new start, closed rows included.
  INSERT INTO public.studio_member_rates (id, studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('c2200000-0000-4000-8000-0000000000f4', 'c2200000-0000-4000-8000-0000000000a1',
          'c2200000-0000-4000-8000-000000000003', 16000, CURRENT_DATE - 10,
          'c2200000-0000-4000-8000-000000000001');

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

  -- W1-R1-06: the row the backdated one landed inside must have been RE-CLOSED.
  SELECT effective_to INTO v_closed FROM public.studio_member_rates
   WHERE id = 'c2200000-0000-4000-8000-0000000000f1';
  ASSERT v_closed = CURRENT_DATE - 11,
    'FAIL g5 (W1-R1-06): the row whose span contained the backdated start must be '
    're-closed at the new start - 1 (CURRENT_DATE - 11), got ' || v_closed;

  -- The invariant the ladder exists for, asserted over the WHOLE span rather than
  -- on one row's effective_to: exactly one rate prices any given day.
  SELECT count(*) INTO v_covered
  FROM generate_series(CURRENT_DATE - 30, CURRENT_DATE, INTERVAL '1 day') AS d(day)
  WHERE (
    SELECT count(*) FROM public.studio_member_rates r
    WHERE r.studio_id = 'c2200000-0000-4000-8000-0000000000a1'
      AND r.user_id   = 'c2200000-0000-4000-8000-000000000003'
      AND r.effective_from <= d.day::date
      AND (r.effective_to IS NULL OR r.effective_to >= d.day::date)
  ) <> 1;
  PERFORM pg_temp.reset_role();
  ASSERT v_covered = 0,
    'FAIL g6 (W1-R1-06, HT-3): exactly one rate row must cover every date in the span; '
    || v_covered || ' day(s) are covered by none or by more than one';

  RAISE NOTICE 'studio_member_rates: case (g) passed.';
END
$$;

-- ─── (h) a closed row is history: frozen, per role (W1-R1-08) ─────────────
DO $$
DECLARE
  v_owner_rate   BOOLEAN := false;
  v_owner_dates  BOOLEAN := false;
  v_admin_rate   BOOLEAN := false;
  v_identity     BOOLEAN := false;
BEGIN
  -- f1 is CLOSED by now (case g re-closed it at CURRENT_DATE - 11).
  PERFORM pg_temp.assume_user('c2200000-0000-4000-8000-000000000001');
  BEGIN
    UPDATE public.studio_member_rates SET hourly_rate_cents = 1
     WHERE id = 'c2200000-0000-4000-8000-0000000000f1';
  EXCEPTION WHEN check_violation THEN v_owner_rate := true;
  END;
  BEGIN
    UPDATE public.studio_member_rates SET effective_from = CURRENT_DATE - 29
     WHERE id = 'c2200000-0000-4000-8000-0000000000f1';
  EXCEPTION WHEN check_violation THEN v_owner_dates := true;
  END;

  -- The OPEN row stays correctable — the settings page saves on blur.
  UPDATE public.studio_member_rates SET hourly_rate_cents = 19000
   WHERE id = 'c2200000-0000-4000-8000-0000000000f3';

  BEGIN
    UPDATE public.studio_member_rates SET user_id = 'c2200000-0000-4000-8000-000000000006'
     WHERE id = 'c2200000-0000-4000-8000-0000000000f3';
  EXCEPTION WHEN check_violation THEN v_identity := true;
  END;
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('c2200000-0000-4000-8000-000000000002');
  BEGIN
    UPDATE public.studio_member_rates SET hourly_rate_cents = 1
     WHERE id = 'c2200000-0000-4000-8000-0000000000f1';
  EXCEPTION WHEN check_violation THEN v_admin_rate := true;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_owner_rate,
    'FAIL h1 (W1-R1-08): even the owner must not rewrite a CLOSED row''s rate — history is a fact';
  ASSERT v_owner_dates,
    'FAIL h2 (W1-R1-08): a closed row''s dates must be frozen too';
  ASSERT v_admin_rate,
    'FAIL h3 (W1-R1-08): an admin must not rewrite a closed row''s rate either';
  ASSERT v_identity,
    'FAIL h4 (W1-R1-08): a rate row may not be re-pointed at another member';
  ASSERT (SELECT hourly_rate_cents FROM public.studio_member_rates
           WHERE id = 'c2200000-0000-4000-8000-0000000000f1') = 15500,
    'FAIL h5: the refused edits must not have changed the closed row';
  ASSERT (SELECT hourly_rate_cents FROM public.studio_member_rates
           WHERE id = 'c2200000-0000-4000-8000-0000000000f3') = 19000,
    'FAIL h6: the OPEN row must still be correctable in place';

  RAISE NOTICE 'studio_member_rates: case (h) passed.';
END
$$;

-- ─── (i) the rate's subject must be a studio member (W1-R1-09) ────────────
DO $$
DECLARE
  v_guest   BOOLEAN := false;
  v_outside BOOLEAN := false;
BEGIN
  PERFORM pg_temp.assume_user('c2200000-0000-4000-8000-000000000001');
  BEGIN
    INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
    VALUES ('c2200000-0000-4000-8000-0000000000a1', 'c2200000-0000-4000-8000-000000000004',
            9000, CURRENT_DATE, 'c2200000-0000-4000-8000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN v_guest := true;
  END;
  BEGIN
    INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
    VALUES ('c2200000-0000-4000-8000-0000000000a1', 'c2200000-0000-4000-8000-000000000005',
            9000, CURRENT_DATE, 'c2200000-0000-4000-8000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN v_outside := true;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_guest,
    'FAIL i1 (W1-R1-09): a guest is not a subject a studio rate may be set for';
  ASSERT v_outside,
    'FAIL i2 (W1-R1-09): a rate row must not be creatable against a profile that is not '
    'a member of the studio at all';

  RAISE NOTICE 'studio_member_rates: case (i) passed.';
END
$$;

-- ─── (j) two owner/admins, one day: the second may correct the first (W1-R2-04) ─
-- The exact blur-save idiom HT-3 rules for, written the way the hook writes it:
-- useSetStudioMemberRate upserts ON CONFLICT (studio_id, user_id, effective_from)
-- and PostgREST assigns EVERY payload column from `excluded`, created_by included.
-- While the freeze covered created_by, a studio's SECOND admin could not correct a
-- rate the first had set the same day: the UPDATE raised 'identity and authorship
-- are immutable' and her number was silently lost. Cases (a2)/(b2) could not catch
-- it — they update hourly_rate_cents alone, as the same actor.
DO $$
DECLARE
  v_rate   INTEGER;
  v_author uuid;
  v_open   INTEGER;
BEGIN
  -- The OWNER types a rate for the second member today.
  PERFORM pg_temp.assume_user('c2200000-0000-4000-8000-000000000001');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('c2200000-0000-4000-8000-0000000000a1', 'c2200000-0000-4000-8000-000000000006',
          14000, CURRENT_DATE, 'c2200000-0000-4000-8000-000000000001')
  ON CONFLICT (studio_id, user_id, effective_from) DO UPDATE
    SET hourly_rate_cents = EXCLUDED.hourly_rate_cents,
        created_by        = EXCLUDED.created_by;
  PERFORM pg_temp.reset_role();

  -- The ADMIN corrects it the same day, through the same upsert.
  PERFORM pg_temp.assume_user('c2200000-0000-4000-8000-000000000002');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('c2200000-0000-4000-8000-0000000000a1', 'c2200000-0000-4000-8000-000000000006',
          15500, CURRENT_DATE, 'c2200000-0000-4000-8000-000000000002')
  ON CONFLICT (studio_id, user_id, effective_from) DO UPDATE
    SET hourly_rate_cents = EXCLUDED.hourly_rate_cents,
        created_by        = EXCLUDED.created_by;
  PERFORM pg_temp.reset_role();

  SELECT hourly_rate_cents, created_by INTO v_rate, v_author
  FROM public.studio_member_rates
  WHERE studio_id = 'c2200000-0000-4000-8000-0000000000a1'
    AND user_id   = 'c2200000-0000-4000-8000-000000000006'
    AND effective_from = CURRENT_DATE;

  ASSERT v_rate = 15500,
    'FAIL j1 (W1-R2-04): a second owner/admin must be able to correct the same day''s rate; '
    'the stored rate is ' || COALESCE(v_rate::text, 'NULL');
  ASSERT v_author = 'c2200000-0000-4000-8000-000000000002',
    'FAIL j2 (W1-R2-04): created_by on the OPEN row records the last author, got '
    || COALESCE(v_author::text, 'NULL');

  SELECT count(*) INTO v_open FROM public.studio_member_rates
   WHERE studio_id = 'c2200000-0000-4000-8000-0000000000a1'
     AND user_id   = 'c2200000-0000-4000-8000-000000000006'
     AND effective_to IS NULL;
  ASSERT v_open = 1,
    'FAIL j3: the correction must not leave a second open row, found ' || v_open;

  RAISE NOTICE 'studio_member_rates: case (j) passed.';
END
$$;

-- ─── (k) effective_to is the ladder's, not the caller's (W1-R3-04) ──────────
-- Member …003's history at this point is the ladder case (g) built and (h) left
-- alone: f1 [CURRENT_DATE-30 .. CURRENT_DATE-11], f4 [CURRENT_DATE-10 ..
-- CURRENT_DATE-1], f3 [CURRENT_DATE .. open]. The probe that broke the invariant
-- inserts a backdated row WITH an explicit effective_to, so the close's own
-- "- 1" never applies and two rows end up covering the same dates.
DO $$
DECLARE
  v_refused BOOLEAN := false;
  v_no_open BOOLEAN := false;
  v_covered INTEGER;
  v_open    INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('c2200000-0000-4000-8000-000000000001');

  BEGIN
    INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, effective_to, created_by)
    VALUES ('c2200000-0000-4000-8000-0000000000a1', 'c2200000-0000-4000-8000-000000000003',
            30000, CURRENT_DATE - 20, CURRENT_DATE - 5,
            'c2200000-0000-4000-8000-000000000001');
  EXCEPTION WHEN check_violation THEN v_refused := true;
  END;

  -- The second shape the same hole allowed: a rate that closes with nothing after
  -- it, leaving the member with NO open row — every later hour resolves 'none'.
  BEGIN
    INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, effective_to, created_by)
    VALUES ('c2200000-0000-4000-8000-0000000000a1', 'c2200000-0000-4000-8000-000000000006',
            31000, CURRENT_DATE + 1, CURRENT_DATE + 2,
            'c2200000-0000-4000-8000-000000000001');
  EXCEPTION WHEN check_violation THEN v_no_open := true;
  END;

  -- The ladder's own close still works for an ordinary dated write: no
  -- effective_to sent, so the column is computed.
  -- A DIFFERENT effective_from from the refused row above on purpose: if the
  -- refusal ever regresses, this must fail on k1 rather than on the unique index.
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('c2200000-0000-4000-8000-0000000000a1', 'c2200000-0000-4000-8000-000000000003',
          21000, CURRENT_DATE - 25, 'c2200000-0000-4000-8000-000000000001');

  -- g6, re-asserted after the refusals and the legitimate backdated write.
  SELECT count(*) INTO v_covered
  FROM generate_series(CURRENT_DATE - 30, CURRENT_DATE, INTERVAL '1 day') AS d(day)
  WHERE (
    SELECT count(*) FROM public.studio_member_rates r
    WHERE r.studio_id = 'c2200000-0000-4000-8000-0000000000a1'
      AND r.user_id   = 'c2200000-0000-4000-8000-000000000003'
      AND r.effective_from <= d.day::date
      AND (r.effective_to IS NULL OR r.effective_to >= d.day::date)
  ) <> 1;

  SELECT count(*) INTO v_open FROM public.studio_member_rates
   WHERE studio_id = 'c2200000-0000-4000-8000-0000000000a1'
     AND user_id   = 'c2200000-0000-4000-8000-000000000003'
     AND effective_to IS NULL;
  PERFORM pg_temp.reset_role();

  ASSERT v_refused,
    'FAIL k1 (W1-R3-04): a caller-supplied effective_to must be refused — hand-closing a '
    'backdated row is how two rates came to cover one day';
  ASSERT v_no_open,
    'FAIL k2 (W1-R3-04): the same refusal must cover the shape that leaves NO open row';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.studio_member_rates
    WHERE studio_id = 'c2200000-0000-4000-8000-0000000000a1'
      AND user_id   = 'c2200000-0000-4000-8000-000000000003'
      AND hourly_rate_cents = 30000),
    'FAIL k3 (W1-R3-04): the refused row must not exist';
  ASSERT v_covered = 0,
    'FAIL k4 (W1-R3-04, HT-3): exactly one rate row must still cover every date in the span; '
    || v_covered || ' day(s) are covered by none or by more than one';
  ASSERT v_open = 1,
    'FAIL k5: exactly one open row must survive the legitimate backdated write, found ' || v_open;

  RAISE NOTICE 'studio_member_rates: case (k) passed.';
  RAISE NOTICE 'All studio_member_rates assertions passed.';
END
$$;

ROLLBACK;
