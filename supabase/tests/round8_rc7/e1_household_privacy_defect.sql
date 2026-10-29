\set ON_ERROR_STOP on
-- DEFECT RC7-E1-1: a prior-request signer who is NOT on the contributing
-- acceptance request must not read the completion's client projection.
-- Expected to fail until the C6 audience is ruled on and corrected.
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
SELECT pg_temp.actor(8);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error(format('SELECT public.get_studio_service_completion(%L)',pg_temp.project()),
 '42501','insufficient_privilege',
 'DEFECT RC7-E1-1: unrelated household signer must not read C6 completion');
RESET ROLE;
ROLLBACK;
