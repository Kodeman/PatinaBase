-- ═══════════════════════════════════════════════════════════════════════════
-- 00708 — Exceptions overlay, substitution chain, refunds and credits,
--         and the Phase 2 procurement clocks (US-16 Phase 2, C-30; SQ-419)
-- ═══════════════════════════════════════════════════════════════════════════
-- d2 §M7. One exception per problem, each with a type, a subject (line / PO /
-- shipment / inspection / damage claim / acknowledgment), a status and a clock
-- with a plain-words basis — a date printed beside it, not a countdown.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- procurement_exceptions
--   type concealed_damage | damage | short_ship | wrong_item | ack_discrepancy
--   | delay | backorder | discontinued | price_change; status open |
--   awaiting_vendor | awaiting_client | resolved; clock_due_on + clock_basis;
--   evidence_media_ids; resolution_path; po_change_id → purchase_order_changes;
--   client_decision_id → client_decisions; replacement_purchase_order_id.
--   One open ack_discrepancy per PO (log_po_acknowledgment_v2, 00705, keeps
--   it); one open exception per damage claim. Read: can_buy_for_project.
--   No direct writes.
-- damage_claims.exception_id   the claim keeps its own state machine and gains
--   the clock through its exception.
-- FKs wired: procurement_notifications.subject_exception_id (00699 left it
--   bare) and procurement_drafts.exception_id (00706).
--
-- open_procurement_exception(p_request jsonb)
--   Keys: type, ffeItemId, purchaseOrderId, shipmentId, inspectionId,
--   damageClaimId, note, evidenceMediaIds, clockDueOn, clockBasis. Subjects
--   must agree on one PO and project; the gate is can_buy_for_project.
--   ack_discrepancy is refused here (it opens from an acknowledgment). Damage,
--   short-ship and wrong-item clocks come from procurement_claim_deadline
--   (00700: the vendor account's claims window, R-PB9 defaults); concealed
--   damage uses the carrier window. Other types take an optional caller clock
--   (a backorder's order-by date).
-- resolve_procurement_exception(p_exception_id, p_request jsonb)
--   Keys: status (awaiting_vendor | awaiting_client | resolved, default
--   resolved), resolutionPath (required to resolve), note, poChangeId,
--   replacementPurchaseOrderId. An ack_discrepancy resolves through its lines
--   (resolve_ack_line) or a newer acknowledgment, never here.
-- compose_vendor_claim_draft(p_exception_id)  kind vendor_claim_notice (00706).
-- request_substitution_approval(p_item_id, p_alternate_ids uuid[])
--   Composes a client_decisions DRAFT through create_client_decision (00415),
--   the existing rail, not a fork: options are the original (no longer
--   available as specified) and each alternate line at its client price. The
--   decision blocks procurement on the line (blocks_kind ffe), so applying it
--   never feeds a duplicate line (00666 feeds only non_blocking decisions).
--   The studio releases it with publish_client_decision (00464). The line's
--   open backorder / discontinued / price_change exception, if any, moves to
--   awaiting_client with the decision linked. Neutral client wording, no dates
--   (R7 is open). The PO change after the client chooses is
--   start_purchase_order_change, reused as is.
-- vendor_payments.kind  payment | refund | credit. A payment is positive and
--   may sit on a schedule row; a refund or credit is negative, never on a
--   schedule row (so 00695's derive trigger skips it). record_vendor_payment
--   (00716) is untouched and writes kind payment by default.
-- record_vendor_refund(p_po_id, p_request jsonb)  the sibling writer for
--   refunds and credits: amountCents is entered positive and stored negative,
--   at most the PO's net paid; the same lane guards as record_vendor_payment.
-- sweep_procurement_clocks  00700's body, verbatim, plus the three Phase 2
--   scans, each once per subject and recipient:
--     ack_discrepancy     an open ack_discrepancy exception;
--     backorder_reported  an open backorder exception;
--     quote_expiring      a live quote (not superseded) with an unordered line,
--                         the day before valid_until or on it. R6 is open:
--                         valid_until only, no age thresholds.
--   cfa_reserve_expiring and memo_return_due stay TODO (their tables are not
--   in this ticket).
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. procurement_exceptions ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.procurement_exceptions (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id               uuid        REFERENCES public.organizations(id),
  project_id                    uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  type                          text        NOT NULL,
  ffe_item_id                   uuid        REFERENCES public.project_ffe_items(id) ON DELETE SET NULL,
  purchase_order_id             uuid        REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  shipment_id                   uuid        REFERENCES public.po_shipments(id) ON DELETE SET NULL,
  inspection_id                 uuid        REFERENCES public.receiving_inspections(id) ON DELETE SET NULL,
  damage_claim_id               uuid        REFERENCES public.damage_claims(id) ON DELETE SET NULL,
  acknowledgment_id             uuid        REFERENCES public.po_acknowledgments(id) ON DELETE SET NULL,
  status                        text        NOT NULL DEFAULT 'open',
  opened_at                     timestamptz NOT NULL DEFAULT now(),
  opened_by                     uuid,
  clock_due_on                  date,
  clock_basis                   text,
  evidence_media_ids            uuid[]      NOT NULL DEFAULT '{}'::uuid[],
  resolution_path               text,
  po_change_id                  uuid        REFERENCES public.purchase_order_changes(id) ON DELETE SET NULL,
  client_decision_id            uuid        REFERENCES public.client_decisions(id) ON DELETE SET NULL,
  replacement_purchase_order_id uuid        REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  resolved_at                   timestamptz,
  resolved_by                   uuid,
  note                          text,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT procurement_exceptions_type_ck
    CHECK (type IN ('concealed_damage', 'damage', 'short_ship', 'wrong_item', 'ack_discrepancy',
                    'delay', 'backorder', 'discontinued', 'price_change')),
  CONSTRAINT procurement_exceptions_status_ck
    CHECK (status IN ('open', 'awaiting_vendor', 'awaiting_client', 'resolved')),
  CONSTRAINT procurement_exceptions_resolved_ck
    CHECK ((status = 'resolved') = (resolved_at IS NOT NULL)
       AND (status = 'resolved') = (resolution_path IS NOT NULL)),
  CONSTRAINT procurement_exceptions_path_ck
    CHECK (resolution_path IS NULL OR resolution_path IN (
      'accept', 'dispute', 'vendor_corrected', 'reconciled', 'repair', 'replace', 'credit',
      'reship', 'wait', 'substitute', 'cancel', 'refund')),
  CONSTRAINT procurement_exceptions_ack_ck
    CHECK (type <> 'ack_discrepancy' OR purchase_order_id IS NOT NULL),
  CONSTRAINT procurement_exceptions_text_ck
    CHECK ((clock_basis IS NULL OR char_length(clock_basis) <= 500)
       AND (note IS NULL OR char_length(note) <= 2000)
       AND cardinality(evidence_media_ids) <= 50)
);

CREATE UNIQUE INDEX IF NOT EXISTS procurement_exceptions_one_open_ack_per_po
  ON public.procurement_exceptions (purchase_order_id)
  WHERE type = 'ack_discrepancy' AND status <> 'resolved';
CREATE UNIQUE INDEX IF NOT EXISTS procurement_exceptions_one_open_per_claim
  ON public.procurement_exceptions (damage_claim_id)
  WHERE damage_claim_id IS NOT NULL AND status <> 'resolved';
CREATE INDEX IF NOT EXISTS idx_procurement_exceptions_project_open
  ON public.procurement_exceptions (project_id, opened_at DESC) WHERE status <> 'resolved';
CREATE INDEX IF NOT EXISTS idx_procurement_exceptions_po
  ON public.procurement_exceptions (purchase_order_id) WHERE purchase_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_procurement_exceptions_item
  ON public.procurement_exceptions (ffe_item_id) WHERE ffe_item_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at_procurement_exceptions ON public.procurement_exceptions;
CREATE TRIGGER set_updated_at_procurement_exceptions
  BEFORE UPDATE ON public.procurement_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.procurement_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS procurement_exceptions_studio_select ON public.procurement_exceptions;
CREATE POLICY procurement_exceptions_studio_select ON public.procurement_exceptions
  FOR SELECT TO authenticated
  USING (public.can_buy_for_project(project_id));

REVOKE ALL ON TABLE public.procurement_exceptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.procurement_exceptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.procurement_exceptions TO service_role;

-- ─── 2. Links: damage_claims, notifications, drafts ─────────────────────────

ALTER TABLE public.damage_claims
  ADD COLUMN IF NOT EXISTS exception_id uuid REFERENCES public.procurement_exceptions(id) ON DELETE SET NULL;

ALTER TABLE public.procurement_notifications
  DROP CONSTRAINT IF EXISTS procurement_notifications_subject_exception_id_fkey;
ALTER TABLE public.procurement_notifications
  ADD CONSTRAINT procurement_notifications_subject_exception_id_fkey
  FOREIGN KEY (subject_exception_id) REFERENCES public.procurement_exceptions(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_procurement_notifications_exception_kind
  ON public.procurement_notifications (subject_exception_id, kind)
  WHERE subject_exception_id IS NOT NULL;

ALTER TABLE public.procurement_drafts
  DROP CONSTRAINT IF EXISTS procurement_drafts_exception_id_fkey;
ALTER TABLE public.procurement_drafts
  ADD CONSTRAINT procurement_drafts_exception_id_fkey
  FOREIGN KEY (exception_id) REFERENCES public.procurement_exceptions(id) ON DELETE SET NULL;

-- ─── 3. open_procurement_exception ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.open_procurement_exception(p_request jsonb)
RETURNS public.procurement_exceptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_req        jsonb := COALESCE(p_request, '{}'::jsonb);
  v_keys       constant text[] := ARRAY['type', 'ffeItemId', 'purchaseOrderId', 'shipmentId', 'inspectionId',
                                        'damageClaimId', 'note', 'evidenceMediaIds', 'clockDueOn', 'clockBasis'];
  v_key        text;
  v_type       text := NULLIF(btrim(COALESCE(v_req->>'type', '')), '');
  v_note       text := NULLIF(btrim(COALESCE(v_req->>'note', '')), '');
  v_basis      text := NULLIF(btrim(COALESCE(v_req->>'clockBasis', '')), '');
  v_due        date;
  v_item_id    uuid;
  v_po_id      uuid;
  v_shipment_id uuid;
  v_inspection_id uuid;
  v_claim_id   uuid;
  v_media      uuid[] := '{}'::uuid[];
  v_found      uuid;
  v_item       public.project_ffe_items%ROWTYPE;
  v_po         public.purchase_orders%ROWTYPE;
  v_claim      public.damage_claims%ROWTYPE;
  v_project_id uuid;
  v_project    public.projects%ROWTYPE;
  v_clock      record;
  v_vendor     text;
  v_row        public.procurement_exceptions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'open_procurement_exception: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' THEN
    RAISE EXCEPTION 'open_procurement_exception: request must be an object' USING ERRCODE = 'check_violation';
  END IF;
  IF (v_req - v_keys) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'open_procurement_exception: unknown keys %',
      (SELECT string_agg(key, ', ') FROM jsonb_object_keys(v_req - v_keys) AS key)
      USING ERRCODE = 'check_violation';
  END IF;
  FOR v_key IN SELECT key FROM jsonb_object_keys(v_req) AS key LOOP
    IF jsonb_typeof(v_req->v_key) <> 'null' AND jsonb_typeof(v_req->v_key) <> (CASE
         WHEN v_key = 'evidenceMediaIds' THEN 'array' ELSE 'string' END) THEN
      RAISE EXCEPTION 'open_procurement_exception: % has the wrong type', v_key USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  IF v_type = 'ack_discrepancy' THEN
    RAISE EXCEPTION 'open_procurement_exception: an acknowledgment discrepancy opens from log_po_acknowledgment_v2'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_type IS NULL OR v_type NOT IN ('concealed_damage', 'damage', 'short_ship', 'wrong_item', 'delay',
                                      'backorder', 'discontinued', 'price_change') THEN
    RAISE EXCEPTION 'open_procurement_exception: type must be concealed_damage, damage, short_ship, wrong_item, delay, backorder, discontinued or price_change'
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_note) > 2000 OR char_length(v_basis) > 500 THEN
    RAISE EXCEPTION 'open_procurement_exception: note is at most 2000 characters, clockBasis 500'
      USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    v_item_id := NULLIF(btrim(COALESCE(v_req->>'ffeItemId', '')), '')::uuid;
    v_po_id := NULLIF(btrim(COALESCE(v_req->>'purchaseOrderId', '')), '')::uuid;
    v_shipment_id := NULLIF(btrim(COALESCE(v_req->>'shipmentId', '')), '')::uuid;
    v_inspection_id := NULLIF(btrim(COALESCE(v_req->>'inspectionId', '')), '')::uuid;
    v_claim_id := NULLIF(btrim(COALESCE(v_req->>'damageClaimId', '')), '')::uuid;
    IF jsonb_typeof(v_req->'evidenceMediaIds') = 'array' THEN
      SELECT COALESCE(array_agg(DISTINCT value::uuid), '{}'::uuid[]) INTO v_media
      FROM jsonb_array_elements_text(v_req->'evidenceMediaIds') AS value;
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'open_procurement_exception: subject ids and evidenceMediaIds must be ids'
      USING ERRCODE = 'check_violation';
  END;
  BEGIN
    v_due := NULLIF(btrim(COALESCE(v_req->>'clockDueOn', '')), '')::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'open_procurement_exception: clockDueOn must be a date (YYYY-MM-DD)'
      USING ERRCODE = 'check_violation';
  END;
  IF cardinality(v_media) > 50 THEN
    RAISE EXCEPTION 'open_procurement_exception: at most 50 evidence media ids' USING ERRCODE = 'check_violation';
  END IF;

  -- Walk the subjects down to one PO and project; every given id must agree.
  IF v_claim_id IS NOT NULL THEN
    SELECT * INTO v_claim FROM public.damage_claims WHERE id = v_claim_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'open_procurement_exception: subject not found or access denied' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_inspection_id IS NOT NULL AND v_inspection_id <> v_claim.receiving_inspection_id
       OR v_item_id IS NOT NULL AND v_claim.ffe_item_id IS NOT NULL AND v_item_id <> v_claim.ffe_item_id THEN
      RAISE EXCEPTION 'open_procurement_exception: the subjects do not belong together' USING ERRCODE = 'check_violation';
    END IF;
    v_inspection_id := v_claim.receiving_inspection_id;
    v_item_id := COALESCE(v_item_id, v_claim.ffe_item_id);
  END IF;
  IF v_inspection_id IS NOT NULL THEN
    SELECT purchase_order_id INTO v_found FROM public.receiving_inspections WHERE id = v_inspection_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'open_procurement_exception: subject not found or access denied' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_po_id IS NOT NULL AND v_po_id <> v_found THEN
      RAISE EXCEPTION 'open_procurement_exception: the subjects do not belong together' USING ERRCODE = 'check_violation';
    END IF;
    v_po_id := v_found;
  END IF;
  IF v_shipment_id IS NOT NULL THEN
    SELECT purchase_order_id INTO v_found FROM public.po_shipments WHERE id = v_shipment_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'open_procurement_exception: subject not found or access denied' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_po_id IS NOT NULL AND v_po_id <> v_found THEN
      RAISE EXCEPTION 'open_procurement_exception: the subjects do not belong together' USING ERRCODE = 'check_violation';
    END IF;
    v_po_id := v_found;
  END IF;
  IF v_item_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.project_ffe_items WHERE id = v_item_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'open_procurement_exception: subject not found or access denied' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_po_id IS NOT NULL AND v_item.purchase_order_id IS DISTINCT FROM v_po_id THEN
      RAISE EXCEPTION 'open_procurement_exception: the subjects do not belong together' USING ERRCODE = 'check_violation';
    END IF;
    v_po_id := v_item.purchase_order_id;
    v_project_id := v_item.project_id;
  END IF;
  IF v_po_id IS NOT NULL THEN
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = v_po_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'open_procurement_exception: subject not found or access denied' USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_project_id := v_po.project_id;
  END IF;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'open_procurement_exception: name a subject (a line, purchase order, shipment, inspection or damage claim)'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = v_project_id;
  IF NOT public.can_buy_for_project(v_project_id) THEN
    RAISE EXCEPTION 'open_procurement_exception: subject not found or access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_claim.id IS NOT NULL AND v_claim.exception_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.procurement_exceptions WHERE id = v_claim.exception_id AND status <> 'resolved'
  ) THEN
    RAISE EXCEPTION 'open_procurement_exception: damage claim % already has an open exception', v_claim.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- The claim clock (00700 / R-PB9): the vendor's window, or the carrier's.
  IF v_type IN ('concealed_damage', 'damage', 'short_ship', 'wrong_item') THEN
    v_due := NULL;
    v_basis := NULL;
    IF v_po.id IS NOT NULL THEN
      SELECT * INTO v_clock FROM public.procurement_claim_deadline(v_po.id);
      SELECT name INTO v_vendor FROM public.vendors WHERE id = v_po.vendor_id;
      IF v_clock.delivered_on IS NOT NULL THEN
        IF v_type = 'concealed_damage' THEN
          v_due := v_clock.carrier_deadline;
          v_basis := format('The carrier wants concealed damage reported within %s days of delivery.',
                            v_clock.concealed_carrier_days);
        ELSE
          v_due := v_clock.vendor_deadline;
          v_basis := format('%s wants written notice within %s days of delivery.',
                            COALESCE(v_vendor, 'The vendor'), v_clock.claims_window_days);
        END IF;
      END IF;
    END IF;
  ELSIF v_due IS NOT NULL AND v_basis IS NULL THEN
    RAISE EXCEPTION 'open_procurement_exception: a clockDueOn needs its clockBasis in plain words'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.procurement_exceptions (
    organization_id, project_id, type, ffe_item_id, purchase_order_id, shipment_id, inspection_id,
    damage_claim_id, status, opened_by, clock_due_on, clock_basis, evidence_media_ids, note
  ) VALUES (
    COALESCE(v_project.studio_id, public._primary_studio_for(v_project.designer_id)), v_project_id, v_type,
    v_item_id, v_po_id, v_shipment_id, v_inspection_id, v_claim_id, 'open', v_uid,
    v_due, CASE WHEN v_due IS NOT NULL THEN v_basis END, v_media, v_note
  )
  RETURNING * INTO v_row;

  IF v_claim.id IS NOT NULL THEN
    UPDATE public.damage_claims SET exception_id = v_row.id WHERE id = v_claim.id;
  END IF;
  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.open_procurement_exception(jsonb) IS
  'Opens a procurement exception (00708, C-30, d2 §M7) on a line, PO, shipment, inspection or damage '
  'claim. Damage-type clocks come from procurement_claim_deadline; others take an optional caller '
  'clock with a plain-words basis. ack_discrepancy opens only from an acknowledgment. Gate: '
  'can_buy_for_project.';

REVOKE ALL ON FUNCTION public.open_procurement_exception(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_procurement_exception(jsonb) TO authenticated;

-- ─── 4. resolve_procurement_exception ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_procurement_exception(p_exception_id uuid, p_request jsonb)
RETURNS public.procurement_exceptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_req    jsonb := COALESCE(p_request, '{}'::jsonb);
  v_keys   constant text[] := ARRAY['status', 'resolutionPath', 'note', 'poChangeId', 'replacementPurchaseOrderId'];
  v_row    public.procurement_exceptions%ROWTYPE;
  v_status text := COALESCE(NULLIF(btrim(COALESCE(v_req->>'status', '')), ''), 'resolved');
  v_path   text := NULLIF(btrim(COALESCE(v_req->>'resolutionPath', '')), '');
  v_note   text := NULLIF(btrim(COALESCE(v_req->>'note', '')), '');
  v_change uuid;
  v_replacement uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'resolve_procurement_exception: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_row FROM public.procurement_exceptions WHERE id = p_exception_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_buy_for_project(v_row.project_id) THEN
    RAISE EXCEPTION 'resolve_procurement_exception: exception % not found or access denied', p_exception_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' OR (v_req - v_keys) <> '{}'::jsonb
     OR EXISTS (SELECT 1 FROM jsonb_each(v_req) AS entry WHERE jsonb_typeof(entry.value) NOT IN ('string', 'null')) THEN
    RAISE EXCEPTION 'resolve_procurement_exception: request is {status?, resolutionPath?, note?, poChangeId?, replacementPurchaseOrderId?}, strings'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_row.status = 'resolved' THEN
    RAISE EXCEPTION 'resolve_procurement_exception: exception % is already resolved', p_exception_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_row.type = 'ack_discrepancy' THEN
    RAISE EXCEPTION 'resolve_procurement_exception: an acknowledgment discrepancy resolves through its lines (resolve_ack_line) or a newer acknowledgment'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_status NOT IN ('awaiting_vendor', 'awaiting_client', 'resolved') THEN
    RAISE EXCEPTION 'resolve_procurement_exception: status must be awaiting_vendor, awaiting_client or resolved'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_status = 'resolved' AND (v_path IS NULL OR v_path NOT IN ('accept', 'dispute', 'vendor_corrected', 'reconciled',
       'repair', 'replace', 'credit', 'reship', 'wait', 'substitute', 'cancel', 'refund')) THEN
    RAISE EXCEPTION 'resolve_procurement_exception: resolving needs a resolutionPath: accept, repair, replace, credit, reship, wait, substitute, cancel or refund'
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_note) > 2000 THEN
    RAISE EXCEPTION 'resolve_procurement_exception: note is longer than 2000 characters' USING ERRCODE = 'check_violation';
  END IF;
  BEGIN
    v_change := NULLIF(btrim(COALESCE(v_req->>'poChangeId', '')), '')::uuid;
    v_replacement := NULLIF(btrim(COALESCE(v_req->>'replacementPurchaseOrderId', '')), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'resolve_procurement_exception: poChangeId and replacementPurchaseOrderId must be ids'
      USING ERRCODE = 'check_violation';
  END;
  IF v_change IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.purchase_order_changes WHERE id = v_change AND project_id = v_row.project_id
  ) OR v_replacement IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.purchase_orders WHERE id = v_replacement AND project_id = v_row.project_id
  ) THEN
    RAISE EXCEPTION 'resolve_procurement_exception: the change and the replacement order must be on the exception''s project'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.procurement_exceptions SET
    status = v_status,
    resolution_path = CASE WHEN v_status = 'resolved' THEN v_path END,
    resolved_at = CASE WHEN v_status = 'resolved' THEN now() END,
    resolved_by = CASE WHEN v_status = 'resolved' THEN v_uid END,
    note = COALESCE(v_note, note),
    po_change_id = COALESCE(v_change, po_change_id),
    replacement_purchase_order_id = COALESCE(v_replacement, replacement_purchase_order_id)
  WHERE id = p_exception_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.resolve_procurement_exception(uuid, jsonb) IS
  'Moves a procurement exception to awaiting_vendor / awaiting_client, or resolves it with a '
  'resolution path, a PO change and a replacement PO on the same project (00708, C-30). Not for '
  'ack_discrepancy. Gate: can_buy_for_project.';

REVOKE ALL ON FUNCTION public.resolve_procurement_exception(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_procurement_exception(uuid, jsonb) TO authenticated;

-- ─── 5. compose_vendor_claim_draft ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.compose_vendor_claim_draft(p_exception_id uuid)
RETURNS public.procurement_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row     public.procurement_exceptions%ROWTYPE;
  v_po      public.purchase_orders%ROWTYPE;
  v_vendor  text;
  v_label   text;
  v_piece   text;
  v_detail  text;
  v_draft   public.procurement_drafts%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.procurement_exceptions WHERE id = p_exception_id;
  IF NOT FOUND OR NOT public.can_buy_for_project(v_row.project_id) THEN
    RAISE EXCEPTION 'compose_vendor_claim_draft: exception % not found or access denied', p_exception_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_row.type NOT IN ('concealed_damage', 'damage', 'short_ship', 'wrong_item') OR v_row.purchase_order_id IS NULL THEN
    RAISE EXCEPTION 'compose_vendor_claim_draft: only a damage, short-ship or wrong-item exception on a purchase order makes a claim notice'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_row.status = 'resolved' THEN
    RAISE EXCEPTION 'compose_vendor_claim_draft: exception % is resolved', p_exception_id
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = v_row.purchase_order_id;
  SELECT name INTO v_vendor FROM public.vendors WHERE id = v_po.vendor_id;
  SELECT name INTO v_piece FROM public.project_ffe_items WHERE id = v_row.ffe_item_id;
  SELECT NULLIF(btrim(description), '') INTO v_detail FROM public.damage_claims WHERE id = v_row.damage_claim_id;
  v_detail := COALESCE(v_detail, v_row.note);
  v_label := public._procurement_po_label(v_po);

  INSERT INTO public.procurement_drafts (
    organization_id, project_id, kind, purchase_order_id, exception_id, to_email, subject, body
  ) VALUES (
    v_row.organization_id, v_row.project_id, 'vendor_claim_notice', v_po.id, v_row.id,
    public._procurement_vendor_email(v_row.organization_id, v_po.vendor_id),
    format('PO %s: %s notice', v_label, CASE v_row.type WHEN 'concealed_damage' THEN 'concealed damage'
      WHEN 'damage' THEN 'damage' WHEN 'short_ship' THEN 'short shipment' ELSE 'wrong item' END),
    format(E'Hello %s,\n\nWe are writing to give notice of %s on PO %s%s%s.\n\n%s%s\nPlease let us know how you would like to proceed: repair, replacement or credit. Photos are available on request.\n\nThank you,\n%s',
      COALESCE(v_vendor, 'there'),
      CASE v_row.type WHEN 'concealed_damage' THEN 'concealed damage' WHEN 'damage' THEN 'damage'
        WHEN 'short_ship' THEN 'a short shipment' ELSE 'a wrong item' END,
      v_label,
      CASE WHEN NULLIF(btrim(v_po.sidemark), '') IS NOT NULL THEN format(' (sidemark %s)', btrim(v_po.sidemark)) ELSE '' END,
      CASE WHEN v_po.delivered_date IS NOT NULL
           THEN format(', delivered %s', to_char(v_po.delivered_date, 'FMMonth FMDD, YYYY')) ELSE '' END,
      CASE WHEN v_piece IS NOT NULL THEN format(E'Piece: %s\n', v_piece) ELSE '' END,
      CASE WHEN v_detail IS NOT NULL THEN format(E'What we found: %s\n', v_detail) ELSE '' END,
      public._procurement_signoff(v_row.organization_id, v_row.project_id))
  )
  RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;

COMMENT ON FUNCTION public.compose_vendor_claim_draft(uuid) IS
  'Composes the vendor claim notice for a damage, short-ship or wrong-item exception (00708, C-28/'
  'C-30). Lands awaiting_review. Gate: can_buy_for_project.';

REVOKE ALL ON FUNCTION public.compose_vendor_claim_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compose_vendor_claim_draft(uuid) TO authenticated;

-- ─── 6. request_substitution_approval ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.request_substitution_approval(p_item_id uuid, p_alternate_ids uuid[])
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_item         public.project_ffe_items%ROWTYPE;
  v_project      public.projects%ROWTYPE;
  v_relationship uuid;
  v_decision_id  uuid := gen_random_uuid();
  v_options      jsonb;
  v_decision     public.client_decisions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'request_substitution_approval: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_buy_for_project(v_item.project_id) THEN
    RAISE EXCEPTION 'request_substitution_approval: line % not found or access denied', p_item_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_item.removed_at IS NOT NULL OR v_item.design_disposition <> 'selected' THEN
    RAISE EXCEPTION 'request_substitution_approval: only a live, selected line can be substituted'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.blocked_by_decision_id IS NOT NULL THEN
    RAISE EXCEPTION 'request_substitution_approval: line % already waits on a client decision', p_item_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_alternate_ids IS NULL OR cardinality(p_alternate_ids) NOT BETWEEN 1 AND 10
     OR (SELECT count(DISTINCT id) FROM unnest(p_alternate_ids) AS id) <> cardinality(p_alternate_ids)
     OR p_item_id = ANY(p_alternate_ids)
     OR EXISTS (
       SELECT 1 FROM unnest(p_alternate_ids) AS wanted(id)
       WHERE NOT EXISTS (
         SELECT 1 FROM public.project_ffe_items AS alt
         WHERE alt.id = wanted.id AND alt.project_id = v_item.project_id
           AND alt.removed_at IS NULL AND alt.design_disposition = 'alternate'
       )
     ) THEN
    RAISE EXCEPTION 'request_substitution_approval: alternates are 1–10 distinct live alternate lines of the same project'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_project FROM public.projects WHERE id = v_item.project_id;
  -- 00463's relationship lookup.
  SELECT id INTO v_relationship
  FROM public.designer_clients
  WHERE designer_id = v_project.designer_id AND client_id = v_project.client_id AND status = 'active'
  ORDER BY created_at, id
  LIMIT 1;
  IF v_relationship IS NULL THEN
    RAISE EXCEPTION 'request_substitution_approval: project % has no active client to ask', v_project.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- The original first, then each alternate at its client price.
  SELECT jsonb_build_array(jsonb_build_object(
           'name', v_item.name, 'designer_note', 'No longer available as specified',
           'quantity', COALESCE(v_item.quantity, 1), 'sort_order', 0))
         || COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'name', alt.name, 'price', alt.unit_price_cents, 'quantity', COALESCE(alt.quantity, 1),
           'product_id', alt.product_id, 'sort_order', wanted.ord)) ORDER BY wanted.ord), '[]'::jsonb)
    INTO v_options
  FROM unnest(p_alternate_ids) WITH ORDINALITY AS wanted(id, ord)
  JOIN public.project_ffe_items AS alt ON alt.id = wanted.id;

  -- The existing rail: a draft the studio releases (publish_client_decision).
  v_decision := public.create_client_decision(
    v_decision_id,
    jsonb_build_object(
      'designer_client_id', v_relationship,
      'project_id', v_item.project_id,
      'title', format('A replacement for %s', v_item.name),
      'context', format('%s is no longer available as specified. Please choose one of the options below.', v_item.name),
      'decision_type', 'product',
      'decision_kind', 'choice',
      'coordination_kind', 'selection',
      'blocking_status', 'blocks_procurement',
      'blocks_kind', 'ffe',
      'status', 'draft'
    ),
    v_options,
    ARRAY[p_item_id]::uuid[],
    '{}'::uuid[]
  );

  UPDATE public.procurement_exceptions SET client_decision_id = v_decision.id, status = 'awaiting_client'
  WHERE id = (
    SELECT id FROM public.procurement_exceptions
    WHERE ffe_item_id = p_item_id AND type IN ('backorder', 'discontinued', 'price_change')
      AND status <> 'resolved'
    ORDER BY opened_at DESC, id DESC
    LIMIT 1
  );

  RETURN v_decision;
END;
$$;

COMMENT ON FUNCTION public.request_substitution_approval(uuid, uuid[]) IS
  'Composes a client_decisions draft through create_client_decision (00708, C-30): the original (no '
  'longer available as specified) and each alternate line at its client price; blocks procurement on '
  'the line. The studio releases it with publish_client_decision. Links the line''s open backorder / '
  'discontinued / price_change exception (awaiting_client). Gate: can_buy_for_project, then the '
  'rail''s _can_author_proposal.';

REVOKE ALL ON FUNCTION public.request_substitution_approval(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_substitution_approval(uuid, uuid[]) TO authenticated;

-- ─── 7. vendor_payments.kind + record_vendor_refund ─────────────────────────

ALTER TABLE public.vendor_payments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'payment';

ALTER TABLE public.vendor_payments DROP CONSTRAINT IF EXISTS vendor_payments_amount_ck;
ALTER TABLE public.vendor_payments DROP CONSTRAINT IF EXISTS vendor_payments_kind_amount_ck;
ALTER TABLE public.vendor_payments
  ADD CONSTRAINT vendor_payments_kind_amount_ck CHECK (
    (kind = 'payment' AND amount_cents > 0)
    OR (kind IN ('refund', 'credit') AND amount_cents < 0 AND po_payment_id IS NULL)
  );

COMMENT ON COLUMN public.vendor_payments.kind IS
  'payment | refund | credit (00708, C-30). A payment is positive; a refund or credit is negative and '
  'never sits on a po_payments row. Recorded, never edited: void and re-record.';

CREATE OR REPLACE FUNCTION public.record_vendor_refund(p_po_id uuid, p_request jsonb)
RETURNS public.vendor_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_req      jsonb := COALESCE(p_request, '{}'::jsonb);
  v_allowed  constant text[] := ARRAY['kind', 'amountCents', 'paidOn', 'method', 'paymentMethodId',
                                      'reference', 'receiptDocumentPath', 'currencyCode'];
  v_utc_day  date := (now() AT TIME ZONE 'UTC')::date;
  v_po       public.purchase_orders%ROWTYPE;
  v_studio   uuid;
  v_kind     text := NULLIF(btrim(COALESCE(v_req->>'kind', '')), '');
  v_amount   numeric;
  v_net_paid bigint;
  v_on       date;
  v_pm       public.studio_payment_methods%ROWTYPE;
  v_pm_id    uuid;
  v_method   text;
  v_row      public.vendor_payments%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'record_vendor_refund: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' THEN
    RAISE EXCEPTION 'record_vendor_refund: request must be a JSON object' USING ERRCODE = 'check_violation';
  END IF;
  IF (v_req - v_allowed) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'record_vendor_refund: unknown keys %',
      (SELECT string_agg(k, ', ') FROM jsonb_object_keys(v_req - v_allowed) k)
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'record_vendor_refund: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- record_vendor_payment's lane guard.
  IF v_po.is_patina_catalog THEN
    RAISE EXCEPTION 'record_vendor_refund: purchase order % is on the Patina catalog lane; it settles through Stripe only', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_kind IS NULL OR v_kind NOT IN ('refund', 'credit') THEN
    RAISE EXCEPTION 'record_vendor_refund: kind must be refund or credit' USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_typeof(v_req->'amountCents') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'record_vendor_refund: amountCents is required, a number of cents' USING ERRCODE = 'check_violation';
  END IF;
  v_amount := (v_req->>'amountCents')::numeric;
  IF v_amount <= 0 OR v_amount <> trunc(v_amount) OR v_amount > 2147483647 THEN
    RAISE EXCEPTION 'record_vendor_refund: amountCents is a positive whole number of cents (it is stored negative)'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Never more back than went out.
  SELECT COALESCE(sum(amount_cents), 0) INTO v_net_paid
  FROM public.vendor_payments WHERE purchase_order_id = p_po_id AND voided_at IS NULL;
  IF v_amount > v_net_paid THEN
    RAISE EXCEPTION 'record_vendor_refund: % cents is more than the % cents net paid on purchase order %',
      v_amount, v_net_paid, p_po_id USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    v_on := COALESCE(NULLIF(btrim(COALESCE(v_req->>'paidOn', '')), '')::date, v_utc_day);
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'record_vendor_refund: paidOn must be a date (YYYY-MM-DD)' USING ERRCODE = 'check_violation';
  END;
  IF v_on > v_utc_day + 1 THEN
    RAISE EXCEPTION 'record_vendor_refund: paidOn % is in the future', v_on USING ERRCODE = 'check_violation';
  END IF;

  SELECT studio_id INTO v_studio FROM public.projects WHERE id = v_po.project_id;
  BEGIN
    v_pm_id := NULLIF(btrim(COALESCE(v_req->>'paymentMethodId', '')), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'record_vendor_refund: paymentMethodId must be an id' USING ERRCODE = 'check_violation';
  END;
  IF v_pm_id IS NOT NULL THEN
    SELECT * INTO v_pm FROM public.studio_payment_methods WHERE id = v_pm_id;
    IF NOT FOUND OR NOT public.is_active_org_member(v_pm.organization_id) THEN
      RAISE EXCEPTION 'record_vendor_refund: payment method % not found or access denied', v_pm_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_pm.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'record_vendor_refund: payment method % is archived', v_pm_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_studio IS NOT NULL AND v_pm.organization_id <> v_studio THEN
      RAISE EXCEPTION 'record_vendor_refund: payment method % belongs to another studio', v_pm_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  v_method := COALESCE(NULLIF(btrim(v_req->>'method'), ''), v_pm.kind, 'other');
  IF v_method NOT IN ('card', 'ach', 'check', 'wire', 'cash', 'other') THEN
    RAISE EXCEPTION 'record_vendor_refund: method must be one of card, ach, check, wire, cash, other'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.vendor_payments (
    organization_id, purchase_order_id, po_payment_id, kind, paid_on, amount_cents,
    currency_code, method, payment_method_id, reference, receipt_document_path, recorded_by
  ) VALUES (
    COALESCE(v_studio, v_pm.organization_id, public.purchase_order_studio_id(p_po_id)), p_po_id, NULL, v_kind, v_on,
    -(v_amount::integer),
    upper(COALESCE(NULLIF(btrim(v_req->>'currencyCode'), ''), 'USD')), v_method, v_pm_id,
    NULLIF(btrim(v_req->>'reference'), ''), NULLIF(btrim(v_req->>'receiptDocumentPath'), ''), v_uid
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.record_vendor_refund(uuid, jsonb) IS
  'Records a vendor refund or credit as a negative vendor_payments row (00708, C-30, d2 §M7 step 4): '
  'amountCents entered positive, at most the PO''s net paid; never on a schedule row; Patina catalog '
  'lane refused. Void with void_vendor_payment. Gate: can_send_purchase_order.';

REVOKE ALL ON FUNCTION public.record_vendor_refund(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_vendor_refund(uuid, jsonb) TO authenticated;

-- ─── 8. sweep_procurement_clocks: the Phase 2 scans ─────────────────────────
-- 00700's body, verbatim, with ack_discrepancy, backorder_reported and
-- quote_expiring filled in. The cron job (procurement-clocks-daily, 00700)
-- calls this function by name and is not rescheduled.

CREATE OR REPLACE FUNCTION public.sweep_procurement_clocks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_run_id        bigint;
  v_claim_window  int := 0;
  v_ack           int := 0;
  v_backorder     int := 0;
  v_quote         int := 0;
  v_detail        jsonb;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('job:procurement-clocks-daily')) THEN
    INSERT INTO public.job_runs (job_name, status, finished_at)
    VALUES ('procurement-clocks-daily', 'skipped', now());
    RETURN jsonb_build_object('skipped', true);
  END IF;

  PERFORM set_config('app.actor', 'job:procurement-clocks-daily', true);

  INSERT INTO public.job_runs (job_name, status)
  VALUES ('procurement-clocks-daily', 'running')
  RETURNING id INTO v_run_id;

  BEGIN
    -- claim_window_closing: the day before the vendor deadline (or on it),
    -- while a drafted damage claim still waits to be sent. Windows are at
    -- most 365 days (00696), which bounds the delivered_date scan.
    INSERT INTO public.procurement_notifications (user_id, kind, subject_purchase_order_id)
    SELECT recipient,
           'claim_window_closing'::public.procurement_notification_kind,
           po.id
      FROM public.purchase_orders AS po
     CROSS JOIN LATERAL public.procurement_claim_deadline(po.id) AS clock
     CROSS JOIN LATERAL public.procurement_notice_recipients(po.id) AS recipient
     WHERE po.delivered_date IS NOT NULL
       AND po.delivered_date >= CURRENT_DATE - 365
       AND po.status <> 'cancelled'
       AND clock.vendor_deadline - 1 <= CURRENT_DATE
       AND clock.vendor_deadline >= CURRENT_DATE
       AND EXISTS (
         SELECT 1
           FROM public.receiving_inspections AS ri
           JOIN public.damage_claims AS claim ON claim.receiving_inspection_id = ri.id
          WHERE ri.purchase_order_id = po.id
            AND claim.state = 'drafted'
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public.procurement_notifications AS n
          WHERE n.subject_purchase_order_id = po.id
            AND n.kind = 'claim_window_closing'
            AND n.user_id = recipient
       );
    GET DIAGNOSTICS v_claim_window = ROW_COUNT;

    -- ack_discrepancy (00708): an open acknowledgment discrepancy, once per
    -- exception and recipient (the PO creator and the project lead).
    INSERT INTO public.procurement_notifications (
      user_id, kind, subject_purchase_order_id, subject_exception_id, organization_id
    )
    SELECT recipient, 'ack_discrepancy'::public.procurement_notification_kind,
           exc.purchase_order_id, exc.id, exc.organization_id
      FROM public.procurement_exceptions AS exc
     CROSS JOIN LATERAL public.procurement_notice_recipients(exc.purchase_order_id) AS recipient
     WHERE exc.type = 'ack_discrepancy'
       AND exc.status <> 'resolved'
       AND NOT EXISTS (
         SELECT 1 FROM public.procurement_notifications AS n
          WHERE n.subject_exception_id = exc.id
            AND n.kind = 'ack_discrepancy'
            AND n.user_id = recipient
       );
    GET DIAGNOSTICS v_ack = ROW_COUNT;

    -- backorder_reported (00708): an open backorder exception, once per
    -- exception and recipient (the PO's recipients, or for a line not yet on
    -- a PO the project lead and whoever opened it).
    INSERT INTO public.procurement_notifications (
      user_id, kind, subject_purchase_order_id, subject_exception_id, organization_id
    )
    SELECT DISTINCT recipient.user_id, 'backorder_reported'::public.procurement_notification_kind,
           exc.purchase_order_id, exc.id, exc.organization_id
      FROM public.procurement_exceptions AS exc
      JOIN public.projects AS project ON project.id = exc.project_id
     CROSS JOIN LATERAL (
       SELECT r FROM public.procurement_notice_recipients(exc.purchase_order_id) AS r
        WHERE exc.purchase_order_id IS NOT NULL
       UNION
       SELECT v FROM (VALUES (project.designer_id), (exc.opened_by)) AS t(v)
        WHERE exc.purchase_order_id IS NULL AND v IS NOT NULL
     ) AS recipient(user_id)
     WHERE exc.type = 'backorder'
       AND exc.status <> 'resolved'
       AND NOT EXISTS (
         SELECT 1 FROM public.procurement_notifications AS n
          WHERE n.subject_exception_id = exc.id
            AND n.kind = 'backorder_reported'
            AND n.user_id = recipient.user_id
       );
    GET DIAGNOSTICS v_backorder = ROW_COUNT;

    -- quote_expiring (00708): the day before valid_until, or on it, for a live
    -- quote with a line not yet ordered. R6 is open: valid_until only.
    INSERT INTO public.procurement_notifications (user_id, kind, subject_quote_id, organization_id)
    SELECT DISTINCT recipient.user_id, 'quote_expiring'::public.procurement_notification_kind,
           quote.id, quote.organization_id
      FROM public.vendor_quotes AS quote
      JOIN public.projects AS project ON project.id = quote.project_id
     CROSS JOIN LATERAL (VALUES (quote.recorded_by), (project.designer_id)) AS recipient(user_id)
     WHERE quote.superseded_by IS NULL
       AND quote.valid_until IS NOT NULL
       AND quote.valid_until - 1 <= CURRENT_DATE
       AND quote.valid_until >= CURRENT_DATE
       AND recipient.user_id IS NOT NULL
       AND EXISTS (
         SELECT 1
           FROM public.vendor_quote_lines AS ql
           JOIN public.project_ffe_items AS item ON item.id = ql.ffe_item_id
          WHERE ql.quote_id = quote.id
            AND item.purchase_order_id IS NULL
            AND item.removed_at IS NULL
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.procurement_notifications AS n
          WHERE n.subject_quote_id = quote.id
            AND n.kind = 'quote_expiring'
            AND n.user_id = recipient.user_id
       );
    GET DIAGNOSTICS v_quote = ROW_COUNT;

    -- TODO(Phase 2): cfa_reserve_expiring — submittal reserves expiring.
    -- TODO(Phase 2): memo_return_due — sample/memo return-by dates.
  EXCEPTION WHEN OTHERS THEN
    -- No re-RAISE (the 00300 / 00574 / 00630 idiom): the failed row persists
    -- as the failure record and the guarded block rolls back to its savepoint.
    UPDATE public.job_runs
       SET status = 'failed', finished_at = now(), error = SQLERRM,
           detail = jsonb_build_object('claim_window_closing', v_claim_window,
                                       'ack_discrepancy', v_ack,
                                       'backorder_reported', v_backorder,
                                       'quote_expiring', v_quote)
     WHERE id = v_run_id;
    RETURN jsonb_build_object('error', SQLERRM);
  END;

  v_detail := jsonb_build_object('claim_window_closing', v_claim_window,
                                 'ack_discrepancy', v_ack,
                                 'backorder_reported', v_backorder,
                                 'quote_expiring', v_quote);

  UPDATE public.job_runs
     SET status = 'succeeded', finished_at = now(), detail = v_detail
   WHERE id = v_run_id;

  RETURN v_detail;
END;
$$;

COMMENT ON FUNCTION public.sweep_procurement_clocks() IS
  'procurement-clocks-daily (00700, d2 §M8; Phase 2 scans 00708): writes deduped procurement notices '
  'from procurement clocks. claim_window_closing (00700); ack_discrepancy and backorder_reported, once '
  'per open exception and recipient; quote_expiring, the day before a live quote''s valid_until or on '
  'it while a line is unordered (R6 open: valid_until only). Advisory xact lock, one job_runs row per '
  'run, skipped on contention. service_role only.';

REVOKE ALL ON FUNCTION public.sweep_procurement_clocks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_procurement_clocks() TO service_role;
