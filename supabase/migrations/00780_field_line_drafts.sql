-- ═══════════════════════════════════════════════════════════════════════════
-- 00780 — Field Line SMS draft expiry
-- Keep an expired field text from being sent by a late review or scheduled retry.
-- The claim body follows 00775; the expiry predicate runs before either claim path.
-- ═══════════════════════════════════════════════════════════════════════════
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
