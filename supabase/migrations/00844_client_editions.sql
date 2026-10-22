-- ═══════════════════════════════════════════════════════════════════════════
-- 00844 — The House Issue: the edition record and its change inbox (US-49 P2)
-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 2 gives the homeowner page an edition: a frozen composition of the
-- job's facts and plates that only reaches her once it is approved (PLAN.md v2
-- §Record; C3 rule: a plates-only edition auto-publishes, 00845). This
-- migration is the record and its inbox:
--
--   client_editions          one row per composed edition of a project, seq
--                            1, 2, … (UNIQUE project_id, seq). drafting →
--                            awaiting_review → approved → superseded, or
--                            failed. At most one approved row per project
--                            (partial unique index); superseded_by names a
--                            later edition of the same project (trigger).
--                            composition, facts and
--                            overrides are frozen jsonb; lease fields belong
--                            to the compose run that is writing a draft.
--   client_edition_images    the plates an edition sets: an asset of
--                            client_plate_assets (00843) in a role, with the
--                            crop key, rank, chapter, alt and caption triplet.
--   client_edition_requests  the change inbox. Each reason has at most one
--                            queued row per project (debounce_key =
--                            '<project>:<reason>', partial unique on queued);
--                            a repeat change moves that row's available_at
--                            on instead of adding a row.
--
-- Enqueue triggers (available_at = now() + 30 minutes, so a burst of changes
-- and their plate copies settle into one edition):
--   item_image            project_ffe_item_images INSERT, or is_primary changed
--   item_status           project_ffe_items.status becomes 'delivered' or
--                         'installed' (project_ffe_items_status_check: specified
--                         · quoted · approved · ordered · production · shipped ·
--                         delivered · installed; rank ladder 00184:42-50)
--   phase                 projects.current_phase changed (text, 00066; the
--                         editorial envelope's project.phase, 00842:304)
--   concept_render        project_rooms.concept_render_url set or re-uploaded
--                         (the same test as 00843's plate trigger)
--   palette               project_palettes INSERT / DELETE, or its swatches,
--                         is_primary, sort_order or project_id changed (the
--                         columns 00842:398-401 chooses the palette by)
--   authorization_signed  project_commercial_documents.executed_at set. The
--                         signed-name path 00840/00841 reads the line's frozen
--                         clientName through project_ffe_items.
--                         source_authorization_item_id, which both execution
--                         rails write (00835:820, :1230) in the same transaction
--                         that stamps executed_at (00835:872, :1272); the
--                         editorial reader shows a line only under an executed
--                         document (00842:159-166, :179-183).
--   closed                projects.status becomes 'completed' (enum
--                         project_status; close_project 00399:7596-7600; the
--                         completed_at stamp 00095)
-- Backfill: one 'backfill' request, available now, per project that already
-- holds a plate (client_plate_assets).
--
-- Lock order (00843 header, SQ-1143): client_edition_requests.project_id has
-- NO foreign key. The item-picture and item-status triggers run while their
-- writer holds the item; a key check on projects there would take projects
-- after the item. A request of a job that no longer exists is never claimed
-- (00845). client_editions keeps its key: only the service-role compose RPCs
-- insert it, outside any item write.
--
-- RLS on all three tables with no policy: no API role reads or writes them.
-- The service role writes through the 00845 lease RPCs, the studio acts
-- through the 00845 designer RPCs, the homeowner reads through
-- get_client_project_edition (00846).
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- Idempotent: IF NOT EXISTS, CREATE OR REPLACE, DROP TRIGGER IF EXISTS,
-- guarded backfill.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Tables ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_editions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  seq int NOT NULL CHECK (seq > 0),
  status text NOT NULL DEFAULT 'drafting'
    CHECK (status IN ('drafting', 'awaiting_review', 'approved', 'superseded', 'failed')),
  -- Decided when the composer finishes; null while drafting.
  kind text CHECK (kind IN ('full', 'plates_only')),
  source_hash text,
  composition jsonb,
  facts jsonb,
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(overrides) = 'object'),
  prompt_version text,
  model text,
  cost_usd numeric CHECK (cost_usd IS NULL OR cost_usd >= 0),
  auto_published boolean NOT NULL DEFAULT false,
  lease_token uuid,
  lease_expires_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  approved_at timestamptz,
  superseded_at timestamptz,
  superseded_by uuid REFERENCES public.client_editions(id) ON DELETE SET NULL,
  frozen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, seq),
  CHECK (status <> 'approved' OR approved_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_editions_one_approved
  ON public.client_editions (project_id)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_client_editions_project_created
  ON public.client_editions (project_id, created_at DESC);

COMMENT ON TABLE public.client_editions IS
  'US-49 Phase 2: one composed edition of a project''s homeowner page, seq 1, 2, …. drafting (a compose run holds the lease) → awaiting_review (a full edition, waiting on the studio) | approved (studio-approved, or auto_published when kind plates_only) → superseded; or failed. At most one approved row per project. composition/facts/overrides are frozen jsonb. Written only through the 00845 RPCs; the homeowner reads the approved row through get_client_project_edition (00846).';

DROP TRIGGER IF EXISTS set_updated_at ON public.client_editions;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.client_editions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- superseded_by names a later edition of the same project: never itself,
-- never another job's, never an earlier one, so undo's lineage only runs
-- forward (SQ-1638 F7). Every writer, the service role's direct ones too.
CREATE OR REPLACE FUNCTION public.client_editions_check_superseded_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.superseded_by IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.client_editions AS successor
    WHERE successor.id = NEW.superseded_by
      AND successor.id <> NEW.id
      AND successor.project_id = NEW.project_id
      AND successor.seq > NEW.seq
  ) THEN
    RAISE EXCEPTION 'edition % can only be superseded by a later edition of the same project', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.client_editions_check_superseded_by()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_client_editions_superseded_by ON public.client_editions;
CREATE TRIGGER trg_client_editions_superseded_by
  BEFORE INSERT OR UPDATE OF superseded_by, project_id, seq ON public.client_editions
  FOR EACH ROW EXECUTE FUNCTION public.client_editions_check_superseded_by();

CREATE TABLE IF NOT EXISTS public.client_edition_images (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  edition_id uuid NOT NULL REFERENCES public.client_editions(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.client_plate_assets(id) ON DELETE CASCADE,
  plate_role text NOT NULL CHECK (plate_role IN
    ('hero', 'room', 'held', 'pair', 'piece', 'sheet', 'board', 'plan', 'swatch', 'silhouette')),
  crop_key text NOT NULL DEFAULT 'none',
  rank int,
  chapter_key text,
  alt text,
  caption_what text,
  caption_whose text,
  caption_when text
);

CREATE INDEX IF NOT EXISTS idx_client_edition_images_edition
  ON public.client_edition_images (edition_id, rank);
CREATE INDEX IF NOT EXISTS idx_client_edition_images_asset
  ON public.client_edition_images (asset_id);

COMMENT ON TABLE public.client_edition_images IS
  'US-49 Phase 2: the plates an edition sets — an asset (client_plate_assets) in a plate role, with its crop key, rank, chapter, alt and caption what·whose·when. Perception (subject box, focal, flags) lives on the asset; alt lives here. Written by finish_client_edition.';

CREATE TABLE IF NOT EXISTS public.client_edition_requests (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  -- No foreign key: see the lock-order note in the header.
  project_id uuid NOT NULL,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  debounce_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'leased', 'done', 'failed')),
  available_at timestamptz NOT NULL DEFAULT now(),
  attempts int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_token uuid,
  lease_expires_at timestamptz,
  -- Why a claimed request ended without an edition (close_client_edition_request).
  close_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'leased') = (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL))
);

-- One queued row per (project, reason): a repeat change updates it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_edition_requests_active_debounce
  ON public.client_edition_requests (debounce_key)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_client_edition_requests_queue
  ON public.client_edition_requests (status, available_at)
  WHERE status IN ('queued', 'leased');

COMMENT ON TABLE public.client_edition_requests IS
  'US-49 Phase 2: the edition change inbox. One queued row per debounce_key (<project>:<reason>); a repeat change moves its available_at to now() + 30 minutes. queued → leased (claim_client_edition_requests) → done (begin_client_edition, or close_client_edition_request with close_reason) | queued again or failed on lease expiry (failed after the third attempt). Service role only.';

ALTER TABLE public.client_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_edition_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_edition_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.client_editions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.client_edition_images FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.client_edition_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.client_editions TO service_role;
GRANT ALL ON TABLE public.client_edition_images TO service_role;
GRANT ALL ON TABLE public.client_edition_requests TO service_role;

-- ─── 2. Enqueue ─────────────────────────────────────────────────────────────

-- Queue one change of a project, or move the reason's queued row on.
CREATE OR REPLACE FUNCTION public._enqueue_client_edition_request(
  p_project_id uuid,
  p_reason text,
  p_delay interval DEFAULT interval '30 minutes'
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  INSERT INTO public.client_edition_requests AS request
    (project_id, reason, debounce_key, status, available_at)
  SELECT p_project_id, p_reason, p_project_id::text || ':' || p_reason, 'queued',
         now() + COALESCE(p_delay, interval '0')
  WHERE p_project_id IS NOT NULL
    AND NULLIF(btrim(p_reason), '') IS NOT NULL
  ON CONFLICT (debounce_key) WHERE status = 'queued' DO UPDATE
  SET available_at = GREATEST(request.available_at, EXCLUDED.available_at);
$$;

-- One trigger function for every source: TG_ARGV[0] is the reason; the row's
-- project is projects.id or the row's project_id.
CREATE OR REPLACE FUNCTION public.client_edition_enqueue_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row jsonb := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
BEGIN
  PERFORM public._enqueue_client_edition_request(
    (v_row ->> CASE WHEN TG_TABLE_NAME = 'projects' THEN 'id' ELSE 'project_id' END)::uuid,
    TG_ARGV[0]);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._enqueue_client_edition_request(uuid, text, interval)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.client_edition_enqueue_change()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_client_edition_item_image_insert ON public.project_ffe_item_images;
CREATE TRIGGER trg_client_edition_item_image_insert
  AFTER INSERT ON public.project_ffe_item_images
  FOR EACH ROW EXECUTE FUNCTION public.client_edition_enqueue_change('item_image');

DROP TRIGGER IF EXISTS trg_client_edition_item_image_primary ON public.project_ffe_item_images;
CREATE TRIGGER trg_client_edition_item_image_primary
  AFTER UPDATE OF is_primary ON public.project_ffe_item_images
  FOR EACH ROW
  WHEN (NEW.is_primary IS DISTINCT FROM OLD.is_primary)
  EXECUTE FUNCTION public.client_edition_enqueue_change('item_image');

DROP TRIGGER IF EXISTS trg_client_edition_item_status ON public.project_ffe_items;
CREATE TRIGGER trg_client_edition_item_status
  AFTER UPDATE OF status ON public.project_ffe_items
  FOR EACH ROW
  WHEN (NEW.status IN ('delivered', 'installed') AND NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.client_edition_enqueue_change('item_status');

DROP TRIGGER IF EXISTS trg_client_edition_phase ON public.projects;
CREATE TRIGGER trg_client_edition_phase
  AFTER UPDATE OF current_phase ON public.projects
  FOR EACH ROW
  WHEN (NEW.current_phase IS DISTINCT FROM OLD.current_phase)
  EXECUTE FUNCTION public.client_edition_enqueue_change('phase');

DROP TRIGGER IF EXISTS trg_client_edition_closed ON public.projects;
CREATE TRIGGER trg_client_edition_closed
  AFTER UPDATE OF status ON public.projects
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.client_edition_enqueue_change('closed');

DROP TRIGGER IF EXISTS trg_client_edition_concept_render ON public.project_rooms;
CREATE TRIGGER trg_client_edition_concept_render
  AFTER UPDATE OF concept_render_url, concept_render_uploaded_at ON public.project_rooms
  FOR EACH ROW
  WHEN (NEW.concept_render_url IS NOT NULL
        AND (NEW.concept_render_url IS DISTINCT FROM OLD.concept_render_url
             OR NEW.concept_render_uploaded_at IS DISTINCT FROM OLD.concept_render_uploaded_at))
  EXECUTE FUNCTION public.client_edition_enqueue_change('concept_render');

DROP TRIGGER IF EXISTS trg_client_edition_palette ON public.project_palettes;
CREATE TRIGGER trg_client_edition_palette
  AFTER INSERT OR DELETE OR UPDATE OF swatches, is_primary, sort_order, project_id
  ON public.project_palettes
  FOR EACH ROW EXECUTE FUNCTION public.client_edition_enqueue_change('palette');

DROP TRIGGER IF EXISTS trg_client_edition_authorization_signed ON public.project_commercial_documents;
CREATE TRIGGER trg_client_edition_authorization_signed
  AFTER UPDATE OF executed_at ON public.project_commercial_documents
  FOR EACH ROW
  WHEN (OLD.executed_at IS NULL AND NEW.executed_at IS NOT NULL)
  EXECUTE FUNCTION public.client_edition_enqueue_change('authorization_signed');

DROP TRIGGER IF EXISTS trg_client_edition_authorization_signed_insert ON public.project_commercial_documents;
CREATE TRIGGER trg_client_edition_authorization_signed_insert
  AFTER INSERT ON public.project_commercial_documents
  FOR EACH ROW
  WHEN (NEW.executed_at IS NOT NULL)
  EXECUTE FUNCTION public.client_edition_enqueue_change('authorization_signed');

-- ─── 3. Backfill ────────────────────────────────────────────────────────────
-- A project that already holds a plate gets its first edition now. Once per
-- project: a rerun adds nothing.

INSERT INTO public.client_edition_requests (project_id, reason, debounce_key, status, available_at)
SELECT plated.project_id, 'backfill', plated.project_id::text || ':backfill', 'queued', now()
FROM (SELECT DISTINCT asset.project_id FROM public.client_plate_assets AS asset) AS plated
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_edition_requests AS request
  WHERE request.project_id = plated.project_id
    AND request.reason = 'backfill'
)
ON CONFLICT DO NOTHING;
