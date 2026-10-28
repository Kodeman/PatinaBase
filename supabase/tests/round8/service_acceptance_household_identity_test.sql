-- C4 household-card signer identity (00894, SQ-2352) on an OWNED stack
-- (+3000: 127.0.0.1:57322). Pass -v expected_port=<n> for another owned
-- stack; never the shared 54322. Every fixture, capability and ACL change is
-- rolled back.
\set ON_ERROR_STOP on
\if :{?expected_port}
\else
\set expected_port 57322
\endif
SELECT :'HOST' = '127.0.0.1' AND :'PORT' = :'expected_port' AND :'PORT' <> '54322' AS owned_stack \gset
\if :owned_stack
\else
\echo REFUSED: service_acceptance_household_identity_test needs owned 127.0.0.1 port :expected_port, got :HOST port :PORT
DO $$ BEGIN RAISE EXCEPTION 'service_acceptance_household_identity_test refused: not the owned local stack'; END $$;
\quit
\endif
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
\ir service_acceptance_household_identity_body.psql
ROLLBACK;
