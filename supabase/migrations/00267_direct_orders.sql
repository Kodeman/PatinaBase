-- ═══════════════════════════════════════════════════════════════════════════
-- 00267 — direct_orders (third payable type on the consolidated payment rail)
--
-- Phase 5 of the payment-rail consolidation. create-checkout-session and
-- stripe-webhook already dispatch on payable_type for `invoice` (00178) and
-- `po_payment` (00266). This migration adds the data model for the third and
-- final payable: a CLIENT buying a Patina-managed product directly ("buy now",
-- no cart). Unlike invoice/po_payment — whose payable rows are created by the
-- designer's own flows — a direct order is minted on demand by the client, so
-- the create path is a SECURITY DEFINER RPC (clients have no INSERT policy).
--
-- Adds, idempotently:
--   1. public.direct_orders — one row per "buy now" order. Money is snapshotted
--      at create time (product_name / unit_price_cents / amount_cents), so a
--      later product price/name edit never moves an existing order. Stripe
--      pointers (session + PaymentIntent) live on the row exactly as they do on
--      invoice_payments (00178) and po_payments (00266), with the same partial-
--      unique-index style (uniq_direct_orders_stripe_*).
--   2. RLS: clients SELECT their own rows only. NO INSERT/UPDATE/DELETE policy
--      for authenticated — writes go through create_direct_order (create) and
--      the service-role stripe-webhook (settle). This is the same "reads via
--      policy, writes via SECURITY DEFINER / service role" shape as the rest of
--      the rail.
--   3. create_direct_order(p_product_id, p_quantity) — validates the caller is
--      authenticated and the product is BUYABLE (not soft-deleted, and either
--      patina_managed OR sold by a Patina-catalog vendor, with a positive
--      price), snapshots name + price, clamps quantity to a sane cap, and
--      inserts a pending_payment order. Returns the created row.
--
-- PRICE UNITS: products.price_retail is INTEGER already stored in CENTS
-- (00001 "-- Stored in cents"), so unit_price_cents = price_retail directly —
-- NO dollars→cents conversion (there is nothing numeric to round).
--
-- CLIENT FK: invoices.client_id (00178) references public.profiles(id) ON
-- DELETE SET NULL. direct_orders.client_id references the SAME table
-- (public.profiles), but the column is NOT NULL (an order without a buyer is
-- meaningless), so SET NULL is impossible; ON DELETE RESTRICT preserves the
-- financial record instead. profiles.id = auth.users.id, so the RLS predicate
-- client_id = auth.uid() is exact.
--
-- Migration numbers collide across in-flight branches; the integrator
-- renumbers at merge. Re-run safe: CREATE TABLE / INDEX / POLICY IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION, DROP POLICY IF EXISTS before CREATE POLICY.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── PART 1: direct_orders table ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.direct_orders (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Matches invoices.client_id's referenced table (profiles); NOT NULL here so
  -- ON DELETE RESTRICT (not SET NULL) — a paid order must keep its buyer.
  client_id                  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  product_id                 UUID        NOT NULL REFERENCES public.products(id),
  -- Snapshots taken at create time so later product edits never move an order.
  product_name               TEXT        NOT NULL,
  quantity                   INTEGER     NOT NULL CHECK (quantity > 0),
  unit_price_cents           INTEGER     NOT NULL CHECK (unit_price_cents > 0),
  amount_cents               INTEGER     NOT NULL CHECK (amount_cents > 0),
  currency                   TEXT        NOT NULL DEFAULT 'usd',
  status                     TEXT        NOT NULL DEFAULT 'pending_payment'
                               CHECK (status IN ('pending_payment', 'paid', 'canceled')),
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id   TEXT,
  -- Full Stripe shipping object (+ customer email) captured on paid settle.
  shipping                   JSONB,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at                    TIMESTAMPTZ
);

COMMENT ON TABLE public.direct_orders IS
  'Client "buy now" orders for Patina-managed products — the third payable_type '
  'on the consolidated Stripe rail (invoice 00178, po_payment 00266). Rows are '
  'minted by create_direct_order (SECURITY DEFINER) and settled by the '
  'service-role stripe-webhook. Money columns are snapshots taken at create '
  'time; unit_price_cents comes straight from products.price_retail (integer '
  'cents).';

COMMENT ON COLUMN public.direct_orders.stripe_checkout_session_id IS
  'Stripe Checkout Session id (set by create-checkout-session''s direct_order '
  'branch; cleared to NULL by stripe-webhook on async_payment_failed so a fresh '
  'session can open). Mirrors invoice_payments / po_payments.';
COMMENT ON COLUMN public.direct_orders.stripe_payment_intent_id IS
  'Stripe PaymentIntent id, stamped by stripe-webhook on settle. Mirrors '
  'invoice_payments / po_payments.';
COMMENT ON COLUMN public.direct_orders.shipping IS
  'The Checkout Session''s shipping_details (address/name/phone/carrier/'
  'tracking_number) plus customer_details.email, persisted on paid settle.';

-- Stripe idempotency: one order per PaymentIntent / Checkout Session. Same
-- naming/style as uniq_po_payments_stripe_* (00266) and the invoice indexes.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_direct_orders_stripe_pi
  ON public.direct_orders(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_direct_orders_stripe_session
  ON public.direct_orders(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- Supports the RLS SELECT predicate (client_id = auth.uid()) and the client's
-- "my orders" list.
CREATE INDEX IF NOT EXISTS idx_direct_orders_client_id
  ON public.direct_orders(client_id);

-- ─── PART 2: RLS ────────────────────────────────────────────────────────────
--
-- Clients read their own orders; nobody writes through the API. INSERT is the
-- RPC's job (SECURITY DEFINER), settle is the service role's (bypasses RLS).

ALTER TABLE public.direct_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS direct_orders_select_own ON public.direct_orders;
CREATE POLICY direct_orders_select_own ON public.direct_orders
  FOR SELECT
  TO authenticated
  USING (client_id = auth.uid());

-- ─── PART 3: create_direct_order RPC ────────────────────────────────────────
--
-- The only client-facing write path. SECURITY DEFINER (clients can't INSERT
-- into direct_orders directly). search_path pinned to public, pg_temp per the
-- repo's SECURITY DEFINER convention (00218/00233/00235). Guards mirror
-- create_purchase_order's phrasing style (00186).

CREATE OR REPLACE FUNCTION public.create_direct_order(
  p_product_id UUID,
  p_quantity   INTEGER DEFAULT 1
)
RETURNS public.direct_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Cap quantity so a client can't mint an absurd single-order total.
  c_max_quantity CONSTANT INTEGER := 10;
  v_client_id     UUID    := auth.uid();
  v_qty           INTEGER;
  v_product       public.products;
  v_vendor_catalog BOOLEAN := FALSE;
  v_order         public.direct_orders;
BEGIN
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'create_direct_order: not authenticated';
  END IF;

  -- Clamp quantity into [1, c_max_quantity]. A non-positive request is a bug in
  -- the caller, not a value to silently coerce.
  v_qty := COALESCE(p_quantity, 1);
  IF v_qty < 1 THEN
    RAISE EXCEPTION 'create_direct_order: quantity must be at least 1';
  END IF;
  IF v_qty > c_max_quantity THEN
    v_qty := c_max_quantity;
  END IF;

  -- Product must exist and not be soft-deleted.
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id;
  IF NOT FOUND OR v_product.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'create_direct_order: product % not found', p_product_id;
  END IF;

  -- Buyable = patina_managed OR sold by a Patina-catalog vendor.
  IF v_product.vendor_id IS NOT NULL THEN
    SELECT COALESCE(is_patina_catalog, FALSE) INTO v_vendor_catalog
      FROM public.vendors WHERE id = v_product.vendor_id;
  END IF;
  IF NOT (v_product.patina_managed OR COALESCE(v_vendor_catalog, FALSE)) THEN
    RAISE EXCEPTION 'create_direct_order: product % is not available for direct purchase', p_product_id;
  END IF;

  -- Must carry a positive retail price (already integer cents).
  IF v_product.price_retail IS NULL OR v_product.price_retail <= 0 THEN
    RAISE EXCEPTION 'create_direct_order: product % has no purchasable price', p_product_id;
  END IF;

  INSERT INTO public.direct_orders (
    client_id, product_id, product_name, quantity,
    unit_price_cents, amount_cents, currency, status
  ) VALUES (
    v_client_id, v_product.id, v_product.name, v_qty,
    v_product.price_retail, v_product.price_retail * v_qty, 'usd', 'pending_payment'
  )
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

COMMENT ON FUNCTION public.create_direct_order(UUID, INTEGER) IS
  'Client "buy now": mints a pending_payment direct_orders row for a buyable '
  'Patina-managed product. Validates auth.uid(), product existence + not '
  'soft-deleted, buyable (patina_managed OR vendor.is_patina_catalog) with a '
  'positive price_retail (integer cents), clamps quantity to 10, and snapshots '
  'name + unit price. SECURITY DEFINER because clients have no INSERT policy on '
  'direct_orders.';

-- Supabase's ALTER DEFAULT PRIVILEGES auto-grants EXECUTE on new public
-- functions to anon/authenticated/service_role; revoke PUBLIC + anon so only
-- authenticated clients (and the service role) can mint orders.
REVOKE ALL ON FUNCTION public.create_direct_order(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_direct_order(UUID, INTEGER) TO authenticated;
