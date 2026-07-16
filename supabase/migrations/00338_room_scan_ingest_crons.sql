-- ═══════════════════════════════════════════════════════════════════════════
-- 00338 — Room View ingest crons + GLB conversion bookkeeping
--
-- Two pieces of the Room View ingest spine (Phase 1.1, sibling to 00337's
-- geometry schema):
--
--   1. GLB conversion bookkeeping on public.room_scans. The convert-room-scan-glb
--      edge function (R107 archival lane — first-ever writer of the never-written
--      model_url_gltf column, 00020) records its per-scan retry budget here:
--        • glb_convert_attempts — bumped on each failed conversion; the sweep
--          skips a scan once it reaches 5 (terminal park).
--        • glb_convert_error    — last failure reason (truncated), for triage.
--
--   2. Both ingest crons, guarded (unschedule-if-exists, schema-qualified body):
--        • room-scan-parse-sweep  */10 * * * *  -> parse-room-scan (00337 geometry
--          parser landing; that edge function is a sibling task's deliverable —
--          this cron references it by name, the agreed split).
--        • room-scan-glb-sweep    */15 * * * *  -> convert-room-scan-glb.
--      Both fire through public.invoke_edge_function (00258 Vault-backed cron->edge
--      bridge, service-role Bearer). Each edge function is a no-op when its work
--      set is empty, so an early cron (before either function is deployed) is
--      harmless — invoke_edge_function just POSTs and the gateway 404s/handles it.
--
-- Additive only. No new GRANT/REVOKE: the two columns are added to an existing
-- table and inherit its table-level privileges, so the legacy-grants seed
-- (seed/00-legacy-grants.sql) does NOT need regenerating.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. GLB conversion bookkeeping columns (additive) ──────────────────────
ALTER TABLE public.room_scans
  ADD COLUMN IF NOT EXISTS glb_convert_attempts int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS glb_convert_error     text;

COMMENT ON COLUMN public.room_scans.glb_convert_attempts IS
  'Room View (00338): failed USDZ->GLB conversion attempts. convert-room-scan-glb bumps this on failure and the sweep parks the scan at 5.';
COMMENT ON COLUMN public.room_scans.glb_convert_error IS
  'Room View (00338): last USDZ->GLB conversion failure reason (truncated), for triage.';

-- ─── 2. Ingest crons ───────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Guarded (re)schedule: unschedule any prior job of the same name first, then
-- reschedule. Cron bodies schema-qualify every relation (pg_cron runs under the
-- scheduling role's search_path, not this migration's).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'room-scan-parse-sweep') THEN
    PERFORM cron.unschedule('room-scan-parse-sweep');
  END IF;
END $$;

SELECT cron.schedule(
  'room-scan-parse-sweep',
  '*/10 * * * *',
  $$SELECT public.invoke_edge_function('parse-room-scan', '{}'::jsonb);$$
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'room-scan-glb-sweep') THEN
    PERFORM cron.unschedule('room-scan-glb-sweep');
  END IF;
END $$;

SELECT cron.schedule(
  'room-scan-glb-sweep',
  '*/15 * * * *',
  $$SELECT public.invoke_edge_function('convert-room-scan-glb', '{}'::jsonb);$$
);

-- Best-effort registry comment (00300/00304/00307/00308 idiom — pg_cron is owned
-- by supabase_admin on self-hosted, so a postgres-run migration may lack
-- privilege; cron.job is the authoritative registry). Carries 00308's text and
-- adds the two Room View ingest crons.
DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the full registry. Agent OS: agent-queue-groom (every 6h at :23, 00300), stripe-event-processor (every 5m, 00304), catalog-normalizer (00307), concierge-discrepancy-daily (10:15 UTC, 00308). Room View: room-scan-parse-sweep (every 10m, 00338 -> parse-room-scan: lands 00337 geometry), room-scan-glb-sweep (every 15m, 00338 -> convert-room-scan-glb: USDZ->GLB archival, stamps room_scans.model_url_gltf; history in job_runs). Aesthete engine + earlier crons unchanged (see prior registry text / cron.job).'$C$;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
