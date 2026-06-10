-- Migration: 00181_invoice_reminders_cron.sql
-- Invoicing Wave 3 · A/R reminder automation
--
-- Schedules the invoice-reminders edge function daily at 15:00 UTC via pg_cron
-- (copying 00174's mechanism exactly: public.invoke_edge_function from 00081
-- resolves the function URL + service key from the app.settings GUCs and posts
-- through pg_net with both apikey + Authorization headers).
--
-- The function walks open receivables (status sent/partially_paid, due_date
-- set, ar_flagged_at null) through the cadence keyed by invoices.reminder_count
-- (due−3 nudge / due+1 overdue / due+7 second notice / due+14 final notice),
-- then flags the invoice for designer A/R follow-up and stops client emails.
--
-- 15:00 UTC ≈ morning in US timezones — A/R nudges land during the client's
-- business day rather than overnight (decision crons own 02:00/09:00 UTC).
--
-- Idempotent: guarded unschedule-if-exists, then (re)schedule — same shape as
-- siblings (00092 / 00174). On a database without the app.settings GUCs (e.g.
-- a bare local reset), the scheduled call degrades to a WARNING inside
-- invoke_edge_function and is a no-op.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Guarded unschedule: only if the job currently exists (idempotent on a fresh
-- DB and on a re-run of this migration).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'invoice-reminders-daily') THEN
    PERFORM cron.unschedule('invoice-reminders-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'invoice-reminders-daily',
  '0 15 * * *',
  $$
  SELECT public.invoke_edge_function('invoice-reminders', '{}'::jsonb);
  $$
);

-- Best-effort comment refresh (pg_cron is owned by supabase_admin on
-- self-hosted, so a postgres-run migration may lack privilege — same guard as
-- 00092 / 00174).
DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: decision-reminders-daily (09:00 UTC), expire-decisions-daily (02:00 UTC), invoice-reminders-daily (15:00 UTC, A/R cadence via the invoice-reminders edge fn), review-requests cron, proposal cron.'$C$;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
