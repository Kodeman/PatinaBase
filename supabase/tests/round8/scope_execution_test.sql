-- Committed-schema runner. Never commits fixtures or test-only capability grants.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
\ir scope_execution_body.psql
ROLLBACK;
