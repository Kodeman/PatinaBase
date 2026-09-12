\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume(p uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE 'SET LOCAL role authenticated';
 EXECUTE format('SET LOCAL request.jwt.claims = %L', json_build_object('sub',p::text,'role','authenticated')::text); END $$;
SELECT pg_temp.assume('a0000000-0000-0000-0000-000000000003');
\echo '=== r9 MINOR-6: firm rows carry a consent word R-G gives the company row no column for ==='
SELECT display_name, meta->>'entity_kind' AS kind, consent_status, paper_state
  FROM public.people_directory
 WHERE role='contact' AND meta->>'entity_kind'='company'
   AND consent_status IS NOT NULL ORDER BY display_name LIMIT 6;
\echo '=== how many company rows carry one ==='
SELECT count(*) FILTER (WHERE consent_status IS NOT NULL) AS with_word,
       count(*) AS company_rows
  FROM public.people_directory WHERE role='contact' AND meta->>'entity_kind'='company';
\echo '=== r9 MINOR-5: the party branch rule clause is the WINNING seat''s ==='
SELECT display_name, seat_count, contact_rule_summary
  FROM public.people_directory WHERE role IN ('sub','gc','installer','architect','photographer','stager','receiver');
ROLLBACK;
