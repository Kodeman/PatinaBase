-- BOH Order Workbench — S2 confirm-split evidence assertions.
--
-- Read-only checks against the 5-vendor seeded order (pi_boh_seed_1, order_no 1,
-- "Priya Anand") AFTER its split has been confirmed — by the Playwright spec
-- (boh-workbench.spec.ts) or a manual fulfillment_confirm_split. Proves the S2
-- accepts-when at the database: confirm groups the 5 lines into 5 POs numbered
-- A…E with the right side-marks, advances every line to 'split', and events
-- everything (§11). If order 1 is still pre-confirm, W0 SKIPs (this is evidence,
-- not part of test:boh-audit — running it needs a confirmed order).
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/functions/_tests/fulfillment_workbench.assert.sql

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_order   uuid;
  v_no      bigint;
  v_year    text := to_char(now(), 'YYYY');
  v_po_cnt  int;
  v_bad_po  int;
  v_bad_ln  int;
  v_split   int;
  v_total   int;
  v_created int;
  v_changed int;
  v_moved   int;
BEGIN
  SELECT id, order_no INTO v_order, v_no
    FROM public.fulfillment_orders WHERE stripe_payment_intent_id = 'pi_boh_seed_1';
  IF v_order IS NULL THEN
    RAISE NOTICE 'W0 SKIP: pi_boh_seed_1 not found — run `pnpm seed:fulfillment` first';
    RETURN;
  END IF;

  SELECT count(*) INTO v_po_cnt FROM public.fulfillment_vendor_pos WHERE order_id = v_order;
  IF v_po_cnt = 0 THEN
    RAISE NOTICE 'W0 SKIP: order 1 (#%) not confirmed yet — no POs. Confirm the split first.', v_no;
    RETURN;
  END IF;

  -- W1: exactly 5 POs, numbered PO-<year>-<order_no padded>-A..E, side_mark set.
  SELECT count(*) INTO v_bad_po
    FROM public.fulfillment_vendor_pos p
   WHERE p.order_id = v_order
     AND (p.po_number !~ ('^PO-' || v_year || '-' || lpad(v_no::text, 5, '0') || '-[A-E]$')
          OR p.side_mark <> ('PRIYA ANAND-' || v_no));
  IF v_po_cnt = 5 AND v_bad_po = 0 THEN
    RAISE NOTICE 'W1 PASS: 5 POs PO-%-%-A..E, side_mark PRIYA ANAND-%', v_year, lpad(v_no::text,5,'0'), v_no;
  ELSE
    RAISE NOTICE 'W1 FAIL: po_count=% (want 5), malformed po_number/side_mark rows=%', v_po_cnt, v_bad_po;
  END IF;

  -- W2: every non-cancelled line is in 'split' (or beyond — a later slice may
  -- advance them; confirm's own effect is intake→split).
  SELECT count(*) FILTER (WHERE line_state = 'split'), count(*)
    INTO v_split, v_total
    FROM public.fulfillment_order_items
   WHERE order_id = v_order AND line_state <> 'cancelled';
  SELECT count(*) INTO v_bad_ln
    FROM public.fulfillment_order_items
   WHERE order_id = v_order
     AND line_state NOT IN ('split','transmitted','acknowledged','in_production','shipped','delivered','settled','cancelled');
  IF v_bad_ln = 0 AND v_total = 5 THEN
    RAISE NOTICE 'W2 PASS: all 5 lines advanced out of intake (% in split)', v_split;
  ELSE
    RAISE NOTICE 'W2 FAIL: % of 5 lines still pre-split (total non-cancelled=%)', v_bad_ln, v_total;
  END IF;

  -- W3: events logged — 5 po.created + 5 line.state_changed (intake→split).
  SELECT count(*) INTO v_created FROM public.fulfillment_events
   WHERE order_id = v_order AND event_type = 'po.created';
  SELECT count(*) INTO v_changed FROM public.fulfillment_events
   WHERE order_id = v_order AND event_type = 'line.state_changed';
  SELECT count(*) INTO v_moved FROM public.fulfillment_events
   WHERE order_id = v_order AND event_type = 'line.moved';
  IF v_created >= 5 AND v_changed >= 5 THEN
    RAISE NOTICE 'W3 PASS: events — po.created=%, line.state_changed=%, line.moved=%', v_created, v_changed, v_moved;
  ELSE
    RAISE NOTICE 'W3 FAIL: po.created=% (want>=5), line.state_changed=% (want>=5)', v_created, v_changed;
  END IF;
END $$;

-- Evidence dump.
SELECT p.po_number, v.name AS vendor, p.status, p.side_mark, p.product_cost_cents
  FROM public.fulfillment_vendor_pos p
  JOIN public.vendors v ON v.id = p.vendor_id
  JOIN public.fulfillment_orders o ON o.id = p.order_id
 WHERE o.stripe_payment_intent_id = 'pi_boh_seed_1'
 ORDER BY p.po_number;

SELECT i.line_index, i.item_name, i.line_state
  FROM public.fulfillment_order_items i
  JOIN public.fulfillment_orders o ON o.id = i.order_id
 WHERE o.stripe_payment_intent_id = 'pi_boh_seed_1'
 ORDER BY i.line_index;
