-- ============================================================================
-- Migration 00184: Procurement State Chain
--
-- DB-level state synchronization between purchase_orders, po_payments,
-- receiving_inspections, and project_ffe_items. Makes the database
-- authoritative for FF&E stage advances that previously only happened
-- client-side (use-procurement.ts) — and therefore never happened when a
-- PO was mutated outside those hooks.
--
-- Triggers (no recursion: items/payments-side triggers never write
-- purchase_orders; purchase_orders-side trigger guards with
-- pg_trigger_depth()):
--   A. aaa_ffe_ratchet_to_po_stage  (BEFORE INSERT OR UPDATE OF
--      purchase_order_id ON project_ffe_items) — linking an item to a PO
--      ratchets the item's status up to the PO's stage. Named with an
--      `aaa_` prefix so it fires BEFORE stamp_ffe_status_change_trigger
--      (00084) — Postgres fires same-event BEFORE triggers in alphabetical
--      name order — letting the stamp trigger see the mutated NEW.status
--      and set last_status_change_at in the same flight.
--   B. trg_po_status_cascade_to_items (AFTER UPDATE OF status ON
--      purchase_orders) — PO status propagates to linked items (rank
--      ratchet, manual advances never clobbered); cancellation unlinks
--      items; shipped/delivered + paid deposit flips the pending balance
--      to due.
--   C. trg_receiving_inspection_side_effects (AFTER INSERT ON
--      receiving_inspections) — stamps purchase_orders.delivered_date (all
--      outcomes), advances the PO to 'delivered' on a CLEAN outcome only
--      (deliberate tightening vs the old hook, which advanced on every
--      outcome), shifts the net-30 balance due_date, and marks items
--      received.
--   D. trg_deposit_paid_flips_balance (AFTER UPDATE OF state ON
--      po_payments) — deposit paid while the PO is shipped/delivered flips
--      the sibling pending balance to due (inverse order of Trigger B's
--      flip). The flip is a plain UPDATE, so trg_notify_payment_due
--      (00151) fires and creates the balance_due notification.
--
-- Migrations 00148, 00150, 00151 must be applied first.
-- ============================================================================

-- ─── PART 1: IMMUTABLE HELPERS ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ffe_status_rank(p_status TEXT) RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_status
    WHEN 'specified' THEN 0 WHEN 'quoted' THEN 1 WHEN 'approved' THEN 2
    WHEN 'ordered' THEN 3 WHEN 'production' THEN 4 WHEN 'shipped' THEN 5
    WHEN 'delivered' THEN 6 WHEN 'installed' THEN 7
    -- unknown/future statuses rank below 'specified' so the ratchet always
    -- advances them (safe direction); update this map when adding statuses
    ELSE -1 END
$$;

COMMENT ON FUNCTION ffe_status_rank(TEXT) IS
  'Maps project_ffe_items.status to its position in the lifecycle. Used by the '
  'procurement state-chain triggers to implement a rank ratchet: automated '
  'advances only ever move an item FORWARD, so manual advances are never clobbered.';

CREATE OR REPLACE FUNCTION po_status_to_ffe_stage(p_po_status TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_po_status
    WHEN 'draft' THEN 'ordered' WHEN 'confirmed' THEN 'ordered'
    WHEN 'in_production' THEN 'production' WHEN 'shipped' THEN 'shipped'
    WHEN 'delivered' THEN 'delivered' ELSE NULL END
$$;

COMMENT ON FUNCTION po_status_to_ffe_stage(TEXT) IS
  'Maps a purchase_orders.status to the project_ffe_items.status a linked item '
  'should be ratcheted up to. NULL for ''cancelled'' (handled separately) and '
  'unknown statuses.';

-- ─── PART 2: SHARED HELPER — flip pending balance to due ────────────────────
--
-- Used by Triggers B and D. The UPDATE is a normal row update, so the
-- trg_notify_payment_due trigger from 00151 fires on the pending→due
-- transition and creates the balance_due procurement_notifications row.
--
-- due_date: the legacy hook (useLogPaymentPaid) flips state without touching
-- due_date. COALESCE preserves any existing due_date and only fills NULL with
-- today, so the flip is idempotent against the (still deployed) hook logic
-- while giving NULL-dated balances a sensible "due now" date.

CREATE OR REPLACE FUNCTION flip_pending_balance_to_due(p_purchase_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE po_payments
     SET state    = 'due',
         due_date = COALESCE(due_date, CURRENT_DATE)
   WHERE purchase_order_id = p_purchase_order_id
     AND kind  = 'balance'
     AND state = 'pending';
END;
$$;

COMMENT ON FUNCTION flip_pending_balance_to_due(UUID) IS
  'Flips the pending balance payment row(s) of a PO to ''due'' (filling a NULL '
  'due_date with CURRENT_DATE). Shared by the PO-shipped path (Trigger B) and '
  'the deposit-paid path (Trigger D) of the deposit/balance inverse-order rule.';

-- ─── PART 3: TRIGGER A — item linked to PO ratchets up to PO's stage ─────────
--
-- BEFORE trigger that mutates NEW so the 00084 stamp trigger
-- (stamp_ffe_status_change_trigger, BEFORE UPDATE only) stamps
-- last_status_change_at in the same statement. On INSERT the stamp trigger
-- does not fire, so this function stamps it itself.

CREATE OR REPLACE FUNCTION ffe_ratchet_to_po_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_po_status TEXT;
  v_target    TEXT;
BEGIN
  IF NEW.purchase_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only react when the link itself changed.
  IF TG_OP = 'UPDATE' AND NEW.purchase_order_id IS NOT DISTINCT FROM OLD.purchase_order_id THEN
    RETURN NEW;
  END IF;

  -- FOR SHARE: a status-only UPDATE takes FOR NO KEY UPDATE, which FOR KEY
  -- SHARE would NOT conflict with — FOR SHARE does. This blocks until a
  -- concurrent cancel commits, so the ratchet sees the final status (closes
  -- the read-then-ratchet TOCTOU window). A rare simultaneous cancel+link can
  -- deadlock; Postgres aborts one tx loudly, which beats a silent wrong link.
  SELECT status INTO v_po_status
    FROM purchase_orders
   WHERE id = NEW.purchase_order_id
     FOR SHARE;

  IF v_po_status IS NULL THEN
    RETURN NEW;  -- Dangling link; FK will reject it anyway.
  END IF;

  v_target := po_status_to_ffe_stage(v_po_status);

  IF v_target IS NOT NULL AND ffe_status_rank(NEW.status) < ffe_status_rank(v_target) THEN
    NEW.status := v_target;
    -- stamp_ffe_status_change_trigger (00084) is BEFORE UPDATE only — cover
    -- the INSERT path here so last_status_change_at is stamped either way.
    IF TG_OP = 'INSERT' THEN
      NEW.last_status_change_at := NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION ffe_ratchet_to_po_stage() IS
  'Trigger function: when a project_ffe_items row is linked to a PO (INSERT, or '
  'UPDATE that changes purchase_order_id), ratchets the item status up to the '
  'PO''s mapped stage. Never moves an item backward. SECURITY DEFINER so the '
  'purchase_orders lookup is not subject to the caller''s RLS.';

DROP TRIGGER IF EXISTS aaa_ffe_ratchet_to_po_stage ON project_ffe_items;
CREATE TRIGGER aaa_ffe_ratchet_to_po_stage
  BEFORE INSERT OR UPDATE OF purchase_order_id ON project_ffe_items
  FOR EACH ROW
  EXECUTE FUNCTION ffe_ratchet_to_po_stage();

COMMENT ON TRIGGER aaa_ffe_ratchet_to_po_stage ON project_ffe_items IS
  'aaa_ prefix is load-bearing: same-event BEFORE triggers fire in alphabetical '
  'name order, and this must run before stamp_ffe_status_change_trigger (00084) '
  'so the stamp trigger sees the mutated NEW.status.';

-- ─── PART 4: TRIGGER B — PO status propagates to linked items ────────────────

CREATE OR REPLACE FUNCTION po_status_cascade_to_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target TEXT;
BEGIN
  -- Circuit breaker: the state chain is acyclic by construction (items- and
  -- payments-side triggers never write purchase_orders), but guard against
  -- future regressions introducing a cycle.
  -- Max expected depth: 2 (PO update → item cascade) or 3 (PO update →
  -- flip helper → Trigger D). 4+ indicates a cycle introduced by a future
  -- regression.
  IF pg_trigger_depth() > 3 THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('confirmed', 'in_production', 'shipped', 'delivered') THEN
    v_target := po_status_to_ffe_stage(NEW.status);
    -- Rank ratchet: only items BELOW the target advance. Items a designer
    -- manually moved ahead are never clobbered.
    UPDATE project_ffe_items
       SET status     = v_target,
           updated_at = NOW()
     WHERE purchase_order_id = NEW.id
       AND ffe_status_rank(status) < ffe_status_rank(v_target);

  ELSIF NEW.status = 'cancelled' THEN
    -- Single atomic detach of every linked item: rank 0-2 items
    -- (specified/quoted/approved) detach keeping their status; in-flight
    -- items (ordered..shipped, rank 3-5) roll back to 'approved';
    -- delivered/installed items (rank 6-7) detach keeping their status
    -- (the goods physically exist regardless of the PO's fate).
    UPDATE project_ffe_items
       SET purchase_order_id = NULL,
           status = CASE WHEN ffe_status_rank(status) BETWEEN 3 AND 5 THEN 'approved' ELSE status END,
           updated_at = NOW()
     WHERE purchase_order_id = NEW.id;
  END IF;

  -- Deposit/balance inverse-order rule, PO-progressed-second path: if the
  -- deposit was already paid before the PO shipped — or jumped straight to
  -- 'delivered' without passing 'shipped' (e.g. a clean receiving
  -- inspection on a confirmed PO) — flip the pending balance to due now.
  -- Status set is symmetric with Trigger D. (Deposit-paid-second path is
  -- Trigger D.)
  IF NEW.status IN ('shipped', 'delivered')
     AND NEW.payment_pattern IN ('fifty_fifty', 'thirty_seventy')
     AND EXISTS (
       SELECT 1
         FROM po_payments
        WHERE purchase_order_id = NEW.id
          AND kind  = 'deposit'
          AND state = 'paid'
     )
  THEN
    PERFORM flip_pending_balance_to_due(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION po_status_cascade_to_items() IS
  'Trigger function: propagates purchase_orders.status changes to linked '
  'project_ffe_items (rank ratchet forward; cancellation unlinks + rolls back '
  'in-flight items to ''approved'') and flips the pending balance payment to '
  '''due'' when the PO reaches ''shipped'' or ''delivered'' with the deposit '
  'already paid. SECURITY DEFINER so the cascading writes bypass RLS.';

DROP TRIGGER IF EXISTS trg_po_status_cascade_to_items ON purchase_orders;
CREATE TRIGGER trg_po_status_cascade_to_items
  AFTER UPDATE OF status ON purchase_orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION po_status_cascade_to_items();

-- ─── PART 5: TRIGGER C — receiving inspection side effects ───────────────────

CREATE OR REPLACE FUNCTION receiving_inspection_side_effects()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_po                 purchase_orders%ROWTYPE;
  v_delivered_was_null BOOLEAN;
  v_delivered_date     DATE;
BEGIN
  SELECT * INTO v_po
    FROM purchase_orders
   WHERE id = NEW.purchase_order_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_delivered_was_null := v_po.delivered_date IS NULL;
  v_delivered_date     := COALESCE(v_po.delivered_date, NEW.inspected_at::date);

  -- Stamp delivered_date on ALL outcomes (the truck arrived), but only a
  -- CLEAN inspection advances the PO to 'delivered'. Damaged/partial leave
  -- the PO status alone — deliberate tightening vs the legacy hook, which
  -- advanced on every outcome. The status change cascades to linked items
  -- via Trigger B.
  UPDATE purchase_orders
     SET delivered_date = v_delivered_date,
         status = CASE
                    WHEN NEW.outcome = 'clean'
                         AND status NOT IN ('delivered', 'cancelled')
                    THEN 'delivered'
                    ELSE status
                  END
   WHERE id = NEW.purchase_order_id;

  -- net-30: when delivered_date just transitioned from NULL, the balance
  -- becomes due 30 days after delivery. Only pending rows — never overwrite
  -- a paid or already-due row (mirrors the legacy hook's predicate).
  IF v_po.payment_pattern = 'net_30' AND v_delivered_was_null THEN
    UPDATE po_payments
       SET due_date = (v_delivered_date + INTERVAL '30 days')::date
     WHERE purchase_order_id = NEW.purchase_order_id
       AND kind  = 'balance'
       AND state = 'pending';
  END IF;

  -- Clean inspection ⇒ everything on the PO arrived: mark items fully
  -- received (never decreases an existing count).
  IF NEW.outcome = 'clean' THEN
    UPDATE project_ffe_items
       SET received_quantity = quantity,
           updated_at        = NOW()
     WHERE purchase_order_id = NEW.purchase_order_id
       AND (received_quantity IS NULL OR received_quantity < quantity);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION receiving_inspection_side_effects() IS
  'Trigger function: on receiving_inspections INSERT, stamps the parent PO''s '
  'delivered_date (all outcomes), advances the PO to ''delivered'' on a clean '
  'outcome only, shifts the net-30 pending balance due_date to delivered+30d, '
  'and sets received_quantity = quantity on linked items for clean outcomes. '
  'SECURITY DEFINER so the writes bypass RLS.';

DROP TRIGGER IF EXISTS trg_receiving_inspection_side_effects ON receiving_inspections;
CREATE TRIGGER trg_receiving_inspection_side_effects
  AFTER INSERT ON receiving_inspections
  FOR EACH ROW
  EXECUTE FUNCTION receiving_inspection_side_effects();

-- ─── PART 6: TRIGGER D — deposit paid flips balance to due ───────────────────

CREATE OR REPLACE FUNCTION deposit_paid_flips_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pattern purchase_order_payment_pattern;
  v_status  TEXT;
BEGIN
  IF NEW.kind <> 'deposit' THEN
    RETURN NEW;
  END IF;

  SELECT payment_pattern, status
    INTO v_pattern, v_status
    FROM purchase_orders
   WHERE id = NEW.purchase_order_id;

  IF v_pattern IN ('fifty_fifty', 'thirty_seventy')
     AND v_status IN ('shipped', 'delivered')
  THEN
    -- The flip is a plain UPDATE on po_payments, so trg_notify_payment_due
    -- (00151) fires on the pending→due transition and creates the
    -- balance_due notification. The balance row's NEW.state is 'due', not
    -- 'paid', so this trigger does not re-fire (no recursion).
    PERFORM flip_pending_balance_to_due(NEW.purchase_order_id);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION deposit_paid_flips_balance() IS
  'Trigger function: when a deposit payment transitions to ''paid'' and the '
  'parent split-pattern PO has already shipped (or delivered), flips the '
  'sibling pending balance to ''due''. Inverse-order counterpart of the '
  'PO-shipped flip in po_status_cascade_to_items(). SECURITY DEFINER so the '
  'sibling write bypasses RLS.';

DROP TRIGGER IF EXISTS trg_deposit_paid_flips_balance ON po_payments;
CREATE TRIGGER trg_deposit_paid_flips_balance
  AFTER UPDATE OF state ON po_payments
  FOR EACH ROW
  WHEN (NEW.state = 'paid' AND OLD.state IS DISTINCT FROM 'paid')
  EXECUTE FUNCTION deposit_paid_flips_balance();
