-- W1b final review r14 — objects, grants, function posture. Never the ledger.
\pset pager off
\echo '=== A. the wave relations: rls, policies, who may select ==='
SELECT c.relname, c.relkind, c.relrowsecurity AS rls,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_sel,
       has_table_privilege('anon',          c.oid, 'SELECT') AS anon_sel,
       has_table_privilege('authenticated', c.oid, 'INSERT') AS auth_ins,
       has_table_privilege('anon',          c.oid, 'INSERT') AS anon_ins
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public'
   AND c.relname IN ('studio_compliance_documents','project_party_authority',
                     'project_site_access_cards','people_directory',
                     'people_directory_seats','v_access_grants','project_parties')
 ORDER BY c.relname;

\echo '=== B. policies on the three new tables ==='
SELECT c.relname, p.polname, p.polcmd,
       pg_get_expr(p.polqual, p.polrelid)      AS using_expr,
       pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr,
       (SELECT string_agg(r.rolname, ',') FROM pg_roles r
         WHERE r.oid = ANY (p.polroles))       AS roles
  FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
 WHERE c.relname IN ('studio_compliance_documents','project_party_authority',
                     'project_site_access_cards')
 ORDER BY c.relname, p.polname;

\echo '=== C. PR-r: no code-like column on the site access card ==='
SELECT count(*) AS code_like_columns
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='project_site_access_cards'
   AND (column_name ~* 'code' OR column_name = 'show_to_client');

\echo '=== D. every routine this wave defines: definer? search_path? who may execute? ==='
SELECT p.proname,
       CASE WHEN p.prosecdef THEN 'definer' ELSE 'INVOKER' END AS secdef,
       p.provolatile AS vol,
       p.proconfig,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
   AND p.proname IN (
     'compliance_state','assert_compliance_holder','project_tenant_org',
     'project_party_org','project_recorded_studio','project_party_recorded_studio',
     'assert_project_party_cards','assert_party_authority_copy_to',
     'project_designer','assert_site_access_key_holder','party_identity_key',
     'rolodex_card_for_party_phone','link_party_to_rolodex_card',
     'link_rolodex_card_to_parties','party_kind_in_directory','reach_state_for',
     'identity_seat_count','contact_rule_summary','reach_state_for_identity',
     'identity_paper_state','identity_phone_numbers','identity_consent_status',
     'identity_consent_evidence','access_grants_trade_rfq',
     'access_grants_trade_agreement_links','access_grants_plan_transmittals',
     'access_grants_invoice_links','create_field_link')
 ORDER BY p.proname, p.oid;

\echo '=== E. any SECURITY DEFINER routine of this wave with no pinned search_path ==='
SELECT p.proname
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosecdef
   AND (p.proconfig IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
   AND p.proname IN (
     'assert_compliance_holder','project_tenant_org','project_party_org',
     'project_recorded_studio','project_party_recorded_studio',
     'assert_project_party_cards','assert_party_authority_copy_to',
     'project_designer','assert_site_access_key_holder',
     'rolodex_card_for_party_phone','link_party_to_rolodex_card',
     'link_rolodex_card_to_parties','identity_phone_numbers',
     'access_grants_trade_rfq','access_grants_trade_agreement_links',
     'access_grants_plan_transmittals','access_grants_invoice_links',
     'create_field_link');

\echo '=== F. people_directory column order (12 carried + 5 appended) ==='
SELECT ordinal_position, column_name, data_type
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='people_directory'
 ORDER BY ordinal_position;

\echo '=== G. compliance_state 30-day window, both boundaries, on a probe holder ==='
BEGIN;
DO $$
DECLARE v_org uuid; v_card uuid;
BEGIN
  INSERT INTO public.organizations(name, type, status, slug)
  VALUES ('r14 probe studio','design_studio','active','r14-probe-studio')
  RETURNING id INTO v_org;
  INSERT INTO public.studio_contacts(organization_id, entity_kind, company_name, contact_kind)
  VALUES (v_org,'company','R14 Probe Firm','trade') RETURNING id INTO v_card;

  -- lapsed boundary: yesterday
  INSERT INTO public.studio_compliance_documents(organization_id, holder_type, holder_id,
         doc_type, expires_on, blocks)
  VALUES (v_org,'company',v_card,'coi_gl',CURRENT_DATE - 1, ARRAY['site_access']);
  RAISE NOTICE 'expires yesterday        -> %', public.compliance_state(v_card);
  UPDATE public.studio_compliance_documents SET expires_on = CURRENT_DATE WHERE holder_id=v_card;
  RAISE NOTICE 'expires today            -> %', public.compliance_state(v_card);
  UPDATE public.studio_compliance_documents SET expires_on = CURRENT_DATE + 30 WHERE holder_id=v_card;
  RAISE NOTICE 'expires today+30         -> %', public.compliance_state(v_card);
  UPDATE public.studio_compliance_documents SET expires_on = CURRENT_DATE + 31 WHERE holder_id=v_card;
  RAISE NOTICE 'expires today+31         -> %', public.compliance_state(v_card);
  UPDATE public.studio_compliance_documents SET blocks = '{}'::text[] WHERE holder_id=v_card;
  UPDATE public.studio_compliance_documents SET expires_on = CURRENT_DATE - 1 WHERE holder_id=v_card;
  RAISE NOTICE 'lapsed but GATELESS      -> %', public.compliance_state(v_card);
  RAISE NOTICE 'no paper at all          -> %', public.compliance_state(gen_random_uuid());
END $$;
ROLLBACK;
