-- 00766 — studio_need_states studio-scope SELECT: teammates read, only owners write.
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

-- The fixture keys this test can see, in order, as one string.
CREATE OR REPLACE FUNCTION pg_temp.visible_keys()
RETURNS text AS $$
  SELECT coalesce(string_agg(need_key, ',' ORDER BY need_key), '')
  FROM public.studio_need_states
  WHERE need_key LIKE '00766:%';
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION pg_temp.visible_keys() TO PUBLIC;

-- ── The policy is additive: 00765's policy and grants are unchanged ─────────
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'studio_need_states'
      AND policyname = 'studio_need_states_select_studio'
      AND cmd = 'SELECT' AND roles = '{authenticated}'
      AND qual = 'is_active_org_member(organization_id)'),
    'studio_need_states_select_studio must be a SELECT policy for authenticated on is_active_org_member(organization_id)';
  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'studio_need_states'
      AND policyname = 'studio_need_states_select_own'
      AND cmd = 'SELECT' AND roles = '{authenticated}'),
    '00765 own-row SELECT policy must remain';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'studio_need_states' AND cmd <> 'SELECT'),
    'no write policy may exist on studio_need_states';
  ASSERT (SELECT string_agg(privilege_type, ',' ORDER BY privilege_type)
          FROM information_schema.role_table_grants
          WHERE table_schema = 'public' AND table_name = 'studio_need_states' AND grantee = 'authenticated') = 'SELECT',
    'authenticated must still hold SELECT only';
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'studio_need_states' AND grantee = 'anon'),
    'anon must hold no grant';
END $$;

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Seeded studio b...0001 seats Leah (a...0004) and her teammate a...0003.
-- cf1...0001 owns another studio, cf12...0001.
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM public.projects WHERE id = 'e6590000-0000-4000-8000-000000000001' AND studio_id = 'b0000000-0000-0000-0000-000000000001'),
    'fixture: project e659...0001 must belong to studio b...0001';
  ASSERT EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = 'a0000000-0000-0000-0000-000000000004' AND organization_id = 'b0000000-0000-0000-0000-000000000001' AND status = 'active' AND role <> 'guest'),
    'fixture: a...0004 must be an active non-guest member of b...0001';
  ASSERT EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = 'a0000000-0000-0000-0000-000000000003' AND organization_id = 'b0000000-0000-0000-0000-000000000001' AND status = 'active' AND role <> 'guest'),
    'fixture: a...0003 must be an active non-guest member of b...0001';
  ASSERT EXISTS (SELECT 1 FROM public.organization_members m JOIN public.organizations o ON o.id = m.organization_id
                 WHERE m.user_id = 'cf100000-0000-4000-8000-000000000001' AND m.organization_id = 'cf120000-0000-4000-8000-000000000001'
                   AND m.status = 'active' AND m.role <> 'guest' AND o.status = 'active'),
    'fixture: cf1...0001 must be an active non-guest member of active studio cf12...0001';
  ASSERT NOT EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = 'cf100000-0000-4000-8000-000000000001' AND organization_id = 'b0000000-0000-0000-0000-000000000001'),
    'fixture: cf1...0001 must hold no seat in b...0001';
  ASSERT NOT EXISTS (SELECT 1 FROM public.organization_members
                     WHERE organization_id = 'cf120000-0000-4000-8000-000000000001'
                       AND user_id IN ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004')),
    'fixture: a...0003 and a...0004 must hold no seat in cf12...0001';
END $$;

-- A user with no seat anywhere and a guest seat in b...0001, transaction-local.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('e7660000-0000-4000-8000-000000000001', '00766-outsider@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('e7660000-0000-4000-8000-000000000002', '00766-guest@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('e7660000-0000-4000-8000-000000000001', '00766-outsider@test.invalid', '00766 Outsider', now(), now()),
  ('e7660000-0000-4000-8000-000000000002', '00766-guest@test.invalid', '00766 Guest', now(), now())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('e7660000-0000-4000-8000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'guest', 'active', now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;

-- Leah's second studio, which her b...0001 teammate does not sit in.
INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('00000000-0766-4000-8000-000000000001', 'design_studio', '00766 Second Studio', '00766-second-studio', 'active');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('a0000000-0000-0000-0000-000000000004', '00000000-0766-4000-8000-000000000001', 'member', 'active', now());

-- Rows are inserted as the migration-context owner, outside request roles.
INSERT INTO public.studio_need_states (user_id, organization_id, project_id, need_key, acted_at, waiting_on)
VALUES
  ('a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'e6590000-0000-4000-8000-000000000001', '00766:leah', now() - interval '1 hour', 'client'),
  ('a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'e6590000-0000-4000-8000-000000000001', '00766:teammate', now(), NULL),
  ('a0000000-0000-0000-0000-000000000004', '00000000-0766-4000-8000-000000000001', NULL, '00766:leah-second-studio', now(), NULL),
  ('cf100000-0000-4000-8000-000000000001', 'cf120000-0000-4000-8000-000000000001', NULL, '00766:other-studio', now(), NULL);

-- ── Reads ───────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count integer;
BEGIN
  -- A member reads a teammate's row in the same studio, and her own rows.
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  ASSERT pg_temp.visible_keys() = '00766:leah,00766:teammate',
    format('teammate: must read Leah''s b...0001 row and her own, nothing from another studio (got %s)', pg_temp.visible_keys());
  ASSERT EXISTS (SELECT 1 FROM public.studio_need_states
                 WHERE need_key = '00766:leah' AND user_id = 'a0000000-0000-0000-0000-000000000004'
                   AND acted_at IS NOT NULL AND waiting_on = 'client'),
    'teammate: Leah''s row reads with its acted facts';
  PERFORM pg_temp.reset_role();

  -- A member's own rows are still readable, in every studio she sits in.
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  ASSERT pg_temp.visible_keys() = '00766:leah,00766:leah-second-studio,00766:teammate',
    format('Leah: must read her own rows and her teammate''s, nothing from a studio she does not sit in (got %s)', pg_temp.visible_keys());
  PERFORM pg_temp.reset_role();

  -- A member of another studio reads nothing of b...0001 or of Leah's second studio.
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');
  ASSERT pg_temp.visible_keys() = '00766:other-studio',
    format('another studio: must read only its own row (got %s)', pg_temp.visible_keys());
  PERFORM pg_temp.reset_role();

  -- A user with no seat reads nothing at all.
  PERFORM pg_temp.assume_user('e7660000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_count FROM public.studio_need_states;
  ASSERT v_count = 0, format('non-member: must read no row (got %s)', v_count);
  PERFORM pg_temp.reset_role();

  -- A guest seat is not a studio member here.
  PERFORM pg_temp.assume_user('e7660000-0000-4000-8000-000000000002');
  ASSERT pg_temp.visible_keys() = '',
    format('guest seat: must read no teammate row (got %s)', pg_temp.visible_keys());
  PERFORM pg_temp.reset_role();
END $$;

-- ── Writes stay owner-only ──────────────────────────────────────────────────
CREATE TEMP TABLE before_leah ON COMMIT DROP AS
  SELECT * FROM public.studio_need_states
  WHERE user_id = 'a0000000-0000-0000-0000-000000000004' AND need_key = '00766:leah';

DO $$
DECLARE
  v_state text;
  v_rows integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

  v_state := NULL;
  BEGIN
    UPDATE public.studio_need_states SET waiting_on = 'teammate'
    WHERE user_id = 'a0000000-0000-0000-0000-000000000004' AND need_key = '00766:leah';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  ASSERT v_state = '42501', format('teammate: a direct UPDATE of Leah''s row must be denied (got %s)', v_state);

  v_state := NULL;
  BEGIN
    DELETE FROM public.studio_need_states
    WHERE user_id = 'a0000000-0000-0000-0000-000000000004' AND need_key = '00766:leah';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  ASSERT v_state = '42501', format('teammate: a direct DELETE of Leah''s row must be denied (got %s)', v_state);

  -- The writer files the teammate's own row under the same key and clears only that.
  PERFORM public.set_need_state('00766:leah', 'e6590000-0000-4000-8000-000000000001', 'acted', p_waiting_on => 'maker');
  SELECT count(*) INTO v_rows FROM public.studio_need_states WHERE need_key = '00766:leah';
  ASSERT v_rows = 2, format('teammate: one key reads as two rows, Leah''s and her own (got %s)', v_rows);
  PERFORM public.set_need_state('00766:leah', 'e6590000-0000-4000-8000-000000000001', 'clear');
  ASSERT NOT EXISTS (SELECT 1 FROM public.studio_need_states WHERE need_key = '00766:leah' AND user_id = auth.uid()),
    'teammate: clear removes her own row';
  PERFORM pg_temp.reset_role();

  ASSERT (SELECT count(*) FROM public.studio_need_states s JOIN before_leah b USING (user_id, need_key)
          WHERE (s.organization_id, s.project_id, s.deferred_until, s.acted_at, s.waiting_on,
                 s.set_aside_until, s.set_aside_reason, s.updated_at)
                IS NOT DISTINCT FROM
                (b.organization_id, b.project_id, b.deferred_until, b.acted_at, b.waiting_on,
                 b.set_aside_until, b.set_aside_reason, b.updated_at)) = 1,
    'Leah''s row must be unchanged after her teammate''s attempts';
END $$;

-- ── The own-row policy still stands alone ───────────────────────────────────
-- With her second-studio seat suspended, only 00765's own-row policy can show
-- Leah that row; her b...0001 teammate's row stays visible through 00766.
UPDATE public.organization_members SET status = 'suspended'
WHERE user_id = 'a0000000-0000-0000-0000-000000000004' AND organization_id = '00000000-0766-4000-8000-000000000001';

DO $$
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  ASSERT pg_temp.visible_keys() = '00766:leah,00766:leah-second-studio,00766:teammate',
    format('Leah: a suspended seat still leaves her own row readable (got %s)', pg_temp.visible_keys());
  PERFORM pg_temp.reset_role();
END $$;

ROLLBACK;
