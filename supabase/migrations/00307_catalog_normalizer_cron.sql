-- ═══════════════════════════════════════════════════════════════════════════
-- 00307 — Agent OS: Catalog Normalizer nightly cron (WP-2.4)
--
-- Nightly invocation of supabase/functions/catalog-normalizer via the
-- existing pg_cron -> invoke_edge_function bridge (00258): claims queued
-- normalize_feed agent_tasks (00297) + sweeps stranded catalog_feed_batches
-- rows stuck at status='received' with no live normalize_feed task. Runs at
-- 09:45 UTC (~03:45–04:45 Central depending on DST) — after the aesthete/
-- notification crons' overnight window, before the morning-brief's 11:00 UTC
-- run so a nightly-committed batch is visible in the brief.
--
-- Guarded schedule (unschedule-then-schedule, 00189/00300/00303 idiom) so
-- this migration is safely re-runnable.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'catalog-normalizer') THEN
    PERFORM cron.unschedule('catalog-normalizer');
  END IF;
END $$;

SELECT cron.schedule(
  'catalog-normalizer',
  '45 9 * * *',
  $$SELECT public.invoke_edge_function('catalog-normalizer', '{}'::jsonb);$$
);

-- Best-effort registry comment (00189/00250/00300/00303 idiom — pg_cron is
-- owned by supabase_admin on self-hosted, so a postgres-run migration may
-- lack privilege; cron.job is the authoritative registry). Carries forward
-- 00303's text and adds the normalizer.
DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the full registry. Agent OS: agent-queue-groom (every 6h at :23, 00300 -> groom_agent_tasks), cowork-intake-bridge (every 30 min, 00303 -> invoke_edge_function cowork-intake-bridge: sweeps the SharePoint Ops Inbox into agent_tasks; credential-gated until Entra setup), catalog-normalizer (daily 09:45 UTC, 00307 -> invoke_edge_function catalog-normalizer: claims normalize_feed agent_tasks + sweeps stranded catalog_feed_batches). Aesthete engine: aesthete-embed (1 min), aesthete-dna-draft (2 min), aesthete-behavior-stats (03:20), aesthete-quiz-janitor (03:45), aesthete-jobs-janitor (10 min, 00250), aesthete-drift-audit (Sun 04:00, 00250). Earlier: decision-reminders-daily, expire-decisions-daily, invoice-reminders-daily, po-payments-due-daily, delivery-this-week-weekly, review-requests, proposal, digest, A/B winner, margin pulse crons, notification-digest-daily (00278), field-daily (00284).'$C$;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
