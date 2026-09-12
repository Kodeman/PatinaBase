\pset pager off
BEGIN;
INSERT INTO public.project_parties
  (project_id, party_kind, display_name, profile_id, email, stage)
VALUES ('d0e00000-0000-0000-0000-00000000000b','client_rep','Client User (rep seat)',
        'a0000000-0000-0000-0000-000000000005','rep-a0000000@example.test','active'),
       ('d0e00000-0000-0000-0000-00000000000b','other','Client User (second rep seat)',
        'a0000000-0000-0000-0000-000000000005','rep-a0000000@example.test','active');

SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';

\echo '=== the CLIENT Directory row for that household: claimed vs nested ==='
SELECT d.role, d.display_name, d.person_id, d.seat_count,
       (SELECT count(*) FROM public.people_directory_seats ps WHERE ps.person_id = d.person_id) AS nested
  FROM public.people_directory d
 WHERE d.person_id = '5faef857-2b96-4a68-8e83-6d999994464c';

\echo '=== where those two seats nest (person_id in the seats view) ==='
SELECT ps.person_id, ps.seat_id, ps.party_kind, ps.display_name, ps.identity_key
  FROM public.people_directory_seats ps
 WHERE ps.identity_key = 'a0000000-0000-0000-0000-000000000005';

\echo '=== does ANY Directory row carry that person_id? ==='
SELECT count(*) AS directory_rows_that_nest_them
  FROM public.people_directory d
 WHERE d.person_id IN (SELECT ps.person_id FROM public.people_directory_seats ps
                        WHERE ps.identity_key = 'a0000000-0000-0000-0000-000000000005');

\echo '=== whole-fixture invariant now ==='
SELECT count(*) FILTER (WHERE d.seat_count <> COALESCE(s.nested,0)) AS rows_where_count_disagrees,
       count(*) AS total_rows
  FROM public.people_directory d
  LEFT JOIN LATERAL (SELECT count(*)::int AS nested FROM public.people_directory_seats ps
                      WHERE ps.person_id = d.person_id) s ON true;
ROLLBACK;
