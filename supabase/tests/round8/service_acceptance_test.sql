-- C4 service acceptance oracle on a reset database (00886 already applied).
-- Refuses any target but 127.0.0.1:expected_port.
\set ON_ERROR_STOP on
\if :{?expected_port}
\else
\set expected_port 54322
\endif
SELECT :'HOST' = '127.0.0.1' AND :'PORT' = :'expected_port' AS local_stack \gset
\if :local_stack
\else
\echo REFUSED: service_acceptance_test needs 127.0.0.1 port :expected_port, got :HOST port :PORT
DO $$ BEGIN RAISE EXCEPTION 'service_acceptance_test refused: not the expected local stack'; END $$;
\quit
\endif
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
\ir service_acceptance_body.psql
ROLLBACK;
