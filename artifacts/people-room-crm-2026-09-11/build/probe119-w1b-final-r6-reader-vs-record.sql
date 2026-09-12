-- probe119 — r6: does ANY reader disagree with the consent RECORD, or claim a
-- count it cannot nest, for either of the seeded studio's two members?
\set ON_ERROR_STOP on
\set OWNER  '''a0000000-0000-0000-0000-000000000004'''
\set ADMIN  '''a0000000-0000-0000-0000-000000000003'''
\set ORG    '''b0000000-0000-0000-0000-000000000001'''
BEGIN;

\echo '=== the record, as postgres (ground truth) ==='
SELECT organization_id, channel_value, status, refusal_unanswered,
       public.channel_consent_status(organization_id,'sms',channel_value) AS verdict,
       consented_at::date, opt_out_at::date
  FROM public.studio_channel_consent ORDER BY channel_value;

\echo '=== ground truth: identity -> worst-first verdict over every number, as postgres ==='
CREATE TEMP TABLE truth AS
SELECT sc.id AS card_id, COALESCE(sc.full_name, sc.company_name) AS nm,
       public.identity_consent_status(sc.organization_id, sc.id::text, sc.phone_e164) AS word,
       public.identity_paper_state(sc.id, sc.company_id) AS paper
  FROM public.studio_contacts sc WHERE sc.organization_id = :ORG;

\echo '--- and every seat number, with the record verdict, as postgres'
CREATE TEMP TABLE seat_truth AS
SELECT pp.id AS seat_id, pp.display_name, pp.phone_e164,
       public.channel_consent_status(public.project_consent_org(pp.project_id),'sms',pp.phone_e164) AS rec
  FROM public.project_parties pp;
GRANT SELECT ON truth, seat_truth TO authenticated;

\echo ''
\echo '################ AS THE OWNER ################'
SELECT set_config('request.jwt.claims', json_build_object('sub', :OWNER, 'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;

\echo '-- A1: any contacts-branch row whose consent word differs from the worst-first truth?'
SELECT count(*) AS mismatches FROM public.people_directory pd
  JOIN truth t ON t.card_id = pd.person_id
 WHERE pd.role='contact' AND pd.consent_status IS DISTINCT FROM t.word;

\echo '-- A2: any contacts-branch row whose paper word differs from the truth?'
SELECT count(*) AS paper_mismatches FROM public.people_directory pd
  JOIN truth t ON t.card_id = pd.person_id
 WHERE pd.role='contact' AND pd.paper_state IS DISTINCT FROM t.paper;

\echo '-- A3: any row reading a PERMISSIVE word over a number the record refuses?'
SELECT pd.display_name, pd.consent_status, st.phone_e164, st.rec
  FROM public.people_directory pd
  JOIN public.people_directory_seats s ON s.person_id = pd.person_id
  JOIN seat_truth st ON st.seat_id = s.seat_id
 WHERE st.rec = 'opted_out' AND pd.consent_status IN ('granted','pending','not_asked');

\echo '-- A4: any SEAT line reading a permissive word over its own refused number?'
SELECT s.display_name, s.phone_e164, s.consent_status, st.rec
  FROM public.people_directory_seats s JOIN seat_truth st ON st.seat_id = s.seat_id
 WHERE st.rec IS DISTINCT FROM s.consent_status;

\echo '-- A5: any row claiming a seat_count it cannot nest?'
SELECT count(*) AS rows_overclaiming FROM (
  SELECT pd.person_id, pd.seat_count,
         (SELECT count(*) FROM public.people_directory_seats s WHERE s.person_id = pd.person_id) AS nested
    FROM public.people_directory pd) x
 WHERE x.seat_count <> x.nested;

\echo '-- A6: a dated consent claim beside a refusal (R-Q composability)'
SELECT display_name, consent_status, meta->>'sms_consented_at' AS consented, meta->>'sms_opt_out_at' AS opted
  FROM public.people_directory
 WHERE consent_status = 'opted_out' AND meta->>'sms_consented_at' IS NOT NULL;

\echo '-- A7: total row counts by role'
SELECT role, count(*) FROM public.people_directory GROUP BY role ORDER BY role;

RESET ROLE;
\echo ''
\echo '################ AS THE ADMIN (studio_manager) ################'
SELECT set_config('request.jwt.claims', json_build_object('sub', :ADMIN, 'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
\echo '-- B1/B2: same two mismatch counts'
SELECT (SELECT count(*) FROM public.people_directory pd JOIN truth t ON t.card_id=pd.person_id
         WHERE pd.role='contact' AND pd.consent_status IS DISTINCT FROM t.word) AS consent_mismatch,
       (SELECT count(*) FROM public.people_directory pd JOIN truth t ON t.card_id=pd.person_id
         WHERE pd.role='contact' AND pd.paper_state IS DISTINCT FROM t.paper)   AS paper_mismatch,
       (SELECT count(*) FROM public.people_directory_seats s JOIN seat_truth st ON st.seat_id=s.seat_id
         WHERE st.rec IS DISTINCT FROM s.consent_status)                        AS seat_mismatch;
\echo '-- B3: rows/seats the admin reads'
SELECT (SELECT count(*) FROM public.people_directory) AS dir,
       (SELECT count(*) FROM public.people_directory_seats) AS seats,
       (SELECT count(*) FROM public.project_site_access_cards) AS cards,
       (SELECT count(*) FROM public.project_party_authority) AS authority,
       (SELECT count(*) FROM public.studio_compliance_documents) AS docs;
RESET ROLE;

\echo ''
\echo '################ AS A FOREIGN STUDIO OWNER (Phase One Synthetic) ################'
SELECT set_config('request.jwt.claims', json_build_object('sub','cf100000-0000-4000-8000-000000000001','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT (SELECT count(*) FROM public.people_directory)               AS dir,
       (SELECT count(*) FROM public.people_directory_seats)          AS seats,
       (SELECT count(*) FROM public.project_site_access_cards)       AS cards,
       (SELECT count(*) FROM public.project_party_authority)         AS authority,
       (SELECT count(*) FROM public.studio_compliance_documents)     AS docs,
       (SELECT count(*) FROM public.v_access_grants)                 AS grants;
\echo '-- the r5 BLOCKING-1 oracle, replayed by naming MY OWN org with a foreign key'
SELECT count(*) AS foreign_numbers FROM public.identity_phone_numbers(
  'cf120000-0000-4000-8000-000000000001',
  (SELECT id::text FROM public.studio_contacts WHERE organization_id = 'b0000000-0000-0000-0000-000000000001' AND phone_e164 IS NOT NULL LIMIT 1), NULL);
RESET ROLE;

\echo ''
\echo '################ AS A CLIENT ACCOUNT ################'
SELECT set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000005','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT (SELECT count(*) FROM public.project_site_access_cards)   AS cards,
       (SELECT count(*) FROM public.project_party_authority)     AS authority,
       (SELECT count(*) FROM public.people_directory_seats)      AS seats,
       (SELECT count(*) FROM public.studio_compliance_documents) AS docs;
RESET ROLE;
ROLLBACK;
