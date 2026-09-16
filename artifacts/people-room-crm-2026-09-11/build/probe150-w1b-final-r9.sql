\pset pager off
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p uuid) RETURNS void AS $$
BEGIN PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated'; END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS void AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims',NULL,true); END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

\echo '=== the 2 orphan seats ==='
SELECT s.person_id, s.seat_id, s.party_kind, s.display_name, s.project_name, s.studio_contact_id, s.phone_e164
  FROM public.people_directory_seats s
 WHERE NOT EXISTS (SELECT 1 FROM public.people_directory d WHERE d.person_id = s.person_id);

\echo '=== carded persons: directory word vs the per-number record verdicts ==='
SELECT d.display_name, d.consent_status AS directory_word, x.per_number
  FROM public.people_directory d
  LEFT JOIN LATERAL (
    SELECT string_agg(n.v || '=' || COALESCE(public.channel_consent_status('b0000000-0000-0000-0000-000000000001','sms', n.v),'<norec>'), ' ' ORDER BY n.v) AS per_number
      FROM public.identity_phone_numbers('b0000000-0000-0000-0000-000000000001', d.person_id::text,
            (SELECT sc.phone_e164 FROM public.studio_contacts sc WHERE sc.id = d.person_id)) AS n(v)
  ) x ON true
 WHERE d.role='contact' AND d.consent_status IS NOT NULL
 ORDER BY 1;

\echo '=== every seat row: consent_status vs the record for that number ==='
SELECT s.display_name, s.project_name, s.phone_e164, s.consent_status AS seat_word,
       COALESCE(public.channel_consent_status(public.project_consent_org(s.project_id),'sms',s.phone_e164),'<norec>') AS record_says
  FROM public.people_directory_seats s
 WHERE s.phone_e164 IS NOT NULL
   AND COALESCE(s.consent_status,'~') IS DISTINCT FROM
       COALESCE(public.channel_consent_status(public.project_consent_org(s.project_id),'sms',s.phone_e164),'not_asked')
 ORDER BY 1;

\echo '=== identity word softer than any seat word for the same human? (fail-open hunt) ==='
WITH ord AS (SELECT * FROM (VALUES ('opted_out',1),('not_asked',2),('pending',3),('granted',4)) v(w,r))
SELECT d.display_name, d.consent_status AS identity_word,
       min(os.r) AS worst_seat_rank, min(s.consent_status) AS a_seat_word
  FROM public.people_directory d
  JOIN public.people_directory_seats s ON s.person_id = d.person_id
  JOIN ord os ON os.w = s.consent_status
  JOIN ord od ON od.w = d.consent_status
 GROUP BY d.display_name, d.consent_status, od.r
HAVING od.r > min(os.r)
 ORDER BY 1;

\echo '=== v_project_roster consent word vs 00626 seat word, same seat ==='
SELECT r.display_name, r.sms_consent_status AS roster_word, s.consent_status AS seats_word, s.project_name
  FROM public.v_project_roster r
  JOIN public.people_directory_seats s ON s.seat_id = r.party_id
 WHERE COALESCE(r.sms_consent_status,'<null>') IS DISTINCT FROM COALESCE(s.consent_status,'<null>')
 ORDER BY 1;

\echo '=== paper word: identity_paper_state vs the two compliance_state calls ==='
SELECT d.display_name, d.paper_state,
       public.compliance_state(d.person_id) AS own_card,
       public.compliance_state((d.meta->>'company_id')::uuid) AS firm
  FROM public.people_directory d
 WHERE d.role='contact'
   AND d.paper_state IS DISTINCT FROM public.identity_paper_state(d.person_id, (d.meta->>'company_id')::uuid)
 ORDER BY 1;

SELECT pg_temp.reset_role();
ROLLBACK;
