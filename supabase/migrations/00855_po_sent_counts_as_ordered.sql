-- ═══════════════════════════════════════════════════════════════════════════
-- 00855 — Only sent purchase orders count as ordered (US-51 F-02 / V26 F25)
-- Lineage: ffe_ratchet_to_po_stage and po_status_cascade_to_items: 00184.
-- Creation/add-line linking and 00719 release keep the existing PO facts;
-- po-send's successful sent_at write advances linked lines in that transaction.
-- Explicit production/shipping/receiving facts retain their 00184 side effects.
-- Existing ACLs, RPC signatures, status guards and the forward ratchet remain.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ffe_ratchet_to_po_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_po_status TEXT;
  v_sent_at   timestamptz;
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
  SELECT status, sent_at INTO v_po_status, v_sent_at
    FROM purchase_orders
   WHERE id = NEW.purchase_order_id
     FOR SHARE;

  IF v_po_status IS NULL THEN
    RETURN NEW;  -- Dangling link; FK will reject it anyway.
  END IF;

  v_target := po_status_to_ffe_stage(v_po_status);
  -- A draft/confirmed PO is a commitment only after the designer sent it.
  IF v_target = 'ordered' AND v_sent_at IS NULL THEN
    RETURN NEW;
  END IF;

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

COMMENT ON FUNCTION public.ffe_ratchet_to_po_stage() IS
  '00184 → 00855: linking to an unsent draft/confirmed PO does not mark a line ordered. '
  'Sent POs and later physical stages ratchet forward; manual advances are preserved.';

CREATE OR REPLACE FUNCTION public.po_status_cascade_to_items()
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

  IF NEW.status IN ('draft', 'confirmed', 'in_production', 'shipped', 'delivered') THEN
    v_target := po_status_to_ffe_stage(NEW.status);
    IF v_target = 'ordered' AND NEW.sent_at IS NULL THEN
      v_target := NULL;
    END IF;
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

COMMENT ON FUNCTION public.po_status_cascade_to_items() IS
  '00184 → 00855: sent_at or PO status advances linked items, with ordered gated on sent_at. '
  'Keeps the forward ratchet, cancellation detach/rollback, and deposit/balance side effects.';

DROP TRIGGER IF EXISTS trg_po_status_cascade_to_items ON public.purchase_orders;
CREATE TRIGGER trg_po_status_cascade_to_items
  AFTER UPDATE OF status, sent_at ON public.purchase_orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.sent_at IS DISTINCT FROM NEW.sent_at)
  EXECUTE FUNCTION public.po_status_cascade_to_items();

-- Status-only correction: the link ratchet runs only when a PO link changes,
-- so the ordinary guards accept this without disabling any trigger. Live
-- recorded/billed purchases are real commitments independent of PO standing.
DO $backfill$
BEGIN
  -- Serialize with the sender before taking item locks. The following UPDATE
  -- gets a fresh READ COMMITTED snapshot after any concurrent send finishes.
  PERFORM 1 FROM public.purchase_orders po
   WHERE po.sent_at IS NULL AND EXISTS (
     SELECT 1 FROM public.project_ffe_items item
     WHERE item.purchase_order_id = po.id AND item.status = 'ordered'
       AND EXISTS (
         SELECT 1 FROM public.purchase_orders po
         WHERE po.id = item.purchase_order_id AND po.sent_at IS NULL
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.purchase_orders po
         WHERE po.id = item.purchase_order_id AND po.sent_at IS NOT NULL
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.studio_purchases purchase
         WHERE purchase.ffe_item_id = item.id AND purchase.status IN ('recorded', 'billed')
       )
   )
   ORDER BY po.id FOR UPDATE;

  UPDATE public.project_ffe_items item
     SET status = 'approved', updated_at = now()
   WHERE item.status = 'ordered'
       AND EXISTS (
         SELECT 1 FROM public.purchase_orders po
         WHERE po.id = item.purchase_order_id AND po.sent_at IS NULL
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.purchase_orders po
         WHERE po.id = item.purchase_order_id AND po.sent_at IS NOT NULL
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.studio_purchases purchase
         WHERE purchase.ffe_item_id = item.id AND purchase.status IN ('recorded', 'billed')
       );
END;
$backfill$;
