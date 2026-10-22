-- ═══════════════════════════════════════════════════════════════════════════
-- 00853 — One private closing draft, then the studio's frozen final issue
-- US-49 D3 / SQ-1748. Lineage: edition writers 00845 → 00848;
-- request recovery 00847; editorial capture calls the latest 00852 builder.
-- The project FOR SHARE → advisory → child-row order is unchanged. Only a
-- SQL-created closing draft may compose, finish, Hold or Approve after close.
-- The prior approved issue stays frozen until the studio approves this one.
-- Private portfolio_snapshot is retained in service-only facts, never listed
-- or passed through the composer's allowlisted prompts. No historic backfill.
-- Existing RLS/grants are retained; no RPC signatures change.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.client_edition_requests
  ADD COLUMN IF NOT EXISTS closing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closing_facts jsonb;
ALTER TABLE public.client_editions
  ADD COLUMN IF NOT EXISTS closing boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_edition_requests_closing
  ON public.client_edition_requests(project_id) WHERE closing;
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_editions_closing
  ON public.client_editions(project_id) WHERE closing;

CREATE OR REPLACE FUNCTION public._client_edition_refuse_frozen(p_project_id uuid, p_edition_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- Only the server-created closing draft can pass the closed boundary.
  IF public._client_edition_closed(p_project_id) AND EXISTS (
    SELECT 1 FROM public.client_editions
    WHERE id = p_edition_id AND project_id = p_project_id AND closing
      AND status IN ('drafting', 'awaiting_review') AND frozen_at IS NULL
  ) THEN
    RETURN;
  END IF;
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
         OR (edition.closing AND project.status = 'archived')
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
  -- The project row is already locked by close_project/archive_project.
  -- Capture the latest 00852 editorial envelope once, not when cron runs.
  INSERT INTO public.client_edition_requests (
    project_id, reason, debounce_key, closing, closing_facts, available_at
  )
  SELECT NEW.id, 'closing', NEW.id::text || ':closing', true,
    jsonb_set(public.get_project_editorial_facts(NEW.id), '{project,phase}', '"final_walkthrough"'::jsonb)
    || jsonb_build_object(
      'closing', true,
      'portfolio_snapshot', NEW.portfolio_snapshot,
      'portfolioSnapshotRef', jsonb_build_object(
        'table', 'projects', 'column', 'portfolio_snapshot', 'id', NEW.id,
        'present', NEW.portfolio_snapshot IS NOT NULL,
        'sha256', CASE WHEN NEW.portfolio_snapshot IS NULL THEN NULL
          ELSE encode(sha256(convert_to(NEW.portfolio_snapshot::text, 'UTF8')), 'hex') END,
        'closedAt', COALESCE(NEW.completed_at, now()))),
    now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.client_editions WHERE project_id = NEW.id AND closing AND status = 'approved')
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$$;

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
      AND edition.facts ? 'portfolioSnapshotRef')
    OR EXISTS (SELECT 1 FROM public.client_edition_requests
      WHERE project_id = NEW.id AND closing) THEN
    RAISE EXCEPTION 'client_edition_frozen: this job is closed out; its portfolio snapshot no longer changes'
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'client_edition_frozen';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._client_edition_project_ready(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects AS project WHERE project.id = p_project_id)
    AND (NOT public._client_edition_frozen(p_project_id) OR (
      public._client_edition_closed(p_project_id)
      AND EXISTS (SELECT 1 FROM public.client_edition_requests
        WHERE project_id = p_project_id AND closing AND status = 'queued')
      AND NOT EXISTS (SELECT 1 FROM public.client_editions
        WHERE project_id = p_project_id AND closing AND status <> 'failed'))) 
    AND NOT EXISTS (
      SELECT 1 FROM public.client_edition_requests AS request
      WHERE request.project_id = p_project_id AND request.status = 'leased')
    AND NOT EXISTS (
      SELECT 1 FROM public.client_editions AS edition
      WHERE edition.project_id = p_project_id
        AND edition.status = 'drafting'
        AND edition.lease_expires_at > now())
    AND (public._client_edition_closed(p_project_id) OR (SELECT count(*) FROM public.client_editions AS edition
         WHERE edition.project_id = p_project_id
           AND edition.created_at::date = current_date) < 2);
$$;

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
    AND NOT request.closing
    AND public._client_edition_frozen(request.project_id);

  WITH candidate AS (
    SELECT DISTINCT ON (request.project_id) request.id, request.available_at, request.created_at
    FROM public.client_edition_requests AS request
    WHERE request.status = 'queued'
      AND request.available_at <= now()
      AND (request.closing OR NOT public._client_edition_closed(request.project_id))
      AND public._client_edition_project_ready(request.project_id)
    ORDER BY request.project_id, request.available_at, request.created_at, request.id
  ),
  picked AS (
    SELECT request.id
    FROM public.client_edition_requests AS request
    JOIN candidate ON candidate.id = request.id
    JOIN public.projects AS project ON project.id = request.project_id
    WHERE request.status = 'queued'
      AND (request.closing OR project.status NOT IN ('completed', 'archived'))
    ORDER BY candidate.available_at, candidate.created_at, request.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 5), 1), 20)
    FOR UPDATE OF request SKIP LOCKED
    FOR SHARE OF project SKIP LOCKED
  )
  UPDATE public.client_edition_requests AS request
  SET status = 'leased',
      lease_token = extensions.gen_random_uuid(),
      lease_expires_at = now() + interval '10 minutes',
      attempts = request.attempts + 1,
      closing_facts = CASE WHEN request.closing THEN jsonb_set(
        request.closing_facts, '{project,showMakers}',
        to_jsonb(COALESCE((request.closing_facts #>> '{project,showMakers}')::boolean, false)
          AND (SELECT project.show_makers FROM public.projects AS project
               WHERE project.id = request.project_id)))
        ELSE request.closing_facts END
  FROM picked
  WHERE request.id = picked.id
  RETURNING request.*;
$$;

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

  IF NOT v_request.closing THEN
    PERFORM public._client_edition_refuse_frozen(v_request.project_id);
  ELSIF NOT public._client_edition_closed(v_request.project_id)
     OR v_request.closing_facts IS NULL THEN
    RAISE EXCEPTION 'a closing request requires a closed job and its captured facts'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF NOT v_request.closing AND (SELECT count(*) FROM public.client_editions AS edition
      WHERE edition.project_id = v_request.project_id
        AND edition.created_at::date = current_date) >= 2 THEN
    RAISE EXCEPTION 'client_edition_daily_limit: project % already has two editions today',
      v_request.project_id
      USING ERRCODE = 'program_limit_exceeded', HINT = 'client_edition_daily_limit';
  END IF;

  IF v_request.closing THEN
    -- Reuse the one row after a swept lease; never make a second final issue.
    UPDATE public.client_editions
    SET status = 'drafting', facts = v_request.closing_facts,
        lease_token = p_lease_token, lease_expires_at = now() + interval '10 minutes'
    WHERE project_id = v_request.project_id AND closing AND status = 'failed'
    RETURNING id INTO v_edition_id;
  END IF;

  IF v_edition_id IS NULL THEN
  INSERT INTO public.client_editions (project_id, seq, status, lease_token, lease_expires_at, closing, facts)
  SELECT v_request.project_id,
         COALESCE(max(edition.seq), 0) + 1,
         'drafting',
         p_lease_token,
         now() + interval '10 minutes',
         v_request.closing,
         CASE WHEN v_request.closing THEN v_request.closing_facts ELSE NULL END
  FROM public.client_editions AS edition
  WHERE edition.project_id = v_request.project_id
  RETURNING id INTO v_edition_id;
  END IF;

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

CREATE OR REPLACE FUNCTION public.finish_client_edition(
  p_edition_id uuid,
  p_lease_token uuid,
  p_status text,
  p_kind text,
  p_composition jsonb,
  p_facts jsonb,
  p_images jsonb,
  p_prompt_version text,
  p_model text,
  p_cost_usd numeric,
  p_error text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_edition public.client_editions%ROWTYPE;
  v_current public.client_editions%ROWTYPE;
  v_overrides jsonb := '{}'::jsonb;
  v_refused text;
  v_count int;
BEGIN
  SELECT * INTO v_edition FROM public.client_editions WHERE id = p_edition_id;
  IF FOUND THEN
    PERFORM public._client_edition_lock(v_edition.project_id);
    SELECT * INTO v_edition FROM public.client_editions WHERE id = p_edition_id FOR UPDATE;
  END IF;
  IF NOT FOUND
     OR v_edition.status <> 'drafting'
     OR v_edition.lease_token IS DISTINCT FROM p_lease_token
     OR v_edition.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'edition % is not drafting under this token', p_edition_id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  PERFORM public._client_edition_refuse_frozen(v_edition.project_id, v_edition.id);
  IF v_edition.closing THEN
    -- Closure identity and its private snapshot come from SQL, never the worker.
    p_facts := COALESCE(p_facts, '{}'::jsonb) || jsonb_build_object(
      'closing', true, 'portfolio_snapshot', v_edition.facts -> 'portfolio_snapshot',
      'portfolioSnapshotRef', v_edition.facts -> 'portfolioSnapshotRef');
    IF p_status <> 'failed' THEN
      p_status := 'awaiting_review';
      p_kind := 'full';
    END IF;
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('approved', 'awaiting_review', 'failed') THEN
    RAISE EXCEPTION 'an edition finishes approved, awaiting_review or failed, not %', p_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_status = 'failed' THEN
    UPDATE public.client_editions
    SET status = 'failed',
        kind = CASE WHEN p_kind IN ('full', 'plates_only') THEN p_kind END,
        composition = p_composition,
        source_hash = p_composition ->> 'sourceHash',
        facts = (CASE WHEN jsonb_typeof(p_facts) = 'object' THEN p_facts ELSE '{}'::jsonb END)
                || jsonb_build_object('error', left(COALESCE(NULLIF(btrim(p_error), ''), 'compose failed'), 500)),
        prompt_version = p_prompt_version,
        model = p_model,
        cost_usd = p_cost_usd,
        lease_token = NULL,
        lease_expires_at = NULL
    WHERE id = p_edition_id;
    RETURN 'failed';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('full', 'plates_only') THEN
    RAISE EXCEPTION 'an edition is full or plates_only, not %', p_kind
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_status = 'approved' AND p_kind <> 'plates_only' THEN
    RAISE EXCEPTION 'only a plates-only edition publishes without review'
      USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_typeof(p_composition) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_facts) IS DISTINCT FROM 'object'
     OR (p_images IS NOT NULL AND jsonb_typeof(p_images) <> 'array') THEN
    RAISE EXCEPTION 'composition and facts are objects, images an array'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.client_edition_images (
    edition_id, asset_id, plate_role, crop_key, rank, chapter_key, alt,
    caption_what, caption_whose, caption_when
  )
  SELECT p_edition_id, asset.id, image.value ->> 'plate_role',
         COALESCE(NULLIF(btrim(image.value ->> 'crop_key'), ''), 'none'),
         COALESCE((image.value ->> 'rank')::int, image.ordinality::int),
         image.value ->> 'chapter_key', image.value ->> 'alt',
         image.value ->> 'caption_what', image.value ->> 'caption_whose', image.value ->> 'caption_when'
  FROM jsonb_array_elements(COALESCE(p_images, '[]'::jsonb)) WITH ORDINALITY AS image(value, ordinality)
  JOIN public.client_plate_assets AS asset
    ON asset.id::text = lower(image.value ->> 'asset_id')
   AND asset.project_id = v_edition.project_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> jsonb_array_length(COALESCE(p_images, '[]'::jsonb)) THEN
    RAISE EXCEPTION 'an edition image names no plate of project %', v_edition.project_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_status = 'approved' THEN
    SELECT * INTO v_current
    FROM public.client_editions
    WHERE project_id = v_edition.project_id AND status = 'approved'
    FOR UPDATE;
    IF NOT FOUND THEN
      v_refused := 'no approved edition';
    ELSIF public._client_edition_prose(v_current.composition)
          IS DISTINCT FROM public._client_edition_prose(p_composition) THEN
      v_refused := 'prose changed';
    ELSE
      -- The studio's words carry over; its hero pick does not (the new
      -- plates are the point of the edition, and Undo is in the Press band).
      v_overrides := v_current.overrides - 'heroAssetId';
      IF NOT public._client_edition_hero_ok(v_edition.project_id, p_composition, v_overrides) THEN
        v_refused := 'hero is not a publishable plate';
      END IF;
    END IF;

    IF v_refused IS NULL THEN
      UPDATE public.client_editions
      SET status = 'superseded',
          superseded_at = now(),
          superseded_by = p_edition_id
      WHERE id = v_current.id;

      UPDATE public.client_editions
      SET status = 'approved',
          kind = p_kind,
          composition = p_composition,
          source_hash = p_composition ->> 'sourceHash',
          facts = p_facts,
          overrides = v_overrides,
          prompt_version = p_prompt_version,
          model = p_model,
          cost_usd = p_cost_usd,
          auto_published = true,
          approved_at = now(),
          lease_token = NULL,
          lease_expires_at = NULL
      WHERE id = p_edition_id;
      RETURN 'approved';
    END IF;
  END IF;

  UPDATE public.client_editions
  SET status = 'awaiting_review',
      kind = p_kind,
      composition = p_composition,
      source_hash = p_composition ->> 'sourceHash',
      facts = p_facts || CASE WHEN v_refused IS NULL THEN '{}'::jsonb
                              ELSE jsonb_build_object('autoPublishRefused', v_refused) END,
      prompt_version = p_prompt_version,
      model = p_model,
      cost_usd = p_cost_usd,
      lease_token = NULL,
      lease_expires_at = NULL
  WHERE id = p_edition_id;
  RETURN 'awaiting_review';
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_client_edition(
  p_edition_id uuid,
  p_overrides jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_edition public.client_editions%ROWTYPE := public._client_edition_for_studio(p_edition_id);
  v_overrides jsonb;
BEGIN
  PERFORM public._client_edition_refuse_frozen(v_edition.project_id, v_edition.id);
  IF v_edition.status <> 'awaiting_review' THEN
    RAISE EXCEPTION 'edition % is %, not awaiting review', p_edition_id, v_edition.status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  PERFORM public._client_edition_check_overrides(COALESCE(p_overrides, '{}'::jsonb));
  v_overrides := public._client_edition_merge(v_edition.overrides, COALESCE(p_overrides, '{}'::jsonb));
  IF NOT public._client_edition_hero_ok(v_edition.project_id, v_edition.composition, v_overrides) THEN
    RAISE EXCEPTION 'the hero must be a photograph of this job, never a concept render'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.client_editions
  SET status = 'superseded',
      superseded_at = now(),
      superseded_by = p_edition_id
  WHERE project_id = v_edition.project_id
    AND status = 'approved'
    AND id <> p_edition_id;

  UPDATE public.client_editions
  SET status = 'approved',
      overrides = v_overrides,
      auto_published = false,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      approved_at = now()
  WHERE id = p_edition_id;
  IF v_edition.closing THEN
    PERFORM public._client_edition_freeze(v_edition.project_id);
  END IF;
END;
$$;

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

  -- A lost closing run retries the same request and edition, at most three leases.
  UPDATE public.client_edition_requests AS request
  SET status = 'queued', available_at = now(), close_reason = NULL
  WHERE request.closing AND request.status = 'done' AND request.attempts < 3
    AND EXISTS (SELECT 1 FROM public.client_editions AS edition
      WHERE edition.project_id = request.project_id AND edition.closing
        AND edition.status = 'failed' AND edition.facts ->> 'error' = 'lease expired');

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
    AND NOT request.closing
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
      AND (request.closing OR NOT public._client_edition_closed(request.project_id))
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
        'closing', edition.closing,
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

-- Replace the obsolete normal 'closed' request, preserving close/archive locks.
DROP TRIGGER IF EXISTS trg_client_edition_closed ON public.projects;
DROP TRIGGER IF EXISTS trg_client_edition_freeze_on_close ON public.projects;
CREATE TRIGGER trg_client_edition_freeze_on_close
  AFTER UPDATE OF status ON public.projects
  FOR EACH ROW
  WHEN (NEW.status IN ('completed', 'archived')
    AND OLD.status NOT IN ('completed', 'archived'))
  EXECUTE FUNCTION public.client_edition_freeze_on_close();
