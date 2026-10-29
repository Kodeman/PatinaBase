\set ON_ERROR_STOP on
-- DEFECT RC7-E1-1: a prior-request signer who is NOT on the contributing
-- acceptance request reads that request's completion in the C6 client projection.
-- Excluded from the passing gate (not an e1_*.sql file). Fails on the present
-- schema; passes once the client projection keeps only completions whose
-- contributing request lists the viewer as an active signer (or the viewer is
-- the project client). Promotion: move both assertions into
-- e1_authority_matrix.sql at the RC7-E1-1 marker after the actor 8 block.
SELECT :'HOST'='127.0.0.1' AND :'PORT'='58122' AND
 (SELECT NOT enabled FROM public.server_capabilities WHERE key='scope_editions') AS owned \gset
\if :owned
\else
DO $$ BEGIN RAISE EXCEPTION 'E1 defect reproducer requires inactive owned 58122'; END $$;
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
 'DEFECT RC7-E1-1: prior-request signer 8, not on r4, reads no completion; observed completions '
 ||(SELECT (result->'completions')::text FROM e1_c6_reads WHERE actor=8));
ROLLBACK;
