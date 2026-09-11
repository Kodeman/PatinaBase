-- ═══════════════════════════════════════════════════════════════════════════
-- Auto-roster on first log (migration 00597, HT-25)
--
-- Covers, per role:
--   (a) an active non-guest studio co-member logging on an UN-ROSTERED project
--       gets exactly ONE project_team_members row, role 'support_designer'.
--   (b) a second entry adds no second row.
--   (c) a member already rostered as 'lead_designer' is neither re-seated nor
--       downgraded.
--   (d) a seat the owner removed (removed_at set) is RE-SEATED on the next log.
--       This is a stated decision, not a surprise: the UNIQUE
--       (project_id, user_id, role) triple means the only way to express a
--       re-seat is to clear removed_at, and a member who logs again is working
--       on the project again.
--   (e) a cross-studio non-member is still refused by the INSERT policies and
--       seats nobody — the seat must never be the thing that authorizes the
--       insert (RLS WITH CHECK is evaluated AFTER before-row triggers).
--   (f) the project's OWN designer logging on her own project seats NOBODY, and
--       v_project_roster returns no `team` row for her. is_studio_comember's
--       first branch is `p_owner = auth.uid()`, so a solo designer passes the
--       co-membership gate and would otherwise be listed as a support designer
--       on every project she logs an hour on.
--   (h) a NULL auth.uid() (a server-side writer: service_role, cron, migration)
--       seats NOBODY, and the same insert under the member's own JWT does seat.
--       Added in review round 1 (finding m3): a seat satisfies `Team can view
--       their project time entries`, whose live qual is is_project_team_member
--       ALONE, so a seat is project-wide read. Under a NULL actor the
--       co-membership gate cannot be evaluated at all, so the trigger fails
--       closed instead of following 00317:38-39's bypass precedent — that
--       precedent is for a guard that REFUSES, and this one GRANTS.
--   (g) STRUCTURAL: the trigger body still carries the is_studio_comember gate.
--       Case (e) passes with or without it — a failed INSERT rolls the trigger's
--       seat back either way — so the gate needs its own assert or a future edit
--       deleting it goes green. Same shape as 00596's viewdef postcondition.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rls/time_entry_auto_roster_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('a7300000-0000-4000-8000-000000000001', 'roster-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a7300000-0000-4000-8000-000000000002', 'roster-member@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a7300000-0000-4000-8000-000000000003', 'roster-lead@test.invalid',     '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a7300000-0000-4000-8000-000000000004', 'roster-outsider@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('a7300000-0000-4000-8000-000000000001', 'roster-owner@test.invalid',    'Roster Owner',    NOW(), NOW()),
  ('a7300000-0000-4000-8000-000000000002', 'roster-member@test.invalid',   'Roster Member',   NOW(), NOW()),
  ('a7300000-0000-4000-8000-000000000003', 'roster-lead@test.invalid',     'Roster Lead',     NOW(), NOW()),
  ('a7300000-0000-4000-8000-000000000004', 'roster-outsider@test.invalid', 'Roster Outsider', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES
  ('a7300000-0000-4000-8000-0000000000a1', 'design_studio', 'Roster Studio',  'roster-studio-test'),
  ('a7300000-0000-4000-8000-0000000000a2', 'design_studio', 'Outside Studio', 'roster-outside-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('a7300000-0000-4000-8000-0000000000c1', 'a7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-0000000000a1', 'owner',  'active', NOW()),
  ('a7300000-0000-4000-8000-0000000000c2', 'a7300000-0000-4000-8000-000000000002', 'a7300000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('a7300000-0000-4000-8000-0000000000c3', 'a7300000-0000-4000-8000-000000000003', 'a7300000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('a7300000-0000-4000-8000-0000000000c4', 'a7300000-0000-4000-8000-000000000004', 'a7300000-0000-4000-8000-0000000000a2', 'owner',  'active', NOW());

-- Two projects of the owner's: one nobody is rostered to, one with a lead.
INSERT INTO projects (id, name, designer_id, created_by)
VALUES
  ('a7300000-0000-4000-8000-0000000000e1', 'Roster House',  'a7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000001'),
  ('a7300000-0000-4000-8000-0000000000e2', 'Led House',     'a7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000001');

INSERT INTO project_team_members (id, project_id, user_id, role, assigned_by)
VALUES ('a7300000-0000-4000-8000-0000000000f1', 'a7300000-0000-4000-8000-0000000000e2',
        'a7300000-0000-4000-8000-000000000003', 'lead_designer', 'a7300000-0000-4000-8000-000000000001');

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

-- ─── (a) one seat, role support_designer ───────────────────────────────────
DO $$
DECLARE
  v_count INTEGER;
  v_role  TEXT;
BEGIN
  PERFORM pg_temp.assume_user('a7300000-0000-4000-8000-000000000002');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('a7300000-0000-4000-8000-0000000000b1', 'a7300000-0000-4000-8000-0000000000e1',
          'a7300000-0000-4000-8000-000000000002', NOW() - INTERVAL '2 hours', 60, true, 'command_bar');
  PERFORM pg_temp.reset_role();

  SELECT count(*) INTO v_count FROM project_team_members
   WHERE project_id = 'a7300000-0000-4000-8000-0000000000e1'
     AND user_id    = 'a7300000-0000-4000-8000-000000000002';
  ASSERT v_count = 1, 'FAIL a1: first log should seat exactly one roster row, got ' || v_count;

  SELECT role INTO v_role FROM project_team_members
   WHERE project_id = 'a7300000-0000-4000-8000-0000000000e1'
     AND user_id    = 'a7300000-0000-4000-8000-000000000002';
  ASSERT v_role = 'support_designer', 'FAIL a2: the seat must be support_designer, got ' || v_role;

  ASSERT (SELECT removed_at IS NULL FROM project_team_members
           WHERE project_id = 'a7300000-0000-4000-8000-0000000000e1'
             AND user_id    = 'a7300000-0000-4000-8000-000000000002'),
    'FAIL a3: the seat must be live';

  RAISE NOTICE 'time_entry_auto_roster: case (a) passed.';
END
$$;

-- ─── (b) a second entry seats nothing further ──────────────────────────────
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('a7300000-0000-4000-8000-000000000002');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('a7300000-0000-4000-8000-0000000000b2', 'a7300000-0000-4000-8000-0000000000e1',
          'a7300000-0000-4000-8000-000000000002', NOW() - INTERVAL '1 hour', 30, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT count(*) INTO v_count FROM project_team_members
   WHERE project_id = 'a7300000-0000-4000-8000-0000000000e1'
     AND user_id    = 'a7300000-0000-4000-8000-000000000002';
  ASSERT v_count = 1, 'FAIL b: a second log must add no second seat, got ' || v_count;

  RAISE NOTICE 'time_entry_auto_roster: case (b) passed.';
END
$$;

-- ─── (c) an existing lead_designer is not re-seated or downgraded ──────────
DO $$
DECLARE
  v_count INTEGER;
  v_role  TEXT;
BEGIN
  PERFORM pg_temp.assume_user('a7300000-0000-4000-8000-000000000003');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('a7300000-0000-4000-8000-0000000000b3', 'a7300000-0000-4000-8000-0000000000e2',
          'a7300000-0000-4000-8000-000000000003', NOW() - INTERVAL '3 hours', 45, true, 'timer_manual');
  PERFORM pg_temp.reset_role();

  SELECT count(*) INTO v_count FROM project_team_members
   WHERE project_id = 'a7300000-0000-4000-8000-0000000000e2'
     AND user_id    = 'a7300000-0000-4000-8000-000000000003';
  ASSERT v_count = 1, 'FAIL c1: a rostered lead must keep exactly one seat, got ' || v_count;

  SELECT role INTO v_role FROM project_team_members
   WHERE project_id = 'a7300000-0000-4000-8000-0000000000e2'
     AND user_id    = 'a7300000-0000-4000-8000-000000000003';
  ASSERT v_role = 'lead_designer', 'FAIL c2: the lead must not be downgraded, got ' || v_role;

  RAISE NOTICE 'time_entry_auto_roster: case (c) passed.';
END
$$;

-- ─── (d) a removed seat is re-seated on the next log (stated behaviour) ────
DO $$
DECLARE
  v_count   INTEGER;
  v_removed TIMESTAMPTZ;
BEGIN
  UPDATE project_team_members SET removed_at = NOW()
   WHERE project_id = 'a7300000-0000-4000-8000-0000000000e1'
     AND user_id    = 'a7300000-0000-4000-8000-000000000002';

  PERFORM pg_temp.assume_user('a7300000-0000-4000-8000-000000000002');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('a7300000-0000-4000-8000-0000000000b4', 'a7300000-0000-4000-8000-0000000000e1',
          'a7300000-0000-4000-8000-000000000002', NOW(), 15, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT count(*) INTO v_count FROM project_team_members
   WHERE project_id = 'a7300000-0000-4000-8000-0000000000e1'
     AND user_id    = 'a7300000-0000-4000-8000-000000000002';
  ASSERT v_count = 1, 'FAIL d1: a re-seat must reuse the row, not add one, got ' || v_count;

  SELECT removed_at INTO v_removed FROM project_team_members
   WHERE project_id = 'a7300000-0000-4000-8000-0000000000e1'
     AND user_id    = 'a7300000-0000-4000-8000-000000000002';
  ASSERT v_removed IS NULL, 'FAIL d2: the next log must re-seat a removed member';

  RAISE NOTICE 'time_entry_auto_roster: case (d) passed.';
END
$$;

-- ─── (e) a cross-studio non-member is refused and seats nobody ─────────────
DO $$
DECLARE
  v_raised BOOLEAN := false;
  v_count  INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('a7300000-0000-4000-8000-000000000004');
  BEGIN
    INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
    VALUES ('a7300000-0000-4000-8000-0000000000b5', 'a7300000-0000-4000-8000-0000000000e1',
            'a7300000-0000-4000-8000-000000000004', NOW(), 20, true, 'manual_entry');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_raised, 'FAIL e1: a cross-studio non-member must not be able to log time';

  SELECT count(*) INTO v_count FROM project_team_members
   WHERE project_id = 'a7300000-0000-4000-8000-0000000000e1'
     AND user_id    = 'a7300000-0000-4000-8000-000000000004';
  ASSERT v_count = 0, 'FAIL e2: a refused insert must seat nobody, got ' || v_count;

  RAISE NOTICE 'time_entry_auto_roster: case (e) passed.';
END
$$;

-- ─── (f) the project's own designer seats nobody ────────────────────────────
DO $$
DECLARE
  v_count   INTEGER;
  v_roster  INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('a7300000-0000-4000-8000-000000000001');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('a7300000-0000-4000-8000-0000000000b6', 'a7300000-0000-4000-8000-0000000000e1',
          'a7300000-0000-4000-8000-000000000001', NOW() - INTERVAL '4 hours', 90, true, 'timer_auto');
  PERFORM pg_temp.reset_role();

  SELECT count(*) INTO v_count FROM project_team_members
   WHERE project_id = 'a7300000-0000-4000-8000-0000000000e1'
     AND user_id    = 'a7300000-0000-4000-8000-000000000001';
  ASSERT v_count = 0,
    'FAIL f1: the project''s own designer must not be seated on her own project, got ' || v_count;

  SELECT count(*) INTO v_roster FROM v_project_roster
   WHERE project_id = 'a7300000-0000-4000-8000-0000000000e1'
     AND source     = 'team'
     AND profile_id = 'a7300000-0000-4000-8000-000000000001';
  ASSERT v_roster = 0,
    'FAIL f2: the principal must not appear on the roster as a team member, got ' || v_roster;

  RAISE NOTICE 'time_entry_auto_roster: case (f) passed.';
END
$$;

-- ─── (h) a server-side writer (no JWT) seats nobody ─────────────────────────
DO $$
DECLARE
  v_count INTEGER;
  v_role  TEXT;
BEGIN
  -- No actor: this session is the unrestricted owner with no request.jwt.claims,
  -- which is what a service_role / cron / migration write looks like to
  -- auth.uid(). The member IS an active non-guest co-member of the project's
  -- studio and is NOT rostered on this project — i.e. exactly the case that gets
  -- a seat when she logs it herself (proved in h2 below).
  ASSERT (SELECT auth.uid()) IS NULL, 'FAIL h0 (precondition): the actor must be NULL here';

  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('a7300000-0000-4000-8000-0000000000b7', 'a7300000-0000-4000-8000-0000000000e2',
          'a7300000-0000-4000-8000-000000000002', NOW() - INTERVAL '6 hours', 25, true, 'manual_entry');

  SELECT count(*) INTO v_count FROM project_team_members
   WHERE project_id = 'a7300000-0000-4000-8000-0000000000e2'
     AND user_id    = 'a7300000-0000-4000-8000-000000000002';
  ASSERT v_count = 0,
    'FAIL h1: a write with no actor must seat nobody — a seat is project-wide read and the '
    'co-membership gate cannot be evaluated without auth.uid(); got ' || v_count;

  -- h2: the same member, same project, under her OWN JWT, is seated. Without this
  -- half, h1 would also pass if the trigger had simply stopped working.
  PERFORM pg_temp.assume_user('a7300000-0000-4000-8000-000000000002');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('a7300000-0000-4000-8000-0000000000b8', 'a7300000-0000-4000-8000-0000000000e2',
          'a7300000-0000-4000-8000-000000000002', NOW() - INTERVAL '5 hours', 20, true, 'manual_entry');
  PERFORM pg_temp.reset_role();

  SELECT count(*) INTO v_count FROM project_team_members
   WHERE project_id = 'a7300000-0000-4000-8000-0000000000e2'
     AND user_id    = 'a7300000-0000-4000-8000-000000000002';
  ASSERT v_count = 1, 'FAIL h2a: her own log must seat exactly one row, got ' || v_count;

  SELECT role INTO v_role FROM project_team_members
   WHERE project_id = 'a7300000-0000-4000-8000-0000000000e2'
     AND user_id    = 'a7300000-0000-4000-8000-000000000002';
  ASSERT v_role = 'support_designer', 'FAIL h2b: the seat must be support_designer, got ' || v_role;

  RAISE NOTICE 'time_entry_auto_roster: case (h) passed.';
END
$$;

-- ─── (g) the co-membership gate is still in the body (structural) ───────────
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc
   WHERE oid = 'public.time_entry_auto_roster()'::regprocedure;

  ASSERT v_src LIKE '%is_studio_comember%',
    'FAIL g1: time_entry_auto_roster must keep its is_studio_comember gate — without it a '
    'DEFINER trigger can manufacture the seat that authorizes the insert';
  ASSERT v_src LIKE '%designer_id%',
    'FAIL g2: time_entry_auto_roster must keep its own-designer early exit';

  RAISE NOTICE 'time_entry_auto_roster: case (g) passed.';
  RAISE NOTICE 'All time_entry_auto_roster assertions passed.';
END
$$;

ROLLBACK;
