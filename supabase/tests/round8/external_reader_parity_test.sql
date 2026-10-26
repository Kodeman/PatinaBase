\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
\ir ../../migrations/00874_round8_typed_subjects.sql
\ir ../../migrations/00875_round8_external_fulfilment.sql
\ir ../../migrations/00876_round8_external_presence_parity.sql
\ir ../../migrations/00877_round8_evidence_manifests.sql
\ir ../../migrations/00878_round8_fabrication_authority.sql
\ir ../../migrations/00881_round8_fill_locked_current.sql
\ir ../../migrations/00882_round8_billing_lock_order.sql
\ir ../../migrations/00883_round8_external_reader_parity.sql
\ir external_reader_parity_body.psql
ROLLBACK;
