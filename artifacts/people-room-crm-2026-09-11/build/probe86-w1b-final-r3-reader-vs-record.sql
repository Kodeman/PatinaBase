\pset pager off
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';

\echo '=== 1. no Directory row is MORE PERMISSIVE than the record for any number it carries ==='
WITH rows AS (
  SELECT d.person_id, d.display_name, d.consent_status AS face,
         n.v AS number,
         public.channel_consent_status('b0000000-0000-0000-0000-000000000001','sms', n.v) AS record
    FROM public.people_directory d
    CROSS JOIN LATERAL (
      SELECT NULLIF(btrim(sc.phone_e164),'') AS v FROM public.studio_contacts sc WHERE sc.id = d.person_id
      UNION
      SELECT NULLIF(btrim(pp.phone_e164),'') FROM public.project_parties pp
       WHERE public.party_identity_key(pp.studio_contact_id, pp.profile_id, pp.phone_e164, pp.email, pp.id) = d.person_id::text
    ) n
   WHERE d.role='contact' AND n.v IS NOT NULL
)
SELECT count(*) AS pairs,
       count(*) FILTER (WHERE record = 'opted_out' AND face <> 'opted_out') AS face_hides_a_refusal,
       count(*) FILTER (WHERE face = 'granted' AND COALESCE(record,'not_asked') <> 'granted') AS face_overstates
  FROM rows;

\echo '=== 2. no seat line is more permissive than the record ==='
SELECT count(*) AS seats,
       count(*) FILTER (WHERE ps.consent_status='granted'
         AND COALESCE(public.channel_consent_status(public.project_consent_org(ps.project_id),'sms',ps.phone_e164),'not_asked') <> 'granted') AS seat_overstates
  FROM public.people_directory_seats ps;

\echo '=== 3. Pete Rusk, the refusal, on every surface ==='
SELECT d.display_name, d.consent_status AS directory_word, d.reach_state, d.paper_state, d.seat_count
  FROM public.people_directory d WHERE d.display_name = 'Pete Rusk';
SELECT ps.display_name, ps.project_name, ps.consent_status AS seat_word, ps.phone_e164
  FROM public.people_directory_seats ps WHERE ps.display_name = 'Pete Rusk';
SELECT channel_value, status, refusal_unanswered, opt_out_at
  FROM public.studio_channel_consent WHERE channel_value='+16125550112';

\echo '=== 4. the consent DATES on the face: carded humans (MINOR-26 re-check) ==='
SELECT d.display_name, d.consent_status,
       d.meta->>'sms_consented_at' AS meta_consented_at,
       d.meta->>'sms_opt_out_at'   AS meta_opt_out_at
  FROM public.people_directory d
 WHERE d.consent_status IS NOT NULL AND d.consent_status <> 'not_asked'
 ORDER BY d.display_name;

\echo '=== 5. people_directory reachable by anon? (MINOR-7 re-check) ==='
RESET role;
SET LOCAL role anon;
SELECT count(*) AS anon_directory_rows FROM public.people_directory;
ROLLBACK;
