-- ═══════════════════════════════════════════════════════════════════════════
-- 00354 — Back of House: fulfillment crons (intake worker + events mirror)
--
-- Schedules two edge functions via the 00258 public.invoke_edge_function bridge
-- (POSTs apikey + service-role Bearer, so the fns keep verify_jwt = true):
--   • fulfillment-intake       every 1 min — claims fulfillment_intake tasks
--   • fulfillment-events-mirror every 5 min — mirrors fulfillment_events → PostHog
-- job_runs bookkeeping lives INSIDE the edge fns (00300 idiom), not here.
-- Idempotent (guarded unschedule + re-schedule). The edge fns land in the (b)
-- wave; an absent fn simply 404s at invocation time (harmless) until deployed.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fulfillment-intake-worker') THEN
    PERFORM cron.unschedule('fulfillment-intake-worker');
  END IF;
END $$;
SELECT cron.schedule(
  'fulfillment-intake-worker',
  '* * * * *',
  $$SELECT public.invoke_edge_function('fulfillment-intake', '{}'::jsonb);$$
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fulfillment-events-mirror') THEN
    PERFORM cron.unschedule('fulfillment-events-mirror');
  END IF;
END $$;
SELECT cron.schedule(
  'fulfillment-events-mirror',
  '*/5 * * * *',
  $$SELECT public.invoke_edge_function('fulfillment-events-mirror', '{}'::jsonb);$$
);

-- Best-effort registry comment (00304 idiom — pg_cron is owned by supabase_admin
-- on self-hosted, so a postgres-run migration may lack privilege; cron.job is the
-- authoritative registry).
DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the full registry. Back of House (00354): fulfillment-intake-worker (every 1 min -> invoke_edge_function fulfillment-intake: claims fulfillment_intake tasks, re-fetches the PI, calls fulfillment_intake_order), fulfillment-events-mirror (every 5 min -> invoke_edge_function fulfillment-events-mirror: mirrors fulfillment_events to PostHog). Agent OS: agent-queue-groom (every 6h at :23, 00300), stripe-event-processor (every 5 min, 00304). Aesthete engine + earlier crons unchanged — cron.job is the source of truth.'$C$;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
