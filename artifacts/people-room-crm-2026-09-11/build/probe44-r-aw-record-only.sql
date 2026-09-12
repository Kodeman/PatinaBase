-- probe44-r-aw-record-only.sql — objects and access only, never the ledger.
\pset pager off

\echo '— 1. no consent RPC reads a frozen seat column (R-AW.2/.4)'
SELECT p.proname,
       (regexp_replace(regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g'),
                       '\s+', ' ', 'g') LIKE '%sms_consent_%')  AS reads_seat_col,
       (regexp_replace(regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g'),
                       '\s+', ' ', 'g') LIKE '%project_parties%') AS reads_seats
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
 WHERE ns.nspname = 'public'
   AND p.proname IN ('record_channel_consent','record_channel_invite',
                     'record_channel_reconsent','channel_consent_status',
                     'backfill_channel_consent_from_parties')
 ORDER BY p.proname;

\echo '— 2. channel_consent_status folds status + refusal_unanswered, and nothing else (R-AW.3)'
SELECT prosecdef AS security_definer, provolatile, proconfig, proacl
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
 WHERE ns.nspname = 'public' AND p.proname = 'channel_consent_status';
SELECT regexp_replace(prosrc, '\s+', ' ', 'g') AS body
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
 WHERE ns.nspname = 'public' AND p.proname = 'channel_consent_status';

\echo '— 3. the release trigger has moved onto the record (R-AW.5)'
SELECT c.relname AS on_table, tg.tgname, pg_get_triggerdef(tg.oid) AS def
  FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
 WHERE tg.tgname = 'site_request_consent_granted_dispatch';

\echo '— 4. project_parties'' triggers after 00622'
SELECT tg.tgname, tg.tgtype
  FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
 WHERE c.relname = 'project_parties' AND NOT tg.tgisinternal
 ORDER BY tg.tgname;

\echo '— 5. the site-request rail: who still reads the frozen seat for a verdict'
SELECT p.proname,
       (regexp_replace(regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g'),
                       '\s+', ' ', 'g') LIKE '%sms_consent_status%') AS reads_seat_verdict
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
 WHERE ns.nspname = 'public'
   AND p.proname IN ('site_request_send','site_request_resend',
                     'site_request_dispatch_after_consent',
                     '_site_request_consent_granted_dispatch',
                     'fc_dispatch_court_assignment','fc_dispatch_task_assignment',
                     'fc_dispatch_optin_invite')
 ORDER BY p.proname;

\echo '— 6. grants on everything 00622 redefined'
SELECT p.proname, p.proacl
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
 WHERE ns.nspname = 'public'
   AND p.proname IN ('record_channel_consent','site_request_send',
                     'site_request_dispatch_after_consent',
                     '_site_request_consent_granted_dispatch')
 ORDER BY p.proname;
