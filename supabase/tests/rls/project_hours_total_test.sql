-- ═══════════════════════════════════════════════════════════════════════════
-- project_hours_total — the total HT-10-a gives back (migration 00607)
--
-- 00606 narrowed the rostered per-row read to OWN rows, which is a real loss:
-- before it, a rostered member read every row of that project, notes included.
-- HT-10-a's repair is this one SECURITY DEFINER function — minutes /
-- billable_minutes / amount_cents, standing asserted first, nothing else in the
-- return shape.
--
-- Asserted PER ROLE, every call through RLS as the named actor:
--   (a) THE PAYOFF — a rostered `member` gets the project's WHOLE total while
--       reading only her own rows. The control is the row count: 1 of 3 visible,
--       and a total that covers all three.
--   (b) the project's own designer (a plain studio `member` here, so the
--       designer leg is tested on its own merits) gets it.
--   (c) the studio `owner` and the studio `admin` get it — each of them can
--       already sum these rows with a plain SELECT after 00606's
--       time_entries_owner_admin_read, so admitting them escalates nothing.
--   (d) a plain studio co-member who is NOT rostered is REFUSED
--       (insufficient_privilege) — the function is not a way around 00606.
--   (e) a `guest` co-member is refused.
--   (f) a member of ANOTHER studio is refused.
--   (g) SHAPE — the return carries exactly minutes, billable_minutes,
--       amount_cents: no member name, no notes, no per-person rate (HT-36's
--       spirit and HT-10-a's letter).
--   (h) a RUNNING timer is in no total, and non-billable minutes count in
--       minutes but never in money.
--   (i) THE SELF-GRANT IS NOT A KEY (review round 2, finding W2-R2-01), in the
--       shape of case (i) of time_entry_admin_write_test.sql: an attacker who
--       owns only her own org seats the project's DESIGNER in it — one
--       consent-free `organization_members` INSERT, asserted to SUCCEED because
--       `Org owners can insert members` permits exactly that — and the total
--       stays REFUSED. Keyed the other way ("an owner/admin of ANY studio the
--       designer belongs to") that one INSERT returned 120 / 120 / 50000 of a
--       project she reads not one row of.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rls/project_hours_total_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c6080000-0000-4000-8000-000000000001', 'pht-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6080000-0000-4000-8000-000000000002', 'pht-admin@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6080000-0000-4000-8000-000000000003', 'pht-one@test.invalid',      '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6080000-0000-4000-8000-000000000004', 'pht-two@test.invalid',      '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6080000-0000-4000-8000-000000000005', 'pht-unrostered@test.invalid','', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6080000-0000-4000-8000-000000000006', 'pht-guest@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6080000-0000-4000-8000-000000000007', 'pht-outside@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6080000-0000-4000-8000-000000000008', 'pht-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c6080000-0000-4000-8000-000000000009', 'pht-attacker@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('c6080000-0000-4000-8000-000000000001', 'pht-owner@test.invalid',     'PHT Owner',      NOW(), NOW()),
  ('c6080000-0000-4000-8000-000000000002', 'pht-admin@test.invalid',     'PHT Admin',      NOW(), NOW()),
  ('c6080000-0000-4000-8000-000000000003', 'pht-one@test.invalid',       'PHT One',        NOW(), NOW()),
  ('c6080000-0000-4000-8000-000000000004', 'pht-two@test.invalid',       'PHT Two',        NOW(), NOW()),
  ('c6080000-0000-4000-8000-000000000005', 'pht-unrostered@test.invalid','PHT Unrostered', NOW(), NOW()),
  ('c6080000-0000-4000-8000-000000000006', 'pht-guest@test.invalid',     'PHT Guest',      NOW(), NOW()),
  ('c6080000-0000-4000-8000-000000000007', 'pht-outside@test.invalid',   'PHT Outside',    NOW(), NOW()),
  ('c6080000-0000-4000-8000-000000000008', 'pht-designer@test.invalid',  'PHT Designer',   NOW(), NOW()),
  ('c6080000-0000-4000-8000-000000000009', 'pht-attacker@test.invalid',  'PHT Attacker',   NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO organizations (id, type, name, slug, status)
VALUES
  ('c6080000-0000-4000-8000-0000000000a1', 'design_studio', 'PHT Studio',  'pht-studio-test',  'active'),
  ('c6080000-0000-4000-8000-0000000000a2', 'design_studio', 'PHT Outside', 'pht-outside-test', 'active'),
  -- Case (i): an org the ATTACKER owns, so she controls its roster outright.
  ('c6080000-0000-4000-8000-0000000000a3', 'design_studio', 'PHT Attacker', 'pht-attacker-test', 'active');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('c6080000-0000-4000-8000-0000000000c1', 'c6080000-0000-4000-8000-000000000001',
   'c6080000-0000-4000-8000-0000000000a1', 'owner',  'active', NOW()),
  ('c6080000-0000-4000-8000-0000000000c2', 'c6080000-0000-4000-8000-000000000002',
   'c6080000-0000-4000-8000-0000000000a1', 'admin',  'active', NOW()),
  ('c6080000-0000-4000-8000-0000000000c3', 'c6080000-0000-4000-8000-000000000003',
   'c6080000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('c6080000-0000-4000-8000-0000000000c4', 'c6080000-0000-4000-8000-000000000004',
   'c6080000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('c6080000-0000-4000-8000-0000000000c5', 'c6080000-0000-4000-8000-000000000005',
   'c6080000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('c6080000-0000-4000-8000-0000000000c6', 'c6080000-0000-4000-8000-000000000006',
   'c6080000-0000-4000-8000-0000000000a1', 'guest',  'active', NOW()),
  ('c6080000-0000-4000-8000-0000000000c7', 'c6080000-0000-4000-8000-000000000007',
   'c6080000-0000-4000-8000-0000000000a2', 'owner',  'active', NOW()),
  ('c6080000-0000-4000-8000-0000000000c8', 'c6080000-0000-4000-8000-000000000008',
   'c6080000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('c6080000-0000-4000-8000-0000000000c9', 'c6080000-0000-4000-8000-000000000009',
   'c6080000-0000-4000-8000-0000000000a3', 'owner',  'active', NOW());

-- The project belongs to the plain-member DESIGNER, so case (b)'s designer leg is
-- not also satisfied by owner/admin standing. It NAMES the studio, so the
-- resolver prices from S (HT-3-a step 1).
INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES ('c6080000-0000-4000-8000-0000000000e1', 'PHT House',
        'c6080000-0000-4000-8000-000000000008', 'c6080000-0000-4000-8000-000000000001',
        'c6080000-0000-4000-8000-0000000000a1');

INSERT INTO studio_member_rates (id, studio_id, user_id, hourly_rate_cents, effective_from, created_by)
VALUES
  ('c6080000-0000-4000-8000-0000000000d3', 'c6080000-0000-4000-8000-0000000000a1',
   'c6080000-0000-4000-8000-000000000003', 10000, CURRENT_DATE - 400, 'c6080000-0000-4000-8000-000000000001'),
  ('c6080000-0000-4000-8000-0000000000d4', 'c6080000-0000-4000-8000-0000000000a1',
   'c6080000-0000-4000-8000-000000000004', 20000, CURRENT_DATE - 400, 'c6080000-0000-4000-8000-000000000001');

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

-- ─── the hours ─────────────────────────────────────────────────────────────
-- One: 60 billable at 10000 (= 10000 cents) + 30 NON-billable + a running timer.
-- Two: 120 billable at 20000 (= 40000 cents).
-- Project total: 210 completed minutes, 180 billable, 50000 cents.
DO $$
BEGIN
  PERFORM pg_temp.assume_user('c6080000-0000-4000-8000-000000000003');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source, notes)
  VALUES
    ('c6080000-0000-4000-8000-0000000000b1', 'c6080000-0000-4000-8000-0000000000e1',
     'c6080000-0000-4000-8000-000000000003', NOW() - INTERVAL '3 hours', 60, true,  'manual_entry', 'one billable'),
    ('c6080000-0000-4000-8000-0000000000b2', 'c6080000-0000-4000-8000-0000000000e1',
     'c6080000-0000-4000-8000-000000000003', NOW() - INTERVAL '6 hours', 30, false, 'internal',     'one internal'),
    ('c6080000-0000-4000-8000-0000000000b3', 'c6080000-0000-4000-8000-0000000000e1',
     'c6080000-0000-4000-8000-000000000003', NOW() - INTERVAL '5 minutes', NULL, true, 'timer_auto', 'still running');
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('c6080000-0000-4000-8000-000000000004');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source, notes)
  VALUES
    ('c6080000-0000-4000-8000-0000000000b4', 'c6080000-0000-4000-8000-0000000000e1',
     'c6080000-0000-4000-8000-000000000004', NOW() - INTERVAL '4 hours', 120, true, 'manual_entry', 'two billable');
  PERFORM pg_temp.reset_role();
END
$$;

-- Preconditions on the money, so a zero below is never a fixture artefact.
DO $$
DECLARE v_rate integer; v_src text;
BEGIN
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_src
  FROM project_time_entries WHERE id = 'c6080000-0000-4000-8000-0000000000b1';
  ASSERT v_rate = 10000 AND v_src = 'studio_member',
    'FAIL pre1: One''s hour must be priced at 10000; got ' || COALESCE(v_rate::text, 'NULL')
    || ' / ' || COALESCE(v_src, 'NULL');
  SELECT hourly_rate_cents INTO v_rate
  FROM project_time_entries WHERE id = 'c6080000-0000-4000-8000-0000000000b4';
  ASSERT v_rate = 20000,
    'FAIL pre2: Two''s hour must be priced at 20000; got ' || COALESCE(v_rate::text, 'NULL');
END
$$;

-- ─── (g) shape ─────────────────────────────────────────────────────────────
DO $$
DECLARE v_names text;
BEGIN
  SELECT array_to_string(proargnames, ',') INTO v_names
  FROM pg_proc WHERE oid = to_regprocedure('public.project_hours_total(uuid)');
  ASSERT v_names = 'p_project_id,minutes,billable_minutes,amount_cents',
    'FAIL g (HT-10-a): the project total returns minutes / billable_minutes / '
    'amount_cents and NOTHING else — a name or a note here would hand back '
    'exactly what 00606 narrowed away; got ' || COALESCE(v_names, 'NULL');

  ASSERT (SELECT prosecdef FROM pg_proc
           WHERE oid = to_regprocedure('public.project_hours_total(uuid)')),
    'FAIL g2: the function must be SECURITY DEFINER, or it returns only what the '
    'caller could already read and HT-10-a''s repair is a no-op';

  RAISE NOTICE 'project_hours_total: case (g) passed.';
END
$$;

-- ─── (a) the payoff: a rostered member, her own rows, the whole total ──────
DO $$
DECLARE
  v_visible integer;
  v_all     integer;
  v_minutes integer;
  v_bill    integer;
  v_cents   bigint;
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM project_team_members
    WHERE project_id = 'c6080000-0000-4000-8000-0000000000e1'
      AND user_id = 'c6080000-0000-4000-8000-000000000003'
      AND removed_at IS NULL
  ), 'FAIL a0 (precondition): One must be rostered (00597 seats her on first log)';

  SELECT count(*) INTO v_all FROM project_time_entries
   WHERE project_id = 'c6080000-0000-4000-8000-0000000000e1';

  PERFORM pg_temp.assume_user('c6080000-0000-4000-8000-000000000003');
  SELECT count(*) INTO v_visible FROM project_time_entries
   WHERE project_id = 'c6080000-0000-4000-8000-0000000000e1';
  SELECT minutes, billable_minutes, amount_cents INTO v_minutes, v_bill, v_cents
  FROM public.project_hours_total('c6080000-0000-4000-8000-0000000000e1');
  PERFORM pg_temp.reset_role();

  ASSERT v_all = 4 AND v_visible = 3,
    'FAIL a1 (control): after 00606 One must read only her OWN rows (3 of 4 here, '
    'her own two completed plus her running timer) — if she reads all four the '
    'narrowing is gone and this case proves nothing; visible = ' || v_visible
    || ' of ' || v_all;
  ASSERT v_minutes = 210,
    'FAIL a2 (HT-10-a): the total must cover the whole project — 60 + 30 + 120 = '
    '210 completed minutes, including the 120 she cannot read; got '
    || COALESCE(v_minutes::text, 'NULL');
  ASSERT v_bill = 180,
    'FAIL a3: 30 of those minutes are non-billable; billable = '
    || COALESCE(v_bill::text, 'NULL');
  ASSERT v_cents = 50000,
    'FAIL a4: 60 min at $100/h plus 120 min at $200/h is 50000 cents — each '
    'member at her own rate; got ' || COALESCE(v_cents::text, 'NULL');

  RAISE NOTICE 'project_hours_total: case (a) passed — own rows, whole total.';
END
$$;

-- ─── (b) the project's designer, (c) the owner and the admin ───────────────
DO $$
DECLARE
  v_minutes integer;
  v_actor   uuid;
BEGIN
  FOREACH v_actor IN ARRAY ARRAY[
    'c6080000-0000-4000-8000-000000000008'::uuid,   -- (b) the plain-member designer
    'c6080000-0000-4000-8000-000000000001'::uuid,   -- (c) the studio owner
    'c6080000-0000-4000-8000-000000000002'::uuid    -- (c) the studio admin
  ] LOOP
    PERFORM pg_temp.assume_user(v_actor);
    SELECT minutes INTO v_minutes
    FROM public.project_hours_total('c6080000-0000-4000-8000-0000000000e1');
    PERFORM pg_temp.reset_role();
    ASSERT v_minutes = 210,
      'FAIL bc: the project''s designer, the studio owner and the studio admin '
      'must each get the project total (each can already sum these rows directly); '
      'actor ' || right(v_actor::text, 4) || ' got ' || COALESCE(v_minutes::text, 'NULL');
  END LOOP;

  RAISE NOTICE 'project_hours_total: cases (b) and (c) passed.';
END
$$;

-- ─── (d) unrostered co-member · (e) guest · (f) another studio ─────────────
DO $$
DECLARE
  v_actor uuid;
  v_state text;
  v_min   integer;
BEGIN
  FOREACH v_actor IN ARRAY ARRAY[
    'c6080000-0000-4000-8000-000000000005'::uuid,   -- (d) co-member, not rostered
    'c6080000-0000-4000-8000-000000000006'::uuid,   -- (e) guest
    'c6080000-0000-4000-8000-000000000007'::uuid    -- (f) another studio's owner
  ] LOOP
    v_state := NULL;
    PERFORM pg_temp.assume_user(v_actor);
    BEGIN
      SELECT minutes INTO v_min
      FROM public.project_hours_total('c6080000-0000-4000-8000-0000000000e1');
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
    END;
    PERFORM pg_temp.reset_role();
    ASSERT v_state = '42501',
      'FAIL def (HT-10-a): the standing assert must REFUSE anyone who is not on '
      'this project — a DEFINER function that answers for everyone is a way '
      'around 00606, not a repair for it; actor ' || right(v_actor::text, 4)
      || ' got ' || COALESCE(v_state, 'NO RAISE (minutes = ' || COALESCE(v_min::text, 'NULL') || ')');
  END LOOP;

  RAISE NOTICE 'project_hours_total: cases (d), (e) and (f) passed.';
END
$$;

-- ─── (h) the running timer is in no total ──────────────────────────────────
DO $$
DECLARE
  v_minutes integer;
BEGIN
  ASSERT (SELECT duration_minutes IS NULL FROM project_time_entries
           WHERE id = 'c6080000-0000-4000-8000-0000000000b3'),
    'FAIL h0 (precondition): the running row must still be running';

  PERFORM pg_temp.assume_user('c6080000-0000-4000-8000-000000000001');
  SELECT minutes INTO v_minutes
  FROM public.project_hours_total('c6080000-0000-4000-8000-0000000000e1');
  PERFORM pg_temp.reset_role();

  ASSERT v_minutes = 210,
    'FAIL h: an unfinished hour is not in a total (HT-7: the running slot is the '
    'desk''s business); got ' || COALESCE(v_minutes::text, 'NULL');

  RAISE NOTICE 'project_hours_total: case (h) passed.';
END
$$;

-- ─── (i) the self-grant is not a key (review round 2, finding W2-R2-01) ─────
DO $$
DECLARE
  v_state_before text;
  v_state_after  text;
  v_seated       integer;
  v_visible      integer;
  v_min          integer;
  v_pricing      uuid;
BEGIN
  PERFORM pg_temp.assume_user('c6080000-0000-4000-8000-000000000009');

  -- Before: she is nobody on this project, so the standing assert refuses her.
  v_state_before := NULL;
  BEGIN
    SELECT minutes INTO v_min
    FROM public.project_hours_total('c6080000-0000-4000-8000-0000000000e1');
  EXCEPTION WHEN OTHERS THEN v_state_before := SQLSTATE;
  END;

  -- Her one move: as owner of her OWN org she seats PHT House's DESIGNER in it.
  -- `Org owners can insert members` allows exactly this — no consent gate, and
  -- organization_members.status defaults to 'active'.
  INSERT INTO organization_members (user_id, organization_id, role)
  VALUES ('c6080000-0000-4000-8000-000000000008', 'c6080000-0000-4000-8000-0000000000a3', 'member');
  GET DIAGNOSTICS v_seated = ROW_COUNT;

  SELECT count(*) INTO v_visible FROM project_time_entries
   WHERE project_id = 'c6080000-0000-4000-8000-0000000000e1';

  v_state_after := NULL;
  v_min := NULL;
  BEGIN
    SELECT minutes INTO v_min
    FROM public.project_hours_total('c6080000-0000-4000-8000-0000000000e1');
  EXCEPTION WHEN OTHERS THEN v_state_after := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_state_before = '42501',
    'FAIL i1 (precondition): the attacker must start refused — if she already '
    'gets the total, this case measures nothing; got '
    || COALESCE(v_state_before, 'NO RAISE');
  ASSERT v_seated = 1,
    'FAIL i2 (precondition): the attacker''s seat INSERT must actually succeed — '
    'this case exists because `Org owners can insert members` permits it. If it '
    'now fails, the vector closed elsewhere and this case is measuring nothing';
  ASSERT v_visible = 0,
    'FAIL i3: the seat must not hand her a single ROW either (that half is '
    '00606''s, case (i) of time_entry_admin_write_test.sql); rows = ' || v_visible;
  ASSERT v_state_after = '42501',
    'FAIL i4 (W2-R2-01, the leak this case exists for): seating the project''s '
    'DESIGNER in a studio the attacker owns must NOT hand her the project''s '
    'minutes and billable money. The standing assert''s third leg keys on the '
    'studio that PRICES the work (project_pricing_studio_id, HT-3-a), never on '
    '"any studio the designer belongs to" — keyed the other way this returned '
    '120 / 120 / 50000 to a caller who reads no row of the project and whom the '
    'three policies of 00605/00606 refuse; got '
    || COALESCE(v_state_after, 'NO RAISE (minutes = ' || COALESCE(v_min::text, 'NULL') || ')');

  -- The pricing studio is what decides, and it is PHT Studio throughout: the
  -- seat she wrote changed nothing about who prices PHT House (HT-3-a step 1).
  SELECT public.project_pricing_studio_id('c6080000-0000-4000-8000-0000000000e1')
    INTO v_pricing;
  ASSERT v_pricing = 'c6080000-0000-4000-8000-0000000000a1',
    'FAIL i5: PHT House NAMES its studio, so HT-3-a step 1 answers and no seat '
    'written elsewhere can move it; got ' || COALESCE(v_pricing::text, 'NULL');

  RAISE NOTICE 'project_hours_total: case (i) passed — the self-grant buys nothing.';
END
$$;

ROLLBACK;
