-- ═══════════════════════════════════════════════════════════════════════════
-- 00702 — The COM pair and submittals (US-16 Phase 2, C-24; SQ-418)
-- ═══════════════════════════════════════════════════════════════════════════
-- d2 §M4, d1 D1-04. A custom piece is two lines and, usually, two orders: the
-- work from the workroom and the fabric from the mill, shipped to the
-- workroom. Today nothing links them, COM facts live only on product
-- configurations (com_details, 00413) and no CFA / strike-off record exists.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- can_buy_for_project(p_project_id)
--   can_send_purchase_order's predicate (00690) at project level: on a
--   project with a studio_id, the owner or an active non-guest member of
--   THAT organization (is_active_org_member); without one, the owner or a
--   non-guest co-member of the owner (is_studio_comember). The read (and
--   write) test for Phase 2's project-scoped buying tables, so they start on
--   the project's studio rather than the owner's co-members (SQ-442, F3).
--
-- project_ffe_items.parent_ffe_item_id
--   The fabric line points at the piece it covers. One level only: a parent
--   is never itself a child, a child never a parent. Written by
--   link_ffe_pair(p_child, p_parent) (NULL parent unlinks); the table stays
--   RPC-only (00435/00438).
--
-- project_ffe_specs.com_spec
--   COM facts on any line, in the configuration's com_details shape
--   ({fabricName, mill, pattern, yardage, railroaded, shipTo, sidemark,
--   secondLeadTimeWeeks, notes}) so both paths print alike. A JSON object or
--   NULL. Directly writable by authenticated through the same column-level
--   UPDATE grant as the other spec columns (00435:984-985) and the
--   project_ffe_specs_studio_rw policy.
--
-- purchase_orders.supplies_purchase_order_id
--   The fabric PO points at the PO it supplies. Written by
--   set_purchase_order_supplies(p_po_id, p_supplies_po_id): both POs on the
--   same project, neither cancelled, one level (the supplied PO supplies
--   nothing itself). Gate: can_send_purchase_order on the fabric PO.
--
-- po_submittals
--   A dated approval on a line, optionally tied to the fabric PO that waits
--   on it: CFA, strike-off, shop drawing, finish sample, seat sample. Read:
--   can_buy_for_project. Written only through:
--     record_submittal(p_request)   create, or patch a pending one
--     decide_submittal(p_id, p_decision, p_note)
--                                   approved | rejected | revise, once; a
--                                   re-request is a new submittal.
--   The decision warns and never blocks (R9): nothing here gates a send.
--
-- ffe_line_submittals (view, security_invoker)
--   Both sources for a line, so the unfold never asks twice: po_submittals
--   rows, plus the submittal milestone of a configured custom piece
--   (custom_commission_milestones, 00403:285-299) reached through the line's
--   spec configuration (project_ffe_specs.configuration_id), skipping
--   superseded revisions. Each base table's RLS applies to the caller.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. can_buy_for_project ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_buy_for_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects project
    WHERE project.id = p_project_id
      AND CASE
            WHEN project.studio_id IS NOT NULL THEN
              project.designer_id = (select auth.uid())
              OR public.is_active_org_member(project.studio_id)
            ELSE public.is_studio_comember(project.designer_id)
          END
  );
$$;

COMMENT ON FUNCTION public.can_buy_for_project(uuid) IS
  'can_send_purchase_order''s predicate at project level (00702): the project owner, or an active '
  'non-guest member of projects.studio_id when set, else a non-guest active co-member of the owner. '
  'False for a missing project.';

REVOKE ALL ON FUNCTION public.can_buy_for_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_buy_for_project(uuid) TO authenticated, service_role;

-- ─── 2. project_ffe_items.parent_ffe_item_id + link_ffe_pair ────────────────

ALTER TABLE public.project_ffe_items
  ADD COLUMN IF NOT EXISTS parent_ffe_item_id uuid
    REFERENCES public.project_ffe_items(id) ON DELETE SET NULL;

ALTER TABLE public.project_ffe_items
  DROP CONSTRAINT IF EXISTS project_ffe_items_parent_not_self_ck;
ALTER TABLE public.project_ffe_items
  ADD CONSTRAINT project_ffe_items_parent_not_self_ck
  CHECK (parent_ffe_item_id IS NULL OR parent_ffe_item_id <> id);

CREATE INDEX IF NOT EXISTS idx_project_ffe_items_parent
  ON public.project_ffe_items (parent_ffe_item_id)
  WHERE parent_ffe_item_id IS NOT NULL;

COMMENT ON COLUMN public.project_ffe_items.parent_ffe_item_id IS
  'The piece this line supplies, e.g. the COM fabric line → the custom sofa (00702, C-24). One level, '
  'same project. Written by link_ffe_pair.';

CREATE OR REPLACE FUNCTION public.link_ffe_pair(p_child uuid, p_parent uuid)
RETURNS public.project_ffe_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_child public.project_ffe_items%ROWTYPE;
  v_parent public.project_ffe_items%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Lock in id order so concurrent pairings cannot deadlock.
  PERFORM 1 FROM public.project_ffe_items
   WHERE id IN (p_child, p_parent) ORDER BY id FOR UPDATE;

  SELECT * INTO v_child FROM public.project_ffe_items WHERE id = p_child;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._ffe_require_studio_project(v_child.project_id);
  IF v_child.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'link_ffe_pair: line was removed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_parent IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.project_ffe_items WHERE id = p_parent;
    IF NOT FOUND OR v_parent.project_id IS DISTINCT FROM v_child.project_id THEN
      RAISE EXCEPTION 'link_ffe_pair: the piece must be a line on the same project'
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_parent = p_child THEN
      RAISE EXCEPTION 'link_ffe_pair: a line cannot supply itself'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_parent.removed_at IS NOT NULL THEN
      RAISE EXCEPTION 'link_ffe_pair: the piece was removed'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_parent.parent_ffe_item_id IS NOT NULL THEN
      RAISE EXCEPTION 'link_ffe_pair: the piece already supplies another line'
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.project_ffe_items
       WHERE parent_ffe_item_id = p_child AND removed_at IS NULL
    ) THEN
      RAISE EXCEPTION 'link_ffe_pair: this line is itself a piece other lines supply'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.project_ffe_items
     SET parent_ffe_item_id = p_parent,
         updated_at = now()
   WHERE id = p_child
  RETURNING * INTO v_child;
  RETURN v_child;
END;
$$;

COMMENT ON FUNCTION public.link_ffe_pair(uuid, uuid) IS
  'Pairs a supplying line (the COM fabric) with the piece it covers (00702, C-24); NULL parent unlinks. '
  'Same project, both active, one level. Gate: _ffe_require_studio_project.';

REVOKE ALL ON FUNCTION public.link_ffe_pair(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_ffe_pair(uuid, uuid) TO authenticated;

-- ─── 3. project_ffe_specs.com_spec ──────────────────────────────────────────

ALTER TABLE public.project_ffe_specs
  ADD COLUMN IF NOT EXISTS com_spec jsonb;

ALTER TABLE public.project_ffe_specs
  DROP CONSTRAINT IF EXISTS project_ffe_specs_com_spec_check;
ALTER TABLE public.project_ffe_specs
  ADD CONSTRAINT project_ffe_specs_com_spec_check
  CHECK (com_spec IS NULL OR jsonb_typeof(com_spec) = 'object');

COMMENT ON COLUMN public.project_ffe_specs.com_spec IS
  'Customer''s-own-material facts on any line, in product_configurations.com_details'' shape: '
  '{fabricName, mill, pattern, yardage, railroaded, shipTo, sidemark, secondLeadTimeWeeks, notes} '
  '(00702, C-24). Written directly under the spec column grant.';

GRANT UPDATE (com_spec) ON public.project_ffe_specs TO authenticated;

-- ─── 4. purchase_orders.supplies_purchase_order_id ──────────────────────────

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS supplies_purchase_order_id uuid
    REFERENCES public.purchase_orders(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_supplies_not_self_ck;
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_supplies_not_self_ck
  CHECK (supplies_purchase_order_id IS NULL OR supplies_purchase_order_id <> id);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplies
  ON public.purchase_orders (supplies_purchase_order_id)
  WHERE supplies_purchase_order_id IS NOT NULL;

COMMENT ON COLUMN public.purchase_orders.supplies_purchase_order_id IS
  'The PO this one supplies, e.g. the mill''s fabric PO → the workroom PO (00702, C-24). Same project, '
  'one level. Written by set_purchase_order_supplies.';

CREATE OR REPLACE FUNCTION public.set_purchase_order_supplies(
  p_po_id uuid, p_supplies_po_id uuid
)
RETURNS public.purchase_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_target public.purchase_orders%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.purchase_orders
   WHERE id IN (p_po_id, p_supplies_po_id) ORDER BY id FOR UPDATE;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'set_purchase_order_supplies: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'set_purchase_order_supplies: purchase order % is cancelled', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_supplies_po_id IS NOT NULL THEN
    SELECT * INTO v_target FROM public.purchase_orders WHERE id = p_supplies_po_id;
    IF NOT FOUND OR v_target.project_id IS DISTINCT FROM v_po.project_id THEN
      RAISE EXCEPTION 'set_purchase_order_supplies: the supplied order must be a purchase order on the same project'
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_supplies_po_id = p_po_id THEN
      RAISE EXCEPTION 'set_purchase_order_supplies: a purchase order cannot supply itself'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_target.status = 'cancelled' THEN
      RAISE EXCEPTION 'set_purchase_order_supplies: the supplied order is cancelled'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_target.supplies_purchase_order_id IS NOT NULL THEN
      RAISE EXCEPTION 'set_purchase_order_supplies: the supplied order itself supplies another order'
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.purchase_orders
       WHERE supplies_purchase_order_id = p_po_id AND status <> 'cancelled'
    ) THEN
      RAISE EXCEPTION 'set_purchase_order_supplies: other orders supply this one'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.purchase_orders
     SET supplies_purchase_order_id = p_supplies_po_id
   WHERE id = p_po_id
  RETURNING * INTO v_po;
  RETURN v_po;
END;
$$;

COMMENT ON FUNCTION public.set_purchase_order_supplies(uuid, uuid) IS
  'Points a supplying PO (the mill''s fabric order) at the PO it feeds (00702, C-24); NULL unlinks. '
  'Same project, neither cancelled, one level. Gate: can_send_purchase_order.';

REVOKE ALL ON FUNCTION public.set_purchase_order_supplies(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_purchase_order_supplies(uuid, uuid) TO authenticated;

-- ─── 5. po_submittals ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.po_submittals (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- projects.studio_id, else the owner's primary studio; access follows the
  -- project (can_buy_for_project).
  organization_id    uuid        REFERENCES public.organizations(id),
  project_id         uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  ffe_item_id        uuid        NOT NULL REFERENCES public.project_ffe_items(id) ON DELETE CASCADE,
  purchase_order_id  uuid        REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  kind               text        NOT NULL,
  requested_on       date,
  received_on        date,
  dye_lot            text,
  reserve_expires_on date,
  decision           text        NOT NULL DEFAULT 'pending',
  decided_by         uuid,
  decided_at         timestamptz,
  client_decision_id uuid        REFERENCES public.client_decisions(id) ON DELETE SET NULL,
  media_ids          uuid[]      NOT NULL DEFAULT '{}',
  note               text,
  created_by         uuid,
  updated_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT po_submittals_kind_ck
    CHECK (kind IN ('cfa', 'strike_off', 'shop_drawing', 'finish_sample', 'seat_sample')),
  CONSTRAINT po_submittals_decision_ck
    CHECK (decision IN ('pending', 'approved', 'rejected', 'revise')),
  CONSTRAINT po_submittals_decided_ck
    CHECK ((decision = 'pending') = (decided_at IS NULL)),
  CONSTRAINT po_submittals_text_ck
    CHECK ((dye_lot IS NULL OR char_length(dye_lot) <= 120)
       AND (note IS NULL OR char_length(note) <= 2000)
       AND cardinality(media_ids) <= 20)
);

CREATE INDEX IF NOT EXISTS idx_po_submittals_item
  ON public.po_submittals (ffe_item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_po_submittals_project
  ON public.po_submittals (project_id);
CREATE INDEX IF NOT EXISTS idx_po_submittals_po
  ON public.po_submittals (purchase_order_id)
  WHERE purchase_order_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at_po_submittals ON public.po_submittals;
CREATE TRIGGER set_updated_at_po_submittals
  BEFORE UPDATE ON public.po_submittals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.po_submittals IS
  'CFA / strike-off / shop drawing / finish sample / seat sample on a line, optionally tied to the '
  'fabric PO that waits on it (00702, C-24, d2 §M4). Read: can_buy_for_project. Written only through '
  'record_submittal / decide_submittal. Warns, never blocks (R9).';

ALTER TABLE public.po_submittals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS po_submittals_studio_select ON public.po_submittals;
CREATE POLICY po_submittals_studio_select ON public.po_submittals
  FOR SELECT TO authenticated
  USING (public.can_buy_for_project(project_id));

REVOKE ALL ON TABLE public.po_submittals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.po_submittals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.po_submittals TO service_role;

-- ─── 6. record_submittal ────────────────────────────────────────────────────
-- p_request (camelCase): id?, ffeItemId, kind, purchaseOrderId,
-- requestedOn, receivedOn, dyeLot, reserveExpiresOn, clientDecisionId,
-- mediaIds, note. Without id it creates (ffeItemId and kind required); with
-- id it patches the keys present (JSON null clears) while the submittal is
-- still pending. ffeItemId and kind never change on an existing submittal.

CREATE OR REPLACE FUNCTION public.record_submittal(p_request jsonb)
RETURNS public.po_submittals
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req jsonb := COALESCE(p_request, '{}'::jsonb);
  v_keys constant text[] := ARRAY['id', 'ffeItemId', 'kind', 'purchaseOrderId', 'requestedOn',
    'receivedOn', 'dyeLot', 'reserveExpiresOn', 'clientDecisionId', 'mediaIds', 'note'];
  v_row public.po_submittals%ROWTYPE;
  v_item public.project_ffe_items%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_id uuid;
  v_kind text;
  v_po_id uuid;
  v_cd_id uuid;
  v_requested date;
  v_received date;
  v_reserve date;
  v_dye text;
  v_note text;
  v_media uuid[];
  v_key text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'record_submittal: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' THEN
    RAISE EXCEPTION 'record_submittal: request must be an object' USING ERRCODE = 'check_violation';
  END IF;
  IF (v_req - v_keys) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'record_submittal: unknown keys %',
      (SELECT string_agg(key, ', ') FROM jsonb_object_keys(v_req - v_keys) AS key)
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(v_req - 'mediaIds') AS entry
    WHERE jsonb_typeof(entry.value) NOT IN ('string', 'null')
  ) OR jsonb_typeof(COALESCE(v_req->'mediaIds', 'null'::jsonb)) NOT IN ('array', 'null') THEN
    RAISE EXCEPTION 'record_submittal: mediaIds must be an array; every other value a string or null'
      USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    v_id := NULLIF(btrim(COALESCE(v_req->>'id', '')), '')::uuid;
    v_po_id := NULLIF(btrim(COALESCE(v_req->>'purchaseOrderId', '')), '')::uuid;
    v_cd_id := NULLIF(btrim(COALESCE(v_req->>'clientDecisionId', '')), '')::uuid;
    SELECT array_agg(value::uuid) INTO v_media
      FROM jsonb_array_elements_text(COALESCE(v_req->'mediaIds', '[]'::jsonb)) AS value;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'record_submittal: id, purchaseOrderId, clientDecisionId and mediaIds must be ids'
      USING ERRCODE = 'check_violation';
  END;
  BEGIN
    v_requested := NULLIF(btrim(COALESCE(v_req->>'requestedOn', '')), '')::date;
    v_received := NULLIF(btrim(COALESCE(v_req->>'receivedOn', '')), '')::date;
    v_reserve := NULLIF(btrim(COALESCE(v_req->>'reserveExpiresOn', '')), '')::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'record_submittal: requestedOn, receivedOn and reserveExpiresOn must be dates (YYYY-MM-DD)'
      USING ERRCODE = 'check_violation';
  END;
  v_dye := NULLIF(btrim(COALESCE(v_req->>'dyeLot', '')), '');
  v_note := NULLIF(btrim(COALESCE(v_req->>'note', '')), '');

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.po_submittals WHERE id = v_id FOR UPDATE;
    IF NOT FOUND OR NOT public.can_buy_for_project(v_row.project_id) THEN
      RAISE EXCEPTION 'record_submittal: submittal % not found or access denied', v_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    FOREACH v_key IN ARRAY ARRAY['ffeItemId', 'kind'] LOOP
      IF v_req ? v_key AND (v_req->>v_key) IS DISTINCT FROM
         (CASE v_key WHEN 'ffeItemId' THEN v_row.ffe_item_id::text ELSE v_row.kind END) THEN
        RAISE EXCEPTION 'record_submittal: % cannot change on a recorded submittal; record a new one', v_key
          USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
    IF v_row.decision <> 'pending' THEN
      RAISE EXCEPTION 'record_submittal: submittal % was already decided (%); record a new one', v_id, v_row.decision
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO v_project FROM public.projects WHERE id = v_row.project_id;
  ELSE
    v_kind := NULLIF(btrim(COALESCE(v_req->>'kind', '')), '');
    IF v_kind IS NULL OR NULLIF(btrim(COALESCE(v_req->>'ffeItemId', '')), '') IS NULL THEN
      RAISE EXCEPTION 'record_submittal: ffeItemId and kind are required'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_kind NOT IN ('cfa', 'strike_off', 'shop_drawing', 'finish_sample', 'seat_sample') THEN
      RAISE EXCEPTION 'record_submittal: kind must be cfa, strike_off, shop_drawing, finish_sample or seat_sample'
        USING ERRCODE = 'check_violation';
    END IF;
    BEGIN
      SELECT * INTO v_item FROM public.project_ffe_items WHERE id = (v_req->>'ffeItemId')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'record_submittal: ffeItemId must be an id' USING ERRCODE = 'check_violation';
    END;
    IF NOT FOUND OR NOT public.can_buy_for_project(v_item.project_id) THEN
      RAISE EXCEPTION 'record_submittal: line not found or access denied'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_item.removed_at IS NOT NULL THEN
      RAISE EXCEPTION 'record_submittal: line was removed' USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO v_project FROM public.projects WHERE id = v_item.project_id;
  END IF;

  IF v_po_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.purchase_orders WHERE id = v_po_id AND project_id = v_project.id
  ) THEN
    RAISE EXCEPTION 'record_submittal: purchaseOrderId must be a purchase order on the same project'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_cd_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.client_decisions WHERE id = v_cd_id AND project_id = v_project.id
  ) THEN
    RAISE EXCEPTION 'record_submittal: clientDecisionId must be a client decision on the same project'
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_dye) > 120 OR char_length(v_note) > 2000 OR COALESCE(cardinality(v_media), 0) > 20 THEN
    RAISE EXCEPTION 'record_submittal: dyeLot is at most 120 characters, note 2000, mediaIds 20'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.po_submittals (
      organization_id, project_id, ffe_item_id, purchase_order_id, kind,
      requested_on, received_on, dye_lot, reserve_expires_on, client_decision_id,
      media_ids, note, created_by, updated_by
    ) VALUES (
      COALESCE(v_project.studio_id, public._primary_studio_for(v_project.designer_id)),
      v_project.id, v_item.id, v_po_id, v_kind,
      v_requested, v_received, v_dye, v_reserve, v_cd_id,
      COALESCE(v_media, '{}'), v_note, v_uid, v_uid
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.po_submittals SET
      purchase_order_id = CASE WHEN v_req ? 'purchaseOrderId' THEN v_po_id ELSE purchase_order_id END,
      requested_on = CASE WHEN v_req ? 'requestedOn' THEN v_requested ELSE requested_on END,
      received_on = CASE WHEN v_req ? 'receivedOn' THEN v_received ELSE received_on END,
      dye_lot = CASE WHEN v_req ? 'dyeLot' THEN v_dye ELSE dye_lot END,
      reserve_expires_on = CASE WHEN v_req ? 'reserveExpiresOn' THEN v_reserve ELSE reserve_expires_on END,
      client_decision_id = CASE WHEN v_req ? 'clientDecisionId' THEN v_cd_id ELSE client_decision_id END,
      media_ids = CASE WHEN v_req ? 'mediaIds' THEN COALESCE(v_media, '{}') ELSE media_ids END,
      note = CASE WHEN v_req ? 'note' THEN v_note ELSE note END,
      updated_by = v_uid
    WHERE id = v_id
    RETURNING * INTO v_row;
  END IF;
  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.record_submittal(jsonb) IS
  'Records a submittal on a line (00702, C-24): create (ffeItemId + kind), or patch a pending one. '
  'Gate: can_buy_for_project. purchaseOrderId and clientDecisionId must be on the same project.';

REVOKE ALL ON FUNCTION public.record_submittal(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_submittal(jsonb) TO authenticated;

-- ─── 7. decide_submittal ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.decide_submittal(
  p_submittal_id uuid, p_decision text, p_note text DEFAULT NULL
)
RETURNS public.po_submittals
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.po_submittals%ROWTYPE;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  SELECT * INTO v_row FROM public.po_submittals WHERE id = p_submittal_id FOR UPDATE;
  IF v_uid IS NULL OR NOT FOUND OR NOT public.can_buy_for_project(v_row.project_id) THEN
    RAISE EXCEPTION 'decide_submittal: submittal % not found or access denied', p_submittal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'rejected', 'revise') THEN
    RAISE EXCEPTION 'decide_submittal: decision must be approved, rejected or revise'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_row.decision <> 'pending' THEN
    RAISE EXCEPTION 'decide_submittal: submittal % was already decided (%); record a new one', p_submittal_id, v_row.decision
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(concat_ws(E'\n', v_row.note, v_note)) > 2000 THEN
    RAISE EXCEPTION 'decide_submittal: the note would pass 2000 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.po_submittals SET
    decision = p_decision,
    decided_by = v_uid,
    decided_at = now(),
    note = NULLIF(concat_ws(E'\n', note, v_note), ''),
    updated_by = v_uid
  WHERE id = p_submittal_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.decide_submittal(uuid, text, text) IS
  'Decides a pending submittal (00702, C-24): approved | rejected | revise, stamped with the member '
  'and time; a note is appended. Once only: a re-request is a new submittal. Gate: can_buy_for_project.';

REVOKE ALL ON FUNCTION public.decide_submittal(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_submittal(uuid, text, text) TO authenticated;

-- ─── 8. ffe_line_submittals (both sources, one read) ────────────────────────

CREATE OR REPLACE VIEW public.ffe_line_submittals
  WITH (security_invoker = true) AS
SELECT
  'submittal'::text            AS source,
  s.id                         AS id,
  s.project_id                 AS project_id,
  s.ffe_item_id                AS ffe_item_id,
  s.purchase_order_id          AS purchase_order_id,
  s.kind                       AS kind,
  s.requested_on               AS requested_on,
  s.received_on                AS received_on,
  s.dye_lot                    AS dye_lot,
  s.reserve_expires_on         AS reserve_expires_on,
  s.decision                   AS decision,
  s.decided_by                 AS decided_by,
  s.decided_at                 AS decided_at,
  s.media_ids                  AS media_ids,
  s.note                       AS note,
  s.created_at                 AS created_at
FROM public.po_submittals s

UNION ALL

-- A configured custom piece's submittal milestone. Its status is pending |
-- approved | rejected (00403's CHECK), the same words as decision.
SELECT
  'configuration_milestone'::text,
  m.id,
  m.project_id,
  spec.ffe_item_id,
  NULL::uuid,
  'custom_submittal'::text,
  NULL::date,
  NULL::date,
  NULL::text,
  NULL::date,
  m.status,
  m.completed_by,
  m.completed_at,
  '{}'::uuid[],
  NULL::text,
  m.created_at
FROM public.custom_commission_milestones m
JOIN public.custom_commission_revisions revision ON revision.id = m.revision_id
JOIN public.project_ffe_specs spec ON spec.configuration_id = m.configuration_id
JOIN public.project_ffe_items item ON item.id = spec.ffe_item_id AND item.project_id = m.project_id
WHERE m.milestone_type = 'submittal'
  AND revision.status <> 'superseded';

COMMENT ON VIEW public.ffe_line_submittals IS
  'Every submittal on a line from both sources (00702, C-24): po_submittals (source ''submittal'') and '
  'a configured custom piece''s submittal milestone (source ''configuration_milestone'', kind '
  '''custom_submittal''), so the line unfold never asks twice. security_invoker: each base table''s RLS '
  'applies to the caller.';

REVOKE ALL ON TABLE public.ffe_line_submittals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.ffe_line_submittals TO authenticated, service_role;
