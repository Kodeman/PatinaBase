-- ═══════════════════════════════════════════════════════════════════════════
-- The client's leg on the fulfillment rail (migration 00540 — Q6)
--
-- Before 00540 a homeowner held 00350's blanket `GRANT SELECT … TO
-- authenticated` on all eight BOH tables and matched none of its policies
-- (admin-domain and agent_reader only), so she read zero rows and "where is
-- it" had no answer — not for the piece she bought herself, and not for the
-- piece her designer bought for her, both of which land on this same rail.
--
-- Covers:
--   1. the client reads her own fulfillment_orders row, her own lines, and
--      the shipment carrying them;
--   2. a stranger reads none of the three, and anon reaches nothing;
--   3. fulfillment_vendor_pos and _po_lines stay shut to her — the shipment
--      policy has to reach THROUGH the PO, and does it with a SECURITY DEFINER
--      predicate precisely so the PO itself stays invisible;
--   4. unit_cost_cents — what Patina paid the vendor for her piece — is not
--      readable by `authenticated` at all (the column narrowing), while
--      service_role still reads it, which is how every operator path reads it;
--   5. the leg is SELECT-only: no client INSERT/UPDATE/DELETE reaches a row,
--      and no non-SELECT policy exists on any of the three.
--
-- NOT covered here, deliberately: 00350's app.fulfillment_writer guard. It is
-- transaction-scoped (set_config(..., true)), so the fixture block above has
-- already armed it for the whole of this transaction and a "guardless write is
-- refused" assertion inside it would be theatre. That guard has its own tests
-- in supabase/functions/_tests/fulfillment_foundation.assert.sql.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rls/fulfillment_client_read_test.sql
--
-- Single transaction; ROLLBACK at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('fc000000-0000-4000-8000-0000000000c1', 'fc-buyer@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('fc000000-0000-4000-8000-0000000000c2', 'fc-stranger@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('fc000000-0000-4000-8000-0000000000c1', 'fc-buyer@test.invalid',    'FC Buyer',    false, NOW(), NOW()),
  ('fc000000-0000-4000-8000-0000000000c2', 'fc-stranger@test.invalid', 'FC Stranger', false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO public.vendors (id, name, is_patina_catalog)
VALUES ('fc010000-0000-4000-8000-000000000001', 'FC Test Vendor', true);

-- The BOH tables are writer-guarded (00350:298-301), so the GUC and the writes
-- are one statement, exactly as 00351:101 does.
DO $$
DECLARE
  v_buyer uuid := 'fc000000-0000-4000-8000-0000000000c1';
BEGIN
  PERFORM set_config('app.fulfillment_writer', 'migration', true);

  INSERT INTO public.fulfillment_orders (
    id, stripe_payment_intent_id, client_name, client_email, client_profile_id,
    captured_total_cents, product_subtotal_cents, freight_charged_cents, tax_cents)
  VALUES ('fc020000-0000-4000-8000-000000000001', 'pi_fc_test_mine', 'FC Buyer',
          'fc-buyer@test.invalid', v_buyer, 420000, 420000, 0, 0);

  -- A second order belonging to NOBODY (client_profile_id NULL) — an
  -- unattributed BOH order must not become visible just because the buyer is
  -- signed in. `client_profile_id = auth.uid()` is NULL = NULL, i.e. NULL, i.e.
  -- not true. Worth pinning: a policy written as `IS NOT DISTINCT FROM` would
  -- show every anonymous order to every client.
  INSERT INTO public.fulfillment_orders (
    id, stripe_payment_intent_id, client_name, client_profile_id,
    captured_total_cents, product_subtotal_cents, freight_charged_cents, tax_cents)
  VALUES ('fc020000-0000-4000-8000-000000000002', 'pi_fc_test_orphan', 'Unknown Client',
          NULL, 100000, 100000, 0, 0);

  INSERT INTO public.fulfillment_order_items (
    id, order_id, item_name, qty, unit_price_cents, unit_cost_cents,
    vendor_id, mapping_state, line_state, line_index)
  VALUES ('fc030000-0000-4000-8000-000000000001', 'fc020000-0000-4000-8000-000000000001',
          'FC Test Piece', 1, 420000, 273000,
          'fc010000-0000-4000-8000-000000000001', 'mapped', 'shipped', 1);

  INSERT INTO public.fulfillment_vendor_pos (id, order_id, vendor_id, po_number, status, product_cost_cents)
  VALUES ('fc040000-0000-4000-8000-000000000001', 'fc020000-0000-4000-8000-000000000001',
          'fc010000-0000-4000-8000-000000000001', 'PO-FC-TEST-1', 'shipped', 273000);

  INSERT INTO public.fulfillment_shipments (id, po_id, mode, carrier, tracking, shipped_at)
  VALUES ('fc050000-0000-4000-8000-000000000001', 'fc040000-0000-4000-8000-000000000001',
          'white_glove', 'FC Freight', 'FCTRK0001', NOW() - INTERVAL '2 days');

  INSERT INTO public.fulfillment_vendor_po_lines (id, po_id, order_item_id, qty, unit_cost_cents, shipment_id)
  VALUES ('fc060000-0000-4000-8000-000000000001', 'fc040000-0000-4000-8000-000000000001',
          'fc030000-0000-4000-8000-000000000001', 1, 273000, 'fc050000-0000-4000-8000-000000000001');
END $$;

DO $$
DECLARE
  buyer    uuid := 'fc000000-0000-4000-8000-0000000000c1';
  stranger uuid := 'fc000000-0000-4000-8000-0000000000c2';
  n int;
  v_carrier text;
BEGIN
  -- ═══ 1. the buyer sees her order, her line, her shipment ═══════════════
  PERFORM pg_temp.assume_user(buyer);

  SELECT count(*) INTO n FROM public.fulfillment_orders
   WHERE id = 'fc020000-0000-4000-8000-000000000001';
  ASSERT n = 1, 'the buyer must read her own fulfillment_orders row, got ' || n;

  SELECT count(*) INTO n FROM public.fulfillment_order_items
   WHERE order_id = 'fc020000-0000-4000-8000-000000000001';
  ASSERT n = 1, 'and its line, got ' || n;

  SELECT carrier INTO v_carrier FROM public.fulfillment_shipments
   WHERE id = 'fc050000-0000-4000-8000-000000000001';
  ASSERT v_carrier = 'FC Freight',
    'and the shipment carrying it — the policy reaches through a PO she cannot '
    'read, which only works because the predicate is SECURITY DEFINER';

  -- ═══ 2. the orphan order stays invisible ═══════════════════════════════
  SELECT count(*) INTO n FROM public.fulfillment_orders
   WHERE id = 'fc020000-0000-4000-8000-000000000002';
  ASSERT n = 0, 'an order with a NULL client_profile_id belongs to nobody, got ' || n;

  -- ═══ 3. the operator's cost side stays shut ════════════════════════════
  SELECT count(*) INTO n FROM public.fulfillment_vendor_pos;
  ASSERT n = 0, 'the client must not read vendor POs at all, got ' || n;
  SELECT count(*) INTO n FROM public.fulfillment_vendor_po_lines;
  ASSERT n = 0, 'nor their lines, got ' || n;

  -- ═══ 4. unit_cost_cents is not hers to read ════════════════════════════
  BEGIN
    SELECT count(unit_cost_cents) INTO n FROM public.fulfillment_order_items;
    ASSERT false,
      'unit_cost_cents is what Patina paid the vendor for her piece — '
      '`authenticated` must not be able to select it';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;  -- expected: the column is outside authenticated's grant
  END;

  -- the columns a "where is it" screen actually needs still read fine
  SELECT count(*) INTO n
    FROM (SELECT id, order_id, product_id, item_name, qty, unit_price_cents,
                 line_state, line_state_entered_at, line_index, created_at, updated_at
            FROM public.fulfillment_order_items) q;
  ASSERT n = 1, 'the client-facing columns must all still be readable, got ' || n;

  -- ═══ 4b. …and neither is the commission rate, one table over ═══════════
  -- 00540 §1b: the same narrowing, on direct_orders. A column privilege is
  -- checked when the statement is planned, so this is refused whether or not
  -- the caller owns a row — which is the point: `select('*')` on this table
  -- now fails for every client, and packages/supabase's hook names its columns.
  BEGIN
    SELECT count(commission_rate) INTO n FROM public.direct_orders;
    ASSERT false,
      'commission_rate is what the designer of record earns — direction B §5 '
      'discloses that a commission exists and never its size, so `authenticated` '
      'must not be able to select it';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;  -- expected: outside authenticated's column grant
  END;

  BEGIN
    PERFORM * FROM public.direct_orders LIMIT 1;
    ASSERT false, 'and a star select over the table must fail with it';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- the columns her own orders list needs are all still there
  SELECT count(*) INTO n
    FROM (SELECT id, client_id, product_id, product_name, quantity, unit_price_cents,
                 amount_cents, currency, status, stripe_checkout_session_id,
                 stripe_payment_intent_id, shipping, created_at, paid_at,
                 designer_id, project_id
            FROM public.direct_orders) q;
  ASSERT n >= 0, 'the client-facing direct_orders columns must stay readable';

  -- ═══ 5. the leg is read-only ═══════════════════════════════════════════
  --
  -- Asserted as "moves nothing", not as "is refused", and the difference is
  -- worth stating: 00350 revoked these tables from `public, anon` but never
  -- from `authenticated`, and seed/00-legacy-grants.sql hands `authenticated`
  -- a blanket GRANT ALL on every public relation before replaying migration
  -- ACLs — so LOCALLY the DML privilege exists and RLS is the thing that stops
  -- the write (no UPDATE or DELETE policy ⇒ zero rows matched, silently). On a
  -- post-2026-05-30 stack the grant itself is absent and it would be refused
  -- outright. Both ends are closed; this asserts the end that is weaker.
  UPDATE public.fulfillment_order_items SET line_state = 'delivered'
   WHERE id = 'fc030000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'the client must not be able to move her own order along, moved ' || n;

  DELETE FROM public.fulfillment_orders WHERE id = 'fc020000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'nor delete it, deleted ' || n;

  -- and the row really did not move
  SELECT count(*) INTO n FROM public.fulfillment_order_items
   WHERE id = 'fc030000-0000-4000-8000-000000000001' AND line_state = 'shipped';
  ASSERT n = 1, 'the line is still where ops left it';

  PERFORM pg_temp.reset_role();

  -- ═══ 6. a stranger reads none of it ════════════════════════════════════
  PERFORM pg_temp.assume_user(stranger);
  SELECT count(*) INTO n FROM public.fulfillment_orders;      ASSERT n = 0, 'stranger orders=' || n;
  SELECT count(*) INTO n FROM public.fulfillment_order_items; ASSERT n = 0, 'stranger items=' || n;
  SELECT count(*) INTO n FROM public.fulfillment_shipments;   ASSERT n = 0, 'stranger shipments=' || n;
  PERFORM pg_temp.reset_role();

  -- ═══ 7. grants, stated ═════════════════════════════════════════════════
  -- anon is asserted by ROWS, not by grant. 00350 revokes anon inside a
  -- a DO block's EXECUTE format(...) loop, and generate-legacy-grants.py only
  -- replays TOP-LEVEL GRANT/REVOKE statements — so on a local stack the
  -- legacy-grants seed's blanket GRANT ALL survives on all eight BOH tables.
  -- (00276 revokes anon off direct_orders the same way and with the same gap,
  -- though 00540's own top-level column REVOKE/GRANT on that table IS replayed
  -- — which is why §4b's probe holds locally.) That is a local-only ACL gap
  -- that predates 00540 and belongs to the generator, not to this migration;
  -- what closes it in every environment is that anon has no auth.uid() and so
  -- matches no policy. Assert the thing that is true everywhere.
  PERFORM set_config('request.jwt.claims', NULL, true);
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO n FROM public.fulfillment_orders;
  ASSERT n = 0, 'anon must read no order on the fulfillment rail, got ' || n;
  SELECT count(*) INTO n FROM public.fulfillment_shipments;
  ASSERT n = 0, 'nor any shipment, got ' || n;
  EXECUTE 'RESET ROLE';
  ASSERT has_table_privilege('service_role', 'public.fulfillment_order_items', 'SELECT'),
    'service_role keeps the whole table — every operator path reads the cost through it';
  ASSERT has_column_privilege('service_role', 'public.fulfillment_order_items', 'unit_cost_cents', 'SELECT'),
    'including unit_cost_cents';
  ASSERT NOT has_column_privilege('authenticated', 'public.fulfillment_order_items', 'unit_cost_cents', 'SELECT'),
    'which authenticated does not get';
  ASSERT has_column_privilege('authenticated', 'public.fulfillment_order_items', 'item_name', 'SELECT'),
    'while the client-facing columns stay granted';
  -- (deliberately NOT asserting an absent UPDATE grant: see §5 — locally the
  -- legacy-grants seed re-issues one, and RLS is what closes it.)
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('fulfillment_orders','fulfillment_order_items','fulfillment_shipments')
       AND cmd <> 'SELECT'
  ), 'no non-SELECT policy may exist on the three client-readable BOH tables';

END $$;

ROLLBACK;
