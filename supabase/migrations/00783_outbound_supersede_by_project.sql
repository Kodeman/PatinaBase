-- ═══════════════════════════════════════════════════════════════════════════
-- 00783 — Scope outbound draft superseding to the same project
-- Lineage: compose_outbound_draft body copied verbatim from 00775.
-- Reconciles: client digest drafts for different projects shared by one client.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.compose_outbound_draft(
  p_kind text, p_org uuid, p_project uuid, p_channel text, p_recipient_kind text,
  p_to jsonb, p_subject text, p_body text, p_payload jsonb, p_ref_type text,
  p_ref_id uuid, p_dedupe_key text, p_due_at timestamptz, p_expires_at timestamptz,
  p_composed_by text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_to IS NULL OR jsonb_typeof(p_to) <> 'object' THEN
    RAISE EXCEPTION 'compose_outbound_draft: p_to must be an object' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.outbound_drafts (
    organization_id, project_id, kind, channel, recipient_kind,
    to_contact_id, to_client_id, to_party_id, to_address,
    subject, body, payload, ref_type, ref_id, dedupe_key, due_at, expires_at, composed_by
  ) VALUES (
    p_org, p_project, p_kind, p_channel, p_recipient_kind,
    NULLIF(p_to->>'contact_id', '')::uuid, NULLIF(p_to->>'client_id', '')::uuid,
    NULLIF(p_to->>'party_id', '')::uuid, NULLIF(p_to->>'address', ''),
    p_subject, p_body, COALESCE(p_payload, '{}'::jsonb), p_ref_type, p_ref_id,
    p_dedupe_key, p_due_at, p_expires_at, COALESCE(p_composed_by, 'system')
  ) ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.outbound_drafts WHERE dedupe_key = p_dedupe_key;
    RETURN v_id;
  END IF;
  UPDATE public.outbound_drafts
     SET status = 'superseded'
   WHERE id <> v_id AND organization_id = p_org AND project_id IS NOT DISTINCT FROM p_project
     AND ref_type = p_ref_type AND ref_id = p_ref_id AND kind = p_kind
     AND status = 'awaiting_review';
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.compose_outbound_draft(text, uuid, uuid, text, text, jsonb, text, text, jsonb, text, uuid, text, timestamptz, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compose_outbound_draft(text, uuid, uuid, text, text, jsonb, text, text, jsonb, text, uuid, text, timestamptz, timestamptz, text) TO service_role;
