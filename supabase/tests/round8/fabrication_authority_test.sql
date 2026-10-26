-- Cumulative replay entry point: 00878 must already be installed.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
\ir fabrication_authority_body.psql
ROLLBACK;
