-- ═══════════════════════════════════════════════════════════════════════════
-- 00724 — A 'sending' log row is not a send on record (US-17 H2; SQ-467,
--         closing R1 / SQ-460 finding F5 on 00720)
-- ═══════════════════════════════════════════════════════════════════════════
-- _procurement_draft_send_on_record (00720, G5) counted every log row but
-- 'failed' and 'suppressed'. _shared/send-email.ts inserts its row as
-- 'sending' BEFORE the provider call, so a crash there left a 'sending' row:
-- the sweep and complete_procurement_draft_send then marked the draft sent
-- with no proof the email went, and it could never be sent again.
--
-- A send is now on record only when the row's status proves the provider
-- accepted it:
--   sent       send-email, on Resend's 2xx (00552)
--   delivered, opened, clicked, bounced, complained
--              resend-webhook, matched by provider_id, which only a 'sent'
--              row carries
-- 'queued', 'sending' and 'unconfirmed' are unknown; 'failed' and
-- 'suppressed' did not go. An unknown send goes back to awaiting_review, so a
-- crash after the provider accepted but before the row was updated can send
-- twice. That window is accepted; a send with no log row at all (send-email
-- sends even when its log insert fails, R1 F6) is carried, not fixed here.
--
-- 00720's body, verbatim, with the status predicate changed. Its callers
-- (release_procurement_draft_claim, complete_procurement_draft_send,
-- sweep_procurement_clocks) are unchanged. CREATE OR REPLACE keeps the ACL.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._procurement_draft_send_on_record(p_draft_id uuid)
RETURNS public.notification_log
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT l.* FROM public.notification_log AS l
   WHERE l.ref_type = 'procurement_draft' AND l.ref_id = p_draft_id
     AND l.status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained')
   ORDER BY l.created_at
   LIMIT 1;
$$;

COMMENT ON FUNCTION public._procurement_draft_send_on_record(uuid) IS
  'The first notification_log row for a procurement draft whose status proves the provider accepted the '
  'email (sent, delivered, opened, clicked, bounced, complained), or NULL (00720, G5; 00724: a '
  '''sending'' row is unknown, not on record).';

REVOKE ALL ON FUNCTION public._procurement_draft_send_on_record(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._procurement_draft_send_on_record(uuid) TO service_role;
