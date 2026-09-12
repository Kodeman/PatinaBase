\set ON_ERROR_STOP on
\pset pager off
BEGIN;
ALTER TABLE project_parties DISABLE TRIGGER set_updated_at_project_parties;
-- one uncarded human, keyed on the phone. The NEWER seat is a `vendor`
-- (outside people_directory's seven kinds); the older is a `sub` (inside).
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone, phone_e164, updated_at)
VALUES ('11111111-0000-0000-0000-00000000aaaa','d0e00000-0000-0000-0000-00000000000a','sub','Zeb Mixedkind','+16125559901','+16125559901', now() - interval '9 days'),
       ('11111111-0000-0000-0000-00000000bbbb','b0000000-0000-0000-0000-00000000c0d1','vendor','Zeb Mixedkind','+16125559901','+16125559901', now());
ALTER TABLE project_parties ENABLE TRIGGER set_updated_at_project_parties;

SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';

\echo '=== updated_at as stored ==='
SELECT id, party_kind, updated_at FROM project_parties WHERE display_name='Zeb Mixedkind' ORDER BY updated_at;

\echo '=== people_directory row (DISTINCT ON, restricted to the seven kinds) ==='
SELECT person_id, role, seat_count FROM people_directory WHERE display_name='Zeb Mixedkind';

\echo '=== people_directory_seats (first_value over EVERY kind) ==='
SELECT seat_id, person_id, party_kind FROM people_directory_seats WHERE display_name='Zeb Mixedkind' ORDER BY party_kind;

\echo '=== the join W2 is meant to make ==='
SELECT d.person_id AS dir_person, d.seat_count AS claims, count(s.seat_id) AS nests
  FROM people_directory d LEFT JOIN people_directory_seats s ON s.person_id=d.person_id
 WHERE d.display_name='Zeb Mixedkind' GROUP BY 1,2;
ROLLBACK;
