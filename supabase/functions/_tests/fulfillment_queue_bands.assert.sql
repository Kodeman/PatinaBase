-- BOH Fulfillment Queue — S1 zero-invisibility band audit (spec §5.1).
--
-- "an audit query proves every non-settled order maps to exactly one band" —
-- this file is that audit, plus band-placement checks for the S1 fixture
-- orders (scripts/seed-fulfillment-fixtures.sql) that exercise the action
-- test (the-document R22): a genuinely in-transit order is Watching, never
-- Needs Action Now; an SLA-stale order IS Needs Action Now with a breached
-- flag; the two S0-seeded unmapped-item orders are Needs Action Now via
-- has_unmapped.
--
-- All read-only SELECTs against `fulfillment_queue_v` / `fulfillment_orders`
-- — no BEGIN/ROLLBACK needed, safe to re-run any number of times.
--
-- Prerequisites (loud FAIL, not a vacuous pass, if missing — same discipline
-- as fulfillment_foundation.assert.sql's Part 2):
--   1. `supabase functions serve --env-file supabase/functions/_tests/test.env --no-verify-jwt`
--   2. `pnpm seed:fulfillment`                              (S0's 5 orders)
--   3. `psql ... -f scripts/seed-fulfillment-fixtures.sql`  (S1's 3 fixtures)
--
-- Run (this is exactly what the root `test:boh-audit` script does):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/functions/_tests/fulfillment_queue_bands.assert.sql
--
-- Every case prints "Q# PASS" / "Q# FAIL". A clean run is all PASS.

-- ── Q1: zero-invisibility — every non-settled order appears in EXACTLY one
-- row of fulfillment_queue_v (no order absent, none duplicated). Compared
-- against fulfillment_order_status_v's own derived_status rather than a
-- hardcoded order count, so this keeps holding once S6 lands and orders can
-- actually reach 'settled' (and correctly leave the queue). ────────────────
DO $$
DECLARE
  v_expected int;
  v_actual   int;
  v_distinct int;
  v_dupes    int;
BEGIN
  SELECT count(*) INTO v_expected
    FROM public.fulfillment_order_status_v WHERE derived_status IS DISTINCT FROM 'settled';
  SELECT count(*), count(DISTINCT order_id) INTO v_actual, v_distinct
    FROM public.fulfillment_queue_v;
  SELECT count(*) INTO v_dupes FROM (
    SELECT order_id FROM public.fulfillment_queue_v GROUP BY order_id HAVING count(*) > 1
  ) d;

  IF v_expected = 0 THEN
    RAISE NOTICE 'Q1 FAIL: no orders found — run pnpm seed:fulfillment first';
  ELSIF v_expected = v_actual AND v_actual = v_distinct AND v_dupes = 0 THEN
    RAISE NOTICE 'Q1 PASS: all % non-settled orders appear in fulfillment_queue_v exactly once each', v_expected;
  ELSE
    RAISE NOTICE 'Q1 FAIL: expected=% actual_rows=% distinct_order_ids=% duplicated_order_ids=%',
      v_expected, v_actual, v_distinct, v_dupes;
  END IF;
END $$;

-- ── Q2: every row's band is one of the three known values — no NULL, no
-- stray value a future CASE edit could introduce silently. ─────────────────
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
    FROM public.fulfillment_queue_v
   WHERE band IS NULL OR band NOT IN ('needs_action_now', 'watching', 'quiet');
  IF v_bad = 0 THEN
    RAISE NOTICE 'Q2 PASS: every row has a valid band (needs_action_now | watching | quiet)';
  ELSE
    RAISE NOTICE 'Q2 FAIL: % row(s) have a NULL or unrecognized band', v_bad;
  END IF;
END $$;

-- ── Q3: the S1 "stale" fixture order — unconfirmed intake, backdated past
-- the split-confirm SLA — is Needs Action Now with breached=true. ──────────
DO $$
DECLARE v_band text; v_breached boolean;
BEGIN
  SELECT q.band, q.breached INTO v_band, v_breached
    FROM public.fulfillment_queue_v q
    JOIN public.fulfillment_orders o ON o.id = q.order_id
   WHERE o.stripe_payment_intent_id = 'pi_boh_s1_fixture_stale';

  IF v_band IS NULL THEN
    RAISE NOTICE 'Q3 FAIL: stale fixture order not found — run scripts/seed-fulfillment-fixtures.sql first';
  ELSIF v_band = 'needs_action_now' AND v_breached THEN
    RAISE NOTICE 'Q3 PASS: stale fixture order is needs_action_now with breached=true (terracotta age)';
  ELSE
    RAISE NOTICE 'Q3 FAIL: stale fixture order band=% breached=% (want needs_action_now / true)', v_band, v_breached;
  END IF;
END $$;

-- ── Q4: the S1 "in-transit" fixture order — walked intake -> split ->
-- transmitted -> acknowledged -> shipped through the real RPCs — is Watching,
-- never Needs Action Now (the action test, the-document R22). ──────────────
DO $$
DECLARE v_band text; v_status text;
BEGIN
  SELECT q.band, q.derived_status INTO v_band, v_status
    FROM public.fulfillment_queue_v q
    JOIN public.fulfillment_orders o ON o.id = q.order_id
   WHERE o.stripe_payment_intent_id = 'pi_boh_s1_fixture_intransit';

  IF v_band IS NULL THEN
    RAISE NOTICE 'Q4 FAIL: in-transit fixture order not found — run scripts/seed-fulfillment-fixtures.sql first';
  ELSIF v_band = 'watching' AND v_status = 'shipped' THEN
    RAISE NOTICE 'Q4 PASS: in-transit fixture order is watching (derived_status=shipped)';
  ELSE
    RAISE NOTICE 'Q4 FAIL: in-transit fixture order band=% derived_status=% (want watching / shipped)', v_band, v_status;
  END IF;
END $$;

-- ── Q5: the S1 "delivered" fixture order is Quiet — nothing to actively do
-- until the inspection window closes or S6/S7 exist. ───────────────────────
DO $$
DECLARE v_band text; v_status text;
BEGIN
  SELECT q.band, q.derived_status INTO v_band, v_status
    FROM public.fulfillment_queue_v q
    JOIN public.fulfillment_orders o ON o.id = q.order_id
   WHERE o.stripe_payment_intent_id = 'pi_boh_s1_fixture_delivered';

  IF v_band IS NULL THEN
    RAISE NOTICE 'Q5 FAIL: delivered fixture order not found — run scripts/seed-fulfillment-fixtures.sql first';
  ELSIF v_band = 'quiet' AND v_status = 'delivered' THEN
    RAISE NOTICE 'Q5 PASS: delivered fixture order is quiet (derived_status=delivered)';
  ELSE
    RAISE NOTICE 'Q5 FAIL: delivered fixture order band=% derived_status=% (want quiet / delivered)', v_band, v_status;
  END IF;
END $$;

-- ── Q6: the two S0-seeded unmapped-item orders (pi_boh_seed_3, _4) are
-- Needs Action Now via has_unmapped — the mapping gate, not a coincidence of
-- also being unconfirmed intake. ────────────────────────────────────────────
DO $$
DECLARE v_bad int; v_found int;
BEGIN
  SELECT count(*) INTO v_found
    FROM public.fulfillment_orders
   WHERE stripe_payment_intent_id IN ('pi_boh_seed_3', 'pi_boh_seed_4');

  IF v_found <> 2 THEN
    RAISE NOTICE 'Q6 FAIL: expected the 2 unmapped-item seed orders (pi_boh_seed_3/_4), found %', v_found;
  ELSE
    SELECT count(*) INTO v_bad
      FROM public.fulfillment_queue_v q
      JOIN public.fulfillment_orders o ON o.id = q.order_id
     WHERE o.stripe_payment_intent_id IN ('pi_boh_seed_3', 'pi_boh_seed_4')
       AND (q.band <> 'needs_action_now' OR NOT q.has_unmapped);

    IF v_bad = 0 THEN
      RAISE NOTICE 'Q6 PASS: both unmapped-item seed orders are needs_action_now via has_unmapped';
    ELSE
      RAISE NOTICE 'Q6 FAIL: % of the 2 unmapped-item seed orders are not needs_action_now/has_unmapped', v_bad;
    END IF;
  END IF;
END $$;

-- ── Q7: all three bands are populated (the screenshot's "all three bands
-- populated" requirement, verified in SQL, not just eyeballed). ────────────
DO $$
DECLARE v_nan int; v_watching int; v_quiet int;
BEGIN
  SELECT count(*) FILTER (WHERE band = 'needs_action_now'),
         count(*) FILTER (WHERE band = 'watching'),
         count(*) FILTER (WHERE band = 'quiet')
    INTO v_nan, v_watching, v_quiet
    FROM public.fulfillment_queue_v;

  IF v_nan > 0 AND v_watching > 0 AND v_quiet > 0 THEN
    RAISE NOTICE 'Q7 PASS: all three bands populated (needs_action_now=%, watching=%, quiet=%)', v_nan, v_watching, v_quiet;
  ELSE
    RAISE NOTICE 'Q7 FAIL: needs_action_now=% watching=% quiet=% — run scripts/seed-fulfillment-fixtures.sql for full band coverage', v_nan, v_watching, v_quiet;
  END IF;
END $$;
