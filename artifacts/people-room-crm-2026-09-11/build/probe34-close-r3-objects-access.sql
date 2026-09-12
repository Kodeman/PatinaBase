\pset pager off
\echo '=== P1a. wave functions: definer, volatility, search_path, acl ==='
SELECT p.proname,
       p.prosecdef AS definer,
       p.provolatile AS vol,
       COALESCE(array_to_string(p.proconfig, ','), '(none)') AS cfg,
       COALESCE(array_to_string(p.proacl::text[], ' | '), '(default=public)') AS acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public'
   AND p.proname IN ('backfill_channel_consent_from_parties','channel_consent_status',
                     'project_consent_org','record_channel_consent','record_channel_invite',
                     'record_channel_reconsent','refuse_legacy_consent_write',
                     'normalize_channel_value','studio_contact_org','project_party_designer',
                     'mirror_channel_consent_to_parties','channel_value_was_on_sms_rail',
                     'assert_studio_contact_identity_stable')
 ORDER BY 1;

\echo '=== P1b. anon / authenticated EXECUTE on each ==='
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
   AND p.proname IN ('backfill_channel_consent_from_parties','channel_consent_status',
                     'project_consent_org','record_channel_consent','record_channel_invite',
                     'record_channel_reconsent','refuse_legacy_consent_write','normalize_channel_value')
 ORDER BY 1;

\echo '=== P1c. new tables: RLS enabled, policies, grants ==='
SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
       COALESCE(array_to_string(c.relacl::text[], ' | '), '(default)') AS acl
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public'
   AND c.relname IN ('studio_channel_consent','studio_contact_channels',
                     'studio_person_affiliations','studio_contact_rules',
                     'project_parties','people_directory','v_project_roster')
 ORDER BY 1;

SELECT tablename, policyname, cmd, roles::text, qual, with_check
  FROM pg_policies
 WHERE schemaname='public'
   AND tablename IN ('studio_channel_consent','studio_contact_channels',
                     'studio_person_affiliations','studio_contact_rules')
 ORDER BY tablename, policyname;

\echo '=== P1d. anon table privileges on the new tables + views ==='
SELECT t.relname,
       has_table_privilege('anon', t.oid, 'SELECT') AS anon_sel,
       has_table_privilege('anon', t.oid, 'INSERT') AS anon_ins,
       has_table_privilege('authenticated', t.oid, 'SELECT') AS auth_sel,
       has_table_privilege('authenticated', t.oid, 'INSERT') AS auth_ins,
       has_table_privilege('authenticated', t.oid, 'UPDATE') AS auth_upd,
       has_table_privilege('authenticated', t.oid, 'DELETE') AS auth_del
  FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
 WHERE n.nspname='public'
   AND t.relname IN ('studio_channel_consent','studio_contact_channels',
                     'studio_person_affiliations','studio_contact_rules',
                     'people_directory','v_project_roster')
 ORDER BY 1;

\echo '=== P1e. triggers on project_parties and studio_channel_consent ==='
SELECT c.relname AS tbl, t.tgname, t.tgtype,
       CASE WHEN t.tgtype & 2 = 2 THEN 'BEFORE' ELSE 'AFTER/INSTEAD' END AS timing,
       pg_get_triggerdef(t.oid) AS def
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE NOT t.tgisinternal AND n.nspname='public'
   AND c.relname IN ('project_parties','studio_channel_consent')
 ORDER BY 1,2;

\echo '=== P1f. does anything read/write the suppression flag or write the frozen cols? ==='
SELECT count(*) AS fns_reading_suppress_flag
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosrc LIKE '%suppress_consent_dispatch%';
SELECT p.proname
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
   AND p.prosrc ~* 'UPDATE[[:space:]]+(public\.)?project_parties'
   AND p.prosrc ~* 'sms_consent|sms_opt_out'
 ORDER BY 1;
SELECT count(*) AS fns_setting_legacy_write_flag
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosrc LIKE '%consent_legacy_write%';

\echo '=== P1g. both readers actually reference the record, and not the seat ==='
SELECT viewname,
       pg_get_viewdef(('public.'||viewname)::regclass) LIKE '%channel_consent_status%' AS reads_record,
       pg_get_viewdef(('public.'||viewname)::regclass) LIKE '%pp.sms_consent_status%' AS still_reads_seat,
       pg_get_viewdef(('public.'||viewname)::regclass) LIKE '%refusal_unanswered%' AS restates_rule,
       pg_get_viewdef(('public.'||viewname)::regclass) LIKE '%_primary_studio_for%' AS inlines_resolver
  FROM pg_views WHERE schemaname='public' AND viewname IN ('people_directory','v_project_roster');
