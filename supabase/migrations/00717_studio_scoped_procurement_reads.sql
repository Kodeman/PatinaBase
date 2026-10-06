-- ═══════════════════════════════════════════════════════════════════════════
-- 00717 — Studio-scoped procurement reads (US-16 P2-follow; SQ-442, SQ-416 F3)
-- ═══════════════════════════════════════════════════════════════════════════
-- Four read policies tested is_studio_comember(purchase_orders.designer_id):
-- any non-guest co-member of the PO owner, in ANY studio the owner sits in.
-- The writers authorize on can_send_purchase_order (00690), which follows
-- the project's studio. Failing input: owner U is seated in studios A and B,
-- the project has studio_id = B, member M is seated in A only. M read B's
-- vendor payments, payment schedule, notices and inspection lines.
--
-- Each policy now reads can_send_purchase_order(<the row's PO>), the writers'
-- test (= can_buy_for_project(po.project_id), 00702): the project owner, or an
-- active non-guest member of projects.studio_id when it is set; on a project
-- with no studio_id, the owner or a non-guest co-member of the owner, exactly
-- as before. po_cost_lines (00704) already reads this way.
--
--   vendor_payments_studio_select              (00695)
--   po_payments_studio_select                  (00695)
--   procurement_notifications_studio_select    (00700)
--   receiving_inspection_lines_studio_select   (00700)
--
-- _ffe_require_studio_project (00435), the gate of every FF&E RPC, had the
-- same gap (00690's "Not covered here" note): it now admits on
-- can_buy_for_project(project.id). Same signature, same errors, same return.
--
-- Additive: DROP POLICY IF EXISTS + CREATE POLICY, CREATE OR REPLACE
-- FUNCTION. No grant changes; CREATE OR REPLACE keeps the function's ACL
-- (00435 revoked it from PUBLIC, anon, authenticated, service_role).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. vendor_payments ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS vendor_payments_studio_select ON public.vendor_payments;
CREATE POLICY vendor_payments_studio_select ON public.vendor_payments
  FOR SELECT TO authenticated
  USING (public.can_send_purchase_order(purchase_order_id));

-- ─── 2. po_payments ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS po_payments_studio_select ON public.po_payments;
CREATE POLICY po_payments_studio_select ON public.po_payments
  FOR SELECT TO authenticated
  USING (public.can_send_purchase_order(purchase_order_id));

-- ─── 3. procurement_notifications ───────────────────────────────────────────
-- Own-row SELECT/UPDATE policies are unchanged; a notice with no subject PO
-- is reachable only through them, as before.

DROP POLICY IF EXISTS procurement_notifications_studio_select ON public.procurement_notifications;
CREATE POLICY procurement_notifications_studio_select ON public.procurement_notifications
  FOR SELECT TO authenticated
  USING (public.can_send_purchase_order(subject_purchase_order_id));

COMMENT ON POLICY procurement_notifications_studio_select ON public.procurement_notifications IS
  'A member of the PO''s project studio (can_send_purchase_order: owner, or an active non-guest '
  'member of projects.studio_id, else a co-member of the owner) reads the PO''s notices (00717, '
  'replacing 00700''s owner co-membership test). Own-row SELECT/UPDATE policies are unchanged.';

-- ─── 4. receiving_inspection_lines ──────────────────────────────────────────

DROP POLICY IF EXISTS receiving_inspection_lines_studio_select ON public.receiving_inspection_lines;
CREATE POLICY receiving_inspection_lines_studio_select ON public.receiving_inspection_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.receiving_inspections ri
      WHERE ri.id = receiving_inspection_lines.inspection_id
        AND public.can_send_purchase_order(ri.purchase_order_id)
    )
  );

-- ─── 5. _ffe_require_studio_project ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._ffe_require_studio_project(p_project_id uuid)
RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_project public.projects%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR NOT public.can_buy_for_project(v_project.id) THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v_project;
END;
$$;

COMMENT ON FUNCTION public._ffe_require_studio_project(uuid) IS
  'FF&E RPC gate: the project row when the caller may buy for it (can_buy_for_project, 00717: the '
  'owner, or an active non-guest member of projects.studio_id when set, else a co-member of the '
  'owner); otherwise raises 42501 ''project not found or access denied''.';
