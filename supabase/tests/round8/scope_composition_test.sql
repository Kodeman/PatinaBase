\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
SELECT plan(1);
\ir scope_composition_body.psql
SELECT pass('scope composition full assertion body');
SELECT * FROM finish();
ROLLBACK;
