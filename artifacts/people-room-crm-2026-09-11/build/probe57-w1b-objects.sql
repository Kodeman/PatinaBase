-- W1b object probe. Objects and access only — never the ledger.
\pset pager off
\echo '=== 1. the four new relations exist, with RLS on and their policies ==='
SELECT c.relname,
       c.relkind,
       c.relrowsecurity AS rls,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
       has_table_privilege('anon', c.oid, 'SELECT')          AS anon_select
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname IN ('studio_compliance_documents','project_party_authority',
                     'project_site_access_cards','people_directory_seats',
                     'v_access_grants','people_directory')
 ORDER BY c.relname;

\echo '=== 2. PR-r: there is NO access code on the site access card ==='
SELECT count(*) AS code_like_columns
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='project_site_access_cards'
   AND (column_name ~ 'code' OR column_name = 'show_to_client');

\echo '=== 3. PR-w: the site access card''s four policies, and no client leg ==='
SELECT p.polname, p.polcmd,
       pg_get_expr(p.polqual, p.polrelid) AS using_expr
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
 WHERE c.relname = 'project_site_access_cards' ORDER BY p.polname;

\echo '=== 4. PR-n: the money/draw_certify narrow is in the write policies ==='
SELECT p.polname, p.polcmd,
       pg_get_expr(p.polwithcheck, p.polrelid) LIKE '%is_org_admin_or_owner%' AS has_admin_gate
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
 WHERE c.relname = 'project_party_authority' ORDER BY p.polname;

\echo '=== 5. the new functions: volatility, definer-or-invoker, search_path, ACL ==='
SELECT p.proname,
       p.prosecdef AS security_definer,
       p.provolatile,
       p.proconfig,
       array_to_string(p.proacl, ' ') AS acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('compliance_state','party_identity_key','reach_state_for',
                     'identity_seat_count','contact_rule_summary',
                     'project_designer','project_party_org','create_field_link',
                     'access_grants_trade_rfq','access_grants_trade_agreement_links',
                     'access_grants_plan_transmittals','access_grants_invoice_links',
                     'assert_compliance_holder','assert_project_party_cards',
                     'assert_party_authority_copy_to','assert_site_access_key_holder')
 ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

\echo '=== 6. people_directory: twelve columns kept in place, five appended ==='
SELECT ordinal_position, column_name, data_type
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='people_directory'
 ORDER BY ordinal_position;

\echo '=== 7. people_directory reads the record and compliance_state, not a frozen seat ==='
SELECT
  pg_get_viewdef('public.people_directory'::regclass) LIKE '%channel_consent_status%' AS reads_consent_record,
  pg_get_viewdef('public.people_directory'::regclass) LIKE '%compliance_state%'       AS reads_paper_state,
  pg_get_viewdef('public.people_directory'::regclass) LIKE '%party_identity_key%'     AS keys_on_identity,
  pg_get_viewdef('public.people_directory'::regclass) LIKE '%pp.sms_consent_status%'  AS still_reads_frozen_verdict,
  pg_get_viewdef('public.people_directory'::regclass) LIKE '%sms_consented_at%'       AS mentions_consent_dates,
  pg_get_viewdef('public.people_directory'::regclass) LIKE '%pp.sms_consented_at%'    AS dates_still_off_the_seat;

\echo '=== 8. create_field_link: both signatures callable, the expiry line ==='
SELECT pg_get_function_identity_arguments(p.oid) AS args,
       array_to_string(p.proacl,' ') AS acl,
       pg_get_functiondef(p.oid) LIKE '%warranty_until%' AS reads_warranty,
       pg_get_functiondef(p.oid) LIKE '%on_site_to%'     AS reads_window
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='create_field_link'
 ORDER BY 1;

\echo '=== 9. project_parties: the new columns, and the freeze trigger still names only consent + phone ==='
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='project_parties'
   AND column_name IN ('stage','on_site_from','on_site_to','site_access_mode',
                       'contracted_through','off_job_at','off_job_reason',
                       'company_id','warranty_until','warranty_contact_person_id')
 ORDER BY column_name;

SELECT a.attname AS frozen_column
  FROM pg_trigger tg
  JOIN pg_class c ON c.oid = tg.tgrelid
  JOIN pg_attribute a ON a.attrelid = tg.tgrelid AND a.attnum = ANY(tg.tgattr::int2[])
 WHERE c.relname='project_parties' AND tg.tgname='refuse_legacy_consent_write_trg'
 ORDER BY a.attname;

\echo '=== 10. v_access_grants: all eleven tiers, seven in the view and four in'
\echo '    the definer readers the grant-closed sources come through ==='
WITH defs AS (
  SELECT pg_get_viewdef('public.v_access_grants'::regclass) AS d
  UNION ALL
  SELECT pg_get_functiondef(p.oid)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname LIKE 'access_grants_%'
)
SELECT count(DISTINCT m[1]) AS tiers_named,
       string_agg(DISTINCT m[1], ', ' ORDER BY m[1]) AS tiers
  FROM defs, regexp_matches(defs.d, '''([a-z_]+):''', 'g') AS m;

\echo '=== 11. the seeded fixture, counted (the gate probe) ==='
SELECT entity_kind, count(*) AS cards
  FROM public.studio_contacts
 WHERE organization_id = 'b0000000-0000-0000-0000-000000000001'
 GROUP BY 1 ORDER BY 1;

SELECT pj.name AS project, pj.status::text, count(*) AS seats
  FROM public.project_parties pp JOIN public.projects pj ON pj.id = pp.project_id
 WHERE pj.studio_id = 'b0000000-0000-0000-0000-000000000001'
 GROUP BY 1,2 ORDER BY 1;

SELECT 'compliance_documents' AS object, count(*) FROM public.studio_compliance_documents
 WHERE organization_id = 'b0000000-0000-0000-0000-000000000001'
UNION ALL SELECT 'contact_rules', count(*) FROM public.studio_contact_rules r
 WHERE EXISTS (SELECT 1 FROM public.studio_contacts sc
                WHERE sc.id = r.subject_id
                  AND sc.organization_id='b0000000-0000-0000-0000-000000000001')
UNION ALL SELECT 'typed_channels', count(*) FROM public.studio_contact_channels ch
 WHERE EXISTS (SELECT 1 FROM public.studio_contacts sc
                WHERE sc.id = ch.owner_id
                  AND sc.organization_id='b0000000-0000-0000-0000-000000000001')
UNION ALL SELECT 'consent_records', count(*) FROM public.studio_channel_consent
 WHERE organization_id='b0000000-0000-0000-0000-000000000001'
UNION ALL SELECT 'authority_grants', count(*) FROM public.project_party_authority a
 WHERE EXISTS (SELECT 1 FROM public.project_parties pp JOIN public.projects pj ON pj.id=pp.project_id
                WHERE pp.id=a.engagement_id AND pj.studio_id='b0000000-0000-0000-0000-000000000001')
UNION ALL SELECT 'site_access_cards', count(*) FROM public.project_site_access_cards c
 WHERE EXISTS (SELECT 1 FROM public.projects pj WHERE pj.id=c.project_id
                AND pj.studio_id='b0000000-0000-0000-0000-000000000001')
UNION ALL SELECT 'affiliations', count(*) FROM public.studio_person_affiliations a
 WHERE public.studio_contact_org(a.person_id)='b0000000-0000-0000-0000-000000000001'
ORDER BY 1;
