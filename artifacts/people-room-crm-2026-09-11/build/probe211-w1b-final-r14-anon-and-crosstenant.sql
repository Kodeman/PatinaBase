-- W1b final review r14 — what anon reads, and what an unrelated studio owner reads.
\pset pager off
\echo '=== A. anon on people_directory (SELECT is granted by the local legacy seed) ==='
BEGIN;
SET LOCAL ROLE anon;
\echo '--- expect either 0 rows or a permission error, never another studio''s data ---'
SELECT count(*) AS anon_directory_rows FROM public.people_directory;
ROLLBACK;

\echo '=== B. anon INSERT into people_directory / v_access_grants (grant exists; view is a UNION) ==='
BEGIN;
SET LOCAL ROLE anon;
SAVEPOINT s1;
INSERT INTO public.people_directory(person_id, role) VALUES (gen_random_uuid(), 'x');
ROLLBACK TO s1;
ROLLBACK;

\echo '=== C. authenticated INSERT into v_access_grants ==='
BEGIN;
SET LOCAL ROLE authenticated;
SAVEPOINT s2;
INSERT INTO public.v_access_grants(grant_id, tier) VALUES ('x','y');
ROLLBACK TO s2;
ROLLBACK;
