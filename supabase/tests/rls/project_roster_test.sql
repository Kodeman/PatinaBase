-- ═══════════════════════════════════════════════════════════════════════════
-- Project roster tests (migration 00419)
--
-- Covers:
--   (a) party_kind CHECK admits all 4 new kinds (architect/photographer/
--       stager/client) and still rejects a bogus kind.
--   (b) project_tasks_owner_check and client_decisions_court_check are
--       DELIBERATELY NOT widened — both still REJECT 'architect'.
--   (c) project_parties.show_to_client defaults false.
--   (d) the project CLIENT (projects.client_id = auth.uid()) sees ZERO
--       project_parties rows while nothing is opted in, and EXACTLY the
--       opted-in row once show_to_client is flipped on — the posture
--       project_parties_client_select establishes in 00420. (Before 00420 this
--       case asserted zero in both directions; the policy that ships in that
--       migration is what changes it.)
--   (e) the designer sees BOTH branches (party + team) in v_project_roster.
--   (f) a studio co-member viewer gets job_title on the team branch.
--   (g) has_active_field_link is true only for a party with a live token,
--       false after revocation, false once expired.
--
-- How to run:
--   scripts/run-supabase-sql-test.sh supabase/tests/rls/project_roster_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c9000000-0000-4000-8000-000000000001', 'pr-designer@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c9000000-0000-4000-8000-000000000002', 'pr-teammate@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c9000000-0000-4000-8000-000000000003', 'pr-viewer@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c9000000-0000-4000-8000-000000000004', 'pr-client@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, display_name, created_at, updated_at)
VALUES
  ('c9000000-0000-4000-8000-000000000001', 'pr-designer@test.invalid', 'PR Designer', NULL,        NOW(), NOW()),
  ('c9000000-0000-4000-8000-000000000002', 'pr-teammate@test.invalid', 'PR Teammate', 'PR Teammie', NOW(), NOW()),
  ('c9000000-0000-4000-8000-000000000003', 'pr-viewer@test.invalid',   'PR Viewer',   NULL,        NOW(), NOW()),
  ('c9000000-0000-4000-8000-000000000004', 'pr-client@test.invalid',   'PR Client',   NULL,        NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES ('c9000000-0000-4000-8000-0000000000a1', 'design_studio', 'PR Studio', 'pr-studio-test');

-- Designer owns the studio; teammate + viewer are active co-members (so the
-- 00321/00322 comember-select policy lets viewer read teammate's row).
INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at, job_title, staff_role)
VALUES
  ('c9000000-0000-4000-8000-0000000000c1', 'c9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-0000000000a1', 'owner',  'active', NOW(), NULL, NULL),
  ('c9000000-0000-4000-8000-0000000000c2', 'c9000000-0000-4000-8000-000000000002', 'c9000000-0000-4000-8000-0000000000a1', 'member', 'active', NOW(), 'Junior Designer', 'design'),
  ('c9000000-0000-4000-8000-0000000000c3', 'c9000000-0000-4000-8000-000000000003', 'c9000000-0000-4000-8000-0000000000a1', 'member', 'active', NOW(), NULL, NULL);

INSERT INTO designer_clients (id, designer_id, client_name, status)
VALUES ('c9000000-0000-4000-8000-0000000000c9', 'c9000000-0000-4000-8000-000000000001', 'PR Household', 'active');

INSERT INTO projects (id, name, designer_id, created_by, studio_id, client_id)
VALUES ('c9000000-0000-4000-8000-0000000000e1', 'PR Project', 'c9000000-0000-4000-8000-000000000001',
        'c9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-0000000000a1',
        'c9000000-0000-4000-8000-000000000004');

-- Team branch: teammate + viewer both active on the project.
INSERT INTO project_team_members (id, project_id, user_id, role, assigned_by)
VALUES
  ('c9000000-0000-4000-8000-0000000000f1', 'c9000000-0000-4000-8000-0000000000e1', 'c9000000-0000-4000-8000-000000000002', 'support_designer', 'c9000000-0000-4000-8000-000000000001'),
  ('c9000000-0000-4000-8000-0000000000f2', 'c9000000-0000-4000-8000-0000000000e1', 'c9000000-0000-4000-8000-000000000003', 'support_designer', 'c9000000-0000-4000-8000-000000000001');

-- Party branch: one baseline party used for the client-visibility case.
INSERT INTO project_parties (id, project_id, party_kind, display_name, show_to_client)
VALUES ('c9000000-0000-4000-8000-0000000000b1', 'c9000000-0000-4000-8000-0000000000e1', 'client_rep', 'PR Client Rep', true);

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

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;

-- ─── (a) party_kind CHECK admits the 4 new roster kinds, rejects bogus ──────
DO $$
DECLARE
  v_count  INTEGER;
  v_raised BOOLEAN;
BEGIN
  INSERT INTO project_parties (id, project_id, party_kind, display_name)
  VALUES
    ('c9000000-0000-4000-8000-0000000000b2', 'c9000000-0000-4000-8000-0000000000e1', 'architect',   'Ana Architect'),
    ('c9000000-0000-4000-8000-0000000000b3', 'c9000000-0000-4000-8000-0000000000e1', 'photographer','Phil Photo'),
    ('c9000000-0000-4000-8000-0000000000b4', 'c9000000-0000-4000-8000-0000000000e1', 'stager',      'Stacy Stager'),
    ('c9000000-0000-4000-8000-0000000000b5', 'c9000000-0000-4000-8000-0000000000e1', 'client',      'Cara Client');

  SELECT count(*) INTO v_count FROM project_parties
   WHERE project_id = 'c9000000-0000-4000-8000-0000000000e1'
     AND party_kind IN ('architect', 'photographer', 'stager', 'client');
  ASSERT v_count = 4, 'FAIL a1: expected 4 new-kind parties, got ' || v_count;

  v_raised := false;
  BEGIN
    INSERT INTO project_parties (id, project_id, party_kind, display_name)
    VALUES ('c9000000-0000-4000-8000-0000000000bf', 'c9000000-0000-4000-8000-0000000000e1', 'caterer_bogus', 'Nope');
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL a2: a bogus party_kind must violate the CHECK';

  RAISE NOTICE 'project_roster: case (a) passed.';
END
$$;

-- ─── (b) court CHECKs deliberately NOT widened — still reject 'architect' ──
DO $$
DECLARE
  v_raised BOOLEAN;
BEGIN
  v_raised := false;
  BEGIN
    INSERT INTO project_tasks (id, project_id, title, owner)
    VALUES ('c9000000-0000-4000-8000-0000000000d1', 'c9000000-0000-4000-8000-0000000000e1', 'Site walk', 'architect');
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL b1: project_tasks.owner must still reject architect (deliberate non-widening)';

  v_raised := false;
  BEGIN
    INSERT INTO client_decisions (id, designer_client_id, designer_id, project_id, title, decision_type, court, status)
    VALUES ('c9000000-0000-4000-8000-0000000000d2', 'c9000000-0000-4000-8000-0000000000c9', 'c9000000-0000-4000-8000-000000000001',
            'c9000000-0000-4000-8000-0000000000e1', 'Elevation review', 'product', 'architect', 'pending');
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL b2: client_decisions.court must still reject architect (deliberate non-widening)';

  RAISE NOTICE 'project_roster: case (b) passed.';
END
$$;

-- ─── (c) show_to_client defaults false ──────────────────────────────────────
DO $$
DECLARE
  v_default BOOLEAN;
BEGIN
  INSERT INTO project_parties (id, project_id, party_kind, display_name)
  VALUES ('c9000000-0000-4000-8000-0000000000b6', 'c9000000-0000-4000-8000-0000000000e1', 'gc', 'Gary GC');

  SELECT show_to_client INTO v_default FROM project_parties WHERE id = 'c9000000-0000-4000-8000-0000000000b6';
  ASSERT v_default = false, 'FAIL c: show_to_client should default false, got ' || v_default;

  RAISE NOTICE 'project_roster: case (c) passed.';
END
$$;

-- ─── (d) the client sees ONLY opted-in rows (00420 project_parties_client_select) ──
DO $$
DECLARE
  v_count INTEGER;
  v_id    UUID;
BEGIN
  -- Nothing opted in yet: temporarily clear the fixture's opt-in.
  UPDATE project_parties SET show_to_client = false
   WHERE id = 'c9000000-0000-4000-8000-0000000000b1';

  PERFORM pg_temp.assume_user('c9000000-0000-4000-8000-000000000004');

  SELECT count(*) INTO v_count FROM project_parties WHERE project_id = 'c9000000-0000-4000-8000-0000000000e1';
  ASSERT v_count = 0, 'FAIL d1: with nothing opted in the client must see 0 project_parties rows, got ' || v_count;

  SELECT count(*) INTO v_count FROM v_project_roster
   WHERE project_id = 'c9000000-0000-4000-8000-0000000000e1' AND source = 'party';
  ASSERT v_count = 0, 'FAIL d2: with nothing opted in the client must see 0 v_project_roster party rows, got ' || v_count;

  PERFORM pg_temp.reset_role();

  -- Opt the one row back in (as the owning designer, through 00212's policy).
  PERFORM pg_temp.assume_user('c9000000-0000-4000-8000-000000000001');
  UPDATE project_parties SET show_to_client = true
   WHERE id = 'c9000000-0000-4000-8000-0000000000b1';
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('c9000000-0000-4000-8000-000000000004');

  SELECT count(*) INTO v_count FROM project_parties WHERE project_id = 'c9000000-0000-4000-8000-0000000000e1';
  ASSERT v_count = 1, 'FAIL d3: the client must see exactly the 1 opted-in party row, got ' || v_count;

  SELECT id INTO v_id FROM project_parties WHERE project_id = 'c9000000-0000-4000-8000-0000000000e1';
  ASSERT v_id = 'c9000000-0000-4000-8000-0000000000b1', 'FAIL d4: the visible row must be the opted-in one';

  SELECT count(*) INTO v_count FROM v_project_roster
   WHERE project_id = 'c9000000-0000-4000-8000-0000000000e1' AND source = 'party';
  ASSERT v_count = 1, 'FAIL d5: the client must see exactly 1 v_project_roster party row, got ' || v_count;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE 'project_roster: case (d) passed.';
END
$$;

-- ─── (e) the designer sees both branches ────────────────────────────────────
DO $$
DECLARE
  v_party_count INTEGER;
  v_team_count  INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('c9000000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_party_count FROM v_project_roster
   WHERE project_id = 'c9000000-0000-4000-8000-0000000000e1' AND source = 'party';
  ASSERT v_party_count > 0, 'FAIL e1: designer should see party-branch rows, got ' || v_party_count;

  SELECT count(*) INTO v_team_count FROM v_project_roster
   WHERE project_id = 'c9000000-0000-4000-8000-0000000000e1' AND source = 'team';
  ASSERT v_team_count = 2, 'FAIL e2: designer should see 2 team-branch rows, got ' || v_team_count;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE 'project_roster: case (e) passed.';
END
$$;

-- ─── (f) a studio co-member viewer gets job_title on the team branch ────────
DO $$
DECLARE
  v_job_title TEXT;
  v_kind      TEXT;
BEGIN
  PERFORM pg_temp.assume_user('c9000000-0000-4000-8000-000000000003');  -- viewer (co-member, also project team member)

  SELECT job_title, kind INTO v_job_title, v_kind FROM v_project_roster
   WHERE roster_id = 'c9000000-0000-4000-8000-0000000000f1' AND source = 'team';
  ASSERT v_job_title = 'Junior Designer', 'FAIL f: co-member viewer should see teammate job_title, got ' || COALESCE(v_job_title, 'NULL');
  ASSERT v_kind = 'support_designer', 'FAIL f2: kind should be the team role, got ' || COALESCE(v_kind, 'NULL');

  PERFORM pg_temp.reset_role();
  RAISE NOTICE 'project_roster: case (f) passed.';
END
$$;

-- ─── (g) has_active_field_link: true only for a live token ──────────────────
DO $$
DECLARE
  v_token_id UUID;
  v_token    TEXT;
  v_active   BOOLEAN;
BEGIN
  -- A field-linkable party (gc/sub/installer/receiver kind not required by the
  -- link RPC itself — any party id resolves — but use 'gc' for realism).
  INSERT INTO project_parties (id, project_id, party_kind, display_name)
  VALUES ('c9000000-0000-4000-8000-0000000000b7', 'c9000000-0000-4000-8000-0000000000e1', 'gc', 'Gus GC Field');

  -- No token yet → false.
  SELECT has_active_field_link INTO v_active FROM v_project_roster
   WHERE roster_id = 'c9000000-0000-4000-8000-0000000000b7' AND source = 'party';
  ASSERT v_active = false, 'FAIL g0: no token yet should read false, got ' || v_active;

  -- Mint a live token as the owning designer via the real 00283 RPC.
  PERFORM pg_temp.assume_user('c9000000-0000-4000-8000-000000000001');
  SELECT id, token INTO v_token_id, v_token FROM public.create_field_link('c9000000-0000-4000-8000-0000000000b7');

  SELECT has_active_field_link INTO v_active FROM v_project_roster
   WHERE roster_id = 'c9000000-0000-4000-8000-0000000000b7' AND source = 'party';
  ASSERT v_active = true, 'FAIL g1: a live token should read has_active_field_link = true, got ' || v_active;

  -- Revoke → false.
  PERFORM public.revoke_field_link(v_token_id);
  SELECT has_active_field_link INTO v_active FROM v_project_roster
   WHERE roster_id = 'c9000000-0000-4000-8000-0000000000b7' AND source = 'party';
  ASSERT v_active = false, 'FAIL g2: a revoked token should read has_active_field_link = false, got ' || v_active;

  PERFORM pg_temp.reset_role();

  -- A separately-minted, already-expired token (direct insert as postgres) → false.
  INSERT INTO project_parties (id, project_id, party_kind, display_name)
  VALUES ('c9000000-0000-4000-8000-0000000000b8', 'c9000000-0000-4000-8000-0000000000e1', 'receiver', 'Rex Receiver Field');

  INSERT INTO field_link_tokens (party_id, project_id, token_hash, status, expires_at, created_by)
  VALUES ('c9000000-0000-4000-8000-0000000000b8', 'c9000000-0000-4000-8000-0000000000e1',
          encode(extensions.digest('expired-token-fixture', 'sha256'), 'hex'), 'active',
          now() - interval '1 day', 'c9000000-0000-4000-8000-000000000001');

  PERFORM pg_temp.assume_user('c9000000-0000-4000-8000-000000000001');
  SELECT has_active_field_link INTO v_active FROM v_project_roster
   WHERE roster_id = 'c9000000-0000-4000-8000-0000000000b8' AND source = 'party';
  ASSERT v_active = false, 'FAIL g3: an expired token should read has_active_field_link = false, got ' || v_active;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'project_roster: case (g) passed.';
  RAISE NOTICE 'All project_roster assertions passed.';
END
$$;

ROLLBACK;
