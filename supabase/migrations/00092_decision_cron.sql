-- Migration: 00092_decision_cron.sql
-- Schedules daily reminder + auto-expire jobs for client_decisions.
-- Implements the data-side of PRD line 120 (48hr reminder); SMS escalation
-- is intentionally out of scope.

-- Ensure pg_cron is available (already enabled in earlier migrations but
-- safe to no-op).
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Helper: invoke an edge function via the existing dual-auth wrapper.
-- migration 00081 introduced public.invoke_edge_function; we reuse it here.

-- Schedule: daily at 09:00 UTC, send 48hr reminders for pending decisions
-- whose due_date is within the next 48 hours and that haven't been reminded.
SELECT cron.schedule(
  'decision-reminders-daily',
  '0 9 * * *',
  $$
  SELECT public.invoke_edge_function('decision-reminders', '{}'::jsonb);
  $$
);

-- Schedule: daily at 02:00 UTC, mark pending decisions overdue by 7+ days as expired.
SELECT cron.schedule(
  'expire-decisions-daily',
  '0 2 * * *',
  $$
  UPDATE public.client_decisions
     SET status = 'expired'
   WHERE status = 'pending'
     AND due_date IS NOT NULL
     AND due_date < (now() - INTERVAL '7 days');
  $$
);

COMMENT ON EXTENSION pg_cron IS
  'pg_cron schedules: decision-reminders-daily (09:00 UTC), expire-decisions-daily (02:00 UTC).';
