-- ═══════════════════════════════════════════════════════════════════════════
-- 00304 — Agent OS: stripe-event-processor cron (WP-2.1)
--
-- Schedules the stripe-event-processor edge function every 5 minutes via the
-- 00081/00258 public.invoke_edge_function bridge (which POSTs an apikey +
-- service-role Bearer, so the edge fn keeps verify_jwt = true). The processor
-- claims 'stripe_event' tasks off public.agent_tasks (00297) — enqueued by the
-- stripe-webhook reconciliation emission (WP-2.1) — re-fetches each object from
-- Stripe, and reconciles it against internal state, landing every discrepancy
-- awaiting_review in Mission Control.
--
-- NOTHING but the cron here: no schema, no tables, no RPCs. agent_tasks (00297),
-- job_runs (00300), and the payable/earnings tables the processor reads already
-- exist. Idempotent DDL throughout (guarded unschedule + re-schedule, best-
-- effort registry comment) so this file re-applies cleanly.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- ─── pg_cron — invoke the processor every 5 minutes ─────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stripe-event-processor') THEN
    PERFORM cron.unschedule('stripe-event-processor');
  END IF;
END $$;

SELECT cron.schedule(
  'stripe-event-processor',
  '*/5 * * * *',
  $$SELECT public.invoke_edge_function('stripe-event-processor', '{}'::jsonb);$$
);

-- Best-effort registry comment (00189/00250/00300/00303 idiom — pg_cron is owned
-- by supabase_admin on self-hosted, so a postgres-run migration may lack
-- privilege; cron.job is the authoritative registry). Carries forward 00303's
-- text and adds the stripe-event-processor.
DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the full registry. Agent OS: agent-queue-groom (every 6h at :23, 00300 -> groom_agent_tasks), cowork-intake-bridge (every 30 min, 00303 -> invoke_edge_function cowork-intake-bridge: sweeps the SharePoint Ops Inbox into agent_tasks; credential-gated until Entra setup), stripe-event-processor (every 5 min, 00304 -> invoke_edge_function stripe-event-processor: reconciles queued stripe_event tasks against internal state, escalates discrepancies to awaiting_review). Aesthete engine: aesthete-embed (1 min), aesthete-dna-draft (2 min), aesthete-behavior-stats (03:20), aesthete-quiz-janitor (03:45), aesthete-jobs-janitor (10 min, 00250), aesthete-drift-audit (Sun 04:00, 00250). Earlier: decision-reminders-daily, expire-decisions-daily, invoice-reminders-daily, po-payments-due-daily, delivery-this-week-weekly, review-requests, proposal, digest, A/B winner, margin pulse crons, notification-digest-daily (00278), field-daily (00284).'$C$;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
