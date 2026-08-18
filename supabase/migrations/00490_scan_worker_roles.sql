-- ═══════════════════════════════════════════════════════════════════════════
-- 00490 — Scan worker RPC surface + read view (Rendered Room v2 · W0)
--
-- The `scan_worker`/`scan_reader` NOLOGIN capability roles were minted in
-- 00489 (kept there so 00489's own registry RPCs could grant to scan_worker
-- without a forward reference — see that file's header). This migration
-- builds the RPC/view surface those roles are actually granted, adapted from
-- the 00481 least-privilege pattern (verified via
-- `git show origin/phase1-close/staging-ready:supabase/migrations/00481_edge_catalog_roles.sql`):
-- a NOLOGIN group role carrying the grants, an out-of-band LOGIN role
-- reachable only via connection string, and (for the read side) a
-- security_barrier view as the sole read surface.
--
-- ─── Out-of-band LOGIN provisioning (NEVER put these in a migration) ────────
-- Run once per environment, by a human/operator with sufficient privilege,
-- against that environment's database directly — never checked in with a
-- real password, never run by `supabase db push`:
--
--   CREATE ROLE scan_worker_login
--     NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT LOGIN NOREPLICATION NOBYPASSRLS
--     PASSWORD '<generated secret — store as a Modal Secret, per plan §2 R2>';
--   GRANT scan_worker TO scan_worker_login WITH INHERIT TRUE, SET FALSE;
--
--   CREATE ROLE scan_reader_login
--     NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT LOGIN NOREPLICATION NOBYPASSRLS
--     PASSWORD '<generated secret>';
--   GRANT scan_reader TO scan_reader_login WITH INHERIT TRUE, SET FALSE;
--
-- `scan_worker_login`'s connection string is held as a Modal Secret rather
-- than inside a Hyperdrive connection string (Hyperdrive is Workers-only) —
-- a wider credential surface than 00481's original shape, accepted knowingly
-- (plan §2 R2, §5 risk register).
--
-- ─── Why direct-Postgres RPC wrappers instead of reusing 00297/00378 raw ────
-- R2: Modal never holds service_role. scan_worker's wrappers below call the
-- existing 00297/00378 agent_tasks RPCs (complete_agent_task) INTERNALLY as
-- SECURITY DEFINER, rather than reimplementing queue semantics, per plan
-- guidance ("reuse complete_agent_task-style checks"). Each wrapper also
-- enforces a task_type namespace guard (`scan_pipeline.%`, matching
-- services/scan-pipeline/src/patina_scan_worker/config.py's
-- TASK_TYPE_PREFIX) so a compromised scan_worker_login credential can only
-- ever touch scan-pipeline queue rows, never any other agent_tasks lane.
--
-- KNOWN LIMITATION (documented, not silently assumed away): the dispatcher's
-- Modal payload is minimal by design (plan §2 R1: taskId/scanId/
-- roomFileVersion/traceId/objectRefs) and does not currently carry the
-- claim's lease-owner token. These wrappers therefore forward the ROW's
-- current locked_by straight through as complete_agent_task's p_actor, which
-- satisfies that RPC's non-empty/must-be-running checks but does not by
-- itself distinguish a stale Modal invocation from the current lease holder
-- the way 00378 distinguishes two direct queue callers. The room-file-version
-- job key is what actually makes a duplicate/stale delivery a no-op today
-- (plan §2 R1); a real per-invocation lease token should be added to the
-- dispatcher payload before W1's duplicate-delivery golden cases are
-- considered a full closure of this gap.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── scan_pipeline_events.stage — add verify/renders (R3 Modal stage names) ──
-- 'splat' already exists (00376/P2); 'verify' and 'renders' are new to this
-- program. DROP-then-ADD is the established idempotent-widen idiom (00376).
ALTER TABLE public.scan_pipeline_events
  DROP CONSTRAINT IF EXISTS scan_pipeline_events_stage_check;
ALTER TABLE public.scan_pipeline_events
  ADD  CONSTRAINT scan_pipeline_events_stage_check
  CHECK (stage IN (
    'capture', 'upload', 'ingest', 'solve', 'drawing', 'delivery',   -- P1 (00341)
    'refine',  'fuse',   'splat',  'present',                        -- P2 (00376)
    'verify',  'renders'                                             -- Rendered Room v2 (00490)
  ));

COMMENT ON COLUMN public.scan_pipeline_events.stage IS
  'Coarse pipeline phase. P1 (00341): capture->upload->ingest->solve->drawing->delivery. P2 (00376): refine/fuse/splat/present. Rendered Room v2 (00490): verify (Modal CPU), renders (Modal L40S). event carries the specific name within the stage; detail carries the structured payload.';

-- ═══════════════════════════════════════════════════════════════════════════
-- scan_worker_complete_task — report a scan-pipeline task done.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.scan_worker_complete_task(
  p_task_id uuid,
  p_result  jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_task public.agent_tasks;
BEGIN
  SELECT * INTO v_task FROM public.agent_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'scan_worker_complete_task: task % not found', p_task_id;
  END IF;
  IF v_task.task_type NOT LIKE 'scan_pipeline.%' THEN
    RAISE EXCEPTION
      'scan_worker_complete_task: task % is task_type % — outside the scan_pipeline.%% namespace',
      p_task_id, v_task.task_type;
  END IF;
  IF v_task.locked_by IS NULL THEN
    RAISE EXCEPTION 'scan_worker_complete_task: task % has no active lease', p_task_id;
  END IF;

  PERFORM public.complete_agent_task(
    p_id         => p_task_id,
    p_outcome    => 'done',
    p_artifacts  => coalesce(p_result, '{}'::jsonb),
    p_actor      => v_task.locked_by
  );
END;
$$;

REVOKE ALL   ON FUNCTION public.scan_worker_complete_task(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.scan_worker_complete_task(uuid, jsonb) TO scan_worker;

-- ═══════════════════════════════════════════════════════════════════════════
-- scan_worker_fail_task — report a scan-pipeline task failure. Non-fatal by
-- design (fatal-vs-retry is left to complete_agent_task's attempts/max_attempts
-- backoff, per 00297/00378); a p_fatal parameter can be added if a later wave
-- needs the worker to mark a class of error unrecoverable.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.scan_worker_fail_task(
  p_task_id uuid,
  p_error   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_task public.agent_tasks;
BEGIN
  SELECT * INTO v_task FROM public.agent_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'scan_worker_fail_task: task % not found', p_task_id;
  END IF;
  IF v_task.task_type NOT LIKE 'scan_pipeline.%' THEN
    RAISE EXCEPTION
      'scan_worker_fail_task: task % is task_type % — outside the scan_pipeline.%% namespace',
      p_task_id, v_task.task_type;
  END IF;
  IF v_task.locked_by IS NULL THEN
    RAISE EXCEPTION 'scan_worker_fail_task: task % has no active lease', p_task_id;
  END IF;

  PERFORM public.complete_agent_task(
    p_id       => p_task_id,
    p_outcome  => 'failed',
    p_error    => p_error,
    p_fatal    => false,
    p_actor    => v_task.locked_by
  );
END;
$$;

REVOKE ALL   ON FUNCTION public.scan_worker_fail_task(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.scan_worker_fail_task(uuid, text) TO scan_worker;

-- ═══════════════════════════════════════════════════════════════════════════
-- scan_worker_append_event — append a scan_pipeline_events row.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.scan_worker_append_event(
  p_scan_id      uuid,
  p_room_file_id uuid,
  p_stage        text,
  p_event        text,
  p_status       text DEFAULT 'info',
  p_duration_ms  integer DEFAULT NULL,
  p_detail       jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.room_scans WHERE id = p_scan_id) THEN
    RAISE EXCEPTION 'scan_worker_append_event: scan % not found', p_scan_id;
  END IF;
  IF p_status NOT IN ('started', 'succeeded', 'failed', 'info') THEN
    RAISE EXCEPTION 'scan_worker_append_event: invalid p_status %', p_status;
  END IF;

  INSERT INTO public.scan_pipeline_events (
    scan_id, room_file_id, stage, event, status, duration_ms, detail
  ) VALUES (
    p_scan_id, p_room_file_id, p_stage, p_event, p_status, p_duration_ms, coalesce(p_detail, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL   ON FUNCTION public.scan_worker_append_event(uuid, uuid, text, text, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.scan_worker_append_event(uuid, uuid, text, text, text, integer, jsonb) TO scan_worker;

-- ═══════════════════════════════════════════════════════════════════════════
-- scan_worker_update_room_file — merge verify/artifacts onto one room_files
-- row. Merge (not replace): artifacts is a kind -> {object_id, version} map,
-- so a jsonb `||` shallow-merge lets each stage write its own key without
-- clobbering another stage's already-landed artifact. verify is likewise
-- merged so a partial/duplicate verify delivery composes rather than
-- overwrites. Touches ONLY these two columns.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.scan_worker_update_room_file(
  p_room_file_id uuid,
  p_verify       jsonb DEFAULT NULL,
  p_artifacts    jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.room_files SET
    verify     = CASE WHEN p_verify    IS NULL THEN verify
                       ELSE coalesce(verify, '{}'::jsonb) || p_verify END,
    artifacts  = CASE WHEN p_artifacts IS NULL THEN artifacts
                       ELSE artifacts || p_artifacts END,
    updated_at = now()
  WHERE id = p_room_file_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'scan_worker_update_room_file: room_files % not found', p_room_file_id;
  END IF;
END;
$$;

REVOKE ALL   ON FUNCTION public.scan_worker_update_room_file(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.scan_worker_update_room_file(uuid, jsonb, jsonb) TO scan_worker;

-- ─── Negative-space: schema USAGE only as needed ────────────────────────────
GRANT USAGE ON SCHEMA public TO scan_worker;
GRANT USAGE ON SCHEMA public TO scan_reader;

-- ═══════════════════════════════════════════════════════════════════════════
-- scan_media_read — the future scan media read surface (W2 extends it).
-- Resolves room_files.artifacts (kind -> {object_id, version}) against
-- media_objects, so a reader gets kind/bucket/object_key/access_class without
-- ever touching a signed URL or the base tables directly.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.scan_media_read
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  mo.id,
  mo.version,
  af.kind,
  mo.bucket,
  mo.object_key,
  mo.access_class
FROM public.room_files rf
CROSS JOIN LATERAL jsonb_each(rf.artifacts) AS af(kind, ref)
JOIN public.media_objects mo
  ON mo.id = (af.ref ->> 'object_id')::uuid
 AND mo.version = coalesce((af.ref ->> 'version')::int, mo.version);

COMMENT ON VIEW public.scan_media_read IS
  '00490: minimal future read surface over media_objects, resolved through room_files.artifacts. W0 provisioning only — W2 extends it with the typed /v1/scan/* routes (plan §2 R5, §3 W2).';

REVOKE ALL PRIVILEGES ON TABLE public.scan_media_read
  FROM PUBLIC, anon, authenticated, service_role, scan_worker;
GRANT SELECT ON TABLE public.scan_media_read TO scan_reader;
