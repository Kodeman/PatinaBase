\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume(p uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE 'SET LOCAL role authenticated';
 EXECUTE format('SET LOCAL request.jwt.claims = %L', json_build_object('sub',p::text,'role','authenticated')::text); END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assume(uuid) TO authenticated;

-- Z joins the designer's SECOND design studio as a plain member (r8/r9's actor)
INSERT INTO public.organization_members (organization_id, user_id, role, status, joined_at)
VALUES ('63a810d2-29f8-43d7-ad5f-84ac88974491','a0000000-0000-0000-0000-000000000005','member','active',now())
ON CONFLICT DO NOTHING;

DO $$ DECLARE r record; c int; BEGIN
  PERFORM pg_temp.assume('a0000000-0000-0000-0000-000000000005');
  RAISE NOTICE 'Z member of Local Dev Studio (the studio doing the work)? %',
    public.is_active_studio_member('b0000000-0000-0000-0000-000000000001');
  RAISE NOTICE '--- what Z reads through v_access_grants ---';
  FOR r IN SELECT tier, count(*) n FROM public.v_access_grants GROUP BY tier ORDER BY tier LOOP
    RAISE NOTICE '   % : %', r.tier, r.n;
  END LOOP;
  SELECT count(*) INTO c FROM public.v_access_grants g WHERE g.tier='field_link'
    AND g.scope_id IN ('d0e00000-0000-0000-0000-00000000000a','d0e00000-0000-0000-0000-00000000000b');
  RAISE NOTICE '   of which field_link on Local Dev Studio''s own two jobs: %', c;
  SELECT count(*) INTO c FROM public.field_link_tokens f
    WHERE f.project_id IN ('d0e00000-0000-0000-0000-00000000000a','d0e00000-0000-0000-0000-00000000000b');
  RAISE NOTICE '   the same rows straight off field_link_tokens (the shipped door): %', c;
  SELECT count(*) INTO c FROM public.people_directory_seats;
  RAISE NOTICE '   seats Z reads (the residue 00624 §1c names): %', c;
  SELECT count(*) INTO c FROM public.project_site_access_cards;
  RAISE NOTICE '   site access cards Z reads: %', c;
  SELECT count(*) INTO c FROM public.project_party_authority;
  RAISE NOTICE '   authority grants Z reads: %', c;
  SELECT count(*) INTO c FROM public.studio_compliance_documents;
  RAISE NOTICE '   compliance documents Z reads: %', c;
END $$;
ROLLBACK;
