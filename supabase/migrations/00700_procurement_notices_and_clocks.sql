-- ═══════════════════════════════════════════════════════════════════════════
-- 00700 — Procurement notices address the people who act, the claim clock,
--         procurement-clocks-daily, and per-line check-in condition / BOL
--         (US-16 Phase 1, C-20, C-22, the data half of C-19; SQ-403)
-- ═══════════════════════════════════════════════════════════════════════════
-- d2 §1 C1/C2, §M7 (clock only), §M8; d1 D1-08. Uses 00699's
-- claim_window_closing, so it runs after that file commits.
--
-- ── 1. procurement_notifications ───────────────────────────────────────────
--   organization_id         the PO's studio: projects.studio_id, else the
--                           project owner's primary design studio
--                           (purchase_order_studio_id). Filled on INSERT by a
--                           trigger whenever the writer leaves it NULL, so
--                           every writer (these SQL writers and stripe-webhook)
--                           gets it without change. Existing rows backfilled.
--   subject_exception_id,   subjects for the Phase 2 kinds. Plain nullable
--   subject_submittal_id,   uuids; their FKs arrive with their tables
--   subject_sample_id       (Phase 2: procurement_exceptions, submittals,
--                           sample_requests).
--
-- ── 2. Read policy ──────────────────────────────────────────────────────────
-- 00151's "Studio owners can read procurement notifications" is inert by its
-- own comment (it joins projects.designer_id = auth.uid()). It is replaced by
-- procurement_notifications_studio_select: a studio co-member of the PO's
-- owner may read the notice, the 00584 pattern (po_payments_studio_rw,
-- receiving_inspections_studio_rw). The own-row SELECT and UPDATE policies
-- stay. The feed hooks still filter user_id = auth.uid(), so nobody's feed or
-- unread count changes; the Desk can now see a colleague's open notice.
--
-- ── 3. Addressee ────────────────────────────────────────────────────────────
-- procurement_notice_recipients(po): the PO's creator (purchase_orders
-- .created_by, 00449) and the project lead (projects.designer_id, which
-- lead_designer_id aliases), deduped; the PO owner only when neither is set.
-- Every SQL writer uses it:
--   notify_payment_due()            00151 → 00700 (the rows the
--                                   po-payments-due-daily flips raise)
--   notify_damage_claim_drafted()   00151 → 00700
--   delivery-this-week-weekly       00189 → 00700 (job body; its dedupe is now
--                                   per recipient)
--   procurement-clocks-daily        new, below
-- Each trigger body is 00151's, copied verbatim; the delta is the INSERT,
-- which now selects from the recipients instead of po.designer_id. Not
-- changed here: stripe-webhook's payment_received/failed/refunded insert
-- (supabase/functions/stripe-webhook/index.ts) still addresses
-- purchase_orders.designer_id.
--
-- ── 4. Per-line check-in: receiving_inspection_lines ────────────────────────
-- One row per (inspection, line): received_quantity (the running count the
-- check-in recorded), condition good | damaged | short | wrong, noted_on_bol.
-- Read: co-members of the PO owner (receiving_inspections_studio_rw's
-- predicate). Written only by record_project_ffe_inspection, a sibling of
-- record_project_ffe_receipt_batch (00446/00447/00493, not redefined): it
-- validates the per-line fields, passes {selectionId, receivedQuantity} to
-- the batch RPC (which keeps every access, state, count, photo and idempotency
-- rule, and admits confirmed / in_production / shipped / delivered POs), then
-- records the lines against the inspection it returns. A clean outcome
-- requires every line good. A replay the batch answers with reused=true
-- succeeds when the lines match what is stored and is refused when they do
-- not.
--
-- ── 5. The claim clock ──────────────────────────────────────────────────────
-- procurement_claim_deadline(po): delivered_date + the studio vendor
-- account's windows, read through studio_vendor_claim_windows (00696), which
-- supplies the R-PB9 defaults (3 days for the vendor, 5 for concealed carrier
-- damage) wherever the account sets none. The PO's studio comes from
-- purchase_order_studio_id (projects.studio_id, else the owner's primary
-- studio), which needs _primary_studio_for, closed to PostgREST roles since
-- 00484; so both are SECURITY DEFINER, and the clock answers only for a PO
-- the caller can read (purchase_orders_studio_read's predicate).
--
-- ── 6. procurement-clocks-daily (pg_cron, pure SQL, job_runs history) ───────
-- sweep_procurement_clocks(), 00630's shape (advisory xact lock, one job_runs
-- row per run, skipped on contention, failure recorded without re-raise).
-- claim_window_closing: one notice per recipient, the day before the vendor
-- deadline (or on the day, if the claim was drafted late), for a delivered,
-- uncancelled PO that still has a drafted (unnotified) damage claim, deduped
-- with 00189's NOT EXISTS idiom. The other new kinds' scans are TODO stubs for
-- Phase 2. Daily at 13:10 UTC.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 0. purchase_order_studio_id ────────────────────────────────────────────
-- The studio a PO belongs to, the way set_project_studio_id would derive it.
-- SECURITY DEFINER because _primary_studio_for is closed to every PostgREST
-- role (00484); internal, so no authenticated grant. Callers: the
-- notification fill trigger (inserters are definer triggers, pg_cron and
-- stripe-webhook's service_role), the backfill, procurement_claim_deadline.

CREATE OR REPLACE FUNCTION public.purchase_order_studio_id(p_po_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(project.studio_id, public._primary_studio_for(project.designer_id))
  FROM public.purchase_orders AS po
  JOIN public.projects AS project ON project.id = po.project_id
  WHERE po.id = p_po_id;
$$;

COMMENT ON FUNCTION public.purchase_order_studio_id(uuid) IS
  'The studio a purchase order belongs to: projects.studio_id, else the project owner''s primary '
  'design studio (_primary_studio_for). NULL when neither exists. Internal helper (00700): '
  'SECURITY DEFINER, service_role only.';

REVOKE ALL ON FUNCTION public.purchase_order_studio_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_order_studio_id(uuid) TO service_role;

-- ─── 1. procurement_notifications columns ───────────────────────────────────

ALTER TABLE public.procurement_notifications
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subject_exception_id uuid,
  ADD COLUMN IF NOT EXISTS subject_submittal_id uuid,
  ADD COLUMN IF NOT EXISTS subject_sample_id uuid;

COMMENT ON COLUMN public.procurement_notifications.organization_id IS
  'The studio the notice belongs to (00700): purchase_order_studio_id(subject_purchase_order_id), '
  'filled on INSERT when the writer leaves it NULL.';
COMMENT ON COLUMN public.procurement_notifications.subject_exception_id IS
  'Phase 2 subject (procurement_exceptions). No FK until that table exists.';
COMMENT ON COLUMN public.procurement_notifications.subject_submittal_id IS
  'Phase 2 subject (submittals). No FK until that table exists.';
COMMENT ON COLUMN public.procurement_notifications.subject_sample_id IS
  'Phase 2 subject (sample_requests). No FK until that table exists.';

CREATE OR REPLACE FUNCTION public.procurement_notification_fill_org()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.subject_purchase_order_id IS NOT NULL THEN
    NEW.organization_id := public.purchase_order_studio_id(NEW.subject_purchase_order_id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.procurement_notification_fill_org() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS procurement_notifications_fill_org ON public.procurement_notifications;
CREATE TRIGGER procurement_notifications_fill_org
  BEFORE INSERT ON public.procurement_notifications
  FOR EACH ROW EXECUTE FUNCTION public.procurement_notification_fill_org();

UPDATE public.procurement_notifications AS n
   SET organization_id = public.purchase_order_studio_id(n.subject_purchase_order_id)
 WHERE n.organization_id IS NULL
   AND n.subject_purchase_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_procurement_notifications_po_kind
  ON public.procurement_notifications (subject_purchase_order_id, kind)
  WHERE subject_purchase_order_id IS NOT NULL;

-- ─── 2. Read policy: co-members of the PO owner ─────────────────────────────

DROP POLICY IF EXISTS "Studio owners can read procurement notifications" ON public.procurement_notifications;
DROP POLICY IF EXISTS procurement_notifications_studio_select ON public.procurement_notifications;
CREATE POLICY procurement_notifications_studio_select ON public.procurement_notifications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = procurement_notifications.subject_purchase_order_id
        AND public.is_studio_comember(po.designer_id)
    )
  );

COMMENT ON POLICY procurement_notifications_studio_select ON public.procurement_notifications IS
  'A studio co-member of the PO owner reads the PO''s notices (00700; the 00584 pattern, replacing '
  '00151''s inert studio-owner policy). Own-row SELECT/UPDATE policies are unchanged.';

-- ─── 3. procurement_notice_recipients + the SQL writers ─────────────────────

CREATE OR REPLACE FUNCTION public.procurement_notice_recipients(p_po_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT DISTINCT recipient.user_id
  FROM public.purchase_orders AS po
  JOIN public.projects AS project ON project.id = po.project_id
  CROSS JOIN LATERAL (VALUES
    (po.created_by),
    (project.designer_id),
    (CASE WHEN po.created_by IS NULL AND project.designer_id IS NULL THEN po.designer_id END)
  ) AS recipient(user_id)
  WHERE po.id = p_po_id
    AND recipient.user_id IS NOT NULL;
$$;

COMMENT ON FUNCTION public.procurement_notice_recipients(uuid) IS
  'Who a procurement notice about a PO is addressed to (00700, d2 §M8): the PO creator and the '
  'project lead, deduped; the PO owner only when neither is set. Used by every SQL notice writer.';

REVOKE ALL ON FUNCTION public.procurement_notice_recipients(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_notice_recipients(uuid) TO service_role;

-- notify_payment_due — 00151 body; the delta is the addressee.
CREATE OR REPLACE FUNCTION notify_payment_due()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kind        procurement_notification_kind;
BEGIN
  -- Only fire when state transitions TO 'due' from a non-due state.
  IF NEW.state <> 'due' OR OLD.state = 'due' THEN
    RETURN NEW;
  END IF;

  -- Map payment kind to notification kind.
  v_kind := CASE NEW.kind
    WHEN 'deposit'   THEN 'deposit_due'::procurement_notification_kind
    WHEN 'balance'   THEN 'balance_due'::procurement_notification_kind
    WHEN 'milestone' THEN 'milestone_due'::procurement_notification_kind
    ELSE 'balance_due'::procurement_notification_kind
  END;

  -- 00700: the PO creator and the project lead, deduped. An orphaned payment
  -- row has no recipients and is silently skipped, as before.
  INSERT INTO procurement_notifications (
    user_id,
    kind,
    subject_purchase_order_id,
    subject_payment_id
  )
  SELECT recipient,
         v_kind,
         NEW.purchase_order_id,
         NEW.id
    FROM public.procurement_notice_recipients(NEW.purchase_order_id) AS recipient;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION notify_payment_due() IS
  'Trigger function: when a po_payments row transitions to state=''due'' from any non-due state, '
  'creates a procurement_notifications row for each of the PO creator and the project lead, deduped '
  '(procurement_notice_recipients, 00700). SECURITY DEFINER so the INSERT bypasses RLS — clients '
  'never insert into procurement_notifications directly.';

-- notify_damage_claim_drafted — 00151 body; the delta is the addressee.
CREATE OR REPLACE FUNCTION notify_damage_claim_drafted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_po_id       UUID;
  v_insp_id     UUID;
BEGIN
  IF NEW.state <> 'drafted' THEN
    RETURN NEW;
  END IF;

  v_insp_id := NEW.receiving_inspection_id;

  SELECT ri.purchase_order_id
    INTO v_po_id
    FROM receiving_inspections ri
   WHERE ri.id = v_insp_id;

  IF v_po_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 00700: the PO creator and the project lead, deduped.
  INSERT INTO procurement_notifications (
    user_id,
    kind,
    subject_purchase_order_id,
    subject_inspection_id
  )
  SELECT recipient,
         'damage_claim_drafted',
         v_po_id,
         v_insp_id
    FROM public.procurement_notice_recipients(v_po_id) AS recipient;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION notify_damage_claim_drafted() IS
  'Trigger function: when a damage_claims row is inserted with state=''drafted'' (the default), '
  'creates a procurement_notifications row for each of the PO creator and the project lead, deduped '
  '(procurement_notice_recipients, 00700), resolving the PO via receiving_inspections. SECURITY '
  'DEFINER so the INSERT bypasses RLS.';

-- delivery-this-week-weekly — 00189 schedule and body; the delta is the
-- addressee and a per-recipient dedupe. The body is copied verbatim into
-- supabase/tests/procurement/crons_test.sql (pg_cron cannot tick inside a
-- test transaction): change both together.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delivery-this-week-weekly') THEN
    PERFORM cron.unschedule('delivery-this-week-weekly');
  END IF;
END $$;

SELECT cron.schedule(
  'delivery-this-week-weekly',
  '0 13 * * 1',
  $$
  INSERT INTO public.procurement_notifications (user_id, kind, subject_purchase_order_id)
  SELECT recipient,
         'delivery_this_week'::public.procurement_notification_kind,
         po.id
    FROM public.purchase_orders po
   CROSS JOIN LATERAL public.procurement_notice_recipients(po.id) AS recipient
   WHERE po.confirmed_eta BETWEEN CURRENT_DATE AND CURRENT_DATE + 6
     AND po.status NOT IN ('delivered', 'cancelled')
     AND NOT EXISTS (
       SELECT 1
         FROM public.procurement_notifications n
        WHERE n.subject_purchase_order_id = po.id
          AND n.kind = 'delivery_this_week'
          AND n.user_id = recipient
          AND n.created_at > NOW() - INTERVAL '7 days'
     );
  $$
);

-- ─── 4. receiving_inspection_lines + record_project_ffe_inspection ─────────

CREATE TABLE IF NOT EXISTS public.receiving_inspection_lines (
  inspection_id      uuid        NOT NULL REFERENCES public.receiving_inspections(id) ON DELETE CASCADE,
  ffe_item_id        uuid        NOT NULL REFERENCES public.project_ffe_items(id),
  received_quantity  integer     NOT NULL CHECK (received_quantity >= 0),
  condition          text        NOT NULL CHECK (condition IN ('good', 'damaged', 'short', 'wrong')),
  noted_on_bol       boolean     NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (inspection_id, ffe_item_id)
);

CREATE INDEX IF NOT EXISTS idx_receiving_inspection_lines_item
  ON public.receiving_inspection_lines (ffe_item_id);

COMMENT ON TABLE public.receiving_inspection_lines IS
  'Per-line check-in record (00700, C-19 data): the running received count, the line''s condition '
  '(good | damaged | short | wrong) and whether the damage or shortage was noted on the bill of '
  'lading. Written only by record_project_ffe_inspection; read by co-members of the PO owner.';

ALTER TABLE public.receiving_inspection_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS receiving_inspection_lines_studio_select ON public.receiving_inspection_lines;
CREATE POLICY receiving_inspection_lines_studio_select ON public.receiving_inspection_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.receiving_inspections ri
      JOIN public.purchase_orders po ON po.id = ri.purchase_order_id
      WHERE ri.id = receiving_inspection_lines.inspection_id
        AND public.is_studio_comember(po.designer_id)
    )
  );

REVOKE ALL ON TABLE public.receiving_inspection_lines FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.receiving_inspection_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.receiving_inspection_lines TO service_role;

CREATE OR REPLACE FUNCTION public.record_project_ffe_inspection(
  p_purchase_order_id uuid,
  p_lines jsonb,
  p_outcome public.receiving_inspection_outcome,
  p_notes text DEFAULT NULL,
  p_photo_asset_ids uuid[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_result jsonb;
  v_inspection_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'record_project_ffe_inspection: authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_lines) = 0
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_lines) entry
                WHERE jsonb_typeof(entry) IS DISTINCT FROM 'object') THEN
    RAISE EXCEPTION 'record_project_ffe_inspection: lines must be a nonempty array of objects'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) entry
    WHERE jsonb_typeof(entry->'condition') IS DISTINCT FROM 'string'
       OR entry->>'condition' NOT IN ('good', 'damaged', 'short', 'wrong')
       OR (entry ? 'notedOnBol' AND jsonb_typeof(entry->'notedOnBol') <> 'boolean')
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(entry) AS key
                  WHERE key NOT IN ('selectionId', 'receivedQuantity', 'condition', 'notedOnBol'))
  ) THEN
    RAISE EXCEPTION 'record_project_ffe_inspection: each line takes selectionId, receivedQuantity, a condition of good, damaged, short or wrong, and an optional boolean notedOnBol'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_outcome = 'clean' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) entry WHERE entry->>'condition' <> 'good'
  ) THEN
    RAISE EXCEPTION 'record_project_ffe_inspection: a clean receipt requires every line in good condition'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Access, PO state, counts, photos and idempotency stay with the batch RPC.
  v_result := public.record_project_ffe_receipt_batch(
    p_purchase_order_id,
    (SELECT jsonb_agg(entry - ARRAY['condition', 'notedOnBol']) FROM jsonb_array_elements(p_lines) entry),
    p_outcome,
    p_notes,
    p_photo_asset_ids
  );
  v_inspection_id := (v_result->>'inspectionId')::uuid;

  IF EXISTS (SELECT 1 FROM public.receiving_inspection_lines WHERE inspection_id = v_inspection_id) THEN
    -- A replay of a receipt already recorded: the lines must agree.
    IF EXISTS (
      SELECT 1
      FROM (SELECT (entry->>'selectionId')::uuid AS ffe_item_id,
                   entry->>'condition' AS condition,
                   COALESCE((entry->>'notedOnBol')::boolean, false) AS noted_on_bol
              FROM jsonb_array_elements(p_lines) entry) AS requested
      FULL JOIN (SELECT ffe_item_id, condition, noted_on_bol
                   FROM public.receiving_inspection_lines
                  WHERE inspection_id = v_inspection_id) AS stored
        ON stored.ffe_item_id = requested.ffe_item_id
      WHERE requested.ffe_item_id IS NULL
         OR stored.ffe_item_id IS NULL
         OR stored.condition <> requested.condition
         OR stored.noted_on_bol <> requested.noted_on_bol
    ) THEN
      RAISE EXCEPTION 'record_project_ffe_inspection: this receipt was already recorded with different line conditions'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    INSERT INTO public.receiving_inspection_lines (
      inspection_id, ffe_item_id, received_quantity, condition, noted_on_bol
    )
    SELECT v_inspection_id,
           (entry->>'selectionId')::uuid,
           (entry->>'receivedQuantity')::integer,
           entry->>'condition',
           COALESCE((entry->>'notedOnBol')::boolean, false)
      FROM jsonb_array_elements(p_lines) entry;
  END IF;

  RETURN v_result || jsonb_build_object('lines', (
    SELECT jsonb_agg(line || jsonb_build_object(
             'condition', recorded.condition,
             'notedOnBol', recorded.noted_on_bol
           ) ORDER BY line->>'selectionId')
      FROM jsonb_array_elements(v_result->'lines') AS line
      LEFT JOIN public.receiving_inspection_lines AS recorded
        ON recorded.inspection_id = v_inspection_id
       AND recorded.ffe_item_id = (line->>'selectionId')::uuid
  ));
END;
$$;

COMMENT ON FUNCTION public.record_project_ffe_inspection(uuid, jsonb, public.receiving_inspection_outcome, text, uuid[]) IS
  'Check in a delivery line by line (00700, C-19): each line carries selectionId, receivedQuantity, '
  'condition (good | damaged | short | wrong) and an optional notedOnBol. Delegates the receipt to '
  'record_project_ffe_receipt_batch (access, PO state, counts, photos, idempotency), then records '
  'receiving_inspection_lines. A clean outcome requires every line good; a replay must match the '
  'stored lines.';

REVOKE ALL ON FUNCTION public.record_project_ffe_inspection(uuid, jsonb, public.receiving_inspection_outcome, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_project_ffe_inspection(uuid, jsonb, public.receiving_inspection_outcome, text, uuid[]) TO authenticated;

-- ─── 5. procurement_claim_deadline ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.procurement_claim_deadline(p_po_id uuid)
RETURNS TABLE (
  delivered_on            date,
  claims_window_days      integer,
  vendor_deadline         date,
  concealed_carrier_days  integer,
  carrier_deadline        date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT po.delivered_date,
         windows.claims_window_days,
         po.delivered_date + windows.claims_window_days,
         (windows.inspection_window_days->>'concealed_carrier')::integer,
         po.delivered_date + (windows.inspection_window_days->>'concealed_carrier')::integer
  FROM public.purchase_orders AS po
  JOIN public.projects AS project ON project.id = po.project_id
  CROSS JOIN LATERAL public.studio_vendor_claim_windows(
    public.purchase_order_studio_id(po.id), po.vendor_id
  ) AS windows
  WHERE po.id = p_po_id
    -- purchase_orders_studio_read's predicate; a call without a user
    -- (pg_cron, service_role) reads every PO, as RLS would let it.
    AND ((select auth.uid()) IS NULL OR public.is_studio_comember(project.designer_id));
$$;

COMMENT ON FUNCTION public.procurement_claim_deadline(uuid) IS
  'The claim clock for a purchase order (00700, C-20): delivered_on plus the studio vendor '
  'account''s claims window (vendor_deadline) and concealed-carrier window (carrier_deadline), read '
  'through studio_vendor_claim_windows (00696, R-PB9 defaults 3 and 5 days). Deadlines are NULL '
  'until the PO is delivered. SECURITY DEFINER (the studio lookup is closed to PostgREST roles), '
  'gated by purchase_orders_studio_read''s predicate: no row for a PO the caller cannot read.';

REVOKE ALL ON FUNCTION public.procurement_claim_deadline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.procurement_claim_deadline(uuid) TO authenticated, service_role;

-- ─── 6. sweep_procurement_clocks + procurement-clocks-daily ─────────────────

CREATE OR REPLACE FUNCTION public.sweep_procurement_clocks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_run_id        bigint;
  v_claim_window  int := 0;
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

    -- TODO(Phase 2): ack_discrepancy — unresolved acknowledgment lines.
    -- TODO(Phase 2): quote_expiring — vendor quotes nearing expiry.
    -- TODO(Phase 2): cfa_reserve_expiring — submittal reserves expiring.
    -- TODO(Phase 2): memo_return_due — sample/memo return-by dates.
    -- TODO(Phase 2): backorder_reported — open backorder exceptions.
  EXCEPTION WHEN OTHERS THEN
    -- No re-RAISE (the 00300 / 00574 / 00630 idiom): the failed row persists
    -- as the failure record and the guarded block rolls back to its savepoint.
    UPDATE public.job_runs
       SET status = 'failed', finished_at = now(), error = SQLERRM,
           detail = jsonb_build_object('claim_window_closing', v_claim_window)
     WHERE id = v_run_id;
    RETURN jsonb_build_object('error', SQLERRM);
  END;

  v_detail := jsonb_build_object('claim_window_closing', v_claim_window);

  UPDATE public.job_runs
     SET status = 'succeeded', finished_at = now(), detail = v_detail
   WHERE id = v_run_id;

  RETURN v_detail;
END;
$$;

COMMENT ON FUNCTION public.sweep_procurement_clocks() IS
  'procurement-clocks-daily (00700, d2 §M8): writes deduped procurement notices from procurement '
  'clocks. Phase 1 writes claim_window_closing, the day before the vendor claim deadline, for a '
  'delivered PO with a drafted damage claim, to each of the PO creator and the project lead. Phase 2 '
  'fills the other kinds. Advisory xact lock, one job_runs row per run, skipped on contention. '
  'service_role only.';

REVOKE ALL ON FUNCTION public.sweep_procurement_clocks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_procurement_clocks() TO service_role;

-- The 00574 / 00630 idiom: the unschedule is guarded, the schedule is not
-- wrapped, so a stack that cannot schedule the job fails the migration.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'procurement-clocks-daily') THEN
    PERFORM cron.unschedule('procurement-clocks-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'procurement-clocks-daily',
  '10 13 * * *',
  $$SELECT public.sweep_procurement_clocks();$$
);
