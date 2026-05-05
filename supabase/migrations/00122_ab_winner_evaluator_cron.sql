-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: A/B Winner Evaluator Cron
-- Description: Schedules the ab-winner-evaluator edge function to run every
--   hour. The function picks the winning subject variant for any campaign
--   where ab_enabled=true and ab_winner IS NULL, after the configured
--   evaluation window (default 2h after sent_at) has elapsed.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  PERFORM cron.unschedule('ab-winner-evaluator');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'ab-winner-evaluator',
  '15 * * * *',  -- 15 minutes past every hour
  $$SELECT invoke_edge_function('ab-winner-evaluator');$$
);
