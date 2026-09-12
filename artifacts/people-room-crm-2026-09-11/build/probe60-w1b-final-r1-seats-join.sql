\set ON_ERROR_STOP on
\pset pager off
BEGIN;
-- fixture as postgres, then read as the designer
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone, phone_e164)
VALUES ('11111111-0000-0000-0000-000000000001','d0e00000-0000-0000-0000-00000000000a','sub','Zeb Mixedkind','+16125559901','+16125559901'),
       ('11111111-0000-0000-0000-000000000002','b0000000-0000-0000-0000-00000000c0d1','vendor','Zeb Mixedkind','+16125559901','+16125559901');
UPDATE project_parties SET updated_at = now() - interval '2 days' WHERE id='11111111-0000-0000-0000-000000000001';
UPDATE project_parties SET updated_at = now()                     WHERE id='11111111-0000-0000-0000-000000000002';

SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';

\echo '=== P1a: the Directory row for the uncarded mixed-kind identity ==='
SELECT person_id, role, display_name, project_id, seat_count
  FROM people_directory WHERE display_name = 'Zeb Mixedkind';

\echo '=== P1b: the seats view rows for the same human ==='
SELECT seat_id, person_id, party_kind, project_name
  FROM people_directory_seats WHERE display_name = 'Zeb Mixedkind' ORDER BY party_kind;

\echo '=== P1c: does the join nest anything? ==='
SELECT d.person_id AS dir_person, count(s.seat_id) AS seats_nested
  FROM people_directory d
  LEFT JOIN people_directory_seats s ON s.person_id = d.person_id
 WHERE d.display_name = 'Zeb Mixedkind'
 GROUP BY 1;
ROLLBACK;

-- ─────────────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
\echo '=== P4: the seeded fixture — does every Directory row nest its own seats? ==='
SELECT d.role, count(*) AS dir_rows,
       sum(d.seat_count) AS claimed_seats,
       sum((SELECT count(*) FROM people_directory_seats s WHERE s.person_id = d.person_id)) AS nested_seats
  FROM people_directory d GROUP BY 1 ORDER BY 1;

\echo '=== P5: seats whose person_id matches NO people_directory row ==='
SELECT s.party_kind, count(*) AS orphan_seats
  FROM people_directory_seats s
 WHERE NOT EXISTS (SELECT 1 FROM people_directory d WHERE d.person_id = s.person_id)
 GROUP BY 1 ORDER BY 2 DESC;

\echo '=== P6: Directory rows claiming seat_count > 0 that nest zero ==='
SELECT d.person_id, d.role, d.display_name, d.seat_count
  FROM people_directory d
 WHERE d.seat_count > 0
   AND NOT EXISTS (SELECT 1 FROM people_directory_seats s WHERE s.person_id = d.person_id)
 ORDER BY d.display_name;
ROLLBACK;
