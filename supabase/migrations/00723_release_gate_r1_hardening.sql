-- ═══════════════════════════════════════════════════════════════════════════
-- 00723 — Release gate R1 fixes (US-17 H1; SQ-466, findings from SQ-460)
-- ═══════════════════════════════════════════════════════════════════════════
-- F1  An acknowledged order stays in its split group. _release_gate_total
--     reads COALESCE(sent_at, acknowledged_at) as a sibling's send time: a
--     non-cancelled sibling with neither counts whatever its status, one
--     whose send time is within 7 days counts. An acknowledgment confirms a
--     draft without a send (log_po_acknowledgment / _v2 stamp acknowledged_at),
--     so before this the confirmed order left the group.
-- F2  Changed paper is never re-sent unreleased.
--     (a) Already closed in 00690: set_purchase_order_ship_to refuses a
--         changed ship-to on sent paper with the same check and errcode as
--         set_purchase_order_ship_to_location (00716). Both still let a blank
--         ship-to be filled after send (R8). Neither is redefined here.
--     (b) assert_po_resend_cleared(po) refuses changed_since_release when a
--         sent order is gated (_release_gate_applies on its group total) and
--         its non-null released_fingerprint no longer matches. That includes
--         the R8 fill: the approver never saw that destination. po-send reads
--         it on a resend and answers 409 changed_since_release. A NULL
--         (pre-00719) fingerprint is not checked. _po_release_cleared_po keeps
--         its sent arm: the guard trigger always passes p_sent_at NULL, and
--         po_is_sendable's resend answer is unchanged.
-- F3  No blank-sidemark allowance. _po_release_cleared_po loses its
--     blank-sidemark arm, and _po_release_fingerprint loses p_blank_sidemark.
--     po-send writes its default sidemark through apply_po_default_sidemark
--     (service role only). It writes only into a blank sidemark. In the same
--     statement it re-stamps a release that covered the paper read in that
--     statement. A member's sidemark written after a blank release re-holds
--     the order.
--     The paper is now its own function, _po_release_paper, so that one
--     statement can stamp the paper with the default sidemark.
-- F7  assign_po_number also refuses an unsent draft that po_is_sendable holds
--     back, with the same held_for_release: prefix.
-- F8  A rider's actualCents leaves the fingerprint (kind, estimateCents and
--     payees stay). po-send prints no riders, and an actual is bookkeeping.
--
-- Lineage of the redefined functions (each is its live head's body, verbatim,
-- with only the change named here):
--   _po_release_fingerprint   00719 → 00723 (dropped and re-created as
--                             _po_release_paper + md5, without p_blank_sidemark)
--   _release_gate_total       00719 → 00723
--   _po_release_cleared_po    00719 → 00723
--   assign_po_number          00188 → 00690 → 00719 → 00723
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. The paper a release covers (F3, F8) ─────────────────────────────────

DROP FUNCTION IF EXISTS public._po_release_fingerprint(uuid, boolean);

-- Internal: what a release covers. Payments and riders are ordered by their
-- own values, so a schedule rewritten to the same rows reads the same.
CREATE OR REPLACE FUNCTION public._po_release_paper(p_po_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
           'lines', COALESCE(public._po_spec_lines(po.id), '[]'::jsonb),
           'header', jsonb_build_object(
             'sidemark', NULLIF(btrim(po.sidemark), ''),
             'requestedShipOn', po.requested_ship_on,
             'billTo', po.bill_to,
             'freightTerms', po.freight_terms,
             'vendorNote', po.vendor_note,
             'suppliesPurchaseOrderId', po.supplies_purchase_order_id),
           'shipToLocationId', po.ship_to_location_id,
           'shipTo', po.ship_to,
           'payments', COALESCE((
             SELECT jsonb_agg(payment.entry ORDER BY payment.entry::text)
               FROM (SELECT jsonb_build_object('kind', pay.kind, 'amountCents', pay.amount_cents,
                                               'dueDate', pay.due_date, 'label', pay.label) AS entry
                       FROM public.po_payments AS pay
                      WHERE pay.purchase_order_id = po.id) AS payment
           ), '[]'::jsonb),
           -- F8: a rider's actual is bookkeeping, not paper.
           'riders', COALESCE((
             SELECT jsonb_agg(rider.entry ORDER BY rider.entry::text)
               FROM (SELECT jsonb_build_object('kind', cost.kind, 'estimateCents', cost.estimate_cents,
                                               'payeeVendorId', cost.payee_vendor_id,
                                               'payeeContactId', cost.payee_contact_id) AS entry
                       FROM public.po_cost_lines AS cost
                      WHERE cost.purchase_order_id = po.id) AS rider
           ), '[]'::jsonb)
         )
    FROM public.purchase_orders AS po
   WHERE po.id = p_po_id;
$$;

REVOKE ALL ON FUNCTION public._po_release_paper(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._po_release_paper(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public._po_release_fingerprint(p_po_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT md5(public._po_release_paper(p_po_id)::text);
$$;

REVOKE ALL ON FUNCTION public._po_release_fingerprint(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._po_release_fingerprint(uuid) TO service_role;

-- ─── 2. The group the threshold reads (F1) ──────────────────────────────────

-- Internal: this PO's total plus the same job's orders to the same maker that
-- are not cancelled and were not sent (or acknowledged), or were sent (or
-- acknowledged) in the last 7 days. The studio is the project's
-- (purchase_order_studio_id resolves through it), so the same project is the
-- same studio.
CREATE OR REPLACE FUNCTION public._release_gate_total(p_po_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(po.total_cents, 0)::bigint + COALESCE((
           SELECT sum(COALESCE(sibling.total_cents, 0))
             FROM public.purchase_orders AS sibling
            WHERE sibling.project_id = po.project_id
              AND sibling.vendor_id = po.vendor_id
              AND sibling.id <> po.id
              AND sibling.status <> 'cancelled'
              -- 00723 (F1): an acknowledgment is a send.
              AND (COALESCE(sibling.sent_at, sibling.acknowledged_at) IS NULL
                   OR COALESCE(sibling.sent_at, sibling.acknowledged_at) >= now() - interval '7 days')
         ), 0)
    FROM public.purchase_orders AS po
   WHERE po.id = p_po_id;
$$;

-- ─── 3. The PO-aware sendability rule (F3) ──────────────────────────────────

-- Internal: _po_release_cleared's rule with the group total and the
-- fingerprint. Takes the row's values so the trigger can judge NEW.
-- _release_gate_applies takes integer cents; a group total past its range is
-- far over any threshold (at most 1000000000), so it is clamped.
CREATE OR REPLACE FUNCTION public._po_release_cleared_po(
  p_po_id uuid,
  p_status text,
  p_sent_at timestamptz,
  p_studio_id uuid,
  p_total_cents integer,
  p_group_total_cents bigint,
  p_released_at timestamptz,
  p_released_total_cents integer,
  p_released_fingerprint text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN p_status IN ('cancelled', 'held_for_release') THEN false
    WHEN p_sent_at IS NOT NULL THEN true
    WHEN NOT public._release_gate_applies(p_studio_id, LEAST(p_group_total_cents, 2147483647)::integer) THEN true
    ELSE p_released_at IS NOT NULL
         AND COALESCE(p_total_cents, 0) <= p_released_total_cents
         AND (p_released_fingerprint IS NULL
              OR p_released_fingerprint = public._po_release_fingerprint(p_po_id))
  END;
$$;

-- ─── 4. A resend goes only as the released paper (F2b) ──────────────────────

CREATE OR REPLACE FUNCTION public.assert_po_resend_cleared(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND OR (auth.uid() IS NOT NULL AND NOT public.can_send_purchase_order(p_po_id)) THEN
    RAISE EXCEPTION 'assert_po_resend_cleared: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_po.sent_at IS NOT NULL
     AND v_po.released_fingerprint IS NOT NULL
     AND public._release_gate_applies(public.purchase_order_studio_id(p_po_id),
                                      LEAST(public._release_gate_total(p_po_id), 2147483647)::integer)
     AND v_po.released_fingerprint IS DISTINCT FROM public._po_release_fingerprint(p_po_id) THEN
    RAISE EXCEPTION 'changed_since_release: purchase order % changed after it was sent; a change order sends the maker a revision', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.assert_po_resend_cleared(uuid) IS
  'R1 F2 (00723): po-send calls this as the caller before it sends an order again. It raises '
  'changed_since_release when the order was sent, the studio''s gate applies to its group total, '
  'and the paper no longer matches its release (released_fingerprint). A NULL (pre-00719) '
  'fingerprint is not checked. It raises insufficient_privilege for a PO the caller cannot send.';

REVOKE ALL ON FUNCTION public.assert_po_resend_cleared(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_po_resend_cleared(uuid) TO authenticated, service_role;

-- ─── 5. po-send's default sidemark (F3) ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.apply_po_default_sidemark(p_po_id uuid, p_sidemark text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_po   public.purchase_orders%ROWTYPE;
  v_mark text := NULLIF(btrim(COALESCE(p_sidemark, '')), '');
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_po_default_sidemark: purchase order % not found', p_po_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_mark IS NULL OR NULLIF(btrim(COALESCE(v_po.sidemark, '')), '') IS NOT NULL THEN
    RETURN;
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  -- One snapshot: the release is re-stamped only when it covered the paper
  -- read here, and the new stamp is that paper with the default sidemark.
  -- Anything else changed meanwhile stays outside the release.
  UPDATE public.purchase_orders AS po
     SET sidemark = v_mark,
         released_fingerprint = CASE
           WHEN po.released_fingerprint = md5(paper.doc::text)
             THEN md5(jsonb_set(paper.doc, '{header,sidemark}', to_jsonb(v_mark))::text)
           ELSE po.released_fingerprint
         END
    FROM (SELECT public._po_release_paper(p_po_id) AS doc) AS paper
   WHERE po.id = p_po_id;
END;
$$;

COMMENT ON FUNCTION public.apply_po_default_sidemark(uuid, text) IS
  'R1 F3 (00723), service role only: po-send''s default sidemark. It writes only into a blank '
  'sidemark (otherwise a no-op). In the same statement it re-stamps released_fingerprint when the '
  'release covered the paper immediately before the write.';

REVOKE ALL ON FUNCTION public.apply_po_default_sidemark(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_po_default_sidemark(uuid, text) TO service_role;

-- ─── 6. assign_po_number (00719 body) (F7) ──────────────────────────────────

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

  -- 00719: a held order takes no number from the sequence until released.
  IF v_po.status = 'held_for_release' THEN
    RAISE EXCEPTION 'held_for_release: a held order takes its number when it is released'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00723 (F7): nor does an unsent draft the release gate holds back.
  IF v_po.status = 'draft' AND v_po.sent_at IS NULL AND NOT public.po_is_sendable(p_po_id) THEN
    RAISE EXCEPTION 'held_for_release: an order that waits for a release takes its number when it is released'
      USING ERRCODE = 'check_violation';
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
