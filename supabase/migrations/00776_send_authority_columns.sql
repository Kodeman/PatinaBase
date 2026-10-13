-- ═══════════════════════════════════════════════════════════════════════════
-- 00776 — Stamp outbound send authority on email, SMS, and push logs.
-- Nullable by design: existing rows are not backfilled and legacy APNs callers
-- remain unlabelled until B3g supplies their authority.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.notification_log
  ADD COLUMN IF NOT EXISTS send_authority jsonb;

ALTER TABLE public.sms_messages
  ADD COLUMN IF NOT EXISTS send_authority jsonb;
