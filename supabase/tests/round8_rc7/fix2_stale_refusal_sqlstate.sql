-- RC7-e2-2: round-8 stale refusals (00886-00899) must not use a SQLSTATE that
-- PostgREST 14 retries. hasql-transaction re-runs a transaction that fails with
-- 40001 or 40P01 with no limit, so a deterministic refusal raised with
-- serialization_failure never reaches the caller (504 at the gateway, backend
-- still looping). Each live raise keeps its message and uses PT409 (HTTP 409);
-- the isolation guard uses invalid_transaction_state (HTTP 500).
-- Catalog checks plus one behavioral check; the fixture-backed behavior lives in
-- round8/service_acceptance_body.psql, service_acceptance_release_fixes_body.psql,
-- scope_execution_body.psql and service_completion_test.sql. Rolled back.
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
  expected CONSTANT jsonb := '[
    ["record_service_acceptance_paper_intake", "stale_scope", "PT409"],
    ["record_service_acceptance_paper_intake", "stale_signer_policy", "PT409"],
    ["stamp_service_acceptance_paper_hash", "paper_document_changed", "PT409"],
    ["review_service_acceptance_paper_intake", "paper_document_changed", "PT409"],
    ["review_service_acceptance_paper_intake", "stale_scope", "PT409"],
    ["review_service_acceptance_paper_intake", "stale_signer_policy", "PT409"],
    ["_mint_scope_edition", "scope_execution_document_moved", "PT409"],
    ["_mint_scope_edition", "scope_edition_stale", "PT409"],
    ["_assert_service_completion_read_committed", "service_completion_requires_read_committed", "invalid_transaction_state"],
    ["complete_studio_service", "stale_obligations", "PT409"],
    ["replace_service_acceptance_signer", "stale_signer_policy", "PT409"],
    ["respond_service_acceptance", "stale_scope", "PT409"],
    ["respond_service_acceptance", "stale_signer_policy", "PT409"],
    ["present_service_acceptance_offline", "stale_scope", "PT409"]
  ]';
  r jsonb;
  defs text;
  overloads integer;
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
    IF defs ~* '(serialization_failure|deadlock_detected|''40001''|''40P01'')' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: public.% still raises a SQLSTATE PostgREST retries', r->>0;
    END IF;
    IF defs !~* format('RAISE\s+EXCEPTION\s+''%s''\s+USING\s+ERRCODE\s*=\s*''%s''', r->>1, r->>2) THEN
      RAISE EXCEPTION 'ASSERTION FAILED: public.% does not raise % with %', r->>0, r->>1, r->>2;
    END IF;
    passed := passed + 1;
    RAISE NOTICE 'PASS: public.% raises % with %', r->>0, r->>1, r->>2;
  END LOOP;
  IF passed <> 14 THEN RAISE EXCEPTION 'ASSERTION FAILED: % of 14 raises checked', passed; END IF;
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
