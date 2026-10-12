-- 00765 — studio_need_states own-row RLS and RPC behavior.
-- Transactional psql regression: fixtures and role switches are rolled back.
BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id uuid)
RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(uuid) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS void AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM public.projects WHERE id = 'e6590000-0000-4000-8000-000000000001' AND studio_id = 'b0000000-0000-0000-0000-000000000001'),
    'fixture: project b...00d1 must belong to studio b...0001';
  ASSERT EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = 'a0000000-0000-0000-0000-000000000004' AND organization_id = 'b0000000-0000-0000-0000-000000000001' AND status = 'active' AND role <> 'guest'),
    'fixture: designer a...0004 must be an active non-guest member';
  ASSERT EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = 'a0000000-0000-0000-0000-000000000003' AND organization_id = 'b0000000-0000-0000-0000-000000000001' AND status = 'active' AND role <> 'guest'),
    'fixture: co-member a...0003 must be an active non-guest member';
END $$;

-- Add one guest seat to the existing studio. The user/profile/membership are transaction-local.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('e7650000-0000-4000-8000-000000000001', '00765-guest@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES ('e7650000-0000-4000-8000-000000000001', '00765-guest@test.invalid', '00765 Guest', now(), now())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('e7650000-0000-4000-8000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'guest', 'active', now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;

-- Fixtures are inserted as the migration-context owner, outside request roles.
INSERT INTO public.studio_need_states (user_id, organization_id, project_id, need_key)
VALUES
  ('a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'e6590000-0000-4000-8000-000000000001', 'fixture:self'),
  ('a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'e6590000-0000-4000-8000-000000000001', 'fixture:other');

DO $$
DECLARE
  v_state text;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  -- 00766 (U-Q4) also lets a studio member read a teammate's row; its test covers that.
  ASSERT EXISTS (SELECT 1 FROM public.studio_need_states WHERE need_key = 'fixture:self' AND user_id = auth.uid()),
    'own-row SELECT must expose own row';

  v_state := NULL;
  BEGIN
    INSERT INTO public.studio_need_states (user_id, organization_id, project_id, need_key)
    VALUES ('a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'e6590000-0000-4000-8000-000000000001', 'fixture:direct');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  ASSERT v_state = '42501', 'authenticated direct INSERT must be denied';
  PERFORM pg_temp.reset_role();
END $$;

DO $$
DECLARE
  v_state text;
  v_message text;
  v_row public.studio_need_states%ROWTYPE;
BEGIN
  -- An unrelated organization member cannot distinguish a missing project from a foreign one.
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');
  BEGIN
    PERFORM public.set_need_state('fixture:foreign', 'e6590000-0000-4000-8000-000000000001', 'acted');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
    v_message := SQLERRM;
  END;
  ASSERT v_state = '42501' AND v_message = 'not permitted',
    'RPC must refuse a project outside the caller''s organization';

  v_state := NULL;
  v_message := NULL;
  BEGIN
    PERFORM public.set_need_state('fixture:absent', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'acted');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
    v_message := SQLERRM;
  END;
  ASSERT v_state = '42501' AND v_message = 'not permitted',
    'RPC must return the same denial for an absent project and a foreign project';
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('e7650000-0000-4000-8000-000000000001');
  BEGIN
    PERFORM public.set_need_state('fixture:guest', 'e6590000-0000-4000-8000-000000000001', 'acted');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  ASSERT v_state = '42501', 'RPC must refuse an active guest seat';
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  PERFORM public.set_need_state('fixture:actions', 'e6590000-0000-4000-8000-000000000001', 'not_today', p_until => current_date + 1);
  SELECT * INTO v_row FROM public.studio_need_states WHERE user_id = auth.uid() AND need_key = 'fixture:actions';
  ASSERT v_row.deferred_until = current_date + 1 AND v_row.acted_at IS NULL,
    'not_today must store its required date';

  PERFORM public.set_need_state('fixture:actions', 'e6590000-0000-4000-8000-000000000001', 'acted', p_waiting_on => 'maker');
  SELECT * INTO v_row FROM public.studio_need_states WHERE user_id = auth.uid() AND need_key = 'fixture:actions';
  ASSERT v_row.acted_at IS NOT NULL AND v_row.waiting_on = 'maker' AND v_row.deferred_until IS NULL,
    'acted must set acted_at and waiting_on';

  v_state := NULL;
  BEGIN
    PERFORM public.set_need_state('fixture:actions', 'e6590000-0000-4000-8000-000000000001', 'set_aside', p_until => current_date + 7);
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  ASSERT v_state = '22023', 'set_aside without a reason must fail';

  PERFORM public.set_need_state('fixture:actions', 'e6590000-0000-4000-8000-000000000001', 'clear');
  ASSERT NOT EXISTS (SELECT 1 FROM public.studio_need_states WHERE user_id = auth.uid() AND need_key = 'fixture:actions'),
    'clear must delete the caller''s need-state row';
  PERFORM pg_temp.reset_role();
END $$;

-- ── SQ-778 N5: lines with no studio project ────────────────────────────────
-- Proposal b...0001 (no project) and relationship d...c001 belong to designer
-- a...0004; project b...00d3 is a legacy project with no studio.
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM public.proposals WHERE id = 'b0000000-0000-0000-0000-000000000001' AND project_id IS NULL AND designer_id = 'a0000000-0000-0000-0000-000000000004'),
    'fixture: proposal b...0001 must be a pre-project proposal of designer a...0004';
  ASSERT EXISTS (SELECT 1 FROM public.designer_clients WHERE id = 'd0000000-0000-0000-0000-00000000c001' AND designer_id = 'a0000000-0000-0000-0000-000000000004'),
    'fixture: relationship d...c001 must belong to designer a...0004';
  ASSERT EXISTS (SELECT 1 FROM public.projects WHERE id = 'b0000000-0000-0000-0000-0000000000d3' AND studio_id IS NULL AND designer_id = 'a0000000-0000-0000-0000-000000000004'),
    'fixture: project b...00d3 must be a legacy project with no studio';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.organization_members me
    JOIN public.organization_members d ON d.organization_id = me.organization_id
    WHERE me.user_id = 'a0000000-0000-0000-0000-000000000003' AND me.status = 'active'
      AND d.user_id = 'a0000000-0000-0000-0000-000000000004' AND d.status = 'active'
      AND me.organization_id < 'b0000000-0000-0000-0000-000000000001'),
    'fixture: a...0003 and a...0004 must share no studio below b...0001';
END $$;

-- The lowest-id studio, transaction-local; the designer holds an owner seat.
INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('00000000-0765-4000-8000-000000000001', 'design_studio', '00765 Low Studio', '00765-low-studio', 'active');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('a0000000-0000-0000-0000-000000000004', '00000000-0765-4000-8000-000000000001', 'owner', 'active', now());

DO $$
DECLARE
  v_state text;
  v_message text;
  v_row public.studio_need_states%ROWTYPE;
BEGIN
  -- The caller is the designer, seated in several studios: the lowest id wins.
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  PERFORM public.set_need_state('fixture:proposal', NULL, 'not_today', p_until => current_date + 1,
    p_engagement_id => 'b0000000-0000-0000-0000-000000000001');
  SELECT * INTO v_row FROM public.studio_need_states WHERE user_id = auth.uid() AND need_key = 'fixture:proposal';
  ASSERT v_row.organization_id = '00000000-0765-4000-8000-000000000001' AND v_row.project_id IS NULL
    AND v_row.deferred_until = current_date + 1,
    'designer: a pre-project proposal files under the lowest shared studio with project_id NULL';

  PERFORM public.set_need_state('fixture:proposal', NULL, 'set_aside', p_until => current_date + 7,
    p_reason => 'after the holiday', p_engagement_id => 'b0000000-0000-0000-0000-000000000001');
  SELECT * INTO v_row FROM public.studio_need_states WHERE user_id = auth.uid() AND need_key = 'fixture:proposal';
  ASSERT v_row.set_aside_until = current_date + 7 AND v_row.deferred_until IS NULL AND v_row.project_id IS NULL,
    'designer: an engagement row can be set aside';

  -- A legacy project with no studio, named as a project or as the engagement.
  PERFORM public.set_need_state('fixture:legacy', 'b0000000-0000-0000-0000-0000000000d3', 'acted', p_waiting_on => 'client');
  SELECT * INTO v_row FROM public.studio_need_states WHERE user_id = auth.uid() AND need_key = 'fixture:legacy';
  ASSERT v_row.organization_id = '00000000-0765-4000-8000-000000000001'
    AND v_row.project_id = 'b0000000-0000-0000-0000-0000000000d3' AND v_row.acted_at IS NOT NULL,
    'legacy project: files under the designer''s shared studio and keeps its project id';
  PERFORM public.set_need_state('fixture:legacy-engagement', NULL, 'not_today', p_until => current_date + 1,
    p_engagement_id => 'b0000000-0000-0000-0000-0000000000d3');
  SELECT * INTO v_row FROM public.studio_need_states WHERE user_id = auth.uid() AND need_key = 'fixture:legacy-engagement';
  ASSERT v_row.project_id = 'b0000000-0000-0000-0000-0000000000d3',
    'legacy project named by its engagement id still stores the real project id';

  -- p_project_id keeps its meaning: a proposal id there is not a project.
  v_state := NULL;
  BEGIN
    PERFORM public.set_need_state('fixture:misnamed', 'b0000000-0000-0000-0000-000000000001', 'acted');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_message := SQLERRM;
  END;
  ASSERT v_state = '42501' AND v_message = 'not permitted', 'a non-project id in p_project_id is refused';

  v_state := NULL;
  BEGIN
    PERFORM public.set_need_state('fixture:none', NULL, 'acted');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  ASSERT v_state = '22023', 'a line needs a project or an engagement';
  PERFORM pg_temp.reset_role();

  -- A co-member of the designer files under the one studio they share.
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  PERFORM public.set_need_state('fixture:proposal', NULL, 'acted', p_engagement_id => 'b0000000-0000-0000-0000-000000000001');
  PERFORM public.set_need_state('fixture:relationship', NULL, 'not_today', p_until => current_date + 1,
    p_engagement_id => 'd0000000-0000-0000-0000-00000000c001');
  ASSERT (SELECT organization_id FROM public.studio_need_states WHERE user_id = auth.uid() AND need_key = 'fixture:proposal')
    = 'b0000000-0000-0000-0000-000000000001',
    'co-member: a proposal files under the studio she shares with its designer';
  ASSERT (SELECT organization_id FROM public.studio_need_states WHERE user_id = auth.uid() AND need_key = 'fixture:relationship' AND project_id IS NULL)
    = 'b0000000-0000-0000-0000-000000000001',
    'co-member: a designer_clients engagement files with project_id NULL';
  PERFORM pg_temp.reset_role();

  -- Not a member of any studio the designer sits in: the missing-row denial.
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');
  v_state := NULL;
  BEGIN
    PERFORM public.set_need_state('fixture:foreign-proposal', NULL, 'acted', p_engagement_id => 'b0000000-0000-0000-0000-000000000001');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_message := SQLERRM;
  END;
  ASSERT v_state = '42501' AND v_message = 'not permitted', 'non-member: a foreign engagement is refused';
  v_state := NULL; v_message := NULL;
  BEGIN
    PERFORM public.set_need_state('fixture:absent-engagement', NULL, 'acted', p_engagement_id => 'ffffffff-ffff-4fff-8fff-ffffffffffff');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_message := SQLERRM;
  END;
  ASSERT v_state = '42501' AND v_message = 'not permitted', 'an absent engagement gets the same denial as a foreign one';
  PERFORM pg_temp.reset_role();

  -- A guest seat shares no studio with the designer.
  PERFORM pg_temp.assume_user('e7650000-0000-4000-8000-000000000001');
  v_state := NULL;
  BEGIN
    PERFORM public.set_need_state('fixture:guest-proposal', NULL, 'acted', p_engagement_id => 'b0000000-0000-0000-0000-000000000001');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  ASSERT v_state = '42501', 'a guest seat cannot file a state on an engagement';
  PERFORM pg_temp.reset_role();
END $$;

-- Two shared studios for the co-member: the lowest id wins for her too.
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('a0000000-0000-0000-0000-000000000003', '00000000-0765-4000-8000-000000000001', 'member', 'active', now());

DO $$
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  PERFORM public.set_need_state('fixture:proposal', NULL, 'acted', p_engagement_id => 'b0000000-0000-0000-0000-000000000001');
  ASSERT (SELECT organization_id FROM public.studio_need_states WHERE user_id = auth.uid() AND need_key = 'fixture:proposal')
    = '00000000-0765-4000-8000-000000000001',
    'ambiguous: with two shared studios the lowest organization id is chosen';
  PERFORM pg_temp.reset_role();
END $$;

-- ── SQ-777 F4: only a design studio is a shared studio ──────────────────────
-- A manufacturer, a contractor and an admin team, each below every studio id.
INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('00000000-0700-4000-8000-000000000001', 'manufacturer', '00765 Maker', '00765-maker', 'active'),
  ('00000000-0700-4000-8000-000000000002', 'contractor', '00765 Contractor', '00765-contractor', 'active'),
  ('00000000-0700-4000-8000-000000000003', 'admin_team', '00765 Admin Team', '00765-admin-team', 'active');

DO $$
DECLARE
  v_org uuid;
  v_type text;
  v_state text;
  v_message text;
  v_absent_state text;
  v_absent_message text;
BEGIN
  -- The missing-record denial, to compare each refusal against.
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');
  BEGIN
    PERFORM public.set_need_state('fixture:typed-absent', NULL, 'acted', p_engagement_id => 'ffffffff-ffff-4fff-8fff-ffffffffffff');
  EXCEPTION WHEN OTHERS THEN v_absent_state := SQLSTATE; v_absent_message := SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_absent_state = '42501' AND v_absent_message = 'not permitted', 'baseline: the missing-record denial';

  -- An overlap only through a non-studio organization is no shared studio.
  FOR v_org, v_type IN
    SELECT id, type::text FROM public.organizations
    WHERE id IN ('00000000-0700-4000-8000-000000000001', '00000000-0700-4000-8000-000000000002', '00000000-0700-4000-8000-000000000003')
    ORDER BY id
  LOOP
    INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
    VALUES
      ('cf100000-0000-4000-8000-000000000001', v_org, 'member', 'active', now()),
      ('a0000000-0000-0000-0000-000000000004', v_org, 'member', 'active', now());

    PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');
    v_state := NULL; v_message := NULL;
    BEGIN
      PERFORM public.set_need_state('fixture:typed-' || v_type, NULL, 'acted', p_engagement_id => 'b0000000-0000-0000-0000-000000000001');
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_message := SQLERRM;
    END;
    PERFORM pg_temp.reset_role();
    ASSERT v_state IS NOT DISTINCT FROM v_absent_state AND v_message IS NOT DISTINCT FROM v_absent_message,
      format('a %s overlap is refused exactly as a missing record (got %s %s)', v_type, v_state, v_message);
    ASSERT NOT EXISTS (SELECT 1 FROM public.studio_need_states WHERE need_key = 'fixture:typed-' || v_type),
      format('a %s overlap writes no state', v_type);

    DELETE FROM public.organization_members
    WHERE organization_id = v_org
      AND user_id IN ('cf100000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000004');
  END LOOP;

  -- A lower-id manufacturer overlap never outranks a design studio she shares.
  INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
  VALUES
    ('a0000000-0000-0000-0000-000000000003', '00000000-0700-4000-8000-000000000001', 'member', 'active', now()),
    ('a0000000-0000-0000-0000-000000000004', '00000000-0700-4000-8000-000000000001', 'member', 'active', now());
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  PERFORM public.set_need_state('fixture:typed-studio', NULL, 'acted', p_engagement_id => 'b0000000-0000-0000-0000-000000000001');
  ASSERT (SELECT organization_id FROM public.studio_need_states WHERE user_id = auth.uid() AND need_key = 'fixture:typed-studio')
    = '00000000-0765-4000-8000-000000000001',
    'a shared design studio is chosen over a lower-id manufacturer';
  PERFORM pg_temp.reset_role();
END $$;

ROLLBACK;
