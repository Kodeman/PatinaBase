-- ═══════════════════════════════════════════════════════════════════════════
-- 00370 — Field Capture P1 · scan-pipeline ingest enqueue (trigger + sweep)
--
-- The DB side of P1 item 9: the entry point that lands a `scan_pipeline.ingest`
-- job on the existing agent_tasks queue (00297) the moment a bundle upload
-- completes. The native reconstruction worker (services/scan-pipeline/, R109)
-- claims it. No new queue, no new tables — only a trigger, a catch-up sweep,
-- and its pg_cron entry.
--
-- Numbering: current head is 00364; BOH reserved 00350–00369 and that
-- reservation is MATERIALIZED (I84 — files exist on the boh branches), so head+1
-- (00365) would sit inside a live reservation. This mints at **00370**, the
-- first number strictly past the BOH range, to avoid a merge collision.
-- (If a later branch has taken 00370, renumber THIS undeployed file per the
-- patina-db-migrations skill step 8.)
--
-- Design authority: docs/design/field-capture/scan-pipeline-worker-design.md
--   §2.1 (task-type namespace, entity/idempotency contract),
--   §2.2 (version allocation at the entry point),
--   §7   (failure/re-run semantics; the sweep is the belt-and-braces net).
-- Reconciles §2.1-vs-§2.2: the ENTRY POINT (this trigger/sweep) allocates the
-- room_file_version (COALESCE(MAX(version),0)+1 from room_files) and enqueues;
-- the INGEST STAGE reserves the pending room_files row (§2.1 "Writes room_files
-- (pending row)"). No room_files row is written here, so two rapid 'ready'
-- flips coalesce on the idempotency_key — the UNIQUE(scan_id,version) guarantee,
-- not timing, keeps versions gap-free and race-safe.
--
-- Every enqueued task carries (design §2.1): task_type 'scan_pipeline.ingest',
-- source 'scan-pipeline', entity_type 'room_scan', entity_id = scan_id,
-- idempotency_key '{scan_id}:ingest:{version}', payload {scan_id,
-- room_file_version, user_id}. assignee stays NULL; review states unused.
--
-- Grants: the sweep is service_role-only (00297 lockdown shape). Since this
-- migration adds a top-level GRANT/REVOKE, regenerate the legacy-grants seed
-- (scripts/generate-legacy-grants.py) — done alongside this file.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Trigger: on room_scans → 'ready' (schema ≥ 3), enqueue ingest ────────
--
-- SECURITY DEFINER so the inner enqueue_agent_task (granted to service_role
-- only) runs under the function owner. The enqueue is wrapped so a queue hiccup
-- NEVER blocks the owner's upload-completion status flip — the 15-min sweep is
-- the catch-up net for a lost enqueue.
CREATE OR REPLACE FUNCTION public.enqueue_scan_pipeline_ingest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_version int;
BEGIN
  BEGIN
    SELECT COALESCE(MAX(rf.version), 0) + 1
      INTO v_version
      FROM public.room_files rf
     WHERE rf.scan_id = NEW.id;

    PERFORM public.enqueue_agent_task(
      p_task_type       := 'scan_pipeline.ingest',
      p_payload         := jsonb_build_object(
                             'scan_id', NEW.id,
                             'room_file_version', v_version,
                             'user_id', NEW.user_id
                           ),
      p_source          := 'scan-pipeline',
      p_entity_type     := 'room_scan',
      p_entity_id       := NEW.id,
      p_idempotency_key := NEW.id::text || ':ingest:' || v_version::text,
      p_on_conflict     := 'ignore',
      p_actor           := 'trigger:scan-ready'
    );
  EXCEPTION WHEN OTHERS THEN
    -- Do NOT abort the upload-completion transaction on a queue error; the
    -- sweep will pick this scan up within 15 minutes.
    RAISE WARNING 'enqueue_scan_pipeline_ingest: enqueue failed for scan % (v%): %',
      NEW.id, v_version, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enqueue_scan_pipeline_ingest() IS
  'AFTER UPDATE trigger fn (00370): on room_scans → status ready with scan_schema_version >= 3, allocates room_file_version = MAX+1 and enqueues scan_pipeline.ingest (idempotency ''{scan}:ingest:{version}'', conflict-ignore). Enqueue failure is swallowed (WARNING) so it never blocks the upload-completion flip; the pg_cron sweep is the catch-up net.';

DROP TRIGGER IF EXISTS trg_room_scans_enqueue_ingest ON public.room_scans;
CREATE TRIGGER trg_room_scans_enqueue_ingest
  AFTER UPDATE ON public.room_scans
  FOR EACH ROW
  WHEN (
    NEW.status = 'ready'
    AND NEW.status IS DISTINCT FROM OLD.status
    AND COALESCE(NEW.scan_schema_version, 0) >= 3
  )
  EXECUTE FUNCTION public.enqueue_scan_pipeline_ingest();

-- ─── 2. Catch-up sweep — enqueue any ready schema-3 scan with no live ingest ─
--
-- Belt-and-braces for a lost trigger enqueue (the WARNING path above) or a scan
-- that reached 'ready' before this migration. Mirrors groom_agent_tasks (00300):
-- transaction-scoped advisory lock so a concurrent run is a no-op; job_runs
-- bookkeeping; no re-raise on error so the 'failed' job_runs row persists.
CREATE OR REPLACE FUNCTION public.sweep_scan_pipeline_ingest()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_run_id   bigint;
  v_enqueued int := 0;
  v_scan     record;
  v_version  int;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('job:scan-pipeline-ingest-sweep')) THEN
    INSERT INTO public.job_runs (job_name, status, finished_at)
    VALUES ('scan-pipeline-ingest-sweep', 'skipped', now());
    RETURN jsonb_build_object('skipped', true);
  END IF;

  PERFORM set_config('app.actor', 'job:scan-pipeline-ingest-sweep', true);

  INSERT INTO public.job_runs (job_name, status)
  VALUES ('scan-pipeline-ingest-sweep', 'running')
  RETURNING id INTO v_run_id;

  BEGIN
    FOR v_scan IN
      SELECT rs.id, rs.user_id
        FROM public.room_scans rs
       WHERE rs.status = 'ready'
         AND COALESCE(rs.scan_schema_version, 0) >= 3
         AND NOT EXISTS (
           SELECT 1
             FROM public.agent_tasks t
            WHERE t.task_type = 'scan_pipeline.ingest'
              AND t.entity_id = rs.id
              AND t.status IN ('queued','running','awaiting_review','approved','done')
         )
    LOOP
      SELECT COALESCE(MAX(rf.version), 0) + 1
        INTO v_version
        FROM public.room_files rf
       WHERE rf.scan_id = v_scan.id;

      PERFORM public.enqueue_agent_task(
        p_task_type       := 'scan_pipeline.ingest',
        p_payload         := jsonb_build_object(
                               'scan_id', v_scan.id,
                               'room_file_version', v_version,
                               'user_id', v_scan.user_id
                             ),
        p_source          := 'scan-pipeline',
        p_entity_type     := 'room_scan',
        p_entity_id       := v_scan.id,
        p_idempotency_key := v_scan.id::text || ':ingest:' || v_version::text,
        p_on_conflict     := 'ignore',
        p_actor           := 'job:scan-pipeline-ingest-sweep'
      );
      v_enqueued := v_enqueued + 1;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    -- No re-raise: let the transaction commit so the failed job_runs row
    -- persists (00300 rationale — job_runs is the authoritative failure record).
    UPDATE public.job_runs
       SET status = 'failed', finished_at = now(), error = SQLERRM,
           detail = jsonb_build_object('enqueued', v_enqueued)
     WHERE id = v_run_id;
    RETURN jsonb_build_object('error', SQLERRM, 'enqueued', v_enqueued);
  END;

  UPDATE public.job_runs
     SET status = 'succeeded', finished_at = now(),
         detail = jsonb_build_object('enqueued', v_enqueued)
   WHERE id = v_run_id;

  RETURN jsonb_build_object('enqueued', v_enqueued);
END;
$$;

COMMENT ON FUNCTION public.sweep_scan_pipeline_ingest() IS
  'Catch-up sweep (00370, pg_cron every 15m): enqueues scan_pipeline.ingest for every room_scans row that is status=ready + scan_schema_version>=3 and has no live/terminal ingest task. Idempotent (conflict-ignore on the version key); run history in job_runs (job_name scan-pipeline-ingest-sweep).';

REVOKE ALL ON FUNCTION public.sweep_scan_pipeline_ingest() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_scan_pipeline_ingest() TO service_role;

-- ─── 3. pg_cron — every 15 minutes ──────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scan-pipeline-ingest-sweep') THEN
    PERFORM cron.unschedule('scan-pipeline-ingest-sweep');
  END IF;
END $$;

SELECT cron.schedule(
  'scan-pipeline-ingest-sweep',
  '*/15 * * * *',
  $$
  SELECT public.sweep_scan_pipeline_ingest();
  $$
);
