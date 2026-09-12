-- ═══════════════════════════════════════════════════════════════════════════
-- time_entry_ledger + project_pricing_studio_id (migration 00604, W2)
--
-- Covers:
--   (a) SHAPE — the view carries no `notes` column (HT-36), is
--       security_invoker, and exposes the columns the four scopes read.
--   (b) THE PRICING STUDIO IS ONE RULE, not three bodies. HT-3-a/b live in
--       three places now — 00599's resolver, 00603's stamp, and 00604's callable
--       form — so this case asserts the EQUIVALENCE the single body would have
--       given for free, on three project shapes:
--         (b1) step 1: the project NAMES its studio → the ledger's studio_id is
--              that studio, and it is the studio whose studio_member_rates row
--              priced the hour (20000 / 'studio_member').
--         (b2) step 2, EMPLOYER tier, on a legacy studio_id IS NULL project →
--              the one employer prices (20000) and the helper returns it.
--         (b3) an AMBIGUOUS employer tier → the resolver says 'none' and the
--              helper says NULL. The two agree on nothing as well as on numbers.
--   (c) ONE RATE SOURCE (00596's rule, carried into the ledger):
--       resolved_rate_cents × duration reconciles with amount_cents on every
--       row; a rate-less row reads 0 / 0; a running timer is is_running = true
--       and carries no money.
--   (d) THE LEFT JOIN PAYOFF — 00596 deleted its profiles join and recorded that
--       the author's display name would be "bought once, deliberately, by W2's
--       time_entry_ledger view". Bought here as an OUTER join: an entry whose
--       author's profile the caller CANNOT read still appears, with
--       member_name NULL. An INNER join would drop the hour and understate the
--       studio — the 00555:3024-3026 hazard under security_invoker.
--   (e) the UTC bucket basis (day / iso_week / month), matching 00599's own
--       date basis so one hour never lands in two weeks.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/billing/time_entry_ledger_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c6040000-0000-4000-8000-000000000001', 'ledger-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6040000-0000-4000-8000-000000000002', 'ledger-member@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6040000-0000-4000-8000-000000000003', 'ledger-vendor@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6040000-0000-4000-8000-000000000004', 'ledger-employee@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6040000-0000-4000-8000-000000000005', 'ledger-twohats@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('c6040000-0000-4000-8000-000000000001', 'ledger-owner@test.invalid',    'Ledger Owner',    NOW(), NOW()),
  ('c6040000-0000-4000-8000-000000000002', 'ledger-member@test.invalid',   'Ledger Member',   NOW(), NOW()),
  ('c6040000-0000-4000-8000-000000000003', 'ledger-vendor@test.invalid',   'Ledger Vendor',   NOW(), NOW()),
  ('c6040000-0000-4000-8000-000000000004', 'ledger-employee@test.invalid', 'Ledger Employee', NOW(), NOW()),
  ('c6040000-0000-4000-8000-000000000005', 'ledger-twohats@test.invalid',  'Ledger Twohats',  NOW(), NOW())
-- DO UPDATE, not DO NOTHING: handle_new_user has already inserted a profile
-- row for each auth.users row above, with a NULL full_name — so DO NOTHING
-- would leave every name NULL and the member-name asserts below would pass
-- for the wrong reason.
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO organizations (id, type, name, slug, status)
VALUES
  ('c6040000-0000-4000-8000-0000000000a1', 'design_studio', 'Ledger Studio', 'ledger-studio-test',  'active'),
  ('c6040000-0000-4000-8000-0000000000a2', 'design_studio', 'Ledger Second', 'ledger-second-test',  'active');

-- S's owner; the member being priced; the EMPLOYEE designer (one non-owner seat
-- in S and nothing else); and the TWO-HATS designer (non-owner seats in BOTH S
-- and T — the ambiguous employer tier HT-3-b prices at nothing). The vendor is
-- deliberately a member of NO organization: that is what makes (d)'s profile
-- unreadable.
INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('c6040000-0000-4000-8000-0000000000c1', 'c6040000-0000-4000-8000-000000000001',
   'c6040000-0000-4000-8000-0000000000a1', 'owner',  'active', NOW()),
  ('c6040000-0000-4000-8000-0000000000c2', 'c6040000-0000-4000-8000-000000000002',
   'c6040000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('c6040000-0000-4000-8000-0000000000c4', 'c6040000-0000-4000-8000-000000000004',
   'c6040000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('c6040000-0000-4000-8000-0000000000c5', 'c6040000-0000-4000-8000-000000000005',
   'c6040000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('c6040000-0000-4000-8000-0000000000c6', 'c6040000-0000-4000-8000-000000000005',
   'c6040000-0000-4000-8000-0000000000a2', 'admin',  'active', NOW());

-- The studio prices the member. Written as postgres: studio_member_rates' own
-- authorization is asserted per role in supabase/tests/rls/studio_member_rates_test.sql.
-- effective_from is 400 days back because the hours below carry FIXED started_at
-- dates (case (e) asserts the UTC buckets against literals): 00599 matches the
-- rate span against `(started_at AT TIME ZONE 'UTC')::date`, so a rate dated
-- relative to a later CURRENT_DATE would cover none of them and every case would
-- read 'none'.
INSERT INTO studio_member_rates (id, studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES ('c6040000-0000-4000-8000-0000000000d2', 'c6040000-0000-4000-8000-0000000000a1',
        'c6040000-0000-4000-8000-000000000002', 20000, CURRENT_DATE - 400,
        'c6040000-0000-4000-8000-000000000001');

-- P1 NAMES its studio (HT-3-a step 1). P2 and P3 are inserted naming it too and
-- then have the column CLEARED below — 00603's stamp is BEFORE INSERT only, so an
-- UPDATE is the only way to build the legacy shape a pre-00563 project carries.
INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES
  ('c6040000-0000-4000-8000-0000000000e1', 'Ledger House',   'c6040000-0000-4000-8000-000000000001',
   'c6040000-0000-4000-8000-000000000001', 'c6040000-0000-4000-8000-0000000000a1'),
  ('c6040000-0000-4000-8000-0000000000e2', 'Employee House', 'c6040000-0000-4000-8000-000000000004',
   'c6040000-0000-4000-8000-000000000001', 'c6040000-0000-4000-8000-0000000000a1'),
  ('c6040000-0000-4000-8000-0000000000e3', 'Twohats House',  'c6040000-0000-4000-8000-000000000005',
   'c6040000-0000-4000-8000-000000000001', 'c6040000-0000-4000-8000-0000000000a1');

UPDATE projects SET studio_id = NULL
 WHERE id IN ('c6040000-0000-4000-8000-0000000000e2', 'c6040000-0000-4000-8000-0000000000e3');

-- The vendor is seated on the roster of P1 and is in no organization.
INSERT INTO project_team_members (id, project_id, user_id, role, assigned_by)
VALUES ('c6040000-0000-4000-8000-0000000000f3', 'c6040000-0000-4000-8000-0000000000e1',
        'c6040000-0000-4000-8000-000000000003', 'vendor',
        'c6040000-0000-4000-8000-000000000001');

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

-- ─── the hours, each written through RLS by the person who worked it ───────
DO $$
BEGIN
  -- b1 / c1: the member's priced hour on the studio's own house. 120 min at
  -- 20000 = 40000 cents.
  PERFORM pg_temp.assume_user('c6040000-0000-4000-8000-000000000002');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source, activity, notes)
  VALUES ('c6040000-0000-4000-8000-0000000000b1', 'c6040000-0000-4000-8000-0000000000e1',
          'c6040000-0000-4000-8000-000000000002',
          '2026-03-04T15:00:00Z', 120, true, 'manual_entry', 'design', 'a note nobody may read in the ledger');
  -- b2: the same member's hour on the legacy NULL-studio project of the EMPLOYEE
  -- designer — step 2's employer tier.
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6040000-0000-4000-8000-0000000000b2', 'c6040000-0000-4000-8000-0000000000e2',
          'c6040000-0000-4000-8000-000000000002',
          '2026-03-05T09:00:00Z', 60, true, 'manual_entry');
  -- b3: and on the TWO-HATS designer's project — an ambiguous employer tier.
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6040000-0000-4000-8000-0000000000b3', 'c6040000-0000-4000-8000-0000000000e3',
          'c6040000-0000-4000-8000-000000000002',
          '2026-03-06T09:00:00Z', 60, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  -- d: the vendor's own hour on P1. He holds no studio rate, so it is also c2's
  -- rate-less row.
  PERFORM pg_temp.assume_user('c6040000-0000-4000-8000-000000000003');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6040000-0000-4000-8000-0000000000b4', 'c6040000-0000-4000-8000-0000000000e1',
          'c6040000-0000-4000-8000-000000000003',
          '2026-03-04T17:00:00Z', 90, true, 'field_visit');
  -- c3: and a RUNNING timer (duration NULL). A separate user from the one above
  -- because uniq_project_time_entries_running_timer is per user globally (00177:37-41).
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c6040000-0000-4000-8000-0000000000b5', 'c6040000-0000-4000-8000-0000000000e1',
          'c6040000-0000-4000-8000-000000000003',
          '2026-03-07T10:00:00Z', NULL, true, 'timer_auto');
  PERFORM pg_temp.reset_role();
END
$$;

-- ─── (a) shape ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing text;
  v_opts    text;
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'time_entry_ledger'
      AND column_name = 'notes'
  ), 'FAIL a1 (HT-36): the ledger view must carry no notes column — aggregate by '
     'default, free text only behind an explicit detail act against the table';

  SELECT string_agg(expected.name, ', ') INTO v_missing
  FROM (VALUES ('id'), ('project_id'), ('project_name'), ('studio_id'), ('user_id'),
               ('member_name'), ('started_at'), ('day'), ('iso_week'), ('month'),
               ('duration_minutes'), ('is_running'), ('billable'), ('activity'),
               ('source'), ('billing_state'), ('rate_source'), ('rate_role'),
               ('resolved_rate_cents'), ('amount_cents'), ('invoice_id')) AS expected(name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'time_entry_ledger'
      AND column_name = expected.name
  );
  ASSERT v_missing IS NULL,
    'FAIL a2: the four scopes read these columns and the view is missing: ' || v_missing;

  SELECT array_to_string(reloptions, ',') INTO v_opts
  FROM pg_class WHERE oid = 'public.time_entry_ledger'::regclass;
  ASSERT COALESCE(v_opts, '') LIKE '%security_invoker=true%',
    'FAIL a3 (HT-38''s reason): the ledger must be security_invoker, or every '
    'caller reads the whole studio through it; reloptions = ' || COALESCE(v_opts, 'NULL');

  RAISE NOTICE 'time_entry_ledger: case (a) passed.';
END
$$;

-- ─── (b) the pricing studio is one rule ────────────────────────────────────
DO $$
DECLARE
  v_studio   uuid;
  v_helper   uuid;
  v_rate     integer;
  v_source   text;
  v_rate_studio uuid;
BEGIN
  -- b1 — step 1.
  SELECT studio_id INTO v_studio FROM public.time_entry_ledger
   WHERE id = 'c6040000-0000-4000-8000-0000000000b1';
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source
  FROM public.project_time_entries WHERE id = 'c6040000-0000-4000-8000-0000000000b1';
  ASSERT v_rate = 20000 AND v_source = 'studio_member',
    'FAIL b1a (precondition): the hour must be priced by the studio, or the '
    'equivalence below measures nothing; got ' || COALESCE(v_rate::text, 'NULL')
    || ' / ' || COALESCE(v_source, 'NULL');
  SELECT studio_id INTO v_rate_studio FROM public.studio_member_rates
   WHERE user_id = 'c6040000-0000-4000-8000-000000000002' AND hourly_rate_cents = 20000;
  ASSERT v_studio = v_rate_studio,
    'FAIL b1b (HT-3-a/b, the three-bodies pin): the ledger''s studio_id must be '
    'the studio whose rate priced the hour. 00599''s resolver and 00604''s '
    'project_pricing_studio_id have diverged; ledger says '
    || COALESCE(v_studio::text, 'NULL') || ', the rate lives in '
    || COALESCE(v_rate_studio::text, 'NULL');

  -- b2 — step 2, employer tier, on a legacy NULL-studio project.
  ASSERT (SELECT studio_id IS NULL FROM public.projects
           WHERE id = 'c6040000-0000-4000-8000-0000000000e2'),
    'FAIL b2a (precondition): the employee designer''s project must carry a NULL '
    'studio_id, or step 2 never runs';
  SELECT studio_id INTO v_studio FROM public.time_entry_ledger
   WHERE id = 'c6040000-0000-4000-8000-0000000000b2';
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source
  FROM public.project_time_entries WHERE id = 'c6040000-0000-4000-8000-0000000000b2';
  ASSERT v_rate = 20000 AND v_source = 'studio_member',
    'FAIL b2b (HT-3-b employer tier): the one employer of the project''s DESIGNER '
    'prices the hour; got ' || COALESCE(v_rate::text, 'NULL') || ' / '
    || COALESCE(v_source, 'NULL');
  ASSERT v_studio = 'c6040000-0000-4000-8000-0000000000a1',
    'FAIL b2c: on a NULL-studio project the ledger must name the same employer '
    'studio the resolver priced from; got ' || COALESCE(v_studio::text, 'NULL');

  -- b3 — ambiguity agrees on nothing, in both bodies.
  SELECT studio_id INTO v_studio FROM public.time_entry_ledger
   WHERE id = 'c6040000-0000-4000-8000-0000000000b3';
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source
  FROM public.project_time_entries WHERE id = 'c6040000-0000-4000-8000-0000000000b3';
  ASSERT v_source = 'none' AND v_rate IS NULL,
    'FAIL b3a (HT-3-b): an AMBIGUOUS employer tier is ''none'', never a contest; '
    'got ' || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');
  ASSERT v_studio IS NULL,
    'FAIL b3b: where the resolver says ''none'' the ledger must say NULL — a '
    'studio_id here would put an unpriced hour into some studio''s rollup; got '
    || COALESCE(v_studio::text, 'NULL');

  -- The helper is the thing both of the above go through; probe it directly too,
  -- so a divergence names the function rather than the view.
  SELECT public.project_pricing_studio_id('c6040000-0000-4000-8000-0000000000e1') INTO v_helper;
  ASSERT v_helper = 'c6040000-0000-4000-8000-0000000000a1',
    'FAIL b4a: step 1 must return the named studio; got ' || COALESCE(v_helper::text, 'NULL');
  SELECT public.project_pricing_studio_id('c6040000-0000-4000-8000-0000000000e2') INTO v_helper;
  ASSERT v_helper = 'c6040000-0000-4000-8000-0000000000a1',
    'FAIL b4b: step 2''s employer tier must return the one employer; got '
    || COALESCE(v_helper::text, 'NULL');
  SELECT public.project_pricing_studio_id('c6040000-0000-4000-8000-0000000000e3') INTO v_helper;
  ASSERT v_helper IS NULL,
    'FAIL b4c: an ambiguous employer tier must return NULL; got '
    || COALESCE(v_helper::text, 'NULL');
  SELECT public.project_pricing_studio_id(NULL) INTO v_helper;
  ASSERT v_helper IS NULL, 'FAIL b4d: a NULL project must return NULL, not raise';

  RAISE NOTICE 'time_entry_ledger: case (b) passed — the three bodies still agree.';
END
$$;

-- ─── (c) one rate source, and the running row ──────────────────────────────
DO $$
DECLARE
  v_bad      integer;
  v_rate     integer;
  v_amount   integer;
  v_running  boolean;
BEGIN
  SELECT count(*) INTO v_bad FROM public.time_entry_ledger
   WHERE NOT is_running
     AND round(duration_minutes / 60.0 * resolved_rate_cents)::int <> amount_cents;
  ASSERT v_bad = 0,
    'FAIL c1 (00596''s rule, carried into the ledger): the rate printed must be '
    'the rate that priced the line on every completed row; offending rows: ' || v_bad;

  SELECT resolved_rate_cents, amount_cents INTO v_rate, v_amount
  FROM public.time_entry_ledger WHERE id = 'c6040000-0000-4000-8000-0000000000b1';
  ASSERT v_rate = 20000 AND v_amount = 40000,
    'FAIL c1b: 120 min at $200/h is 40000 cents; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_amount::text, 'NULL');

  SELECT resolved_rate_cents, amount_cents INTO v_rate, v_amount
  FROM public.time_entry_ledger WHERE id = 'c6040000-0000-4000-8000-0000000000b4';
  ASSERT v_rate = 0 AND v_amount = 0,
    'FAIL c2: a rate-less hour reads 0 / 0, never a legacy-chain number (00596, '
    'HT-6-a); got ' || COALESCE(v_rate::text, 'NULL') || ' / '
    || COALESCE(v_amount::text, 'NULL');

  SELECT is_running, amount_cents INTO v_running, v_amount
  FROM public.time_entry_ledger WHERE id = 'c6040000-0000-4000-8000-0000000000b5';
  ASSERT v_running,
    'FAIL c3a: a NULL duration is a RUNNING row and the ledger must say so';
  ASSERT v_amount = 0,
    'FAIL c3b: a running timer carries no money yet; got ' || COALESCE(v_amount::text, 'NULL');

  RAISE NOTICE 'time_entry_ledger: case (c) passed.';
END
$$;

-- ─── (d) the LEFT JOIN payoff, read through RLS as the designer ────────────
DO $$
DECLARE
  v_profiles integer;
  v_rows     integer;
  v_name     text;
BEGIN
  PERFORM pg_temp.assume_user('c6040000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_profiles FROM public.profiles
   WHERE id = 'c6040000-0000-4000-8000-000000000003';
  SELECT count(*) INTO v_rows FROM public.time_entry_ledger
   WHERE id = 'c6040000-0000-4000-8000-0000000000b4';
  SELECT member_name INTO v_name FROM public.time_entry_ledger
   WHERE id = 'c6040000-0000-4000-8000-0000000000b4';
  PERFORM pg_temp.reset_role();

  ASSERT (SELECT full_name = 'Ledger Vendor' FROM public.profiles
           WHERE id = 'c6040000-0000-4000-8000-000000000003'),
    'FAIL d0 (precondition): the vendor''s profile must actually CARRY a name — '
    'handle_new_user inserts a NULL-named row for every auth.users insert, so an '
    'ON CONFLICT DO NOTHING fixture makes d3 below pass for the wrong reason';
  ASSERT v_profiles = 0,
    'FAIL d1 (precondition): the designer must NOT be able to read the vendor''s '
    'profile, or the outer join below is untested; rows = ' || v_profiles;
  ASSERT v_rows = 1,
    'FAIL d2 (00555:3024-3026 under security_invoker): the vendor''s hour must '
    'still appear in the ledger for the designer. An INNER JOIN on profiles drops '
    'it and the studio''s balance silently understates — the defect 00596 '
    'repaired in project_unbilled_time; rows = ' || v_rows;
  ASSERT v_name IS NULL,
    'FAIL d3: the unreadable author''s name must come back NULL, not a guess; got '
    || COALESCE(v_name, 'NULL');

  RAISE NOTICE 'time_entry_ledger: case (d) passed — the name is bought, the hour is kept.';
END
$$;

-- ─── (e) UTC buckets ───────────────────────────────────────────────────────
DO $$
DECLARE
  v_day   date;
  v_week  text;
  v_month text;
BEGIN
  SELECT day, iso_week, month INTO v_day, v_week, v_month
  FROM public.time_entry_ledger WHERE id = 'c6040000-0000-4000-8000-0000000000b1';
  ASSERT v_day = DATE '2026-03-04',
    'FAIL e1: 2026-03-04T15:00:00Z buckets to 2026-03-04 in UTC; got '
    || COALESCE(v_day::text, 'NULL');
  ASSERT v_week = '2026-W10',
    'FAIL e2: 2026-03-04 is ISO week 10 of 2026; got ' || COALESCE(v_week, 'NULL');
  ASSERT v_month = '2026-03',
    'FAIL e3: the month bucket is YYYY-MM; got ' || COALESCE(v_month, 'NULL');

  RAISE NOTICE 'time_entry_ledger: case (e) passed.';
END
$$;

ROLLBACK;
