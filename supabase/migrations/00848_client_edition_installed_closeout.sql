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
-- 5. Lock order: the project row, then the edition lock (SQ-1725 R2/R3).
--    close_project and archive_project lock the projects row FOR UPDATE
--    first, and the freeze then takes the edition lock. An edition writer
--    that took the edition lock first and then needed the project (the FK
--    key-share of an INSERT, or a re-read after the close) deadlocked with
--    the close, or published on a job archived meanwhile. Now
--    _client_edition_lock takes the projects row FOR SHARE before the
--    advisory lock, so every writer that goes through it (begin, finish,
--    approve, hold, undo, the freeze) runs project → edition lock → child
--    rows, and re-checks the close after both. begin locks the project
--    before its request row; hold now refuses a closed job too. The
--    dispatcher's claim takes the project FOR SHARE SKIP LOCKED and never
--    leases a request of a closed job. A losing writer refuses with 55000.
--
-- 6. A closed job's plates keep what its edition showed (SQ-1725 R1). The
--    media worker keys each framing's renditions apart
--    (plates/<project>/<sha256>/f/<rev>/…, the crops naming <rev>) and
--    never rewrites a key with another framing (SQ-1728), so a re-crop
--    that settles late leaves the frozen bytes in place; the row's crops
--    are what the edition's URLs name, so the boundary is still
--    here: set_plate_focal and record_plate_perception lock
--    the project FOR SHARE and refuse a closed job (55000); a queued
--    re-crop (a request that keeps its asset) of a closed job is closed
--    by claim_client_plate_requests, status done, close_reason 'closed',
--    no row error, never leased; record_client_plate_asset on a closed
--    job leaves an existing plate as it is (concept_seen still only
--    rises, R142) and closes the request 'closed'. A first copy of new
--    bytes still lands. The rule is the closed job, not only the frozen
--    edition's plates: frozen implies closed, and a closed job composes
--    nothing that could use a new crop.
--
-- 7. The portfolio snapshot stays what the frozen edition hashed (R4): a
--    later close_project that would change projects.portfolio_snapshot
--    (NULL → a value included) refuses 55000; the same snapshot again
--    changes nothing and is allowed.
--
-- 8. Archived jobs with completion evidence (completed_at and a portfolio
--    snapshot: they were completed, then archived) freeze like completed
--    ones, in the backfill too (R5). An active job archived without a close
--    is closed but has nothing to freeze.
--
-- 9. list_client_editions also answers projectClosed, so the Press band
--    hides the studio's acts on a closed job even with no frozen edition
--    (R6).
--
-- Lineage:
--   _client_edition_frozen          00845 → 00848 (closed projects)
--   _client_edition_refuse_frozen   00845 → 00848 (closed message)
--   _client_edition_lock            00845 → 00848 (project FOR SHARE first)
--   begin_client_edition            00845 → 00848 (project before request)
--   hold_client_edition             00845 → 00848 (refuse_frozen guard)
--   undo_client_edition             00845 → 00848 (refuse_frozen guard)
--   claim_client_edition_requests   00845 → 00848 (project SHARE SKIP LOCKED)
--   dispatch_client_edition_compose 00845 → 00848 (close 'closed' requests)
--   set_plate_focal                 00845 → 00848 (refuse a closed job)
--   record_plate_perception         00845 → 00848 (refuse a closed job)
--   list_client_editions            00845 → 00848 (projectClosed)
--   claim_client_plate_requests     00843 → 00848 (close a closed job's re-crops)
--   record_client_plate_asset       00843 → 00848 (keep a closed job's plate)
--   client_plate_source_owned       00843 → 00848 (fail closed)
--   new: _client_edition_closed, _client_edition_freeze,
--        client_edition_freeze_on_close + trg_client_edition_freeze_on_close,
--        client_edition_keep_snapshot + trg_client_edition_keep_snapshot,
--        client_plate_requests.close_reason
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

-- ─── 2. Lock order: the project, then the edition lock ─────────────────────

-- One edition writer per project at a time (seq, today's count, the one
-- approved row). The projects row FOR SHARE first: close_project and
-- archive_project hold it FOR UPDATE before the freeze takes the advisory
-- lock, so a writer waits for a close outside the edition lock and its
-- later re-check sees the closed job (header 5).
CREATE OR REPLACE FUNCTION public._client_edition_lock(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR SHARE;
  PERFORM pg_advisory_xact_lock(hashtextextended('client_editions:' || p_project_id::text, 0));
END;
$$;

REVOKE ALL ON FUNCTION public._client_edition_lock(uuid) FROM PUBLIC, anon, authenticated;

-- ─── 3. The freeze ──────────────────────────────────────────────────────────

-- Freeze a closed-out project's approved edition: frozen_at and a pointer to
-- the portfolio snapshot close_project wrote. A completed project, or an
-- archived one with completion evidence (completed_at and a snapshot); an
-- active job archived without a close has none (header 8). Under the
-- per-project lock; the UPDATE runs after it, so it sees an approve that
-- committed meanwhile.
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
    AND (project.status = 'completed'
         OR (project.status = 'archived'
             AND project.completed_at IS NOT NULL
             AND project.portfolio_snapshot IS NOT NULL))
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

-- Projects closed out before this migration (_client_edition_freeze keeps
-- the completion-evidence rule for archived ones).
SELECT public._client_edition_freeze(project.id)
FROM public.projects AS project
WHERE project.status IN ('completed', 'archived')
  AND EXISTS (
    SELECT 1 FROM public.client_editions AS edition
    WHERE edition.project_id = project.id
      AND edition.status = 'approved'
      AND edition.frozen_at IS NULL);

-- The snapshot a frozen edition hashed stays put: a later close_project that
-- would change it (NULL → a value included) refuses (header 7). The same
-- snapshot again is no change and never reaches this trigger.
CREATE OR REPLACE FUNCTION public.client_edition_keep_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.client_editions AS edition
    WHERE edition.project_id = NEW.id
      AND edition.frozen_at IS NOT NULL
      AND edition.facts ? 'portfolioSnapshotRef') THEN
    RAISE EXCEPTION 'client_edition_frozen: this job is closed out; its portfolio snapshot no longer changes'
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'client_edition_frozen';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.client_edition_keep_snapshot() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_client_edition_keep_snapshot ON public.projects;
CREATE TRIGGER trg_client_edition_keep_snapshot
  BEFORE UPDATE OF portfolio_snapshot ON public.projects
  FOR EACH ROW
  WHEN (NEW.portfolio_snapshot IS DISTINCT FROM OLD.portfolio_snapshot)
  EXECUTE FUNCTION public.client_edition_keep_snapshot();

-- ─── 4. The studio's acts and begin refuse a closed job ─────────────────────

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

CREATE OR REPLACE FUNCTION public.hold_client_edition(p_edition_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_edition public.client_editions%ROWTYPE := public._client_edition_for_studio(p_edition_id);
BEGIN
  PERFORM public._client_edition_refuse_frozen(v_edition.project_id, v_edition.id);
  IF v_edition.status <> 'awaiting_review' THEN
    RAISE EXCEPTION 'edition % is %, not awaiting review', p_edition_id, v_edition.status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  UPDATE public.client_editions
  SET facts = jsonb_set(COALESCE(facts, '{}'::jsonb), '{held}', 'true'::jsonb)
  WHERE id = p_edition_id;
END;
$$;

REVOKE ALL ON FUNCTION public.hold_client_edition(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hold_client_edition(uuid) TO authenticated;

-- Open a drafting edition for a leased request. The project and the edition
-- lock before the request row (header 5); a request's project never changes,
-- so the unlocked read names the right one.
CREATE OR REPLACE FUNCTION public.begin_client_edition(p_request_id uuid, p_lease_token uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_request public.client_edition_requests%ROWTYPE;
  v_edition_id uuid;
BEGIN
  SELECT * INTO v_request FROM public.client_edition_requests WHERE id = p_request_id;
  IF FOUND THEN
    PERFORM public._client_edition_lock(v_request.project_id);
    SELECT * INTO v_request
    FROM public.client_edition_requests
    WHERE id = p_request_id
    FOR UPDATE;
  END IF;
  IF NOT FOUND
     OR v_request.status <> 'leased'
     OR v_request.lease_token IS DISTINCT FROM p_lease_token
     OR v_request.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'edition request % is not leased to this token', p_request_id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  PERFORM public._client_edition_refuse_frozen(v_request.project_id);

  IF (SELECT count(*) FROM public.client_editions AS edition
      WHERE edition.project_id = v_request.project_id
        AND edition.created_at::date = current_date) >= 2 THEN
    RAISE EXCEPTION 'client_edition_daily_limit: project % already has two editions today',
      v_request.project_id
      USING ERRCODE = 'program_limit_exceeded', HINT = 'client_edition_daily_limit';
  END IF;

  INSERT INTO public.client_editions (project_id, seq, status, lease_token, lease_expires_at)
  SELECT v_request.project_id,
         COALESCE(max(edition.seq), 0) + 1,
         'drafting',
         p_lease_token,
         now() + interval '10 minutes'
  FROM public.client_editions AS edition
  WHERE edition.project_id = v_request.project_id
  RETURNING id INTO v_edition_id;

  -- A new draft supersedes one the studio has not reviewed (held included).
  UPDATE public.client_editions
  SET status = 'superseded',
      superseded_at = now(),
      superseded_by = v_edition_id,
      lease_token = NULL,
      lease_expires_at = NULL
  WHERE project_id = v_request.project_id
    AND id <> v_edition_id
    AND status IN ('awaiting_review', 'drafting');

  -- This edition answers the request and every change already due.
  UPDATE public.client_edition_requests
  SET status = 'done',
      lease_token = NULL,
      lease_expires_at = NULL
  WHERE id = p_request_id
     OR (project_id = v_request.project_id
         AND status = 'queued'
         AND available_at <= now());

  RETURN v_edition_id;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_client_edition(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_client_edition(uuid, uuid) TO service_role;

-- ─── 5. The dispatcher closes a closed job's requests ───────────────────────

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

-- Lease up to p_limit available requests (10 minutes each), one per project.
-- A frozen project's queued requests are closed, never leased. The pick
-- takes the project FOR SHARE SKIP LOCKED: a close in flight holds it, so
-- its requests wait a tick, and a close that committed meanwhile fails the
-- re-checked status (header 5).
CREATE OR REPLACE FUNCTION public.claim_client_edition_requests(p_limit int DEFAULT 5)
RETURNS SETOF public.client_edition_requests
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  UPDATE public.client_edition_requests AS request
  SET status = 'done',
      close_reason = 'project closed out: its edition is frozen'
  WHERE request.status = 'queued'
    AND public._client_edition_frozen(request.project_id);

  WITH candidate AS (
    SELECT DISTINCT ON (request.project_id) request.id, request.available_at, request.created_at
    FROM public.client_edition_requests AS request
    WHERE request.status = 'queued'
      AND request.available_at <= now()
      AND public._client_edition_project_ready(request.project_id)
    ORDER BY request.project_id, request.available_at, request.created_at, request.id
  ),
  picked AS (
    SELECT request.id
    FROM public.client_edition_requests AS request
    JOIN candidate ON candidate.id = request.id
    JOIN public.projects AS project ON project.id = request.project_id
    WHERE request.status = 'queued'
      AND project.status NOT IN ('completed', 'archived')
    ORDER BY candidate.available_at, candidate.created_at, request.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 5), 1), 20)
    FOR UPDATE OF request SKIP LOCKED
    FOR SHARE OF project SKIP LOCKED
  )
  UPDATE public.client_edition_requests AS request
  SET status = 'leased',
      lease_token = extensions.gen_random_uuid(),
      lease_expires_at = now() + interval '10 minutes',
      attempts = request.attempts + 1
  FROM picked
  WHERE request.id = picked.id
  RETURNING request.*;
$$;

REVOKE ALL ON FUNCTION public.claim_client_edition_requests(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_client_edition_requests(int) TO service_role;

-- ─── 6. client_plate_source_owned fails closed ──────────────────────────────

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

-- ─── 7. A closed job's plates keep what its edition showed ──────────────────

-- Why a request ended without a fresh copy: 'closed' when a closed job's
-- re-crop or copy left its plate as it was (header 6).
ALTER TABLE public.client_plate_requests ADD COLUMN IF NOT EXISTS close_reason text;

-- A re-crop's first lock: the project FOR SHARE, so a close in flight is
-- waited for, then the refusal on a closed job.
CREATE OR REPLACE FUNCTION public._client_plate_refuse_closed(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR SHARE;
  IF public._client_edition_closed(p_project_id) THEN
    RAISE EXCEPTION 'client_edition_frozen: this job is closed; its pictures no longer change'
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'client_edition_frozen';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._client_plate_refuse_closed(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_plate_focal(
  p_asset_id uuid,
  p_subject_box numeric[],
  p_focal numeric[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_project_id uuid;
  v_source uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT asset.project_id INTO v_project_id
  FROM public.client_plate_assets AS asset WHERE asset.id = p_asset_id;
  IF NOT FOUND OR NOT COALESCE(public.can_buy_for_project(v_project_id), false) THEN
    RAISE EXCEPTION 'project not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_focal IS NULL OR NOT public._client_plate_frame_valid(p_subject_box, p_focal) THEN
    RAISE EXCEPTION 'subject box and focal must be normalised 0-1 inside the frame'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The project, then the source request before the asset (00843
  -- settlement order).
  PERFORM public._client_plate_refuse_closed(v_project_id);
  v_source := public._client_plate_lock_source(p_asset_id);
  UPDATE public.client_plate_assets
  SET subject_box = p_subject_box,
      focal = p_focal,
      focal_origin = 'designer',
      updated_at = now()
  WHERE id = p_asset_id;

  PERFORM public._client_plate_requeue(v_source);
END;
$$;

REVOKE ALL ON FUNCTION public.set_plate_focal(uuid, numeric[], numeric[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_plate_focal(uuid, numeric[], numeric[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_plate_perception(
  p_asset_id uuid,
  p_subject_box numeric[],
  p_focal numeric[],
  p_flags text[],
  p_alt text,
  p_prompt_version text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_before public.client_plate_assets%ROWTYPE;
  v_source uuid;
  v_project_id uuid;
BEGIN
  IF NOT public._client_plate_frame_valid(p_subject_box, p_focal) THEN
    RAISE EXCEPTION 'subject box and focal must be normalised 0-1 inside the frame'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(p_flags, '{}'::text[])) AS flag
             WHERE flag IS NULL OR flag NOT IN ('watermark', 'people', 'text_overlay')) THEN
    RAISE EXCEPTION 'plate flags are watermark, people or text_overlay'
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(btrim(p_alt)) > 125 THEN
    RAISE EXCEPTION 'perceived alt is at most 125 characters' USING ERRCODE = 'check_violation';
  END IF;
  IF NULLIF(btrim(p_prompt_version), '') IS NULL THEN
    RAISE EXCEPTION 'perception needs its prompt version' USING ERRCODE = 'check_violation';
  END IF;

  -- The project, then the source request before the asset (00843
  -- settlement order). An asset's project never changes.
  SELECT asset.project_id INTO v_project_id
  FROM public.client_plate_assets AS asset WHERE asset.id = p_asset_id;
  IF FOUND THEN
    PERFORM public._client_plate_refuse_closed(v_project_id);
  END IF;
  v_source := public._client_plate_lock_source(p_asset_id);
  SELECT * INTO v_before FROM public.client_plate_assets WHERE id = p_asset_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plate asset % not found', p_asset_id USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.client_plate_assets
  SET subject_box = CASE WHEN focal_origin = 'designer' THEN subject_box ELSE p_subject_box END,
      focal = CASE WHEN focal_origin = 'designer' THEN focal ELSE p_focal END,
      focal_origin = CASE
        WHEN focal_origin = 'designer' THEN 'designer'
        WHEN p_subject_box IS NULL AND p_focal IS NULL THEN focal_origin
        ELSE 'model'
      END,
      flags = COALESCE(p_flags, '{}'::text[]),
      perceived_alt = NULLIF(btrim(p_alt), ''),
      perceived_prompt_version = btrim(p_prompt_version),
      updated_at = now()
  WHERE id = p_asset_id;

  -- New model framing needs new crops; designer framing is never touched.
  IF v_before.focal_origin IS DISTINCT FROM 'designer'
     AND (v_before.subject_box IS DISTINCT FROM p_subject_box
          OR v_before.focal IS DISTINCT FROM p_focal) THEN
    PERFORM public._client_plate_requeue(v_source);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_plate_perception(uuid, numeric[], numeric[], text[], text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_plate_perception(uuid, numeric[], numeric[], text[], text, text)
  TO service_role;

-- Lease up to p_limit queued requests (10 minutes each; one token per row).
-- A closed job's queued re-crop (a request that keeps its asset) is closed
-- first, done with close_reason 'closed' and no error, never leased; its
-- first copies still are. The pick takes the project FOR SHARE SKIP LOCKED,
-- so a re-crop of a job whose close is in flight or committed meanwhile is
-- not leased either.
CREATE OR REPLACE FUNCTION public.claim_client_plate_requests(p_limit int DEFAULT 10)
RETURNS SETOF public.client_plate_requests
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  UPDATE public.client_plate_requests AS request
  SET status = 'done',
      close_reason = 'closed',
      last_error = NULL,
      updated_at = now()
  WHERE request.id IN (
    SELECT queued.id
    FROM public.client_plate_requests AS queued
    WHERE queued.status = 'queued'
      AND queued.asset_id IS NOT NULL
      AND public._client_edition_closed(queued.project_id)
    FOR UPDATE OF queued SKIP LOCKED);

  WITH picked AS (
    SELECT request.id
    FROM public.client_plate_requests AS request
    JOIN public.projects AS project ON project.id = request.project_id
    WHERE request.status = 'queued'
      AND (request.asset_id IS NULL OR project.status NOT IN ('completed', 'archived'))
    ORDER BY request.updated_at, request.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50)
    FOR UPDATE OF request SKIP LOCKED
    FOR SHARE OF project SKIP LOCKED
  )
  UPDATE public.client_plate_requests AS request
  SET status = 'leased',
      lease_token = extensions.gen_random_uuid(),
      lease_expires_at = now() + interval '10 minutes',
      attempts = request.attempts + 1,
      close_reason = NULL,
      updated_at = now()
  FROM picked
  WHERE request.id = picked.id
  RETURNING request.*;
$$;

-- The copy landed: upsert its asset on (project_id, sha256) and close the
-- request. The request row, not the payload, names the project and source.
-- On a closed job a plate it already holds stays as its edition showed it:
-- only concept_seen may rise (R142), and the request closes 'closed'. New
-- bytes still land as a new plate.
CREATE OR REPLACE FUNCTION public.record_client_plate_asset(
  p_request_id uuid,
  p_lease_token uuid,
  p_asset jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_request public.client_plate_requests%ROWTYPE;
  v_sha256 text := p_asset ->> 'sha256';
  v_asset_id uuid;
  v_kept boolean := false;
BEGIN
  -- The project first, then the request (00843 header: lock order). Key
  -- share conflicts with the FOR UPDATE close_project and archive_project
  -- take, so the closed check below sees a close that won.
  PERFORM 1 FROM public.projects AS project
  WHERE project.id = (SELECT request.project_id FROM public.client_plate_requests AS request
                      WHERE request.id = p_request_id)
  FOR KEY SHARE;

  SELECT * INTO v_request
  FROM public.client_plate_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_request.status <> 'leased'
     OR v_request.lease_token IS DISTINCT FROM p_lease_token
     OR v_request.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'plate request % is not leased to this token', p_request_id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF p_asset IS NULL OR jsonb_typeof(p_asset) <> 'object' THEN
    RAISE EXCEPTION 'plate asset must be an object' USING ERRCODE = 'check_violation';
  END IF;
  IF (p_asset ? 'source_kind' AND p_asset ->> 'source_kind' IS DISTINCT FROM v_request.source_kind)
     OR (p_asset ? 'source_ref' AND p_asset -> 'source_ref' IS DISTINCT FROM v_request.source_ref) THEN
    RAISE EXCEPTION 'plate asset names a different source than request %', p_request_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_sha256 IS NULL
     OR NOT (COALESCE(p_asset ->> 'originalKey', '')
             LIKE 'plates/' || v_request.project_id::text || '/' || v_sha256 || '/%') THEN
    RAISE EXCEPTION 'plate original must sit under plates/<project>/<sha256>/'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_asset ? 'crops' AND jsonb_typeof(p_asset -> 'crops') <> 'object' THEN
    RAISE EXCEPTION 'plate crops must be an object' USING ERRCODE = 'check_violation';
  END IF;

  IF public._client_edition_closed(v_request.project_id) THEN
    SELECT asset.id INTO v_asset_id
    FROM public.client_plate_assets AS asset
    WHERE asset.project_id = v_request.project_id
      AND asset.sha256 = v_sha256
    FOR UPDATE;
    v_kept := FOUND;
  END IF;

  IF v_kept THEN
    -- Deliberate exception (R142): concept_seen only rises, even on a closed job's kept asset.
    UPDATE public.client_plate_assets
    SET concept_seen = true,
        updated_at = now()
    WHERE id = v_asset_id
      AND v_request.source_kind = 'concept'
      AND NOT concept_seen;
  ELSE
    INSERT INTO public.client_plate_assets AS asset (
      project_id, sha256, source_kind, source_ref, concept_seen, original_key,
      width, height, ground, dominant_hex, lqip, crops
    ) VALUES (
      v_request.project_id, v_sha256, v_request.source_kind, v_request.source_ref,
      v_request.source_kind = 'concept',
      p_asset ->> 'originalKey',
      (p_asset ->> 'width')::int, (p_asset ->> 'height')::int,
      p_asset ->> 'ground', p_asset ->> 'dominantHex', p_asset ->> 'lqip',
      COALESCE(p_asset -> 'crops', '{}'::jsonb)
    )
    ON CONFLICT (project_id, sha256) DO UPDATE
    SET concept_seen = asset.concept_seen OR EXCLUDED.concept_seen,
        original_key = EXCLUDED.original_key,
        width = EXCLUDED.width,
        height = EXCLUDED.height,
        ground = EXCLUDED.ground,
        dominant_hex = EXCLUDED.dominant_hex,
        lqip = EXCLUDED.lqip,
        crops = EXCLUDED.crops,
        updated_at = now()
    RETURNING asset.id INTO v_asset_id;
  END IF;

  UPDATE public.client_plate_requests
  SET status = 'done',
      lease_token = NULL,
      lease_expires_at = NULL,
      last_error = NULL,
      asset_id = v_asset_id,
      close_reason = CASE WHEN v_kept THEN 'closed' END,
      updated_at = now()
  WHERE id = p_request_id;

  RETURN v_asset_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_client_plate_requests(int)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_client_plate_asset(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_client_plate_requests(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_client_plate_asset(uuid, uuid, jsonb) TO service_role;

-- ─── 8. The Press band learns the job is closed ─────────────────────────────

CREATE OR REPLACE FUNCTION public.list_client_editions(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR NOT COALESCE(public.can_buy_for_project(v_project.id), false) THEN
    RAISE EXCEPTION 'project not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'showMakers', v_project.show_makers,
    'projectClosed', public._client_edition_closed(v_project.id),
    'editions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', edition.id,
        'seq', edition.seq,
        'status', edition.status,
        'kind', edition.kind,
        'autoPublished', edition.auto_published,
        'held', COALESCE((edition.facts ->> 'held')::boolean, false),
        'approvedAt', edition.approved_at,
        'reviewedAt', edition.reviewed_at,
        'reviewedBy', CASE WHEN edition.reviewed_by IS NOT NULL THEN
          jsonb_build_object('id', edition.reviewed_by, 'name', reviewer.full_name) END,
        'createdAt', edition.created_at,
        'supersededAt', edition.superseded_at,
        'supersededBy', edition.superseded_by,
        'frozenAt', edition.frozen_at,
        'promptVersion', edition.prompt_version,
        'hero', edition.composition -> 'hero',
        'headlines', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'key', chapter.value -> 'key', 'headline', chapter.value -> 'headline')
                 ORDER BY chapter.ordinality)
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(edition.composition -> 'chapters') = 'array'
                 THEN edition.composition -> 'chapters' ELSE '[]'::jsonb END
          ) WITH ORDINALITY AS chapter(value, ordinality)
        ), '[]'::jsonb),
        'composition', edition.composition,
        'overrides', edition.overrides,
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'assetId', image.asset_id,
            'plateRole', image.plate_role,
            'cropKey', image.crop_key,
            'rank', image.rank,
            'chapterKey', image.chapter_key,
            'alt', image.alt,
            'captionWhat', image.caption_what,
            'captionWhose', image.caption_whose,
            'captionWhen', image.caption_when,
            'sourceKind', COALESCE(source.source_kind,
                            CASE WHEN asset.concept_seen OR asset.source_kind = 'concept'
                                 THEN 'concept' ELSE asset.source_kind END),
            'sourceUrl', source.source_url,
            'sourceTable', source.source_ref ->> 'table',
            -- 00846 get_client_project_edition's kind, the one its makers-off
            -- masking keys on: concept once any concept render produced the
            -- bytes, else the edition's frozen fact, else the first source.
            'attributionKind', CASE WHEN asset.concept_seen OR asset.source_kind = 'concept' THEN 'concept'
                                    ELSE COALESCE(fact.source_kind, asset.source_kind) END,
            'ground', asset.ground,
            'width', asset.width,
            'height', asset.height,
            'focal', to_jsonb(asset.focal),
            'subjectBox', to_jsonb(asset.subject_box),
            'focalOrigin', asset.focal_origin
          ) ORDER BY image.rank NULLS LAST, image.id)
          FROM public.client_edition_images AS image
          JOIN public.client_plate_assets AS asset ON asset.id = image.asset_id
          -- Kind, URL and table from one source row (the preview signs the URL
          -- in the kind's bucket); a concept source first (R142), then latest.
          LEFT JOIN LATERAL (
            SELECT request.source_kind, request.source_url, request.source_ref
            FROM public.client_plate_requests AS request
            WHERE request.asset_id = asset.id
            ORDER BY request.source_kind = 'concept' DESC, request.updated_at DESC, request.id
            LIMIT 1
          ) AS source ON true
          -- The asset's first entry in the edition's facts, as 00846 reads it.
          LEFT JOIN LATERAL (
            SELECT entry.value ->> 'sourceKind' AS source_kind
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(edition.facts -> 'assets') = 'array'
                   THEN edition.facts -> 'assets' ELSE '[]'::jsonb END
            ) WITH ORDINALITY AS entry(value, ordinality)
            WHERE lower(entry.value ->> 'id') = image.asset_id::text
            ORDER BY entry.ordinality
            LIMIT 1
          ) AS fact ON true
          WHERE image.edition_id = edition.id
        ), '[]'::jsonb)
      ) ORDER BY edition.seq DESC)
      FROM public.client_editions AS edition
      LEFT JOIN public.profiles AS reviewer ON reviewer.id = edition.reviewed_by
      WHERE edition.project_id = p_project_id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_client_editions(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_client_editions(uuid) TO authenticated;

COMMENT ON FUNCTION public.list_client_editions(uuid) IS
  'US-49 Press band: {showMakers, projectClosed, editions:[{id,seq,status,kind,autoPublished,held,approvedAt,reviewedAt,reviewedBy{id,name},createdAt,supersededAt,supersededBy,frozenAt,promptVersion,hero,headlines[{key,headline}],composition,overrides,images[{assetId,plateRole,cropKey,rank,chapterKey,alt,captionWhat,captionWhose,captionWhen,sourceKind,sourceUrl,sourceTable,attributionKind,ground,width,height,focal,subjectBox,focalOrigin}]}]} newest first. projectClosed is true once the job is completed or archived: the studio acts on none of its editions. Caller must hold can_buy_for_project.';
