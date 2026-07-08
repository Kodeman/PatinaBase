-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 00260_client_reminder_cadence.sql
-- Client notification cadence preference + daily reminder digest.
--
-- Adds a client-controlled cadence for NON-URGENT reminder emails (proposal
-- nudges, decision reminders). `immediate` (default) keeps today's behaviour:
-- every reminder emails as it fires. `daily_digest` suppresses those direct
-- emails (the in-app row still lands) and the new `notification-digest` edge
-- function rolls the day's unread reminders into ONE email at 15:00 UTC.
--
-- Transactional sends (proposal-send, invoice-send) are UNAFFECTED — they are
-- not gated by this preference.
--
-- This is deliberately SEPARATE from `digest_frequency` / `last_digest_sent_at`
-- (00040 / 00120), which drive the broad ENGAGEMENT digest (digest-dispatcher,
-- 14:00 UTC) over the whole notification_log. Reusing that watermark would let
-- the two digests clobber each other, so this migration adds its own.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Preference columns ──────────────────────────────────────────────────

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS reminder_cadence TEXT NOT NULL DEFAULT 'immediate';

-- CHECK added separately so a re-run (column already present) doesn't error.
DO $$
BEGIN
  ALTER TABLE public.notification_preferences
    ADD CONSTRAINT notification_preferences_reminder_cadence_check
    CHECK (reminder_cadence IN ('immediate', 'daily_digest'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS last_reminder_digest_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.notification_preferences.reminder_cadence IS
  'Cadence for non-urgent client reminder emails (proposal nudges, decision '
  'reminders). immediate = send each as it fires (default). daily_digest = '
  'suppress the direct email (in-app row still written) and batch into one '
  'notification-digest email per day. Transactional sends are never affected.';

COMMENT ON COLUMN public.notification_preferences.last_reminder_digest_sent_at IS
  'Watermark for the reminder digest (notification-digest edge function). '
  'Separate from last_digest_sent_at, which the engagement digest owns.';

-- RLS: NO new policy needed. The existing "Users can update own notification
-- preferences" policy (00040, FOR UPDATE USING auth.uid() = user_id) already
-- covers these columns for the client's self-service update path, exactly as it
-- covers digest_frequency. Service-role/edge writes go through the existing
-- "Service role full access" policy.

-- ─── 2. Digest-due lookup index ─────────────────────────────────────────────
-- The notification-digest function pages users opted into the digest who can
-- receive email; a partial index keeps that scan cheap.

CREATE INDEX IF NOT EXISTS idx_notification_preferences_reminder_digest_due
  ON public.notification_preferences(last_reminder_digest_sent_at)
  WHERE reminder_cadence = 'daily_digest' AND channels_email = true;

-- ─── 3. Reminder-digest cron ────────────────────────────────────────────────
-- Runs daily at 15:00 UTC (after the 09:00 decision-reminders run and clear of
-- the 14:00 engagement digest). The edge function decides per-user whether a
-- digest is due (20h min-interval guard) and whether there is anything to send.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('notification-digest-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'notification-digest-daily',
  '0 15 * * *',
  $$
  SELECT public.invoke_edge_function('notification-digest', '{}'::jsonb);
  $$
);
