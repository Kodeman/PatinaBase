\pset pager off
BEGIN;
SET LOCAL role postgres;
\echo '=== J. v_access_grants tiers (as postgres) ==='
SELECT count(DISTINCT tier) AS tiers, count(*) AS rows FROM public.v_access_grants;
SELECT count(*) AS hexlike_grant_ids FROM public.v_access_grants WHERE grant_id ~ '[0-9a-f]{64}';
SELECT DISTINCT tier FROM public.v_access_grants ORDER BY 1;

\echo ''
\echo '=== K. as designer@patina.dev: reader-vs-record sweeps ==='
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';

SELECT role, count(*) FROM public.people_directory GROUP BY 1 ORDER BY 1;
SELECT meta->>'entity_kind' AS entity_kind, count(*) FROM public.people_directory
 WHERE role='contact' GROUP BY 1 ORDER BY 1;

\echo '-- contact rows whose consent word <> identity_consent_status recomputed --'
SELECT count(*) AS mismatches FROM public.people_directory d
  JOIN public.studio_contacts sc ON sc.id = d.person_id
 WHERE d.role='contact'
   AND d.consent_status IS DISTINCT FROM
       public.identity_consent_status(sc.organization_id, sc.id::text, sc.phone_e164);

\echo '-- identity paper word vs its own seat lines --'
SELECT count(*) AS paper_disagreements
  FROM public.people_directory d
  JOIN public.people_directory_seats s ON s.person_id = d.person_id
 WHERE d.paper_state IS DISTINCT FROM s.paper_state;

\echo '-- identity consent word vs its own seat lines (where the seat has a word) --'
SELECT d.display_name, d.consent_status AS identity_word, s.consent_status AS seat_word, s.project_name
  FROM public.people_directory d
  JOIN public.people_directory_seats s ON s.person_id = d.person_id
 WHERE s.consent_status IS NOT NULL
   AND d.consent_status IS DISTINCT FROM s.consent_status
 ORDER BY 1;

\echo '-- rows claiming a seat_count they cannot nest --'
SELECT count(*) AS bad_counts FROM (
  SELECT d.person_id, d.seat_count, (SELECT count(*) FROM public.people_directory_seats s
     WHERE s.person_id = d.person_id) AS nested
    FROM public.people_directory d) x
 WHERE x.seat_count <> x.nested;

\echo '-- anyone whose Directory word says granted while ANY of their numbers is refused --'
SELECT d.display_name, d.consent_status, n.v AS number,
       public.channel_consent_status('b0000000-0000-0000-0000-000000000001','sms',n.v) AS record_word
  FROM public.people_directory d
  JOIN public.studio_contacts sc ON sc.id = d.person_id
  CROSS JOIN LATERAL public.identity_phone_numbers(sc.organization_id, sc.id::text, sc.phone_e164) AS n(v)
 WHERE d.role='contact'
   AND d.consent_status IN ('granted','not_asked','pending')
   AND public.channel_consent_status(sc.organization_id,'sms',n.v) = 'opted_out';

\echo ''
\echo '=== L. compliance_state: the 30-day boundary both ways ==='
SET LOCAL role postgres;
SELECT sc.id INTO TEMP t_holder FROM public.studio_contacts sc
 WHERE sc.organization_id='b0000000-0000-0000-0000-000000000001' AND sc.entity_kind='company'
 ORDER BY sc.created_at LIMIT 1;
ROLLBACK;
