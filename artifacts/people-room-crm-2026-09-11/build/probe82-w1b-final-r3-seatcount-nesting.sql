-- W1b final review r3: does every people_directory row nest the seats it claims?
\pset pager off
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';

\echo '=== 1. every Directory row: claimed seat_count vs seats that actually nest ==='
SELECT d.role,
       count(*)                                                     AS rows,
       count(*) FILTER (WHERE d.seat_count > 0)                      AS rows_claiming,
       count(*) FILTER (WHERE d.seat_count > 0 AND s.nested = 0)     AS claim_but_nest_zero,
       count(*) FILTER (WHERE d.seat_count <> COALESCE(s.nested,0))  AS count_disagrees
  FROM public.people_directory d
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS nested
      FROM public.people_directory_seats ps
     WHERE ps.person_id = d.person_id
  ) s ON true
 GROUP BY d.role ORDER BY d.role;

\echo '=== 2. the rows where it disagrees, named ==='
SELECT d.role, d.display_name, d.person_id, d.seat_count, COALESCE(s.nested,0) AS nested
  FROM public.people_directory d
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS nested FROM public.people_directory_seats ps
     WHERE ps.person_id = d.person_id) s ON true
 WHERE d.seat_count <> COALESCE(s.nested,0)
 ORDER BY d.role, d.display_name;
ROLLBACK;
