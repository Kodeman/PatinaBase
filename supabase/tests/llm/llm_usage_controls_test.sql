-- ═══════════════════════════════════════════════════════════════════════════
-- llm_usage controls — migration 00770 (US-30 A1, SQ-910 repair)
-- Run by the pinned local verifier: supabase test db supabase/tests/llm/
-- Transaction-wrapped and rolled back; does not modify persistent fixtures.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(33);

-- Establish deterministic controls and exercise denial precedence.
SELECT public.llm_set_controls(false, 100, NULL);
SELECT public.llm_set_feature_control('case-kill', false, 10, 10, NULL);
SELECT public.llm_set_controls(true, 100, NULL);
SELECT is(public.llm_reserve('case-kill', NULL, NULL, 0, NULL, NULL)->>'reason', 'kill', 'kill switch precedes disabled feature');
SELECT public.llm_set_controls(false, 100, NULL);
SELECT is(public.llm_reserve('case-kill', NULL, NULL, 0, NULL, NULL)->>'reason', 'disabled', 'disabled feature is denied');
SELECT is(public.llm_reserve('feature-row-missing', NULL, NULL, 0, NULL, NULL)->>'reason', 'disabled', 'missing feature row is disabled');

-- Daily cap allows reaching the cap exactly, then denies even a zero estimate.
SELECT public.llm_set_feature_control('case-feature-cap', true, 1, NULL, NULL);
CREATE TEMP TABLE test_usage_ids (key text PRIMARY KEY, id bigint);
INSERT INTO test_usage_ids VALUES
  ('feature', (public.llm_reserve('case-feature-cap', NULL, NULL, 1, NULL, NULL)->>'usage_id')::bigint);
SELECT ok((SELECT status = 'reserved' AND reserved_usd = 1 FROM public.llm_usage
           WHERE id = (SELECT id FROM test_usage_ids WHERE key = 'feature')),
          'exact cap reservation is granted and booked');
SELECT is(public.llm_reserve('case-feature-cap', NULL, NULL, 0, NULL, NULL)->>'reason', 'feature_daily', 'spent at cap denies zero estimate');
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
INSERT INTO test_usage_ids VALUES ('global', (public.llm_reserve('case-global-cap', NULL, NULL, 1, NULL, NULL)->>'usage_id')::bigint);
SELECT is(public.llm_reserve('case-global-cap', NULL, NULL, 1, NULL, NULL)->>'reason', 'global_daily', 'global cap rejects spend beyond cap');
SELECT is((public.llm_reserve('case-global-cap', NULL, NULL, 0, NULL, NULL)->>'reason'), 'global_daily', 'global cap rejects zero estimate when already at cap');

-- Studio override takes precedence over the feature's smaller default.
SELECT public.llm_set_controls(false, 100, NULL);
SELECT public.llm_set_feature_control('case-studio-cap', true, NULL, 1, NULL);
SELECT public.llm_set_studio_override('30000000-0000-4000-8000-000000000001', 2, NULL);
INSERT INTO test_usage_ids VALUES ('studio', (public.llm_reserve('case-studio-cap', '30000000-0000-4000-8000-000000000001', NULL, 2, NULL, NULL)->>'usage_id')::bigint);
SELECT ok((SELECT status = 'reserved' FROM public.llm_usage WHERE id = (SELECT id FROM test_usage_ids WHERE key='studio')),
          'studio override supersedes lower feature monthly cap');
SELECT is(public.llm_reserve('case-studio-cap', '30000000-0000-4000-8000-000000000001', NULL, 0, NULL, NULL)->>'reason', 'studio_monthly', 'studio cap denies at its exact limit');

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
INSERT INTO test_usage_ids VALUES ('stale', (public.llm_reserve('case-stale', NULL, NULL, 0.25, NULL, NULL)->>'usage_id')::bigint);
UPDATE public.llm_usage SET at = now() - interval '11 minutes' WHERE id = (SELECT id FROM test_usage_ids WHERE key='stale');
SELECT is(public.llm_sweep_stale_reservations(), 1, 'stale sweep marks expired reservations');
SELECT ok((SELECT status = 'error' AND reserved_usd = 0 AND stop_reason = 'stale_reservation'
             FROM public.llm_usage WHERE id = (SELECT id FROM test_usage_ids WHERE key='stale')),
          'stale reservation is released and marked error');
SELECT is((SELECT usd FROM public.llm_usage WHERE id = (SELECT id FROM test_usage_ids WHERE key='stale')),
          0.25::numeric, 'stale sweep records the estimate as spend');

-- A late settle on a swept row records its real usage once; a repeat is a no-op.
SELECT public.llm_settle((SELECT id FROM test_usage_ids WHERE key='stale'), 'late-model', 5, 6, 0, 0, 0.3, 'settled', 'end_turn', 40);
SELECT public.llm_settle((SELECT id FROM test_usage_ids WHERE key='stale'), 'again', 9, 9, 9, 9, 9, 'error', 'again', 99);
SELECT ok((SELECT status = 'settled' AND model = 'late-model' AND input_tokens = 5 AND output_tokens = 6
                  AND usd = 0.3 AND reserved_usd = 0 AND stop_reason = 'end_turn' AND latency_ms = 40
             FROM public.llm_usage WHERE id = (SELECT id FROM test_usage_ids WHERE key='stale')),
          'late settle on a swept row records its real usage');
SELECT throws_ok($$SELECT public.llm_settle(-1, 'test-model', 0, 0, 0, 0, 0, 'settled', NULL, 0)$$,
                 'P0002', 'unknown llm usage id -1', 'settling an unknown usage id raises');

-- The compatibility view keeps its six-column shape and carries migrated legacy products.
SELECT public.llm_set_feature_control('aesthete-dna-draft', true, NULL, NULL, NULL);
INSERT INTO public.llm_usage(feature, at, role, model, prompt_version, input_tokens, output_tokens,
                             cache_read_tokens, usd, status, products)
VALUES ('aesthete-dna-draft', '2026-10-01 00:00:00+00', 'draft', 'legacy', 'legacy', 11, 7, 3, 0.125, 'settled', 4);
SELECT is((SELECT (input_tokens, output_tokens, cache_read_tokens, usd, products)::text
             FROM public.aesthete_spend_ledger WHERE day = DATE '2026-10-01'),
          '(11,7,3,0.125000,4)', 'compatibility view returns migrated legacy products');

-- A paid error counts toward every cap; a denial costs nothing.
SELECT public.llm_set_controls(false, 100, NULL);
SELECT public.llm_set_feature_control('case-paid-error', true, 1, NULL, NULL);
INSERT INTO test_usage_ids VALUES ('paid-error', (public.llm_reserve('case-paid-error', NULL, NULL, 1, NULL, NULL)->>'usage_id')::bigint);
SELECT public.llm_settle((SELECT id FROM test_usage_ids WHERE key='paid-error'), 'test-model', 10, 0, 0, 0, 1, 'error', 'api_error', 5);
SELECT is(public.llm_reserve('case-paid-error', NULL, NULL, 1, NULL, NULL)->>'reason', 'feature_daily', 'a paid error counts toward the feature daily cap');
SELECT ok((SELECT (entry->>'usd')::numeric = 1 AND (entry->>'calls')::bigint = 1
             FROM jsonb_array_elements(public.llm_usage_summary(now() - interval '1 day', now() + interval '1 day')->'by_feature') AS entry
            WHERE entry->>'feature' = 'case-paid-error'),
          'summary counts the paid error and not the denial');

SELECT public.llm_set_feature_control('case-paid-error-studio', true, NULL, 1, NULL);
INSERT INTO test_usage_ids VALUES ('paid-error-studio', (public.llm_reserve('case-paid-error-studio', '30000000-0000-4000-8000-000000000003', NULL, 1, NULL, NULL)->>'usage_id')::bigint);
SELECT public.llm_settle((SELECT id FROM test_usage_ids WHERE key='paid-error-studio'), 'test-model', 10, 0, 0, 0, 1, 'error', 'api_error', 5);
SELECT is(public.llm_reserve('case-paid-error-studio', '30000000-0000-4000-8000-000000000003', NULL, 1, NULL, NULL)->>'reason', 'studio_monthly', 'a paid error counts toward the studio monthly cap');

-- A global cap of today's summary total plus $1 admits exactly $1 more, so the
-- summary total and the cap aggregate are the same number.
CREATE TEMP TABLE utc_today AS
  SELECT date_trunc('day', clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS day_start;
SELECT public.llm_set_controls(false,
  (SELECT (public.llm_usage_summary(day_start, day_start + interval '1 day')->'totals'->>'usd')::numeric + 1 FROM utc_today), NULL);
SELECT public.llm_set_feature_control('case-paid-error-global', true, NULL, NULL, NULL);
INSERT INTO test_usage_ids VALUES ('paid-error-global', (public.llm_reserve('case-paid-error-global', NULL, NULL, 1, NULL, NULL)->>'usage_id')::bigint);
SELECT ok((SELECT status = 'reserved' FROM public.llm_usage WHERE id = (SELECT id FROM test_usage_ids WHERE key='paid-error-global')),
          'global cap set from the summary total admits exactly one more dollar');
SELECT public.llm_settle((SELECT id FROM test_usage_ids WHERE key='paid-error-global'), 'test-model', 10, 0, 0, 0, 1, 'error', 'api_error', 5);
SELECT is(public.llm_reserve('case-paid-error-global', NULL, NULL, 0, NULL, NULL)->>'reason', 'global_daily', 'a paid error counts toward the global daily cap');
SELECT public.llm_set_controls(false, 100, NULL);

-- Reservations record their provenance.
SELECT public.llm_set_feature_control('case-provenance', true, NULL, NULL, NULL);
INSERT INTO test_usage_ids VALUES ('provenance', (public.llm_reserve('case-provenance', NULL, NULL, 0.01, 'extract', 'ffe-extract@v3')->>'usage_id')::bigint);
SELECT ok((SELECT role = 'extract' AND prompt_version = 'ffe-extract@v3'
             FROM public.llm_usage WHERE id = (SELECT id FROM test_usage_ids WHERE key='provenance')),
          'reservation persists role and prompt_version');

-- The app roles cannot execute any service-only RPC.
SELECT ok(NOT has_function_privilege('anon', 'public.llm_reserve(text,uuid,uuid,numeric,text,text)', 'EXECUTE'), 'anon cannot reserve');
SELECT ok(NOT has_function_privilege('authenticated', 'public.llm_reserve(text,uuid,uuid,numeric,text,text)', 'EXECUTE'), 'authenticated cannot reserve');
SELECT ok(NOT has_function_privilege('anon', 'public.llm_settle(bigint,text,integer,integer,integer,integer,numeric,text,text,integer)', 'EXECUTE'), 'anon cannot settle');
SELECT ok(NOT has_function_privilege('authenticated', 'public.llm_set_controls(boolean,numeric,uuid)', 'EXECUTE'), 'authenticated cannot change controls');
SELECT ok(has_function_privilege('service_role', 'public.llm_reserve(text,uuid,uuid,numeric,text,text)', 'EXECUTE'), 'service_role can reserve');

-- The shared caller resolver runs as service_role; the app roles stay revoked.
SELECT ok(has_function_privilege('service_role', 'public._primary_studio_for(uuid)', 'EXECUTE'), 'service_role can resolve a primary studio');
SELECT ok(NOT has_function_privilege('anon', 'public._primary_studio_for(uuid)', 'EXECUTE'), 'anon cannot resolve a primary studio');
SELECT ok(NOT has_function_privilege('authenticated', 'public._primary_studio_for(uuid)', 'EXECUTE'), 'authenticated cannot resolve a primary studio');

SELECT * FROM finish();
ROLLBACK;
