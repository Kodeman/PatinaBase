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
  v_count integer;
  v_state text;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT count(*) INTO v_count FROM public.studio_need_states WHERE need_key LIKE 'fixture:%';
  ASSERT v_count = 1 AND EXISTS (SELECT 1 FROM public.studio_need_states WHERE need_key = 'fixture:self'),
    'own-row SELECT must expose own row and hide another member''s row';

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
  v_row public.studio_need_states%ROWTYPE;
BEGIN
  -- An unrelated organization member cannot write state for the fixture project.
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');
  BEGIN
    PERFORM public.set_need_state('fixture:nonmember', 'e6590000-0000-4000-8000-000000000001', 'acted');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  ASSERT v_state = '42501', 'RPC must refuse a non-member';
  PERFORM pg_temp.reset_role();

  v_state := NULL;
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

ROLLBACK;
