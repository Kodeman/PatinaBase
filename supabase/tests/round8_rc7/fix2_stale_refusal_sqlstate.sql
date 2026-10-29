-- RC7-e2-2: round-8 refusals (00868-00899) must not use a SQLSTATE that
-- PostgREST 14 retries unless the retry can succeed. hasql-transaction re-runs
-- a transaction that fails with 40001 or 40P01 with no limit, so a
-- deterministic refusal raised with serialization_failure never reaches the
-- caller (504 at the gateway, backend still looping).
-- Deterministic refusals keep their message and use PT409 (HTTP 409); the
-- isolation guard uses invalid_transaction_state (HTTP 500). Transient
-- refusals (a concurrent commit moved a row between an unlocked read and its
-- lock) keep 40001 on purpose and carry a "40001 on purpose" comment.
-- Catalog checks (head definitions, then the earlier replayed bodies in 00869,
-- 00873 and 00883) plus one behavioral check; the fixture-backed behavior lives in
-- the round8/ oracles (service_acceptance, service_acceptance_release_fixes,
-- scope_execution, scope_composition, external_fulfilment, external_presence,
-- service_completion). Rolled back.
\set ON_ERROR_STOP on
\if :{?expected_port}
\else
\set expected_port 63122
\endif
SELECT :'HOST' = '127.0.0.1' AND :'PORT' = :'expected_port' AND :'PORT' <> '54322' AS owned_stack \gset
\if :owned_stack
\else
DO $$ BEGIN RAISE EXCEPTION 'fix2 stale refusal SQLSTATE test requires an owned 127.0.0.1 stack (not 54322)'; END $$;
\quit
\endif

BEGIN;
DO $t$
DECLARE
  -- [function, message, code, raises with that message and code]
  expected CONSTANT jsonb := '[
    ["record_service_acceptance_paper_intake", "stale_scope", "PT409", 1],
    ["record_service_acceptance_paper_intake", "stale_signer_policy", "PT409", 1],
    ["stamp_service_acceptance_paper_hash", "paper_document_changed", "PT409", 1],
    ["review_service_acceptance_paper_intake", "paper_document_changed", "PT409", 1],
    ["review_service_acceptance_paper_intake", "stale_scope", "PT409", 1],
    ["review_service_acceptance_paper_intake", "stale_signer_policy", "PT409", 1],
    ["_mint_scope_edition", "scope_execution_document_moved", "serialization_failure", 1],
    ["_mint_scope_edition", "scope_edition_stale", "PT409", 1],
    ["_assert_service_completion_read_committed", "service_completion_requires_read_committed", "invalid_transaction_state", 1],
    ["complete_studio_service", "stale_obligations", "PT409", 1],
    ["replace_service_acceptance_signer", "stale_signer_policy", "PT409", 1],
    ["respond_service_acceptance", "stale_scope", "PT409", 1],
    ["respond_service_acceptance", "stale_signer_policy", "PT409", 1],
    ["present_service_acceptance_offline", "stale_scope", "PT409", 1],
    ["apply_service_arrangement", "arrangement_effect_changed", "PT409", 1],
    ["_record_scope_execution", "scope_execution_document_moved", "serialization_failure", 1],
    ["reconcile_scope_edition", "scope_reconcile_order_moved", "serialization_failure", 2],
    ["_external_assert_replay", "external_request_changed", "PT409", 1],
    ["set_ffe_item_external_fulfilment", "external_conversion_item_changed", "serialization_failure", 1],
    ["set_ffe_item_external_fulfilment", "external_conversion_version_conflict", "PT409", 1],
    ["place_product_in_project_v2", "idempotent command is still in progress", "PT409", 1],
    ["send_commercial_document", "scope_execution_document_moved", "serialization_failure", 1]
  ]';
  r jsonb;
  defs text;
  overloads integer;
  found integer;
  retryable integer;
  intended integer;
  passed integer := 0;
BEGIN
  FOR r IN SELECT value FROM jsonb_array_elements(expected) LOOP
    SELECT count(*), string_agg(pg_get_functiondef(p.oid), E'\n')
      INTO overloads, defs
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = r->>0;
    IF overloads <> 1 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: public.% has % definitions, expected 1', r->>0, overloads;
    END IF;
    SELECT count(*) INTO found FROM regexp_matches(defs,
      format('RAISE\s+EXCEPTION\s+''%s''\s+USING\s+ERRCODE\s*=\s*''%s''', r->>1, r->>2), 'gi');
    IF found <> (r->>3)::integer THEN
      RAISE EXCEPTION 'ASSERTION FAILED: public.% raises % with % % times, expected %', r->>0, r->>1, r->>2, found, r->>3;
    END IF;
    -- Every retryable raise in the function is one this list classifies as
    -- transient, and each carries its "40001 on purpose" comment.
    SELECT count(*) INTO retryable FROM regexp_matches(defs,
      'ERRCODE\s*=\s*''(serialization_failure|deadlock_detected|40001|40P01)''', 'gi');
    SELECT COALESCE(sum((e->>3)::integer), 0) INTO intended FROM jsonb_array_elements(expected) e
    WHERE e->>0 = r->>0 AND e->>2 = 'serialization_failure';
    IF retryable <> intended THEN
      RAISE EXCEPTION 'ASSERTION FAILED: public.% has % retryable raises, % classified transient', r->>0, retryable, intended;
    END IF;
    IF intended > 0 AND (SELECT count(*) FROM regexp_matches(defs, '40001 on purpose', 'g')) <> intended THEN
      RAISE EXCEPTION 'ASSERTION FAILED: public.% transient raises lack their "40001 on purpose" comment', r->>0;
    END IF;
    passed := passed + 1;
    RAISE NOTICE 'PASS: public.% raises % with % (x%)', r->>0, r->>1, r->>2, r->>3;
  END LOOP;
  IF passed <> 22 THEN RAISE EXCEPTION 'ASSERTION FAILED: % of 22 entries checked', passed; END IF;
END
$t$;
ROLLBACK;

-- Earlier replayed bodies. 00869 and 00883 (_mint_scope_edition) and 00873
-- (place_product_in_project_v2) are superseded at head, but a stack migrated
-- only to an intermediate stage runs them. Read each body from its migration
-- file, install it inside a rolled-back transaction, and apply the same check
-- to the installed definition. Run from the repo root, or pass -v repo=<root>.
\if :{?repo}
\else
\set repo .
\endif
\set src_00869 `cat :repo/supabase/migrations/00869_round8_scope_execution.sql`
\set src_00873 `cat :repo/supabase/migrations/00873_round8_placement_retry_idempotency.sql`
\set src_00883 `cat :repo/supabase/migrations/00883_round8_external_reader_parity.sql`

BEGIN;
CREATE TEMP TABLE fix2_replayed(migration text, fn text, src text) ON COMMIT DROP;
INSERT INTO fix2_replayed VALUES
  ('00869', '_mint_scope_edition', :'src_00869'),
  ('00873', 'place_product_in_project_v2', :'src_00873'),
  ('00883', '_mint_scope_edition', :'src_00883');
DO $t$
DECLARE
  -- [migration, function, message, code, raises with that message and code]
  expected CONSTANT jsonb := '[
    ["00869", "_mint_scope_edition", "scope_execution_document_moved", "serialization_failure", 1],
    ["00869", "_mint_scope_edition", "scope_edition_stale", "PT409", 1],
    ["00873", "place_product_in_project_v2", "idempotent command is still in progress", "PT409", 1],
    ["00883", "_mint_scope_edition", "scope_execution_document_moved", "serialization_failure", 1],
    ["00883", "_mint_scope_edition", "scope_edition_stale", "PT409", 1]
  ]';
  b record;
  r jsonb;
  body text;
  defs text;
  overloads integer;
  found integer;
  retryable integer;
  intended integer;
  passed integer := 0;
BEGIN
  FOR b IN SELECT * FROM fix2_replayed ORDER BY migration LOOP
    body := substring(b.src FROM '(CREATE OR REPLACE FUNCTION public\.' || b.fn || '\(.*?\n\$\$;)');
    IF body IS NULL THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % has no public.% definition', b.migration, b.fn;
    END IF;
    EXECUTE body;
    SELECT count(*), string_agg(pg_get_functiondef(p.oid), E'\n')
      INTO overloads, defs
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = b.fn;
    IF overloads <> 1 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: public.% has % definitions after installing the % body', b.fn, overloads, b.migration;
    END IF;
    FOR r IN SELECT value FROM jsonb_array_elements(expected) WHERE value->>0 = b.migration LOOP
      SELECT count(*) INTO found FROM regexp_matches(defs,
        format('RAISE\s+EXCEPTION\s+''%s''\s+USING\s+ERRCODE\s*=\s*''%s''', r->>2, r->>3), 'gi');
      IF found <> (r->>4)::integer THEN
        RAISE EXCEPTION 'ASSERTION FAILED: % public.% raises % with % % times, expected %',
          b.migration, b.fn, r->>2, r->>3, found, r->>4;
      END IF;
      passed := passed + 1;
      RAISE NOTICE 'PASS: % public.% raises % with % (x%)', b.migration, b.fn, r->>2, r->>3, r->>4;
    END LOOP;
    SELECT count(*) INTO retryable FROM regexp_matches(defs,
      'ERRCODE\s*=\s*''(serialization_failure|deadlock_detected|40001|40P01)''', 'gi');
    SELECT COALESCE(sum((e->>4)::integer), 0) INTO intended FROM jsonb_array_elements(expected) e
    WHERE e->>0 = b.migration AND e->>3 = 'serialization_failure';
    IF retryable <> intended THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % public.% has % retryable raises, % classified transient',
        b.migration, b.fn, retryable, intended;
    END IF;
    IF (SELECT count(*) FROM regexp_matches(defs, '40001 on purpose', 'g')) <> intended THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % public.% transient raises lack their "40001 on purpose" comment',
        b.migration, b.fn;
    END IF;
  END LOOP;
  IF passed <> 5 THEN RAISE EXCEPTION 'ASSERTION FAILED: % of 5 replayed-body entries checked', passed; END IF;
END
$t$;
ROLLBACK;

-- Behavior: outside READ COMMITTED the completion guard refuses with the new
-- non-retryable code and its message unchanged.
BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $t$
DECLARE state text; message text;
BEGIN
  BEGIN
    PERFORM public._assert_service_completion_read_committed();
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS state = RETURNED_SQLSTATE, message = MESSAGE_TEXT;
  END;
  IF state IS DISTINCT FROM '25000' OR message IS DISTINCT FROM 'service_completion_requires_read_committed' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: REPEATABLE READ guard got %/%', state, message;
  END IF;
  RAISE NOTICE 'PASS: REPEATABLE READ completion guard refuses 25000/service_completion_requires_read_committed';
END
$t$;
ROLLBACK;
