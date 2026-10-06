-- ═══════════════════════════════════════════════════════════════════════════
-- 00690 — Purchase-order header RPCs for the studio buying Phase 0
--         (US-16 C-01, C-02, C-03, C-07 SQL; SQ-391)
--
-- purchase_orders has been RPC-only since 00447: authenticated holds no
-- INSERT/UPDATE/DELETE and guard_purchase_order_rpc_mutation raises for any
-- write outside an RPC. Three browser hooks still wrote the table directly
-- (ETA, status) or had no writer at all (ship-to), so each fails with 42501.
-- This migration adds one sibling RPC per header act. No existing function is
-- renamed or re-wrapped.
--
--   can_send_purchase_order(po)       the single access test the RPCs below,
--                                     assign_po_number and po-send use. On a
--                                     project with a studio_id: the project
--                                     owner or an active non-guest member of
--                                     THAT organization (is_active_org_member,
--                                     00556). On a project without one: the
--                                     owner or a non-guest co-member of the
--                                     owner (is_studio_comember, 00556).
--   set_purchase_order_eta            writes confirmed_eta (+ a dated audit
--     (po,eta,n,local_date)           line in notes). Never stamps
--                                     acknowledged_at and never moves status:
--                                     a batch ETA is not a vendor act (R16).
--                                     log_po_acknowledgment (00451) remains
--                                     the only ack writer.
--   set_purchase_order_ship_to(po,s)  writes ship_to. Once sent_at is set it
--                                     may still FILL a missing ship-to (a PO
--                                     marked sent with none must be able to
--                                     get one and be re-sent) but never
--                                     change one already on sent paper (R8:
--                                     void-to-edit, then a change order).
--   advance_purchase_order_status     forward moves inside confirmed →
--     (po,to,n,local_date)            in_production → shipped only. delivered
--                                     stays receipt-driven; cancel stays with
--                                     the change workflow. The 00184 AFTER
--                                     UPDATE OF status trigger
--                                     (trg_po_status_cascade_to_items) still
--                                     ratchets the linked lines and flips the
--                                     pending balance to due on ship.
--
-- Studio-local day (the 00665/D9 rule): the ETA and status RPCs take an
-- optional p_local_date, the day on the caller's own calendar. It stamps the
-- audit lines and, on ship, the due_date of a balance the cascade flips to
-- due (flip_pending_balance_to_due, 00184, fills a NULL due_date with the UTC
-- CURRENT_DATE; this RPC re-dates exactly the rows that flip performed, so
-- 00184 is not redefined). It must fall within one day of the UTC day, the
-- 00665 bound. NULL falls back to the UTC day for older clients.
--
-- Not covered here: _ffe_require_studio_project (00435), the gate 00691 and
-- 00692 use, has the same gap can_send_purchase_order closes. It tests
-- is_studio_comember(projects.designer_id) and ignores projects.studio_id.
-- It is left unchanged: it gates every FF&E RPC and is outside this change.
--   assign_po_number(po)              00188 body with the owner-equality lock
--                                     widened to can_send_purchase_order. The
--                                     counter stays per project owner
--                                     (po_counters.designer_id =
--                                     purchase_orders.designer_id), so a
--                                     co-member numbers under the owner's
--                                     sequence. Error text unchanged.
--
-- Every function: SECURITY DEFINER, pinned search_path, REVOKE from PUBLIC
-- and anon, GRANT EXECUTE to authenticated. Adds GRANT/REVOKE → regenerate
-- supabase/seed/00-legacy-grants.sql (python3 scripts/generate-legacy-grants.py).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── can_send_purchase_order ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_send_purchase_order(p_po_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.purchase_orders po
    JOIN public.projects project ON project.id = po.project_id
    WHERE po.id = p_po_id
      AND CASE
            -- A studio project belongs to that studio, not to every studio
            -- its owner sits in.
            WHEN project.studio_id IS NOT NULL THEN
              project.designer_id = (select auth.uid())
              OR public.is_active_org_member(project.studio_id)
            ELSE public.is_studio_comember(project.designer_id)
          END
  );
$$;

COMMENT ON FUNCTION public.can_send_purchase_order(uuid) IS
  'True when the caller is the owner of the purchase order''s project, or an '
  'active non-guest member of the project''s studio (projects.studio_id, '
  'is_active_org_member) when it has one, else a non-guest active co-member '
  'of the owner (is_studio_comember, 00556). False for a missing PO, so '
  'callers keep the 404 idiom.';

REVOKE ALL ON FUNCTION public.can_send_purchase_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_send_purchase_order(uuid) TO authenticated;

-- ─── set_purchase_order_eta ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_purchase_order_eta(
  p_po_id uuid, p_eta date, p_note text DEFAULT NULL, p_local_date date DEFAULT NULL
)
RETURNS public.purchase_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_utc_day date := (now() AT TIME ZONE 'UTC')::date;
  v_day date := COALESCE(p_local_date, v_utc_day);
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'set_purchase_order_eta: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_day NOT BETWEEN v_utc_day - 1 AND v_utc_day + 1 THEN
    RAISE EXCEPTION 'set_purchase_order_eta: local date % is more than a day from today (UTC %)', v_day, v_utc_day
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_eta IS NULL THEN
    RAISE EXCEPTION 'set_purchase_order_eta: an ETA date is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'set_purchase_order_eta: purchase order % is cancelled', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.purchase_orders SET
    confirmed_eta = p_eta,
    -- Same audit-line format the browser hook appended before 00690.
    notes = CASE
      WHEN v_note IS NULL THEN notes
      WHEN COALESCE(notes, '') = '' THEN format('[%s ETA update]: %s', v_day, v_note)
      ELSE notes || E'\n' || format('[%s ETA update]: %s', v_day, v_note)
    END
  WHERE id = p_po_id
  RETURNING * INTO v_po;
  RETURN v_po;
END;
$$;

REVOKE ALL ON FUNCTION public.set_purchase_order_eta(uuid, date, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_purchase_order_eta(uuid, date, text, date) TO authenticated;

-- ─── set_purchase_order_ship_to ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_purchase_order_ship_to(
  p_po_id uuid, p_ship_to text
)
RETURNS public.purchase_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'set_purchase_order_ship_to: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- After send, a missing ship-to may be filled (po-send refuses to resend
  -- without one) but one already on sent paper is fixed (R8).
  IF v_po.sent_at IS NOT NULL AND NULLIF(btrim(COALESCE(v_po.ship_to, '')), '') IS NOT NULL THEN
    RAISE EXCEPTION 'set_purchase_order_ship_to: purchase order % was already sent; ship-to is fixed on sent paper', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'set_purchase_order_ship_to: purchase order % is cancelled', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.purchase_orders
     SET ship_to = NULLIF(btrim(COALESCE(p_ship_to, '')), '')
   WHERE id = p_po_id
  RETURNING * INTO v_po;
  RETURN v_po;
END;
$$;

REVOKE ALL ON FUNCTION public.set_purchase_order_ship_to(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_purchase_order_ship_to(uuid, text) TO authenticated;

-- ─── advance_purchase_order_status ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.advance_purchase_order_status(
  p_po_id uuid, p_to text, p_note text DEFAULT NULL, p_local_date date DEFAULT NULL
)
RETURNS public.purchase_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_from_rank integer;
  v_to_rank integer;
  v_utc_day date := (now() AT TIME ZONE 'UTC')::date;
  v_day date := COALESCE(p_local_date, v_utc_day);
  v_undated_balances uuid[];
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'advance_purchase_order_status: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_day NOT BETWEEN v_utc_day - 1 AND v_utc_day + 1 THEN
    RAISE EXCEPTION 'advance_purchase_order_status: local date % is more than a day from today (UTC %)', v_day, v_utc_day
      USING ERRCODE = 'check_violation';
  END IF;

  v_from_rank := CASE v_po.status
    WHEN 'confirmed' THEN 1 WHEN 'in_production' THEN 2 WHEN 'shipped' THEN 3 END;
  v_to_rank := CASE p_to
    WHEN 'in_production' THEN 2 WHEN 'shipped' THEN 3 END;

  -- Re-recording the current status is a no-op (a double tap must not error
  -- or duplicate the audit line).
  IF v_to_rank IS NOT NULL AND v_po.status = p_to THEN
    RETURN v_po;
  END IF;
  IF v_from_rank IS NULL OR v_to_rank IS NULL OR v_to_rank <= v_from_rank THEN
    RAISE EXCEPTION 'advance_purchase_order_status: % → % is not allowed; only confirmed → in_production → shipped (delivered is recorded by receiving)',
      v_po.status, COALESCE(p_to, 'null')
      USING ERRCODE = 'check_violation';
  END IF;

  -- The pending balances the 00184 cascade may flip to due (with the UTC
  -- CURRENT_DATE) on this status change.
  v_undated_balances := ARRAY(
    SELECT id FROM public.po_payments
     WHERE purchase_order_id = p_po_id
       AND kind = 'balance' AND state = 'pending' AND due_date IS NULL
  );

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.purchase_orders SET
    status = p_to,
    notes = CASE
      WHEN v_note IS NULL THEN notes
      WHEN COALESCE(notes, '') = '' THEN format('[%s %s]: %s', v_day, p_to, v_note)
      ELSE notes || E'\n' || format('[%s %s]: %s', v_day, p_to, v_note)
    END
  WHERE id = p_po_id
  RETURNING * INTO v_po;

  -- Re-date only the balances that flip just made due: they fall due on the
  -- studio's day, not the UTC day.
  UPDATE public.po_payments
     SET due_date = v_day
   WHERE id = ANY (v_undated_balances)
     AND state = 'due'
     AND due_date IS DISTINCT FROM v_day;
  RETURN v_po;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_purchase_order_status(uuid, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_purchase_order_status(uuid, text, text, date) TO authenticated;

-- ─── assign_po_number (00188, co-member widening) ──────────────────────────
-- po-send calls this under the sender's JWT. 00188 locked on
-- designer_id = auth.uid(), and create_purchase_order (00449) always stores
-- the project owner as designer_id, so a co-member sender could never number
-- the PO they made. The lock now admits can_send_purchase_order; the counter
-- row is still keyed by the PO's designer_id (the owner), so numbering stays
-- one sequence per owner and the race-safe upsert shape is unchanged.

CREATE OR REPLACE FUNCTION public.assign_po_number(p_po_id UUID)
RETURNS purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_po     purchase_orders;
  v_number INTEGER;
BEGIN
  -- Studio-scoped lock; anyone else gets the same error as a missing row so
  -- the RPC leaks nothing.
  SELECT * INTO v_po
    FROM purchase_orders
   WHERE id = p_po_id
   FOR UPDATE;

  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'assign_po_number: purchase order % not found or access denied', p_po_id;
  END IF;

  -- Idempotent: already numbered → return the row unchanged (counter
  -- untouched).
  IF v_po.po_number IS NOT NULL THEN
    RETURN v_po;
  END IF;

  INSERT INTO po_counters (designer_id)
  VALUES (v_po.designer_id)
  ON CONFLICT (designer_id)
    DO UPDATE SET next_number = po_counters.next_number + 1
  RETURNING next_number INTO v_number;

  UPDATE purchase_orders
     SET po_number = 'PO-' || LPAD(v_number::TEXT, 4, '0')
   WHERE id = p_po_id
   RETURNING * INTO v_po;

  RETURN v_po;
END;
$$;

COMMENT ON FUNCTION public.assign_po_number(UUID) IS
  'Assigns OUR outbound PO number (PO-0001, …) from the per-owner '
  'po_counters sequence (keyed by purchase_orders.designer_id, the project '
  'owner). Idempotent — a PO that already has a po_number is returned '
  'unchanged without touching the counter. Race-safe via FOR UPDATE on the '
  'header + the issue_invoice-style ON CONFLICT counter upsert (00178). '
  'SECURITY DEFINER; callable by the owner or a non-guest studio co-member '
  '(can_send_purchase_order, 00690); called by po-send under the caller''s JWT.';

REVOKE ALL ON FUNCTION public.assign_po_number(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_po_number(UUID) TO authenticated;
