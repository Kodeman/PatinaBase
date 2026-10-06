-- ═══════════════════════════════════════════════════════════════════════════
-- 00712 — Sample and memo requests with return-by dates; the last two
--         procurement clocks (US-16 Phase 2, C-35; SQ-420)
-- ═══════════════════════════════════════════════════════════════════════════
-- d2 §M10: record a memo or sample request, optionally against a line or a
-- vendor, with a return-by date, and raise one Desk need before the vendor
-- bills for an unreturned memo. CFAs are not here (they are 00702
-- submittals). A loaner rug is a sample with a return-by date. A memo library,
-- sample-box ordering and shelf inventory are a parked side journey.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- sample_requests   kind memo | finish_chip | loaner | other; status
--   requested | received | returned | cancelled; requested_on, received_on,
--   return_by, returned_on, return_tracking, fee_cents, billable_to_client.
--   organization_id is the project's studio, or the caller's primary studio
--   for a request with no project. Read: can_buy_for_project for a project
--   request, is_active_org_member otherwise. No direct writes.
-- record_sample_request(p_request jsonb)
--   Keys: id, organizationId, projectId, ffeItemId, vendorId, studioContactId,
--   kind, description, requestedOn, receivedOn, returnBy, returnTracking,
--   feeCents, billableToClient, status (requested | received | cancelled).
--   Without id it creates (kind required); with id it patches the keys present
--   (JSON null clears) while the sample is not returned. A receivedOn moves a
--   requested sample to received.
-- mark_sample_returned(p_sample_id, p_returned_on, p_return_tracking)
--   Idempotent. Marks the sample's unread memo_return_due notices read — the
--   return clears the need.
-- FKs wired: procurement_notifications.subject_submittal_id → po_submittals
--   and subject_sample_id → sample_requests (00699/00700 left them bare);
--   procurement_drafts.sample_id → sample_requests (00706).
-- sweep_procurement_clocks  00708's body, verbatim, plus the two remaining
--   scans, each once per subject and recipient (the creator and the project
--   lead):
--     memo_return_due       return_by within 3 days (or past) on a sample not
--                           returned or cancelled;
--     cfa_reserve_expiring  the day before a pending submittal's
--                           reserve_expires_on, or on it.
--   Lineage: 00700 → 00708 → 00712.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. sample_requests ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sample_requests (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid        NOT NULL REFERENCES public.organizations(id),
  project_id         uuid        REFERENCES public.projects(id) ON DELETE CASCADE,
  ffe_item_id        uuid        REFERENCES public.project_ffe_items(id) ON DELETE SET NULL,
  vendor_id          uuid        REFERENCES public.vendors(id) ON DELETE SET NULL,
  studio_contact_id  uuid        REFERENCES public.studio_contacts(id) ON DELETE SET NULL,
  kind               text        NOT NULL,
  description        text,
  requested_on       date        NOT NULL DEFAULT CURRENT_DATE,
  received_on        date,
  return_by          date,
  returned_on        date,
  return_tracking    text,
  fee_cents          integer,
  billable_to_client boolean     NOT NULL DEFAULT false,
  status             text        NOT NULL DEFAULT 'requested',
  created_by         uuid,
  updated_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sample_requests_kind_ck
    CHECK (kind IN ('memo', 'finish_chip', 'loaner', 'other')),
  CONSTRAINT sample_requests_status_ck
    CHECK (status IN ('requested', 'received', 'returned', 'cancelled')),
  CONSTRAINT sample_requests_returned_ck
    CHECK ((status = 'returned') = (returned_on IS NOT NULL)),
  CONSTRAINT sample_requests_item_ck
    CHECK (ffe_item_id IS NULL OR project_id IS NOT NULL),
  CONSTRAINT sample_requests_money_ck
    CHECK (fee_cents IS NULL OR fee_cents >= 0),
  CONSTRAINT sample_requests_text_ck
    CHECK ((description IS NULL OR char_length(description) <= 500)
       AND (return_tracking IS NULL OR char_length(return_tracking) <= 200))
);

CREATE INDEX IF NOT EXISTS idx_sample_requests_project
  ON public.sample_requests (project_id)
  WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sample_requests_org
  ON public.sample_requests (organization_id, requested_on);
CREATE INDEX IF NOT EXISTS idx_sample_requests_return_due
  ON public.sample_requests (return_by)
  WHERE return_by IS NOT NULL AND status IN ('requested', 'received');

DROP TRIGGER IF EXISTS set_updated_at_sample_requests ON public.sample_requests;
CREATE TRIGGER set_updated_at_sample_requests
  BEFORE UPDATE ON public.sample_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.sample_requests IS
  'Memo, finish-chip, loaner and other sample requests with a return-by date (00712, C-35, d2 §M10). '
  'Read: can_buy_for_project for a project request, is_active_org_member otherwise. Written only '
  'through record_sample_request / mark_sample_returned.';

ALTER TABLE public.sample_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sample_requests_studio_select ON public.sample_requests;
CREATE POLICY sample_requests_studio_select ON public.sample_requests
  FOR SELECT TO authenticated
  USING (
    CASE WHEN project_id IS NOT NULL THEN public.can_buy_for_project(project_id)
         ELSE public.is_active_org_member(organization_id)
    END
  );

REVOKE ALL ON TABLE public.sample_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.sample_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sample_requests TO service_role;

-- ─── 2. The bare subject FKs ────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'procurement_notifications_subject_submittal_id_fkey'
                    AND conrelid = 'public.procurement_notifications'::regclass) THEN
    ALTER TABLE public.procurement_notifications
      ADD CONSTRAINT procurement_notifications_subject_submittal_id_fkey
      FOREIGN KEY (subject_submittal_id) REFERENCES public.po_submittals(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'procurement_notifications_subject_sample_id_fkey'
                    AND conrelid = 'public.procurement_notifications'::regclass) THEN
    ALTER TABLE public.procurement_notifications
      ADD CONSTRAINT procurement_notifications_subject_sample_id_fkey
      FOREIGN KEY (subject_sample_id) REFERENCES public.sample_requests(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'procurement_drafts_sample_id_fkey'
                    AND conrelid = 'public.procurement_drafts'::regclass) THEN
    ALTER TABLE public.procurement_drafts
      ADD CONSTRAINT procurement_drafts_sample_id_fkey
      FOREIGN KEY (sample_id) REFERENCES public.sample_requests(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_procurement_notifications_subject_submittal
  ON public.procurement_notifications (subject_submittal_id)
  WHERE subject_submittal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_procurement_notifications_subject_sample
  ON public.procurement_notifications (subject_sample_id)
  WHERE subject_sample_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_procurement_drafts_sample
  ON public.procurement_drafts (sample_id)
  WHERE sample_id IS NOT NULL;

-- ─── 3. record_sample_request ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_sample_request(p_request jsonb)
RETURNS public.sample_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_req      jsonb := COALESCE(p_request, '{}'::jsonb);
  v_keys     constant text[] := ARRAY['id', 'organizationId', 'projectId', 'ffeItemId', 'vendorId',
    'studioContactId', 'kind', 'description', 'requestedOn', 'receivedOn', 'returnBy',
    'returnTracking', 'feeCents', 'billableToClient', 'status'];
  v_row      public.sample_requests%ROWTYPE;
  v_project  public.projects%ROWTYPE;
  v_id       uuid;
  v_org      uuid;
  v_project_id uuid;
  v_item_id  uuid;
  v_vendor   uuid;
  v_contact  uuid;
  v_kind     text;
  v_desc     text;
  v_requested date;
  v_received date;
  v_return_by date;
  v_tracking text;
  v_fee      integer;
  v_billable boolean;
  v_status   text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'record_sample_request: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' THEN
    RAISE EXCEPTION 'record_sample_request: request must be an object' USING ERRCODE = 'check_violation';
  END IF;
  IF (v_req - v_keys) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'record_sample_request: unknown keys %',
      (SELECT string_agg(key, ', ') FROM jsonb_object_keys(v_req - v_keys) AS key)
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(v_req - ARRAY['feeCents', 'billableToClient']) AS entry
    WHERE jsonb_typeof(entry.value) NOT IN ('string', 'null')
  ) OR jsonb_typeof(COALESCE(v_req->'feeCents', 'null'::jsonb)) NOT IN ('number', 'null')
    OR jsonb_typeof(COALESCE(v_req->'billableToClient', 'null'::jsonb)) NOT IN ('boolean', 'null') THEN
    RAISE EXCEPTION 'record_sample_request: feeCents is a number, billableToClient a boolean, every other value a string or null'
      USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    v_id := NULLIF(btrim(COALESCE(v_req->>'id', '')), '')::uuid;
    v_org := NULLIF(btrim(COALESCE(v_req->>'organizationId', '')), '')::uuid;
    v_project_id := NULLIF(btrim(COALESCE(v_req->>'projectId', '')), '')::uuid;
    v_item_id := NULLIF(btrim(COALESCE(v_req->>'ffeItemId', '')), '')::uuid;
    v_vendor := NULLIF(btrim(COALESCE(v_req->>'vendorId', '')), '')::uuid;
    v_contact := NULLIF(btrim(COALESCE(v_req->>'studioContactId', '')), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'record_sample_request: id, organizationId, projectId, ffeItemId, vendorId and studioContactId must be ids'
      USING ERRCODE = 'check_violation';
  END;
  BEGIN
    v_requested := NULLIF(btrim(COALESCE(v_req->>'requestedOn', '')), '')::date;
    v_received := NULLIF(btrim(COALESCE(v_req->>'receivedOn', '')), '')::date;
    v_return_by := NULLIF(btrim(COALESCE(v_req->>'returnBy', '')), '')::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'record_sample_request: requestedOn, receivedOn and returnBy must be dates (YYYY-MM-DD)'
      USING ERRCODE = 'check_violation';
  END;
  IF v_req ? 'feeCents' AND jsonb_typeof(v_req->'feeCents') = 'number' THEN
    IF (v_req->>'feeCents')::numeric <> trunc((v_req->>'feeCents')::numeric)
       OR (v_req->>'feeCents')::numeric < 0 OR (v_req->>'feeCents')::numeric > 100000000 THEN
      RAISE EXCEPTION 'record_sample_request: feeCents must be whole cents from 0 to 100000000'
        USING ERRCODE = 'check_violation';
    END IF;
    v_fee := (v_req->>'feeCents')::numeric::integer;
  END IF;
  v_billable := (v_req->>'billableToClient')::boolean;
  v_kind := NULLIF(btrim(COALESCE(v_req->>'kind', '')), '');
  v_desc := NULLIF(btrim(COALESCE(v_req->>'description', '')), '');
  v_tracking := NULLIF(btrim(COALESCE(v_req->>'returnTracking', '')), '');
  v_status := NULLIF(btrim(COALESCE(v_req->>'status', '')), '');
  IF v_kind IS NOT NULL AND v_kind NOT IN ('memo', 'finish_chip', 'loaner', 'other') THEN
    RAISE EXCEPTION 'record_sample_request: kind must be memo, finish_chip, loaner or other'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('requested', 'received', 'cancelled') THEN
    RAISE EXCEPTION 'record_sample_request: status must be requested, received or cancelled (mark_sample_returned records a return)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_desc) > 500 OR char_length(v_tracking) > 200 THEN
    RAISE EXCEPTION 'record_sample_request: description is at most 500 characters, returnTracking 200'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.sample_requests WHERE id = v_id FOR UPDATE;
    IF NOT FOUND OR NOT (
      CASE WHEN v_row.project_id IS NOT NULL THEN public.can_buy_for_project(v_row.project_id)
           ELSE public.is_active_org_member(v_row.organization_id) END
    ) THEN
      RAISE EXCEPTION 'record_sample_request: sample % not found or access denied', v_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_row.status = 'returned' THEN
      RAISE EXCEPTION 'record_sample_request: sample % was returned; record a new one', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF (v_req ? 'organizationId' AND v_org IS DISTINCT FROM v_row.organization_id)
       OR (v_req ? 'projectId' AND v_project_id IS DISTINCT FROM v_row.project_id) THEN
      RAISE EXCEPTION 'record_sample_request: organizationId and projectId cannot change; record a new one'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_req ? 'kind' AND v_kind IS NULL THEN
      RAISE EXCEPTION 'record_sample_request: kind cannot be cleared' USING ERRCODE = 'check_violation';
    END IF;
    v_org := v_row.organization_id;
    v_project_id := v_row.project_id;
  ELSE
    IF v_kind IS NULL THEN
      RAISE EXCEPTION 'record_sample_request: kind is required' USING ERRCODE = 'check_violation';
    END IF;
    -- A line implies its project.
    IF v_item_id IS NOT NULL AND v_project_id IS NULL THEN
      SELECT project_id INTO v_project_id FROM public.project_ffe_items WHERE id = v_item_id;
    END IF;
    IF v_project_id IS NOT NULL THEN
      SELECT * INTO v_project FROM public.projects WHERE id = v_project_id;
      IF NOT FOUND OR NOT public.can_buy_for_project(v_project_id) THEN
        RAISE EXCEPTION 'record_sample_request: project not found or access denied'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF v_org IS NOT NULL
         AND v_org IS DISTINCT FROM COALESCE(v_project.studio_id, public._primary_studio_for(v_project.designer_id)) THEN
        RAISE EXCEPTION 'record_sample_request: organizationId must be the project''s studio'
          USING ERRCODE = 'check_violation';
      END IF;
      v_org := COALESCE(v_project.studio_id, public._primary_studio_for(v_project.designer_id));
    ELSE
      v_org := COALESCE(v_org, public._primary_studio_for(v_uid));
    END IF;
    IF v_org IS NULL OR NOT (
      public.is_active_org_member(v_org) OR (v_project_id IS NOT NULL AND public.can_buy_for_project(v_project_id))
    ) THEN
      RAISE EXCEPTION 'record_sample_request: studio not found or access denied'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_ffe_items WHERE id = v_item_id AND project_id = v_project_id AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'record_sample_request: ffeItemId must be a live line on the same project'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_vendor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = v_vendor) THEN
    RAISE EXCEPTION 'record_sample_request: vendorId is not a vendor' USING ERRCODE = 'check_violation';
  END IF;
  IF v_contact IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.studio_contacts WHERE id = v_contact AND organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'record_sample_request: studioContactId must be one of the studio''s contacts'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.sample_requests (
      organization_id, project_id, ffe_item_id, vendor_id, studio_contact_id, kind, description,
      requested_on, received_on, return_by, return_tracking, fee_cents, billable_to_client, status,
      created_by, updated_by
    ) VALUES (
      v_org, v_project_id, v_item_id, v_vendor, v_contact, v_kind, v_desc,
      COALESCE(v_requested, CURRENT_DATE), v_received, v_return_by, v_tracking, v_fee,
      COALESCE(v_billable, false),
      COALESCE(v_status, CASE WHEN v_received IS NOT NULL THEN 'received' ELSE 'requested' END),
      v_uid, v_uid
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.sample_requests SET
      ffe_item_id = CASE WHEN v_req ? 'ffeItemId' THEN v_item_id ELSE ffe_item_id END,
      vendor_id = CASE WHEN v_req ? 'vendorId' THEN v_vendor ELSE vendor_id END,
      studio_contact_id = CASE WHEN v_req ? 'studioContactId' THEN v_contact ELSE studio_contact_id END,
      kind = CASE WHEN v_req ? 'kind' THEN v_kind ELSE kind END,
      description = CASE WHEN v_req ? 'description' THEN v_desc ELSE description END,
      requested_on = CASE WHEN v_req ? 'requestedOn' THEN COALESCE(v_requested, requested_on) ELSE requested_on END,
      received_on = CASE WHEN v_req ? 'receivedOn' THEN v_received ELSE received_on END,
      return_by = CASE WHEN v_req ? 'returnBy' THEN v_return_by ELSE return_by END,
      return_tracking = CASE WHEN v_req ? 'returnTracking' THEN v_tracking ELSE return_tracking END,
      fee_cents = CASE WHEN v_req ? 'feeCents' THEN v_fee ELSE fee_cents END,
      billable_to_client = CASE WHEN v_req ? 'billableToClient' THEN COALESCE(v_billable, false)
                                ELSE billable_to_client END,
      status = CASE
                 WHEN v_status IS NOT NULL THEN v_status
                 WHEN v_req ? 'receivedOn' AND v_received IS NOT NULL AND status = 'requested' THEN 'received'
                 ELSE status
               END,
      updated_by = v_uid
    WHERE id = v_id
    RETURNING * INTO v_row;
  END IF;
  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.record_sample_request(jsonb) IS
  'Records a sample or memo request (00712, C-35): create (kind; project, line, vendor and contact '
  'optional), or patch one not yet returned. Gate: can_buy_for_project for a project request, '
  'is_active_org_member for a studio one.';

REVOKE ALL ON FUNCTION public.record_sample_request(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_sample_request(jsonb) TO authenticated;

-- ─── 4. mark_sample_returned ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mark_sample_returned(
  p_sample_id uuid,
  p_returned_on date DEFAULT NULL,
  p_return_tracking text DEFAULT NULL
)
RETURNS public.sample_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_row      public.sample_requests%ROWTYPE;
  v_tracking text := NULLIF(btrim(COALESCE(p_return_tracking, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'mark_sample_returned: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_row FROM public.sample_requests WHERE id = p_sample_id FOR UPDATE;
  IF NOT FOUND OR NOT (
    CASE WHEN v_row.project_id IS NOT NULL THEN public.can_buy_for_project(v_row.project_id)
         ELSE public.is_active_org_member(v_row.organization_id) END
  ) THEN
    RAISE EXCEPTION 'mark_sample_returned: sample % not found or access denied', p_sample_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(v_tracking) > 200 THEN
    RAISE EXCEPTION 'mark_sample_returned: returnTracking is at most 200 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_row.status <> 'returned' THEN
    UPDATE public.sample_requests
       SET status = 'returned',
           returned_on = COALESCE(p_returned_on, CURRENT_DATE),
           return_tracking = COALESCE(v_tracking, return_tracking),
           updated_by = v_uid
     WHERE id = p_sample_id
    RETURNING * INTO v_row;
  END IF;

  -- The return clears the need.
  UPDATE public.procurement_notifications
     SET read_at = now()
   WHERE subject_sample_id = p_sample_id
     AND kind = 'memo_return_due'
     AND read_at IS NULL;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.mark_sample_returned(uuid, date, text) IS
  'Marks a sample returned (00712, C-35), idempotently, and marks its unread memo_return_due notices '
  'read. Gate: can_buy_for_project for a project sample, is_active_org_member otherwise.';

REVOKE ALL ON FUNCTION public.mark_sample_returned(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_sample_returned(uuid, date, text) TO authenticated;

-- ─── 5. sweep_procurement_clocks: the last two scans ────────────────────────
-- 00708's body, verbatim, with memo_return_due and cfa_reserve_expiring filled
-- in. The cron job (procurement-clocks-daily, 00700) calls this function by
-- name and is not rescheduled.

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
  v_cfa           int := 0;
  v_memo          int := 0;
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

    -- cfa_reserve_expiring (00712): the day before a pending submittal's
    -- reserve_expires_on, or on it — the vendor stops holding the cut. Once
    -- per submittal and recipient (whoever recorded it and the project lead).
    INSERT INTO public.procurement_notifications (
      user_id, kind, subject_submittal_id, subject_purchase_order_id, organization_id
    )
    SELECT DISTINCT recipient.user_id, 'cfa_reserve_expiring'::public.procurement_notification_kind,
           sub.id, sub.purchase_order_id, sub.organization_id
      FROM public.po_submittals AS sub
      JOIN public.projects AS project ON project.id = sub.project_id
     CROSS JOIN LATERAL (VALUES (sub.created_by), (project.designer_id)) AS recipient(user_id)
     WHERE sub.decision = 'pending'
       AND sub.reserve_expires_on IS NOT NULL
       AND sub.reserve_expires_on - 1 <= CURRENT_DATE
       AND sub.reserve_expires_on >= CURRENT_DATE
       AND recipient.user_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.procurement_notifications AS n
          WHERE n.subject_submittal_id = sub.id
            AND n.kind = 'cfa_reserve_expiring'
            AND n.user_id = recipient.user_id
       );
    GET DIAGNOSTICS v_cfa = ROW_COUNT;

    -- memo_return_due (00712): return_by within three days, or past, on a
    -- sample not yet returned or cancelled — before the vendor bills for it.
    -- Once per sample and recipient (whoever recorded it and, for a project
    -- sample, the project lead).
    INSERT INTO public.procurement_notifications (user_id, kind, subject_sample_id, organization_id)
    SELECT DISTINCT recipient.user_id, 'memo_return_due'::public.procurement_notification_kind,
           sample.id, sample.organization_id
      FROM public.sample_requests AS sample
      LEFT JOIN public.projects AS project ON project.id = sample.project_id
     CROSS JOIN LATERAL (VALUES (sample.created_by), (project.designer_id)) AS recipient(user_id)
     WHERE sample.status IN ('requested', 'received')
       AND sample.return_by IS NOT NULL
       AND sample.return_by - 3 <= CURRENT_DATE
       AND recipient.user_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.procurement_notifications AS n
          WHERE n.subject_sample_id = sample.id
            AND n.kind = 'memo_return_due'
            AND n.user_id = recipient.user_id
       );
    GET DIAGNOSTICS v_memo = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    -- No re-RAISE (the 00300 / 00574 / 00630 idiom): the failed row persists
    -- as the failure record and the guarded block rolls back to its savepoint.
    UPDATE public.job_runs
       SET status = 'failed', finished_at = now(), error = SQLERRM,
           detail = jsonb_build_object('claim_window_closing', v_claim_window,
                                       'ack_discrepancy', v_ack,
                                       'backorder_reported', v_backorder,
                                       'quote_expiring', v_quote,
                                       'cfa_reserve_expiring', v_cfa,
                                       'memo_return_due', v_memo)
     WHERE id = v_run_id;
    RETURN jsonb_build_object('error', SQLERRM);
  END;

  v_detail := jsonb_build_object('claim_window_closing', v_claim_window,
                                 'ack_discrepancy', v_ack,
                                 'backorder_reported', v_backorder,
                                 'quote_expiring', v_quote,
                                 'cfa_reserve_expiring', v_cfa,
                                 'memo_return_due', v_memo);

  UPDATE public.job_runs
     SET status = 'succeeded', finished_at = now(), detail = v_detail
   WHERE id = v_run_id;

  RETURN v_detail;
END;
$$;

COMMENT ON FUNCTION public.sweep_procurement_clocks() IS
  'procurement-clocks-daily (00700, d2 §M8; Phase 2 scans 00708, 00712): writes deduped procurement '
  'notices from procurement clocks. claim_window_closing (00700); ack_discrepancy and backorder_reported, '
  'once per open exception and recipient; quote_expiring, the day before a live quote''s valid_until or '
  'on it while a line is unordered (R6 open: valid_until only); cfa_reserve_expiring, the day before a '
  'pending submittal''s reserve_expires_on or on it; memo_return_due, return_by within three days on a '
  'sample not returned. Advisory xact lock, one job_runs row per run, skipped on contention. '
  'service_role only.';

REVOKE ALL ON FUNCTION public.sweep_procurement_clocks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_procurement_clocks() TO service_role;
