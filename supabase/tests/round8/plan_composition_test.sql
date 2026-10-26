\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(1);
\ir plan_composition_body.psql
SELECT pass('C1 plan composition actor, identity and compatibility assertions');
SELECT * FROM finish();
ROLLBACK;
