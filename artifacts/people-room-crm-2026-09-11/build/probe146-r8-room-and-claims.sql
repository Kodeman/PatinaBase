\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';

SELECT role, count(*) FROM public.people_directory GROUP BY role ORDER BY role;
SELECT meta->>'entity_kind' AS entity_kind, count(*) FROM public.people_directory
 WHERE role='contact' GROUP BY 1 ORDER BY 1;
SELECT display_name, consent_status FROM public.people_directory
 WHERE consent_status IS NOT NULL AND consent_status <> 'not_asked' ORDER BY 1;
SELECT display_name, paper_state FROM public.people_directory
 WHERE role='contact' AND paper_state <> 'not_on_file' ORDER BY 2, 1 LIMIT 15;

-- over-claim: does any Directory row claim more seats than the seats view nests?
WITH claims AS (
  SELECT person_id, display_name, seat_count FROM public.people_directory WHERE seat_count > 0
), nested AS (
  SELECT person_id, count(*) AS n FROM public.people_directory_seats GROUP BY 1
)
SELECT c.display_name, c.seat_count, COALESCE(n.n,0) AS nested
  FROM claims c LEFT JOIN nested n ON n.person_id = c.person_id
 WHERE c.seat_count <> COALESCE(n.n,0);

SELECT 'rows_overclaiming' AS leg, count(*) FROM (
  WITH claims AS (SELECT person_id, seat_count FROM public.people_directory WHERE seat_count > 0),
       nested AS (SELECT person_id, count(*) AS n FROM public.people_directory_seats GROUP BY 1)
  SELECT 1 FROM claims c LEFT JOIN nested n ON n.person_id=c.person_id
   WHERE c.seat_count <> COALESCE(n.n,0)) z;

-- seats nesting under nothing
SELECT 'orphan_seat_rows' AS leg, count(*) FROM public.people_directory_seats s
 WHERE NOT EXISTS (SELECT 1 FROM public.people_directory d WHERE d.person_id = s.person_id);

RESET ROLE;
ROLLBACK;
