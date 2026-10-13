-- ═══════════════════════════════════════════════════════════════════════════
-- 00775 — Outbound drafts, studio send modes, and review rollout
-- Adds the review-first authority record for studio-originated client/vendor/trade sends.
-- Lifecycle follows procurement_drafts (00706, 00718, 00720); no existing sender changes here.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.outbound_drafts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id        uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  kind              text NOT NULL,
  channel           text NOT NULL,
  recipient_kind    text NOT NULL,
  to_contact_id     uuid,
  to_client_id      uuid,
  to_party_id       uuid,
  to_address        text,
  subject           text,
  body              text NOT NULL,
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  ref_type          text NOT NULL,
  ref_id            uuid NOT NULL,
  composed_by       text NOT NULL DEFAULT 'system',
  dedupe_key        text NOT NULL UNIQUE,
  due_at            timestamptz,
  expires_at        timestamptz,
  status            text NOT NULL DEFAULT 'awaiting_review',
  claimed_at        timestamptz,
  edited_by         uuid,
  edited_at         timestamptz,
  sent_by           uuid,
  sent_at           timestamptz,
  message_id        text,
  discarded_by      uuid,
  discarded_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbound_drafts_channel_ck CHECK (channel IN ('email', 'sms', 'push')),
  CONSTRAINT outbound_drafts_recipient_kind_ck CHECK (recipient_kind IN ('client', 'vendor', 'trade')),
  CONSTRAINT outbound_drafts_status_ck CHECK (status IN ('awaiting_review', 'sending', 'sent', 'discarded', 'superseded', 'expired')),
  CONSTRAINT outbound_drafts_composed_by_ck CHECK (
    composed_by IN ('system', 'model') OR composed_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  CONSTRAINT outbound_drafts_recipient_ck CHECK (
    to_contact_id IS NOT NULL OR to_client_id IS NOT NULL OR to_party_id IS NOT NULL OR to_address IS NOT NULL
  ),
  CONSTRAINT outbound_drafts_subject_ck CHECK (
    (channel <> 'email' OR (subject IS NOT NULL AND char_length(btrim(subject)) BETWEEN 1 AND 300))
    AND (subject IS NULL OR char_length(subject) <= 300)
  ),
  CONSTRAINT outbound_drafts_body_ck CHECK (char_length(btrim(body)) BETWEEN 1 AND 20000),
  CONSTRAINT outbound_drafts_message_id_ck CHECK (message_id IS NULL OR char_length(message_id) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_outbound_drafts_project_status
  ON public.outbound_drafts (project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbound_drafts_expiry
  ON public.outbound_drafts (expires_at) WHERE status = 'awaiting_review';
CREATE INDEX IF NOT EXISTS idx_outbound_drafts_reference
  ON public.outbound_drafts (ref_type, ref_id, kind, status);

DROP TRIGGER IF EXISTS set_updated_at_outbound_drafts ON public.outbound_drafts;
CREATE TRIGGER set_updated_at_outbound_drafts
  BEFORE UPDATE ON public.outbound_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.outbound_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outbound_drafts_member_select ON public.outbound_drafts;
CREATE POLICY outbound_drafts_member_select ON public.outbound_drafts
  FOR SELECT TO authenticated
  USING (CASE WHEN project_id IS NOT NULL THEN public.can_buy_for_project(project_id)
              ELSE public.is_active_org_member(organization_id) END);
REVOKE ALL ON TABLE public.outbound_drafts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.outbound_drafts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.outbound_drafts TO service_role;

CREATE TABLE IF NOT EXISTS public.studio_outbound_modes (
  studio_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind      text NOT NULL,
  mode      text NOT NULL DEFAULT 'review',
  set_by    uuid NOT NULL,
  set_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (studio_id, kind),
  CONSTRAINT studio_outbound_modes_mode_ck CHECK (mode IN ('review', 'scheduled'))
);
ALTER TABLE public.studio_outbound_modes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS studio_outbound_modes_member_select ON public.studio_outbound_modes;
CREATE POLICY studio_outbound_modes_member_select ON public.studio_outbound_modes
  FOR SELECT TO authenticated USING (public.is_active_org_member(studio_id));
REVOKE ALL ON TABLE public.studio_outbound_modes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.studio_outbound_modes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_outbound_modes TO service_role;

CREATE OR REPLACE FUNCTION public._can_access_outbound_draft(p_draft public.outbound_drafts)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE WHEN p_draft.project_id IS NOT NULL THEN public.can_buy_for_project(p_draft.project_id)
              ELSE public.is_active_org_member(p_draft.organization_id) END;
$$;
REVOKE ALL ON FUNCTION public._can_access_outbound_draft(public.outbound_drafts) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._can_access_outbound_draft(public.outbound_drafts) TO service_role;

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
   WHERE id <> v_id AND organization_id = p_org AND ref_type = p_ref_type AND ref_id = p_ref_id AND kind = p_kind
     AND status = 'awaiting_review';
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.compose_outbound_draft(text, uuid, uuid, text, text, jsonb, text, text, jsonb, text, uuid, text, timestamptz, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compose_outbound_draft(text, uuid, uuid, text, text, jsonb, text, text, jsonb, text, uuid, text, timestamptz, timestamptz, text) TO service_role;

CREATE OR REPLACE FUNCTION public.update_outbound_draft(p_id uuid, p_subject text, p_body text)
RETURNS public.outbound_drafts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_uid uuid := auth.uid(); v_draft public.outbound_drafts%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'update_outbound_draft: not authenticated' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT * INTO v_draft FROM public.outbound_drafts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT COALESCE(public._can_access_outbound_draft(v_draft), false) THEN
    RAISE EXCEPTION 'update_outbound_draft: draft not found or access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_draft.status <> 'awaiting_review' THEN RAISE EXCEPTION 'update_outbound_draft: draft is %, not awaiting review', v_draft.status USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.outbound_drafts SET
    subject = CASE WHEN p_subject IS NULL THEN subject ELSE btrim(p_subject) END,
    body = COALESCE(p_body, body), edited_by = v_uid, edited_at = now()
  WHERE id = p_id RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;
REVOKE ALL ON FUNCTION public.update_outbound_draft(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_outbound_draft(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.discard_outbound_draft(p_id uuid)
RETURNS public.outbound_drafts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_uid uuid := auth.uid(); v_draft public.outbound_drafts%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'discard_outbound_draft: not authenticated' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT * INTO v_draft FROM public.outbound_drafts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT COALESCE(public._can_access_outbound_draft(v_draft), false) THEN
    RAISE EXCEPTION 'discard_outbound_draft: draft not found or access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_draft.status <> 'awaiting_review' THEN RAISE EXCEPTION 'discard_outbound_draft: draft is %, not awaiting review', v_draft.status USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.outbound_drafts SET status = 'discarded', discarded_by = v_uid, discarded_at = now()
   WHERE id = p_id RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;
REVOKE ALL ON FUNCTION public.discard_outbound_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discard_outbound_draft(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_outbound_drafts(p_ref_type text, p_ref_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.outbound_drafts SET status = 'discarded', discarded_at = now(), discarded_by = NULL
   WHERE ref_type = p_ref_type AND ref_id = p_ref_id AND status = 'awaiting_review';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_outbound_drafts(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_outbound_drafts(text, uuid) TO service_role;

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
  IF v_draft.status <> 'sending' THEN RAISE EXCEPTION 'release_outbound_draft_claim: draft is %, not sending', v_draft.status USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.outbound_drafts SET status = 'awaiting_review', claimed_at = NULL, sent_by = NULL
   WHERE id = p_id RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;
REVOKE ALL ON FUNCTION public.release_outbound_draft_claim(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_outbound_draft_claim(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_outbound_draft_sent(p_id uuid, p_sent_by uuid, p_message_id text)
RETURNS public.outbound_drafts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_draft public.outbound_drafts%ROWTYPE;
BEGIN
  SELECT * INTO v_draft FROM public.outbound_drafts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'mark_outbound_draft_sent: draft not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_draft.status <> 'sending' THEN RAISE EXCEPTION 'mark_outbound_draft_sent: draft is %, not sending', v_draft.status USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.outbound_drafts SET status = 'sent', sent_by = p_sent_by,
    sent_at = now(), message_id = NULLIF(btrim(p_message_id), ''), claimed_at = NULL
   WHERE id = p_id RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_outbound_draft_sent(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_outbound_draft_sent(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.expire_outbound_drafts()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.outbound_drafts SET status = 'expired'
   WHERE status = 'awaiting_review' AND expires_at IS NOT NULL AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_outbound_drafts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_outbound_drafts() TO service_role;

CREATE OR REPLACE FUNCTION public.set_studio_outbound_mode(p_studio uuid, p_kind text, p_mode text)
RETURNS public.studio_outbound_modes
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row public.studio_outbound_modes%ROWTYPE;
  model_composed_kinds constant text[] := ARRAY[]::text[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'set_studio_outbound_mode: not authenticated' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF p_mode NOT IN ('review', 'scheduled') OR p_kind IS NULL OR p_kind = '' THEN
    RAISE EXCEPTION 'set_studio_outbound_mode: invalid kind or mode' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM 1 FROM public.organizations WHERE id = p_studio FOR UPDATE;
  IF NOT FOUND OR NOT public.is_org_admin_or_owner(p_studio) THEN
    RAISE EXCEPTION 'set_studio_outbound_mode: only an owner or admin can set studio modes' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_mode = 'scheduled' AND p_kind = ANY(model_composed_kinds) THEN
    RAISE EXCEPTION 'set_studio_outbound_mode: model-composed kind cannot be scheduled' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.studio_outbound_modes (studio_id, kind, mode, set_by, set_at)
  VALUES (p_studio, p_kind, p_mode, auth.uid(), now())
  ON CONFLICT (studio_id, kind) DO UPDATE SET mode = EXCLUDED.mode, set_by = EXCLUDED.set_by, set_at = EXCLUDED.set_at
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.set_studio_outbound_mode(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_studio_outbound_mode(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.studio_outbound_mode(p_studio uuid, p_kind text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE((SELECT mode FROM public.studio_outbound_modes WHERE studio_id = p_studio AND kind = p_kind), 'review');
$$;
REVOKE ALL ON FUNCTION public.studio_outbound_mode(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_outbound_mode(uuid, text) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.outbound_review_rollout (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled_for_all boolean NOT NULL DEFAULT false,
  enabled_studios uuid[] NOT NULL DEFAULT '{}'::uuid[]
);
INSERT INTO public.outbound_review_rollout (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.outbound_review_rollout ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.outbound_review_rollout FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.outbound_review_rollout TO service_role;

CREATE OR REPLACE FUNCTION public.outbound_review_active(p_studio uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE((SELECT enabled_for_all OR p_studio = ANY(enabled_studios)
                     FROM public.outbound_review_rollout WHERE id = true), false);
$$;
REVOKE ALL ON FUNCTION public.outbound_review_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.outbound_review_active(uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-outbound-drafts') THEN
    PERFORM cron.unschedule('expire-outbound-drafts');
  END IF;
  PERFORM cron.schedule('expire-outbound-drafts', '*/15 * * * *',
    $job$SELECT public.expire_outbound_drafts();$job$);
EXCEPTION WHEN undefined_table OR undefined_function THEN
  RAISE NOTICE 'pg_cron unavailable; expire_outbound_drafts cron was not scheduled';
END;
$$;
