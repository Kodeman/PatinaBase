-- Migration: 00096_review_requests_cron.sql
-- Schedules the daily review-requests edge function via pg_cron.
-- Implements PRD #13: auto-trigger review request 3 days after project completion.
-- Runs at 09:30 UTC daily (offset from decision-reminders at 09:00 UTC).

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Schedule: daily at 09:30 UTC, send review requests for projects completed 3+ days ago
-- that do not yet have a sent/queued/collected review request.
SELECT cron.schedule(
  'review-requests-daily',
  '30 9 * * *',
  $$
  SELECT public.invoke_edge_function('review-requests', '{}'::jsonb);
  $$
);

COMMENT ON EXTENSION pg_cron IS
  'pg_cron schedules: decision-reminders-daily (09:00 UTC), expire-decisions-daily (02:00 UTC), review-requests-daily (09:30 UTC).';
