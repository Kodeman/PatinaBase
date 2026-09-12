-- probe52 — final-run review r2: objects, access, and the frozen-column sweep.
-- Objects only; the ledger is never read.
\set ON_ERROR_STOP on
\pset pager off

\echo '== 1. every function whose SOURCE still mentions a frozen consent column =='
SELECT p.proname,
       p.prosecdef                                   AS definer,
       p.provolatile,
       (p.prosrc ~ 'sms_consent_status')             AS reads_status,
       (p.prosrc ~ 'sms_consent_(source|evidence|recorded_at|recorded_by|disclosure_version)') AS reads_evidence,
       (p.prosrc ~ 'sms_(consented_at|opt_out_at)')  AS reads_dates
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.prosrc ~ 'sms_consent_|sms_opt_out_at|sms_consented_at'
 ORDER BY 1;

\echo '== 2. every VIEW whose definition still mentions a frozen consent column =='
SELECT c.relname,
       (pg_get_viewdef(c.oid) ~ 'sms_consent_status')            AS reads_status,
       (pg_get_viewdef(c.oid) ~ 'sms_consented_at|sms_opt_out_at') AS reads_dates,
       (pg_get_viewdef(c.oid) ~ 'channel_consent_status')        AS reads_record
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('v','m')
   AND pg_get_viewdef(c.oid) ~ 'sms_consent_|sms_opt_out_at|sms_consented_at|channel_consent_status'
 ORDER BY 1;

\echo '== 3. the consent objects: definer / volatility / search_path / ACL =='
SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS fn,
       p.prosecdef AS definer, p.provolatile AS vol,
       COALESCE(array_to_string(p.proconfig,','),'<none>') AS cfg,
       COALESCE(array_to_string(p.proacl::text[],' '),'<default>') AS acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
   AND p.proname IN ('channel_consent_status','project_consent_org',
        'record_channel_consent','record_channel_invite','record_channel_reconsent',
        'backfill_channel_consent_from_parties','refuse_legacy_consent_write',
        'site_request_send','site_request_resend','site_request_dispatch_after_consent',
        '_site_request_consent_granted_dispatch',
        'fc_dispatch_court_assignment','fc_dispatch_task_assignment',
        'fc_dispatch_optin_invite','normalize_channel_value')
 ORDER BY 1;

\echo '== 4. studio_channel_consent: RLS, policies, table ACL =='
SELECT relrowsecurity AS rls_on, relforcerowsecurity AS rls_forced,
       COALESCE(array_to_string(relacl::text[],' '),'<default>') AS acl
  FROM pg_class WHERE oid='public.studio_channel_consent'::regclass;
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr,
       (SELECT array_agg(r.rolname) FROM pg_roles r WHERE r.oid = ANY(pol.polroles)) AS roles
  FROM pg_policy pol WHERE polrelid='public.studio_channel_consent'::regclass ORDER BY 1;

\echo '== 5. triggers on project_parties and studio_channel_consent =='
SELECT c.relname AS tbl, t.tgname,
       pg_get_triggerdef(t.oid) AS def
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 WHERE c.relname IN ('project_parties','studio_channel_consent') AND NOT t.tgisinternal
 ORDER BY 1,2;

\echo '== 6. the two views the room prints: do they reach the record? =='
SELECT 'v_project_roster' AS v,
       (pg_get_viewdef('public.v_project_roster'::regclass) ~ 'channel_consent_status') AS record,
       (pg_get_viewdef('public.v_project_roster'::regclass) ~ 'sms_consent_status') AS seat
UNION ALL SELECT 'people_directory',
       (pg_get_viewdef('public.people_directory'::regclass) ~ 'channel_consent_status'),
       (pg_get_viewdef('public.people_directory'::regclass) ~ 'pp.sms_consent_status')
UNION ALL SELECT 'field_activity_summary',
       (pg_get_viewdef('public.field_activity_summary'::regclass) ~ 'channel_consent_status'),
       (pg_get_viewdef('public.field_activity_summary'::regclass) ~ 'sms_consent_status');

\echo '== 7. the eight legacy column comments =='
SELECT a.attname, left(col_description(a.attrelid, a.attnum), 46) AS comment
  FROM pg_attribute a
 WHERE a.attrelid='public.project_parties'::regclass
   AND a.attname LIKE 'sms_%' AND a.attnum>0 ORDER BY 1;

\echo '== 8. the suppression flag nobody sets =='
SELECT count(*) AS fns_reading_suppress_flag FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosrc ~ 'suppress_consent_dispatch';
SELECT count(*) AS mirror_fn FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='mirror_channel_consent_to_parties';
