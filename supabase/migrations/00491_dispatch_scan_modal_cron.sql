-- ═══════════════════════════════════════════════════════════════════════════
-- 00491 — Rendered Room v2 · dispatch-scan-modal sweep cron (W0-B)
--
-- Numbering: head at write time is 00480. Per the delivery-plan numbering
-- context (docs/architecture/CAD Generation Pipeline/DELIVERY-PLAN.md), a
-- sibling W0 lane is authoring 00489/00490 and phase1-close has reserved
-- 00487/00488 — this mints at 00491, the first number strictly past both
-- reservations, to avoid a merge collision. (If a later branch has already
-- taken 00491, renumber THIS undeployed file per the patina-db-migrations
-- skill step 8 — bump the undeployed side, never a file already applied
-- anywhere that matters.)
--
-- Schedules the pg_cron sweep for the dispatch-scan-modal edge function
-- (supabase/functions/dispatch-scan-modal), the R1 dispatcher: it claims
-- scan_pipeline.verify|splat|renders tasks off the existing agent_tasks queue
-- (00297) and spawns each on Modal. Shape copied exactly from 00338/00340's
-- guarded (re)schedule idiom (unschedule-if-exists, schema-qualified body,
-- fires through public.invoke_edge_function — the 00258 Vault-backed
-- cron->edge bridge, service-role Bearer, so the function keeps
-- verify_jwt = true).
--
-- Interval: every 5 minutes, matching room-scan-photo-derivative-sweep
-- (00340) rather than the 15-minute Room View ingest/GLB sweeps — the
-- dispatcher's own billing guard (a cheap agent_tasks existence check) makes a
-- tighter interval free: an empty queue never reaches Modal or even the claim
-- RPC on an empty tick.
--
-- Nothing enqueues scan_pipeline.verify|splat|renders yet (W1 wires the
-- enqueue side — see the delivery plan §3 W1/W2), and the function is not yet
-- deployed at authoring time either, so this cron fires into a 404/no-op on
-- both counts until each lands. Same harmlessness argument 00338/00340 make
-- for their sweeps: invoke_edge_function just POSTs; an unresolved function or
-- an empty queue is not an error state.
--
-- Additive only. No GRANT/REVOKE: cron.schedule needs no new privileges (the
-- scheduling role that owns every other Agent OS/Room View cron already
-- exists), and public.invoke_edge_function is unchanged. The legacy-grants
-- seed (seed/00-legacy-grants.sql) does NOT need regenerating.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Guarded (re)schedule: unschedule any prior job of the same name first, then
-- reschedule. Cron bodies schema-qualify every relation (pg_cron runs under
-- the scheduling role's search_path, not this migration's).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch-scan-modal-sweep') THEN
    PERFORM cron.unschedule('dispatch-scan-modal-sweep');
  END IF;
END $$;

SELECT cron.schedule(
  'dispatch-scan-modal-sweep',
  '*/5 * * * *',
  $$SELECT public.invoke_edge_function('dispatch-scan-modal', '{}'::jsonb);$$
);

-- Best-effort registry comment (00300/00338/00340/00362/00375 idiom — pg_cron
-- is owned by supabase_admin on self-hosted, so a postgres-run migration may
-- lack privilege; cron.job is the authoritative registry regardless).
DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the authoritative registry. Rendered Room v2 (00491): dispatch-scan-modal-sweep every 5 minutes -> invoke_edge_function dispatch-scan-modal, a billing-guarded dispatcher that claims scan_pipeline.verify|splat|renders off agent_tasks (00297) and spawns each on Modal (staging only, W0-B); enqueue side lands in a later wave. Room View, Agent OS, BOH, Field Site Request, Mood Board, and earlier schedules are unchanged (see prior registry text / cron.job).'$C$;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
