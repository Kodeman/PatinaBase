\set ON_ERROR_STOP on
\echo '=== A1. function ACLs + proconfig for W3 functions ==='
SELECT p.proname,
       p.prosecdef AS secdef,
       COALESCE(array_to_string(p.proconfig,','),'(none)') AS proconfig,
       COALESCE(array_to_string(p.proacl::text[], ' | '), '(default)') AS acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
   AND p.proname IN ('merge_studio_contacts','resolve_merged_contact','archive_studio_contact',
                     'restore_studio_contact','compliance_document_state','sweep_compliance_expiries',
                     'add_household_member','set_household_threshold','assert_party_card_not_merged',
                     'assert_party_bid_quoted_by','assert_client_household_members',
                     'assert_household_threshold_principal','clear_compliance_notices_on_date_change',
                     'assert_merged_into_write','contact_rule_blocks_contact','identity_paper_state',
                     'sync_person_affiliation_from_pointer','project_parties_touch_updated_at',
                     'rolodex_card_for_party_phone','link_rolodex_card_to_parties','assert_compliance_holder')
 ORDER BY 1;

\echo '=== A2. table grants on the three new tables ==='
SELECT c.relname, COALESCE(array_to_string(c.relacl::text[],' | '),'(default)') acl, c.relrowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('studio_contact_merges','studio_compliance_notices','client_households');

\echo '=== A3. policies on the three new tables ==='
SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
 WHERE schemaname='public' AND tablename IN ('studio_contact_merges','studio_compliance_notices','client_households')
 ORDER BY tablename, policyname;

\echo '=== A4. cron registration ==='
SELECT jobname, schedule, command, active, username FROM cron.job WHERE jobname='compliance-document-expiry-sweep';

\echo '=== A5. court check ==='
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='client_decisions_court_check';
SELECT court, count(*) FROM client_decisions GROUP BY 1;

\echo '=== A6. 00628 backfill outcome ==='
SELECT count(*) total, count(studio_id) stamped, count(*)-count(studio_id) still_null FROM projects;
SELECT p.id, p.name, (SELECT count(DISTINCT om.organization_id) FROM organization_members om JOIN organizations o ON o.id=om.organization_id WHERE om.user_id=p.designer_id AND om.status='active' AND om.role<>'guest' AND o.type='design_studio' AND o.status='active') n_orgs,
       (SELECT count(*) FROM project_parties pp WHERE pp.project_id=p.id) seats
  FROM projects p WHERE p.studio_id IS NULL ORDER BY 2;

\echo '=== A7. project_consent_org callers ==='
SELECT 'function' kind, p.proname obj FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosrc LIKE '%project_consent_org%' AND p.proname<>'project_consent_org'
UNION ALL
SELECT 'view', c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='v' AND pg_get_viewdef(c.oid) LIKE '%project_consent_org%'
UNION ALL
SELECT 'policy', pol.polname FROM pg_policy pol
 WHERE pg_get_expr(pol.polqual, pol.polrelid) LIKE '%project_consent_org%'
    OR pg_get_expr(pol.polwithcheck, pol.polrelid) LIKE '%project_consent_org%'
 ORDER BY 1,2;

\echo '=== A8. merged_into / bid columns / household column present ==='
SELECT table_name, column_name FROM information_schema.columns
 WHERE table_schema='public' AND ((table_name='studio_contacts' AND column_name='merged_into')
   OR (table_name='project_parties' AND column_name LIKE 'bid_%')
   OR (table_name='designer_clients' AND column_name='household_id')
   OR (table_name='project_party_authority' AND column_name='source_household_id'))
 ORDER BY 1,2;
