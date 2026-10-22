-- 00851 — Stamp every attempted library check and set-based terminal cleanup (US-49).
-- Lineage: record_library_link_check 00849 → 00851;
-- dispatch_client_edition_compose 00845 → 00848 → 00851.
-- NULL is inconclusive, not dead or live. Rotate the row behind unchecked work
-- while retaining its last definitive result. Existing signatures/ACLs stay put.
CREATE OR REPLACE FUNCTION public.record_library_link_check(p_image_id uuid, p_dead boolean)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  UPDATE public.project_ffe_item_images
  SET link_checked_at = now(), link_dead = COALESCE(p_dead, link_dead)
  WHERE id = p_image_id AND source = 'library';
$$;

-- Same terminal predicate as _client_edition_closed, joined once for cleanup.
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
  FROM public.projects AS project
  WHERE request.project_id = project.id
    AND request.status = 'queued'
    AND project.status IN ('completed', 'archived');

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

