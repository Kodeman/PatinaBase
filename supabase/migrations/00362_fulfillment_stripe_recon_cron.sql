-- ═══════════════════════════════════════════════════════════════════════════
-- 00362 — Back of House: daily Stripe reconciliation cron (R2.3, §8)
--
-- Schedules the fulfillment-stripe-recon edge fn (00361 mirror + view) once a
-- day via the 00258 public.invoke_edge_function bridge (POSTs apikey +
-- service-role Bearer, so the fn keeps verify_jwt = true). The fn pulls balance
-- transactions since the cursor, upserts the append-only mirror, advances the
-- cursor, and (with STRIPE_SECRET_KEY unset locally) logs a graceful skip —
-- job_runs bookkeeping lives inside the edge fn (00300 idiom), not here.
-- Idempotent (guarded unschedule + re-schedule). An absent fn simply 404s at
-- invocation until deployed (harmless).
--
-- 03:20 UTC daily — after Stripe's day rolls over, off the :00/:23 peaks the
-- other BOH/Agent-OS crons use (fulfillment-intake every min, events-mirror
-- every 5 min, agent-queue-groom :23, stripe-event-processor every 5 min).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fulfillment-stripe-recon') THEN
    PERFORM cron.unschedule('fulfillment-stripe-recon');
  END IF;
END $$;
SELECT cron.schedule(
  'fulfillment-stripe-recon',
  '20 3 * * *',
  $$SELECT public.invoke_edge_function('fulfillment-stripe-recon', '{}'::jsonb);$$
);

-- Best-effort registry comment (00304 idiom — pg_cron owned by supabase_admin
-- on self-hosted, so a postgres-run migration may lack privilege).
DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the full registry. Back of House: fulfillment-intake-worker (every 1 min, 00354), fulfillment-events-mirror (every 5 min, 00354), fulfillment-stripe-recon (daily 03:20 UTC, 00362 -> invoke_edge_function fulfillment-stripe-recon: pulls Stripe balance transactions since cursor into the append-only stripe_balance_transactions mirror, ledger_stripe_recon_v reconciles account 1000). Agent OS: agent-queue-groom (every 6h at :23, 00300), stripe-event-processor (every 5 min, 00304). cron.job is the source of truth.'$C$;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
