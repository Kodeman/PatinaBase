-- ═══════════════════════════════════════════════════════════════════════════
-- Marketplace Vitals tests (migration 00301, WP-1.2)
--
-- metric_thresholds and marketplace_vitals are objects this migration alone
-- owns (no other Agent OS migration touches them), so — unlike groom_test's
-- agent_tasks isolation dance — this file does not need to quarantine dev
-- seed rows out of the tables it asserts against.
--
-- Exercises:
--   (i)   exactly 4 metric_thresholds rows seeded, correct keys/order/active.
--   (ii)  get_marketplace_vitals() returns exactly 4 rows, ordered by
--         display_order.
--   (iii) attach_rate's row is always band='neutral' (active=false branch),
--         regardless of whatever thresholds it carries.
--   (iv)  every metric whose CURRENT matview value is NULL bands 'neutral'
--         (the value-is-null branch) — asserted generically over whichever
--         rows are null right now, so this holds regardless of what local
--         dev data happens to contain.
--   (v)   band bound-crossing (green/yellow/red) exercised for real against
--         whichever metric currently has a NON-NULL matview value — bounds
--         are computed RELATIVE to that live value (not hardcoded), so the
--         test doesn't depend on a specific seed dataset. If every metric is
--         null right now (a maximally-empty local DB), this section
--         self-reports "SKIPPED" via RAISE NOTICE rather than failing — the
--         neutral-path coverage in (iv) still holds unconditionally.
--   (vi)  the neutral-thresholds branch (all four bounds NULL) still reads
--         'neutral' even when the value is non-null.
--   (vii) the cron registration (jobname='marketplace-vitals-nightly')
--         exists exactly once.
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/agent_os/vitals_test.sql
--
-- Single transaction, ROLLBACK at the end — re-runnable with no side effects.
-- Does NOT call refresh_marketplace_vitals() (band tests only need to move
-- threshold BOUNDS around the already-materialized value, not the value
-- itself) — safe to run against the shared local DB alongside concurrent
-- agents without racing a matview refresh or minting extra job_runs rows.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── (i) exactly 4 threshold rows, correct keys/order/active ─────────────────
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.metric_thresholds;
  ASSERT v_count = 4, 'FAIL (i): expected exactly 4 metric_thresholds rows, got ' || v_count;

  ASSERT (SELECT display_order FROM public.metric_thresholds WHERE metric_key = 'liquidity_ratio') = 1,
    'FAIL (i): liquidity_ratio should be display_order 1';
  ASSERT (SELECT display_order FROM public.metric_thresholds WHERE metric_key = 'gmv_per_designer_30d') = 2,
    'FAIL (i): gmv_per_designer_30d should be display_order 2';
  ASSERT (SELECT display_order FROM public.metric_thresholds WHERE metric_key = 'take_rate_pct') = 3,
    'FAIL (i): take_rate_pct should be display_order 3';
  ASSERT (SELECT display_order FROM public.metric_thresholds WHERE metric_key = 'attach_rate') = 4,
    'FAIL (i): attach_rate should be display_order 4';

  ASSERT (SELECT active FROM public.metric_thresholds WHERE metric_key = 'attach_rate') = false,
    'FAIL (i): attach_rate should be seeded active=false (WP-3.1 placeholder)';
  ASSERT (SELECT count(*) FROM public.metric_thresholds WHERE active = true) = 3,
    'FAIL (i): expected exactly 3 active threshold rows';

  RAISE NOTICE 'Case (i) threshold seed passed.';
END
$$;

-- ── (ii) get_marketplace_vitals() returns exactly 4 rows, ordered ───────────
DO $$
DECLARE
  v_count int;
  v_keys  text[];
BEGIN
  SELECT count(*) INTO v_count FROM public.get_marketplace_vitals();
  ASSERT v_count = 4, 'FAIL (ii): expected exactly 4 rows from get_marketplace_vitals(), got ' || v_count;

  SELECT array_agg(metric_key ORDER BY display_order) INTO v_keys FROM public.get_marketplace_vitals();
  ASSERT v_keys = ARRAY['liquidity_ratio','gmv_per_designer_30d','take_rate_pct','attach_rate'],
    'FAIL (ii): unexpected metric_key order, got ' || v_keys::text;

  RAISE NOTICE 'Case (ii) get_marketplace_vitals row count + order passed.';
END
$$;

-- ── (iii) attach_rate always neutral (active=false branch) ──────────────────
DO $$
DECLARE
  v_band text;
BEGIN
  SELECT band INTO v_band FROM public.get_marketplace_vitals() WHERE metric_key = 'attach_rate';
  ASSERT v_band = 'neutral', 'FAIL (iii): attach_rate band should be neutral (inactive), got ' || v_band;

  -- Even if attach_rate somehow got tight green bounds, active=false must win.
  UPDATE public.metric_thresholds
     SET green_min = 0, green_max = 0
   WHERE metric_key = 'attach_rate';
  SELECT band INTO v_band FROM public.get_marketplace_vitals() WHERE metric_key = 'attach_rate';
  ASSERT v_band = 'neutral', 'FAIL (iii): attach_rate band should stay neutral even with tight bounds while inactive, got ' || v_band;

  RAISE NOTICE 'Case (iii) inactive-tile neutral-band passed.';
END
$$;

-- ── (iv) every currently-null-value metric bands neutral ────────────────────
DO $$
DECLARE
  v_null_count int;
BEGIN
  SELECT count(*) INTO v_null_count FROM public.get_marketplace_vitals() WHERE value IS NULL;
  ASSERT (SELECT count(*) FROM public.get_marketplace_vitals() WHERE value IS NULL AND band <> 'neutral') = 0,
    'FAIL (iv): every null-value metric must band neutral';
  RAISE NOTICE 'Case (iv) null-value neutral-band passed (% of 4 metrics currently null).', v_null_count;
END
$$;

-- ── (v) green/yellow/red bound-crossing against a live non-null value ───────
-- Picks whichever ACTIVE metric currently has a non-null matview value (gmv
-- and take_rate carry real thresholds; if both happen to be null in this
-- dataset, no active metric is available and the section self-skips).
DO $$
DECLARE
  v_key   text;
  v_value numeric;
  v_band  text;
BEGIN
  SELECT metric_key, value INTO v_key, v_value
    FROM public.get_marketplace_vitals()
   WHERE value IS NOT NULL AND active = true
   ORDER BY display_order
   LIMIT 1;

  IF v_key IS NULL THEN
    RAISE NOTICE 'Case (v) SKIPPED: no active metric currently has a non-null matview value in this dataset.';
  ELSE
    RAISE NOTICE 'Case (v) exercising bound-crossing on %, live value=%', v_key, v_value;

    -- green: bounds straddle the live value.
    UPDATE public.metric_thresholds
       SET green_min = v_value - 1, green_max = v_value + 1,
           yellow_min = v_value - 5, yellow_max = v_value + 5
     WHERE metric_key = v_key;
    SELECT band INTO v_band FROM public.get_marketplace_vitals() WHERE metric_key = v_key;
    ASSERT v_band = 'green', 'FAIL (v): expected green when value inside green bounds, got ' || v_band;

    -- yellow: green bounds moved away, yellow bounds still straddle.
    UPDATE public.metric_thresholds
       SET green_min = v_value + 10, green_max = v_value + 20,
           yellow_min = v_value - 5, yellow_max = v_value + 5
     WHERE metric_key = v_key;
    SELECT band INTO v_band FROM public.get_marketplace_vitals() WHERE metric_key = v_key;
    ASSERT v_band = 'yellow', 'FAIL (v): expected yellow when value outside green but inside yellow bounds, got ' || v_band;

    -- red: both bounds moved away from the live value.
    UPDATE public.metric_thresholds
       SET green_min = v_value + 10, green_max = v_value + 20,
           yellow_min = v_value + 10, yellow_max = v_value + 20
     WHERE metric_key = v_key;
    SELECT band INTO v_band FROM public.get_marketplace_vitals() WHERE metric_key = v_key;
    ASSERT v_band = 'red', 'FAIL (v): expected red when value outside both green and yellow bounds, got ' || v_band;

    RAISE NOTICE 'Case (v) green/yellow/red bound-crossing passed on %.', v_key;
  END IF;
END
$$;

-- ── (vi) all-null thresholds -> neutral even with a non-null value ──────────
DO $$
DECLARE
  v_key   text;
  v_band  text;
BEGIN
  SELECT metric_key INTO v_key
    FROM public.get_marketplace_vitals()
   WHERE value IS NOT NULL AND active = true
   ORDER BY display_order
   LIMIT 1;

  IF v_key IS NULL THEN
    RAISE NOTICE 'Case (vi) SKIPPED: no active metric currently has a non-null matview value in this dataset.';
  ELSE
    UPDATE public.metric_thresholds
       SET green_min = NULL, green_max = NULL, yellow_min = NULL, yellow_max = NULL
     WHERE metric_key = v_key;
    SELECT band INTO v_band FROM public.get_marketplace_vitals() WHERE metric_key = v_key;
    ASSERT v_band = 'neutral', 'FAIL (vi): expected neutral when all four bounds are null, got ' || v_band;
    RAISE NOTICE 'Case (vi) all-null-thresholds neutral-band passed on %.', v_key;
  END IF;
END
$$;

-- ── (vii) cron registration exists exactly once ──────────────────────────────
DO $$
DECLARE
  v_cron_count int;
BEGIN
  SELECT count(*) INTO v_cron_count FROM cron.job WHERE jobname = 'marketplace-vitals-nightly';
  ASSERT v_cron_count = 1, 'FAIL (vii): expected exactly 1 marketplace-vitals-nightly cron.job row, got ' || v_cron_count;
  RAISE NOTICE 'Case (vii) cron registration passed.';
END
$$;

DO $$ BEGIN RAISE NOTICE 'All vitals_test assertions passed.'; END $$;

ROLLBACK;
