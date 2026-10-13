-- ═══════════════════════════════════════════════════════════════════════════
-- 00784 — Outbound send attempt guard and single finalizer (US-31, SQ-905 F15/F17)
-- Push has no provider idempotency key. outbound-send stamps send_attempted_at
-- before it calls APNs, and from then on the draft is never released to review
-- or reclaimed for a second push. Once its claim is stale, an attempted push
-- with no recorded delivery is finalized as delivered-unknown, never resent.
-- Email (Resend idempotency key) and SMS (dedupe key) are replay-safe and are
-- not stamped.
-- Finalizing takes a per-draft claim (finalizing_at), so the after-send hook
-- runs once even when the sweep, a Retry and a batch finalize together. A
-- finalizer that fails hands its claim back; a crashed one goes stale after
-- 10 minutes. The order stays: record the delivery, run afterSend, mark sent.
-- The claim and release bodies are copied from 00782, then guarded.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.outbound_drafts
  ADD COLUMN IF NOT EXISTS send_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalizing_at timestamptz;

CREATE OR REPLACE FUNCTION public.record_outbound_draft_send_attempt(p_id uuid)
RETURNS public.outbound_drafts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_draft public.outbound_drafts%ROWTYPE;
BEGIN
  SELECT * INTO v_draft FROM public.outbound_drafts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'record_outbound_draft_send_attempt: draft not found' USING ERRCODE = 'no_data_found'; END IF;
  -- One attempt per claim: a second stamp means another sender already reached the provider.
  IF v_draft.status <> 'sending' OR v_draft.delivered_at IS NOT NULL OR v_draft.send_attempted_at IS NOT NULL THEN
    RAISE EXCEPTION 'record_outbound_draft_send_attempt: draft is % and cannot start a provider attempt', v_draft.status USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.outbound_drafts SET send_attempted_at = now()
   WHERE id = p_id RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;
REVOKE ALL ON FUNCTION public.record_outbound_draft_send_attempt(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_outbound_draft_send_attempt(uuid) TO service_role;

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
  -- 00784: a stale claim whose push was attempted may have reached the provider.
  -- Finalize it as delivered-unknown; never expire, reclaim or push it again.
  IF v_draft.status = 'sending' AND v_draft.send_attempted_at IS NOT NULL
     AND v_draft.claimed_at < now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'claim_outbound_draft_for_send: draft was already attempted; finalize it' USING ERRCODE = 'check_violation';
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
REVOKE ALL ON FUNCTION public.claim_outbound_draft_for_send(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_outbound_draft_for_send(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.release_outbound_draft_claim(p_id uuid)
RETURNS public.outbound_drafts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_uid uuid := auth.uid(); v_draft public.outbound_drafts%ROWTYPE;
BEGIN
  SELECT * INTO v_draft FROM public.outbound_drafts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT (v_uid IS NULL OR v_draft.sent_by IS NOT DISTINCT FROM v_uid OR
       (v_draft.claimed_at < now() - interval '10 minutes' AND COALESCE(public._can_access_outbound_draft(v_draft), false))) THEN
    RAISE EXCEPTION 'release_outbound_draft_claim: draft not found or access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 00782: a delivered draft stays 'sending' until it is finalized; review would send it twice.
  IF v_draft.delivered_at IS NOT NULL THEN
    RAISE EXCEPTION 'release_outbound_draft_claim: draft was already delivered; finalize it' USING ERRCODE = 'check_violation';
  END IF;
  -- 00784: an attempted push may have reached the provider, and push has no
  -- idempotency key. It stays 'sending' until it is finalized.
  IF v_draft.send_attempted_at IS NOT NULL THEN
    RAISE EXCEPTION 'release_outbound_draft_claim: draft was already attempted; finalize it' USING ERRCODE = 'check_violation';
  END IF;
  IF v_draft.status <> 'sending' THEN RAISE EXCEPTION 'release_outbound_draft_claim: draft is %, not sending', v_draft.status USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.outbound_drafts SET status = 'awaiting_review', claimed_at = NULL, sent_by = NULL
   WHERE id = p_id RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;
REVOKE ALL ON FUNCTION public.release_outbound_draft_claim(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_outbound_draft_claim(uuid) TO authenticated, service_role;

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
  -- Delivered, or a push attempt whose claim went stale (delivered-unknown).
  IF v_draft.status <> 'sending' OR (v_draft.delivered_at IS NULL AND NOT COALESCE(
       v_draft.send_attempted_at IS NOT NULL AND v_draft.claimed_at < now() - interval '10 minutes', false)) THEN
    RAISE EXCEPTION 'claim_outbound_draft_finalize: draft is % and was not delivered', v_draft.status USING ERRCODE = 'check_violation';
  END IF;
  IF v_draft.finalizing_at IS NOT NULL AND v_draft.finalizing_at >= now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'claim_outbound_draft_finalize: draft is already being finalized' USING ERRCODE = 'check_violation';
  END IF;
  -- A delivered-unknown push is recorded as delivered before any hook runs.
  UPDATE public.outbound_drafts SET finalizing_at = now(), delivered_at = COALESCE(delivered_at, now())
   WHERE id = p_id RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_outbound_draft_finalize(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbound_draft_finalize(uuid) TO service_role;

-- Hands back only the finalize claim the caller took (p_finalizing_at is its token).
CREATE OR REPLACE FUNCTION public.release_outbound_draft_finalize(p_id uuid, p_finalizing_at timestamptz)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.outbound_drafts SET finalizing_at = NULL
   WHERE id = p_id AND status = 'sending' AND finalizing_at = p_finalizing_at;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.release_outbound_draft_finalize(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_outbound_draft_finalize(uuid, timestamptz) TO service_role;
