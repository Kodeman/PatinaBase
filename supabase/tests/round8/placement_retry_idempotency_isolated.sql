\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
\ir ../../migrations/00873_round8_placement_retry_idempotency.sql
\ir placement_retry_idempotency_body.psql
ROLLBACK;
