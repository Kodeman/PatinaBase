-- ═══════════════════════════════════════════════════════════════════════════
-- studio_hours_rollup + the HT-10 narrowing (migrations 00606 + 00607)
--
-- Asserted PER ROLE — owner · admin · rostered member · plain studio co-member ·
-- guest · non-member — every read through RLS as the named actor.
--
--   (a) SHAPE — `notes` appears in neither rollup's return type. An
--       information_schema/pg_proc assert, not a row assert: HT-36 is a
--       type-level guarantee, so a future hand cannot add the column "just for
--       the detail view".
--   (b) the `owner` gets every member's bucket, with the studio's money.
--   (c) a plain `member` passing a colleague's p_user_id gets NOTHING of his,
--       and calling it unscoped gets only her own bucket. HT-38's INVOKER
--       rollup is exactly this: RLS is the scope, not an argument check.
--   (d) a `guest` co-member and an owner of ANOTHER studio each get nothing.
--   (e) each of the five p_group_by literals returns; a sixth RAISES
--       (invalid_parameter_value), and no dynamic SQL is involved.
--   (f) THE NARROWING, W1-R10-03's read half: a plain studio co-member no longer
--       reads a studio-mate's row on a project she is NOT rostered to — the row,
--       and with it his confidential per-person rate. The control is that she
--       cannot read his studio_member_rates row either (00598), so the two
--       surfaces now agree.
--       (f4) THE RESIDUE, stated rather than discovered: a project's OWN designer
--       still reads every row of her project including that rate, because
--       `Designers manage their project time entries` (00177:136-137) is an ALL
--       policy with no user_id leg and plan-v2 §3 leaves it untouched — it is
--       also what lets a designer correct a teammate's entry at all (W1-R1-05,
--       case (ab4) of time_rate_resolution_test.sql). Narrowing it is a ruling,
--       not a tidy.
--   (g) the 00484-registered rostered read is narrowed too: a member rostered to
--       the SAME project reads her own rows and not her teammate's, while the
--       aggregate she needs comes from project_hours_total (its own suite).
--   (h) internal time is its own column of the rollup, never hidden inside the
--       total (W0's source = 'internal'; W4's project-less row is already in the
--       filter).
--   (i) a RUNNING timer is in no total — an unfinished hour is not money.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rls/studio_hours_rollup_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c6070000-0000-4000-8000-000000000001', 'rollup-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6070000-0000-4000-8000-000000000002', 'rollup-admin@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6070000-0000-4000-8000-000000000003', 'rollup-one@test.invalid',      '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6070000-0000-4000-8000-000000000004', 'rollup-two@test.invalid',      '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6070000-0000-4000-8000-000000000005', 'rollup-guest@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6070000-0000-4000-8000-000000000006', 'rollup-outside@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6070000-0000-4000-8000-000000000007', 'rollup-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('c6070000-0000-4000-8000-000000000001', 'rollup-owner@test.invalid',    'Rollup Owner',    NOW(), NOW()),
  ('c6070000-0000-4000-8000-000000000002', 'rollup-admin@test.invalid',    'Rollup Admin',    NOW(), NOW()),
  ('c6070000-0000-4000-8000-000000000003', 'rollup-one@test.invalid',      'Rollup One',      NOW(), NOW()),
  ('c6070000-0000-4000-8000-000000000004', 'rollup-two@test.invalid',      'Rollup Two',      NOW(), NOW()),
  ('c6070000-0000-4000-8000-000000000005', 'rollup-guest@test.invalid',    'Rollup Guest',    NOW(), NOW()),
  ('c6070000-0000-4000-8000-000000000006', 'rollup-outside@test.invalid',  'Rollup Outside',  NOW(), NOW()),
  ('c6070000-0000-4000-8000-000000000007', 'rollup-designer@test.invalid', 'Rollup Designer', NOW(), NOW())
-- DO UPDATE, not DO NOTHING: handle_new_user has already inserted a profile
-- row for each auth.users row above, with a NULL full_name — so DO NOTHING
-- would leave every name NULL and the member-name asserts below would pass
-- for the wrong reason.
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO organizations (id, type, name, slug, status)
VALUES
  ('c6070000-0000-4000-8000-0000000000a1', 'design_studio', 'Rollup Studio',  'rollup-studio-test',  'active'),
  ('c6070000-0000-4000-8000-0000000000a2', 'design_studio', 'Rollup Outside', 'rollup-outside-test', 'active');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('c6070000-0000-4000-8000-0000000000c1', 'c6070000-0000-4000-8000-000000000001',
   'c6070000-0000-4000-8000-0000000000a1', 'owner',  'active', NOW()),
  ('c6070000-0000-4000-8000-0000000000c2', 'c6070000-0000-4000-8000-000000000002',
   'c6070000-0000-4000-8000-0000000000a1', 'admin',  'active', NOW()),
  ('c6070000-0000-4000-8000-0000000000c3', 'c6070000-0000-4000-8000-000000000003',
   'c6070000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('c6070000-0000-4000-8000-0000000000c4', 'c6070000-0000-4000-8000-000000000004',
   'c6070000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('c6070000-0000-4000-8000-0000000000c5', 'c6070000-0000-4000-8000-000000000005',
   'c6070000-0000-4000-8000-0000000000a1', 'guest',  'active', NOW()),
  ('c6070000-0000-4000-8000-0000000000c6', 'c6070000-0000-4000-8000-000000000006',
   'c6070000-0000-4000-8000-0000000000a2', 'owner',  'active', NOW()),
  -- The plain-member DESIGNER of case (f4): a `member` seat, no owner/admin
  -- standing anywhere, and a project of her own.
  ('c6070000-0000-4000-8000-0000000000c7', 'c6070000-0000-4000-8000-000000000007',
   'c6070000-0000-4000-8000-0000000000a1', 'member', 'active', NOW());

-- Two per-person rates, both confidential to their subject and the studio's
-- owner/admin (studio_member_rates_read_self_or_admin, 00598).
INSERT INTO studio_member_rates (id, studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES
  ('c6070000-0000-4000-8000-0000000000d3', 'c6070000-0000-4000-8000-0000000000a1',
   'c6070000-0000-4000-8000-000000000003', 10000, CURRENT_DATE - 400, 'c6070000-0000-4000-8000-000000000001'),
  ('c6070000-0000-4000-8000-0000000000d4', 'c6070000-0000-4000-8000-0000000000a1',
   'c6070000-0000-4000-8000-000000000004', 30000, CURRENT_DATE - 400, 'c6070000-0000-4000-8000-000000000001');

-- P1 is the shared house; P2 is where only One works; P3 belongs to the
-- plain-member designer. All three NAME the studio, so the ledger's studio_id is
-- HT-3-a step 1 and the rollup's scope is unambiguous.
INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES
  ('c6070000-0000-4000-8000-0000000000e1', 'Rollup House',   'c6070000-0000-4000-8000-000000000001',
   'c6070000-0000-4000-8000-000000000001', 'c6070000-0000-4000-8000-0000000000a1'),
  ('c6070000-0000-4000-8000-0000000000e2', 'Rollup Annex',   'c6070000-0000-4000-8000-000000000001',
   'c6070000-0000-4000-8000-000000000001', 'c6070000-0000-4000-8000-0000000000a1'),
  ('c6070000-0000-4000-8000-0000000000e3', 'Designer House', 'c6070000-0000-4000-8000-000000000007',
   'c6070000-0000-4000-8000-000000000001', 'c6070000-0000-4000-8000-0000000000a1');

-- ─── helpers ───────────────────────────────────────────────────────────────
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

-- ─── the hours, each logged by the person who worked it ────────────────────
DO $$
BEGIN
  -- One: 120 billable min on P1 at 10000, 30 internal min on P1, 60 min on P2,
  -- 60 min on the designer's P3, and a running timer.
  PERFORM pg_temp.assume_user('c6070000-0000-4000-8000-000000000003');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source, activity, notes)
  VALUES
    ('c6070000-0000-4000-8000-0000000000b1', 'c6070000-0000-4000-8000-0000000000e1',
     'c6070000-0000-4000-8000-000000000003', NOW() - INTERVAL '3 hours', 120, true,  'manual_entry', 'design', 'one on the house'),
    ('c6070000-0000-4000-8000-0000000000b2', 'c6070000-0000-4000-8000-0000000000e1',
     'c6070000-0000-4000-8000-000000000003', NOW() - INTERVAL '5 hours',  30, false, 'internal',     'admin',  'studio admin'),
    ('c6070000-0000-4000-8000-0000000000b3', 'c6070000-0000-4000-8000-0000000000e2',
     'c6070000-0000-4000-8000-000000000003', NOW() - INTERVAL '7 hours',  60, true,  'manual_entry', NULL,     'one in the annex'),
    ('c6070000-0000-4000-8000-0000000000b4', 'c6070000-0000-4000-8000-0000000000e3',
     'c6070000-0000-4000-8000-000000000003', NOW() - INTERVAL '9 hours',  60, true,  'manual_entry', 'design', 'one at the designer''s'),
    ('c6070000-0000-4000-8000-0000000000b5', 'c6070000-0000-4000-8000-0000000000e1',
     'c6070000-0000-4000-8000-000000000003', NOW() - INTERVAL '10 minutes', NULL, true, 'timer_auto', NULL,   'still running');
  PERFORM pg_temp.reset_role();

  -- Two: 60 billable min on P1 at 30000.
  PERFORM pg_temp.assume_user('c6070000-0000-4000-8000-000000000004');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source, activity, notes)
  VALUES
    ('c6070000-0000-4000-8000-0000000000b6', 'c6070000-0000-4000-8000-0000000000e1',
     'c6070000-0000-4000-8000-000000000004', NOW() - INTERVAL '4 hours', 60, true, 'manual_entry', 'sourcing', 'two on the house');
  PERFORM pg_temp.reset_role();
END
$$;

-- Preconditions: the money is on the rows, or every total below is zero for the
-- wrong reason.
DO $$
DECLARE
  v_rate integer;
  v_src  text;
BEGIN
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_src
  FROM project_time_entries WHERE id = 'c6070000-0000-4000-8000-0000000000b1';
  ASSERT v_rate = 10000 AND v_src = 'studio_member',
    'FAIL pre1: One''s hour must be priced at 10000 by the studio; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_src, 'NULL');
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_src
  FROM project_time_entries WHERE id = 'c6070000-0000-4000-8000-0000000000b6';
  ASSERT v_rate = 30000 AND v_src = 'studio_member',
    'FAIL pre2: Two''s hour must be priced at 30000; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_src, 'NULL');
END
$$;

-- ─── (a) the return shape has no notes ─────────────────────────────────────
DO $$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS routine
    CROSS JOIN LATERAL unnest(COALESCE(routine.proargnames, ARRAY[]::text[])) AS arg(arg_name)
    WHERE routine.oid IN (
        to_regprocedure('public.studio_hours_rollup(uuid,date,date,text,uuid,uuid)'),
        to_regprocedure('public.project_hours_total(uuid)')
      )
      AND lower(arg.arg_name) LIKE '%note%'
  ), 'FAIL a (HT-36): neither rollup may carry notes in its return shape. This is '
     'asserted on the TYPE, not on rows, so a filter cannot satisfy it';

  ASSERT NOT (SELECT prosecdef FROM pg_proc
    WHERE oid = to_regprocedure('public.studio_hours_rollup(uuid,date,date,text,uuid,uuid)')),
    'FAIL a2 (HT-38): the studio rollup must be SECURITY INVOKER — the per-role '
    'cases below measure RLS, and a DEFINER rollup would make them all pass '
    'vacuously';

  RAISE NOTICE 'studio_hours_rollup: case (a) passed.';
END
$$;

-- ─── (b) the owner gets the studio ─────────────────────────────────────────
DO $$
DECLARE
  v_rows     integer;
  v_one_min  integer;
  v_one_bill integer;
  v_one_int  integer;
  v_one_cent bigint;
  v_two_cent bigint;
  v_name     text;
BEGIN
  PERFORM pg_temp.assume_user('c6070000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_rows FROM public.studio_hours_rollup(
    'c6070000-0000-4000-8000-0000000000a1', CURRENT_DATE - 30, CURRENT_DATE + 2, 'member');
  SELECT total_minutes, billable_minutes, internal_minutes, billable_cents, member_name
    INTO v_one_min, v_one_bill, v_one_int, v_one_cent, v_name
  FROM public.studio_hours_rollup(
    'c6070000-0000-4000-8000-0000000000a1', CURRENT_DATE - 30, CURRENT_DATE + 2, 'member')
  WHERE member_id = 'c6070000-0000-4000-8000-000000000003';
  SELECT billable_cents INTO v_two_cent
  FROM public.studio_hours_rollup(
    'c6070000-0000-4000-8000-0000000000a1', CURRENT_DATE - 30, CURRENT_DATE + 2, 'member')
  WHERE member_id = 'c6070000-0000-4000-8000-000000000004';
  PERFORM pg_temp.reset_role();

  ASSERT v_rows = 2,
    'FAIL b1 (HT-8/HT-9): the owner''s studio scope must carry a bucket per '
    'member who worked — her own hours are not the answer to "where did the week '
    'go"; buckets = ' || v_rows;
  ASSERT v_one_min = 270,
    'FAIL b2: One logged 120 + 30 + 60 + 60 completed minutes; got '
    || COALESCE(v_one_min::text, 'NULL');
  ASSERT v_one_bill = 240,
    'FAIL b3: 30 of One''s minutes are non-billable internal time; billable = '
    || COALESCE(v_one_bill::text, 'NULL');
  ASSERT v_one_int = 30,
    'FAIL b4 (h): internal time is its own column, not a silent part of the '
    'total; internal = ' || COALESCE(v_one_int::text, 'NULL');
  ASSERT v_one_cent = 40000,
    'FAIL b5: 240 billable minutes at $100/h is 40000 cents; got '
    || COALESCE(v_one_cent::text, 'NULL');
  ASSERT v_two_cent = 30000,
    'FAIL b6: Two''s 60 minutes at $300/h is 30000 cents — the rollup must price '
    'each member by HER OWN rate, not by one studio number; got '
    || COALESCE(v_two_cent::text, 'NULL');
  ASSERT v_name = 'Rollup One',
    'FAIL b7: the member is NAMED in the studio scope (the leftmost fact); got '
    || COALESCE(v_name, 'NULL');

  RAISE NOTICE 'studio_hours_rollup: case (b) passed.';
END
$$;

-- ─── (c) a plain member: her own, and nothing of his ───────────────────────
DO $$
DECLARE
  v_rows  integer;
  v_mine  integer;
  v_key   text;
BEGIN
  PERFORM pg_temp.assume_user('c6070000-0000-4000-8000-000000000004');
  SELECT count(*) INTO v_rows FROM public.studio_hours_rollup(
    'c6070000-0000-4000-8000-0000000000a1', CURRENT_DATE - 30, CURRENT_DATE + 2, 'member',
    'c6070000-0000-4000-8000-000000000003');
  SELECT count(*), min(bucket_key) INTO v_mine, v_key FROM public.studio_hours_rollup(
    'c6070000-0000-4000-8000-0000000000a1', CURRENT_DATE - 30, CURRENT_DATE + 2, 'member');
  PERFORM pg_temp.reset_role();

  ASSERT v_rows = 0,
    'FAIL c1 (HT-38 + HT-10): a plain member aiming the member scope at a '
    'colleague must get NOTHING — the rollup is INVOKER and RLS is the scope, so '
    'this is the same refusal the table gives; buckets = ' || v_rows;
  ASSERT v_mine = 1 AND v_key = 'c6070000-0000-4000-8000-000000000004',
    'FAIL c2: unscoped, she must get exactly her own bucket; buckets = ' || v_mine
    || ' key = ' || COALESCE(v_key, 'NULL');

  RAISE NOTICE 'studio_hours_rollup: case (c) passed.';
END
$$;

-- ─── (d) a guest, and another studio's owner ────────────────────────────────
DO $$
DECLARE
  v_rows integer;
BEGIN
  PERFORM pg_temp.assume_user('c6070000-0000-4000-8000-000000000005');
  SELECT count(*) INTO v_rows FROM public.studio_hours_rollup(
    'c6070000-0000-4000-8000-0000000000a1', CURRENT_DATE - 30, CURRENT_DATE + 2, 'member');
  PERFORM pg_temp.reset_role();
  ASSERT v_rows = 0,
    'FAIL d1: a guest co-member gets no studio rollup; buckets = ' || v_rows;

  PERFORM pg_temp.assume_user('c6070000-0000-4000-8000-000000000006');
  SELECT count(*) INTO v_rows FROM public.studio_hours_rollup(
    'c6070000-0000-4000-8000-0000000000a1', CURRENT_DATE - 30, CURRENT_DATE + 2, 'member');
  PERFORM pg_temp.reset_role();
  ASSERT v_rows = 0,
    'FAIL d2: an owner of ANOTHER studio gets nothing of this one, even though '
    'she may call the function; buckets = ' || v_rows;

  RAISE NOTICE 'studio_hours_rollup: case (d) passed.';
END
$$;

-- ─── (e) the five literals, and the sixth ──────────────────────────────────
DO $$
DECLARE
  v_group   text;
  v_rows    integer;
  v_state   text;
  v_label   text;
BEGIN
  PERFORM pg_temp.assume_user('c6070000-0000-4000-8000-000000000001');
  FOREACH v_group IN ARRAY ARRAY['member', 'project', 'day', 'iso_week', 'activity'] LOOP
    SELECT count(*) INTO v_rows FROM public.studio_hours_rollup(
      'c6070000-0000-4000-8000-0000000000a1', CURRENT_DATE - 30, CURRENT_DATE + 2, v_group);
    ASSERT v_rows > 0,
      'FAIL e1: p_group_by = ' || v_group || ' must return buckets; got ' || v_rows;
  END LOOP;

  -- HT-24: the unset activity prints honestly rather than as a blank.
  SELECT bucket_label INTO v_label FROM public.studio_hours_rollup(
    'c6070000-0000-4000-8000-0000000000a1', CURRENT_DATE - 30, CURRENT_DATE + 2, 'activity')
  WHERE bucket_key = 'unset';
  ASSERT v_label = 'activity not set',
    'FAIL e2 (HT-24): an hour with no activity is labelled honestly, never blank; '
    'got ' || COALESCE(v_label, 'NO BUCKET');

  v_state := NULL;
  BEGIN
    SELECT count(*) INTO v_rows FROM public.studio_hours_rollup(
      'c6070000-0000-4000-8000-0000000000a1', CURRENT_DATE - 30, CURRENT_DATE + 2, 'member_name');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state = '22023',
    'FAIL e3: a sixth p_group_by must RAISE invalid_parameter_value — a silent '
    'NULL bucket would collapse the studio into one unlabelled row; got '
    || COALESCE(v_state, 'NO RAISE');

  RAISE NOTICE 'studio_hours_rollup: case (e) passed.';
END
$$;

-- ─── (f) the narrowing: W1-R10-03's read half ──────────────────────────────
DO $$
DECLARE
  v_rates   integer;
  v_rows    integer;
  v_rate    integer;
BEGIN
  -- Two is an active non-guest co-member of the studio and is NOT rostered to P2.
  ASSERT NOT EXISTS (
    SELECT 1 FROM project_team_members
    WHERE project_id = 'c6070000-0000-4000-8000-0000000000e2'
      AND user_id = 'c6070000-0000-4000-8000-000000000004'
      AND removed_at IS NULL
  ), 'FAIL f0 (precondition): Two must not be rostered to the annex, or this case '
     'measures the 00484 policy instead of the studio-wide one';

  PERFORM pg_temp.assume_user('c6070000-0000-4000-8000-000000000004');
  -- f1 CONTROL (00598): his rate row is confidential from her.
  SELECT count(*) INTO v_rates FROM public.studio_member_rates
   WHERE user_id = 'c6070000-0000-4000-8000-000000000003';
  -- f2: and so, now, is the copy of it on his hour.
  SELECT count(*) INTO v_rows FROM public.project_time_entries
   WHERE id = 'c6070000-0000-4000-8000-0000000000b3';
  SELECT max(hourly_rate_cents) INTO v_rate FROM public.project_time_entries
   WHERE user_id = 'c6070000-0000-4000-8000-000000000003';
  PERFORM pg_temp.reset_role();

  ASSERT v_rates = 0,
    'FAIL f1 (control, 00598): studio_member_rates_read_self_or_admin must hide a '
    'colleague''s rate from a plain member, or f2 measures the wrong leak; rows = '
    || v_rates;
  ASSERT v_rows = 0,
    'FAIL f2 (HT-10 + HT-10-a, W1-R10-03): after 00606 a plain studio co-member '
    'must read NOTHING of a studio-mate''s hour on a project she is not rostered '
    'to. time_entries_studio_read (00316:237-240) used to grant it with no '
    'user_id leg, and since W1 that row carries his per-person rate; rows = ' || v_rows;
  ASSERT v_rate IS NULL,
    'FAIL f3: the confidential number itself must be unreachable through the '
    'hours table — the write half (00601 delta 1a) closed minting it, this closes '
    'reading it; got ' || COALESCE(v_rate::text, 'NULL');

  -- f4: THE RESIDUE, asserted as SHIPPED BEHAVIOUR rather than discovered later.
  -- The plain-member DESIGNER of P3 still reads One's hour on P3, rate included,
  -- through `Designers manage their project time entries` (00177:136-137) — an
  -- ALL policy with no user_id leg that plan-v2 §3 leaves untouched and that
  -- W1-R1-05 requires so a designer can correct a teammate's entry.
  PERFORM pg_temp.assume_user('c6070000-0000-4000-8000-000000000007');
  SELECT count(*), max(hourly_rate_cents) INTO v_rows, v_rate
  FROM public.project_time_entries
   WHERE id = 'c6070000-0000-4000-8000-0000000000b4';
  PERFORM pg_temp.reset_role();
  ASSERT v_rows = 1 AND v_rate = 10000,
    'FAIL f4 (stated residue of HT-10-a): a project''s OWN designer still reads '
    'every row of her project, per-person rate included — 00177:136-137 is an ALL '
    'policy with no user_id leg, and narrowing it would take the designer''s '
    'correction of a teammate''s entry with it (W1-R1-05). If this now reads 0, '
    'someone narrowed that policy and case (ab4) of time_rate_resolution_test.sql '
    'is the thing to check; rows = ' || v_rows || ' rate = '
    || COALESCE(v_rate::text, 'NULL');

  RAISE NOTICE 'studio_hours_rollup: case (f) passed — the studio-wide read is narrowed, the designer residue is pinned.';
END
$$;

-- ─── (g) the 00484-registered rostered read is narrowed too ────────────────
DO $$
DECLARE
  v_mine integer;
  v_hers integer;
BEGIN
  -- Both logged on P1, so 00597 seated both: each is rostered to the same project.
  ASSERT EXISTS (
    SELECT 1 FROM project_team_members
    WHERE project_id = 'c6070000-0000-4000-8000-0000000000e1'
      AND user_id = 'c6070000-0000-4000-8000-000000000004'
      AND removed_at IS NULL
  ), 'FAIL g0 (precondition): Two must be rostered to the house by 00597, or this '
     'case does not exercise the 00484-registered policy at all';

  PERFORM pg_temp.assume_user('c6070000-0000-4000-8000-000000000004');
  SELECT count(*) INTO v_mine FROM public.project_time_entries
   WHERE id = 'c6070000-0000-4000-8000-0000000000b6';
  SELECT count(*) INTO v_hers FROM public.project_time_entries
   WHERE id = 'c6070000-0000-4000-8000-0000000000b1';
  PERFORM pg_temp.reset_role();

  ASSERT v_mine = 1,
    'FAIL g1: a member must still read her OWN hour on a project she is rostered '
    'to; rows = ' || v_mine;
  ASSERT v_hers = 0,
    'FAIL g2 (HT-10-a): `Team can view their project time entries` is narrowed to '
    'own rows — a rostered member no longer reads a teammate''s row, notes and '
    'rate included. Her project TOTAL comes from project_hours_total instead '
    '(supabase/tests/rls/project_hours_total_test.sql); rows = ' || v_hers;

  RAISE NOTICE 'studio_hours_rollup: case (g) passed.';
END
$$;

-- ─── (i) a running timer is in no total ────────────────────────────────────
DO $$
DECLARE
  v_count integer;
  v_total integer;
BEGIN
  ASSERT (SELECT is_running FROM public.time_entry_ledger
           WHERE id = 'c6070000-0000-4000-8000-0000000000b5'),
    'FAIL i0 (precondition): the running row must be running';

  PERFORM pg_temp.assume_user('c6070000-0000-4000-8000-000000000001');
  SELECT entry_count, total_minutes INTO v_count, v_total
  FROM public.studio_hours_rollup(
    'c6070000-0000-4000-8000-0000000000a1', CURRENT_DATE - 30, CURRENT_DATE + 2, 'member')
  WHERE member_id = 'c6070000-0000-4000-8000-000000000003';
  PERFORM pg_temp.reset_role();

  ASSERT v_count = 4,
    'FAIL i1: One has FOUR completed entries and one running — the running row is '
    'not an entry in a total; entry_count = ' || COALESCE(v_count::text, 'NULL');
  ASSERT v_total = 270,
    'FAIL i2: a running timer contributes no minutes; total = '
    || COALESCE(v_total::text, 'NULL');

  RAISE NOTICE 'studio_hours_rollup: case (i) passed.';
END
$$;

ROLLBACK;
