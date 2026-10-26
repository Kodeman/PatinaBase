\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
\ir evidence_manifests_body.psql
ROLLBACK;
