-- 00849 — Nightly uncopied library-link checks and run history (US-49).
-- The editorial builder stays unchanged: copied plates outlive their sources.
-- A deduplicated plate belongs to every source request, not only the asset's
-- first source_ref (US-49 decision 8). Already-copied bytes need no hotlink.
ALTER TABLE public.project_ffe_item_images
  ADD COLUMN IF NOT EXISTS link_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS link_dead boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.list_uncopied_library_images(p_limit int DEFAULT 200)
RETURNS TABLE (id uuid, project_id uuid, url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT picture.id, picture.project_id, picture.url
  FROM public.project_ffe_item_images AS picture
  WHERE picture.source = 'library'
    AND (picture.link_checked_at IS NULL OR picture.link_checked_at < now() - interval '7 days')
    AND NOT EXISTS (
      SELECT 1 FROM public.client_plate_requests AS request
      JOIN public.client_plate_assets AS asset
        ON asset.id = request.asset_id AND asset.project_id = picture.project_id
      WHERE request.project_id = picture.project_id
        AND request.source_ref = jsonb_build_object('table', 'project_ffe_item_images', 'id', picture.id::text)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.client_plate_assets AS asset
      WHERE asset.project_id = picture.project_id
        AND asset.source_ref = jsonb_build_object('table', 'project_ffe_item_images', 'id', picture.id::text)
    )
  ORDER BY picture.link_checked_at NULLS FIRST, picture.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 0), 200);
$$;

CREATE OR REPLACE FUNCTION public.record_library_link_check(p_image_id uuid, p_dead boolean)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  UPDATE public.project_ffe_item_images
  SET link_checked_at = now(), link_dead = p_dead
  WHERE id = p_image_id AND source = 'library';
$$;

REVOKE ALL ON FUNCTION public.list_uncopied_library_images(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_uncopied_library_images(int) TO service_role;
REVOKE ALL ON FUNCTION public.record_library_link_check(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_library_link_check(uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.begin_client_plate_check_run()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  INSERT INTO public.job_runs (job_name, status, detail)
  VALUES ('client-plate-check', 'running', jsonb_build_object('trigger', 'invocation'))
  RETURNING id;
$$;

CREATE OR REPLACE FUNCTION public.finish_client_plate_check_run(
  p_run_id bigint,
  p_status text,
  p_detail jsonb DEFAULT '{}'::jsonb,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF p_status NOT IN ('succeeded', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'invalid plate check terminal status %', p_status
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.job_runs
  SET status = p_status,
      finished_at = now(),
      detail = detail || COALESCE(p_detail, '{}'::jsonb),
      error = CASE WHEN p_status = 'failed' THEN left(p_error, 500) ELSE NULL END
  WHERE id = p_run_id
    AND job_name = 'client-plate-check'
    AND status = 'running';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'running plate check job % not found', p_run_id
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_client_plate_check_run() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_client_plate_check_run() TO service_role;
REVOKE ALL ON FUNCTION public.finish_client_plate_check_run(bigint, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_client_plate_check_run(bigint, text, jsonb, text) TO service_role;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'client-plate-link-check') THEN
    PERFORM cron.unschedule('client-plate-link-check');
  END IF;
  PERFORM cron.schedule('client-plate-link-check', '20 3 * * *',
    $job$SELECT public.invoke_edge_function('client-plate-check', '{}'::jsonb);$job$);
END;
$cron$;
