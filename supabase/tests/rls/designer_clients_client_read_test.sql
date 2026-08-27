-- ═══════════════════════════════════════════════════════════════════════════
-- Client-side roster read + direct-thread counterpart tests (migration 00536)
--
-- Two W1a escalations (waves/w1a/fix-log.md §M7 and §m8), both server-side
-- gaps that leave a shipped CLIENT surface unreachable:
--
--   M7. `designer_clients` has only designer-side policies — 00014:110
--       (FOR ALL USING auth.uid() = designer_id) and 00316:39 (the studio
--       co-member leg). RosterAPIClient.listRoster() selects
--       designer_id,created_at,status filtered client_id=eq.<uid>, so it comes
--       back EMPTY rather than forbidden and DesignerRelationship.roster is
--       unreachable in production. 00536 adds the client's own leg — as a
--       SECURITY DEFINER VIEW, `client_designer_roster`, NOT a base-table
--       policy (review B-D2): RLS is row-level, and that row carries the
--       designer's notes, nickname, satisfaction_score, total_revenue,
--       total_projects, referral_source, tags, style_preferences,
--       inspiration_quote and last_contacted_at. A SELECT policy keyed on
--       client_id would have let any homeowner GET the designer's private CRM
--       row about them; column GRANTs cannot help, since designer and client
--       are both `authenticated`.
--
--   m8. rpc_start_direct_thread(counterpart) (00103:51) checks only that the
--       caller is authenticated and is not the counterpart — any signed-in user
--       could open a thread with any profile in the system. 00536 adds the
--       server-side counterpart predicate: roster, live lead, or project.
--
-- Covers:
--   1. the client reads exactly their own ACTIVE roster rows THROUGH THE VIEW;
--  1b. the base table stays shut to them — the CRM columns never leave the
--      database, which is the whole point of the view;
--  1c. the view is four columns wide and carries no CRM column at all;
--   2. a non-active row (status vocabulary is lead|proposal|active|completed|
--      nurture) stays invisible to the client — the view scopes to 'active',
--      which is also the filter RosterAPIClient itself sends;
--   3. a stranger reads zero, and anon cannot reach the view at all;
--   4. the new leg is SELECT only — the client cannot update, delete or insert;
--   5. the designer still sees all of their rows (00014:110 intact);
--   6. rpc_start_direct_thread refuses a counterpart with no relationship;
--   7. it succeeds over a roster row, over a live lead, and over a project;
--   8. it is symmetric — the designer→client direction still works;
--   9. its parameter name is still `counterpart` (a rename fails with
--      "cannot change name of input parameter" and would break every caller).
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rls/designer_clients_client_read_test.sql
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

-- ─── fixtures ──────────────────────────────────────────────────────────────
-- D  designer · C1 active roster client · C2 completed roster client
-- C3 lead-only client · C4 project-only client · S stranger

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('d7000000-0000-4000-8000-00000000000d', 'dc-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d7000000-0000-4000-8000-000000000001', 'dc-c1@test.invalid',       '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d7000000-0000-4000-8000-000000000002', 'dc-c2@test.invalid',       '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d7000000-0000-4000-8000-000000000003', 'dc-c3@test.invalid',       '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d7000000-0000-4000-8000-000000000004', 'dc-c4@test.invalid',       '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d7000000-0000-4000-8000-0000000000f5', 'dc-stranger@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('d7000000-0000-4000-8000-00000000000d', 'dc-designer@test.invalid', 'DC Designer', true,  NOW(), NOW()),
  ('d7000000-0000-4000-8000-000000000001', 'dc-c1@test.invalid',       'DC C1',       false, NOW(), NOW()),
  ('d7000000-0000-4000-8000-000000000002', 'dc-c2@test.invalid',       'DC C2',       false, NOW(), NOW()),
  ('d7000000-0000-4000-8000-000000000003', 'dc-c3@test.invalid',       'DC C3',       false, NOW(), NOW()),
  ('d7000000-0000-4000-8000-000000000004', 'dc-c4@test.invalid',       'DC C4',       false, NOW(), NOW()),
  ('d7000000-0000-4000-8000-0000000000f5', 'dc-stranger@test.invalid', 'DC Stranger', false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('d7010000-0000-4000-8000-000000000001', 'design_studio', 'DC Studio', 'dc-studio-test', 'active');
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('d7020000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-00000000000d',
        'd7010000-0000-4000-8000-000000000001', 'owner', 'active', NOW());

INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, status, source)
VALUES
  ('d7030000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-00000000000d',
   'd7000000-0000-4000-8000-000000000001', 'DC C1', 'active',   'direct'),
  ('d7030000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-00000000000d',
   'd7000000-0000-4000-8000-000000000002', 'DC C2', 'completed', 'direct'),
  ('d7030000-0000-4000-8000-000000000004', 'd7000000-0000-4000-8000-00000000000d',
   'd7000000-0000-4000-8000-000000000004', 'DC C4', 'active',   'direct');

-- C3 reaches the designer through a claimed lead only (no roster row).
INSERT INTO public.leads (id, designer_id, homeowner_id, status, project_type, client_request_id)
VALUES ('d7040000-0000-4000-8000-000000000003', 'd7000000-0000-4000-8000-00000000000d',
        'd7000000-0000-4000-8000-000000000003', 'contacted', 'full_home', 'd7060000-0000-4000-8000-000000000003');

-- C4 additionally has a project (and a roster row, as a real activation would).
INSERT INTO public.projects (id, name, designer_id, created_by, client_id, studio_id, status)
VALUES ('d7050000-0000-4000-8000-000000000004', 'DC Project',
        'd7000000-0000-4000-8000-00000000000d', 'd7000000-0000-4000-8000-00000000000d',
        'd7000000-0000-4000-8000-000000000004', 'd7010000-0000-4000-8000-000000000001', 'active');

DO $$
DECLARE
  u_d  uuid := 'd7000000-0000-4000-8000-00000000000d';
  u_c1 uuid := 'd7000000-0000-4000-8000-000000000001';
  u_c2 uuid := 'd7000000-0000-4000-8000-000000000002';
  u_c3 uuid := 'd7000000-0000-4000-8000-000000000003';
  u_c4 uuid := 'd7000000-0000-4000-8000-000000000004';
  u_s  uuid := 'd7000000-0000-4000-8000-0000000000f5';
  v_count  int;
  v_cols   text[];
  v_designer uuid;
  v_thread uuid;
  v_thread2 uuid;
BEGIN
  -- ── 1. the client reads their own ACTIVE row, through the view ──
  PERFORM pg_temp.assume_user(u_c1);
  SELECT count(*) INTO v_count FROM public.client_designer_roster;
  ASSERT v_count = 1,
    'the client must read exactly their own active roster row, got ' || v_count;
  SELECT r.designer_id INTO v_designer FROM public.client_designer_roster r;
  ASSERT v_designer = u_d, 'and it must name their designer';

  -- the shape RosterAPIClient sends, verbatim
  SELECT count(*) INTO v_count FROM public.client_designer_roster r
   WHERE r.client_id = u_c1 AND r.status = 'active';
  ASSERT v_count = 1,
    'select=designer_id,created_at,status&client_id=eq.<self>&status=eq.active must resolve, got ' || v_count;

  -- ── 1b. the BASE TABLE stays shut (B-D2) ──
  -- The designer's CRM row — notes, satisfaction_score, total_revenue — must
  -- not be reachable by the person it is about.
  SELECT count(*) INTO v_count FROM public.designer_clients;
  ASSERT v_count = 0,
    'the client must NOT be able to read designer_clients directly, got ' || v_count || ' rows';

  -- ── 4. SELECT only ──
  BEGIN
    UPDATE public.client_designer_roster SET status = 'nope' WHERE client_id = u_c1;
    ASSERT false, 'the client leg must not grant UPDATE';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;  -- expected: no UPDATE grant on the view
  END;
  BEGIN
    DELETE FROM public.client_designer_roster WHERE client_id = u_c1;
    ASSERT false, 'the client leg must not grant DELETE';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;  -- expected
  END;
  BEGIN
    INSERT INTO public.designer_clients (designer_id, client_id, client_name, status)
    VALUES (u_d, u_c1, 'forged', 'active');
    ASSERT false, 'the client must not be able to write the base table either';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;  -- expected: RLS refuses the insert
  END;
  PERFORM pg_temp.reset_role();

  -- ── 1c. the view is a COLUMN contract ──
  SELECT array_agg(a.attname::text ORDER BY a.attnum) INTO v_cols
    FROM pg_attribute a
   WHERE a.attrelid = 'public.client_designer_roster'::regclass
     AND a.attnum > 0 AND NOT a.attisdropped;
  ASSERT v_cols = ARRAY['designer_id','client_id','status','created_at'],
    'client_designer_roster must expose exactly the four columns the roster needs, got '
      || array_to_string(v_cols, ',');

  -- ── 2. a completed row stays invisible ──
  PERFORM pg_temp.assume_user(u_c2);
  SELECT count(*) INTO v_count FROM public.client_designer_roster;
  ASSERT v_count = 0, 'a non-active roster row must stay invisible to the client';
  PERFORM pg_temp.reset_role();

  -- ── 3. a stranger reads zero; anon reads nothing at all ──
  PERFORM pg_temp.assume_user(u_s);
  SELECT count(*) INTO v_count FROM public.client_designer_roster;
  ASSERT v_count = 0, 'a stranger must read zero roster rows';
  PERFORM pg_temp.reset_role();
  ASSERT has_table_privilege('authenticated', 'public.client_designer_roster', 'SELECT'),
    'authenticated must be able to SELECT the view';
  ASSERT NOT has_table_privilege('anon', 'public.client_designer_roster', 'SELECT'),
    'anon must not reach the roster view';
  ASSERT NOT has_table_privilege('authenticated', 'public.client_designer_roster', 'UPDATE'),
    'the view must carry no UPDATE grant';

  -- ── 5. the designer still sees all of their rows ──
  PERFORM pg_temp.assume_user(u_d);
  SELECT count(*) INTO v_count FROM public.designer_clients WHERE designer_id = u_d;
  ASSERT v_count = 3, 'the designer must still see every one of their rows (00014:110)';
  PERFORM pg_temp.reset_role();

  -- ── 9. the parameter name is still `counterpart` ──
  ASSERT pg_get_function_arguments('public.rpc_start_direct_thread(uuid)'::regprocedure)
       = 'counterpart uuid',
    'rpc_start_direct_thread''s parameter must still be named counterpart (00103:51)';

  -- ── 6. no relationship → refused ──
  PERFORM pg_temp.assume_user(u_s);
  BEGIN
    v_thread := public.rpc_start_direct_thread(u_d);
    ASSERT false, 'a stranger must not be able to open a thread with any designer';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;  -- expected
  END;
  PERFORM pg_temp.reset_role();

  -- ── 7a. over a roster row ──
  PERFORM pg_temp.assume_user(u_c1);
  v_thread := public.rpc_start_direct_thread(u_d);
  ASSERT v_thread IS NOT NULL, 'a rostered client must be able to open a thread';
  -- idempotent, as 00103 always was
  v_thread2 := public.rpc_start_direct_thread(u_d);
  ASSERT v_thread2 = v_thread, 'a second call must resolve to the same thread';
  PERFORM pg_temp.reset_role();

  -- ── 7b. over a live lead (no roster row) ──
  PERFORM pg_temp.assume_user(u_c3);
  v_thread := public.rpc_start_direct_thread(u_d);
  ASSERT v_thread IS NOT NULL, 'a client whose lead a designer has claimed must reach them';
  PERFORM pg_temp.reset_role();

  -- ── 7c. over a project ──
  PERFORM pg_temp.assume_user(u_c4);
  v_thread := public.rpc_start_direct_thread(u_d);
  ASSERT v_thread IS NOT NULL, 'a project client must reach their designer';
  PERFORM pg_temp.reset_role();

  -- ── 8. symmetric: the designer can still open the same thread ──
  PERFORM pg_temp.assume_user(u_d);
  v_thread2 := public.rpc_start_direct_thread(u_c4);
  ASSERT v_thread2 = v_thread, 'the predicate must be symmetric — same thread from either side';
  PERFORM pg_temp.reset_role();

  -- a declined lead is not a relationship
  UPDATE public.leads SET status = 'declined'
   WHERE id = 'd7040000-0000-4000-8000-000000000003';
  DELETE FROM public.comms_thread_participants
   WHERE profile_id = u_c3;
  DELETE FROM public.comms_threads WHERE created_by = u_c3;
  PERFORM pg_temp.assume_user(u_c3);
  BEGIN
    v_thread := public.rpc_start_direct_thread(u_d);
    ASSERT false, 'a declined lead must not keep the door open';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;  -- expected
  END;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'designer_clients_client_read_test: ALL ASSERTIONS PASSED';
END $$;

ROLLBACK;
