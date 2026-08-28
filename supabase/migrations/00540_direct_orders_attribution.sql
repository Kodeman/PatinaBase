-- ═══════════════════════════════════════════════════════════════════════════
-- 00540 — direct orders: attribution, the buyability gate, and "where is it"
--
-- Daily Return W5 (rulings R3 / Q5 / Q6). Everything a client "buy now" order
-- needs so the designer on the job is not cut out of it, and so the client can
-- see the order after she pays. Additive only — no column is dropped, no
-- existing refusal message changes.
--
-- Lineage of the one redefined function:
--   create_direct_order  00276:124  →  THIS FILE
--   (verified head via `grep -rln "CREATE OR REPLACE FUNCTION[^(]*create_direct_order"
--    supabase/migrations/*.sql | sort | tail -1` → 00276 only. Body grafted verbatim.)
--
-- ─── What lands ────────────────────────────────────────────────────────────
--  1. direct_orders.designer_id / project_id / commission_rate — snapshotted
--     INSIDE create_direct_order, immutable once the order is paid (trigger).
--  2. create_direct_order enforces the buyability gate and folds flat freight.
--  3. designer_earnings partial unique index on order_id — the earnings credit
--     fires exactly once however many times Stripe redelivers.
--  4. Client-scoped SELECT on fulfillment_orders / _order_items / _shipments.
--  5. Three fulfillment_config keys + get_direct_order_terms() to read them.
--  6. settle_direct_order_attribution() — the settle-side effects the webhook
--     cannot do itself (see §6's banner).
--
-- ─── Two hazards this file is deliberate about ─────────────────────────────
--
-- (a) designer_earnings.order_id is UN-NAMESPACED (00014:307, "Future: when
--     orders table exists", no FK, no index). The partial unique index added
--     here is therefore GLOBAL to that column, not scoped to direct orders.
--     Verified safe today: the only two writers of designer_earnings are
--     00178's invoice credit (00178:646) and 00277's reversal, and NEITHER
--     sets order_id. A future second rail that writes order_id will collide
--     with this rail's ids unless it namespaces first. Stated here so the
--     collision is found in review and not in production.
--
-- (b) commission_rate UNITS. products.commission_rate is numeric(4,2)
--     (00152:52) with no comment and NULL on every row in every environment;
--     designer_earnings.commission_rate is DECIMAL(5,4) commented "0.0800 for
--     8%"; fulfillment_config.commission_rate_default is {"rate":0.16}
--     (00351:104). Both live references are FRACTIONS, so this file reads
--     products.commission_rate as a fraction too and constrains the snapshot
--     to [0,1]. If a later writer ever puts 16.00 in products.commission_rate
--     meaning "16%", create_direct_order raises a check_violation at create —
--     loudly, before any money moves — instead of crediting 16× the order.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. The three attribution columns ───────────────────────────────────────
--
-- ON DELETE SET NULL on both FKs: a deleted designer or project must not take
-- a financial record with it (client_id stays RESTRICT, 00276:52 — an order
-- without a buyer is meaningless, an order without a designer is just
-- uncredited).

ALTER TABLE public.direct_orders
  ADD COLUMN IF NOT EXISTS designer_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id      UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,4);

ALTER TABLE public.direct_orders
  DROP CONSTRAINT IF EXISTS direct_orders_commission_rate_is_a_fraction;
ALTER TABLE public.direct_orders
  ADD CONSTRAINT direct_orders_commission_rate_is_a_fraction
    CHECK (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 1));

CREATE INDEX IF NOT EXISTS idx_direct_orders_designer_id
  ON public.direct_orders(designer_id) WHERE designer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_direct_orders_project_id
  ON public.direct_orders(project_id) WHERE project_id IS NOT NULL;

COMMENT ON COLUMN public.direct_orders.designer_id IS
  'The designer credited for this order, resolved server-side by '
  'create_direct_order at create time and frozen once the order is paid. NULL '
  'means the order is genuinely uncredited — no designer relationship, or an '
  'ambiguous one the server refused to guess at (see create_direct_order).';
COMMENT ON COLUMN public.direct_orders.project_id IS
  'The project the credited relationship came from, when it came from a '
  'project. NULL when the credit came from a lead or a roster row, or when '
  'there is no credit. Set at create, frozen once paid.';
COMMENT ON COLUMN public.direct_orders.commission_rate IS
  'A FRACTION in [0,1] (0.1600 = 16%), snapshotted at create from '
  'products.commission_rate, else fulfillment_config commission_rate_default. '
  'Snapshotted so a later catalog edit never moves an existing order''s '
  'credit, and frozen once paid.';

-- ─── 2. Immutable-after-paid ────────────────────────────────────────────────
--
-- A convention would not hold: the settle path is service_role and bypasses
-- RLS entirely. The guard is a trigger. It fires on OLD.status, so the settle
-- UPDATE itself (pending_payment → paid) passes, and every UPDATE after it is
-- refused if it moves one of the three.

CREATE OR REPLACE FUNCTION public.direct_orders_freeze_attribution()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status = 'paid' AND (
       NEW.designer_id     IS DISTINCT FROM OLD.designer_id
    OR NEW.project_id      IS DISTINCT FROM OLD.project_id
    OR NEW.commission_rate IS DISTINCT FROM OLD.commission_rate
  ) THEN
    RAISE EXCEPTION
      'direct_orders: attribution is immutable once the order is paid (order %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.direct_orders_freeze_attribution() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.direct_orders_freeze_attribution() IS
  'Q5: designer_id / project_id / commission_rate are snapshots. Once status = '
  '''paid'' they cannot move — not by the webhook, not by an operator, not by '
  'service_role. Fires on OLD.status so the settle flip itself is allowed.';

DROP TRIGGER IF EXISTS trg_direct_orders_freeze_attribution ON public.direct_orders;
CREATE TRIGGER trg_direct_orders_freeze_attribution
  BEFORE UPDATE ON public.direct_orders
  FOR EACH ROW EXECUTE FUNCTION public.direct_orders_freeze_attribution();

-- ─── 3. The earnings credit fires once ──────────────────────────────────────
--
-- See hazard (a) in the banner. `WHERE order_id IS NOT NULL` keeps every
-- existing row (all of which have a NULL order_id) out of the index.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_designer_earnings_order
  ON public.designer_earnings(order_id)
  WHERE order_id IS NOT NULL;

COMMENT ON COLUMN public.designer_earnings.order_id IS
  'The direct_orders row this commission was earned on. UNIQUE where not null '
  '(00540) so a Stripe redelivery credits once. NOTE: the column is not '
  'namespaced by rail — a future non-direct-order writer must not reuse it '
  'without scoping the index first.';

-- ─── 4. fulfillment_config: the three direct-order keys ─────────────────────
--
-- fulfillment_config carries the writer guard (00351:88-98), so the GUC is set
-- first exactly as 00351:101 does before its own seed.
--
-- ⚠ direct_orders.contact is a PLACEHOLDER. hello@patina.cloud is a real,
--   reachable Patina address, which is why it is here rather than a fake — but
--   the support route a homeowner should actually use for a damaged $4,200
--   table is Kody's to name, and he replaces this value before Path A ships.
--   Direction B §5 gates Path A on it: "one reachable human — an address or a
--   number, not the word 'support'".
--
-- ⚠ direct_orders.responsibility_paragraph states only what is structurally
--   true — who is responsible and how to reach them. It names no claims
--   window and no percentage, because no such policy has been ruled (F144).
--   Kody replaces it with the real policy text; until then the honest thing is
--   prose that promises nothing it cannot keep.
--
-- direct_orders.tax_shipping_enabled defaults to DISABLED, which is what keeps
-- Path A's "Delivery and tax are added at payment" copy from outrunning the
-- rail (critique M14). Its optional shipping_rate_ids are Stripe dashboard
-- rate ids — the session never invents a freight price of its own.

-- The GUC is transaction-local, so it and the INSERT must be one statement:
-- a bare `SELECT set_config(...)` followed by a bare INSERT works under the
-- CLI (which wraps a migration in a transaction) and fails under a plain
-- `psql -f` (which does not). A DO block is one statement either way.
DO $$
BEGIN
  PERFORM set_config('app.fulfillment_writer', 'migration', true);

  INSERT INTO public.fulfillment_config (key, value, description) VALUES
    ('direct_orders.responsibility_paragraph',
     '{"text":"Patina is responsible for this order — for getting it to you, and for putting it right if it arrives damaged or isn''t what was described. Write to the address below and a person will answer. If a designer is working on your home, they are copied on anything you raise."}'::jsonb,
     'The paragraph printed on the order sheet and on Order placed, naming who is responsible for delivery, damage and return (direction B §5). PLACEHOLDER — Kody replaces it with the ruled policy text.'),
    ('direct_orders.contact',
     '{"text":"hello@patina.cloud"}'::jsonb,
     'The one reachable human on a direct order — printed under the responsibility paragraph. PLACEHOLDER: a real Patina address, but Kody names the intended support route (an address or a number) before Path A ships.'),
    ('direct_orders.tax_shipping_enabled',
     '{"enabled":false}'::jsonb,
     'When true, create-checkout-session adds automatic_tax to the direct-order session, plus shipping_options for any shipping_rate_ids listed here ({"enabled":true,"shipping_rate_ids":["shr_..."]}). Default false: Stripe Tax registration is a Kody ruling, and while it is false the order sheet must read "Delivery and tax are not included yet".')
  ON CONFLICT (key) DO NOTHING;
END $$;

-- ─── 5. get_direct_order_terms — the client's read of those three ───────────
--
-- fulfillment_config is REVOKEd from anon and granted SELECT to authenticated
-- (00350's idiom, applied to 00351's tables), but a homeowner reading the
-- whole config table would see the platform's margin floor and commission
-- default. This RPC is the narrow read: three keys, nothing else.

CREATE OR REPLACE FUNCTION public.get_direct_order_terms()
RETURNS TABLE (
  responsibility_paragraph TEXT,
  contact                  TEXT,
  tax_shipping_enabled     BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    (SELECT value->>'text'    FROM public.fulfillment_config WHERE key = 'direct_orders.responsibility_paragraph'),
    (SELECT value->>'text'    FROM public.fulfillment_config WHERE key = 'direct_orders.contact'),
    COALESCE((SELECT (value->>'enabled')::boolean FROM public.fulfillment_config WHERE key = 'direct_orders.tax_shipping_enabled'), FALSE);
$$;

COMMENT ON FUNCTION public.get_direct_order_terms() IS
  'The three direct-order terms the order sheet prints: the responsibility '
  'paragraph, the contact, and whether delivery and tax are added at payment. '
  'One row, always — a missing config key returns NULL text and FALSE for the '
  'flag, so a client can never be shown a promise the rail has not been told '
  'to keep. Narrow by design: fulfillment_config also holds the platform''s '
  'margin floor and commission default, which are not a homeowner''s business.';

REVOKE ALL ON FUNCTION public.get_direct_order_terms() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_direct_order_terms() TO authenticated;

-- ─── 6. create_direct_order — the gate, the freight fold, the attribution ───
--
-- Body grafted verbatim from 00276:124-187; the parameter names p_product_id /
-- p_quantity are unchanged (Postgres refuses to rename an input parameter, and
-- iOS + the assert suite both call it positionally today but by name tomorrow).
--
-- THREE deltas on top of 00276:
--
--  (i)   THE BUYABILITY GATE. 00276 already refused a product with no seller of
--        record and no positive price — those two refusal messages are
--        UNCHANGED, byte for byte, because they have shipped. Four fields are
--        new: dimensions, lead_time_weeks, brand, photo_verified_at. They raise
--        `create_direct_order: not_buyable:<field>` — one stable, greppable
--        code per field, matched by prefix (the 00397 idiom that
--        create-checkout-session already reads with dbMessage.includes).
--        The client gate (C1) refuses these before the button ever draws; this
--        is the race-condition backstop, and the reason a $4,200 order sheet
--        can never ship missing the two facts a buyer leads with.
--
--  (ii)  FREIGHT FOLDS INTO amount_cents from products.shipping_flat_cents, so
--        the number the sheet prints is the number the session charges.
--        DELIBERATELY NO FOURTH COLUMN: freight is exactly
--        `amount_cents - (quantity * unit_price_cents)`, both of which are
--        already snapshotted, so it can never drift from the total. Rows
--        created before this migration have freight 0 by that arithmetic,
--        which is what they were.
--
--  (iii) ATTRIBUTION, resolved server-side. The precedence and the tie rule are
--        NOT invented here — they mirror
--        `DesignerRelationshipResolver.resolve` (Core/State/DesignerRelationship.swift)
--        exactly, because R3 uses the client's predicate to decide who never
--        sees Buy and this decides who gets paid; if the two disagree, a client
--        is either pre-empted without credit or credited without pre-emption.
--
--          1. active project  — `projects` where the client is client_id, the
--             designer is set, and status is not one of the five the client
--             calls archived (StudioQueueBuilder.projectIsArchived:42-45).
--          2. live lead       — `leads` where the client is homeowner_id, the
--             designer is set, and status is not declined/expired
--             (DesignRequestStage.isTerminal, and 00536's own predicate).
--             Most recent by created_at, matching `liveLead`.
--          3. roster          — public.client_designer_roster (00536), which is
--             the SAME four-column definer view the client reads, so the server
--             credits exactly the relationship the client can see. Most recent
--             wins; if the runner-up landed on the same calendar day the order
--             is filed UNCREDITED rather than guessing, matching
--             `mostRecent(in:)`. (The client compares in the device's local
--             calendar and this compares in UTC — a divergence of at most a few
--             hours at a day boundary, and in that window both answers are
--             defensible.)
--
--        Ambiguity STOPS the resolution; it does not fall through. A client
--        with two designers on one day has a relationship — just not a legible
--        one — and reaching past it to a roster row would credit a designer the
--        client is not working with.
--
--        Step 1 is the only place the server picks where the client does not:
--        `activeProject` takes the first project the API happened to return.
--        This takes the most recently created one. Same designer either way in
--        every seeded and every observed case; stated because it is a real
--        (if narrow) divergence.

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
  IF v_product.dimensions IS NULL THEN
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

  RETURN v_order;
END;
$$;

COMMENT ON FUNCTION public.create_direct_order(UUID, INTEGER) IS
  'Client "buy now": mints a pending_payment direct_orders row for a BUYABLE '
  'piece. Buyable (00540) = not soft-deleted, a seller of record '
  '(patina_managed OR vendor.is_patina_catalog), price_retail > 0, and '
  'dimensions / lead_time_weeks / brand / photo_verified_at all present — the '
  'last four refuse as create_direct_order: not_buyable:<field>. Folds '
  'products.shipping_flat_cents into amount_cents (freight is always '
  'amount_cents - quantity * unit_price_cents). Snapshots the designer '
  '(active project → live lead → roster, ambiguity uncredited), the project, '
  'and the commission rate. SECURITY DEFINER because clients have no INSERT '
  'policy on direct_orders.';

-- CREATE OR REPLACE preserves the ACL, but the generated legacy-grants seed
-- reads these lines, so they stay stated (00276:200-201, verbatim).
REVOKE ALL ON FUNCTION public.create_direct_order(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_direct_order(UUID, INTEGER) TO authenticated;

-- ─── 7. settle_direct_order_attribution — the settle's DB-side effects ──────
--
-- Why this is an RPC and not two statements in the webhook:
--
--   • The project thread. rpc_start_project_thread (00103:113, unchanged here)
--     opens with `IF auth.uid() IS NULL THEN RAISE`. The webhook is
--     service_role and has no auth.uid(), so it CANNOT call it. This function
--     is the service-role counterpart: same resolve-or-create shape, same
--     participants, same idempotency, and no caller-identity check because
--     there is no caller — Stripe settled the order.
--   • Atomicity. The credit and the message are one fact ("this order settled
--     and Leah was told"). One RPC makes them one transaction.
--
-- Idempotency has ONE key for both effects: the earnings row. The insert rides
-- 00540's partial unique index with ON CONFLICT DO NOTHING, and the message is
-- posted only when THIS call was the one that inserted it. So a redelivery
-- credits nothing and says nothing, and no marker has to be smuggled into a
-- sentence Leah reads. It also means the message and the credit are the same
-- fact: the notice says "credited at the piece's trade rate", so it must not
-- draw where there is no credit.
--
-- Consequence, stated: an order attributed through a LEAD or a ROSTER row
-- carries no project_id and therefore gets the credit but no thread message.
-- Direction B §5 wants that notice to land in rpc_start_direct_thread's direct
-- thread instead; that is not in W5's brief and is not built here.
--
-- Returns a jsonb receipt so the webhook can log what actually happened
-- without re-querying.

CREATE OR REPLACE FUNCTION public.settle_direct_order_attribution(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order      public.direct_orders;
  v_subtotal   INTEGER;
  v_gross      INTEGER;
  v_credited   BOOLEAN := FALSE;
  v_posted     BOOLEAN := FALSE;
  v_thread     UUID;
  v_designer   UUID;
  v_client     UUID;
  v_buyer_name TEXT;
  v_body       TEXT;
BEGIN
  SELECT * INTO v_order FROM public.direct_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'settle_direct_order_attribution: order % not found', p_order_id;
  END IF;

  -- Only a settled order has anything to credit or announce. Never widen this
  -- to "any status": internal payable state is the source of truth.
  IF v_order.status <> 'paid' THEN
    RETURN jsonb_build_object('credited', false, 'thread_message', false,
                              'reason', 'order is not paid');
  END IF;

  -- Commission is earned on the PIECE, not on freight — direction B §5 says
  -- "credited at the piece's trade rate", and freight is a pass-through.
  v_subtotal := v_order.quantity * v_order.unit_price_cents;

  -- ── the earnings credit ─────────────────────────────────────────────────
  IF v_order.designer_id IS NOT NULL AND COALESCE(v_order.commission_rate, 0) > 0 THEN
    v_gross := round(v_subtotal * v_order.commission_rate)::INTEGER;

    INSERT INTO public.designer_earnings (
      designer_id, source_type, order_id, project_id,
      gross_amount, platform_fee, net_amount, commission_rate,
      description, status, earned_at
    ) VALUES (
      v_order.designer_id, 'product_commission', v_order.id, v_order.project_id,
      v_gross, 0, v_gross, v_order.commission_rate,
      'Direct order — ' || v_order.product_name,
      -- Stripe money is 'confirmed' until the platform payout lands, exactly
      -- as the invoice credit rules it (00178:657).
      'confirmed',
      COALESCE(v_order.paid_at, now())
    )
    ON CONFLICT (order_id) WHERE order_id IS NOT NULL DO NOTHING;

    v_credited := FOUND;
  END IF;

  -- ── the system message in the project thread ────────────────────────────
  -- Only on the call that actually credited (see the banner): the notice and
  -- the credit are one fact, and that is also what makes it fire once.
  IF v_credited AND v_order.project_id IS NOT NULL THEN
    SELECT pr.designer_id, pr.client_id INTO v_designer, v_client
      FROM public.projects pr WHERE pr.id = v_order.project_id;

    IF v_designer IS NOT NULL AND v_client IS NOT NULL THEN
      -- resolve-or-create, mirroring rpc_start_project_thread (00103:113)
      SELECT t.id INTO v_thread
        FROM public.comms_threads t
       WHERE t.kind = 'project' AND t.project_id = v_order.project_id
       ORDER BY t.created_at ASC
       LIMIT 1;

      IF v_thread IS NULL THEN
        INSERT INTO public.comms_threads (kind, project_id, created_by)
          VALUES ('project', v_order.project_id, v_designer)
          RETURNING id INTO v_thread;
        INSERT INTO public.comms_thread_participants (thread_id, profile_id, role) VALUES
          (v_thread, v_designer, 'designer'),
          (v_thread, v_client,   'client');
        INSERT INTO public.comms_messages (thread_id, sender_id, body, system)
          VALUES (v_thread, NULL, 'Project conversation opened.', TRUE);
      END IF;

      SELECT COALESCE(NULLIF(btrim(pf.full_name), ''), 'Your client')
        INTO v_buyer_name
        FROM public.profiles pf WHERE pf.id = v_order.client_id;

      v_body := COALESCE(v_buyer_name, 'Your client')
             || ' bought the ' || v_order.product_name
             || ' — ' || to_char(v_order.amount_cents / 100.0, 'FM$999,999,990.00')
             || ', credited at the piece''s trade rate.';

      INSERT INTO public.comms_messages (thread_id, sender_id, body, system)
        VALUES (v_thread, NULL, v_body, TRUE);
      v_posted := TRUE;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'credited', v_credited,
    'thread_message', v_posted,
    'designer_id', v_order.designer_id,
    'project_id', v_order.project_id,
    'thread_id', v_thread
  );
END;
$$;

COMMENT ON FUNCTION public.settle_direct_order_attribution(UUID) IS
  'The DB half of a direct order''s settle (W5 / Q5): credit designer_earnings '
  'once (partial unique index on order_id) and post one system message into '
  'the project thread naming the piece and the total. Service-role only — it '
  'exists because rpc_start_project_thread requires an auth.uid() the '
  'stripe-webhook does not have. Refuses to do anything for an order that is '
  'not already paid; idempotent on both effects.';

REVOKE ALL ON FUNCTION public.settle_direct_order_attribution(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_direct_order_attribution(UUID) TO service_role;

-- ─── 8. The client can see her own order on the fulfillment rail ────────────
--
-- Q6, and the whole answer to "where is it". 00350:305-331 gave these tables
-- an admin-domain SELECT policy and an agent_reader one, and GRANTed SELECT to
-- authenticated — so a homeowner holds the grant, matches no policy, and reads
-- zero rows. These three policies are her leg, and only hers:
--
--   fulfillment_orders       client_profile_id = auth.uid()
--   fulfillment_order_items  through its order
--   fulfillment_shipments    through po → order  (shipments hang off
--                            fulfillment_vendor_pos, not off the order)
--
-- SELECT only, and no policy on fulfillment_vendor_pos / _po_lines: those are
-- the operator's cost side and are not the client's to read. Every one of these
-- tables also carries trg_<t>_writer_guard (00350:298-301), so even a policy
-- mistake could not let a client write.
--
-- ⚠ TWO THINGS A PLAIN POLICY WOULD HAVE GOT WRONG, both fixed below.
--
-- (a) fulfillment_shipments hangs off fulfillment_vendor_pos, not off the
--     order — so its policy has to reach through a table the client must NOT
--     be able to read. A subquery inside a USING clause is itself subject to
--     that table's RLS, so the obvious join returns zero rows for everyone.
--     The reach-through is therefore a SECURITY DEFINER predicate function
--     (the same shape the studio co-member policies use), which sees past the
--     PO's own RLS while exposing nothing of it.
--
-- (b) An RLS policy is ROW-level, and fulfillment_order_items' row carries
--     `unit_cost_cents` — the price_trade snapshot, i.e. what Patina paid the
--     vendor for the piece this client just bought. This is exactly the trap
--     review B-D2 caught on designer_clients in 00536: the policy is right and
--     the row is too wide. Column GRANTs DO work here where they did not
--     there, because every reader of these tables is service_role (all twelve
--     admin-portal BOH routes go through getAuthenticatedAdmin's service
--     client, and the four edge functions use the service key) — no product
--     surface reads fulfillment_order_items as `authenticated` at all. So
--     `authenticated` is narrowed to the columns a "where is it" screen needs,
--     and the cost, the vendor and the PO wiring stay behind service_role.

CREATE OR REPLACE FUNCTION public.fulfillment_po_belongs_to_caller(p_po_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.fulfillment_vendor_pos po
      JOIN public.fulfillment_orders o ON o.id = po.order_id
     WHERE po.id = p_po_id
       AND o.client_profile_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.fulfillment_po_belongs_to_caller(UUID) IS
  'Does this vendor PO sit under an order the caller bought? The predicate '
  'behind fulfillment_shipments'' client policy. SECURITY DEFINER because a '
  'USING subquery over fulfillment_vendor_pos would be filtered by that '
  'table''s own RLS and match nothing — and the client must not be given a '
  'policy there, because the PO carries the operator''s cost. Returns a '
  'boolean and nothing else.';

REVOKE ALL ON FUNCTION public.fulfillment_po_belongs_to_caller(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fulfillment_po_belongs_to_caller(UUID) TO authenticated;

DROP POLICY IF EXISTS fulfillment_orders_select_client ON public.fulfillment_orders;
CREATE POLICY fulfillment_orders_select_client ON public.fulfillment_orders
  FOR SELECT TO authenticated
  USING (client_profile_id = auth.uid());

DROP POLICY IF EXISTS fulfillment_order_items_select_client ON public.fulfillment_order_items;
CREATE POLICY fulfillment_order_items_select_client ON public.fulfillment_order_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fulfillment_orders o
     WHERE o.id = fulfillment_order_items.order_id
       AND o.client_profile_id = auth.uid()
  ));

DROP POLICY IF EXISTS fulfillment_shipments_select_client ON public.fulfillment_shipments;
CREATE POLICY fulfillment_shipments_select_client ON public.fulfillment_shipments
  FOR SELECT TO authenticated
  USING (public.fulfillment_po_belongs_to_caller(po_id));

CREATE INDEX IF NOT EXISTS idx_fulfillment_orders_client_profile
  ON public.fulfillment_orders(client_profile_id) WHERE client_profile_id IS NOT NULL;

COMMENT ON POLICY fulfillment_orders_select_client ON public.fulfillment_orders IS
  'Q6 / direction B §5: the client reads her own order on the rail that ships '
  'it — both the piece she bought herself and the piece her designer bought '
  'for her, since both land here. SELECT only; ops owns every write.';

-- ── (b) the column narrowing on fulfillment_order_items ────────────────────
--
-- Postgres keeps table-level and column-level privileges separately: a
-- column REVOKE against a table-level GRANT is a no-op. So the table grant is
-- withdrawn and re-issued as a column list. `agent_reader` and `service_role`
-- are untouched (00350:328-329) — this narrows exactly one role.
--
-- Withheld from `authenticated`, deliberately, each for a reason:
--   unit_cost_cents  what Patina paid the vendor — the margin on her own piece
--   vendor_id        who Patina buys from — the supply chain, not the order
--   vendor_sku       the same, by another name
--   mapping_state    an operator's queue state; means nothing to a buyer
--   po_line_id       the PO wiring, whose whole table she cannot read anyway

REVOKE SELECT ON public.fulfillment_order_items FROM authenticated;
GRANT SELECT (
  id, order_id, product_id, item_name, qty, unit_price_cents,
  line_state, line_state_entered_at, line_index, created_at, updated_at
) ON public.fulfillment_order_items TO authenticated;

COMMENT ON COLUMN public.fulfillment_order_items.unit_cost_cents IS
  'price_trade snapshot — what Patina pays the vendor. NOT readable by '
  '`authenticated` (00540 narrowed that role to a column list): the buyer of '
  'this line can read her own order, and this is not part of it. Every '
  'operator path reads it as service_role.';
