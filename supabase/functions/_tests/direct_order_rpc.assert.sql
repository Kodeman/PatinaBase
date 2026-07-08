-- create_direct_order RPC validation — BEGIN/ROLLBACK assertion script.
--
-- Exercises the SECURITY DEFINER RPC's guards against the SHARED local DB
-- without persisting anything: every fixture is created inside a transaction
-- that is ROLLED BACK at the end, so there is nothing to clean up and no
-- `db reset` is ever needed. auth.uid() is simulated by setting the
-- request.jwt.claims GUC (transaction-local) exactly as the Supabase gateway
-- would.
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -f supabase/functions/_tests/direct_order_rpc.assert.sql
--
-- Every case prints "A# PASS" / "A# FAIL". A clean run is all PASS.

BEGIN;

DO $$
DECLARE
  v_buyer          UUID;
  v_cat_vendor     UUID := gen_random_uuid();
  v_noncat_vendor  UUID := gen_random_uuid();
  v_buyable_pm     UUID := gen_random_uuid();  -- patina_managed=true
  v_buyable_vc     UUID := gen_random_uuid();  -- vendor.is_patina_catalog=true
  v_nonbuyable     UUID := gen_random_uuid();  -- neither
  v_deleted        UUID := gen_random_uuid();  -- soft-deleted
  v_zeroprice      UUID := gen_random_uuid();  -- price_retail = 0
  v_nullprice      UUID := gen_random_uuid();  -- price_retail = NULL
  v_missing        UUID := gen_random_uuid();  -- never inserted
  v_order          public.direct_orders;
BEGIN
  -- A real profile to satisfy the client_id FK (RESTRICT). Rolled back anyway.
  SELECT id INTO v_buyer FROM public.profiles LIMIT 1;
  IF v_buyer IS NULL THEN
    RAISE EXCEPTION 'no profile available to act as buyer — seed the local DB first';
  END IF;

  -- Act as this authenticated client.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_buyer, 'role', 'authenticated')::text, true);

  -- ── Fixtures ──────────────────────────────────────────────────────────────
  INSERT INTO public.vendors (id, name, is_patina_catalog) VALUES
    (v_cat_vendor,    'DO_RPC_ASSERT catalog vendor',     true),
    (v_noncat_vendor, 'DO_RPC_ASSERT non-catalog vendor', false);

  -- catalog-layer products satisfy products_catalog_requires_management when
  -- patina_managed=true; personal-layer products need an owner_user_id.
  INSERT INTO public.products
    (id, name, captured_at, layer, status, patina_managed, owner_user_id, vendor_id, price_retail, deleted_at)
  VALUES
    (v_buyable_pm, 'DO_RPC Buyable PM', now(), 'catalog',  'published', true,  NULL,    NULL,            12345, NULL),
    (v_buyable_vc, 'DO_RPC Buyable VC', now(), 'personal', 'published', false, v_buyer, v_cat_vendor,     5000, NULL),
    (v_nonbuyable, 'DO_RPC NonBuyable', now(), 'personal', 'published', false, v_buyer, v_noncat_vendor,  5000, NULL),
    (v_deleted,    'DO_RPC Deleted',    now(), 'catalog',  'published', true,  NULL,    NULL,             5000, now()),
    (v_zeroprice,  'DO_RPC ZeroPrice',  now(), 'catalog',  'published', true,  NULL,    NULL,                0, NULL),
    (v_nullprice,  'DO_RPC NullPrice',  now(), 'catalog',  'published', true,  NULL,    NULL,             NULL, NULL);

  -- ── A1: happy path (patina_managed), quantity 2, exact snapshot + math ─────
  v_order := public.create_direct_order(v_buyable_pm, 2);
  IF v_order.status = 'pending_payment'
     AND v_order.product_name = 'DO_RPC Buyable PM'
     AND v_order.quantity = 2
     AND v_order.unit_price_cents = 12345
     AND v_order.amount_cents = 24690       -- 12345 * 2, price_retail is already cents
     AND v_order.currency = 'usd'
     AND v_order.client_id = v_buyer THEN
    RAISE NOTICE 'A1 PASS: pm buyable → order % amount_cents=%', v_order.id, v_order.amount_cents;
  ELSE
    RAISE NOTICE 'A1 FAIL: unexpected row: status=% name=% qty=% unit=% amount=% cur=% client=%',
      v_order.status, v_order.product_name, v_order.quantity, v_order.unit_price_cents,
      v_order.amount_cents, v_order.currency, v_order.client_id;
  END IF;

  -- ── A2: buyable via vendor.is_patina_catalog ──────────────────────────────
  v_order := public.create_direct_order(v_buyable_vc, 1);
  IF v_order.status = 'pending_payment' AND v_order.amount_cents = 5000 THEN
    RAISE NOTICE 'A2 PASS: vendor-catalog buyable → amount_cents=%', v_order.amount_cents;
  ELSE
    RAISE NOTICE 'A2 FAIL: unexpected amount_cents=%', v_order.amount_cents;
  END IF;

  -- ── A3: quantity cap (50 → 10) ────────────────────────────────────────────
  v_order := public.create_direct_order(v_buyable_pm, 50);
  IF v_order.quantity = 10 AND v_order.amount_cents = 123450 THEN
    RAISE NOTICE 'A3 PASS: qty capped to % amount_cents=%', v_order.quantity, v_order.amount_cents;
  ELSE
    RAISE NOTICE 'A3 FAIL: qty=% amount=%', v_order.quantity, v_order.amount_cents;
  END IF;

  -- ── A4: non-buyable product rejected ──────────────────────────────────────
  BEGIN
    PERFORM public.create_direct_order(v_nonbuyable, 1);
    RAISE NOTICE 'A4 FAIL: expected rejection for non-buyable product';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%not available for direct purchase%'
      THEN RAISE NOTICE 'A4 PASS: %', SQLERRM;
      ELSE RAISE NOTICE 'A4 FAIL: wrong error: %', SQLERRM;
    END IF;
  END;

  -- ── A5: soft-deleted product treated as not found ─────────────────────────
  BEGIN
    PERFORM public.create_direct_order(v_deleted, 1);
    RAISE NOTICE 'A5 FAIL: expected not-found for soft-deleted product';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%not found%'
      THEN RAISE NOTICE 'A5 PASS: %', SQLERRM;
      ELSE RAISE NOTICE 'A5 FAIL: wrong error: %', SQLERRM;
    END IF;
  END;

  -- ── A6: zero price rejected ───────────────────────────────────────────────
  BEGIN
    PERFORM public.create_direct_order(v_zeroprice, 1);
    RAISE NOTICE 'A6 FAIL: expected rejection for zero price';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%no purchasable price%'
      THEN RAISE NOTICE 'A6 PASS: %', SQLERRM;
      ELSE RAISE NOTICE 'A6 FAIL: wrong error: %', SQLERRM;
    END IF;
  END;

  -- ── A7: null price rejected ───────────────────────────────────────────────
  BEGIN
    PERFORM public.create_direct_order(v_nullprice, 1);
    RAISE NOTICE 'A7 FAIL: expected rejection for null price';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%no purchasable price%'
      THEN RAISE NOTICE 'A7 PASS: %', SQLERRM;
      ELSE RAISE NOTICE 'A7 FAIL: wrong error: %', SQLERRM;
    END IF;
  END;

  -- ── A8: quantity < 1 rejected ─────────────────────────────────────────────
  BEGIN
    PERFORM public.create_direct_order(v_buyable_pm, 0);
    RAISE NOTICE 'A8 FAIL: expected rejection for quantity 0';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%quantity must be at least 1%'
      THEN RAISE NOTICE 'A8 PASS: %', SQLERRM;
      ELSE RAISE NOTICE 'A8 FAIL: wrong error: %', SQLERRM;
    END IF;
  END;

  -- ── A9: missing product id rejected ───────────────────────────────────────
  BEGIN
    PERFORM public.create_direct_order(v_missing, 1);
    RAISE NOTICE 'A9 FAIL: expected not-found for missing product';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%not found%'
      THEN RAISE NOTICE 'A9 PASS: %', SQLERRM;
      ELSE RAISE NOTICE 'A9 FAIL: wrong error: %', SQLERRM;
    END IF;
  END;

  -- ── A10: anonymous caller rejected ────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', '', true);  -- auth.uid() → NULL
  BEGIN
    PERFORM public.create_direct_order(v_buyable_pm, 1);
    RAISE NOTICE 'A10 FAIL: expected rejection for anonymous caller';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%not authenticated%'
      THEN RAISE NOTICE 'A10 PASS: %', SQLERRM;
      ELSE RAISE NOTICE 'A10 FAIL: wrong error: %', SQLERRM;
    END IF;
  END;
END $$;

ROLLBACK;

-- ── A11/A12: RLS SELECT boundary ────────────────────────────────────────────
-- A client sees only their own orders. Run under SET ROLE authenticated (the
-- postgres superuser bypasses RLS). Uses two existing profiles + a buyable
-- product as fixtures; the whole thing is rolled back.
BEGIN;
SELECT id AS b1   FROM public.profiles ORDER BY id ASC  LIMIT 1 \gset
SELECT id AS b2   FROM public.profiles ORDER BY id DESC LIMIT 1 \gset
SELECT id AS prod FROM public.products
  WHERE deleted_at IS NULL AND patina_managed AND price_retail > 0 LIMIT 1 \gset

INSERT INTO public.direct_orders
  (client_id, product_id, product_name, quantity, unit_price_cents, amount_cents, status)
  VALUES (:'b1', :'prod', 'DO_RPC RLS', 1, 5000, 5000, 'pending_payment');

SET LOCAL ROLE authenticated;

-- A11: owner sees their order (expect owner_sees=1).
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :'b1', 'role', 'authenticated')::text, true);
SELECT 'A11 owner_sees=' || count(*) AS a11 FROM public.direct_orders WHERE product_name = 'DO_RPC RLS';

-- A12: a different authenticated user sees nothing (expect other_sees=0).
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :'b2', 'role', 'authenticated')::text, true);
SELECT 'A12 other_sees=' || count(*) AS a12 FROM public.direct_orders WHERE product_name = 'DO_RPC RLS';

RESET ROLE;
ROLLBACK;
