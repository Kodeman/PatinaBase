\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(1);
\ir document_open_chain_alias_body.psql
SELECT pass('document open chain alias full assertion body');
SELECT * FROM finish();
ROLLBACK;
