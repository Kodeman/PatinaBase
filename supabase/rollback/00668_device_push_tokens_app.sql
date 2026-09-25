-- ═══════════════════════════════════════════════════════════════════════════
-- Rollback for 00668_device_push_tokens_app.sql — NOT a migration.
--
-- This directory is outside supabase/migrations/ on purpose: a local reset and
-- `supabase db push` apply every file in migrations/, so a revert kept there
-- would run on the next push. Nothing applies this file automatically. Run it
-- by hand, against the database being rolled back, only when 00668 must be
-- withdrawn.
--
-- Order matters:
--   1. Redeploy the apns-send that predates 00668 first. The 00668 apns-send
--      selects `app`, so it fails every push once the column is gone.
--   2. Run this file.
--   3. Mark 00668 reverted in the migration history (the Supabase CLI's
--      `migration repair --status reverted 00668`). Otherwise the history
--      still lists 00668 as applied.
--
-- What is lost: each token's app. Without the column, a cloud.patina.field
-- token would read as a Patina token to the pre-00668 apns-send, which would
-- send it Patina's topic and have APNs refuse it. So this file deletes the
-- Field rows before it drops the column. Patina Field registers its tokens
-- again when it next launches after 00668 returns.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Guarded so a second run, after the column is gone, is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'device_push_tokens'
      AND column_name = 'app'
  ) THEN
    DELETE FROM public.device_push_tokens WHERE app = 'cloud.patina.field';
  END IF;
END $$;

ALTER TABLE public.device_push_tokens
  DROP CONSTRAINT IF EXISTS device_push_tokens_app_check;

ALTER TABLE public.device_push_tokens
  DROP COLUMN IF EXISTS app;

COMMIT;
