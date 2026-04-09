-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: The Daily Room — Privacy & Opt-out
-- ═══════════════════════════════════════════════════════════════════════════
-- Adds a per-user opt-out flag for behavioral tracking. The iOS app
-- already honors a local UserDefaults flag in DailyRoomBatchQueue, but
-- the nightly re-ranking pipeline also needs to exclude opted-out users
-- server-side so their dwell signals never influence recommendations.
--
-- All the Daily Room tables created in 00069 already have
-- ON DELETE CASCADE from auth.users(id), so account deletion
-- automatically wipes behavioral data with no extra code needed.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS behavioral_tracking_opt_out BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN profiles.behavioral_tracking_opt_out IS
  'When true, the Daily Room telemetry pipeline skips this user entirely. '
  'Recommendations fall back to style-quiz-only scoring.';

-- Index so the pipeline can cheaply filter participating users.
CREATE INDEX IF NOT EXISTS idx_profiles_tracking_optin
  ON profiles(id)
  WHERE behavioral_tracking_opt_out = FALSE;
