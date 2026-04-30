-- Migration: 00098_proposal_cron.sql
-- Schedules a daily job to auto-expire proposals whose valid_until has passed
-- without acceptance.
--
-- Status transitions:
--   sent | viewed → expired   (when valid_until < now())
-- Proposals in any other state (draft, accepted, declined, revised, expired)
-- are left alone — accepted proposals are contractually live, drafts are
-- author-controlled.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SELECT cron.schedule(
  'expire-proposals-daily',
  '0 3 * * *',
  $$
  UPDATE public.proposals
     SET status = 'expired',
         updated_at = NOW()
   WHERE status IN ('sent', 'viewed')
     AND valid_until IS NOT NULL
     AND valid_until < NOW();
  $$
);
