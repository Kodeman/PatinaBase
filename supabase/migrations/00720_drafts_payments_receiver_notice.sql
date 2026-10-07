-- ═══════════════════════════════════════════════════════════════════════════
-- 00720 — Rider payments, stalled draft sends, job-site receiver notice
--         (US-17 T3; SQ-451: G4, G5, G7)
-- ═══════════════════════════════════════════════════════════════════════════
-- Each redefined function is its live head's body, verbatim, with only the
-- change named here. CREATE OR REPLACE keeps every existing ACL; the new
-- functions get explicit REVOKE/GRANTs.
--
-- G4  update_po_payment_schedule (00695) refused once ANY live
--     vendor_payments row existed, including a rider paid to a carrier,
--     receiver or other payee (00718 M2) and a refund or credit (00708). It
--     now locks on a payment to the vendor only: kind = 'payment' AND
--     payee = 'vendor', resolve_ack_line's predicate (00718 M2c).
--
-- G5  A draft left in 'sending' (procurement-draft-send keeps the claim when
--     the email went but mark_procurement_draft_sent failed; a crash between
--     claim and release strands it too) could not be freed by anyone but
--     the claimer. updated_at is the claim time: the draft refuses edits
--     while it is sending. A claim older than 10 minutes is stale.
--     (a) notification_log_ref_type_chk (00635) admits 'procurement_draft'.
--         procurement-draft-send logs ref { procurement_draft, id }; the
--         check refused that insert, so no draft send was ever logged.
--     (b) A send is on record when a notification_log row for the draft
--         exists whose status is not 'failed' or 'suppressed' (send-email
--         writes those when the email did not go).
--     (c) release_procurement_draft_claim (00718) also admits a caller who
--         can read the draft once the claim is stale, and refuses
--         draft_send_on_record (23514) for every caller when a send is on
--         record.
--     (d) complete_procurement_draft_send: a stale sending draft with a send
--         on record → sent, sent_at = the log row's created_at, message_id
--         = its provider_id, sent_by stays the claimer. Same callers as (c).
--     (e) sweep_procurement_clocks (00712) settles stale sending drafts:
--         sent when a send is on record, else back to awaiting_review with
--         sent_by cleared. Both count as draft_send_stalled.
--
-- G7  compose_receiver_inbound_draft (00718) returns NULL when the PO ships
--     to the job site (no ship_to_location_id) instead of raising; the
--     access check still raises.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql
-- (python3 scripts/generate-legacy-grants.py).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── G4. Only a vendor payment locks the schedule ──────────────────────────

CREATE OR REPLACE FUNCTION public.update_po_payment_schedule(p_po_id uuid, p_request jsonb)
RETURNS SETOF public.po_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_req     jsonb := COALESCE(p_request, '{}'::jsonb);
  v_po      public.purchase_orders%ROWTYPE;
  v_entry   jsonb;
  v_id      uuid;
  v_sched   public.po_payments%ROWTYPE;
  v_amount  numeric;
  v_label   text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'update_po_payment_schedule: not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' OR (v_req - 'payments') <> '{}'::jsonb
     OR jsonb_typeof(v_req->'payments') <> 'array'
     OR jsonb_array_length(v_req->'payments') = 0 THEN
    RAISE EXCEPTION 'update_po_payment_schedule: request must be { payments: [ … ] } with at least one row'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'update_po_payment_schedule: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_po.is_patina_catalog THEN
    RAISE EXCEPTION 'update_po_payment_schedule: purchase order % is on the Patina catalog lane; its schedule follows Stripe', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00720 (G4): a payment to the vendor; a rider paid to a carrier or a
  -- receiver, and a refund or credit, are not.
  IF EXISTS (
    SELECT 1 FROM public.vendor_payments
    WHERE purchase_order_id = p_po_id AND voided_at IS NULL
      AND kind = 'payment' AND payee = 'vendor'
  ) THEN
    RAISE EXCEPTION 'update_po_payment_schedule: a payment is already recorded on purchase order %; the schedule changes through a change order', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(v_req->'payments') LOOP
    IF jsonb_typeof(v_entry) <> 'object'
       OR (v_entry - ARRAY['id', 'amountCents', 'dueDate', 'label']) <> '{}'::jsonb THEN
      RAISE EXCEPTION 'update_po_payment_schedule: each row is { id, amountCents?, dueDate?, label? }'
        USING ERRCODE = 'check_violation';
    END IF;
    v_id := NULLIF(v_entry->>'id', '')::uuid;
    SELECT * INTO v_sched FROM public.po_payments
     WHERE id = v_id AND purchase_order_id = p_po_id
       FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'update_po_payment_schedule: payment row % is not on purchase order %', v_id, p_po_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_sched.stripe_checkout_session_id IS NOT NULL OR v_sched.stripe_payment_intent_id IS NOT NULL THEN
      RAISE EXCEPTION 'update_po_payment_schedule: payment row % is on the Stripe rail', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_sched.state IN ('paid', 'refunded') THEN
      RAISE EXCEPTION 'update_po_payment_schedule: payment row % is already %', v_id, v_sched.state
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_entry ? 'amountCents' THEN
      IF jsonb_typeof(v_entry->'amountCents') <> 'number' THEN
        RAISE EXCEPTION 'update_po_payment_schedule: amountCents must be a number of cents'
          USING ERRCODE = 'check_violation';
      END IF;
      v_amount := (v_entry->>'amountCents')::numeric;
      IF v_amount < 0 OR v_amount <> trunc(v_amount) OR v_amount > 2147483647 THEN
        RAISE EXCEPTION 'update_po_payment_schedule: amountCents must be a whole, non-negative number of cents'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    v_label := NULLIF(btrim(v_entry->>'label'), '');
    IF v_label IS NOT NULL AND length(v_label) > 120 THEN
      RAISE EXCEPTION 'update_po_payment_schedule: label is longer than 120 characters'
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.po_payments
       SET amount_cents = CASE WHEN v_entry ? 'amountCents' THEN v_amount::integer ELSE amount_cents END,
           due_date     = CASE WHEN v_entry ? 'dueDate' THEN NULLIF(v_entry->>'dueDate', '')::date ELSE due_date END,
           label        = CASE WHEN v_entry ? 'label' THEN v_label ELSE label END
     WHERE id = v_id;
  END LOOP;

  RETURN QUERY
    SELECT * FROM public.po_payments
     WHERE purchase_order_id = p_po_id
     ORDER BY sort_order, created_at;
END;
$$;

-- ─── G5a. A draft send is logged ───────────────────────────────────────────

ALTER TABLE public.notification_log
  DROP CONSTRAINT IF EXISTS notification_log_ref_type_chk;

ALTER TABLE public.notification_log
  ADD CONSTRAINT notification_log_ref_type_chk
  CHECK (ref_type IS NULL OR ref_type IN
         ('invoice', 'client_invitation', 'client_review', 'proposal',
          'studio_contact_channel', 'procurement_draft'));

COMMENT ON COLUMN public.notification_log.ref_type IS
  'The kind of business record this notification is about: invoice, '
  'client_invitation, client_review, proposal (00591), or '
  'studio_contact_channel — the typed reach channel a letter to a person with '
  'no Patina account was addressed to (00635, CRM-12) — or procurement_draft, '
  'the vendor or receiver letter procurement-draft-send sent (00720). The '
  'account-less kinds are what earn such a letter a log row at all: '
  'sendCompliantEmail logs on (user_id OR ref), and an account-less recipient '
  'has no user_id.';

-- ─── G5b. A send on record ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._procurement_draft_send_on_record(p_draft_id uuid)
RETURNS public.notification_log
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT l.* FROM public.notification_log AS l
   WHERE l.ref_type = 'procurement_draft' AND l.ref_id = p_draft_id
     AND l.status NOT IN ('failed', 'suppressed')
   ORDER BY l.created_at
   LIMIT 1;
$$;

COMMENT ON FUNCTION public._procurement_draft_send_on_record(uuid) IS
  'The first notification_log row for a procurement draft whose email may have gone (status not failed '
  'or suppressed), or NULL (00720, G5).';

REVOKE ALL ON FUNCTION public._procurement_draft_send_on_record(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._procurement_draft_send_on_record(uuid) TO service_role;

-- ─── G5c. A stale claim can be put back by the studio ──────────────────────

CREATE OR REPLACE FUNCTION public.release_procurement_draft_claim(p_draft_id uuid)
RETURNS public.procurement_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_draft public.procurement_drafts%ROWTYPE;
BEGIN
  SELECT * INTO v_draft FROM public.procurement_drafts WHERE id = p_draft_id FOR UPDATE;
  -- The claimer (or the service path) puts a claim back; 00720 (G5), so does
  -- anyone who can read the draft once the claim is stale.
  IF NOT FOUND OR NOT (
    v_uid IS NULL
    OR v_draft.sent_by IS NOT DISTINCT FROM v_uid
    OR (v_draft.updated_at < now() - interval '10 minutes'
        AND COALESCE(public._can_read_procurement_draft(v_draft), false))
  ) THEN
    RAISE EXCEPTION 'release_procurement_draft_claim: draft % not found or access denied', p_draft_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_draft.status <> 'sending' THEN
    RAISE EXCEPTION 'release_procurement_draft_claim: draft % is %, not sending', p_draft_id, v_draft.status
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00720 (G5): an email that went is never put back to be sent again.
  IF (public._procurement_draft_send_on_record(p_draft_id)).id IS NOT NULL THEN
    RAISE EXCEPTION 'draft_send_on_record: draft % was sent; complete it instead', p_draft_id
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.procurement_drafts SET status = 'awaiting_review', sent_by = NULL
  WHERE id = p_draft_id
  RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;

COMMENT ON FUNCTION public.release_procurement_draft_claim(uuid) IS
  'sending → awaiting_review when the email did not go (00718, D1). The claimer, service_role, or '
  '(00720, G5) anyone who can read the draft once the claim is 10 minutes old. Refuses '
  'draft_send_on_record (23514) when a send is on record: complete_procurement_draft_send instead.';

-- ─── G5d. Complete a stalled send ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.complete_procurement_draft_send(p_draft_id uuid)
RETURNS public.procurement_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_draft public.procurement_drafts%ROWTYPE;
  v_log   public.notification_log%ROWTYPE;
BEGIN
  SELECT * INTO v_draft FROM public.procurement_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND OR NOT (
    v_uid IS NULL
    OR v_draft.sent_by IS NOT DISTINCT FROM v_uid
    OR COALESCE(public._can_read_procurement_draft(v_draft), false)
  ) THEN
    RAISE EXCEPTION 'complete_procurement_draft_send: draft % not found or access denied', p_draft_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_draft.status <> 'sending' OR v_draft.updated_at >= now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'complete_procurement_draft_send: draft % is not a stalled send', p_draft_id
      USING ERRCODE = 'check_violation';
  END IF;
  v_log := public._procurement_draft_send_on_record(p_draft_id);
  IF v_log.id IS NULL THEN
    RAISE EXCEPTION 'draft_send_not_on_record: no send is on record for draft %', p_draft_id
      USING ERRCODE = 'check_violation';
  END IF;
  -- mark_procurement_draft_sent's end state; the claimer stays the sender.
  UPDATE public.procurement_drafts SET
    status = 'sent', sent_at = v_log.created_at,
    message_id = NULLIF(btrim(COALESCE(v_log.provider_id, '')), '')
  WHERE id = p_draft_id
  RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;

COMMENT ON FUNCTION public.complete_procurement_draft_send(uuid) IS
  'sending → sent for a claim 10 minutes old whose email is on record in notification_log (00720, G5): '
  'sent_at is the log row''s created_at, sent_by stays the claimer. The claimer, service_role, or anyone '
  'who can read the draft. Refuses draft_send_not_on_record (23514) when no send is on record.';

REVOKE ALL ON FUNCTION public.complete_procurement_draft_send(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_procurement_draft_send(uuid) TO authenticated, service_role;

-- ─── G5e. sweep_procurement_clocks settles stalled sends ───────────────────
-- 00712's body, verbatim, with the draft_send_stalled scan added. The cron
-- job (procurement-clocks-daily, 00700) calls this function by name.

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
  v_stalled       int := 0;
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

    -- draft_send_stalled (00720, G5): a draft claimed for sending more than
    -- 10 minutes ago. With a send on record it is sent (sent_at the log
    -- row's time, sent_by the claimer); without one it goes back to
    -- awaiting_review, unclaimed.
    WITH stalled AS (
      SELECT d.id, rec.id AS log_id, rec.created_at AS log_at, rec.provider_id
        FROM public.procurement_drafts AS d
        LEFT JOIN LATERAL public._procurement_draft_send_on_record(d.id) AS rec ON true
       WHERE d.status = 'sending'
         AND d.updated_at < now() - interval '10 minutes'
         FOR UPDATE OF d SKIP LOCKED
    )
    UPDATE public.procurement_drafts AS d
       SET status     = CASE WHEN s.log_id IS NULL THEN 'awaiting_review' ELSE 'sent' END,
           sent_by    = CASE WHEN s.log_id IS NULL THEN NULL ELSE d.sent_by END,
           sent_at    = CASE WHEN s.log_id IS NULL THEN d.sent_at ELSE s.log_at END,
           message_id = CASE WHEN s.log_id IS NULL THEN d.message_id
                             ELSE NULLIF(btrim(COALESCE(s.provider_id, '')), '') END
      FROM stalled AS s
     WHERE d.id = s.id;
    GET DIAGNOSTICS v_stalled = ROW_COUNT;
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
                                       'memo_return_due', v_memo,
                                       'draft_send_stalled', v_stalled)
     WHERE id = v_run_id;
    RETURN jsonb_build_object('error', SQLERRM);
  END;

  v_detail := jsonb_build_object('claim_window_closing', v_claim_window,
                                 'ack_discrepancy', v_ack,
                                 'backorder_reported', v_backorder,
                                 'quote_expiring', v_quote,
                                 'cfa_reserve_expiring', v_cfa,
                                 'memo_return_due', v_memo,
                                 'draft_send_stalled', v_stalled);

  UPDATE public.job_runs
     SET status = 'succeeded', finished_at = now(), detail = v_detail
   WHERE id = v_run_id;

  RETURN v_detail;
END;
$$;

COMMENT ON FUNCTION public.sweep_procurement_clocks() IS
  'procurement-clocks-daily (00700, d2 §M8; Phase 2 scans 00708, 00712; 00720): writes deduped procurement '
  'notices from procurement clocks. claim_window_closing (00700); ack_discrepancy and backorder_reported, '
  'once per open exception and recipient; quote_expiring, the day before a live quote''s valid_until or '
  'on it while a line is unordered (R6 open: valid_until only); cfa_reserve_expiring, the day before a '
  'pending submittal''s reserve_expires_on or on it; memo_return_due, return_by within three days on a '
  'sample not returned. draft_send_stalled (00720) settles drafts claimed for sending over 10 minutes '
  'ago: sent when a send is on record, else back to awaiting_review. Advisory xact lock, one job_runs '
  'row per run, skipped on contention. service_role only.';

-- ─── G7. A job-site shipment composes no receiver notice ───────────────────

-- 00718 body: the gate, then the shared composer with the shipment's facts.
CREATE OR REPLACE FUNCTION public.compose_receiver_inbound_draft(p_shipment_id uuid)
RETURNS public.procurement_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_shipment public.po_shipments%ROWTYPE;
  v_po       public.purchase_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_shipment FROM public.po_shipments WHERE id = p_shipment_id;
  IF FOUND THEN
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = v_shipment.purchase_order_id;
  END IF;
  IF v_po.id IS NULL OR NOT public.can_send_purchase_order(v_po.id) THEN
    RAISE EXCEPTION 'compose_receiver_inbound_draft: shipment % not found or access denied', p_shipment_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 00720 (G7): a PO that ships to the job site has no receiver to tell.
  IF v_po.ship_to_location_id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN public._compose_receiver_inbound_draft(
    v_po.id, v_shipment.id, v_shipment.shipped_on, v_shipment.current_eta, v_shipment.carrier, v_shipment.tracking);
END;
$$;

COMMENT ON FUNCTION public.compose_receiver_inbound_draft(uuid) IS
  'Composes the inbound notice to the PO''s receiver for a shipment (00706, C-28/C-26): sidemark, '
  'ship and ETA dates, carrier, pieces. Recipient is the receiving location''s contact card. Lands '
  'awaiting_review. Gate: can_send_purchase_order. Returns NULL when the PO ships to the job site '
  '(no ship_to_location_id; 00720, G7).';
