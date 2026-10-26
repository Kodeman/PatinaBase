\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
\ir external_presence_body.psql
ROLLBACK;
