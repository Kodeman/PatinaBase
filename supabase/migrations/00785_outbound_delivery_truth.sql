-- ═══════════════════════════════════════════════════════════════════════════
-- 00785 — Outbound delivery truth and once-only side effects (US-31, SQ-905 F19/F20/F21)
-- A draft has three delivery states: not attempted; attempted with the outcome
-- unknown (send_attempted_at set, delivered_at null); delivered (delivered_at
-- set). Only a recorded provider acceptance sets delivered_at. An attempt is
-- never delivery: 00784's promotion of a stale attempted push to delivered is
-- removed from claim_outbound_draft_finalize.
-- F21: a provider rejection clears the attempt and hands the draft back to
-- review (record_outbound_draft_send_rejected, last_send_outcome 'rejected').
-- An attempt whose outcome never came back is handed back to review once its
-- claim is stale, marked last_send_outcome 'unknown', by the next claim or the
-- expire-outbound-drafts sweep. It is never pushed again and never marked sent
-- here: the studio decides whether to send it again.
-- F19: after_send_done_at records that the kind's after-send hook ran, set by
-- the finalizer that holds the finalize claim. A later finalize skips the hook
-- and only re-attempts the mark. notify_client_attention enqueues a keyed call
-- (p_metadata.idempotency_key, one outbound draft) once.
-- Bodies are copied from the live heads: claim and finalize claim from 00784,
-- delivery record from 00782, expiry sweep from 00775, attention from 00777.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.outbound_drafts
  ADD COLUMN IF NOT EXISTS after_send_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_send_outcome text;
ALTER TABLE public.outbound_drafts DROP CONSTRAINT IF EXISTS outbound_drafts_last_send_outcome_ck;
ALTER TABLE public.outbound_drafts ADD CONSTRAINT outbound_drafts_last_send_outcome_ck
  CHECK (last_send_outcome IS NULL OR last_send_outcome IN ('rejected', 'unknown'));
COMMENT ON COLUMN public.outbound_drafts.last_send_outcome IS
  'Why the last provider attempt did not deliver: rejected (the provider refused it) or unknown (no answer came back; it may have gone out). Cleared when a delivery is recorded.';
COMMENT ON COLUMN public.outbound_drafts.after_send_done_at IS
  'When the kind''s after-send hook ran. A finalize retry skips the hook once this is set.';

CREATE OR REPLACE FUNCTION public.claim_outbound_draft_for_send(p_id uuid)
RETURNS public.outbound_drafts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_uid uuid := auth.uid(); v_draft public.outbound_drafts%ROWTYPE;
BEGIN
  SELECT * INTO v_draft FROM public.outbound_drafts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT (v_uid IS NULL OR COALESCE(public._can_access_outbound_draft(v_draft), false)) THEN
    RAISE EXCEPTION 'claim_outbound_draft_for_send: draft not found or access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 00782: the provider already has this message. Finalize it; never send it again.
  IF v_draft.delivered_at IS NOT NULL THEN
    RAISE EXCEPTION 'claim_outbound_draft_for_send: draft was already delivered; finalize it' USING ERRCODE = 'check_violation';
  END IF;
  -- 00785: a stale claim whose push was attempted has an unknown outcome. Hand it
  -- back to review marked 'unknown'; never push it again or mark it sent here.
  IF v_draft.status = 'sending' AND v_draft.send_attempted_at IS NOT NULL
     AND v_draft.claimed_at < now() - interval '10 minutes' THEN
    UPDATE public.outbound_drafts SET status = 'awaiting_review', claimed_at = NULL, sent_by = NULL,
      send_attempted_at = NULL, last_send_outcome = 'unknown'
     WHERE id = p_id RETURNING * INTO v_draft;
    RETURN v_draft;
  END IF;
  IF v_draft.expires_at IS NOT NULL AND v_draft.expires_at <= now() THEN
    IF v_draft.status = 'awaiting_review' OR
       (v_draft.status = 'sending' AND v_draft.claimed_at < now() - interval '10 minutes') THEN
      UPDATE public.outbound_drafts SET status = 'expired', claimed_at = NULL, sent_by = NULL
       WHERE id = p_id RETURNING * INTO v_draft;
    ELSE
      v_draft.status := 'expired';
    END IF;
    RETURN v_draft;
  END IF;
  IF NOT (v_draft.status = 'awaiting_review' OR
          (v_draft.status = 'sending' AND v_draft.claimed_at < now() - interval '10 minutes')) THEN
    RAISE EXCEPTION 'claim_outbound_draft_for_send: draft is % or has a fresh claim', v_draft.status USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.outbound_drafts SET status = 'sending', claimed_at = now(), sent_by = v_uid
   WHERE id = p_id RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;
-- Service role only, as 00786 (SQ-927, F22) sets it: this re-grant must never
-- reopen the claim to authenticated, whichever of 00785/00786 applies last.
REVOKE ALL ON FUNCTION public.claim_outbound_draft_for_send(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbound_draft_for_send(uuid) TO service_role;

-- F21: the provider answered and refused the attempt, so nothing went out. The
-- attempt is cleared and the draft goes back to review.
CREATE OR REPLACE FUNCTION public.record_outbound_draft_send_rejected(p_id uuid)
RETURNS public.outbound_drafts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_draft public.outbound_drafts%ROWTYPE;
BEGIN
  SELECT * INTO v_draft FROM public.outbound_drafts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'record_outbound_draft_send_rejected: draft not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_draft.status <> 'sending' OR v_draft.delivered_at IS NOT NULL OR v_draft.send_attempted_at IS NULL THEN
    RAISE EXCEPTION 'record_outbound_draft_send_rejected: draft is % and has no open provider attempt', v_draft.status USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.outbound_drafts SET status = 'awaiting_review', claimed_at = NULL, sent_by = NULL,
    send_attempted_at = NULL, last_send_outcome = 'rejected'
   WHERE id = p_id RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;
REVOKE ALL ON FUNCTION public.record_outbound_draft_send_rejected(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_outbound_draft_send_rejected(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.record_outbound_draft_delivery(p_id uuid, p_message_id text)
RETURNS public.outbound_drafts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_draft public.outbound_drafts%ROWTYPE;
BEGIN
  SELECT * INTO v_draft FROM public.outbound_drafts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'record_outbound_draft_delivery: draft not found' USING ERRCODE = 'no_data_found'; END IF;
  -- Idempotent: the first recorded delivery stands.
  IF v_draft.delivered_at IS NOT NULL THEN RETURN v_draft; END IF;
  IF v_draft.status <> 'sending' THEN RAISE EXCEPTION 'record_outbound_draft_delivery: draft is %, not sending', v_draft.status USING ERRCODE = 'check_violation'; END IF;
  -- 00785: the outcome is known, so an earlier 'rejected' or 'unknown' no longer applies.
  UPDATE public.outbound_drafts SET delivered_at = now(), delivery_message_id = NULLIF(btrim(p_message_id), ''),
    last_send_outcome = NULL
   WHERE id = p_id RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;
REVOKE ALL ON FUNCTION public.record_outbound_draft_delivery(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_outbound_draft_delivery(uuid, text) TO service_role;

-- Returns the draft to the one caller that wins the finalize claim. A 'sent'
-- draft comes back unchanged: the caller reports it and runs nothing.
CREATE OR REPLACE FUNCTION public.claim_outbound_draft_finalize(p_id uuid)
RETURNS public.outbound_drafts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_draft public.outbound_drafts%ROWTYPE;
BEGIN
  SELECT * INTO v_draft FROM public.outbound_drafts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'claim_outbound_draft_finalize: draft not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_draft.status = 'sent' THEN RETURN v_draft; END IF;
  -- 00785: only a recorded provider acceptance is finalized. An attempt is never delivery.
  IF v_draft.status <> 'sending' OR v_draft.delivered_at IS NULL THEN
    RAISE EXCEPTION 'claim_outbound_draft_finalize: draft is % and was not delivered', v_draft.status USING ERRCODE = 'check_violation';
  END IF;
  IF v_draft.finalizing_at IS NOT NULL AND v_draft.finalizing_at >= now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'claim_outbound_draft_finalize: draft is already being finalized' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.outbound_drafts SET finalizing_at = now()
   WHERE id = p_id RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_outbound_draft_finalize(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbound_draft_finalize(uuid) TO service_role;

-- F19: the finalizer holding the claim (p_finalizing_at is its token) records
-- that the after-send hook ran, so a retry only re-attempts the mark.
CREATE OR REPLACE FUNCTION public.record_outbound_draft_after_send(p_id uuid, p_finalizing_at timestamptz)
RETURNS public.outbound_drafts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_draft public.outbound_drafts%ROWTYPE;
BEGIN
  SELECT * INTO v_draft FROM public.outbound_drafts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'record_outbound_draft_after_send: draft not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_draft.status <> 'sending' OR v_draft.finalizing_at IS DISTINCT FROM p_finalizing_at THEN
    RAISE EXCEPTION 'record_outbound_draft_after_send: draft is % and the caller does not hold its finalize claim', v_draft.status USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.outbound_drafts SET after_send_done_at = COALESCE(after_send_done_at, now())
   WHERE id = p_id RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;
REVOKE ALL ON FUNCTION public.record_outbound_draft_after_send(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_outbound_draft_after_send(uuid, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.expire_outbound_drafts()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_count integer;
BEGIN
  -- 00785: a stale push attempt with no recorded delivery has an unknown outcome.
  -- It goes back to review marked 'unknown'; it is never resent or marked sent.
  UPDATE public.outbound_drafts SET status = 'awaiting_review', claimed_at = NULL, sent_by = NULL,
    send_attempted_at = NULL, last_send_outcome = 'unknown'
   WHERE status = 'sending' AND send_attempted_at IS NOT NULL AND delivered_at IS NULL
     AND claimed_at < now() - interval '10 minutes';
  UPDATE public.outbound_drafts SET status = 'expired'
   WHERE status = 'awaiting_review' AND expires_at IS NOT NULL AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_outbound_drafts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_outbound_drafts() TO service_role;

CREATE OR REPLACE FUNCTION public.notify_client_attention(
  p_user_id     uuid,
  p_entity_type text,
  p_entity_id   uuid,
  p_title       text,
  p_body        text,
  p_metadata    jsonb DEFAULT '{}'::jsonb,
  p_authority   jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_path       text;
  v_meta       jsonb;
  v_type       text;
  v_in_app     uuid;
  v_push       uuid;
  v_is_receipt boolean;
  v_deliver_at timestamptz;
  v_key        text;
BEGIN
  -- A notification helper must never abort its caller's transaction. Every
  -- rejection here is a quiet NULL, not an exception.
  IF p_user_id IS NULL OR p_entity_id IS NULL OR p_title IS NULL THEN
    RETURN NULL;
  END IF;

  v_is_receipt := COALESCE(p_metadata->>'kind', '') = 'decision_receipt';

  -- 00785: a keyed call (one outbound draft) enqueues its attention once. A
  -- repeat returns the first push row and writes nothing.
  v_key := NULLIF(btrim(p_metadata->>'idempotency_key'), '');
  IF v_key IS NOT NULL AND NOT v_is_receipt THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('notify_client_attention:' || v_key, 0));
    SELECT n.id INTO v_push
      FROM public.notification_log n
     WHERE n.user_id = p_user_id
       AND n.channel = 'push'
       AND n.template_id = 'client-attention-push'
       AND n.metadata->>'idempotency_key' = v_key
     LIMIT 1;
    IF v_push IS NOT NULL THEN
      RETURN v_push;
    END IF;
  END IF;

  v_path := CASE p_entity_type
              WHEN 'proposal' THEN '/proposals/'
              WHEN 'invoice'  THEN '/invoices/'
              WHEN 'decision' THEN '/decisions/'
            END;
  IF v_path IS NULL THEN
    RAISE WARNING 'notify_client_attention: unroutable entity_type %', p_entity_type;
    RETURN NULL;
  END IF;
  v_path := v_path || p_entity_id::text;
  v_type := p_entity_type || '_attention';

  v_meta := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'entity_type', p_entity_type,
    'entity_id',   p_entity_id::text,
    'title',       p_title,
    'body',        COALESCE(p_body, ''),
    'message',     COALESCE(p_body, ''),
    'deep_link',   v_path,
    'url',         v_path
  );

  SELECT n.id INTO v_in_app
    FROM public.notification_log n
   WHERE n.user_id = p_user_id
     AND n.channel = 'in_app'
     AND n.opened_at IS NULL
     AND n.metadata->>'entity_type' = p_entity_type
     AND n.metadata->>'entity_id'   = p_entity_id::text
   ORDER BY n.created_at DESC
   LIMIT 1;

  IF v_in_app IS NOT NULL THEN
    UPDATE public.notification_log
       SET metadata  = metadata || v_meta,
           type      = v_type,
           status    = CASE WHEN v_is_receipt THEN 'opened' ELSE 'delivered' END
                         ::public.notification_status,
           opened_at = CASE WHEN v_is_receipt THEN now() ELSE opened_at END,
           sent_at   = now()
     WHERE id = v_in_app;
  ELSE
    INSERT INTO public.notification_log
      (user_id, type, channel, status, template_id, metadata, sent_at, opened_at)
    VALUES
      (p_user_id, v_type, 'in_app',
       (CASE WHEN v_is_receipt THEN 'opened' ELSE 'delivered' END)
         ::public.notification_status,
       'client-attention', v_meta, now(),
       CASE WHEN v_is_receipt THEN now() END)
    RETURNING id INTO v_in_app;
  END IF;

  IF v_is_receipt THEN
    RETURN NULL;
  END IF;

  v_deliver_at := public.push_deliver_after(p_user_id, now());

  INSERT INTO public.notification_log
    (user_id, type, channel, status, template_id, metadata, deliver_after, send_authority)
  VALUES
    (p_user_id, v_type, 'push', 'queued', 'client-attention-push', v_meta,
     v_deliver_at, p_authority)
  RETURNING id INTO v_push;

  IF v_deliver_at IS NOT NULL THEN
    RETURN v_push;
  END IF;

  BEGIN
    PERFORM public.invoke_edge_function(
      'apns-send',
      jsonb_build_object(
        'user_id',             p_user_id,
        'title',               p_title,
        'body',                COALESCE(p_body, ''),
        'entity_type',         p_entity_type,
        'entity_id',           p_entity_id::text,
        'notification_log_id', v_push,
        'authority',           p_authority
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_client_attention: apns dispatch failed for % %: %',
      p_entity_type, p_entity_id, sqlerrm;
  END;

  RETURN v_push;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_client_attention(uuid, text, uuid, text, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_client_attention(uuid, text, uuid, text, text, jsonb, jsonb)
  TO service_role;
COMMENT ON FUNCTION public.notify_client_attention(uuid, text, uuid, text, text, jsonb, jsonb) IS
  'Writes client attention rows and carries typed send authority to apns-send. p_authority defaults to NULL only as a transition bridge for old callers; apns-send refuses/logs unlabelled client pushes. Authority is stored on the push notification_log row so held pushes preserve it through release. decision_receipt remains an in-app-only acknowledgement. A p_metadata.idempotency_key (00785, e.g. one outbound draft) enqueues at most one push per user and key; a repeat returns the first push row.';
