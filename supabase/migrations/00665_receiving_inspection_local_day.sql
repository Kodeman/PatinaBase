-- ═══════════════════════════════════════════════════════════════════════════
-- 00665 — D9: a delivery belongs to the inspecting phone's local day
--
-- Ruling D9 (Kody, 2026-09-24). 00184's receiving trigger stamped
-- `purchase_orders.delivered_date` from `NEW.inspected_at::date`, which is the
-- UTC day on Strata: a 7 pm inspection in Los Angeles landed on the next day,
-- and the net-30 balance `due_date` (delivered + 30) moved with it. Field's
-- own client-side write of the local day (SQ-191) never takes effect, because
-- the trigger has already stamped the column by the time it runs.
--
-- This migration:
--   1. adds a nullable `receiving_inspections.inspected_local_date`, the day
--      on the inspecting phone's calendar, sent by the client;
--   2. redefines the trigger function to prefer that day and fall back to the
--      UTC day for older clients that do not send it. `due_date` follows.
--
-- Existing `delivered_date` / `due_date` values are NOT rewritten: they are
-- money-adjacent history. Every existing inspection has a NULL local day, so
-- the new rule reproduces its old stamp exactly.
--
-- Lineage of `receiving_inspection_side_effects()`: 00184 → 00665. Body copied
-- verbatim from 00184 (the only prior definition); the delta is the COALESCE.
-- The trigger `trg_receiving_inspection_side_effects` (00184) is unchanged and
-- keeps pointing at this function. CREATE OR REPLACE keeps the function's ACL,
-- so no GRANT/REVOKE is needed.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.receiving_inspections
  ADD COLUMN IF NOT EXISTS inspected_local_date DATE;

COMMENT ON COLUMN public.receiving_inspections.inspected_local_date IS
  'The inspection''s day on the inspecting phone''s own calendar (ruling D9). '
  'When present, the receiving trigger stamps purchase_orders.delivered_date '
  'from it; NULL (older clients) falls back to the UTC day of inspected_at.';

CREATE OR REPLACE FUNCTION public.receiving_inspection_side_effects()
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
  -- D9 (00665): the phone's local day wins over the UTC day of the instant.
  v_delivered_date     := COALESCE(v_po.delivered_date,
                                   NEW.inspected_local_date,
                                   NEW.inspected_at::date);

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

COMMENT ON FUNCTION public.receiving_inspection_side_effects() IS
  'Trigger function: on receiving_inspections INSERT, stamps the parent PO''s '
  'delivered_date (all outcomes) from the inspecting phone''s local day '
  '(inspected_local_date), falling back to the UTC day of inspected_at; '
  'advances the PO to ''delivered'' on a clean outcome only, shifts the net-30 '
  'pending balance due_date to delivered+30d, and sets received_quantity = '
  'quantity on linked items for clean outcomes. SECURITY DEFINER so the writes '
  'bypass RLS.';
