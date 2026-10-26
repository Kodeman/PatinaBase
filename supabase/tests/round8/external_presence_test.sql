\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
-- Exercise this candidate without installing it in the shared stack.
\ir ../../migrations/00875_round8_external_fulfilment.sql
\ir ../../migrations/00876_round8_external_presence_parity.sql
\ir external_presence_body.psql
\ir external_presence_money_body.psql
\ir external_presence_exit_body.psql
ROLLBACK;
