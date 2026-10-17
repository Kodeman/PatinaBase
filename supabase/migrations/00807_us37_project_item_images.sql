-- ═══════════════════════════════════════════════════════════════════════════
-- 00807 — A project item's own pictures (US-37 #1 + #2; SQ-1099)
-- ═══════════════════════════════════════════════════════════════════════════
-- US-37 EXECUTION CONTRACT D1/D2. Root cause (SQ-1095): products.images is
-- the library's picture list, and project_ffe_items has no picture of its
-- own, so a library piece added to a job showed no image wherever a reader
-- looked for an item-owned picture.
--
-- D1 SNAPSHOT, not a live reference: a library edit must not change a piece
-- the client has approved, and deleting a product nulls product_id.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- 1. project_ffe_item_images: one row per picture on one project item.
--    url, an optional storage_path inside ${project_id}/, source library |
--    upload, source_product_id, position (0 first), is_primary. A partial
--    unique index allows one primary per item; the RPCs keep exactly one
--    whenever the item has pictures. project_id is DERIVED from the item by a
--    BEFORE trigger, so a row can never claim another job's item.
--    RLS: the FF&E studio leg's predicate, can_buy_for_project(project_id)
--    (00721 project_ffe_items_studio_rw; it includes the owner). No client
--    policy: clients read pictures only through the curated readers below.
-- 2. Snapshot on add. An AFTER INSERT OR UPDATE OF product_id trigger on
--    project_ffe_items copies products.images in array order (blank entries
--    skipped; position from 0; the first is primary; source 'library') when
--    the item has no picture rows. It covers every insert path: commit_
--    project_ffe_import → place_product_in_project_v2, the direct inserts in
--    use-projects.ts and the scope builder, proposal activation. The UPDATE
--    leg exists because place_product_in_project_v2 FILLS a placeholder in
--    place (00435:194, outcome 'filled'): product_id goes from NULL to the
--    piece on an existing row. It fires only when product_id actually
--    changes, and never touches an item that already has pictures (a product
--    merge keeps them; a designer who unlinked every picture is not
--    re-seeded by an unrelated write).
-- 3. Backfill: the same copy for every existing item with a product and no
--    picture rows (about 35 on prod). _backfill_ffe_item_library_images() is
--    idempotent and returns the rows it wrote; a rerun writes 0.
-- 4. RPCs, each refusing anyone the studio leg refuses with 42501 "Only the
--    studio on this job can change this piece's pictures.":
--      add_ffe_item_image(item, url, storage_path, source, source_product_id)
--        appends at the end; primary when the item has no primary.
--      set_ffe_item_primary_image(image)
--      reorder_ffe_item_images(item, image_ids[]) — every picture once.
--      unlink_ffe_item_image(image) — deletes the link row and NEVER the
--        stored file; when it was the primary, the first remaining picture
--        (by position) becomes primary.
--    Each locks the item row (FOR NO KEY UPDATE), so parallel uploads cannot
--    both become primary or share a position.
-- 5. Storage. 00433's project-ffe-working bucket does not fit: it is private
--    (a stored url would need signing on every read), its policies still ask
--    is_studio_comember(owner) rather than can_buy_for_project, and it holds
--    working documents behind a registration and review-derivative pipeline.
--    So a new bucket, project-item-images: PUBLIC read by URL like
--    product-images (00057) and proposal-assets (00099), so the client pages
--    render the stored url directly; listing, upload and replace are the
--    studio leg on ${project_id}/…; there is NO delete policy (an unlink
--    never removes the file).
-- 6. Readers. primary_image_url(project_ffe_items) and image_urls(
--    project_ffe_items) are PostgREST computed fields (SECURITY INVOKER: the
--    picture table's RLS decides), the designer's FF&E reads. The curated
--    client readers carry primaryImageUrl and imageUrls (ordered by position)
--    from the item's own rows:
--      get_client_project_selections (the iOS reader; base 00755:432)
--      get_client_project_threshold  (the web Client Page and The Making,
--        read by useClientSelections; base 00755:474). Its imageUrl was the
--        LIVE products.images[1]; it is now the item's primary picture.
--    No raw table access is widened.
--
-- CREATE OR REPLACE bases, each the newest body, full copy plus the change:
--   get_client_project_selections  00441 → 00745:127 → 00755:432
--   get_client_project_threshold   00441 → 00745:168 → 00755:474
--
-- Not changed here: _furnishing_authorization_item_snapshot (00744:60) still
-- freezes productImageUrl, which no client reader returns; review editions
-- keep their own media pipeline (00443).
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- Idempotent: IF NOT EXISTS, DROP … IF EXISTS, CREATE OR REPLACE, ON
-- CONFLICT; the backfill skips any item that already has pictures.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. The bucket ──────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-item-images',
  'project-item-images',
  true,
  20971520, -- 20 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── 2. project_ffe_item_images ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_ffe_item_images (
  id                uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  item_id           uuid        NOT NULL REFERENCES public.project_ffe_items(id) ON DELETE CASCADE,
  project_id        uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  url               text        NOT NULL CHECK (btrim(url) <> ''),
  storage_path      text        CHECK (storage_path IS NULL OR storage_path LIKE project_id::text || '/%'),
  source            text        NOT NULL CHECK (source IN ('library', 'upload')),
  source_product_id uuid        REFERENCES public.products(id) ON DELETE SET NULL,
  position          integer     NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_primary        boolean     NOT NULL DEFAULT false,
  created_by        uuid        REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS project_ffe_item_images_one_primary
  ON public.project_ffe_item_images (item_id)
  WHERE is_primary;
CREATE INDEX IF NOT EXISTS idx_project_ffe_item_images_item_order
  ON public.project_ffe_item_images (item_id, position, created_at);
CREATE INDEX IF NOT EXISTS idx_project_ffe_item_images_project
  ON public.project_ffe_item_images (project_id);

COMMENT ON TABLE public.project_ffe_item_images IS
  'A project item''s own pictures (00807, US-37 D1/D2): a snapshot of products.images taken when the '
  'piece is added, plus uploads. One primary per item (partial unique index). project_id is derived '
  'from the item. Read/write: can_buy_for_project. Clients read through the curated readers only. '
  'Deleting a row never deletes a stored file.';

-- project_id always comes from the item.
CREATE OR REPLACE FUNCTION public.project_ffe_item_images_derive_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- A missing item keeps NEW.project_id, and the item_id foreign key refuses it.
  NEW.project_id := COALESCE(
    (SELECT item.project_id FROM public.project_ffe_items AS item WHERE item.id = NEW.item_id),
    NEW.project_id
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.project_ffe_item_images_derive_project()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_project_ffe_item_images_derive_project ON public.project_ffe_item_images;
CREATE TRIGGER trg_project_ffe_item_images_derive_project
  BEFORE INSERT OR UPDATE OF item_id, project_id ON public.project_ffe_item_images
  FOR EACH ROW EXECUTE FUNCTION public.project_ffe_item_images_derive_project();

ALTER TABLE public.project_ffe_item_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_ffe_item_images_studio_rw ON public.project_ffe_item_images;
CREATE POLICY project_ffe_item_images_studio_rw ON public.project_ffe_item_images
  FOR ALL TO authenticated
  USING (public.can_buy_for_project(project_ffe_item_images.project_id))
  WITH CHECK (public.can_buy_for_project(project_ffe_item_images.project_id));

REVOKE ALL ON TABLE public.project_ffe_item_images FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_ffe_item_images TO authenticated;
GRANT ALL ON TABLE public.project_ffe_item_images TO service_role;

-- ─── 3. The designer's computed fields ──────────────────────────────────────
-- SECURITY INVOKER: the caller's RLS on project_ffe_item_images decides, so a
-- client calling them directly reads nothing. The curated SECURITY DEFINER
-- readers call them as their owner.

CREATE OR REPLACE FUNCTION public.primary_image_url(p public.project_ffe_items)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT image.url
  FROM public.project_ffe_item_images AS image
  WHERE image.item_id = p.id
  ORDER BY image.is_primary DESC, image.position, image.created_at, image.id
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.primary_image_url(public.project_ffe_items) IS
  'Computed field (00807): the item''s primary picture url, else its first by position; NULL when '
  'the item has no picture rows (designer reads may then fall back to products.images[1]).';

REVOKE ALL ON FUNCTION public.primary_image_url(public.project_ffe_items) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.primary_image_url(public.project_ffe_items) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.image_urls(p public.project_ffe_items)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(
    array_agg(image.url ORDER BY image.position, image.created_at, image.id),
    ARRAY[]::text[]
  )
  FROM public.project_ffe_item_images AS image
  WHERE image.item_id = p.id;
$$;

COMMENT ON FUNCTION public.image_urls(public.project_ffe_items) IS
  'Computed field (00807): the item''s picture urls in position order; empty when it has none.';

REVOKE ALL ON FUNCTION public.image_urls(public.project_ffe_items) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.image_urls(public.project_ffe_items) TO authenticated, service_role;

-- ─── 4. The snapshot on add ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._ffe_item_snapshot_library_images(p_item_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_written integer;
BEGIN
  -- created_by names the caller only when she has a profile, so the snapshot
  -- never adds a way for an add to fail.
  INSERT INTO public.project_ffe_item_images (
    item_id, project_id, url, source, source_product_id, position, is_primary, created_by
  )
  SELECT item.id, item.project_id, image.url, 'library', product.id,
         image.position, image.position = 0,
         (SELECT profile.id FROM public.profiles AS profile WHERE profile.id = auth.uid())
  FROM public.project_ffe_items AS item
  JOIN public.products AS product ON product.id = item.product_id
  CROSS JOIN LATERAL (
    SELECT listed.url,
           (row_number() OVER (ORDER BY listed.ordinality) - 1)::integer AS position
    FROM unnest(product.images) WITH ORDINALITY AS listed(url, ordinality)
    WHERE NULLIF(btrim(listed.url), '') IS NOT NULL
  ) AS image
  WHERE item.id = p_item_id
    AND NOT EXISTS (
      SELECT 1 FROM public.project_ffe_item_images AS existing
      WHERE existing.item_id = item.id
    );
  GET DIAGNOSTICS v_written = ROW_COUNT;
  RETURN v_written;
END;
$$;

COMMENT ON FUNCTION public._ffe_item_snapshot_library_images(uuid) IS
  'Copies the item''s product images (products.images, array order, blanks skipped) into '
  'project_ffe_item_images when the item has no picture rows: position from 0, the first primary, '
  'source library. Returns the rows written. Closed to every API role (00807).';

REVOKE ALL ON FUNCTION public._ffe_item_snapshot_library_images(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.snapshot_ffe_item_library_images()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.product_id IS NOT DISTINCT FROM NEW.product_id THEN
    RETURN NULL;
  END IF;
  PERFORM public._ffe_item_snapshot_library_images(NEW.id);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_ffe_item_library_images()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_snapshot_ffe_item_library_images ON public.project_ffe_items;
CREATE TRIGGER trg_snapshot_ffe_item_library_images
  AFTER INSERT OR UPDATE OF product_id ON public.project_ffe_items
  FOR EACH ROW
  WHEN (NEW.product_id IS NOT NULL)
  EXECUTE FUNCTION public.snapshot_ffe_item_library_images();

-- ─── 5. The backfill ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._backfill_ffe_item_library_images()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_item_id uuid;
  v_total integer := 0;
BEGIN
  FOR v_item_id IN
    SELECT item.id
    FROM public.project_ffe_items AS item
    WHERE item.product_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.project_ffe_item_images AS image
        WHERE image.item_id = item.id
      )
    ORDER BY item.created_at, item.id
  LOOP
    v_total := v_total + public._ffe_item_snapshot_library_images(v_item_id);
  END LOOP;
  RETURN v_total;
END;
$$;

COMMENT ON FUNCTION public._backfill_ffe_item_library_images() IS
  'The 00807 backfill: snapshots product images onto every item with a product and no picture rows. '
  'Idempotent; returns the rows written. Closed to every API role.';

REVOKE ALL ON FUNCTION public._backfill_ffe_item_library_images()
  FROM PUBLIC, anon, authenticated, service_role;

SELECT public._backfill_ffe_item_library_images();

-- ─── 6. The picture acts ────────────────────────────────────────────────────

-- The gate: the item row, locked, when the caller is on the job's studio leg.
CREATE OR REPLACE FUNCTION public._ffe_item_images_require_team(p_item_id uuid)
RETURNS public.project_ffe_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_item public.project_ffe_items%ROWTYPE;
BEGIN
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = p_item_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.can_buy_for_project(v_item.project_id) THEN
    RAISE EXCEPTION 'Only the studio on this job can change this piece''s pictures.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Serialize picture acts on one item: one primary, no shared position.
  PERFORM 1 FROM public.project_ffe_items WHERE id = p_item_id FOR NO KEY UPDATE;
  RETURN v_item;
END;
$$;

REVOKE ALL ON FUNCTION public._ffe_item_images_require_team(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.add_ffe_item_image(
  p_item_id uuid,
  p_url text,
  p_storage_path text DEFAULT NULL,
  p_source text DEFAULT 'upload',
  p_source_product_id uuid DEFAULT NULL
)
RETURNS public.project_ffe_item_images
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_item public.project_ffe_items%ROWTYPE;
  v_image public.project_ffe_item_images%ROWTYPE;
BEGIN
  v_item := public._ffe_item_images_require_team(p_item_id);
  IF NULLIF(btrim(p_url), '') IS NULL THEN
    RAISE EXCEPTION 'A picture needs an address.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('library', 'upload') THEN
    RAISE EXCEPTION 'A picture comes from the library or an upload.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO public.project_ffe_item_images (
    item_id, project_id, url, storage_path, source, source_product_id, position, is_primary
  )
  SELECT v_item.id, v_item.project_id, btrim(p_url), NULLIF(btrim(p_storage_path), ''),
         p_source, p_source_product_id,
         COALESCE(max(image.position) + 1, 0),
         NOT COALESCE(bool_or(image.is_primary), false)
  FROM public.project_ffe_item_images AS image
  WHERE image.item_id = v_item.id
  RETURNING * INTO v_image;

  RETURN v_image;
END;
$$;

COMMENT ON FUNCTION public.add_ffe_item_image(uuid, text, text, text, uuid) IS
  'Appends a picture to a project item (00807): last position; primary when the item has no primary. '
  'can_buy_for_project on the item''s job, else 42501.';

REVOKE ALL ON FUNCTION public.add_ffe_item_image(uuid, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_ffe_item_image(uuid, text, text, text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_ffe_item_primary_image(p_image_id uuid)
RETURNS public.project_ffe_item_images
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_image public.project_ffe_item_images%ROWTYPE;
BEGIN
  SELECT * INTO v_image FROM public.project_ffe_item_images WHERE id = p_image_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That picture is no longer on this piece.'
      USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM public._ffe_item_images_require_team(v_image.item_id);

  -- Two statements: the one-primary index is checked row by row.
  UPDATE public.project_ffe_item_images
  SET is_primary = false
  WHERE item_id = v_image.item_id AND is_primary AND id <> p_image_id;
  UPDATE public.project_ffe_item_images
  SET is_primary = true
  WHERE id = p_image_id
  RETURNING * INTO v_image;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That picture is no longer on this piece.'
      USING ERRCODE = 'no_data_found';
  END IF;
  RETURN v_image;
END;
$$;

COMMENT ON FUNCTION public.set_ffe_item_primary_image(uuid) IS
  'Makes one picture its item''s primary (00807). can_buy_for_project, else 42501.';

REVOKE ALL ON FUNCTION public.set_ffe_item_primary_image(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ffe_item_primary_image(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reorder_ffe_item_images(p_item_id uuid, p_image_ids uuid[])
RETURNS SETOF public.project_ffe_item_images
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_item public.project_ffe_items%ROWTYPE;
BEGIN
  v_item := public._ffe_item_images_require_team(p_item_id);
  IF p_image_ids IS NULL
     OR cardinality(p_image_ids) <> (SELECT count(DISTINCT listed) FROM unnest(p_image_ids) AS listed)
     OR cardinality(p_image_ids) <> (
       SELECT count(*) FROM public.project_ffe_item_images AS image WHERE image.item_id = v_item.id)
     OR EXISTS (
       SELECT 1 FROM unnest(p_image_ids) AS listed(id)
       WHERE NOT EXISTS (
         SELECT 1 FROM public.project_ffe_item_images AS image
         WHERE image.id = listed.id AND image.item_id = v_item.id))
  THEN
    RAISE EXCEPTION 'The new order must name every picture on this piece once.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.project_ffe_item_images AS image
  SET position = (listed.ordinality - 1)::integer
  FROM unnest(p_image_ids) WITH ORDINALITY AS listed(id, ordinality)
  WHERE image.id = listed.id;

  RETURN QUERY
  SELECT image.* FROM public.project_ffe_item_images AS image
  WHERE image.item_id = v_item.id
  ORDER BY image.position, image.created_at, image.id;
END;
$$;

COMMENT ON FUNCTION public.reorder_ffe_item_images(uuid, uuid[]) IS
  'Sets an item''s picture order (00807): p_image_ids names every picture on the item once; '
  'positions become 0..n-1. Returns the pictures in order. can_buy_for_project, else 42501.';

REVOKE ALL ON FUNCTION public.reorder_ffe_item_images(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_ffe_item_images(uuid, uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.unlink_ffe_item_image(p_image_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_image public.project_ffe_item_images%ROWTYPE;
BEGIN
  SELECT * INTO v_image FROM public.project_ffe_item_images WHERE id = p_image_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That picture is no longer on this piece.'
      USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM public._ffe_item_images_require_team(v_image.item_id);

  -- The link row only. The stored file stays where it is.
  DELETE FROM public.project_ffe_item_images WHERE id = p_image_id
  RETURNING * INTO v_image;
  IF FOUND AND v_image.is_primary THEN
    UPDATE public.project_ffe_item_images
    SET is_primary = true
    WHERE id = (
      SELECT next_image.id FROM public.project_ffe_item_images AS next_image
      WHERE next_image.item_id = v_image.item_id
      ORDER BY next_image.position, next_image.created_at, next_image.id
      LIMIT 1
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.unlink_ffe_item_image(uuid) IS
  'Takes a picture off its item (00807): deletes the link row, never the stored file. When it was '
  'the primary, the first remaining picture by position becomes primary. can_buy_for_project, '
  'else 42501.';

REVOKE ALL ON FUNCTION public.unlink_ffe_item_image(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlink_ffe_item_image(uuid) TO authenticated, service_role;

-- ─── 7. Storage policies on project-item-images ─────────────────────────────
-- Public URL reads need no policy. Listing, upload and replace: the studio
-- leg on ${project_id}/…. No delete policy.

DROP POLICY IF EXISTS "Project item images studio select" ON storage.objects;
CREATE POLICY "Project item images studio select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-item-images'
    AND public.can_buy_for_project(
      CASE WHEN name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.+$'
           THEN ((storage.foldername(name))[1])::uuid END
    )
  );

DROP POLICY IF EXISTS "Project item images studio insert" ON storage.objects;
CREATE POLICY "Project item images studio insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-item-images'
    AND public.can_buy_for_project(
      CASE WHEN name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.+$'
           THEN ((storage.foldername(name))[1])::uuid END
    )
  );

DROP POLICY IF EXISTS "Project item images studio update" ON storage.objects;
CREATE POLICY "Project item images studio update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'project-item-images'
    AND public.can_buy_for_project(
      CASE WHEN name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.+$'
           THEN ((storage.foldername(name))[1])::uuid END
    )
  )
  WITH CHECK (
    bucket_id = 'project-item-images'
    AND public.can_buy_for_project(
      CASE WHEN name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.+$'
           THEN ((storage.foldername(name))[1])::uuid END
    )
  );

-- ─── 8. get_client_project_selections (base 00755:432) ──────────────────────

CREATE OR REPLACE FUNCTION public.get_client_project_selections(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_actor uuid:=auth.uid(); v_project public.projects%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT * INTO v_project FROM public.projects WHERE id=p_project_id;
  IF NOT FOUND OR NOT(v_project.client_id=v_actor OR public.is_studio_comember(v_project.designer_id)) THEN
    RAISE EXCEPTION 'project not found or not accessible' USING ERRCODE='insufficient_privilege';
  END IF;
  RETURN jsonb_build_object('projectId',v_project.id,'projectName',v_project.name,'selections',COALESCE((
    SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id',item.id,'threadId',item.selection_thread_id,'name',item.name,
      'category',item.ffe_category,'assignmentScope',item.assignment_scope,
      'roomId',item.project_room_id,'roomName',room.name,'quantity',item.quantity,
      'productId',item.product_id,'logisticsStatus',item.status,
      -- 00745: additive.
      'unit',line_unit.unit,
      -- 00807: additive. The item's own pictures: the primary, and all in order.
      'primaryImageUrl',public.primary_image_url(item),
      'imageUrls',to_jsonb(public.image_urls(item)),
      'rooms',public._client_line_rooms(
        item.id, authorization_item.id IS NOT NULL, authorization_item.snapshot,
        -- 00755 (F-E3): the frozen room name first.
        COALESCE(authorization_item.room_name, room.name),
        COALESCE(authorization_item.quantity, item.quantity), line_unit.unit)
    )) ORDER BY room.sort_order NULLS FIRST,item.sort_order,item.created_at,item.id)
    FROM public.project_ffe_items item
    LEFT JOIN public.project_rooms room ON room.id=item.project_room_id
    LEFT JOIN public.furnishing_authorization_items authorization_item
      ON authorization_item.id=item.source_authorization_item_id
    -- 00755 (F-E4): a frozen line's unit is the snapshot's, defaulting to 'each'.
    CROSS JOIN LATERAL (SELECT CASE WHEN authorization_item.id IS NOT NULL
      THEN COALESCE(authorization_item.snapshot->>'unit', 'each') ELSE item.unit END AS unit) line_unit
    WHERE item.project_id=p_project_id AND item.removed_at IS NULL
      AND item.design_disposition='selected'
  ),'[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_project_selections(uuid)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_client_project_selections(uuid) TO authenticated,service_role;

-- ─── 9. get_client_project_threshold (base 00755:474) ───────────────────────

CREATE OR REPLACE FUNCTION public.get_client_project_threshold(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
BEGIN
  -- 00441's preamble, verbatim.
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
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
    -- 00423's origin test: the project stands on a signed design-services
    -- instrument, or it is a legacy project the commercial rail never touched.
    'origin', CASE WHEN EXISTS (
      SELECT 1 FROM public.project_commercial_documents AS doc
      WHERE doc.project_id = p_project_id
        AND doc.is_origin
        AND doc.document_kind IN ('design_services', 'design_build')
    ) THEN 'commercial' ELSE 'legacy' END,

    -- ── furnishings: the FROZEN authorization snapshot the client signed ──
    -- Money comes from furnishing_authorization_items.client_* — the columns
    -- the client put her name to — never from the live working row.
    'selections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', item.id,
        'kind', 'furnishings',
        'threadId', item.selection_thread_id,
        'name', item.name,
        'category', item.ffe_category,
        'assignmentScope', item.assignment_scope,
        'roomId', item.project_room_id,
        'roomName', COALESCE(room.name, authorization_item.room_name),
        'conceptRenderUrl', room.concept_render_url,
        'conceptRenderCaption', room.concept_render_caption,
        'conceptRenderUploadedAt', room.concept_render_uploaded_at,
        'conceptRenderUploadedBy', room.concept_render_uploaded_by,
        'quantity', authorization_item.quantity,
        -- 00745: additive. The rooms she signed, from the frozen snapshot.
        'unit', line_unit.unit,
        'rooms', public._client_line_rooms(
          item.id, true, authorization_item.snapshot,
          -- 00755 (F-E3): the frozen room name first.
          COALESCE(authorization_item.room_name, room.name),
          authorization_item.quantity, line_unit.unit),
        'clientUnitPriceCents', authorization_item.client_unit_price_cents,
        'clientLineTotalCents', authorization_item.client_line_total_cents,
        'itemType', item.item_type,
        'logisticsStatus', item.status,
        'updatedAt', GREATEST(item.updated_at, item.last_status_change_at, doc.executed_at),
        'tradeJourney', NULL,
        -- The block exists because the CLIENT signed an allowance — that is the
        -- frozen snapshot's business (authorization_item.item_type), and it
        -- never changes.
        --
        -- 00423 resolved it off the LIVE schedule line (item.item_type = 'fixed'
        -- → item.line_total_cents). That is the one path on which the restored
        -- payload would still have handed the client an unsigned working-row
        -- figure the studio can move under her, and it is withdrawn here: an
        -- allowance is RESOLVED when a later EXECUTED authorization snapshots the
        -- same live line as 'fixed', and the resolved figure is that snapshot's
        -- own client_line_total_cents. Until such an instrument exists the
        -- allowance is unresolved and this is null.
        'allowance', CASE WHEN authorization_item.item_type = 'allowance' THEN jsonb_build_object(
          'ceilingCents', authorization_item.client_line_total_cents,
          'resolvedCents', (
            SELECT resolution.client_line_total_cents
            FROM public.furnishing_authorization_items AS resolution
            JOIN public.project_commercial_documents AS resolution_doc
              ON resolution_doc.id = resolution.commercial_document_id
             AND resolution_doc.executed_at IS NOT NULL
            JOIN public.proposals AS resolution_proposal
              ON resolution_proposal.id = resolution_doc.proposal_id
             AND resolution_proposal.commercial_state = 'executed'
            WHERE resolution.source_ffe_item_id = item.id
              AND resolution.item_type = 'fixed'
            ORDER BY resolution_doc.executed_at DESC, resolution.id
            LIMIT 1
          )
        ) ELSE NULL END,
        'instrument', jsonb_build_object(
          'documentId', doc.id,
          'proposalId', proposal.id,
          'name', doc.wave_name,
          'executedAt', doc.executed_at
        ),
        'productId', item.product_id,
        -- 00807: the item's own primary picture, no longer the live product's
        -- first image; and every picture in order.
        'imageUrl', public.primary_image_url(item),
        'primaryImageUrl', public.primary_image_url(item),
        'imageUrls', to_jsonb(public.image_urls(item)),
        'docCode', item.doc_code
      ) ORDER BY room.sort_order NULLS FIRST, item.sort_order, item.created_at, item.id)
      FROM public.project_ffe_items AS item
      JOIN public.furnishing_authorization_items AS authorization_item
        ON authorization_item.id = item.source_authorization_item_id
      JOIN public.project_commercial_documents AS doc
        ON doc.id = authorization_item.commercial_document_id
       AND doc.executed_at IS NOT NULL
      JOIN public.proposals AS proposal
        ON proposal.id = doc.proposal_id
       AND proposal.commercial_state = 'executed'
      LEFT JOIN public.project_rooms AS room ON room.id = item.project_room_id
      CROSS JOIN LATERAL (
        -- 00755 (F-E4): the snapshot's unit, defaulting to 'each'.
        SELECT COALESCE(authorization_item.snapshot->>'unit', 'each') AS unit
      ) AS line_unit
      WHERE item.project_id = p_project_id
        AND item.removed_at IS NULL
        AND item.design_disposition NOT IN ('not_selected', 'superseded')
    ), '[]'::jsonb)

    -- ── trade: the presence line under an executed trade scope ────────────
    -- clientLineTotalCents reads the live row on purpose: 00423's
    -- guard_trade_presence_line_lock freezes exactly that money once the scope
    -- is executed, which is why this branch has no snapshot table of its own.
    || COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', item.id,
        'kind', 'trade',
        'threadId', item.selection_thread_id,
        'name', item.name,
        'category', item.ffe_category,
        'assignmentScope', item.assignment_scope,
        'roomId', item.project_room_id,
        'roomName', COALESCE(room.name, section.room_name),
        'conceptRenderUrl', room.concept_render_url,
        'conceptRenderCaption', room.concept_render_caption,
        'conceptRenderUploadedAt', room.concept_render_uploaded_at,
        'conceptRenderUploadedBy', room.concept_render_uploaded_by,
        'quantity', item.quantity,
        -- 00745: additive. No snapshot table on this branch: the live line.
        'unit', item.unit,
        'rooms', public._client_line_rooms(
          item.id, false, NULL,
          COALESCE(room.name, section.room_name),
          item.quantity, item.unit),
        'clientUnitPriceCents', NULL,
        'clientLineTotalCents', item.line_total_cents,
        'itemType', item.item_type,
        'logisticsStatus', item.status,
        'updatedAt', GREATEST(item.updated_at, item.last_status_change_at, doc.executed_at),
        'tradeJourney', terms.progress_state,
        'allowance', NULL,
        'instrument', jsonb_build_object(
          'documentId', doc.id,
          'proposalId', proposal.id,
          'name', proposal.title,
          'executedAt', doc.executed_at
        ),
        'productId', item.product_id,
        -- 00807: the item's own primary picture, no longer the live product's
        -- first image; and every picture in order.
        'imageUrl', public.primary_image_url(item),
        'primaryImageUrl', public.primary_image_url(item),
        'imageUrls', to_jsonb(public.image_urls(item)),
        'docCode', item.doc_code
      ) ORDER BY room.sort_order NULLS FIRST, item.sort_order, item.created_at, item.id)
      FROM public.project_ffe_items AS item
      JOIN public.project_commercial_documents AS doc
        ON doc.id = item.trade_scope_document_id
       AND doc.executed_at IS NOT NULL
      JOIN public.proposals AS proposal
        ON proposal.id = doc.proposal_id
       AND proposal.commercial_state = 'executed'
      JOIN public.trade_scope_terms AS terms ON terms.proposal_id = proposal.id
      LEFT JOIN public.project_rooms AS room ON room.id = item.project_room_id
      LEFT JOIN LATERAL (
        SELECT scope_section.room_name
        FROM public.trade_scope_sections AS scope_section
        WHERE scope_section.proposal_id = proposal.id
          AND scope_section.project_room_id IS NOT DISTINCT FROM item.project_room_id
        ORDER BY scope_section.sort_order, scope_section.id
        LIMIT 1
      ) AS section ON true
      WHERE item.project_id = p_project_id
        AND item.removed_at IS NULL
        AND item.design_disposition NOT IN ('not_selected', 'superseded')
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_project_threshold(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_project_threshold(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_client_project_threshold(uuid) IS
  'The Client Page''s reader: what a client authorized on a project — furnishings snapshot lines (kind furnishings, money from the signed furnishing_authorization_items snapshot) and trade scope presence lines (kind trade, with tradeJourney). Trade cost, vendor cost, markup, purchase-order fields and bids never appear, and no live unsigned project_ffe_items money on any path. 00580 adds four room facts to each line — conceptRenderUrl, conceptRenderCaption, conceptRenderUploadedAt, conceptRenderUploadedBy — off the project_rooms join both branches already make; conceptRenderUrl is an object path inside the PRIVATE room-renders bucket, not a URL. 00745 adds unit and rooms [{name, quantity, unit}] to each line (furnishings from the frozen snapshot''s placements, trade from the live line); roomName stays the primary room. rough_cents, need_label, line_kind, link_kind and parent_ffe_item_id never appear. Carries 00423''s client-facing payload over 00441''s authorization preamble, key names and ordering. 00807: imageUrl is the item''s own primary picture (project_ffe_item_images), no longer products.images[1]; primaryImageUrl and imageUrls (position order) are added. Storage paths never appear.';
