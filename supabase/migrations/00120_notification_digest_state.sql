-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Notification Digest State
-- Description: Tracks per-user last digest send so the digest-dispatcher
--   edge function can pull only newly accumulated notifications.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS last_digest_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN notification_preferences.last_digest_sent_at IS
  'Timestamp of the most recent digest email sent to this user. The digest-dispatcher excludes notifications older than this from the next digest.';

CREATE INDEX IF NOT EXISTS idx_notification_preferences_digest_due
  ON notification_preferences(digest_frequency, last_digest_sent_at)
  WHERE digest_frequency <> 'never';

-- ─── Digest cron ────────────────────────────────────────────────────────
-- Runs daily at 14:00 UTC. The edge function evaluates each user's
-- timezone + frequency and decides whether to actually send today.

DO $$
BEGIN
  PERFORM cron.unschedule('digest-dispatcher');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'digest-dispatcher',
  '0 14 * * *',
  $$SELECT invoke_edge_function('digest-dispatcher');$$
);
