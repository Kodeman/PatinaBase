\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(1);
\ir typed_subjects_body.psql
SELECT pass('C7 typed subjects, visible Field room and atomic draft escalation');
SELECT * FROM finish();
ROLLBACK;
