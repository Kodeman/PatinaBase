\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
\ir ../../migrations/00872_round8_document_open_chain_alias.sql
\ir document_open_chain_alias_body.psql
ROLLBACK;
