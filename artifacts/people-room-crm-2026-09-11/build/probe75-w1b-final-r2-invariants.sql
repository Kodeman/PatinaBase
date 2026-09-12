BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

\echo '=== 1. every Directory row: does seat_count equal the seats that nest under it? ==='
WITH d AS (SELECT person_id, display_name, role, seat_count FROM public.people_directory),
     s AS (SELECT person_id, count(*) AS nested FROM public.people_directory_seats GROUP BY 1)
SELECT count(*) FILTER (WHERE COALESCE(d.seat_count,0) <> COALESCE(s.nested,0)) AS rows_where_count_disagrees,
       count(*) AS directory_rows
  FROM d LEFT JOIN s ON s.person_id = d.person_id;
WITH d AS (SELECT person_id, display_name, role, seat_count FROM public.people_directory),
     s AS (SELECT person_id, count(*) AS nested FROM public.people_directory_seats GROUP BY 1)
SELECT d.display_name, d.role, d.seat_count AS claims, COALESCE(s.nested,0) AS nests
  FROM d LEFT JOIN s ON s.person_id=d.person_id
 WHERE COALESCE(d.seat_count,0) <> COALESCE(s.nested,0) ORDER BY 1 LIMIT 15;

\echo '=== 2. seats that nest under NO Directory row (the by-design dangle) ==='
SELECT count(*) AS dangling_seats FROM public.people_directory_seats s
 WHERE NOT EXISTS (SELECT 1 FROM public.people_directory d WHERE d.person_id = s.person_id);
SELECT s.display_name, s.party_kind, s.project_name FROM public.people_directory_seats s
 WHERE NOT EXISTS (SELECT 1 FROM public.people_directory d WHERE d.person_id=s.person_id) ORDER BY 1 LIMIT 10;

\echo '=== 3. one human, two readers: does a card row disagree with its own seat lines on consent? ==='
SELECT d.display_name, d.consent_status AS card_word, s.project_name, s.consent_status AS seat_word
  FROM public.people_directory d JOIN public.people_directory_seats s ON s.person_id = d.person_id
 WHERE d.consent_status IS DISTINCT FROM s.consent_status ORDER BY 1;

\echo '=== 4. and on the paper word? ==='
SELECT d.display_name, d.paper_state AS card_word, s.project_name, s.paper_state AS seat_word
  FROM public.people_directory d JOIN public.people_directory_seats s ON s.person_id = d.person_id
 WHERE d.paper_state IS DISTINCT FROM s.paper_state ORDER BY 1;

\echo '=== 5. and on reach? ==='
SELECT d.display_name, d.reach_state AS card_word, s.project_name, s.reach_state AS seat_word
  FROM public.people_directory d JOIN public.people_directory_seats s ON s.person_id = d.person_id
 WHERE d.reach_state IS DISTINCT FROM s.reach_state ORDER BY 1;

\echo '=== 6. the consent DATES on the record vs the meta the view prints ==='
SELECT d.display_name, d.consent_status,
       d.meta->>'sms_consented_at' AS meta_consented_at,
       d.meta->>'sms_opt_out_at'   AS meta_opt_out_at
  FROM public.people_directory d
 WHERE d.consent_status IN ('granted','opted_out','pending') ORDER BY 1;

\echo '=== 7. v_access_grants: reads without raising, tier list, and no 64-hex handle ==='
SELECT count(*) AS grant_rows, count(DISTINCT tier) AS tiers FROM public.v_access_grants;
SELECT tier, count(*) FROM public.v_access_grants GROUP BY 1 ORDER BY 1;
SELECT count(*) AS grant_ids_that_look_like_a_token FROM public.v_access_grants WHERE grant_id ~ '[0-9a-f]{64}';
ROLLBACK;
