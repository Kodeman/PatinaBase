-- R-AS close-out probe: the record is the single source.
-- Objects and access only — never the ledger.
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
--     -f artifacts/people-room-crm-2026-09-11/build/probe27-ras-single-source.sql
\pset pager off

\echo '— 1. the mirror is gone (function + trigger)'
SELECT 'mirror_fn'  AS object, count(*) AS n FROM pg_proc pr
  JOIN pg_namespace ns ON ns.oid = pr.pronamespace
 WHERE ns.nspname='public' AND pr.proname='mirror_channel_consent_to_parties'
UNION ALL
SELECT 'mirror_trg', count(*) FROM pg_trigger
 WHERE tgrelid='public.studio_channel_consent'::regclass AND NOT tgisinternal
   AND tgname='mirror_channel_consent_to_parties_trg'
UNION ALL
SELECT 'fns_reading_suppress_flag', count(*) FROM pg_proc pr
  JOIN pg_namespace ns ON ns.oid = pr.pronamespace
 WHERE ns.nspname='public' AND pr.prosrc LIKE '%suppress_consent_dispatch%';

\echo '— 2. project_parties'' triggers: the shipped two, unguarded, plus the freeze'
SELECT tgname, pg_get_triggerdef(oid) LIKE '%BEFORE UPDATE OF%' AS before_update_of
  FROM pg_trigger
 WHERE tgrelid='public.project_parties'::regclass AND NOT tgisinternal
 ORDER BY tgname;

\echo '— 3. the two shipped trigger functions carry their shipped bodies'
SELECT proname,
       prosrc LIKE '%suppress_consent_dispatch%' AS still_guarded
  FROM pg_proc pr JOIN pg_namespace ns ON ns.oid=pr.pronamespace
 WHERE ns.nspname='public'
   AND proname IN ('fc_dispatch_optin_invite','_site_request_consent_granted_dispatch')
 ORDER BY proname;

\echo '— 4. channel_consent_status: invoker, stable, granted to authenticated only'
SELECT p.proname, p.prosecdef AS security_definer, p.provolatile, p.proacl::text
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('channel_consent_status','refuse_legacy_consent_write')
 ORDER BY p.proname;

\echo '— 5. both shipped readers go through it, and neither reads the frozen column'
SELECT viewname,
       definition ILIKE '%channel_consent_status%' AS reads_record,
       definition ILIKE '%pp.sms_consent_status%'  AS still_reads_seat
  FROM pg_views
 WHERE schemaname='public' AND viewname IN ('v_project_roster','people_directory')
 ORDER BY viewname;

\echo '— 6. the legacy columns say what they are'
SELECT a.attname,
       left(col_description(a.attrelid, a.attnum), 34) AS comment_head
  FROM pg_attribute a
 WHERE a.attrelid='public.project_parties'::regclass
   AND a.attname LIKE 'sms_%'
 ORDER BY a.attname;

\echo '— 7. studio_channel_consent write access: the RPCs are the only door'
SELECT relname, relacl::text FROM pg_class
 WHERE relname='studio_channel_consent' AND relnamespace='public'::regnamespace;
