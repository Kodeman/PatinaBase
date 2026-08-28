-- ═══════════════════════════════════════════════════════════════════════════
-- The intake split must sum to what was captured (migration 00540 / W5)
--
-- WHY THIS FILE EXISTS. fulfillment_intake_order writes four numbers onto
-- fulfillment_orders and immediately posts a T1 ledger entry from them
-- (00353:130 → 00352:170-186):
--
--     Dr 1000 captured_total  =  Cr 4000 subtotal + Cr 4100 freight + Cr 2100 tax
--
-- That identity is enforced TWICE, and the order matters:
--
--   1. `chk_fulfillment_captured_identity` (00360:428-430) — a plain table
--      CHECK, `captured = subtotal + freight + tax`. It fires on the INSERT,
--      so an unbalanced split never reaches the ledger at all. This is the arm
--      that actually catches it, and this file asserts it by name.
--   2. `trg_ledger_entry_balanced` (00352:106-109) — a CONSTRAINT TRIGGER,
--      DEFERRABLE INITIALLY DEFERRED, checked at COMMIT. Unreachable while (1)
--      holds, and asserted here only as the belt behind the braces.
--
-- Either way the whole intake transaction aborts: no fulfillment_orders row, no
-- lines, no "where is it" for the client, and a fulfillment_intake task that
-- fails identically on every retry until it parks.
--
-- A direct order can arm exactly that. Its PaymentIntent metadata is stamped
-- when the Checkout session OPENS, before Stripe Tax or a shipping rate has
-- added anything, and normalizeIntakePayload falls back to `pi.amount` for the
-- captured total — so with fulfillment_config direct_orders.tax_shipping_enabled
-- flipped on, captured would carry the tax and the three credits would not.
-- stripe-webhook therefore computes the split from the settled session
-- (directOrderTotalsFromSession) and passes it on the task payload, where
-- normalizeIntakePayload's overrides use it in place of the metadata.
--
-- The deno suite proves the arithmetic is balanced by construction. THIS file
-- proves the other half — that the database really does reject the split the
-- old code would have produced — because a test that only checked our own
-- helper would pass just as happily if the ledger did not care.
--
-- `SET CONSTRAINTS ALL IMMEDIATE` is what makes it observable inside a single
-- rolled-back transaction: switching a deferred constraint to immediate checks
-- retroactively, so it fires the pending balance check at that statement rather
-- than at a COMMIT this file deliberately never performs. It is issued AFTER
-- each intake, never before — the entry row is inserted before its lines, so a
-- transaction that is immediate throughout trips the ">= 2 lines" arm of the
-- same trigger and proves nothing about the balance.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/commercial/fulfillment_intake_ledger_balance_test.sql
--
-- Single transaction; ROLLBACK at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.intake_payload(
  p_pi TEXT, p_captured INT, p_subtotal INT, p_freight INT, p_tax INT
) RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'payment_intent', jsonb_build_object('id', p_pi, 'livemode', false),
    'client',   jsonb_build_object('name', 'Ledger Client', 'email', 'ledger@test.invalid',
                                   'profile_id', NULL),
    'designer', jsonb_build_object('profile_id', NULL, 'designer_client_id', NULL,
                                   'attribution', NULL),
    'ship_to',  NULL,
    'totals',   jsonb_build_object('captured_total_cents', p_captured,
                                   'product_subtotal_cents', p_subtotal,
                                   'freight_charged_cents', p_freight,
                                   'tax_cents', p_tax),
    'lines',    jsonb_build_array(jsonb_build_object(
                  'item_name', 'DO Ledger Piece', 'qty', 1, 'unit_price_cents', p_subtotal))
  );
$$ LANGUAGE sql;

DO $$
DECLARE
  v_order  uuid;
  n        int;
  v_failed boolean := FALSE;
  v_msg    text;
BEGIN
  -- ═══ 1. The split the fixed settle produces: piece 4200.00 + freight 180.00
  --        + Stripe Tax 332.00 = 4712.00 captured. Files, and balances.
  v_order := public.fulfillment_intake_order(
    pg_temp.intake_payload('pi_ledger_balanced_0001', 471200, 420000, 18000, 33200), 'test');
  EXECUTE 'SET CONSTRAINTS ALL IMMEDIATE';   -- fires the balance check now
  EXECUTE 'SET CONSTRAINTS ALL DEFERRED';

  ASSERT v_order IS NOT NULL, 'a balanced split must file an order';

  SELECT count(*) INTO n FROM public.fulfillment_orders
   WHERE id = v_order AND captured_total_cents = 471200 AND tax_cents = 33200
     AND freight_charged_cents = 18000 AND product_subtotal_cents = 420000;
  ASSERT n = 1, 'and the four numbers must land as given, got ' || n;

  SELECT count(*) INTO n FROM public.ledger_entries e
    JOIN public.ledger_lines l ON l.entry_id = e.id
   WHERE (e.refs->>'order_id')::uuid = v_order;
  ASSERT n = 4, 'the T1 entry posts four lines, got ' || n;

  -- ═══ 2. The split the PRE-FIX metadata would have produced with the flag on:
  --        the same captured total (pi.amount includes the tax), tax hardcoded
  --        to 0. 471200 <> 420000 + 18000 + 0, and 00360's table CHECK refuses
  --        the row outright — taking the whole intake with it.
  BEGIN
    PERFORM public.fulfillment_intake_order(
      pg_temp.intake_payload('pi_ledger_unbalanced_0002', 471200, 420000, 18000, 0), 'test');
    EXECUTE 'SET CONSTRAINTS ALL IMMEDIATE';
  EXCEPTION WHEN OTHERS THEN
    v_failed := TRUE;
    v_msg := SQLERRM;
  END;

  ASSERT v_failed,
    'a split that does not sum to the captured total must be refused — it is '
    'the whole reason stripe-webhook stamps the settled session''s numbers '
    'rather than the pre-Checkout metadata''s';
  ASSERT v_msg LIKE '%chk_fulfillment_captured_identity%',
    'and refused by the captured-total identity, not by something else: ' || COALESCE(v_msg, 'NULL');

  SELECT count(*) INTO n FROM public.fulfillment_orders
   WHERE stripe_payment_intent_id = 'pi_ledger_unbalanced_0002';
  ASSERT n = 0,
    'and the refusal takes the whole intake with it — no order row survives, '
    'which is why the failure is invisible to anyone not reading agent_tasks';
END $$;

ROLLBACK;
