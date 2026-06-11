-- ============================================================================
-- Migration 00186: create_purchase_order RPC + vendor acknowledgment
--
-- Replaces the client-side 3-step compensating PO insert
-- (useCreatePurchaseOrder in packages/supabase/src/hooks/use-procurement.ts:
-- header INSERT → po_payments INSERT → per-item project_ffe_items UPDATE,
-- with compensating deletes) with ONE atomic SECURITY DEFINER transaction,
-- and FLIPS purchase_orders.total_cents semantics to the vendor-facing
-- TRADE total (00185 added the comment-only marker for this flip).
--
-- Contents:
--   1. purchase_orders: ADD COLUMN sidemark, acknowledged_at (+ comments);
--      update the total_cents comment now that the flip ships.
--   2. create_purchase_order(...) RETURNS purchase_orders — atomic create:
--      owner/vendor asserts, FOR UPDATE item locks with server-side guards
--      (cross-project, already-ordered, blocked-by-decision), server-computed
--      trade total, header + payment rows (ported 1:1 from the TS
--      buildPaymentRowsForPattern), item linking (00184 Trigger A ratchets
--      the linked items to 'ordered').
--   3. log_po_acknowledgment(...) RETURNS purchase_orders — records the
--      vendor's confirmation of the order: acknowledged_at (idempotent),
--      status → 'confirmed' (00184 Trigger B keeps linked items at
--      'ordered' — rank no-op), coalesce-updates vendor_po_number /
--      confirmed_eta.
--
-- Migrations 00148 (tables), 00184 (state-chain triggers), and 00185
-- (project_ffe_items.trade_price_cents) must be applied first.
-- Re-run safe: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE + idempotent
-- GRANT/REVOKE/COMMENT.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. COLUMNS + COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS sidemark TEXT,
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;

COMMENT ON COLUMN public.purchase_orders.sidemark IS
  'Designer-editable shipment sidemark printed on the vendor order. '
  'Convention: Studio / Client / Project / Room. NULL until the designer '
  'supplies one (the v2 Order Assistant UI adds the input field).';

COMMENT ON COLUMN public.purchase_orders.acknowledged_at IS
  'When the vendor confirmed receipt of the order (set by '
  'log_po_acknowledgment, 00186). Idempotent: re-acknowledging never '
  'overwrites the original timestamp. NULL = vendor has not acknowledged.';

-- The 00185 comment marked this flip as "upcoming"; it ships here.
COMMENT ON COLUMN public.purchase_orders.total_cents IS
  'Vendor-facing TRADE total in cents. Server-computed by '
  'create_purchase_order (00186) as Σ COALESCE(trade_price_cents, '
  'unit_price_cents, 0) × quantity over the linked project_ffe_items at '
  'creation time. Rows created before 00186 keep the CLIENT-price totals '
  'they were written with (the pre-00186 UI summed client prices).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. create_purchase_order — atomic PO create with server-computed trade total
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Returns the created purchase_orders row (same shape the old hook returned
-- from its header INSERT, so the client contract is unchanged).
--
-- Server-side guards that were previously client-side-only (or missing):
--   • caller must own the project (projects.designer_id = auth.uid()),
--   • every supplied FF&E item must exist in THAT project (cross-project ids
--     hard-fail instead of silently no-op'ing like the old per-row UPDATE),
--   • no item may already belong to a PO,
--   • no item may be blocked by a pending decision (the old flow enforced
--     this in the Order Assistant UI only — direct hook/API callers could
--     bypass it).
--
-- The selected items are locked FOR UPDATE before totalling so a concurrent
-- create_purchase_order (or price edit) cannot double-order an item or
-- change the total under us.

CREATE OR REPLACE FUNCTION public.create_purchase_order(
  p_project_id           UUID,
  p_vendor_id             UUID,
  p_payment_pattern       purchase_order_payment_pattern,
  p_ffe_item_ids          UUID[],
  p_vendor_po_number      TEXT    DEFAULT NULL,
  p_confirmed_eta         DATE    DEFAULT NULL,
  p_is_patina_catalog     BOOLEAN DEFAULT FALSE,
  p_deposit_due_date      DATE    DEFAULT NULL,
  p_deposit_amount_cents  INTEGER DEFAULT NULL,
  p_custom_milestones     JSONB   DEFAULT '[]'::jsonb,
  p_sidemark              TEXT    DEFAULT NULL,
  p_notes                 TEXT    DEFAULT NULL
)
RETURNS purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_designer_id     UUID := auth.uid();
  v_requested       INTEGER := COALESCE(array_length(p_ffe_item_ids, 1), 0);
  v_locked_count    INTEGER;
  v_already_linked  INTEGER;
  v_blocked_count   INTEGER;
  v_total           INTEGER;
  v_po              purchase_orders;
  v_deposit         INTEGER;
  v_milestone_count INTEGER;
  v_milestone_sum   INTEGER;
  v_bad_milestones  INTEGER;
BEGIN
  IF v_designer_id IS NULL THEN
    RAISE EXCEPTION 'create_purchase_order: not authenticated';
  END IF;

  -- (a) Caller must own the project (00178 issue_invoice error phrasing).
  PERFORM 1 FROM projects
   WHERE id = p_project_id AND designer_id = v_designer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'create_purchase_order: project % not found or access denied', p_project_id;
  END IF;

  -- (b) Vendor must exist.
  PERFORM 1 FROM vendors WHERE id = p_vendor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'create_purchase_order: vendor % not found', p_vendor_id;
  END IF;

  -- (c) Lock the items and aggregate the guards + (d) the TRADE total in one
  -- pass. FOR UPDATE serializes against a concurrent create (double-order)
  -- and against price edits mid-total. The project_id predicate makes
  -- cross-project ids fall out of the count instead of being silently
  -- linked. Duplicate ids in the array also fail the count check (each row
  -- locks once).
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE locked.purchase_order_id IS NOT NULL),
         COUNT(*) FILTER (WHERE locked.blocked IS TRUE),
         COALESCE(SUM(
           COALESCE(locked.trade_price_cents, locked.unit_price_cents, 0)
           * COALESCE(locked.quantity, 1)
         ), 0)::integer
    INTO v_locked_count, v_already_linked, v_blocked_count, v_total
    FROM (
      SELECT purchase_order_id, blocked, trade_price_cents,
             unit_price_cents, quantity
        FROM project_ffe_items
       WHERE id = ANY(p_ffe_item_ids)
         AND project_id = p_project_id
         FOR UPDATE
    ) locked;

  IF v_locked_count <> v_requested THEN
    RAISE EXCEPTION 'create_purchase_order: % of % FF&E items not found in project % (missing, duplicate, or cross-project ids)',
      v_requested - v_locked_count, v_requested, p_project_id;
  END IF;
  IF v_already_linked > 0 THEN
    RAISE EXCEPTION 'create_purchase_order: % FF&E item(s) are already linked to a purchase order',
      v_already_linked;
  END IF;
  IF v_blocked_count > 0 THEN
    RAISE EXCEPTION 'create_purchase_order: % FF&E item(s) are blocked pending a client decision',
      v_blocked_count;
  END IF;

  -- (e) Header. total_cents = server-computed TRADE total (semantic flip
  -- documented on the column comment above).
  INSERT INTO purchase_orders (
    designer_id, project_id, vendor_id, vendor_po_number, confirmed_eta,
    payment_pattern, total_cents, status, is_patina_catalog, sidemark, notes
  ) VALUES (
    v_designer_id, p_project_id, p_vendor_id, p_vendor_po_number, p_confirmed_eta,
    p_payment_pattern, v_total, 'draft', COALESCE(p_is_patina_catalog, FALSE),
    p_sidemark, p_notes
  )
  RETURNING * INTO v_po;

  -- (f) Payment rows — ported 1:1 from buildPaymentRowsForPattern
  -- (packages/supabase/src/hooks/use-procurement.ts, removed in the same
  -- commit as this migration):
  --   fifty_fifty    deposit = override ?? floor(total/2), balance = remainder
  --   thirty_seventy deposit = override ?? floor(total*0.3), balance = remainder
  --   full_upfront   single deposit at total
  --   net_30         single pending balance, due_date NULL (Trigger C shifts
  --                  it to delivered+30d)
  --   custom_milestones  one milestone row per entry
  -- All rows start 'pending'. Deltas vs the TS original: the deposit
  -- override is validated to 0..total (the TS version let an oversized
  -- override produce a negative balance that only failed at the CHECK), and
  -- custom milestones must be non-empty and sum exactly to the trade total
  -- (the TS version never validated the sum).
  CASE p_payment_pattern
    WHEN 'fifty_fifty', 'thirty_seventy' THEN
      IF p_payment_pattern = 'fifty_fifty' THEN
        -- v_total >= 0 so integer division == Math.floor(total / 2).
        v_deposit := COALESCE(p_deposit_amount_cents, v_total / 2);
      ELSE
        -- Exact NUMERIC 0.3 (vs the TS binary-float 0.3) — same result for
        -- all realistic cent totals.
        v_deposit := COALESCE(p_deposit_amount_cents, FLOOR(v_total * 0.3)::integer);
      END IF;
      IF v_deposit < 0 OR v_deposit > v_total THEN
        RAISE EXCEPTION 'create_purchase_order: deposit amount % must be between 0 and the PO total %',
          v_deposit, v_total;
      END IF;
      INSERT INTO po_payments (purchase_order_id, kind, amount_cents, due_date, state, label, sort_order)
      VALUES
        (v_po.id, 'deposit', v_deposit,           p_deposit_due_date, 'pending', NULL, 0),
        (v_po.id, 'balance', v_total - v_deposit, NULL,               'pending', NULL, 1);

    WHEN 'full_upfront' THEN
      INSERT INTO po_payments (purchase_order_id, kind, amount_cents, due_date, state, label, sort_order)
      VALUES (v_po.id, 'deposit', v_total, p_deposit_due_date, 'pending', NULL, 0);

    WHEN 'net_30' THEN
      INSERT INTO po_payments (purchase_order_id, kind, amount_cents, due_date, state, label, sort_order)
      VALUES (v_po.id, 'balance', v_total, NULL, 'pending', NULL, 0);

    WHEN 'custom_milestones' THEN
      v_milestone_count := jsonb_array_length(COALESCE(p_custom_milestones, '[]'::jsonb));
      IF v_milestone_count = 0 THEN
        RAISE EXCEPTION 'create_purchase_order: custom_milestones requires at least one milestone';
      END IF;

      SELECT COALESCE(SUM((m->>'amount_cents')::integer), 0),
             COUNT(*) FILTER (WHERE COALESCE((m->>'amount_cents')::integer, 0) <= 0)
        INTO v_milestone_sum, v_bad_milestones
        FROM jsonb_array_elements(p_custom_milestones) AS m;

      IF v_bad_milestones > 0 THEN
        RAISE EXCEPTION 'create_purchase_order: each milestone amount must be greater than zero';
      END IF;
      IF v_milestone_sum <> v_total THEN
        RAISE EXCEPTION 'create_purchase_order: milestone amounts sum to % but the PO trade total is %',
          v_milestone_sum, v_total;
      END IF;

      INSERT INTO po_payments (purchase_order_id, kind, amount_cents, due_date, state, label, sort_order)
      SELECT v_po.id,
             'milestone',
             (m->>'amount_cents')::integer,
             NULLIF(m->>'due_date', '')::date,
             'pending',
             m->>'label',
             COALESCE((m->>'sort_order')::integer, ord::integer - 1)
        FROM jsonb_array_elements(p_custom_milestones) WITH ORDINALITY AS t(m, ord);
  END CASE;

  -- (g) Link the items. 00184 Trigger A (aaa_ffe_ratchet_to_po_stage)
  -- ratchets each linked item up to 'ordered' in the same statement.
  UPDATE project_ffe_items
     SET purchase_order_id = v_po.id,
         updated_at        = NOW()
   WHERE id = ANY(p_ffe_item_ids)
     AND project_id = p_project_id;

  -- (h) Return the header exactly as inserted (status 'draft').
  RETURN v_po;
END;
$$;

COMMENT ON FUNCTION public.create_purchase_order(UUID, UUID, purchase_order_payment_pattern, UUID[], TEXT, DATE, BOOLEAN, DATE, INTEGER, JSONB, TEXT, TEXT) IS
  'Atomically creates a purchase order: locks the supplied project_ffe_items '
  '(rejecting cross-project, already-ordered, and decision-blocked items), '
  'computes total_cents as the vendor TRADE total (Σ COALESCE(trade_price_cents, '
  'unit_price_cents, 0) × quantity), inserts the draft header + the '
  'payment-pattern rows (ported from the removed client-side '
  'buildPaymentRowsForPattern), and links the items (00184 Trigger A ratchets '
  'them to ''ordered''). SECURITY DEFINER with an explicit '
  'projects.designer_id = auth.uid() ownership check.';

REVOKE ALL ON FUNCTION public.create_purchase_order(UUID, UUID, purchase_order_payment_pattern, UUID[], TEXT, DATE, BOOLEAN, DATE, INTEGER, JSONB, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_order(UUID, UUID, purchase_order_payment_pattern, UUID[], TEXT, DATE, BOOLEAN, DATE, INTEGER, JSONB, TEXT, TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. log_po_acknowledgment — vendor confirmed receipt of the order
-- ═══════════════════════════════════════════════════════════════════════════
--
-- draft/confirmed → confirmed. The status UPDATE fires 00184 Trigger B,
-- whose 'confirmed' → 'ordered' mapping is a rank no-op for items the create
-- RPC already ratcheted to 'ordered'. Idempotent on re-call:
--   • acknowledged_at = COALESCE(acknowledged_at, NOW()) keeps the original
--     acknowledgment timestamp,
--   • a confirmed→confirmed UPDATE doesn't re-fire Trigger B (it has a
--     WHEN (OLD.status IS DISTINCT FROM NEW.status) guard),
--   • vendor_po_number / confirmed_eta only overwrite when args are non-NULL.

CREATE OR REPLACE FUNCTION public.log_po_acknowledgment(
  p_po_id            UUID,
  p_vendor_po_number TEXT DEFAULT NULL,
  p_confirmed_eta    DATE DEFAULT NULL
)
RETURNS purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_po purchase_orders;
BEGIN
  SELECT * INTO v_po
    FROM purchase_orders
   WHERE id = p_po_id
     AND designer_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'log_po_acknowledgment: purchase order % not found or access denied', p_po_id;
  END IF;

  IF v_po.status NOT IN ('draft', 'confirmed') THEN
    RAISE EXCEPTION 'log_po_acknowledgment: purchase order % is %, expected draft or confirmed',
      p_po_id, v_po.status;
  END IF;

  UPDATE purchase_orders
     SET acknowledged_at  = COALESCE(acknowledged_at, NOW()),
         status           = 'confirmed',
         vendor_po_number = COALESCE(p_vendor_po_number, vendor_po_number),
         confirmed_eta    = COALESCE(p_confirmed_eta, confirmed_eta)
   WHERE id = p_po_id
   RETURNING * INTO v_po;

  RETURN v_po;
END;
$$;

COMMENT ON FUNCTION public.log_po_acknowledgment(UUID, TEXT, DATE) IS
  'Records the vendor''s acknowledgment of a purchase order: stamps '
  'acknowledged_at (idempotent — never overwrites an earlier stamp), advances '
  'draft → confirmed (00184 Trigger B keeps linked items at ''ordered''), and '
  'coalesce-updates vendor_po_number / confirmed_eta (NULL args preserve '
  'existing values). Owner-scoped via designer_id = auth.uid().';

REVOKE ALL ON FUNCTION public.log_po_acknowledgment(UUID, TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_po_acknowledgment(UUID, TEXT, DATE) TO authenticated;
