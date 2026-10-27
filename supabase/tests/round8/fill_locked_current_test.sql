\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(1);
\ir fill_locked_current_body.psql
SELECT pass('Fill locked-current preservation full assertion body');
SELECT * FROM finish();
ROLLBACK;
