-- ═══════════════════════════════════════════════════════════════════════════
-- 00671 — create_direct_order returns the buyer's open order instead of
--         minting a second one (W1A-11 F1, server half)
--
-- SQ-239 (b1f98d04b) stopped the Patina app from offering a second checkout
-- while a payment is unconfirmed. The server had no matching rule:
-- create_direct_order always inserted, and create-checkout-session only
-- guards against a second SESSION for the SAME order. So a retry from any
-- client (an old TestFlight build, a double tap, a network retry) minted a
-- second order, and a second order can take a second charge.
--
-- Lineage of the one redefined function:
--   create_direct_order  00276:124  →  00540:384  →  THIS FILE
--   (verified head via `grep -rln "CREATE OR REPLACE FUNCTION[^(]*create_direct_order"
--    supabase/migrations/*.sql | sort | tail -1` → 00540. Body grafted
--    verbatim; the one delta is marked (iv).)
--
-- ─── The rule ──────────────────────────────────────────────────────────────
-- If the caller already has a direct order for the same product and the same
-- (clamped) quantity whose status is 'pending_payment', the call returns that
-- order and inserts nothing. 'pending_payment' is the only open, unpaid,
-- uncancelled status (00276 + 00277: pending_payment | paid | canceled |
-- refunded); there is no 'expired' status. A lapsed Checkout session leaves
-- the order pending_payment, and create-checkout-session opens a fresh
-- session on the same order. Paid, canceled and refunded orders never match,
-- so the next call after one of those mints a new order. Nothing is updated.
--
-- The payload key is (product_id, quantity). The RPC takes no variant. The
-- key is not price, freight or attribution: a reused order keeps its
-- create-time snapshot, as it would if the buyer came back to it any other
-- way. Keying on price would reopen the double charge in the window this
-- closes: an ACH debit in flight on the open order, then a price edit, then
-- a retry. Today that retry reaches create-checkout-session's in-flight
-- refusal.
--
-- The buyability gate still runs first, so a piece that has become
-- unbuyable is refused as before and never handed back through an open
-- order. Where two open duplicates already exist (rows minted before this
-- file), the most recent is returned. Those rows are not cleaned up here.
--
-- ─── Why an advisory lock and not a partial unique index ───────────────────
-- pg_advisory_xact_lock keyed on (buyer, product), taken before the lookup
-- and held until commit, serializes the two racing calls. The second call
-- reads after the first has committed, finds its row and returns it.
-- A partial unique index over open orders was rejected for two reasons:
--   1. CREATE UNIQUE INDEX fails, and with it this whole migration, if any
--      buyer already holds two open orders for the same product and quantity.
--      Existing duplicates are out of scope here, so the index could not be
--      built safely on Strata.
--   2. The rule belongs to the create RPC, not to the table. An index would
--      also bind the service-role webhook and any operator repair. The RPC
--      is the only writer that inserts orders (clients have no INSERT policy),
--      so the lock covers every insert path that exists.
-- The lookup must read a fresh snapshot after the lock is granted. It does
-- under READ COMMITTED, which is how PostgREST runs an RPC. A hash collision
-- between two different (buyer, product) keys only makes them wait on each
-- other.
--
-- ─── Return shape ──────────────────────────────────────────────────────────
-- Unchanged: RETURNS public.direct_orders. That row type has no column that
-- could say "reused", so the result cannot say so. A caller that needs to
-- know compares the returned id with an id it already holds. The reused
-- copy has commission_rate masked, like a newly minted one (00540 §1b).
--
-- Grants: unchanged. The REVOKE/GRANT below restates 00540:569-570 verbatim
-- for the generated legacy-grants seed.
-- Revert: re-run 00540 §6 (the CREATE OR REPLACE through its GRANT).
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_freight       INTEGER;
  v_designer_id   UUID;
  v_project_id    UUID;
  v_rate          NUMERIC(5,4);
  v_runner_up     TIMESTAMPTZ;
  v_winner_at     TIMESTAMPTZ;
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

  -- ── (i) the rest of the buyability gate ────────────────────────────────
  -- dimensions is JSONB (00001:35) with no shape constraint, so IS NOT NULL is
  -- not the same question as "has a size": '{}', 'null'::jsonb (which is not
  -- SQL NULL), '[]' and '{"unit":"in"}' are all non-NULL and all mean nothing.
  -- The order sheet leads with the size, so the gate tests the shape — the same
  -- standard the blank-brand branch below already holds a TEXT column to. Every
  -- seeded catalog row carries {"width":…,"depth":…,"height":…,"unit":…}.
  IF v_product.dimensions IS NULL
     OR jsonb_typeof(v_product.dimensions) <> 'object'
     OR NULLIF(btrim(COALESCE(v_product.dimensions->>'width', '')), '') IS NULL THEN
    RAISE EXCEPTION 'create_direct_order: not_buyable:dimensions';
  END IF;
  IF v_product.lead_time_weeks IS NULL THEN
    RAISE EXCEPTION 'create_direct_order: not_buyable:lead_time_weeks';
  END IF;
  IF v_product.brand IS NULL OR btrim(v_product.brand) = '' THEN
    RAISE EXCEPTION 'create_direct_order: not_buyable:brand';
  END IF;
  IF v_product.photo_verified_at IS NULL THEN
    RAISE EXCEPTION 'create_direct_order: not_buyable:photo_verified_at';
  END IF;

  -- ── (iv) 00671: an open order for the same piece is returned, not doubled
  -- The lock is held until commit, so a racing call with the same key waits
  -- here and then reads the row this call inserts. See the banner.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'create_direct_order:' || v_client_id::text || ':' || v_product.id::text, 0));

  SELECT * INTO v_order
    FROM public.direct_orders d
   WHERE d.client_id  = v_client_id
     AND d.product_id = v_product.id
     AND d.quantity   = v_qty
     AND d.status     = 'pending_payment'
   ORDER BY d.created_at DESC, d.id DESC
   LIMIT 1;

  IF FOUND THEN
    v_order.commission_rate := NULL;   -- §1(b), same as the minted copy below
    RETURN v_order;
  END IF;

  -- ── (ii) freight folds in ──────────────────────────────────────────────
  v_freight := GREATEST(COALESCE(v_product.shipping_flat_cents, 0), 0);

  -- ── (iii) attribution ──────────────────────────────────────────────────
  -- 1. active project
  SELECT p.designer_id, p.id
    INTO v_designer_id, v_project_id
    FROM public.projects p
   WHERE p.client_id = v_client_id
     AND p.designer_id IS NOT NULL
     -- projects.status is the project_status ENUM (active/completed/archived/
     -- on_hold/draft), hence the ::text. The five names below are
     -- StudioQueueBuilder.projectIsArchived's list verbatim, kept whole rather
     -- than narrowed to the three that exist here: the client compares against
     -- all five, and a later ALTER TYPE that adds 'cancelled' or 'inactive'
     -- must not silently make the two sides disagree.
     AND (p.status IS NULL
          OR lower(p.status::text) NOT IN ('completed','cancelled','canceled','archived','inactive'))
   ORDER BY p.created_at DESC, p.id DESC
   LIMIT 1;

  -- 2. live lead
  IF v_designer_id IS NULL THEN
    SELECT l.designer_id
      INTO v_designer_id
      FROM public.leads l
     WHERE l.homeowner_id = v_client_id
       AND l.designer_id IS NOT NULL
       AND l.status NOT IN ('declined','expired')
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT 1;
  END IF;

  -- 3. roster — through 00536's view, so the server credits exactly the
  --    relationship the client's own roster read can see.
  IF v_designer_id IS NULL THEN
    SELECT r.designer_id, r.created_at
      INTO v_designer_id, v_winner_at
      FROM public.client_designer_roster r
     ORDER BY r.created_at DESC, r.designer_id DESC
     LIMIT 1;

    IF v_designer_id IS NOT NULL THEN
      SELECT r.created_at
        INTO v_runner_up
        FROM public.client_designer_roster r
       ORDER BY r.created_at DESC, r.designer_id DESC
      OFFSET 1 LIMIT 1;

      -- Same calendar day and no honest basis to choose: file it uncredited.
      IF v_runner_up IS NOT NULL
         AND date_trunc('day', v_runner_up) = date_trunc('day', v_winner_at) THEN
        v_designer_id := NULL;
      END IF;
    END IF;
  END IF;

  -- The rate is snapshotted whether or not a designer resolved: an order that
  -- is uncredited today and reconciled by hand tomorrow must not be re-rated
  -- at whatever the catalog says then.
  v_rate := COALESCE(
    v_product.commission_rate,
    (SELECT (value->>'rate')::numeric
       FROM public.fulfillment_config
      WHERE key = 'commission_rate_default'),
    0.16
  );

  INSERT INTO public.direct_orders (
    client_id, product_id, product_name, quantity,
    unit_price_cents, amount_cents, currency, status,
    designer_id, project_id, commission_rate
  ) VALUES (
    v_client_id, v_product.id, v_product.name, v_qty,
    v_product.price_retail, (v_product.price_retail * v_qty) + v_freight, 'usd', 'pending_payment',
    v_designer_id, v_project_id, v_rate
  )
  RETURNING * INTO v_order;

  -- §1(b): the column ACL narrows what the buyer can SELECT, but a composite
  -- returned by a function is not filtered by it — so the rate would come back
  -- on the create call and nowhere else, which is worse than either answer.
  -- The STORED snapshot is untouched; only this copy is masked. The one caller
  -- is the buyer, and settle_direct_order_attribution reads the row itself.
  v_order.commission_rate := NULL;

  RETURN v_order;
END;
$$;

COMMENT ON FUNCTION public.create_direct_order(UUID, INTEGER) IS
  'Client "buy now": mints a pending_payment direct_orders row for a BUYABLE '
  'piece. Buyable (00540) = not soft-deleted, a seller of record '
  '(patina_managed OR vendor.is_patina_catalog), price_retail > 0, and '
  'dimensions / lead_time_weeks / brand / photo_verified_at all present — the '
  'last four refuse as create_direct_order: not_buyable:<field>. IDEMPOTENT '
  'while open (00671): when the caller already holds a pending_payment order '
  'for the same product and clamped quantity, that order is returned and '
  'nothing is inserted (advisory lock on buyer + product, so a racing retry '
  'returns the same row); paid, canceled and refunded orders never match. '
  'Folds products.shipping_flat_cents into amount_cents (freight is always '
  'amount_cents - quantity * unit_price_cents). Snapshots the designer '
  '(active project → live lead → roster, ambiguity uncredited), the project, '
  'and the commission rate — the rate is STORED and returned NULL, because the '
  'buyer is told a commission exists and never its size (00540 §1b). SECURITY '
  'DEFINER because clients have no INSERT policy on direct_orders.';

-- CREATE OR REPLACE preserves the ACL, but the generated legacy-grants seed
-- reads these lines, so they stay stated (00540:569-570, verbatim).
REVOKE ALL ON FUNCTION public.create_direct_order(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_direct_order(UUID, INTEGER) TO authenticated;
