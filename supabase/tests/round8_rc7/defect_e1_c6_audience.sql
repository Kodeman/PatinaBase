\set ON_ERROR_STOP on
-- RC7-E1-1 (K9, fixed by migration 00903): the C6 client projection lists a
-- completion only to the project client or an active signer of the request
-- that contributed it. A prior-request signer who is NOT on the contributing
-- request (profile 8, linked to household card 5 on r1/r2, not on r4) passes
-- the unchanged entry gate and reads completions = []. A normal passing suite
-- since 00903 (no longer a DEFECT reproducer kept out of the gate).
-- Owned stack only (default 127.0.0.1:58122, the E1 stack; pass
-- -v expected_port=<n> for another owned stack, never the shared 54322),
-- with scope_editions inactive. Rolled back.
\if :{?expected_port}
\else
\set expected_port 58122
\endif
SELECT :'HOST'='127.0.0.1' AND :'PORT'=:'expected_port' AND :'PORT'<>'54322' AND
 (SELECT NOT enabled FROM public.server_capabilities WHERE key='scope_editions') AS owned \gset
\if :owned
\else
DO $$ BEGIN RAISE EXCEPTION 'E1 C6 audience suite requires an inactive owned 127.0.0.1 stack (not 54322)'; END $$;
\quit
\endif
BEGIN;
\ir ../round8/service_acceptance_release_fixes_body.psql
GRANT EXECUTE ON FUNCTION pg_temp.project(text) TO authenticated;
CREATE TEMP TABLE e1_c6_reads(actor integer PRIMARY KEY, result jsonb NOT NULL);
GRANT INSERT ON e1_c6_reads TO authenticated;
-- Both calls must succeed: an exception here stops the file (ON_ERROR_STOP).
SELECT pg_temp.actor(6);
SET LOCAL ROLE authenticated;
INSERT INTO e1_c6_reads SELECT 6,public.get_studio_service_completion(pg_temp.project());
RESET ROLE;
SELECT pg_temp.actor(8);
SET LOCAL ROLE authenticated;
INSERT INTO e1_c6_reads SELECT 8,public.get_studio_service_completion(pg_temp.project());
RESET ROLE;
SELECT pg_temp.assert_true((SELECT result->>'audience'='client'
 AND jsonb_array_length(result->'completions')=1
 AND (result->'completions'->0->>'acceptanceRequestId')::uuid=pg_temp.req('r4')
 FROM e1_c6_reads WHERE actor=6),
 'RC7-E1-1 control: r4 signer 6 reads exactly the r4 completion in the client projection');
SELECT pg_temp.assert_true((SELECT result->>'audience'='client' AND result->'completions'='[]'::jsonb
 FROM e1_c6_reads WHERE actor=8),
 'RC7-E1-1: prior-request signer 8, not on r4, reads no completion; observed completions '
 ||(SELECT (result->'completions')::text FROM e1_c6_reads WHERE actor=8));
DO $$ BEGIN RAISE NOTICE 'E1 C6 audience: PASS 2 assertions'; END $$;
ROLLBACK;
