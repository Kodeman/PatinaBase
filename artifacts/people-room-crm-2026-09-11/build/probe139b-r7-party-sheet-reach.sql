BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

\echo '=== how many of the studio''s seats can the shipped party sheet still open? ==='
SELECT count(*) AS seats_of_the_seven_kinds,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM public.people_directory pd
          WHERE pd.person_id = s.seat_id AND pd.role = s.party_kind)) AS usePerson_finds_a_row,
       count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM public.people_directory pd
          WHERE pd.person_id = s.seat_id AND pd.role = s.party_kind)) AS sheet_opens_empty
  FROM public.people_directory_seats s
 WHERE public.party_kind_in_directory(s.party_kind);

\echo '=== the seats whose record refuses texts, and what the sheet would print ==='
SELECT s.display_name, s.phone_e164, s.consent_status AS seat_line_word,
       (SELECT pd.consent_status FROM public.people_directory pd WHERE pd.person_id = s.studio_contact_id) AS card_row_word,
       CASE WHEN EXISTS (SELECT 1 FROM public.people_directory pd
                          WHERE pd.person_id = s.seat_id AND pd.role = s.party_kind)
            THEN 'row found' ELSE 'no row -> chip falls back to Not asked' END AS what_the_sheet_reads
  FROM public.people_directory_seats s
 WHERE s.consent_status = 'opted_out';
ROLLBACK;
