-- ═══════════════════════════════════════════════════════════════════════════
-- 00591 — notification_log: delivery columns, document refs, studio RLS
--
-- notification_log (00041) tracks the accept/deliver/bounce lifecycle purely
-- through `status` + free-form `metadata` JSONB, with no queryable pointer
-- back to the document a send is about. This migration adds that pointer plus
-- the Resend-webhook-shaped delivery detail columns needed to surface
-- delivery status on invoices, client invitations, client reviews, and
-- proposals/commercial documents:
--
--   1. Ten new columns: ref_type, ref_id, recipient, delivered_at,
--      bounced_at, bounce_type, bounce_reason, delayed_at, last_event,
--      last_event_at. A separate worktree/agent in this same program wires
--      `_shared/send-email.ts`'s sendCompliantEmail to write ref_type/
--      ref_id/recipient and resend-webhook to write the remaining seven —
--      this migration only owns the schema, the backfill, and the one SQL
--      writer this repo already has (_sync_proposal_send_email_log, 00388).
--
--   2. Four ref_type-scoped SELECT policies so a signed-in designer can read
--      a notification_log row about a document they can already see, without
--      widening the table's general per-user visibility. Each policy's
--      subquery runs under the CALLER's own RLS on the referenced table
--      (invoices, client_invitations, client_reviews, proposals) — it grants
--      nothing new; it only lets the log follow that document's existing
--      authority.
--
-- ref_type vocabulary: 'invoice' (public.invoices), 'client_invitation'
-- (public.client_invitations), 'client_review' (public.client_reviews),
-- 'proposal' (public.proposals — also covers design-services "commercial
-- documents": 00412 layered document_kind/commercial_state onto proposals
-- rather than creating a separate commercial_documents table, so there is
-- nothing further to add here).
--
-- Lineage of _sync_proposal_send_email_log: created 00388 → this file (adds
-- ref_type/ref_id to the INSERT column list, VALUES, and ON CONFLICT UPDATE
-- SET only — everything else is the 00388 body verbatim, confirmed as the
-- sole prior definition via
--   grep -rln "CREATE OR REPLACE FUNCTION[^(]*_sync_proposal_send_email_log" \
--     supabase/migrations/*.sql).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── delivery columns ──────────────────────────────────────────────────────

ALTER TABLE public.notification_log
  ADD COLUMN IF NOT EXISTS ref_type text,
  ADD COLUMN IF NOT EXISTS ref_id uuid,
  ADD COLUMN IF NOT EXISTS recipient text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS bounced_at timestamptz,
  ADD COLUMN IF NOT EXISTS bounce_type text,
  ADD COLUMN IF NOT EXISTS bounce_reason text,
  ADD COLUMN IF NOT EXISTS delayed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_event text,
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz;

COMMENT ON COLUMN public.notification_log.ref_type IS
  'Kind of document this notification is about: invoice (public.invoices), client_invitation (public.client_invitations), client_review (public.client_reviews), or proposal (public.proposals — also covers design-services commercial documents, 00412).';
COMMENT ON COLUMN public.notification_log.ref_id IS
  'id of the ref_type row this notification is about, in the table named by ref_type.';
COMMENT ON COLUMN public.notification_log.recipient IS
  'Email address (or other channel address) this notification was actually sent to.';
COMMENT ON COLUMN public.notification_log.delivered_at IS
  'When Resend confirmed delivery (email.delivered webhook event) — distinct from sent_at, which is when Resend accepted the send (00552).';
COMMENT ON COLUMN public.notification_log.bounced_at IS
  'When Resend reported a bounce (email.bounced webhook event).';
COMMENT ON COLUMN public.notification_log.bounce_type IS
  'Resend bounce classification, e.g. hard or soft.';
COMMENT ON COLUMN public.notification_log.bounce_reason IS
  'Resend-provided human-readable bounce reason.';
COMMENT ON COLUMN public.notification_log.delayed_at IS
  'When Resend reported a delivery delay (email.delivery_delayed webhook event).';
COMMENT ON COLUMN public.notification_log.last_event IS
  'Most recent Resend webhook event type applied to this row, for quick status display without re-deriving from status history.';
COMMENT ON COLUMN public.notification_log.last_event_at IS
  'When last_event was recorded.';

-- ─── indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS notification_log_ref_idx
  ON public.notification_log (ref_type, ref_id, created_at DESC)
  WHERE channel = 'email';

-- 00041 indexed user_id/type/status/created_at but never provider_id, which
-- is exactly what resend-webhook matches incoming events on.
CREATE INDEX IF NOT EXISTS notification_log_provider_id_idx
  ON public.notification_log (provider_id)
  WHERE provider_id IS NOT NULL;

-- ─── backfill ────────────────────────────────────────────────────────────────
-- Only cast metadata text to uuid where it is actually a valid uuid literal —
-- a malformed or absent key must not abort the backfill.

UPDATE public.notification_log
SET ref_type = 'invoice',
    ref_id = (metadata->>'invoice_id')::uuid
WHERE ref_type IS NULL
  AND metadata->>'invoice_id' IS NOT NULL
  AND metadata->>'invoice_id' ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

UPDATE public.notification_log
SET ref_type = 'proposal',
    ref_id = (metadata->>'proposal_id')::uuid
WHERE ref_type IS NULL
  AND metadata->>'proposal_id' IS NOT NULL
  AND metadata->>'proposal_id' ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- ─── _sync_proposal_send_email_log: stamp ref_type/ref_id ──────────────────

CREATE OR REPLACE FUNCTION public._sync_proposal_send_email_log(
  p_dispatch_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dispatch public.proposal_send_dispatches%ROWTYPE;
  v_log_status public.notification_status;
BEGIN
  SELECT * INTO v_dispatch
  FROM public.proposal_send_dispatches
  WHERE id = p_dispatch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal send dispatch not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  v_log_status := CASE v_dispatch.state
    WHEN 'delivered' THEN 'delivered'::public.notification_status
    WHEN 'suppressed' THEN 'suppressed'::public.notification_status
    WHEN 'failed' THEN 'failed'::public.notification_status
    WHEN 'unconfirmed' THEN v_dispatch.state::public.notification_status
    ELSE 'sending'::public.notification_status
  END;

  INSERT INTO public.notification_log AS existing (
    id, user_id, type, channel, status, provider_id, template_id,
    metadata, error, retry_count, sent_at, ref_type, ref_id
  ) VALUES (
    v_dispatch.email_log_id,
    v_dispatch.client_id,
    'proposal_sent',
    'email',
    v_log_status,
    v_dispatch.provider_id,
    'proposal-sent',
    jsonb_build_object(
      'proposal_id', v_dispatch.proposal_id,
      'dispatch_id', v_dispatch.id,
      'sent_at', v_dispatch.sent_at,
      'delivery_state', v_dispatch.state,
      'subject', 'Proposal ready for your review',
      'message', v_dispatch.proposal_title,
      'deep_link', v_dispatch.client_portal_path
    ),
    v_dispatch.last_error,
    GREATEST(v_dispatch.provider_attempt_count - 1, 0),
    v_dispatch.delivered_at,
    'proposal',
    v_dispatch.proposal_id
  )
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    provider_id = EXCLUDED.provider_id,
    metadata = EXCLUDED.metadata,
    error = EXCLUDED.error,
    retry_count = EXCLUDED.retry_count,
    sent_at = EXCLUDED.sent_at,
    ref_type = EXCLUDED.ref_type,
    ref_id = EXCLUDED.ref_id;
END;
$$;

-- 00388's own posture: no role may call this directly (not even service_role)
-- — it is reached only via PERFORM from the other SECURITY DEFINER functions
-- in 00388, which run as the function owner regardless of this REVOKE.
REVOKE ALL ON FUNCTION public._sync_proposal_send_email_log(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ─── ref_type-scoped SELECT policies ────────────────────────────────────────
-- Each subquery runs under the CALLER's own RLS on the referenced table, so a
-- designer sees a log row only when they can already see the underlying
-- document. This is additive: the existing owner/admin SELECT policies from
-- 00041 are untouched.

DROP POLICY IF EXISTS notification_log_ref_invoice_select ON public.notification_log;
CREATE POLICY notification_log_ref_invoice_select ON public.notification_log
  FOR SELECT TO authenticated
  USING (
    channel = 'email'
    AND ref_type = 'invoice'
    AND EXISTS (
      SELECT 1 FROM public.invoices x WHERE x.id = notification_log.ref_id
    )
  );

DROP POLICY IF EXISTS notification_log_ref_client_invitation_select ON public.notification_log;
CREATE POLICY notification_log_ref_client_invitation_select ON public.notification_log
  FOR SELECT TO authenticated
  USING (
    channel = 'email'
    AND ref_type = 'client_invitation'
    AND EXISTS (
      SELECT 1 FROM public.client_invitations x WHERE x.id = notification_log.ref_id
    )
  );

DROP POLICY IF EXISTS notification_log_ref_client_review_select ON public.notification_log;
CREATE POLICY notification_log_ref_client_review_select ON public.notification_log
  FOR SELECT TO authenticated
  USING (
    channel = 'email'
    AND ref_type = 'client_review'
    AND EXISTS (
      SELECT 1 FROM public.client_reviews x WHERE x.id = notification_log.ref_id
    )
  );

DROP POLICY IF EXISTS notification_log_ref_proposal_select ON public.notification_log;
CREATE POLICY notification_log_ref_proposal_select ON public.notification_log
  FOR SELECT TO authenticated
  USING (
    channel = 'email'
    AND ref_type = 'proposal'
    AND EXISTS (
      SELECT 1 FROM public.proposals x WHERE x.id = notification_log.ref_id
    )
  );
