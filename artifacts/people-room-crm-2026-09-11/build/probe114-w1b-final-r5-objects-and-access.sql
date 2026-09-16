\pset pager off
\echo '=== 1. relations: kind, RLS, policy count, grants ==='
SELECT c.relname, c.relkind, c.relrowsecurity AS rls,
       (SELECT count(*) FROM pg_policy pol WHERE pol.polrelid=c.oid) AS policies,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_sel,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_sel,
       has_table_privilege('authenticated', c.oid, 'INSERT') AS auth_ins
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public'
   AND c.relname IN ('studio_compliance_documents','project_party_authority',
                     'project_site_access_cards','people_directory',
                     'people_directory_seats','v_access_grants')
 ORDER BY c.relname;

\echo '=== 2. PR-r: no code-like column on the site access card ==='
SELECT count(*) AS code_like_columns FROM information_schema.columns
 WHERE table_schema='public' AND table_name='project_site_access_cards'
   AND (column_name ~* 'code' OR column_name='show_to_client');

\echo '=== 3. PR-w: the site access card policies, roles and predicates ==='
SELECT pol.polname, pol.polcmd,
       array(SELECT r.rolname FROM pg_roles r WHERE r.oid = ANY(pol.polroles)) AS roles,
       pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
       pg_get_expr(pol.polwithcheck, pol.polrelid) AS check_expr
  FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid
 WHERE c.relname='project_site_access_cards' ORDER BY pol.polname;

\echo '=== 4. PR-n: the authority write policies ==='
SELECT pol.polname, pol.polcmd,
       pg_get_expr(pol.polqual, pol.polrelid) LIKE '%is_org_admin_or_owner%' AS using_gate,
       pg_get_expr(pol.polwithcheck, pol.polrelid) LIKE '%is_org_admin_or_owner%' AS check_gate
  FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid
 WHERE c.relname='project_party_authority' ORDER BY pol.polname;

\echo '=== 5. every new function: definer? volatility? search_path? acl ==='
SELECT p.proname,
       CASE WHEN p.prosecdef THEN 'definer' ELSE 'INVOKER' END AS sec,
       p.provolatile AS vol, p.proconfig::text AS cfg,
       array(SELECT (aclexplode(p.proacl)).grantee::regrole::text) AS acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN (
   'compliance_state','assert_compliance_holder','project_party_org',
   'assert_project_party_cards','assert_party_authority_copy_to','project_designer',
   'assert_site_access_key_holder','party_identity_key','party_kind_in_directory',
   'reach_state_for','reach_state_for_identity','identity_seat_count',
   'contact_rule_summary','identity_paper_state','identity_phone_numbers',
   'identity_consent_status','identity_consent_evidence','create_field_link',
   'access_grants_trade_rfq','access_grants_trade_agreement_links',
   'access_grants_plan_transmittals','access_grants_invoice_links')
 ORDER BY p.proname, p.oid;

\echo '=== 6. people_directory column order and types ==='
SELECT ordinal_position, column_name, data_type FROM information_schema.columns
 WHERE table_schema='public' AND table_name='people_directory' ORDER BY ordinal_position;

\echo '=== 7. the freeze trigger column list ==='
SELECT t.tgname, array(SELECT a.attname FROM unnest(t.tgattr) k
        JOIN pg_attribute a ON a.attrelid=t.tgrelid AND a.attnum=k) AS cols
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 WHERE c.relname='project_parties' AND NOT t.tgisinternal ORDER BY t.tgname;

\echo '=== 8. stage backfill: completed projects vs stages ==='
SELECT pj.status, pp.stage, count(*) FROM project_parties pp
  JOIN projects pj ON pj.id=pp.project_id GROUP BY 1,2 ORDER BY 1,2;

\echo '=== 9. v_access_grants tiers ==='
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
SELECT tier, count(*) FROM public.v_access_grants GROUP BY tier ORDER BY tier;
SELECT count(*) AS grant_ids_that_look_like_a_hash FROM public.v_access_grants
 WHERE grant_id ~ '[0-9a-f]{64}';
RESET ROLE;
