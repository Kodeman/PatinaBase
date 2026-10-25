\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
\ir ../../migrations/00868_round8_scope_composition.sql
\ir scope_composition_body.psql
ROLLBACK;
