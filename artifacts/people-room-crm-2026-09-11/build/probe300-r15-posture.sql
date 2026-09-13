\pset pager off
\echo '=== A. the wave relations: rls, policies, grants ==='
SELECT c.relname, c.relkind, c.relrowsecurity AS rls,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_sel,
       has_table_privilege('anon',          c.oid, 'SELECT') AS anon_sel,
       has_table_privilege('authenticated', c.oid, 'INSERT') AS auth_ins,
       has_table_privilege('anon',          c.oid, 'INSERT') AS anon_ins
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname='public'
   AND c.relname IN ('studio_compliance_documents','project_party_authority',
                     'project_site_access_cards','people_directory',
                     'people_directory_seats','v_access_grants','project_parties')
 ORDER BY 1;

\echo ''
\echo '=== B. PR-r: any code-like column on the site access card? ==='
SELECT count(*) AS code_like_columns
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='project_site_access_cards'
   AND (column_name ~* '(gate_?code|^code$|access_code|lockbox_code|combination|pin)'
        OR column_name = 'show_to_client');

\echo ''
\echo '=== C. PR-w: site access policies, roles and predicates ==='
SELECT p.polname, p.polcmd,
       (SELECT array_agg(r.rolname ORDER BY r.rolname) FROM pg_roles r WHERE r.oid = ANY(p.polroles)) AS roles,
       pg_get_expr(p.polqual,  p.polrelid) AS using_expr,
       pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
  FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
 WHERE c.relname='project_site_access_cards' ORDER BY 1;

\echo ''
\echo '=== D. PR-n: authority policies ==='
SELECT p.polname, p.polcmd,
       pg_get_expr(p.polqual,  p.polrelid) LIKE '%is_org_admin_or_owner%' AS using_admin_gate,
       pg_get_expr(p.polwithcheck, p.polrelid) LIKE '%is_org_admin_or_owner%' AS check_admin_gate
  FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
 WHERE c.relname='project_party_authority' ORDER BY 1;

\echo ''
\echo '=== E. every routine this wave defines: definer? search_path? acl? ==='
SELECT p.proname,
       CASE WHEN p.prosecdef THEN 'definer' ELSE 'INVOKER' END AS sec,
       p.provolatile AS vol,
       COALESCE(array_to_string(p.proconfig,','),'(none)') AS cfg,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
   AND p.proname IN ('compliance_state','assert_compliance_holder','party_identity_key',
     'party_kind_in_directory','reach_state_for','reach_state_for_identity',
     'identity_seat_count','contact_rule_summary','identity_paper_state',
     'identity_phone_numbers','identity_consent_status','identity_consent_evidence',
     'rolodex_card_for_party_phone','link_party_to_rolodex_card','link_rolodex_card_to_parties',
     'project_tenant_org','project_party_org','project_recorded_studio',
     'project_party_recorded_studio','project_designer','assert_project_party_cards',
     'assert_party_authority_copy_to','assert_site_access_key_holder',
     'access_grants_trade_rfq','access_grants_trade_agreement_links',
     'access_grants_plan_transmittals','access_grants_invoice_links',
     'create_field_link','refuse_legacy_consent_write')
 ORDER BY 1, pg_get_function_identity_arguments(p.oid);

\echo ''
\echo '=== F. any SECURITY DEFINER routine of this wave WITHOUT a pinned search_path ==='
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosecdef
   AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%')
 ORDER BY 1;

\echo ''
\echo '=== G. people_directory column order ==='
SELECT ordinal_position, column_name, data_type
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='people_directory'
 ORDER BY ordinal_position;

\echo ''
\echo '=== H. freeze trigger UPDATE OF list ==='
SELECT a.attname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  CROSS JOIN LATERAL unnest(t.tgattr) AS u(attnum)
  JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=u.attnum
 WHERE c.relname='project_parties' AND t.tgname='refuse_legacy_consent_write_trg'
 ORDER BY 1;

\echo ''
\echo '=== I. project_parties BEFORE-row trigger order ==='
SELECT t.tgname, t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 WHERE c.relname='project_parties' AND NOT t.tgisinternal ORDER BY t.tgname;

\echo ''
\echo '=== J. v_access_grants tiers and bearer-credential check ==='
SET LOCAL role postgres;
SELECT count(DISTINCT tier) AS tiers FROM public.v_access_grants;
SELECT count(*) AS hexlike_grant_ids FROM public.v_access_grants WHERE grant_id ~ '[0-9a-f]{64}';
