-- ═══════════════════════════════════════════════════════════════════════════
-- 00843 — The House Issue: private plate copies and their copy queue (US-49)
-- ═══════════════════════════════════════════════════════════════════════════
-- Every picture the homeowner page shows is copied once into the private R2
-- bucket by the media worker (PLAN.md v2 §Image system, V2-6: Cloudflare R2,
-- never Supabase Storage) and served through the client-portal Worker. This
-- migration is the database side of that lane:
--
--   client_plate_assets     one row per (project, sha256): the code-computed
--                           facts of a copy (PLAN DDL verbatim + created_at/
--                           updated_at). Written only by
--                           record_client_plate_asset.
--   client_plate_requests   the copy queue: one row per source (project,
--                           source_kind, source_ref {table,id}); once done it
--                           names the asset its copy produced (asset_id), so
--                           every source of shared bytes finds its plate.
--   enqueue triggers        a new item picture (project_ffe_item_images), a
--                           concept render set on a room (project_rooms), a new
--                           scan still (room_scan_images), a board cover
--                           (project_boards, on insert as well: activation
--                           writes the frozen board with its cover, and the
--                           snapshot is never otherwise updated). Each queues
--                           its source; a changed source address re-queues it.
--   backfill                every existing source of the four kinds.
--   service-role RPCs       claim_client_plate_requests, record_client_plate_
--                           asset, fail_client_plate_request (lease-checked),
--                           begin/finish_client_plate_copy_run, and the cron
--                           dispatcher dispatch_client_plate_copy (00677
--                           shape: a job_runs row only when a request is
--                           queued).
--   client_can_read_plate   the client-portal plate route's check (Phase 1:
--                           the scope id is the project id).
--
-- source_url is the address the copy is fetched from: the hotlink for a
-- library picture, else the bucket object path (project-item-images for an
-- upload, room-renders for a concept render, room-scans for a scan still,
-- proposal-mood-boards for a board cover; a board cover that is an outside
-- https address stays as it is). The edge function client-plate-copy signs or
-- builds the fetchable URL.
--
-- Lock order (SQ-1143, 00807): client_plate_requests.project_id has NO foreign
-- key. The item-picture trigger runs while its inserter already holds the
-- item; a key check on projects there would take projects after the item, the
-- reverse of furnishings execution (projects FOR UPDATE, then the item). A
-- request of a job that no longer exists is never claimed.
-- record_client_plate_asset takes the project before the request row for the
-- same reason.
--
-- Retry: a failed or expired attempt goes back to the queue until its third
-- attempt, then stays failed until its source address changes.
--
-- RLS on both tables with no policy: no API role reads or writes them
-- directly; the reader is get_client_project_editorial (00842) and the plate
-- check is client_can_read_plate.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- Idempotent: IF NOT EXISTS, CREATE OR REPLACE, DROP TRIGGER IF EXISTS,
-- ON CONFLICT, guarded cron.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Tables ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_plate_assets (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  source_kind text NOT NULL CHECK (source_kind IN
    ('upload','installed','scan','board','sheet','maker','concept')),
  source_ref jsonb NOT NULL,            -- {table,id}: item image | scan | board | plan_print
  original_key text NOT NULL,           -- private, copy-once
  width int NOT NULL CHECK (width > 0), height int NOT NULL CHECK (height > 0),
  ground text CHECK (ground IN ('white','scene','drawing')),   -- code
  dominant_hex text, lqip text CHECK (length(lqip) <= 800),    -- code
  subject_box numeric[] CHECK (cardinality(subject_box) = 4),  -- model or designer
  focal numeric[] CHECK (cardinality(focal) = 2),
  flags text[] NOT NULL DEFAULT '{}',   -- model: watermark | people | text_overlay
  crops jsonb NOT NULL DEFAULT '{}',    -- code: {wide:{rect,widths}, cover_phone:…, tall:…}
  perceived_prompt_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, sha256)
);

CREATE INDEX IF NOT EXISTS idx_client_plate_assets_source
  ON public.client_plate_assets (project_id, source_kind, source_ref);

COMMENT ON TABLE public.client_plate_assets IS
  'US-49: one private R2 copy of a picture a homeowner page may show, per (project, sha256). Code-computed facts only in Phase 1 (dimensions, ground, dominant colour, LQIP, crops); subject_box/focal/flags/perceived_prompt_version arrive with Phase 2. source_kind/source_ref name the first source that produced the bytes. Written by record_client_plate_asset; read through get_client_project_editorial and client_can_read_plate. No API role reads it directly.';

CREATE TABLE IF NOT EXISTS public.client_plate_requests (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  -- No foreign key: see the lock-order note in the header.
  project_id uuid NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN
    ('upload','installed','scan','board','sheet','maker','concept')),
  source_ref jsonb NOT NULL,
  source_url text NOT NULL CHECK (btrim(source_url) <> ''),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','leased','done','failed')),
  lease_token uuid,
  lease_expires_at timestamptz,
  attempts int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  -- The asset this source's copy produced. Two sources with the same bytes
  -- share one asset, whose source_kind/source_ref name only the first; the
  -- reader finds every source's plate through this column.
  asset_id uuid REFERENCES public.client_plate_assets(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, source_kind, source_ref),
  CHECK ((status = 'leased') = (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_client_plate_requests_queue
  ON public.client_plate_requests (status, updated_at)
  WHERE status IN ('queued', 'leased');

COMMENT ON TABLE public.client_plate_requests IS
  'US-49: the plate copy queue, one row per source (project, source_kind, source_ref {table,id}). queued → leased (claim_client_plate_requests) → done (record_client_plate_asset) | queued again or failed (fail_client_plate_request, lease expiry; failed after the third attempt). A changed source address re-queues the row. Service role only.';

ALTER TABLE public.client_plate_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_plate_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.client_plate_assets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.client_plate_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.client_plate_assets TO service_role;
GRANT ALL ON TABLE public.client_plate_requests TO service_role;

-- ─── 2. Enqueue ─────────────────────────────────────────────────────────────

-- Queue one source. A source already queued is left alone unless its address
-- changed; a changed address re-queues it whatever its state (a lease in
-- flight then loses its token, so a stale copy is never recorded).
CREATE OR REPLACE FUNCTION public._enqueue_client_plate_request(
  p_project_id uuid,
  p_source_kind text,
  p_table text,
  p_id uuid,
  p_source_url text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  INSERT INTO public.client_plate_requests AS request
    (project_id, source_kind, source_ref, source_url)
  SELECT p_project_id, p_source_kind,
         jsonb_build_object('table', p_table, 'id', p_id),
         btrim(p_source_url)
  WHERE p_project_id IS NOT NULL
    AND p_id IS NOT NULL
    AND NULLIF(btrim(p_source_url), '') IS NOT NULL
  ON CONFLICT (project_id, source_kind, source_ref) DO UPDATE
  SET status = 'queued',
      source_url = EXCLUDED.source_url,
      attempts = 0,
      last_error = NULL,
      lease_token = NULL,
      lease_expires_at = NULL,
      asset_id = NULL,
      updated_at = now()
  WHERE request.source_url IS DISTINCT FROM EXCLUDED.source_url;
$$;

-- The object key inside room-scans, split off the stored URL on the LAST
-- /room-scans/ (parse-room-scan/lib.ts objectKeyFromUrl); anything else as is.
CREATE OR REPLACE FUNCTION public._client_plate_scan_source(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(NULLIF(substring(p_url FROM '.*/room-scans/([^?]*)'), ''), p_url);
$$;

CREATE OR REPLACE FUNCTION public.client_plate_enqueue_item_image()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public._enqueue_client_plate_request(
    NEW.project_id,
    CASE WHEN NEW.source = 'upload' THEN 'upload' ELSE 'maker' END,
    'project_ffe_item_images',
    NEW.id,
    CASE WHEN NEW.source = 'upload' THEN COALESCE(NEW.storage_path, NEW.url) ELSE NEW.url END
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.client_plate_enqueue_concept_render()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public._enqueue_client_plate_request(
    NEW.project_id, 'concept', 'project_rooms', NEW.id, NEW.concept_render_url);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.client_plate_enqueue_scan_image()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public._enqueue_client_plate_request(
    (SELECT scan.project_id FROM public.room_scans AS scan WHERE scan.id = NEW.scan_id),
    'scan',
    'room_scan_images',
    NEW.id,
    public._client_plate_scan_source(COALESCE(NEW.preview_url, NEW.image_url))
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.client_plate_enqueue_board_cover()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public._enqueue_client_plate_request(
    NEW.project_id,
    'board',
    'project_boards',
    NEW.id,
    COALESCE(public.board_storage_reference_path(NEW.cover_image_url), NEW.cover_image_url)
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._enqueue_client_plate_request(uuid, text, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._client_plate_scan_source(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.client_plate_enqueue_item_image()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.client_plate_enqueue_concept_render()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.client_plate_enqueue_scan_image()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.client_plate_enqueue_board_cover()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_client_plate_enqueue_item_image ON public.project_ffe_item_images;
CREATE TRIGGER trg_client_plate_enqueue_item_image
  AFTER INSERT ON public.project_ffe_item_images
  FOR EACH ROW EXECUTE FUNCTION public.client_plate_enqueue_item_image();

DROP TRIGGER IF EXISTS trg_client_plate_enqueue_concept_render ON public.project_rooms;
CREATE TRIGGER trg_client_plate_enqueue_concept_render
  AFTER UPDATE OF concept_render_url ON public.project_rooms
  FOR EACH ROW
  WHEN (NEW.concept_render_url IS NOT NULL
        AND NEW.concept_render_url IS DISTINCT FROM OLD.concept_render_url)
  EXECUTE FUNCTION public.client_plate_enqueue_concept_render();

DROP TRIGGER IF EXISTS trg_client_plate_enqueue_scan_image ON public.room_scan_images;
CREATE TRIGGER trg_client_plate_enqueue_scan_image
  AFTER INSERT ON public.room_scan_images
  FOR EACH ROW EXECUTE FUNCTION public.client_plate_enqueue_scan_image();

DROP TRIGGER IF EXISTS trg_client_plate_enqueue_board_cover ON public.project_boards;
CREATE TRIGGER trg_client_plate_enqueue_board_cover
  AFTER INSERT OR UPDATE OF cover_image_url ON public.project_boards
  FOR EACH ROW
  WHEN (NEW.cover_image_url IS NOT NULL)
  EXECUTE FUNCTION public.client_plate_enqueue_board_cover();

-- ─── 3. Backfill ────────────────────────────────────────────────────────────

INSERT INTO public.client_plate_requests (project_id, source_kind, source_ref, source_url)
SELECT picture.project_id,
       CASE WHEN picture.source = 'upload' THEN 'upload' ELSE 'maker' END,
       jsonb_build_object('table', 'project_ffe_item_images', 'id', picture.id),
       btrim(CASE WHEN picture.source = 'upload'
                  THEN COALESCE(picture.storage_path, picture.url) ELSE picture.url END)
FROM public.project_ffe_item_images AS picture
WHERE NULLIF(btrim(CASE WHEN picture.source = 'upload'
                        THEN COALESCE(picture.storage_path, picture.url) ELSE picture.url END), '') IS NOT NULL
ON CONFLICT (project_id, source_kind, source_ref) DO NOTHING;

INSERT INTO public.client_plate_requests (project_id, source_kind, source_ref, source_url)
SELECT room.project_id, 'concept',
       jsonb_build_object('table', 'project_rooms', 'id', room.id),
       btrim(room.concept_render_url)
FROM public.project_rooms AS room
WHERE NULLIF(btrim(room.concept_render_url), '') IS NOT NULL
ON CONFLICT (project_id, source_kind, source_ref) DO NOTHING;

INSERT INTO public.client_plate_requests (project_id, source_kind, source_ref, source_url)
SELECT scan.project_id, 'scan',
       jsonb_build_object('table', 'room_scan_images', 'id', still.id),
       btrim(public._client_plate_scan_source(COALESCE(still.preview_url, still.image_url)))
FROM public.room_scan_images AS still
JOIN public.room_scans AS scan ON scan.id = still.scan_id
WHERE scan.project_id IS NOT NULL
  AND NULLIF(btrim(public._client_plate_scan_source(COALESCE(still.preview_url, still.image_url))), '') IS NOT NULL
ON CONFLICT (project_id, source_kind, source_ref) DO NOTHING;

INSERT INTO public.client_plate_requests (project_id, source_kind, source_ref, source_url)
SELECT board.project_id, 'board',
       jsonb_build_object('table', 'project_boards', 'id', board.id),
       btrim(COALESCE(public.board_storage_reference_path(board.cover_image_url), board.cover_image_url))
FROM public.project_boards AS board
WHERE NULLIF(btrim(COALESCE(public.board_storage_reference_path(board.cover_image_url),
                            board.cover_image_url)), '') IS NOT NULL
ON CONFLICT (project_id, source_kind, source_ref) DO NOTHING;

-- ─── 4. The copy lane (service role) ────────────────────────────────────────

-- Lease up to p_limit queued requests (10 minutes each; one token per row).
CREATE OR REPLACE FUNCTION public.claim_client_plate_requests(p_limit int DEFAULT 10)
RETURNS SETOF public.client_plate_requests
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH picked AS (
    SELECT request.id
    FROM public.client_plate_requests AS request
    WHERE request.status = 'queued'
      AND EXISTS (SELECT 1 FROM public.projects AS project WHERE project.id = request.project_id)
    ORDER BY request.updated_at, request.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50)
    FOR UPDATE OF request SKIP LOCKED
  )
  UPDATE public.client_plate_requests AS request
  SET status = 'leased',
      lease_token = extensions.gen_random_uuid(),
      lease_expires_at = now() + interval '10 minutes',
      attempts = request.attempts + 1,
      updated_at = now()
  FROM picked
  WHERE request.id = picked.id
  RETURNING request.*;
$$;

-- The copy landed: upsert its asset on (project_id, sha256) and close the
-- request. The request row, not the payload, names the project and source.
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
BEGIN
  -- The project first, then the request (header: lock order).
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

  INSERT INTO public.client_plate_assets AS asset (
    project_id, sha256, source_kind, source_ref, original_key,
    width, height, ground, dominant_hex, lqip, crops
  ) VALUES (
    v_request.project_id, v_sha256, v_request.source_kind, v_request.source_ref,
    p_asset ->> 'originalKey',
    (p_asset ->> 'width')::int, (p_asset ->> 'height')::int,
    p_asset ->> 'ground', p_asset ->> 'dominantHex', p_asset ->> 'lqip',
    COALESCE(p_asset -> 'crops', '{}'::jsonb)
  )
  ON CONFLICT (project_id, sha256) DO UPDATE
  SET original_key = EXCLUDED.original_key,
      width = EXCLUDED.width,
      height = EXCLUDED.height,
      ground = EXCLUDED.ground,
      dominant_hex = EXCLUDED.dominant_hex,
      lqip = EXCLUDED.lqip,
      crops = EXCLUDED.crops,
      updated_at = now()
  RETURNING asset.id INTO v_asset_id;

  UPDATE public.client_plate_requests
  SET status = 'done',
      lease_token = NULL,
      lease_expires_at = NULL,
      last_error = NULL,
      asset_id = v_asset_id,
      updated_at = now()
  WHERE id = p_request_id;

  RETURN v_asset_id;
END;
$$;

-- The copy failed: back to the queue, or failed after the third attempt.
CREATE OR REPLACE FUNCTION public.fail_client_plate_request(
  p_request_id uuid,
  p_lease_token uuid,
  p_error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_request public.client_plate_requests%ROWTYPE;
BEGIN
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

  UPDATE public.client_plate_requests
  SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END,
      lease_token = NULL,
      lease_expires_at = NULL,
      last_error = left(COALESCE(NULLIF(btrim(p_error), ''), 'copy failed'), 500),
      updated_at = now()
  WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_client_plate_requests(int)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_client_plate_asset(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_client_plate_request(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_client_plate_requests(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_client_plate_asset(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_client_plate_request(uuid, uuid, text) TO service_role;

-- ─── 5. The plate route's check (authenticated) ─────────────────────────────

-- Phase 1: the scope id is a project id. The project id comes back when the
-- caller passes get_client_project_editorial's guard (the project's client, or
-- can_buy_for_project) and the project holds a plate with that sha256.
CREATE OR REPLACE FUNCTION public.client_can_read_plate(p_scope_id uuid, p_sha256 text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT project.id
  FROM public.projects AS project
  WHERE project.id = p_scope_id
    AND COALESCE(
      project.client_id = auth.uid()
      OR public.can_buy_for_project(project.id),
      false
    )
    AND EXISTS (
      SELECT 1 FROM public.client_plate_assets AS asset
      WHERE asset.project_id = project.id
        AND asset.sha256 = p_sha256
    );
$$;

REVOKE ALL ON FUNCTION public.client_can_read_plate(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_can_read_plate(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.client_can_read_plate(uuid, text) IS
  'US-49 plate route check. Phase 1: p_scope_id is a project id; returns it when auth.uid() is the project''s client or passes can_buy_for_project and a client_plate_assets row with p_sha256 exists for it, else NULL. Phase 2 adds approved-edition scope.';

-- ─── 6. job_runs: begin (manual), finish, dispatch (cron) — 00677 shape ─────

CREATE OR REPLACE FUNCTION public.begin_client_plate_copy_run()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  INSERT INTO public.job_runs (job_name, status, detail)
  VALUES ('client-plate-copy', 'running', jsonb_build_object('trigger', 'manual'))
  RETURNING id;
$$;

CREATE OR REPLACE FUNCTION public.finish_client_plate_copy_run(
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
    RAISE EXCEPTION 'invalid plate copy terminal status %', p_status
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.job_runs
  SET status = p_status,
      finished_at = now(),
      detail = detail || COALESCE(p_detail, '{}'::jsonb),
      error = CASE WHEN p_status = 'failed' THEN left(p_error, 500) ELSE NULL END
  WHERE id = p_run_id
    AND job_name = 'client-plate-copy'
    AND status = 'running';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'running plate copy job % not found', p_run_id
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

-- Every minute: expire leases, close runs that never reported back, then —
-- only when a request is queued — open a job_runs row and invoke the function.
CREATE OR REPLACE FUNCTION public.dispatch_client_plate_copy()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_run_id bigint;
  v_request_id bigint;
BEGIN
  -- A lease is 10 minutes; an expired one goes back to the queue.
  UPDATE public.client_plate_requests
  SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END,
      lease_token = NULL,
      lease_expires_at = NULL,
      last_error = COALESCE(last_error, 'lease expired'),
      updated_at = now()
  WHERE status = 'leased'
    AND lease_expires_at <= now();

  -- A run that never reported back is closed so it does not pile up.
  UPDATE public.job_runs
  SET status = 'failed', finished_at = now(), error = 'no completion reported'
  WHERE job_name = 'client-plate-copy'
    AND status = 'running'
    AND started_at < now() - interval '10 minutes';

  -- Billing guard: no queued request → no row, no request.
  IF NOT EXISTS (
    SELECT 1
    FROM public.client_plate_requests AS request
    WHERE request.status = 'queued'
      AND EXISTS (SELECT 1 FROM public.projects AS project WHERE project.id = request.project_id)
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.job_runs (job_name, status, detail)
  VALUES (
    'client-plate-copy',
    'running',
    jsonb_build_object('trigger', 'cron', 'dispatch_state', 'starting')
  )
  RETURNING id INTO v_run_id;

  BEGIN
    SELECT public.invoke_edge_function(
      'client-plate-copy',
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
      -- finish_client_plate_copy_run(). Enqueue success is not job success.
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

REVOKE ALL ON FUNCTION public.begin_client_plate_copy_run()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_client_plate_copy_run(bigint, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dispatch_client_plate_copy()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_client_plate_copy_run() TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_client_plate_copy_run(bigint, text, jsonb, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_client_plate_copy() TO service_role;

-- ─── 7. Every-minute cron ───────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $cron$
DECLARE
  v_job_id bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR v_job_id IN
      SELECT jobid FROM cron.job WHERE jobname = 'client-plate-copy-dispatch'
    LOOP
      PERFORM cron.unschedule(v_job_id);
    END LOOP;

    PERFORM cron.schedule(
      'client-plate-copy-dispatch',
      '* * * * *',
      $command$SELECT public.dispatch_client_plate_copy();$command$
    );
  END IF;
END
$cron$;
