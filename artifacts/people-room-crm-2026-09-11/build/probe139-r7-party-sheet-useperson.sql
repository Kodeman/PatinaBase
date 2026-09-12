-- r7 probe D: usePerson(<seat id>, <party_kind>) after v4
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

\echo '=== the seats the Call Sheet chevron passes as partyId (stamped seats on the live job) ==='
SELECT pp.id AS party_id, pp.party_kind, pp.display_name, pp.studio_contact_id IS NOT NULL AS carded,
       public.channel_consent_status('b0000000-0000-0000-0000-000000000001','sms',pp.phone_e164) AS the_record_says
  FROM public.project_parties pp
 WHERE pp.project_id='d0e00000-0000-0000-0000-00000000000a'
   AND pp.party_kind IN ('gc','sub','installer','receiver','architect','photographer','stager')
 ORDER BY pp.display_name LIMIT 6;

\echo '=== usePerson(seat_id, role): does people_directory hold a row at that person_id? ==='
SELECT pp.display_name, pp.party_kind,
       (SELECT count(*) FROM public.people_directory pd
         WHERE pd.person_id = pp.id AND pd.role = pp.party_kind) AS rows_usePerson_would_get
  FROM public.project_parties pp
 WHERE pp.project_id='d0e00000-0000-0000-0000-00000000000a'
   AND pp.party_kind IN ('gc','sub','installer','receiver','architect','photographer','stager')
 ORDER BY pp.display_name LIMIT 8;

\echo '=== the worst case: Pete Rusk, whose record says opted_out ==='
SELECT pp.id AS seat_id, pp.display_name, pp.phone_e164,
       public.channel_consent_status('b0000000-0000-0000-0000-000000000001','sms',pp.phone_e164) AS record_word,
       (SELECT count(*) FROM public.people_directory pd WHERE pd.person_id = pp.id AND pd.role = pp.party_kind)
         AS sheet_finds_a_row
  FROM public.project_parties pp
 WHERE pp.display_name ILIKE '%Pete Rusk%';

\echo '=== and what the card row (the one the view DOES return) carries in status_raw ==='
SELECT person_id, role, display_name, status_raw, consent_status
  FROM public.people_directory
 WHERE display_name ILIKE '%Pete Rusk%';
ROLLBACK;
