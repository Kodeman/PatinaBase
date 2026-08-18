-- ═══════════════════════════════════════════════════════════════════════════
-- 00492 — Room File version monotonicity on scan_worker_update_room_file
--         (Rendered Room v2 · W2)
--
-- Lineage: scan_worker_update_room_file was first authored in 00490 and has
-- not been redefined since (`grep -rln "CREATE OR REPLACE FUNCTION[^(]*
-- scan_worker_update_room_file" supabase/migrations/*.sql | sort | tail -1`
-- → 00490). The body below is 00490's, verbatim, with ONE gate grafted on.
--
-- ─── What this closes ───────────────────────────────────────────────────────
-- `room_files` is append-only: a re-scan or re-solve mints a new
-- (scan_id, version) row (00341, `room_files_scan_version_uniq`). A Modal stage
-- is dispatched against ONE room-file version and can run for 25 minutes. In
-- that window a newer solve can land a newer version — and until now nothing
-- stopped the older invocation from merging its result onto the row it was
-- dispatched for, publishing measurements and artifacts computed against
-- superseded geometry.
--
-- The lease gate does not cover this. A lease proves the CALLER is still the
-- live worker for its task; it says nothing about whether the GEOMETRY that
-- task was dispatched for is still current. Both tasks can hold perfectly valid
-- leases on different rows at the same time.
--
-- ─── WHAT THIS ACTUALLY GUARANTEES, AND WHAT IT DOES NOT ────────────────────
-- Read the claim narrowly, because the difference matters operationally.
--
-- What it closes: the ~25-MINUTE window. Before this migration a stage that
-- started before a newer solve landed would merge its result whenever it
-- finished, minutes or tens of minutes later. That is the real, routinely-hit
-- race, and it is now gone — the target row is read FOR UPDATE, the max is
-- computed, and the merge happens under that same lock.
--
-- What REMAINS: a microsecond-scale window between the max(version) read and
-- this transaction's commit. The version-INSERT path (the worker's
-- `reserve_room_file`, services/scan-pipeline/src/patina_scan_worker/db.py)
-- takes no shared lock against the scan, so a concurrent insert of version N+1
-- can land in that gap and this transaction will still commit against version N
-- believing it was current. Nothing here can prevent that: FOR UPDATE locks
-- rows that EXIST, and the racing row does not exist yet when the max is read.
-- Closing it fully needs the insert side to serialize too — an advisory lock or
-- a lock on the parent room_scans row taken by BOTH paths.
--
-- That residual is ACCEPTED, deliberately, not overlooked. The exposure shrinks
-- from tens of minutes to the length of one UPDATE, and buying the last of it
-- means changing a function this migration does not own, in a service with its
-- own deploy cycle, for a race that requires an insert to land inside a
-- microsecond window. It is a W3 item: the Python worker's credential migration
-- (plan §3 W3) already reworks `storage.py` and the worker's DB access, so
-- `reserve_room_file` is being touched there anyway and the shared lock costs
-- almost nothing to add in that pass. Until then, treat "the newest version
-- wins" as true at minute scale and not provable at microsecond scale.
--
-- W1 documented the hole as a strict xfail in
-- services/scan-modal/tests/test_golden_cases.py
-- (`test_stale_room_file_version_is_not_yet_rejected`). This migration is the
-- gate that xfail was waiting for; that test now asserts the refusal instead.
--
-- ─── Why a DEDICATED ERRCODE (P0404), not P0403 and not a generic error ─────
-- "your lease is gone" and "the room file you were dispatched for has been
-- superseded" are different facts with the same correct RESPONSE (exit clean,
-- write nothing, never fail_task) but different meanings in the event log. A
-- worker that could not tell them apart would report the wrong one, and one
-- that read either as a generic failure would call scan_worker_fail_task —
-- requeueing obsolete work for another 25 minutes of L4 to reproduce the same
-- obsolete answer. `scan_modal.io.db` maps P0403 → LeaseRejected and
-- P0404 → StaleVersion; both job paths exit clean.
--
-- ─── Grants: deliberately NOT restated ──────────────────────────────────────
-- CREATE OR REPLACE FUNCTION on an UNCHANGED signature preserves the object's
-- existing ACL, so 00490's
--   REVOKE ALL ... FROM PUBLIC, anon, authenticated;
--   GRANT EXECUTE ... TO scan_worker;
-- still stands after this replace. The grant surface is therefore unchanged by
-- this migration, seed/00-legacy-grants.sql does not need regenerating, and the
-- ACL conformance test (supabase/tests/scan_pipeline/scan_roles_conformance_test.sql)
-- needs no new row. Restating the grants here would have been harmless at
-- runtime but would have churned the generated seed for no change in posture.
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
  v_task              public.agent_tasks;
  v_payload_rf        text;
  v_payload_scan      text;
  v_room_file_scan    uuid;
  v_room_file_version integer;
  v_max_version       integer;
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

  -- FOR UPDATE on the target row: the version check and the merge share one
  -- lock, so nothing can modify THIS row between them. It does not lock rows
  -- that do not exist yet — see the header on the residual insert-side window.
  SELECT rf.scan_id, rf.version INTO v_room_file_scan, v_room_file_version
    FROM public.room_files rf WHERE rf.id = p_room_file_id FOR UPDATE;
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

  -- ─── 00492: version monotonicity ──────────────────────────────────────────
  -- The target must still be the NEWEST room file for its scan. A room_files
  -- row with a NULL scan_id has no sibling set to be newest within, so it is
  -- exempt rather than refused — refusing it would break a legitimate write on
  -- a technicality of a nullable column.
  -- This max() is a plain read: it cannot see, or wait for, an uncommitted
  -- insert of a newer version. Header, "what remains".
  IF v_room_file_scan IS NOT NULL THEN
    SELECT max(rf.version) INTO v_max_version
      FROM public.room_files rf WHERE rf.scan_id = v_room_file_scan;
    IF v_max_version IS NOT NULL AND v_room_file_version < v_max_version THEN
      RAISE EXCEPTION
        'scan_worker_update_room_file: room file % is version % but scan % is at version % — superseded',
        p_room_file_id, v_room_file_version, v_room_file_scan, v_max_version
        USING ERRCODE = 'P0404';
    END IF;
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

COMMENT ON FUNCTION public.scan_worker_update_room_file(uuid, text, uuid, jsonb, jsonb) IS
  '00490 + 00492: merge verify/artifacts onto ONE room_files row as the scan_worker role. Four gates: task_type namespace, lease ownership (P0403), task↔room-file binding, and version monotonicity — the target must still be max(version) for its scan or the write is refused with P0404 (00492). Both P0403 and P0404 mean "exit clean, write nothing, never fail_task".';
