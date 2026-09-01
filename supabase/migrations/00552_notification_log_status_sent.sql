-- ═══════════════════════════════════════════════════════════════════════════
-- 00552 — notification_status gains 'sent' and 'complained'
--
-- `_shared/send-email.ts` wrote notification_log.status = 'delivered' the
-- moment Resend returned 2xx. Resend's 2xx is an ACCEPT, not a delivery, so
-- the row asserted a delivery the provider had not yet confirmed and the
-- resend-webhook's email.delivered event had nothing left to upgrade. The
-- chokepoint now writes 'sent' on accept and the webhook alone writes
-- 'delivered'.
--
-- 'complained' joins at the same time: resend-webhook mapped email.complained
-- onto 'failed', which is indistinguishable from a provider send error and
-- loses the reason a recipient was suppressed.
--
-- Lineage: notification_status created 00041 → 'unconfirmed' added 00391 →
-- this file. Isolated by the same rule 00391 states: a PostgreSQL enum
-- addition must commit before the value is used, so nothing here reads or
-- writes either value.
--
-- Historical rows are deliberately NOT rewritten. A pre-00552 'delivered' row
-- means "accepted by Resend"; a post-00552 one means "confirmed delivered".
-- Backfilling would invent a distinction the old data never carried.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TYPE public.notification_status
  ADD VALUE IF NOT EXISTS 'sent';

ALTER TYPE public.notification_status
  ADD VALUE IF NOT EXISTS 'complained';
