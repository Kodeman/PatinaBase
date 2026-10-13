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

ALTER TABLE public.sms_prompts
  ADD COLUMN IF NOT EXISTS pending_send boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS outbound_draft_id uuid NULL REFERENCES public.outbound_drafts(id) ON DELETE SET NULL;
ALTER TABLE public.client_decision_batches
  ADD COLUMN IF NOT EXISTS pending_send boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS outbound_draft_id uuid NULL REFERENCES public.outbound_drafts(id) ON DELETE SET NULL;

-- Pending review rows are not answerable, including through a guessed short code.
CREATE OR REPLACE FUNCTION public.sms_resolve_prompt(
  p_sender text, p_recipient text, p_code text
) RETURNS TABLE (
  id uuid, project_id uuid, party_id uuid, kind text, subject_id uuid,
  version integer, short_code text, expires_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id, p.project_id, p.party_id, p.kind, p.subject_id, p.version,
         p.short_code, p.expires_at
    FROM public.sms_prompts p
   WHERE p.sender_number = public.normalize_channel_value('sms', p_sender)
     AND p.recipient_phone = public.normalize_channel_value('sms', p_recipient)
     AND p.short_code = NULLIF(regexp_replace(COALESCE(p_code, ''), '\D', '', 'g'), '')
     AND p.answered_at IS NULL AND p.voided_at IS NULL AND p.pending_send = false
     AND p.expires_at > now()
   ORDER BY p.created_at DESC LIMIT 1;
$$;
