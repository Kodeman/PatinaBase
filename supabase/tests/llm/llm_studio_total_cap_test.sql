-- ═══════════════════════════════════════════════════════════════════════════
-- llm_reserve cross-feature studio monthly cap — migration 00788
-- Transaction-wrapped; only test rows are rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(10);

SELECT public.llm_set_controls(false, 10000, NULL, 50, true);
SELECT public.llm_set_feature_control('total-cap-a', true, NULL, NULL, NULL);
SELECT public.llm_set_feature_control('total-cap-b', true, NULL, NULL, NULL);
SELECT public.llm_set_feature_control('total-cap-feature-limited', true, NULL, 1, NULL);
CREATE TEMP TABLE total_cap_ids (name text PRIMARY KEY, id bigint);

-- Two features contribute to one studio's total; a different studio is isolated.
INSERT INTO total_cap_ids VALUES ('settled', (public.llm_reserve('total-cap-a', '93000000-0000-4000-8000-000000000001', NULL, 30, NULL, NULL)->>'usage_id')::bigint);
SELECT public.llm_settle((SELECT id FROM total_cap_ids WHERE name='settled'), 'test', 1, 1, 0, 0, 30, 'settled', NULL, 1);
SELECT is(public.llm_reserve('total-cap-b', '93000000-0000-4000-8000-000000000001', NULL, 21, NULL, NULL)->>'reason',
          'studio_cap', 'the default cap sums spend across features');
SELECT ok((public.llm_reserve('total-cap-b', '93000000-0000-4000-8000-000000000002', NULL, 30, NULL, NULL)->>'granted')::boolean,
          'another studio has its own monthly allowance');

-- Studio override is the cross-feature total, but does not replace a feature cap.
SELECT public.llm_set_studio_override('93000000-0000-4000-8000-000000000001', 80, NULL);
SELECT ok((public.llm_reserve('total-cap-b', '93000000-0000-4000-8000-000000000001', NULL, 30, NULL, NULL)->>'granted')::boolean,
          'studio override raises the total cap across features');
SELECT public.llm_set_studio_override('93000000-0000-4000-8000-000000000003', 80, NULL);
SELECT is(public.llm_reserve('total-cap-feature-limited', '93000000-0000-4000-8000-000000000003', NULL, 2, NULL, NULL)->>'reason',
          'studio_monthly', 'override does not replace the feature monthly cap');

-- Reserved estimates count before settlement.
SELECT public.llm_set_controls(false, 10000, NULL, 50, true);
INSERT INTO total_cap_ids VALUES ('reserved', (public.llm_reserve('total-cap-a', '93000000-0000-4000-8000-000000000004', NULL, 30, NULL, NULL)->>'usage_id')::bigint);
SELECT is(public.llm_reserve('total-cap-b', '93000000-0000-4000-8000-000000000004', NULL, 21, NULL, NULL)->>'reason',
          'studio_cap', 'unsettled reservations count toward the total cap');

-- Prior-month spend does not consume the current UTC month allowance.
INSERT INTO public.llm_usage(at, feature, studio_id, usd, status)
VALUES (date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '1 second',
        'total-cap-a', '93000000-0000-4000-8000-000000000005', 49, 'settled');
SELECT ok((public.llm_reserve('total-cap-b', '93000000-0000-4000-8000-000000000005', NULL, 50, NULL, NULL)->>'granted')::boolean,
          'monthly accounting resets at the UTC month boundary');

-- A cap-only post updates and audits only that value; three-argument callers remain valid.
SELECT public.llm_set_controls(true, 10000, NULL, 50, true);
CREATE TEMP TABLE total_cap_audit_before AS SELECT COALESCE(max(id), 0)::bigint AS id FROM public.llm_controls_audit WHERE target='controls';
SELECT public.llm_set_controls(NULL, NULL, NULL, 25, true);
SELECT ok((SELECT kill_switch AND studio_monthly_cap_usd = 25 FROM public.llm_controls WHERE id),
          'cap-only update leaves the kill switch unchanged');
SELECT ok(EXISTS (SELECT 1 FROM public.llm_controls_audit
                    WHERE target='controls' AND id > (SELECT id FROM total_cap_audit_before)
                      AND after->>'studio_monthly_cap_usd' = '25.00'),
          'cap-only update writes the new value to the controls audit');
SELECT public.llm_set_controls(false, 10000, NULL, NULL, true);
SELECT ok((public.llm_reserve('total-cap-a', '93000000-0000-4000-8000-000000000006', NULL, 500, NULL, NULL)->>'granted')::boolean,
          'a NULL default means uncapped');
SELECT public.llm_set_controls(false, 10000, NULL, 50, true);
SELECT public.llm_set_controls(false, 10000, NULL);
SELECT ok((SELECT studio_monthly_cap_usd = 50 FROM public.llm_controls WHERE id),
          'legacy three-argument setter does not overwrite the monthly cap');

SELECT * FROM finish();
ROLLBACK;
