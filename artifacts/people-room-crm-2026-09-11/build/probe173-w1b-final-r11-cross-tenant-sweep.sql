\pset pager off
BEGIN;
SET LOCAL client_min_messages = notice;
DO $$
DECLARE
  r record; v int; v_ids text;
BEGIN
  FOR r IN SELECT p.id, p.email FROM public.profiles p
            WHERE p.email IN ('cf-phase1-alice@patina.invalid','client@patina.dev',
                              'admin@patina.dev','studio_manager@patina.dev','designer@patina.dev')
            ORDER BY p.email
  LOOP
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', r.id::text, 'role','authenticated')::text, true);
    RAISE NOTICE '--- % ---', r.email;

    SELECT count(*) INTO v FROM public.studio_compliance_documents
     WHERE organization_id = 'b0000000-0000-0000-0000-000000000001';
    RAISE NOTICE '  LDS compliance documents: %', v;
    SELECT count(*) INTO v FROM public.project_party_authority;
    RAISE NOTICE '  authority grants (any): %', v;
    SELECT count(*) INTO v FROM public.project_site_access_cards;
    RAISE NOTICE '  site access cards (any): %', v;
    SELECT count(*) INTO v FROM public.people_directory_seats;
    RAISE NOTICE '  directory seats (any): %', v;
    SELECT count(*) INTO v FROM public.people_directory;
    RAISE NOTICE '  people_directory rows: %', v;
    SELECT count(*) INTO v FROM public.v_access_grants;
    RAISE NOTICE '  v_access_grants rows: %', v;
    SELECT string_agg(tier||'='||n, ' ' ORDER BY tier) INTO v_ids
      FROM (SELECT tier, count(*) n FROM public.v_access_grants GROUP BY 1) s;
    RAISE NOTICE '    by tier: %', COALESCE(v_ids,'(none)');
    SELECT count(*) INTO v FROM public.access_grants_trade_rfq();
    RAISE NOTICE '  access_grants_trade_rfq(): %', v;
    SELECT count(*) INTO v FROM public.access_grants_plan_transmittals();
    RAISE NOTICE '  access_grants_plan_transmittals(): %', v;
    SELECT count(*) INTO v FROM public.access_grants_invoice_links();
    RAISE NOTICE '  access_grants_invoice_links(): %', v;
    SELECT count(*) INTO v FROM public.access_grants_trade_agreement_links();
    RAISE NOTICE '  access_grants_trade_agreement_links(): %', v;
    RESET ROLE;
  END LOOP;
END $$;
ROLLBACK;
