BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

\echo '=== MINOR-42: does any Directory row claim more seats than it can nest? ==='
SELECT count(*) AS rows_overclaiming FROM (
  SELECT pd.person_id, pd.seat_count,
         (SELECT count(*) FROM public.people_directory_seats s WHERE s.person_id = pd.person_id) AS nested
    FROM public.people_directory pd
) x WHERE seat_count > nested;

\echo '=== the room, as the studio admin (not the designer) ==='
SELECT role, count(*) FROM public.people_directory GROUP BY 1 ORDER BY 1;
SELECT count(*) AS seat_rows FROM public.people_directory_seats;

\echo '=== the four paper words and the consent words, as the admin ==='
SELECT display_name, paper_state FROM public.people_directory
 WHERE display_name IN ('Marrow & Sons','Northgate Electric','Lakeshore Painting Co.','Great Northern Bank') ORDER BY 1;
SELECT display_name, consent_status FROM public.people_directory
 WHERE consent_status IS NOT NULL ORDER BY consent_status, display_name;
ROLLBACK;
