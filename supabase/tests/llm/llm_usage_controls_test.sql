-- ═══════════════════════════════════════════════════════════════════════════
-- llm_usage controls — migration 00770 (US-30 A1)
-- Run by the pinned local verifier: supabase test db supabase/tests/llm/
-- Transaction-wrapped and rolled back; does not modify persistent fixtures.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(21);

-- Establish deterministic controls and exercise denial precedence.
SELECT public.llm_set_controls(false, 100, NULL);
SELECT public.llm_set_feature_control('case-kill', false, 10, 10, NULL);
SELECT public.llm_set_controls(true, 100, NULL);
SELECT is(public.llm_reserve('case-kill', NULL, NULL, 0)->>'reason', 'kill', 'kill switch precedes disabled feature');
SELECT public.llm_set_controls(false, 100, NULL);
SELECT is(public.llm_reserve('case-kill', NULL, NULL, 0)->>'reason', 'disabled', 'disabled feature is denied');
SELECT is(public.llm_reserve('feature-row-missing', NULL, NULL, 0)->>'reason', 'disabled', 'missing feature row is disabled');

-- Daily cap allows reaching the cap exactly, then denies even a zero estimate.
SELECT public.llm_set_feature_control('case-feature-cap', true, 1, NULL, NULL);
CREATE TEMP TABLE test_usage_ids (key text PRIMARY KEY, id bigint);
INSERT INTO test_usage_ids VALUES
  ('feature', (public.llm_reserve('case-feature-cap', NULL, NULL, 1)->>'usage_id')::bigint);
SELECT ok((SELECT status = 'reserved' AND reserved_usd = 1 FROM public.llm_usage
           WHERE id = (SELECT id FROM test_usage_ids WHERE key = 'feature')),
          'exact cap reservation is granted and booked');
SELECT is(public.llm_reserve('case-feature-cap', NULL, NULL, 0)->>'reason', 'feature_daily', 'spent at cap denies zero estimate');
SELECT is((SELECT reserved_usd FROM public.llm_usage WHERE id = (SELECT id FROM test_usage_ids WHERE key='feature')), 1::numeric, 'reservation remains until settlement');
SELECT public.llm_settle((SELECT id FROM test_usage_ids WHERE key='feature'), 'test-model', 2, 3, 1, 4, 1, 'settled', NULL, 12);
SELECT ok((SELECT status = 'settled' AND reserved_usd = 0 AND input_tokens = 2 AND output_tokens = 3
                  AND cache_read_tokens = 1 AND cache_write_tokens = 4 AND usd = 1 AND latency_ms = 12
             FROM public.llm_usage WHERE id = (SELECT id FROM test_usage_ids WHERE key = 'feature')),
          'settlement records usage and clears the reservation');
-- A second settle must not change the first settled record.
SELECT public.llm_settle((SELECT id FROM test_usage_ids WHERE key='feature'), 'changed', 9, 9, 9, 9, 9, 'settled', 'later', 99);
SELECT is((SELECT model FROM public.llm_usage WHERE id = (SELECT id FROM test_usage_ids WHERE key='feature')), 'test-model', 'settlement is idempotent');

-- Global daily cap and its boundary.
SELECT public.llm_set_controls(false, 2, NULL);
SELECT public.llm_set_feature_control('case-global-cap', true, NULL, NULL, NULL);
INSERT INTO test_usage_ids VALUES ('global', (public.llm_reserve('case-global-cap', NULL, NULL, 1)->>'usage_id')::bigint);
SELECT is(public.llm_reserve('case-global-cap', NULL, NULL, 1)->>'reason', 'global_daily', 'global cap rejects spend beyond cap');
SELECT is((public.llm_reserve('case-global-cap', NULL, NULL, 0)->>'reason'), 'global_daily', 'global cap rejects zero estimate when already at cap');

-- Studio override takes precedence over the feature's smaller default.
SELECT public.llm_set_controls(false, 100, NULL);
SELECT public.llm_set_feature_control('case-studio-cap', true, NULL, 1, NULL);
SELECT public.llm_set_studio_override('30000000-0000-4000-8000-000000000001', 2, NULL);
INSERT INTO test_usage_ids VALUES ('studio', (public.llm_reserve('case-studio-cap', '30000000-0000-4000-8000-000000000001', NULL, 2)->>'usage_id')::bigint);
SELECT ok((SELECT status = 'reserved' FROM public.llm_usage WHERE id = (SELECT id FROM test_usage_ids WHERE key='studio')),
          'studio override supersedes lower feature monthly cap');
SELECT is(public.llm_reserve('case-studio-cap', '30000000-0000-4000-8000-000000000001', NULL, 0)->>'reason', 'studio_monthly', 'studio cap denies at its exact limit');

-- Audit records from all setter types and stale reservation recovery.
CREATE TEMP TABLE audit_baseline AS
  SELECT count(*)::bigint AS n FROM public.llm_controls_audit
   WHERE target IN ('controls','feature:case-audit','studio:30000000-0000-4000-8000-000000000002');
SELECT public.llm_set_controls(false, 100, NULL);
SELECT public.llm_set_feature_control('case-audit', true, NULL, NULL, NULL);
SELECT public.llm_set_studio_override('30000000-0000-4000-8000-000000000002', 5, NULL);
SELECT is((SELECT count(*) - (SELECT n FROM audit_baseline) FROM public.llm_controls_audit
            WHERE target IN ('controls','feature:case-audit','studio:30000000-0000-4000-8000-000000000002')), 3::bigint, 'all three setters write audit rows');
SELECT public.llm_set_feature_control('case-stale', true, NULL, NULL, NULL);
INSERT INTO test_usage_ids VALUES ('stale', (public.llm_reserve('case-stale', NULL, NULL, 0.25)->>'usage_id')::bigint);
UPDATE public.llm_usage SET at = now() - interval '11 minutes' WHERE id = (SELECT id FROM test_usage_ids WHERE key='stale');
SELECT is(public.llm_sweep_stale_reservations(), 1, 'stale sweep marks expired reservations');
SELECT ok((SELECT status = 'error' AND reserved_usd = 0 AND stop_reason = 'stale_reservation'
             FROM public.llm_usage WHERE id = (SELECT id FROM test_usage_ids WHERE key='stale')),
          'stale reservation is released and marked error');

-- The compatibility view retains its six-column shape and reflects ledger data.
SELECT public.llm_set_feature_control('aesthete-dna-draft', true, NULL, NULL, NULL);
INSERT INTO public.llm_usage(feature, at, input_tokens, output_tokens, cache_read_tokens, usd, status)
VALUES ('aesthete-dna-draft', '2026-10-01 00:00:00+00', 11, 7, 3, 0.125, 'settled');
SELECT is((SELECT (input_tokens, output_tokens, cache_read_tokens, usd, products)::text
             FROM public.aesthete_spend_ledger WHERE day = DATE '2026-10-01'),
          '(11,7,3,0.125000,0)', 'compatibility view projects ledger rows with legacy columns');

-- The app roles cannot execute any service-only RPC.
SELECT ok(NOT has_function_privilege('anon', 'public.llm_reserve(text,uuid,uuid,numeric)', 'EXECUTE'), 'anon cannot reserve');
SELECT ok(NOT has_function_privilege('authenticated', 'public.llm_reserve(text,uuid,uuid,numeric)', 'EXECUTE'), 'authenticated cannot reserve');
SELECT ok(NOT has_function_privilege('anon', 'public.llm_settle(bigint,text,integer,integer,integer,integer,numeric,text,text,integer)', 'EXECUTE'), 'anon cannot settle');
SELECT ok(NOT has_function_privilege('authenticated', 'public.llm_set_controls(boolean,numeric,uuid)', 'EXECUTE'), 'authenticated cannot change controls');
SELECT ok(has_function_privilege('service_role', 'public.llm_reserve(text,uuid,uuid,numeric)', 'EXECUTE'), 'service_role can reserve');

SELECT * FROM finish();
ROLLBACK;
