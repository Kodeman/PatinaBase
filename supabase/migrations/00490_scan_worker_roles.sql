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
-- ─── LEASE INTEGRITY (p_lease_owner) — the reason every wrapper takes it ────
-- Every wrapper takes `p_lease_owner` and refuses unless it equals the task
-- row's CURRENT `locked_by`, read `FOR UPDATE` so the check and the act share
-- one lock (no TOCTOU window between "is my lease live?" and "write").
--
-- The token is minted PER DISPATCHER INVOCATION
-- (`dispatch-scan-modal:<uuid>`), used as `claim_agent_tasks`' `p_worker`, and
-- handed to Modal in the spawn body as `leaseToken`. So a Modal invocation
-- whose lease has since expired and been re-claimed by a later dispatcher tick
-- carries a token that no longer matches `locked_by`, and every one of its
-- writes is refused.
--
-- That refusal is raised with the dedicated ERRCODE 'P0403' precisely so the
-- worker can tell it apart from a real failure: a stale invocation that caught
-- a generic error would call `scan_worker_fail_task` and requeue a task
-- another worker is actively running — the duplicate-GPU-spawn amplification
-- this whole mechanism exists to prevent. `scan_modal.io.db` maps P0403 to
-- `LeaseRejected`, and `verify_job` exits clean on it without failing anything.
--
-- An earlier draft forwarded the row's own `locked_by` as `p_actor`, which
-- satisfied `complete_agent_task`'s non-empty check but could never
-- distinguish a stale invocation from the live lease holder. `p_lease_owner`
-- replaces that: it is both the gate AND what is forwarded as `p_actor`, so
-- the audit trail names the invocation that actually did the work.
-- ═══════════════════════════════════════════════════════════════════════════

-- The pre-amendment signatures (00490 as first authored, before the lease
-- parameter) never reached staging or prod, but may exist on a developer's
-- local database. Dropping them keeps a stale body from lingering as an
-- OVERLOAD of the same name — which would still satisfy the conformance
-- test's proname-keyed grant assertions while being callable without a lease.
DROP FUNCTION IF EXISTS public.scan_worker_complete_task(uuid, jsonb);
DROP FUNCTION IF EXISTS public.scan_worker_fail_task(uuid, text);
DROP FUNCTION IF EXISTS public.scan_worker_append_event(uuid, uuid, text, text, text, integer, jsonb);
DROP FUNCTION IF EXISTS public.scan_worker_update_room_file(uuid, jsonb, jsonb);

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
  p_task_id     uuid,
  p_lease_owner text,
  p_result      jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_task public.agent_tasks;
BEGIN
  -- FOR UPDATE: the lease check and the completion share one row lock, so a
  -- concurrent re-claim cannot slip between them.
  SELECT * INTO v_task FROM public.agent_tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'scan_worker_complete_task: task % not found', p_task_id;
  END IF;
  IF v_task.task_type NOT LIKE 'scan_pipeline.%' THEN
    RAISE EXCEPTION
      'scan_worker_complete_task: task % is task_type % — outside the scan_pipeline.%% namespace',
      p_task_id, v_task.task_type;
  END IF;
  IF p_lease_owner IS NULL OR btrim(p_lease_owner) = ''
     OR v_task.locked_by IS DISTINCT FROM p_lease_owner THEN
    RAISE EXCEPTION 'scan_worker_complete_task: task % is not held by this lease', p_task_id
      USING ERRCODE = 'P0403';
  END IF;

  PERFORM public.complete_agent_task(
    p_id         => p_task_id,
    p_outcome    => 'done',
    p_artifacts  => coalesce(p_result, '{}'::jsonb),
    p_actor      => p_lease_owner
  );
END;
$$;

REVOKE ALL   ON FUNCTION public.scan_worker_complete_task(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.scan_worker_complete_task(uuid, text, jsonb) TO scan_worker;

-- ═══════════════════════════════════════════════════════════════════════════
-- scan_worker_fail_task — report a scan-pipeline task failure. Non-fatal by
-- design (fatal-vs-retry is left to complete_agent_task's attempts/max_attempts
-- backoff, per 00297/00378); a p_fatal parameter can be added if a later wave
-- needs the worker to mark a class of error unrecoverable.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.scan_worker_fail_task(
  p_task_id     uuid,
  p_lease_owner text,
  p_error       text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_task public.agent_tasks;
BEGIN
  SELECT * INTO v_task FROM public.agent_tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'scan_worker_fail_task: task % not found', p_task_id;
  END IF;
  IF v_task.task_type NOT LIKE 'scan_pipeline.%' THEN
    RAISE EXCEPTION
      'scan_worker_fail_task: task % is task_type % — outside the scan_pipeline.%% namespace',
      p_task_id, v_task.task_type;
  END IF;
  -- The most important of the four gates: without it a stale invocation could
  -- requeue a task a live worker is running, doubling the GPU spend.
  IF p_lease_owner IS NULL OR btrim(p_lease_owner) = ''
     OR v_task.locked_by IS DISTINCT FROM p_lease_owner THEN
    RAISE EXCEPTION 'scan_worker_fail_task: task % is not held by this lease', p_task_id
      USING ERRCODE = 'P0403';
  END IF;

  PERFORM public.complete_agent_task(
    p_id       => p_task_id,
    p_outcome  => 'failed',
    p_error    => p_error,
    p_fatal    => false,
    p_actor    => p_lease_owner
  );
END;
$$;

REVOKE ALL   ON FUNCTION public.scan_worker_fail_task(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.scan_worker_fail_task(uuid, text, text) TO scan_worker;

-- ═══════════════════════════════════════════════════════════════════════════
-- scan_worker_append_event — append a scan_pipeline_events row.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.scan_worker_append_event(
  p_task_id      uuid,
  p_lease_owner  text,
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
  v_id   uuid;
  v_task public.agent_tasks;
BEGIN
  SELECT * INTO v_task FROM public.agent_tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'scan_worker_append_event: task % not found', p_task_id;
  END IF;
  IF v_task.task_type NOT LIKE 'scan_pipeline.%' THEN
    RAISE EXCEPTION
      'scan_worker_append_event: task % is task_type % — outside the scan_pipeline.%% namespace',
      p_task_id, v_task.task_type;
  END IF;
  IF p_lease_owner IS NULL OR btrim(p_lease_owner) = ''
     OR v_task.locked_by IS DISTINCT FROM p_lease_owner THEN
    RAISE EXCEPTION 'scan_worker_append_event: task % is not held by this lease', p_task_id
      USING ERRCODE = 'P0403';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.room_scans WHERE id = p_scan_id) THEN
    RAISE EXCEPTION 'scan_worker_append_event: scan % not found', p_scan_id;
  END IF;
  -- A room file belongs to exactly one scan; an event that names both must not
  -- be able to file one scan's progress under another scan's room file.
  IF p_room_file_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.room_files rf
     WHERE rf.id = p_room_file_id AND rf.scan_id = p_scan_id
  ) THEN
    RAISE EXCEPTION
      'scan_worker_append_event: room file % does not belong to scan %',
      p_room_file_id, p_scan_id;
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

REVOKE ALL   ON FUNCTION public.scan_worker_append_event(uuid, text, uuid, uuid, text, text, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.scan_worker_append_event(uuid, text, uuid, uuid, text, text, text, integer, jsonb) TO scan_worker;

-- ═══════════════════════════════════════════════════════════════════════════
-- scan_worker_update_room_file — merge verify/artifacts onto one room_files
-- row. Merge (not replace): artifacts is a kind -> {object_id, version} map,
-- so a jsonb `||` shallow-merge lets each stage write its own key without
-- clobbering another stage's already-landed artifact. verify is likewise
-- merged so a partial/duplicate verify delivery composes rather than
-- overwrites. Touches ONLY these two columns.
--
-- Doubly bound. The lease gate proves the CALLER is the live worker; the
-- task-binding check proves the ROOM FILE is the one this task was dispatched
-- for. Neither implies the other: a live lease on task A must not be usable to
-- write task B's room file, so the task payload's own roomFileId/scanId is the
-- authority for which row this call may touch. A payload naming neither is
-- refused rather than trusted.
--
-- `||` on a jsonb SCALAR is array concatenation, not a merge, so a non-object
-- p_verify/p_artifacts would corrupt the column into an array instead of
-- erroring. Both are type-checked before the merge.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.scan_worker_update_room_file(
  p_task_id      uuid,
  p_lease_owner  text,
  p_room_file_id uuid,
  p_verify       jsonb DEFAULT NULL,
  p_artifacts    jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_task            public.agent_tasks;
  v_payload_rf      text;
  v_payload_scan    text;
  v_room_file_scan  uuid;
BEGIN
  IF p_verify IS NOT NULL AND jsonb_typeof(p_verify) <> 'object' THEN
    RAISE EXCEPTION 'scan_worker_update_room_file: p_verify must be a jsonb object, got %',
      jsonb_typeof(p_verify);
  END IF;
  IF p_artifacts IS NOT NULL AND jsonb_typeof(p_artifacts) <> 'object' THEN
    RAISE EXCEPTION 'scan_worker_update_room_file: p_artifacts must be a jsonb object, got %',
      jsonb_typeof(p_artifacts);
  END IF;

  SELECT * INTO v_task FROM public.agent_tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'scan_worker_update_room_file: task % not found', p_task_id;
  END IF;
  IF v_task.task_type NOT LIKE 'scan_pipeline.%' THEN
    RAISE EXCEPTION
      'scan_worker_update_room_file: task % is task_type % — outside the scan_pipeline.%% namespace',
      p_task_id, v_task.task_type;
  END IF;
  IF p_lease_owner IS NULL OR btrim(p_lease_owner) = ''
     OR v_task.locked_by IS DISTINCT FROM p_lease_owner THEN
    RAISE EXCEPTION 'scan_worker_update_room_file: task % is not held by this lease', p_task_id
      USING ERRCODE = 'P0403';
  END IF;

  SELECT rf.scan_id INTO v_room_file_scan
    FROM public.room_files rf WHERE rf.id = p_room_file_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'scan_worker_update_room_file: room_files % not found', p_room_file_id;
  END IF;

  v_payload_rf   := v_task.payload ->> 'roomFileId';
  v_payload_scan := v_task.payload ->> 'scanId';

  IF v_payload_rf IS NOT NULL THEN
    IF v_payload_rf <> p_room_file_id::text THEN
      RAISE EXCEPTION
        'scan_worker_update_room_file: task % is not dispatched for room file %',
        p_task_id, p_room_file_id;
    END IF;
  ELSIF v_payload_scan IS NOT NULL THEN
    IF v_room_file_scan IS NULL OR v_payload_scan <> v_room_file_scan::text THEN
      RAISE EXCEPTION
        'scan_worker_update_room_file: task % is not dispatched for room file %''s scan',
        p_task_id, p_room_file_id;
    END IF;
  ELSE
    RAISE EXCEPTION
      'scan_worker_update_room_file: task % payload names neither roomFileId nor scanId',
      p_task_id;
  END IF;

  UPDATE public.room_files SET
    verify     = CASE WHEN p_verify    IS NULL THEN verify
                       ELSE coalesce(verify, '{}'::jsonb) || p_verify END,
    artifacts  = CASE WHEN p_artifacts IS NULL THEN artifacts
                       ELSE artifacts || p_artifacts END,
    updated_at = now()
  WHERE id = p_room_file_id;
END;
$$;

REVOKE ALL   ON FUNCTION public.scan_worker_update_room_file(uuid, text, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.scan_worker_update_room_file(uuid, text, uuid, jsonb, jsonb) TO scan_worker;

-- ─── Negative-space: schema USAGE only as needed ────────────────────────────
GRANT USAGE ON SCHEMA public TO scan_worker;
GRANT USAGE ON SCHEMA public TO scan_reader;

-- ═══════════════════════════════════════════════════════════════════════════
-- scan_media_read — the future scan media read surface (W2 extends it).
-- Resolves room_files.artifacts (kind -> {object_id, version}) against
-- media_objects, so a reader gets kind/bucket/object_key/access_class without
-- ever touching a signed URL or the base tables directly.
--
-- ⚠ W2 MUST ADD A TENANT PREDICATE BEFORE scan_reader_login IS PROVISIONED —
-- as built this is a service-shaped full-inventory view. `security_invoker =
-- false` means it runs as the OWNER, so the base tables' RLS never applies to
-- the reader, and there is no WHERE clause binding rows to a caller: any role
-- holding SELECT on it sees EVERY registered scan artifact in the database.
-- That is survivable only while the sole grantee (`scan_reader`) is a NOLOGIN
-- role no credential can reach. The moment a LOGIN role inherits it, this view
-- is a cross-tenant inventory read.
--
-- The version leg is deliberately NOT part of the join: media_objects.version
-- is informational (it counts re-registrations of the same key), so matching
-- on it made an artifact ref silently resolve to NOTHING the moment the object
-- was re-registered — a stale pointer read as "no such artifact" rather than
-- as the artifact it names. The ref's own recorded version is not carried
-- here; `id` is the identity.
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
-- jsonb_each() errors on a non-object; artifacts is jsonb, so a scalar written
-- into it would take the whole view down rather than skipping one row.
WHERE jsonb_typeof(rf.artifacts) = 'object';

COMMENT ON VIEW public.scan_media_read IS
  '00490: minimal future read surface over media_objects, resolved through room_files.artifacts. W0 provisioning only — W2 extends it with the typed /v1/scan/* routes (plan §2 R5, §3 W2). ⚠ NO TENANT PREDICATE: runs as owner over every room_files row, so W2 must add one before scan_reader_login is provisioned.';

REVOKE ALL PRIVILEGES ON TABLE public.scan_media_read
  FROM PUBLIC, anon, authenticated, service_role, scan_worker;
GRANT SELECT ON TABLE public.scan_media_read TO scan_reader;
