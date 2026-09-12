\pset pager off
BEGIN;
INSERT INTO public.project_parties
  (project_id, party_kind, display_name, profile_id, email, stage)
VALUES ('d0e00000-0000-0000-0000-00000000000b','client_rep','Client User (rep seat)',
        'a0000000-0000-0000-0000-000000000005','rep-a@example.test','active'),
       ('d0e00000-0000-0000-0000-00000000000b','other','Client User (second rep seat)',
        'a0000000-0000-0000-0000-000000000005','rep-a@example.test','active'),
  -- a teammate with a login, seated as an `other` party on the same job
       ('d0e00000-0000-0000-0000-00000000000b','other','Studio Manager (walkthrough seat)',
        'a0000000-0000-0000-0000-000000000003','sm@example.test','active');

SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';

\echo '=== every disagreeing row, named ==='
SELECT d.role, d.display_name, d.person_id, d.seat_count, COALESCE(s.nested,0) AS nested
  FROM public.people_directory d
  LEFT JOIN LATERAL (SELECT count(*)::int AS nested FROM public.people_directory_seats ps
                      WHERE ps.person_id = d.person_id) s ON true
 WHERE d.seat_count <> COALESCE(s.nested,0)
 ORDER BY d.role, d.display_name;
ROLLBACK;
