-- direct-orders-dev.sql — Daily Return W5 dev seed.
--
-- Two things, both so a walk has something honest to walk on:
--
--   1. photo_verified_at on the catalog rows that already carry the rest of
--      the buyability gate. Without it create_direct_order (00540) refuses
--      EVERY piece and Path A cannot be walked at all.
--
--   2. One fulfillment_orders row for client@patina.dev with a shipped line,
--      so Studio → Ordered has a designer-rail row before anyone has bought
--      anything — which is the case direction B §5 cares most about ("the
--      dining table Leah ordered is a Rail-A row today, invisible to the
--      client app").
--
-- Runs after products.sql (the products must exist) and after
-- fulfillment-catalog-dev.sql (which sets vendor_id / price_trade on some of
-- the same rows). Idempotent: re-running changes nothing.

-- ─── 1. The buyability gate has pieces that pass ────────────────────────────
--
-- Data-driven rather than a hardcoded id list, so it stays true if products.sql
-- moves: verify the photography on exactly the rows that already have a size, a
-- lead time and a maker, and are a seller of record. That is 7 of the 21
-- catalog rows today (the Heirloom Oak Dining Table, Walnut Credenza,
-- Live-Edge Coffee Table, Hand-Forged Iron Shelf, Meadow Linen Sectional,
-- Velvet Club Chair and Marble Side Table). The other 14 keep the honest
-- refusal, so the gate-failed variant has something to draw too.
--
-- What this asserts is what the column means (00533): "a human last confirmed
-- the photography on this row is the piece it claims to be". On a dev stack
-- that human is the seed, and the pictures are stock — which is exactly why
-- this file is not in the staging sql_paths derivation by accident but by
-- being a local/staging dev seed like every other row here.
--
-- shipping_flat_cents is deliberately NOT seeded. W1b left it NULL because
-- nothing has ever written it and the honest render of an unknown freight is
-- nothing; 00540 folds it when it exists and adds no "Delivery" line when it
-- does not. So no walked order carries freight, and the fold is proven by the
-- test suites instead.

UPDATE public.products
   SET photo_verified_at = NOW() - INTERVAL '3 days'
 WHERE layer = 'catalog'
   AND deleted_at IS NULL
   AND photo_verified_at IS NULL
   AND dimensions IS NOT NULL
   AND lead_time_weeks IS NOT NULL
   AND brand IS NOT NULL AND btrim(brand) <> ''
   AND price_retail > 0
   AND patina_managed = TRUE;

-- ─── 2. One designer-sourced order already on the rail ──────────────────────
--
-- Inserted directly rather than through fulfillment_intake_order, because the
-- RPC mints a line at 'intake' and getting it to 'shipped' means walking five
-- operator RPCs that have nothing to do with W5. The consequence, stated: this
-- order has NO ledger entries and NO fulfillment_events, so it is a client-side
-- fixture and not an ops-side one. A real settled order (the walk's own) gets
-- both, through the enqueue → fulfillment-intake path stripe-webhook now fires.
--
-- fulfillment_* tables are writer-guarded (00350:298-301), so the GUC and the
-- inserts must be one statement — a DO block — exactly as 00351:101 does. The
-- ids are fixed so a re-run is a no-op.

DO $$
DECLARE
  c_order  CONSTANT uuid := 'f5000000-0000-4000-8000-000000000001';
  c_item   CONSTANT uuid := 'f5000000-0000-4000-8000-000000000002';
  c_po     CONSTANT uuid := 'f5000000-0000-4000-8000-000000000003';
  c_poline CONSTANT uuid := 'f5000000-0000-4000-8000-000000000004';
  c_ship   CONSTANT uuid := 'f5000000-0000-4000-8000-000000000005';
  v_client   uuid;
  v_designer uuid;
  v_product  public.products;
  v_vendor   uuid;
BEGIN
  PERFORM set_config('app.fulfillment_writer', 'migration', true);

  SELECT id INTO v_client   FROM public.profiles WHERE email = 'client@patina.dev';
  SELECT id INTO v_designer FROM public.profiles WHERE email = 'designer@patina.dev';
  SELECT * INTO v_product   FROM public.products WHERE id = 'a0000000-0000-0000-0000-000000000010';  -- Meadow Linen Sectional

  IF v_client IS NULL OR v_product.id IS NULL THEN
    RAISE NOTICE 'direct-orders-dev: client@patina.dev or the seeded sectional is missing — skipping the fulfillment fixture';
    RETURN;
  END IF;

  -- The PO needs a vendor; fulfillment-catalog-dev.sql maps this product to
  -- one. Fall back to any vendor rather than skipping the whole fixture.
  v_vendor := COALESCE(v_product.vendor_id, (SELECT id FROM public.vendors ORDER BY name LIMIT 1));
  IF v_vendor IS NULL THEN
    RAISE NOTICE 'direct-orders-dev: no vendors seeded — skipping the fulfillment fixture';
    RETURN;
  END IF;

  INSERT INTO public.fulfillment_orders (
    id, stripe_payment_intent_id, client_name, client_email, ship_to,
    client_profile_id, designer_profile_id, designer_client_id, designer_attribution,
    captured_total_cents, product_subtotal_cents, freight_charged_cents, tax_cents, intake_at
  ) VALUES (
    c_order, 'pi_seed_designer_sourced_0001', 'Client User', 'client@patina.dev',
    jsonb_build_object(
      'name', 'Client User',
      'address', jsonb_build_object(
        'line1', '1412 Aspen Grove Rd', 'line2', NULL, 'city', 'Aspen',
        'state', 'CO', 'postal_code', '81611', 'country', 'US')),
    v_client, v_designer,
    (SELECT id FROM public.designer_clients
      WHERE client_id = v_client AND designer_id = v_designer
      ORDER BY created_at DESC LIMIT 1),
    jsonb_build_object('source', 'designer_sourced', 'note', 'Seeded fixture — Leah bought this on the client''s behalf'),
    v_product.price_retail, v_product.price_retail, 0, 0,
    NOW() - INTERVAL '21 days'
  ) ON CONFLICT (id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN;  -- already seeded; leave every child row alone
  END IF;

  INSERT INTO public.fulfillment_order_items (
    id, order_id, product_id, item_name, vendor_sku, qty,
    unit_price_cents, unit_cost_cents, vendor_id, mapping_state,
    line_state, line_state_entered_at, line_index
  ) VALUES (
    c_item, c_order, v_product.id, v_product.name, NULL, 1,
    v_product.price_retail, v_product.price_trade, v_vendor, 'mapped',
    'shipped', NOW() - INTERVAL '4 days', 1
  );

  INSERT INTO public.fulfillment_vendor_pos (
    id, order_id, vendor_id, po_number, status, terms,
    product_cost_cents, freight_cost_cents, transmitted_at, acked_at, status_entered_at
  ) VALUES (
    c_po, c_order, v_vendor, 'PO-SEED-0001', 'shipped', 'net_30',
    COALESCE(v_product.price_trade, 0), 0,
    NOW() - INTERVAL '20 days', NOW() - INTERVAL '19 days', NOW() - INTERVAL '4 days'
  );

  -- shipments before po_lines: po_lines.shipment_id FKs to it (00350:155).
  INSERT INTO public.fulfillment_shipments (
    id, po_id, mode, carrier, tracking, shipped_at, current_eta, inspection_window_days
  ) VALUES (
    c_ship, c_po, 'white_glove', 'Pilot Freight', 'PFS4820117744',
    NOW() - INTERVAL '4 days', (NOW() + INTERVAL '6 days')::date, 3
  );

  INSERT INTO public.fulfillment_vendor_po_lines (id, po_id, order_item_id, qty, unit_cost_cents, shipment_id)
  VALUES (c_poline, c_po, c_item, 1, COALESCE(v_product.price_trade, 0), c_ship);

  UPDATE public.fulfillment_order_items SET po_line_id = c_poline WHERE id = c_item;
END $$;
