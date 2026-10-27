\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(1);
\ir placement_retry_idempotency_body.psql
SELECT pass('placement retry idempotency full assertion body');
SELECT * FROM finish();
ROLLBACK;
