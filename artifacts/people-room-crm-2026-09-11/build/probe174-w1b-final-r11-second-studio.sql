\pset pager off
BEGIN;
SET LOCAL client_min_messages = notice;
-- Z = a plain member of Leah Hartwell (the designer of record's SECOND design
-- studio) and of nothing else. Never a member of Local Dev Studio.
INSERT INTO public.organization_members (organization_id, user_id, role, status, joined_at)
SELECT '772a6862-a185-4266-b104-b213b3403eaf', p.id, 'member', 'active', now()
  FROM public.profiles p WHERE p.email = 'client@patina.dev';

DO $$
DECLARE v int; z uuid; v_t text;
BEGIN
  SELECT id INTO z FROM public.profiles WHERE email='client@patina.dev';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', z::text, 'role','authenticated')::text, true);
  RAISE NOTICE 'Z member of Local Dev Studio? %',
    public.is_active_studio_member('b0000000-0000-0000-0000-000000000001');
  SELECT count(*) INTO v FROM public.people_directory_seats; RAISE NOTICE '  seats: %', v;
  SELECT count(*) INTO v FROM public.people_directory;       RAISE NOTICE '  directory rows: %', v;
  SELECT count(*) INTO v FROM public.project_site_access_cards; RAISE NOTICE '  site access cards: %', v;
  SELECT count(*) INTO v FROM public.project_party_authority;   RAISE NOTICE '  authority grants: %', v;
  SELECT count(*) INTO v FROM public.studio_compliance_documents; RAISE NOTICE '  compliance docs: %', v;
  SELECT string_agg(tier||'='||n,' ' ORDER BY tier) INTO v_t
    FROM (SELECT tier, count(*) n FROM public.v_access_grants GROUP BY 1) s;
  RAISE NOTICE '  v_access_grants by tier: %', COALESCE(v_t,'(none)');
  SELECT count(*) INTO v FROM public.access_grants_trade_rfq();          RAISE NOTICE '  rfq reader: %', v;
  SELECT count(*) INTO v FROM public.access_grants_plan_transmittals();  RAISE NOTICE '  plan reader: %', v;
  SELECT count(*) INTO v FROM public.access_grants_invoice_links();      RAISE NOTICE '  invoice reader: %', v;
  SELECT count(*) INTO v FROM public.access_grants_trade_agreement_links(); RAISE NOTICE '  agreement reader: %', v;
  -- the raw doors, for contrast
  SELECT count(*) INTO v FROM public.project_parties;  RAISE NOTICE '  raw project_parties (RLS): %', v;
  SELECT count(*) INTO v FROM public.field_link_tokens; RAISE NOTICE '  raw field_link_tokens (RLS): %', v;
  RESET ROLE;
END $$;

\echo '=== studio-less projects and their seats ==='
SELECT (SELECT count(*) FROM public.projects WHERE studio_id IS NULL) AS studioless_projects,
       (SELECT count(*) FROM public.project_parties pp JOIN public.projects pj ON pj.id=pp.project_id
         WHERE pj.studio_id IS NULL) AS seats_on_them,
       (SELECT count(*) FROM public.projects) AS all_projects;
ROLLBACK;
