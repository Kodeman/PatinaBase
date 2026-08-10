-- ═══════════════════════════════════════════════════════════════════════════
-- 00433 — FF&E safe-reader and private-media compatibility floor
--
-- Adds only the curated client projection and private media infrastructure.
-- Raw client policies are intentionally removed by 00434, after compatible
-- readers can be deployed. No working-selection columns are introduced here.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'project-ffe-working',
    'project-ffe-working',
    false,
    52428800,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  ),
  (
    'project-review-media',
    'project-review-media',
    false,
    26214400,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  )
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.project_ffe_media_assets (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  ffe_item_id uuid REFERENCES public.project_ffe_items(id) ON DELETE SET NULL,
  storage_bucket text NOT NULL DEFAULT 'project-ffe-working'
    CHECK (storage_bucket = 'project-ffe-working'),
  storage_path text NOT NULL,
  media_kind text NOT NULL DEFAULT 'working'
    CHECK (media_kind IN ('working', 'source_document', 'board_reference')),
  checksum_sha256 text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  content_type text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storage_bucket, storage_path),
  CHECK (storage_path = project_id::text OR storage_path LIKE project_id::text || '/%')
);

CREATE INDEX IF NOT EXISTS idx_project_ffe_media_assets_project
  ON public.project_ffe_media_assets(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_project_ffe_media_assets_item
  ON public.project_ffe_media_assets(ffe_item_id)
  WHERE ffe_item_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.project_review_media_assets (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_asset_id uuid REFERENCES public.project_ffe_media_assets(id) ON DELETE RESTRICT,
  storage_bucket text NOT NULL DEFAULT 'project-review-media'
    CHECK (storage_bucket = 'project-review-media'),
  storage_path text NOT NULL,
  derivative_kind text NOT NULL
    CHECK (derivative_kind IN ('thumbnail', 'display', 'print')),
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  prepared_at timestamptz NOT NULL DEFAULT now(),
  prepared_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  UNIQUE (storage_bucket, storage_path),
  CHECK (storage_path = project_id::text OR storage_path LIKE project_id::text || '/%')
);

CREATE INDEX IF NOT EXISTS idx_project_review_media_assets_project
  ON public.project_review_media_assets(project_id, prepared_at);

CREATE TABLE IF NOT EXISTS public.project_ffe_media_reconciliation (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  source_bucket text NOT NULL,
  source_path text NOT NULL,
  classification text NOT NULL
    CHECK (classification IN ('proposal_legacy', 'project_working', 'unclassified')),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  source_checksum text,
  target_bucket text,
  target_path text,
  target_checksum text,
  disposition text NOT NULL DEFAULT 'pending'
    CHECK (disposition IN ('pending', 'copied', 'verified', 'quarantined', 'deleted', 'retained_proposal')),
  reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_bucket, source_path),
  CHECK (
    (classification = 'proposal_legacy' AND proposal_id IS NOT NULL AND project_id IS NULL)
    OR (classification = 'project_working' AND project_id IS NOT NULL AND proposal_id IS NULL)
    OR classification = 'unclassified'
  )
);

ALTER TABLE public.project_ffe_media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_review_media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_ffe_media_reconciliation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_ffe_media_assets_studio_rw ON public.project_ffe_media_assets;
CREATE POLICY project_ffe_media_assets_studio_rw
ON public.project_ffe_media_assets FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects project
    WHERE project.id = project_ffe_media_assets.project_id
      AND public.is_studio_comember(project.designer_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects project
    WHERE project.id = project_ffe_media_assets.project_id
      AND public.is_studio_comember(project.designer_id)
  )
);

DROP POLICY IF EXISTS project_review_media_assets_studio_read ON public.project_review_media_assets;
CREATE POLICY project_review_media_assets_studio_read
ON public.project_review_media_assets FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects project
    WHERE project.id = project_review_media_assets.project_id
      AND public.is_studio_comember(project.designer_id)
  )
);

DROP POLICY IF EXISTS project_ffe_media_reconciliation_studio_read ON public.project_ffe_media_reconciliation;
CREATE POLICY project_ffe_media_reconciliation_studio_read
ON public.project_ffe_media_reconciliation FOR SELECT TO authenticated
USING (
  project_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.projects project
    WHERE project.id = project_ffe_media_reconciliation.project_id
      AND public.is_studio_comember(project.designer_id)
  )
  OR proposal_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.proposals proposal
    WHERE proposal.id = project_ffe_media_reconciliation.proposal_id
      AND public.is_studio_comember(proposal.designer_id)
  )
);

DROP POLICY IF EXISTS project_ffe_working_studio_select ON storage.objects;
CREATE POLICY project_ffe_working_studio_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'project-ffe-working'
  AND EXISTS (
    SELECT 1 FROM public.projects project
    WHERE project.id::text = (storage.foldername(objects.name))[1]
      AND public.is_studio_comember(project.designer_id)
  )
);

DROP POLICY IF EXISTS project_ffe_working_studio_insert ON storage.objects;
CREATE POLICY project_ffe_working_studio_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'project-ffe-working'
  AND EXISTS (
    SELECT 1 FROM public.projects project
    WHERE project.id::text = (storage.foldername(objects.name))[1]
      AND public.is_studio_comember(project.designer_id)
  )
);

DROP POLICY IF EXISTS project_ffe_working_studio_update ON storage.objects;
CREATE POLICY project_ffe_working_studio_update
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'project-ffe-working'
  AND EXISTS (
    SELECT 1 FROM public.projects project
    WHERE project.id::text = (storage.foldername(objects.name))[1]
      AND public.is_studio_comember(project.designer_id)
  )
)
WITH CHECK (
  bucket_id = 'project-ffe-working'
  AND EXISTS (
    SELECT 1 FROM public.projects project
    WHERE project.id::text = (storage.foldername(objects.name))[1]
      AND public.is_studio_comember(project.designer_id)
  )
);

DROP POLICY IF EXISTS project_ffe_working_studio_delete ON storage.objects;
CREATE POLICY project_ffe_working_studio_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'project-ffe-working'
  AND EXISTS (
    SELECT 1 FROM public.projects project
    WHERE project.id::text = (storage.foldername(objects.name))[1]
      AND public.is_studio_comember(project.designer_id)
  )
);

CREATE OR REPLACE FUNCTION public.get_client_project_selections(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR NOT (
    v_project.client_id = v_actor
    OR public.is_studio_comember(v_project.designer_id)
  ) THEN
    RAISE EXCEPTION 'project not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'projectId', v_project.id,
    'projectName', v_project.name,
    'selections', COALESCE((
      SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', item.id,
        'name', item.name,
        'category', item.ffe_category,
        'roomId', item.project_room_id,
        'roomName', room.name,
        'quantity', item.quantity,
        'clientUnitPriceCents', item.unit_price_cents,
        'clientLineTotalCents', item.line_total_cents,
        'logisticsStatus', item.status,
        'productId', item.product_id,
        'imageUrl', product.images[1]
      )) ORDER BY room.sort_order NULLS FIRST, item.sort_order, item.created_at, item.id)
      FROM public.project_ffe_items item
      LEFT JOIN public.project_rooms room ON room.id = item.project_room_id
      LEFT JOIN public.products product ON product.id = item.product_id
      WHERE item.project_id = p_project_id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_project_selections(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_project_selections(uuid)
  TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_ffe_media_assets TO authenticated;
GRANT SELECT ON public.project_review_media_assets TO authenticated;
GRANT SELECT ON public.project_ffe_media_reconciliation TO authenticated;
GRANT ALL ON public.project_ffe_media_assets, public.project_review_media_assets,
  public.project_ffe_media_reconciliation TO service_role;

COMMENT ON FUNCTION public.get_client_project_selections(uuid) IS
  'Compatibility-safe allowlisted project FF&E projection. Never returns trade cost, markup, internal notes, working-media paths, or raw board rows.';
