-- BOH fulfillment foundation — S0 acceptance assertion script (task C3).
--
-- Two parts:
--   Part 1 (A1-A3) — isolated guard/constraint checks. Runs inside its own
--     fixture-only BEGIN/ROLLBACK, exactly like direct_order_rpc.assert.sql:
--     nothing it does is ever persisted, so it never needs a `db reset` and
--     is safe to re-run any number of times against the SHARED local DB.
--   Part 2 (A4-A7) — read-only checks against the 5 orders POSTed by
--     `pnpm seed:fulfillment` (S0-PLAN.md D8: those orders are NOT produced
--     by a bare `supabase db reset` — they require the fulfillment-intake fn
--     to be served AND the seed script to have run first). These are pure
--     SELECTs; if the seed orders are absent they FAIL loudly (rather than
--     vacuously passing on zero rows) so the missing prerequisite is obvious.
--
-- Run (after `supabase functions serve ...` + `pnpm seed:fulfillment`):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/functions/_tests/fulfillment_foundation.assert.sql
-- (this is exactly what the root `test:boh-audit` script does, plus the
-- offline fulfillment-intake.test.ts Deno suite.)
--
-- Every case prints "A# PASS" / "A# FAIL". A clean run is all PASS.

-- ═══════════════════════════════════════════════════════════════════════════
-- Part 1 — isolated (BEGIN/ROLLBACK, no db reset needed, no seed dependency)
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── A1: an unbalanced ledger entry is rejected — at COMMIT, not at INSERT ──
-- (00352's balance check is a DEFERRED constraint trigger; a mismatched
-- Dr/Cr entry inserts cleanly and only fails when checked. `SET CONSTRAINTS
-- ALL IMMEDIATE` forces that deferred check to run right now instead of
-- waiting for the real COMMIT, so the RAISE can be caught inline.)
DO $$
DECLARE
  v_evt bigint;
BEGIN
  PERFORM set_config('app.fulfillment_writer', 'rpc', true);
  INSERT INTO public.fulfillment_events (event_type, actor)
    VALUES ('test.assert.a1', 'boh_foundation_assert')
    RETURNING id INTO v_evt;

  -- ledger_post is internal (REVOKE ALL from every role, 00352) — reachable
  -- here only because psql's `postgres` role is a superuser and bypasses
  -- grant checks (it does NOT bypass triggers, which is exactly what A1-A3
  -- are testing). Dr 100 on 1000 vs Cr 50 on 4000: each LINE satisfies the
  -- per-line XOR check, but the ENTRY is unbalanced.
  PERFORM public.ledger_post(
    'A1 unbalanced test', v_evt, 'boh_foundation_assert', '{}'::jsonb,
    jsonb_build_array(
      jsonb_build_object('account_code', '1000', 'debit_cents', 100),
      jsonb_build_object('account_code', '4000', 'credit_cents', 50)
    )
  );

  BEGIN
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE NOTICE 'A1 FAIL: expected an unbalanced ledger entry to be rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%unbalanced%' THEN
      RAISE NOTICE 'A1 PASS: %', SQLERRM;
    ELSE
      RAISE NOTICE 'A1 FAIL: wrong error: %', SQLERRM;
    END IF;
  END;
END $$;

-- ── A2: UPDATE and DELETE on fulfillment_events are denied unconditionally ─
-- (append-only trigger — no GUC exemption, fires even with GUC='rpc' set).
DO $$
DECLARE
  v_evt bigint;
BEGIN
  PERFORM set_config('app.fulfillment_writer', 'rpc', true);
  INSERT INTO public.fulfillment_events (event_type, actor)
    VALUES ('test.assert.a2', 'boh_foundation_assert')
    RETURNING id INTO v_evt;

  BEGIN
    UPDATE public.fulfillment_events SET actor = 'tampered' WHERE id = v_evt;
    RAISE NOTICE 'A2a FAIL: expected UPDATE on fulfillment_events to be denied';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%append-only%' THEN
      RAISE NOTICE 'A2a PASS: %', SQLERRM;
    ELSE
      RAISE NOTICE 'A2a FAIL: wrong error: %', SQLERRM;
    END IF;
  END;

  BEGIN
    DELETE FROM public.fulfillment_events WHERE id = v_evt;
    RAISE NOTICE 'A2b FAIL: expected DELETE on fulfillment_events to be denied';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%append-only%' THEN
      RAISE NOTICE 'A2b PASS: %', SQLERRM;
    ELSE
      RAISE NOTICE 'A2b FAIL: wrong error: %', SQLERRM;
    END IF;
  END;
END $$;

-- ── A3: direct INSERT into fulfillment_orders — denied without the GUC,
-- allowed with GUC='rpc' (the writer guard's actual gate, D11 fix). ────────
DO $$
BEGIN
  -- '' is not in ('rpc','migration') — functionally identical to a genuinely
  -- unset GUC for the guard's COALESCE(...,'') NOT IN (...) check (D11).
  PERFORM set_config('app.fulfillment_writer', '', true);
  BEGIN
    INSERT INTO public.fulfillment_orders
      (client_name, captured_total_cents, product_subtotal_cents, freight_charged_cents, tax_cents)
      VALUES ('A3 test — no GUC', 0, 0, 0, 0);
    RAISE NOTICE 'A3a FAIL: expected direct INSERT without the GUC to be denied';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%not permitted%' THEN
      RAISE NOTICE 'A3a PASS: %', SQLERRM;
    ELSE
      RAISE NOTICE 'A3a FAIL: wrong error: %', SQLERRM;
    END IF;
  END;

  PERFORM set_config('app.fulfillment_writer', 'rpc', true);
  BEGIN
    INSERT INTO public.fulfillment_orders
      (client_name, captured_total_cents, product_subtotal_cents, freight_charged_cents, tax_cents)
      VALUES ('A3 test — with GUC=rpc', 0, 0, 0, 0);
    RAISE NOTICE 'A3b PASS: direct INSERT with GUC=rpc succeeded';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'A3b FAIL: unexpected error with GUC=rpc set: %', SQLERRM;
  END;
END $$;

ROLLBACK;

-- ═══════════════════════════════════════════════════════════════════════════
-- Part 2 — read-only, against the 5 `pnpm seed:fulfillment` orders
-- ═══════════════════════════════════════════════════════════════════════════

-- ── A4: every seeded order has exactly one T1 entry, and it's the balanced
-- capture (Dr 1000 = captured_total_cents). The DB's own deferred constraint
-- trigger already guarantees no unbalanced entry could ever have committed —
-- this re-checks Σdebit=Σcredit anyway (belt-and-suspenders) plus the
-- one-entry-per-order idempotency invariant a re-run must preserve. ────────
DO $$
DECLARE
  v_order_count int;
  v_bad_count   int;
BEGIN
  SELECT count(*) INTO v_order_count
    FROM public.fulfillment_orders WHERE stripe_payment_intent_id LIKE 'pi_boh_seed_%';

  IF v_order_count = 0 THEN
    RAISE NOTICE 'A4 FAIL: no seeded orders found — run `pnpm seed:fulfillment` first';
  ELSE
    SELECT count(*) INTO v_bad_count
    FROM public.fulfillment_orders o
    WHERE o.stripe_payment_intent_id LIKE 'pi_boh_seed_%'
      AND (
        (SELECT count(*) FROM public.ledger_entries le
           WHERE le.refs->>'order_id' = o.id::text AND le.refs->>'template' = 'T1') <> 1
        OR NOT EXISTS (
          SELECT 1 FROM public.ledger_entries le
          JOIN public.ledger_lines ll ON ll.entry_id = le.id
          WHERE le.refs->>'order_id' = o.id::text AND le.refs->>'template' = 'T1'
            AND ll.account_code = '1000' AND ll.debit_cents = o.captured_total_cents
        )
        OR EXISTS (
          SELECT 1 FROM public.ledger_entries le
          WHERE le.refs->>'order_id' = o.id::text AND le.refs->>'template' = 'T1'
            AND (SELECT COALESCE(sum(debit_cents), 0) FROM public.ledger_lines WHERE entry_id = le.id)
                <> (SELECT COALESCE(sum(credit_cents), 0) FROM public.ledger_lines WHERE entry_id = le.id)
        )
      );

    IF v_bad_count = 0 THEN
      RAISE NOTICE 'A4 PASS: all % seeded orders have exactly one balanced T1 entry (Dr 1000 = captured_total_cents)', v_order_count;
    ELSE
      RAISE NOTICE 'A4 FAIL: % of % seeded orders have a missing/duplicate/unbalanced T1 entry', v_bad_count, v_order_count;
    END IF;
  END IF;
END $$;

-- ── A5: exactly 2 order lines mapping_state='unmapped' (the two bff… ids in
-- fulfillment-catalog-dev.sql, referenced by exactly 2 seed-script lines). ──
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.fulfillment_order_items WHERE mapping_state = 'unmapped';
  IF v_n = 2 THEN
    RAISE NOTICE 'A5 PASS: exactly 2 unmapped order lines';
  ELSE
    RAISE NOTICE 'A5 FAIL: expected 2 unmapped lines, found %', v_n;
  END IF;
END $$;

-- ── A6: 5 orders exist; every non-cancelled line sits in line_state='intake'
-- (nothing in S0 ever transitions a line past intake). ──────────────────────
DO $$
DECLARE
  v_order_count int;
  v_bad_lines   int;
BEGIN
  SELECT count(*) INTO v_order_count FROM public.fulfillment_orders;
  SELECT count(*) INTO v_bad_lines
    FROM public.fulfillment_order_items
    WHERE line_state NOT IN ('intake', 'cancelled');

  IF v_order_count = 5 AND v_bad_lines = 0 THEN
    RAISE NOTICE 'A6 PASS: 5 orders exist, every non-cancelled line is in intake';
  ELSE
    RAISE NOTICE 'A6 FAIL: order_count=% (want 5), non-intake/non-cancelled lines=% (want 0)', v_order_count, v_bad_lines;
  END IF;
END $$;

-- ── A7: every order has BOTH an order.intake and a ledger.posted event — no
-- state change without an event (§11's core invariant). ─────────────────────
DO $$
DECLARE v_missing int;
BEGIN
  SELECT count(*) INTO v_missing
  FROM public.fulfillment_orders o
  WHERE NOT EXISTS (
          SELECT 1 FROM public.fulfillment_events e
          WHERE e.order_id = o.id AND e.event_type = 'order.intake')
     OR NOT EXISTS (
          SELECT 1 FROM public.fulfillment_events e
          WHERE e.order_id = o.id AND e.event_type = 'ledger.posted');

  IF v_missing = 0 THEN
    RAISE NOTICE 'A7 PASS: every order has both an order.intake and a ledger.posted event';
  ELSE
    RAISE NOTICE 'A7 FAIL: % order(s) missing order.intake and/or ledger.posted', v_missing;
  END IF;
END $$;
