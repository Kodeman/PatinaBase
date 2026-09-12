\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume(p uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE 'SET LOCAL role authenticated';
 EXECUTE format('SET LOCAL request.jwt.claims = %L', json_build_object('sub',p::text,'role','authenticated')::text); END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assume(uuid) TO authenticated;

-- who is who
\echo '=== local actors ==='
SELECT p.id, p.email, string_agg(o.name||'/'||m.role, ', ') AS memberships
  FROM profiles p
  LEFT JOIN organization_members m ON m.user_id=p.id AND m.status='active'
  LEFT JOIN organizations o ON o.id=m.organization_id
 WHERE p.email IN ('designer@patina.dev','studio_manager@patina.dev','client@patina.dev','admin@patina.dev')
 GROUP BY p.id, p.email ORDER BY p.email;

\echo '=== field_link_tokens policies ==='
SELECT policyname, cmd, qual FROM pg_policies
 WHERE schemaname='public' AND tablename='field_link_tokens';

DO $$ DECLARE c int; r record; BEGIN
  -- Z: client@patina.dev, a plain member of Leah Hartwell only
  PERFORM pg_temp.assume('a0000000-0000-0000-0000-000000000005');
  RAISE NOTICE 'Z member of Local Dev Studio? %',
    public.is_active_studio_member('b0000000-0000-0000-0000-000000000001');
  FOR r IN SELECT tier, count(*) n FROM public.v_access_grants GROUP BY tier ORDER BY tier LOOP
    RAISE NOTICE '  Z reads tier % : %', r.tier, r.n;
  END LOOP;
  SELECT count(*) INTO c FROM public.v_access_grants g
   WHERE g.tier='field_link' AND g.scope_id IN
     ('d0e00000-0000-0000-0000-00000000000a','d0e00000-0000-0000-0000-00000000000b');
  RAISE NOTICE '  Z reads % field_link grants on the SEEDED studio''s two jobs', c;
END $$;

DO $$ DECLARE r record; BEGIN
  -- a homeowner client account
  PERFORM pg_temp.assume((SELECT dc.client_id FROM designer_clients dc
                           WHERE dc.client_id IS NOT NULL LIMIT 1));
  RAISE NOTICE '--- a CLIENT account ---';
  FOR r IN SELECT tier, count(*) n FROM public.v_access_grants GROUP BY tier ORDER BY tier LOOP
    RAISE NOTICE '  client reads tier % : %', r.tier, r.n;
  END LOOP;
END $$;
ROLLBACK;
