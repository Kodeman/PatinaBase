BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

\echo '=== studio_channel_consent: grants + policies (can W2 read the dates directly?) ==='
SELECT grantee, string_agg(privilege_type,',' ORDER BY privilege_type)
  FROM information_schema.role_table_grants WHERE table_name='studio_channel_consent' GROUP BY 1;
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename='studio_channel_consent';

SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
\echo ''
\echo '=== Chidi Okonkwo: where does his client_rep seat nest? ==='
SELECT d.display_name, d.role, d.person_id, d.seat_count FROM public.people_directory d WHERE d.display_name ILIKE 'Chidi%';
SELECT s.display_name, s.party_kind, s.person_id, s.project_name,
       EXISTS (SELECT 1 FROM public.people_directory d WHERE d.person_id=s.person_id) AS nests_under_a_row
  FROM public.people_directory_seats s WHERE s.display_name ILIKE 'Chidi%';
\echo ''
\echo '=== Adaeze: the client Directory row vs any client seat ==='
SELECT d.display_name, d.role, d.person_id, d.seat_count FROM public.people_directory d WHERE d.display_name ILIKE 'Adaeze%';
SELECT s.display_name, s.party_kind, s.person_id FROM public.people_directory_seats s WHERE s.display_name ILIKE 'Adaeze%' OR s.party_kind='client';
\echo ''
\echo '=== every client-branch row: can ANY seat ever nest under it? (person_id = designer_clients.id) ==='
SELECT count(*) AS client_rows, count(*) FILTER (WHERE seat_count > 0) AS client_rows_claiming_seats
  FROM public.people_directory WHERE role='client';
\echo ''
\echo '=== create_field_link: does an explicit caller date beat the window? (PR-l) ==='
SELECT pp.display_name, pp.on_site_to, pp.warranty_until
  FROM public.project_parties pp WHERE pp.display_name='Erin Sato' ORDER BY 1;
ROLLBACK;
