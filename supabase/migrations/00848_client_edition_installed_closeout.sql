-- ═══════════════════════════════════════════════════════════════════════════
-- 00848 — The House Issue: close-out freezes the edition (US-49 W5, SQ-1595)
-- ═══════════════════════════════════════════════════════════════════════════
-- Scope. Close-out only. The installed-photo lane this ticket first named
-- (a Field site photo as an 'installed' plate) is deferred: field_captures
-- photos live in the private capture-media bucket under the designer's own
-- folder, carry no item, and a context photo's room is a public.rooms id,
-- not a project_rooms one. Whether a designer's Field captures may reach the
-- homeowner page waits on a ruling (the D1 question for scans). The lane is
-- a parked follow-up; nothing here enqueues or reads field_captures.
--
-- Closed. A project is closed when its status is 'completed' (close_project,
-- 00387/00399) or 'archived'. Both are terminal: 'completed' may only move
-- to 'archived', and 'archived' never changes (00399
-- guard_project_terminal_identity_integrity).
--
-- 1. The freeze. When a project enters 'completed', its approved edition
--    gets frozen_at = now() and facts.portfolioSnapshotRef, under the
--    per-project edition lock (_client_edition_lock, 00845), so a concurrent
--    approve either lands first and is frozen, or waits and is refused.
--    portfolioSnapshotRef points at projects.portfolio_snapshot (00238: the
--    jsonb close_project writes in the same UPDATE, { headline, description,
--    value_cents, duration, rooms }). It is a pointer and a sha256 of that
--    jsonb, never a copy: the snapshot carries value_cents, and facts are
--    the edition's record, not a second home for the studio's money.
--      { table: 'projects', column: 'portfolio_snapshot', id, present,
--        sha256 (hex, NULL when absent), closedAt (projects.completed_at) }
--    get_client_project_edition (00847) reads named facts fields only, so
--    the ref never reaches the homeowner. Approved editions of projects
--    completed before this migration are frozen the same way.
--
-- 2. The guards. _client_edition_frozen now also answers true for a closed
--    project. Everything that already asks it follows:
--      begin_client_edition, finish_client_edition, approve_client_edition
--        refuse through _client_edition_refuse_frozen (55000, hint
--        client_edition_frozen); a closed project gets its own plain message.
--      undo_client_edition also asks _client_edition_refuse_frozen (it only
--        checked the edition's own frozen_at).
--      _client_edition_project_ready is false, so the dispatcher's billing
--        guard never invokes compose for a closed project, and
--        claim_client_edition_requests closes such a queued row unclaimed.
--      client_edition_recompose_failed_draft (00847) queues no recovery for
--        a closed or frozen project (it already returns on
--        _client_edition_frozen).
--
-- 3. The dispatcher. dispatch_client_edition_compose marks a closed
--    project's queued requests done with close_reason 'closed' every tick,
--    whether composition is on or off. That includes the 'closed' request
--    00844's trg_client_edition_closed queues on the close itself. A leased
--    request is left to its lease holder (begin refuses; the lease expires).
--
-- 4. client_plate_source_owned fails closed. It answered TRUE for any table
--    it did not know, so a new lane that forgot an ownership rule signed
--    whatever path it named. Every table the plate enqueue triggers and the
--    00843 backfill emit now has its own rule, and any other table, such as
--    field_captures, is FALSE:
--      project_ffe_item_images  TRUE (public bucket: client-plate-copy
--                               copies by URL; never asks for a signature)
--      project_rooms            room-renders path <project>/<uuid>/…
--      room_scan_images         room-scans path under the scan's owner
--      project_boards           proposal-assets path of a proposal of the
--                               project
--    An http(s) URL on a known table stays TRUE, as before.
--
-- Lineage:
--   _client_edition_frozen          00845 → 00848 (closed projects)
--   _client_edition_refuse_frozen   00845 → 00848 (closed message)
--   undo_client_edition             00845 → 00848 (refuse_frozen guard)
--   dispatch_client_edition_compose 00845 → 00848 (close 'closed' requests)
--   client_plate_source_owned       00843 → 00848 (fail closed)
--   new: _client_edition_closed, _client_edition_freeze,
--        client_edition_freeze_on_close + trg_client_edition_freeze_on_close
-- Every redefined body is its latest text with only the delta above.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Closed ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._client_edition_closed(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects AS project
    WHERE project.id = p_project_id
      AND project.status IN ('completed', 'archived'));
$$;

-- A closed-out job: the project is closed, or the given edition or the
-- project's approved edition has frozen_at set. Nothing composes, finishes
-- or publishes over it.
CREATE OR REPLACE FUNCTION public._client_edition_frozen(p_project_id uuid, p_edition_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public._client_edition_closed(p_project_id)
    OR EXISTS (
      SELECT 1 FROM public.client_editions AS edition
      WHERE edition.project_id = p_project_id
        AND edition.frozen_at IS NOT NULL
        AND (edition.status = 'approved' OR edition.id = p_edition_id));
$$;

-- The refusal, taken under the per-project lock by begin, finish, approve
-- and undo.
CREATE OR REPLACE FUNCTION public._client_edition_refuse_frozen(p_project_id uuid, p_edition_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF public._client_edition_closed(p_project_id) THEN
    RAISE EXCEPTION 'client_edition_frozen: this job is closed; its editions no longer change'
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'client_edition_frozen';
  END IF;
  IF public._client_edition_frozen(p_project_id, p_edition_id) THEN
    RAISE EXCEPTION 'client_edition_frozen: this job is closed out and its edition is frozen'
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'client_edition_frozen';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._client_edition_closed(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._client_edition_frozen(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._client_edition_refuse_frozen(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ─── 2. The freeze ──────────────────────────────────────────────────────────

-- Freeze a completed project's approved edition: frozen_at and a pointer to
-- the portfolio snapshot close_project wrote. Under the per-project lock;
-- the UPDATE runs after it, so it sees an approve that committed meanwhile.
CREATE OR REPLACE FUNCTION public._client_edition_freeze(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public._client_edition_lock(p_project_id);
  UPDATE public.client_editions AS edition
  SET frozen_at = now(),
      facts = COALESCE(edition.facts, '{}'::jsonb) || jsonb_build_object(
        'portfolioSnapshotRef', jsonb_build_object(
          'table', 'projects',
          'column', 'portfolio_snapshot',
          'id', project.id,
          'present', project.portfolio_snapshot IS NOT NULL,
          'sha256', CASE WHEN project.portfolio_snapshot IS NULL THEN NULL
                         ELSE encode(sha256(convert_to(project.portfolio_snapshot::text, 'UTF8')), 'hex') END,
          'closedAt', project.completed_at))
  FROM public.projects AS project
  WHERE project.id = p_project_id
    AND project.status = 'completed'
    AND edition.project_id = project.id
    AND edition.status = 'approved'
    AND edition.frozen_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.client_edition_freeze_on_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public._client_edition_freeze(NEW.id);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._client_edition_freeze(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.client_edition_freeze_on_close() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_client_edition_freeze_on_close ON public.projects;
CREATE TRIGGER trg_client_edition_freeze_on_close
  AFTER UPDATE OF status ON public.projects
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.client_edition_freeze_on_close();

-- Projects completed before this migration.
SELECT public._client_edition_freeze(project.id)
FROM public.projects AS project
WHERE project.status = 'completed'
  AND EXISTS (
    SELECT 1 FROM public.client_editions AS edition
    WHERE edition.project_id = project.id
      AND edition.status = 'approved'
      AND edition.frozen_at IS NULL);

-- ─── 3. Undo refuses a closed job ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.undo_client_edition(p_edition_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_edition public.client_editions%ROWTYPE := public._client_edition_for_studio(p_edition_id);
  v_previous uuid;
BEGIN
  IF v_edition.status <> 'approved' THEN
    RAISE EXCEPTION 'edition % is %, not approved', p_edition_id, v_edition.status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF v_edition.frozen_at IS NOT NULL THEN
    RAISE EXCEPTION 'edition % is frozen', p_edition_id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  PERFORM public._client_edition_refuse_frozen(v_edition.project_id, v_edition.id);
  SELECT edition.id INTO v_previous
  FROM public.client_editions AS edition
  WHERE edition.superseded_by = p_edition_id
    AND edition.status = 'superseded'
    AND edition.approved_at IS NOT NULL
  ORDER BY edition.approved_at DESC, edition.seq DESC
  LIMIT 1
  FOR UPDATE;
  UPDATE public.client_editions
  SET status = 'superseded', superseded_at = now(), superseded_by = NULL
  WHERE id = p_edition_id;
  IF v_previous IS NOT NULL THEN
    UPDATE public.client_editions
    SET status = 'approved', superseded_at = NULL, superseded_by = NULL
    WHERE id = v_previous;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.undo_client_edition(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.undo_client_edition(uuid) TO authenticated;

-- ─── 4. The dispatcher closes a closed job's requests ───────────────────────

-- Every minute: expire leases, close runs that never reported back, close a
-- closed project's queued requests, then — only while composition is
-- enabled and a request is claimable — open a job_runs row and invoke the
-- function.
CREATE OR REPLACE FUNCTION public.dispatch_client_edition_compose()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_run_id bigint;
  v_request_id bigint;
BEGIN
  -- An expired lease whose reason was queued again meanwhile is answered by
  -- that queued row; the rest go back to the queue (failed after three).
  UPDATE public.client_edition_requests AS request
  SET status = 'done',
      lease_token = NULL,
      lease_expires_at = NULL
  WHERE request.status = 'leased'
    AND request.lease_expires_at <= now()
    AND EXISTS (
      SELECT 1 FROM public.client_edition_requests AS queued
      WHERE queued.debounce_key = request.debounce_key
        AND queued.status = 'queued');

  UPDATE public.client_edition_requests
  SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END,
      lease_token = NULL,
      lease_expires_at = NULL
  WHERE status = 'leased'
    AND lease_expires_at <= now();

  -- A draft whose run never finished.
  UPDATE public.client_editions
  SET status = 'failed',
      facts = COALESCE(facts, '{}'::jsonb) || jsonb_build_object('error', 'lease expired'),
      lease_token = NULL,
      lease_expires_at = NULL
  WHERE status = 'drafting'
    AND lease_expires_at <= now();

  -- A run that never reported back is closed so it does not pile up.
  UPDATE public.job_runs
  SET status = 'failed', finished_at = now(), error = 'no completion reported'
  WHERE job_name = 'client-edition-compose'
    AND status = 'running'
    AND started_at < now() - interval '10 minutes';

  -- A closed project composes nothing more: its queued requests are done.
  UPDATE public.client_edition_requests AS request
  SET status = 'done',
      close_reason = 'closed'
  WHERE request.status = 'queued'
    AND public._client_edition_closed(request.project_id);

  -- Kill switch: composition off → requests wait, approved editions still render.
  IF NOT EXISTS (
    SELECT 1 FROM public.llm_feature_controls AS control
    WHERE control.feature = 'client-edition-compose' AND control.enabled
  ) THEN
    RETURN NULL;
  END IF;

  -- Billing guard: nothing claimable → no row, no request.
  IF NOT EXISTS (
    SELECT 1
    FROM public.client_edition_requests AS request
    WHERE request.status = 'queued'
      AND request.available_at <= now()
      AND public._client_edition_project_ready(request.project_id)
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.job_runs (job_name, status, detail)
  VALUES (
    'client-edition-compose',
    'running',
    jsonb_build_object('trigger', 'cron', 'dispatch_state', 'starting')
  )
  RETURNING id INTO v_run_id;

  BEGIN
    SELECT public.invoke_edge_function(
      'client-edition-compose',
      jsonb_build_object('job_run_id', v_run_id)
    )
    INTO v_request_id;

    IF v_request_id IS NULL THEN
      UPDATE public.job_runs
      SET status = 'failed',
          finished_at = now(),
          error = 'edge dispatch skipped: Supabase URL/service key unavailable',
          detail = detail || jsonb_build_object('dispatch_state', 'not_sent')
      WHERE id = v_run_id;
    ELSE
      UPDATE public.job_runs
      SET detail = detail || jsonb_build_object('dispatch_state', 'sent', 'request_id', v_request_id)
      WHERE id = v_run_id;
      -- The edge function owns the terminal update via
      -- finish_client_edition_compose_run(). Enqueue success is not job success.
    END IF;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.job_runs
    SET status = 'failed',
        finished_at = now(),
        error = SQLERRM,
        detail = detail || jsonb_build_object('dispatch_state', 'error')
    WHERE id = v_run_id;
  END;

  RETURN v_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_client_edition_compose()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_client_edition_compose() TO service_role;

-- ─── 5. client_plate_source_owned fails closed ──────────────────────────────

CREATE OR REPLACE FUNCTION public.client_plate_source_owned(
  p_project_id uuid, p_table text, p_id uuid, p_source_url text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN COALESCE(p_table, '') NOT IN
      ('project_ffe_item_images', 'project_rooms', 'room_scan_images', 'project_boards') THEN false
    WHEN p_table = 'project_ffe_item_images'
      OR target.path ~* '^https?://' THEN true
    WHEN p_project_id IS NULL
      OR target.path ~* '(^|/)(\.|%2e){0,2}(/|$)' THEN false
    WHEN p_table = 'project_rooms' THEN
      target.path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.+$'
      AND lower(target.folder[1]) = p_project_id::text
    WHEN p_table = 'room_scan_images' THEN EXISTS (
      SELECT 1
      FROM public.room_scan_images AS still
      JOIN public.room_scans AS scan ON scan.id = still.scan_id
      WHERE still.id = p_id
        AND scan.project_id = p_project_id
        AND scan.user_id::text = target.folder[2]
        AND (scan.id::text = target.folder[3] OR scan.room_id::text = target.folder[3])
    )
    ELSE EXISTS (
      SELECT 1
      FROM public.proposals AS proposal
      WHERE proposal.id::text = target.folder[1]
        AND proposal.project_id = p_project_id
    )
  END
  FROM (
    SELECT address.path, storage.foldername(address.path) AS folder
    FROM (SELECT ltrim(btrim(COALESCE(p_source_url, '')), '/') AS path) AS address
  ) AS target;
$$;

REVOKE ALL ON FUNCTION public.client_plate_source_owned(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_plate_source_owned(uuid, text, uuid, text) TO service_role;
