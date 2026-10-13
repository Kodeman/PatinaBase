-- ═══════════════════════════════════════════════════════════════════════════
-- 00782 — Outbound draft delivery finalization (US-31, SQ-905 F11)
-- Once a provider accepts a draft's message, the delivery is recorded before
-- any after-send hook runs. A delivered draft is never released to review and
-- never claimed for a second provider send: it stays 'sending' until
-- outbound-send finalizes it (after-send hook, then mark sent).
-- The claim body follows 00780; the release body follows 00775.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.outbound_drafts
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_message_id text;

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
  UPDATE public.outbound_drafts SET delivered_at = now(), delivery_message_id = NULLIF(btrim(p_message_id), '')
   WHERE id = p_id RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;
REVOKE ALL ON FUNCTION public.record_outbound_draft_delivery(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_outbound_draft_delivery(uuid, text) TO service_role;

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
  IF v_draft.status <> 'sending' THEN RAISE EXCEPTION 'release_outbound_draft_claim: draft is %, not sending', v_draft.status USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.outbound_drafts SET status = 'awaiting_review', claimed_at = NULL, sent_by = NULL
   WHERE id = p_id RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;
REVOKE ALL ON FUNCTION public.release_outbound_draft_claim(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_outbound_draft_claim(uuid) TO authenticated, service_role;
