-- 00766 — studio_need_state_facts(): teammates read acted facts only; the table stays own-row.
-- Transactional psql regression: fixtures, seat changes and role switches are rolled back.
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

-- The fixture keys the caller reads through the projection, in order, as one string.
CREATE OR REPLACE FUNCTION pg_temp.fact_keys()
RETURNS text AS $$
  SELECT coalesce(string_agg(need_key, ',' ORDER BY need_key), '')
  FROM public.studio_need_state_facts()
  WHERE need_key LIKE '00766:%';
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION pg_temp.fact_keys() TO PUBLIC;

-- The fixture keys the caller reads through the table, in order, as one string.
CREATE OR REPLACE FUNCTION pg_temp.table_keys()
RETURNS text AS $$
  SELECT coalesce(string_agg(need_key, ',' ORDER BY need_key), '')
  FROM public.studio_need_states
  WHERE need_key LIKE '00766:%';
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION pg_temp.table_keys() TO PUBLIC;

-- Whether the reader (a...0003) sees Leah's existing acted row through the projection.
CREATE OR REPLACE FUNCTION pg_temp.reader_sees_leah_fact()
RETURNS boolean AS $$
DECLARE
  v_seen boolean;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  v_seen := EXISTS (SELECT 1 FROM public.studio_need_state_facts()
                    WHERE need_key = '00766:leah-acted' AND user_id = 'a0000000-0000-0000-0000-000000000004');
  PERFORM pg_temp.reset_role();
  RETURN v_seen;
END;
$$ LANGUAGE plpgsql;

-- The fixture keys the reader (a...0003) reads through the table.
CREATE OR REPLACE FUNCTION pg_temp.reader_own_rows()
RETURNS text AS $$
DECLARE
  v_keys text;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  v_keys := pg_temp.table_keys();
  PERFORM pg_temp.reset_role();
  RETURN v_keys;
END;
$$ LANGUAGE plpgsql;

-- ── Shape: own-row table, facts-only function ───────────────────────────────
DO $$
DECLARE
  v_fn regprocedure := 'public.studio_need_state_facts()'::regprocedure;
BEGIN
  ASSERT (SELECT string_agg(policyname || ':' || cmd || ':' || array_to_string(roles, ',') || ':' || qual, ';' ORDER BY policyname)
          FROM pg_policies WHERE schemaname = 'public' AND tablename = 'studio_need_states')
         = 'studio_need_states_select_own:SELECT:authenticated:(user_id = ( SELECT auth.uid() AS uid))',
    'the table must carry 00765''s own-row SELECT policy and no other (studio_need_states_select_studio dropped)';
  ASSERT (SELECT string_agg(privilege_type, ',' ORDER BY privilege_type)
          FROM information_schema.role_table_grants
          WHERE table_schema = 'public' AND table_name = 'studio_need_states' AND grantee = 'authenticated') = 'SELECT',
    'authenticated must still hold SELECT only on the table';
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'studio_need_states' AND grantee = 'anon'),
    'anon must hold no table grant';
  ASSERT obj_description('public.studio_need_states'::regclass, 'pg_class')
         = 'Per-user state for a studio Day Sheet need. Authenticated users can select only their own rows; all writes use set_need_state.',
    'the table comment must be 00765''s own-row text';

  ASSERT (SELECT p.prosecdef AND p.provolatile = 's' AND l.lanname = 'sql' AND p.proconfig = ARRAY['search_path=""']
          FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang WHERE p.oid = v_fn),
    'studio_need_state_facts must be LANGUAGE sql STABLE SECURITY DEFINER with search_path pinned to ''''';
  ASSERT pg_get_function_result(v_fn)
         = 'TABLE(user_id uuid, organization_id uuid, project_id uuid, need_key text, acted_at timestamp with time zone)',
    format('studio_need_state_facts must return exactly the five fact columns (got %s)', pg_get_function_result(v_fn));
  ASSERT has_function_privilege('authenticated', v_fn, 'EXECUTE'), 'authenticated must hold EXECUTE';
  ASSERT NOT has_function_privilege('anon', v_fn, 'EXECUTE'), 'anon must not hold EXECUTE';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = v_fn AND a.grantee = 0),
    'PUBLIC must hold no privilege on studio_need_state_facts';
END $$;

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Seeded studio b...0001 seats Leah (a...0004) and her teammate, the reader a...0003.
-- cf1...0001 sits in another studio, cf12...0001.
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM public.projects WHERE id = 'e6590000-0000-4000-8000-000000000001' AND studio_id = 'b0000000-0000-0000-0000-000000000001'),
    'fixture: project e659...0001 must belong to studio b...0001';
  ASSERT EXISTS (SELECT 1 FROM public.organizations WHERE id = 'b0000000-0000-0000-0000-000000000001' AND status = 'active'),
    'fixture: studio b...0001 must be active';
  ASSERT EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = 'a0000000-0000-0000-0000-000000000004' AND organization_id = 'b0000000-0000-0000-0000-000000000001' AND status = 'active' AND role <> 'guest'),
    'fixture: a...0004 must be an active non-guest member of b...0001';
  ASSERT EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = 'a0000000-0000-0000-0000-000000000003' AND organization_id = 'b0000000-0000-0000-0000-000000000001' AND status = 'active' AND role NOT IN ('guest', 'owner')),
    'fixture: a...0003 must be an active non-guest, non-owner member of b...0001';
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

-- Leah's second studio, which the reader does not sit in.
INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('00000000-0766-4000-8000-000000000001', 'design_studio', '00766 Second Studio', '00766-second-studio', 'active');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('a0000000-0000-0000-0000-000000000004', '00000000-0766-4000-8000-000000000001', 'member', 'active', now());

-- Rows are inserted as the migration-context owner, outside request roles, in
-- the shapes set_need_state writes: acted (with waiting_on), deferred, set aside.
INSERT INTO public.studio_need_states (user_id, organization_id, project_id, need_key, deferred_until, acted_at, waiting_on, set_aside_until, set_aside_reason)
VALUES
  ('a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'e6590000-0000-4000-8000-000000000001', '00766:leah-acted', NULL, '2026-10-01 09:30:00+00', 'Leah free text: the client', NULL, NULL),
  ('a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'e6590000-0000-4000-8000-000000000001', '00766:leah-deferred', '2026-10-20', NULL, NULL, NULL, NULL),
  ('a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'e6590000-0000-4000-8000-000000000001', '00766:leah-set-aside', NULL, NULL, NULL, '2026-11-01', 'Leah free text: private reason'),
  ('a0000000-0000-0000-0000-000000000004', '00000000-0766-4000-8000-000000000001', NULL, '00766:leah-second-studio', NULL, now(), NULL, NULL, NULL),
  ('a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'e6590000-0000-4000-8000-000000000001', '00766:reader-acted', NULL, now(), 'reader free text', NULL, NULL),
  ('cf100000-0000-4000-8000-000000000001', 'cf120000-0000-4000-8000-000000000001', NULL, '00766:other-studio', NULL, now(), NULL, NULL, NULL);

-- ── Through the projection ──────────────────────────────────────────────────
DO $$
DECLARE
  v_row jsonb;
  v_state text;
  v_column text;
BEGIN
  -- The reader sees Leah's acted row in their shared studio, as exactly five facts.
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  ASSERT pg_temp.fact_keys() = '00766:leah-acted',
    format('reader: must see only Leah''s acted b...0001 row: no unacted row, no other studio, not her own (got %s)', pg_temp.fact_keys());
  SELECT to_jsonb(f) INTO v_row FROM public.studio_need_state_facts() f WHERE f.need_key = '00766:leah-acted';
  ASSERT v_row = jsonb_build_object(
      'user_id', 'a0000000-0000-0000-0000-000000000004',
      'organization_id', 'b0000000-0000-0000-0000-000000000001',
      'project_id', 'e6590000-0000-4000-8000-000000000001',
      'need_key', '00766:leah-acted',
      'acted_at', to_jsonb('2026-10-01 09:30:00+00'::timestamptz)),
    format('reader: Leah''s fact must be exactly user_id, organization_id, project_id, need_key, acted_at (got %s)', v_row);

  -- A non-acted teammate row (deferred or set aside) is not a fact.
  ASSERT NOT EXISTS (SELECT 1 FROM public.studio_need_state_facts() WHERE need_key IN ('00766:leah-deferred', '00766:leah-set-aside')),
    'reader: Leah''s deferred and set-aside rows must not be returned';
  ASSERT NOT EXISTS (SELECT 1 FROM public.studio_need_state_facts() WHERE acted_at IS NULL),
    'reader: the projection must return no unacted row';

  -- Free text and dates are not columns of the projection.
  FOREACH v_column IN ARRAY ARRAY['waiting_on', 'set_aside_reason', 'deferred_until', 'set_aside_until', 'updated_at'] LOOP
    v_state := NULL;
    BEGIN
      EXECUTE format('SELECT %I FROM public.studio_need_state_facts()', v_column);
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
    END;
    ASSERT v_state = '42703', format('reader: %s must not be readable through the projection (got %s)', v_column, v_state);
  END LOOP;

  -- The reader never sees her own rows through it.
  ASSERT NOT EXISTS (SELECT 1 FROM public.studio_need_state_facts() WHERE user_id = auth.uid()),
    'reader: the projection must never return the caller''s own rows';
  PERFORM pg_temp.reset_role();

  -- Leah never sees her own rows through it; she sees her teammate's acted row.
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  ASSERT NOT EXISTS (SELECT 1 FROM public.studio_need_state_facts() WHERE user_id = auth.uid()),
    'Leah: the projection must never return her own rows';
  ASSERT pg_temp.fact_keys() = '00766:reader-acted',
    format('Leah: must see only her teammate''s acted row (got %s)', pg_temp.fact_keys());
  PERFORM pg_temp.reset_role();

  -- Cross-studio: a member of another studio sees nothing filed in b...0001 or Leah's second studio.
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');
  ASSERT pg_temp.fact_keys() = '',
    format('another studio: must see no fixture fact (its own row is excluded too) (got %s)', pg_temp.fact_keys());
  ASSERT NOT EXISTS (SELECT 1 FROM public.studio_need_state_facts()
                     WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', '00000000-0766-4000-8000-000000000001')),
    'another studio: must see no fact filed in b...0001 or the second studio';
  PERFORM pg_temp.reset_role();

  -- A guest seat and a never-member get nothing at all.
  PERFORM pg_temp.assume_user('e7660000-0000-4000-8000-000000000002');
  ASSERT (SELECT count(*) FROM public.studio_need_state_facts()) = 0, 'guest seat: the projection must return no row';
  ASSERT (SELECT count(*) FROM public.studio_need_states) = 0, 'guest seat: the table must return no row';
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('e7660000-0000-4000-8000-000000000001');
  ASSERT (SELECT count(*) FROM public.studio_need_state_facts()) = 0, 'never-member: the projection must return no row';
  ASSERT (SELECT count(*) FROM public.studio_need_states) = 0, 'never-member: the table must return no row';
  PERFORM pg_temp.reset_role();
END $$;

-- anon may not call the projection at all.
DO $$
DECLARE
  v_state text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM count(*) FROM public.studio_need_state_facts();
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_state = '42501', format('anon: calling the projection must be denied (got %s)', v_state);
END $$;

-- ── Through the table: teammates read nothing of each other ─────────────────
DO $$
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  ASSERT (SELECT count(*) FROM public.studio_need_states WHERE user_id = 'a0000000-0000-0000-0000-000000000004') = 0,
    'reader: a direct SELECT of Leah''s rows must return 0 rows';
  ASSERT NOT EXISTS (SELECT 1 FROM public.studio_need_states
                     WHERE waiting_on LIKE 'Leah free text%' OR set_aside_reason LIKE 'Leah free text%'),
    'reader: Leah''s waiting_on and set_aside_reason must be unreadable';
  ASSERT pg_temp.table_keys() = '00766:reader-acted',
    format('reader: the table must show only her own row (got %s)', pg_temp.table_keys());
  PERFORM pg_temp.reset_role();
END $$;

-- ── Own-row retention through the table ─────────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  ASSERT pg_temp.table_keys() = '00766:leah-acted,00766:leah-deferred,00766:leah-second-studio,00766:leah-set-aside',
    format('Leah: the table must show all her own rows and no teammate''s (got %s)', pg_temp.table_keys());
  ASSERT EXISTS (SELECT 1 FROM public.studio_need_states
                 WHERE need_key = '00766:leah-acted' AND waiting_on = 'Leah free text: the client'),
    'Leah: her own waiting_on stays readable';
  ASSERT EXISTS (SELECT 1 FROM public.studio_need_states
                 WHERE need_key = '00766:leah-set-aside' AND set_aside_until = '2026-11-01' AND set_aside_reason = 'Leah free text: private reason'),
    'Leah: her own set-aside date and reason stay readable';
  PERFORM pg_temp.reset_role();
END $$;

-- Own rows do not depend on a seat: with her second-studio seat suspended,
-- Leah still reads the row filed there through the table.
SAVEPOINT own_rows_without_seat;
UPDATE public.organization_members SET status = 'suspended'
WHERE user_id = 'a0000000-0000-0000-0000-000000000004' AND organization_id = '00000000-0766-4000-8000-000000000001';
DO $$
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  ASSERT pg_temp.table_keys() = '00766:leah-acted,00766:leah-deferred,00766:leah-second-studio,00766:leah-set-aside',
    format('Leah: a suspended seat must still leave her own row readable (got %s)', pg_temp.table_keys());
  PERFORM pg_temp.reset_role();
END $$;
ROLLBACK TO SAVEPOINT own_rows_without_seat;

-- ── Revocation negatives against an existing other-user row ─────────────────
-- The row is Leah's acted 00766:leah-acted; the reader is a...0003. In each
-- case the reader's own row stays readable through the table (own-row
-- retention, asserted separately from the projection).
DO $$
BEGIN
  ASSERT pg_temp.reader_sees_leah_fact(), 'revocation baseline: the reader must see Leah''s acted row before any revocation';
END $$;

-- The reader's seat is suspended.
SAVEPOINT revoke_case;
UPDATE public.organization_members SET status = 'suspended'
WHERE user_id = 'a0000000-0000-0000-0000-000000000003' AND organization_id = 'b0000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  ASSERT NOT pg_temp.reader_sees_leah_fact(), 'revocation: a suspended seat must hide Leah''s existing acted row';
  ASSERT pg_temp.reader_own_rows() = '00766:reader-acted',
    format('revocation: a suspended reader still reads her own row through the table (got %s)', pg_temp.reader_own_rows());
END $$;
ROLLBACK TO SAVEPOINT revoke_case;
DO $$
BEGIN
  ASSERT pg_temp.reader_sees_leah_fact(), 'revocation control: the row must be visible again once the suspension is rolled back';
END $$;

-- The reader's membership is deleted.
SAVEPOINT revoke_case;
DELETE FROM public.organization_members
WHERE user_id = 'a0000000-0000-0000-0000-000000000003' AND organization_id = 'b0000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  ASSERT NOT pg_temp.reader_sees_leah_fact(), 'revocation: a deleted membership must hide Leah''s existing acted row';
  ASSERT pg_temp.reader_own_rows() = '00766:reader-acted',
    format('revocation: a reader with no membership still reads her own row through the table (got %s)', pg_temp.reader_own_rows());
END $$;
ROLLBACK TO SAVEPOINT revoke_case;
DO $$
BEGIN
  ASSERT pg_temp.reader_sees_leah_fact(), 'revocation control: the row must be visible again once the deletion is rolled back';
END $$;

-- The organisation is inactive while the reader's seat stays active.
SAVEPOINT revoke_case;
UPDATE public.organizations SET status = 'deactivated'
WHERE id = 'b0000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM public.organization_members
                 WHERE user_id = 'a0000000-0000-0000-0000-000000000003' AND organization_id = 'b0000000-0000-0000-0000-000000000001'
                   AND status = 'active'),
    'revocation: the reader''s seat must still be active while the organisation is inactive';
  ASSERT NOT pg_temp.reader_sees_leah_fact(), 'revocation: an inactive organisation must hide Leah''s existing acted row';
  ASSERT pg_temp.reader_own_rows() = '00766:reader-acted',
    format('revocation: in an inactive organisation the reader still reads her own row through the table (got %s)', pg_temp.reader_own_rows());
END $$;
ROLLBACK TO SAVEPOINT revoke_case;
DO $$
BEGIN
  ASSERT pg_temp.reader_sees_leah_fact(), 'revocation control: the row must be visible again once the organisation is active';
END $$;

-- ── Direct writes stay denied ───────────────────────────────────────────────
CREATE TEMP TABLE before_leah ON COMMIT DROP AS
  SELECT * FROM public.studio_need_states
  WHERE user_id = 'a0000000-0000-0000-0000-000000000004' AND need_key LIKE '00766:%';

DO $$
DECLARE
  v_state text;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

  v_state := NULL;
  BEGIN
    INSERT INTO public.studio_need_states (user_id, organization_id, project_id, need_key, acted_at)
    VALUES ('a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'e6590000-0000-4000-8000-000000000001', '00766:direct-insert', now());
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  ASSERT v_state = '42501', format('reader: a direct INSERT must be denied (got %s)', v_state);

  v_state := NULL;
  BEGIN
    UPDATE public.studio_need_states SET waiting_on = 'teammate'
    WHERE user_id = 'a0000000-0000-0000-0000-000000000004' AND need_key = '00766:leah-acted';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  ASSERT v_state = '42501', format('reader: a direct UPDATE of Leah''s row must be denied (got %s)', v_state);

  v_state := NULL;
  BEGIN
    DELETE FROM public.studio_need_states
    WHERE user_id = 'a0000000-0000-0000-0000-000000000004' AND need_key = '00766:leah-acted';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  ASSERT v_state = '42501', format('reader: a direct DELETE of Leah''s row must be denied (got %s)', v_state);

  v_state := NULL;
  BEGIN
    UPDATE public.studio_need_states SET waiting_on = 'self'
    WHERE user_id = 'a0000000-0000-0000-0000-000000000003' AND need_key = '00766:reader-acted';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  ASSERT v_state = '42501', format('reader: a direct UPDATE of her own row must be denied too (got %s)', v_state);
  PERFORM pg_temp.reset_role();

  ASSERT NOT EXISTS (SELECT 1 FROM public.studio_need_states WHERE need_key = '00766:direct-insert'),
    'the denied INSERT must leave no row';
  ASSERT (SELECT count(*) FROM public.studio_need_states s JOIN before_leah b USING (user_id, need_key)
          WHERE (s.organization_id, s.project_id, s.deferred_until, s.acted_at, s.waiting_on,
                 s.set_aside_until, s.set_aside_reason, s.updated_at)
                IS NOT DISTINCT FROM
                (b.organization_id, b.project_id, b.deferred_until, b.acted_at, b.waiting_on,
                 b.set_aside_until, b.set_aside_reason, b.updated_at)) = 4,
    'Leah''s four rows must be unchanged after the reader''s attempts';
END $$;

ROLLBACK;
