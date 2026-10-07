-- ═══════════════════════════════════════════════════════════════════════════
-- 00726 — The group total reaches a new, unsaved order paper (US-17 H4;
-- SQ-470, follow-up from the SQ-461 phase3 R4 walk)
-- ═══════════════════════════════════════════════════════════════════════════
-- A new order paper has no purchase_orders row, so po_release_state (00719)
-- cannot answer it. The paper decided from the studio's gate and its own
-- total only, and offered "Send to {maker}" for an order that the job's other
-- open orders to the same maker carry over the release line.
--
-- po_release_preview(project, vendor, total) answers that paper before save,
-- in po_release_state's shape and under its access rule. The sibling sum is
-- now one function, _release_gate_siblings_cents, and both _release_gate_total
-- and the preview read it, so the two cannot drift.
--
-- Lineage of the redefined function (its live head's body, verbatim, with
-- only the sibling sum moved out):
--   _release_gate_total   00719 → 00723 → 00726
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. The sibling sum (00723's predicate, unchanged) ──────────────────────

-- Internal: the same job's orders to the same maker that are not cancelled
-- and were not sent (or acknowledged), or were sent (or acknowledged) in the
-- last 7 days, other than p_exclude_po_id (NULL for a paper with no row yet).
CREATE OR REPLACE FUNCTION public._release_gate_siblings_cents(
  p_project_id uuid,
  p_vendor_id uuid,
  p_exclude_po_id uuid
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE((
           SELECT sum(COALESCE(sibling.total_cents, 0))
             FROM public.purchase_orders AS sibling
            WHERE sibling.project_id = p_project_id
              AND sibling.vendor_id = p_vendor_id
              AND sibling.id IS DISTINCT FROM p_exclude_po_id
              AND sibling.status <> 'cancelled'
              -- 00723 (F1): an acknowledgment is a send.
              AND (COALESCE(sibling.sent_at, sibling.acknowledged_at) IS NULL
                   OR COALESCE(sibling.sent_at, sibling.acknowledged_at) >= now() - interval '7 days')
         ), 0)::bigint;
$$;

REVOKE ALL ON FUNCTION public._release_gate_siblings_cents(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._release_gate_siblings_cents(uuid, uuid, uuid) TO service_role;

-- ─── 2. The group the threshold reads (00723 body) ──────────────────────────

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
  SELECT COALESCE(po.total_cents, 0)::bigint
         + public._release_gate_siblings_cents(po.project_id, po.vendor_id, po.id)
    FROM public.purchase_orders AS po
   WHERE po.id = p_po_id;
$$;

-- ─── 3. The release state of a paper that has no row yet ────────────────────

CREATE OR REPLACE FUNCTION public.po_release_preview(
  p_project_id uuid,
  p_vendor_id uuid,
  p_total_cents bigint
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_studio  uuid;
  v_group   bigint;
  v_applies boolean;
  v_reason  text;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  -- po_release_state's rule: can_send_purchase_order's (00690) predicate,
  -- read on the project the paper would belong to.
  IF NOT FOUND OR (auth.uid() IS NOT NULL AND NOT COALESCE(
       CASE
         WHEN v_project.studio_id IS NOT NULL THEN
           v_project.designer_id = (select auth.uid())
           OR public.is_active_org_member(v_project.studio_id)
         ELSE public.is_studio_comember(v_project.designer_id)
       END, false)) THEN
    RETURN NULL;
  END IF;
  -- purchase_order_studio_id (00700), read on the project.
  v_studio := COALESCE(v_project.studio_id, public._primary_studio_for(v_project.designer_id));
  v_group := COALESCE(p_total_cents, 0) + public._release_gate_siblings_cents(p_project_id, p_vendor_id, NULL);
  v_applies := public._release_gate_applies(v_studio, LEAST(v_group, 2147483647)::integer);

  -- An unsaved paper is an unsent, unreleased draft: cleared only when the
  -- gate does not apply (_po_release_cleared_po).
  IF v_applies AND NOT public._release_gate_applies(v_studio, LEAST(COALESCE(p_total_cents, 0), 2147483647)::integer) THEN
    v_reason := 'group_over';
  END IF;

  RETURN jsonb_build_object(
    'applies', v_applies,
    'released', false,
    'cleared', NOT v_applies,
    'reason', v_reason,
    'group_total_cents', v_group,
    'threshold_cents', (SELECT o.release_threshold_cents FROM public.organizations AS o WHERE o.id = v_studio)
  );
END;
$$;

COMMENT ON FUNCTION public.po_release_preview(uuid, uuid, bigint) IS
  'The release gate for a new, unsaved order paper (00726): po_release_state''s shape for a paper of '
  'p_total_cents to p_vendor_id on p_project_id, with the job''s open and recently sent orders to that '
  'maker in the group. released is false; reason is group_over or null. Null for a project the caller '
  'cannot send for (can_send_purchase_order''s rule).';

REVOKE ALL ON FUNCTION public.po_release_preview(uuid, uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.po_release_preview(uuid, uuid, bigint) TO authenticated, service_role;
