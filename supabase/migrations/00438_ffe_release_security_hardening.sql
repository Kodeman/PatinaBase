-- 00438 — FF&E release security, lineage, and reconciliation hardening.

ALTER TABLE public.project_ffe_items
  ADD COLUMN IF NOT EXISTS role_identity text NOT NULL DEFAULT 'default'
    CHECK (role_identity ~ '^[a-z0-9][a-z0-9_.:-]{0,79}$');
ALTER TABLE public.project_ffe_import_batches
  ADD COLUMN IF NOT EXISTS commit_response jsonb
    CHECK (commit_response IS NULL OR jsonb_typeof(commit_response) = 'object');

CREATE TABLE IF NOT EXISTS public.project_review_access (
  edition_id uuid NOT NULL REFERENCES public.project_review_editions(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (edition_id, actor_id),
  CHECK (
    (status = 'active' AND revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL AND btrim(COALESCE(revoke_reason,'')) <> '')
  )
);
ALTER TABLE public.project_review_access ENABLE ROW LEVEL SECURITY;

INSERT INTO public.project_review_access(edition_id, actor_id)
SELECT edition.id, project.client_id
FROM public.project_review_editions edition
JOIN public.projects project ON project.id = edition.project_id
WHERE edition.status IN ('published','superseded','finalized')
  AND project.client_id IS NOT NULL
ON CONFLICT (edition_id, actor_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.project_ffe_board_reconciliation (
  source_kind text NOT NULL CHECK (source_kind IN ('activated_snapshot','working_board','working_item')),
  source_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  source_board_id uuid,
  source_item_id uuid,
  mapped_board_id uuid REFERENCES public.proposal_boards(id) ON DELETE SET NULL,
  mapped_selection_id uuid REFERENCES public.project_ffe_items(id) ON DELETE SET NULL,
  resolution text NOT NULL DEFAULT 'pending'
    CHECK (resolution IN ('pending','linked_selection','new_project_need','reference','verified')),
  source_fingerprint text NOT NULL,
  reconciled_at timestamptz,
  PRIMARY KEY (source_kind, source_id)
);
ALTER TABLE public.project_ffe_board_reconciliation ENABLE ROW LEVEL SECURITY;

INSERT INTO public.project_ffe_board_reconciliation(
  source_kind, source_id, project_id, source_board_id, mapped_board_id,
  resolution, source_fingerprint
)
SELECT 'activated_snapshot', board.id, board.project_id, board.source_board_id,
  working.id, CASE WHEN working.id IS NULL THEN 'pending' ELSE 'verified' END,
  encode(extensions.digest(jsonb_build_object(
    'id',board.id,'projectId',board.project_id,'sourceBoardId',board.source_board_id,
    'items',board.items,'sections',board.sections
  )::text,'sha256'),'hex')
FROM public.project_boards board
LEFT JOIN public.proposal_boards working ON working.source_project_board_id = board.id
ON CONFLICT (source_kind, source_id) DO NOTHING;

INSERT INTO public.project_ffe_board_reconciliation(
  source_kind, source_id, project_id, source_board_id, mapped_board_id,
  resolution, source_fingerprint
)
SELECT 'working_board', board.id, board.project_id, board.source_project_board_id,
  board.id, 'verified',
  encode(extensions.digest(jsonb_build_object(
    'id',board.id,'projectId',board.project_id,'projectRoomId',board.project_room_id,
    'sourceProjectBoardId',board.source_project_board_id
  )::text,'sha256'),'hex')
FROM public.proposal_boards board
WHERE board.project_id IS NOT NULL
ON CONFLICT (source_kind, source_id) DO NOTHING;

INSERT INTO public.project_ffe_board_reconciliation(
  source_kind, source_id, project_id, source_board_id, source_item_id,
  mapped_board_id, mapped_selection_id, resolution, source_fingerprint
)
SELECT 'working_item', item.id, board.project_id, board.source_project_board_id,
  item.id, board.id, item.project_ffe_item_id,
  CASE WHEN item.project_ffe_item_id IS NULL THEN 'reference' ELSE 'linked_selection' END,
  encode(extensions.digest(jsonb_build_object(
    'id',item.id,'boardId',item.board_id,'productId',item.product_id,
    'selectionId',item.project_ffe_item_id,'type',item.type
  )::text,'sha256'),'hex')
FROM public.proposal_board_items item
JOIN public.proposal_boards board ON board.id = item.board_id
WHERE board.project_id IS NOT NULL
ON CONFLICT (source_kind, source_id) DO NOTHING;

-- The legacy bucket remains available to legacy proposal paths only. Project
-- paths become unreadable immediately; operations may copy and delete them later.
UPDATE storage.buckets SET public = false WHERE id = 'proposal-mood-boards';
DROP POLICY IF EXISTS "Proposal mood boards are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Designers can upload proposal mood boards" ON storage.objects;
DROP POLICY IF EXISTS "Designers can replace their proposal mood boards" ON storage.objects;
DROP POLICY IF EXISTS "Designers can delete their proposal mood boards" ON storage.objects;
DROP POLICY IF EXISTS "Designers can upload project board images" ON storage.objects;
DROP POLICY IF EXISTS "Designers can replace project board images" ON storage.objects;
DROP POLICY IF EXISTS "Designers can delete project board images" ON storage.objects;

CREATE POLICY proposal_mood_boards_proposal_read
ON storage.objects FOR SELECT TO PUBLIC
USING (
  bucket_id = 'proposal-mood-boards'
  AND EXISTS (
    SELECT 1 FROM public.proposals proposal
    WHERE proposal.id::text = (storage.foldername(name))[1]
  )
);
CREATE POLICY proposal_mood_boards_proposal_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'proposal-mood-boards'
  AND EXISTS (
    SELECT 1 FROM public.proposals proposal
    WHERE proposal.id::text = (storage.foldername(name))[1]
      AND public.is_design_studio_comember(proposal.designer_id)
  )
);
CREATE POLICY proposal_mood_boards_proposal_update
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'proposal-mood-boards'
  AND EXISTS (
    SELECT 1 FROM public.proposals proposal
    WHERE proposal.id::text = (storage.foldername(name))[1]
      AND public.is_design_studio_comember(proposal.designer_id)
  )
)
WITH CHECK (
  bucket_id = 'proposal-mood-boards'
  AND EXISTS (
    SELECT 1 FROM public.proposals proposal
    WHERE proposal.id::text = (storage.foldername(name))[1]
      AND public.is_design_studio_comember(proposal.designer_id)
  )
);
CREATE POLICY proposal_mood_boards_proposal_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'proposal-mood-boards'
  AND EXISTS (
    SELECT 1 FROM public.proposals proposal
    WHERE proposal.id::text = (storage.foldername(name))[1]
      AND public.is_design_studio_comember(proposal.designer_id)
  )
);

UPDATE public.project_boards
SET cover_image_url = NULL,
    items = COALESCE((
      SELECT jsonb_agg(
        (entry.value - 'image_url')
        || jsonb_build_object('data', COALESCE(entry.value->'data','{}'::jsonb)
          - ARRAY['image_url','thumbnail_url','original_image_url','source_url'])
        ORDER BY entry.ordinality
      )
      FROM jsonb_array_elements(items) WITH ORDINALITY entry(value, ordinality)
    ), '[]'::jsonb)
WHERE cover_image_url LIKE '%/proposal-mood-boards/%'
   OR items::text LIKE '%proposal-mood-boards%';
UPDATE public.proposal_boards
SET cover_image_url = NULL
WHERE project_id IS NOT NULL AND cover_image_url LIKE '%/proposal-mood-boards/%';
UPDATE public.proposal_board_items item
SET image_url = NULL,
    data = item.data - ARRAY['image_url','thumbnail_url','original_image_url','source_url']
FROM public.proposal_boards board
WHERE board.id = item.board_id AND board.project_id IS NOT NULL
  AND (item.image_url LIKE '%/proposal-mood-boards/%' OR item.data::text LIKE '%proposal-mood-boards%');

CREATE OR REPLACE FUNCTION public.guard_project_board_public_media_reference()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
DECLARE v_project_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'proposal_boards' THEN
    v_project_id := NEW.project_id;
    IF v_project_id IS NOT NULL AND COALESCE(NEW.cover_image_url,'') LIKE '%/proposal-mood-boards/%' THEN
      RAISE EXCEPTION 'project boards cannot reference the proposal media bucket'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT project_id INTO v_project_id FROM public.proposal_boards WHERE id = NEW.board_id;
    IF v_project_id IS NOT NULL AND (
      COALESCE(NEW.image_url,'') LIKE '%/proposal-mood-boards/%'
      OR NEW.data::text LIKE '%proposal-mood-boards%'
    ) THEN
      RAISE EXCEPTION 'project board items cannot reference the proposal media bucket'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_project_board_public_media_reference_trg ON public.proposal_boards;
CREATE TRIGGER guard_project_board_public_media_reference_trg
BEFORE INSERT OR UPDATE OF project_id,cover_image_url ON public.proposal_boards
FOR EACH ROW EXECUTE FUNCTION public.guard_project_board_public_media_reference();
DROP TRIGGER IF EXISTS guard_project_item_public_media_reference_trg ON public.proposal_board_items;
CREATE TRIGGER guard_project_item_public_media_reference_trg
BEFORE INSERT OR UPDATE OF board_id,image_url,data ON public.proposal_board_items
FOR EACH ROW EXECUTE FUNCTION public.guard_project_board_public_media_reference();

CREATE OR REPLACE FUNCTION public.guard_ffe_media_project_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
DECLARE v_related_project uuid;
BEGIN
  IF TG_TABLE_NAME = 'project_ffe_media_assets' AND NEW.ffe_item_id IS NOT NULL THEN
    SELECT project_id INTO v_related_project FROM public.project_ffe_items WHERE id = NEW.ffe_item_id;
  ELSIF TG_TABLE_NAME = 'project_review_media_assets' AND NEW.source_asset_id IS NOT NULL THEN
    SELECT project_id INTO v_related_project FROM public.project_ffe_media_assets WHERE id = NEW.source_asset_id;
  ELSIF TG_TABLE_NAME = 'project_ffe_import_batches' AND NEW.source_asset_id IS NOT NULL THEN
    SELECT project_id INTO v_related_project FROM public.project_ffe_media_assets WHERE id = NEW.source_asset_id;
  ELSE
    RETURN NEW;
  END IF;
  IF v_related_project IS NULL OR v_related_project IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'media source and target must belong to the same project'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_ffe_media_project_identity_trg ON public.project_ffe_media_assets;
CREATE TRIGGER guard_ffe_media_project_identity_trg
BEFORE INSERT OR UPDATE OF project_id,ffe_item_id ON public.project_ffe_media_assets
FOR EACH ROW EXECUTE FUNCTION public.guard_ffe_media_project_identity();
DROP TRIGGER IF EXISTS guard_review_media_project_identity_trg ON public.project_review_media_assets;
CREATE TRIGGER guard_review_media_project_identity_trg
BEFORE INSERT OR UPDATE OF project_id,source_asset_id ON public.project_review_media_assets
FOR EACH ROW EXECUTE FUNCTION public.guard_ffe_media_project_identity();
DROP TRIGGER IF EXISTS guard_import_media_project_identity_trg ON public.project_ffe_import_batches;
CREATE TRIGGER guard_import_media_project_identity_trg
BEFORE INSERT OR UPDATE OF project_id,source_asset_id ON public.project_ffe_import_batches
FOR EACH ROW EXECUTE FUNCTION public.guard_ffe_media_project_identity();

CREATE OR REPLACE FUNCTION public.guard_published_review_media_asset()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.project_review_items item
    JOIN public.project_review_editions edition ON edition.id = item.edition_id
    CROSS JOIN LATERAL jsonb_array_elements(item.media_manifest) media
    WHERE edition.status IN ('published','superseded','finalized')
      AND media->>'id' = OLD.id::text
  ) THEN
    RAISE EXCEPTION 'media referenced by a published review is immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW,OLD);
END;
$$;
DROP TRIGGER IF EXISTS guard_published_review_media_asset_trg ON public.project_review_media_assets;
CREATE TRIGGER guard_published_review_media_asset_trg
BEFORE UPDATE OR DELETE ON public.project_review_media_assets
FOR EACH ROW EXECUTE FUNCTION public.guard_published_review_media_asset();

CREATE OR REPLACE FUNCTION public.guard_project_ffe_selection_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_thread_project uuid;
  v_cursor uuid;
  v_cursor_thread uuid;
  v_cursor_project uuid;
  v_seen uuid[] := '{}';
BEGIN
  IF NEW.selection_thread_id IS NULL THEN
    NEW.selection_thread_id := extensions.gen_random_uuid();
  END IF;
  SELECT project_id INTO v_thread_project
  FROM public.project_ffe_selection_threads WHERE id = NEW.selection_thread_id;
  IF v_thread_project IS NULL THEN
    INSERT INTO public.project_ffe_selection_threads(id,project_id,created_by)
    VALUES(NEW.selection_thread_id,NEW.project_id,auth.uid());
  ELSIF v_thread_project IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'selection thread belongs to another project'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.assignment_scope = 'room' THEN
    IF NEW.project_room_id IS NULL OR NOT EXISTS(
      SELECT 1 FROM public.project_rooms room
      WHERE room.id=NEW.project_room_id AND room.project_id=NEW.project_id
    ) THEN RAISE EXCEPTION 'room assignment does not belong to selection project'
      USING ERRCODE='integrity_constraint_violation'; END IF;
  ELSIF NEW.project_room_id IS NOT NULL THEN
    RAISE EXCEPTION 'non-room assignment cannot carry a room' USING ERRCODE='check_violation';
  END IF;
  IF NEW.supersedes_ffe_item_id IS NOT NULL THEN
    v_cursor := NEW.supersedes_ffe_item_id;
    LOOP
      IF v_cursor = NEW.id OR v_cursor = ANY(v_seen) THEN
        RAISE EXCEPTION 'replacement chain cannot contain a cycle'
          USING ERRCODE = 'integrity_constraint_violation';
      END IF;
      v_seen := array_append(v_seen,v_cursor);
      SELECT selection_thread_id,project_id,supersedes_ffe_item_id
      INTO v_cursor_thread,v_cursor_project,v_cursor
      FROM public.project_ffe_items WHERE id=v_cursor;
      IF NOT FOUND OR v_cursor_thread IS DISTINCT FROM NEW.selection_thread_id
         OR v_cursor_project IS DISTINCT FROM NEW.project_id THEN
        RAISE EXCEPTION 'replacement predecessor must be in the same project and thread'
          USING ERRCODE='integrity_constraint_violation';
      END IF;
      EXIT WHEN v_cursor IS NULL;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_project_ffe_thread_primary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_thread_id uuid := COALESCE(NEW.selection_thread_id,OLD.selection_thread_id); v_primary uuid;
BEGIN
  SELECT id INTO v_primary
  FROM public.project_ffe_items
  WHERE selection_thread_id=v_thread_id AND removed_at IS NULL
  ORDER BY (design_disposition='selected') DESC, created_at, id
  LIMIT 1;
  UPDATE public.project_ffe_selection_threads
  SET primary_ffe_item_id=v_primary,updated_at=now() WHERE id=v_thread_id;
  RETURN COALESCE(NEW,OLD);
END;
$$;
DROP TRIGGER IF EXISTS zz_set_project_ffe_thread_primary_trg ON public.project_ffe_items;
CREATE TRIGGER zz_set_project_ffe_thread_primary_trg
AFTER INSERT OR UPDATE OF design_disposition,removed_at,selection_thread_id OR DELETE
ON public.project_ffe_items FOR EACH ROW EXECUTE FUNCTION public.set_project_ffe_thread_primary();

CREATE OR REPLACE FUNCTION public.assert_project_ffe_thread_consistency()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_thread_id uuid:=COALESCE(NEW.selection_thread_id,OLD.selection_thread_id); v_selected integer; v_alternates integer; v_primary uuid; v_expected uuid;
BEGIN
  SELECT count(*) FILTER(WHERE design_disposition='selected'),
         count(*) FILTER(WHERE design_disposition='alternate')
  INTO v_selected,v_alternates
  FROM public.project_ffe_items WHERE selection_thread_id=v_thread_id AND removed_at IS NULL;
  IF v_selected > 1 OR (v_alternates > 0 AND v_selected <> 1) THEN
    RAISE EXCEPTION 'selection thread must have exactly one selected row when alternatives exist'
      USING ERRCODE='integrity_constraint_violation';
  END IF;
  SELECT primary_ffe_item_id INTO v_primary FROM public.project_ffe_selection_threads WHERE id=v_thread_id;
  SELECT id INTO v_expected FROM public.project_ffe_items
  WHERE selection_thread_id=v_thread_id AND removed_at IS NULL
  ORDER BY (design_disposition='selected') DESC,created_at,id LIMIT 1;
  IF v_primary IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'selection thread primary is inconsistent'
      USING ERRCODE='integrity_constraint_violation';
  END IF;
  RETURN COALESCE(NEW,OLD);
END;
$$;
DROP TRIGGER IF EXISTS assert_project_ffe_thread_consistency_trg ON public.project_ffe_items;
CREATE CONSTRAINT TRIGGER assert_project_ffe_thread_consistency_trg
AFTER INSERT OR UPDATE OR DELETE ON public.project_ffe_items
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.assert_project_ffe_thread_consistency();

CREATE OR REPLACE FUNCTION public.guard_ffe_rpc_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF auth.uid() IS NULL OR current_user IN ('postgres','service_role') THEN
    RETURN COALESCE(NEW,OLD);
  END IF;
  RAISE EXCEPTION 'FF&E lifecycle, assignment, pricing, replacement, and removal mutations are RPC-only'
    USING ERRCODE='insufficient_privilege';
END;
$$;

DROP POLICY IF EXISTS project_ffe_selection_threads_studio_rw ON public.project_ffe_selection_threads;
CREATE POLICY project_ffe_selection_threads_studio_read ON public.project_ffe_selection_threads
FOR SELECT TO authenticated USING(EXISTS(
  SELECT 1 FROM public.projects project WHERE project.id=project_id AND public.is_studio_comember(project.designer_id)
));
DROP POLICY IF EXISTS project_review_editions_studio_rw ON public.project_review_editions;
CREATE POLICY project_review_editions_studio_read ON public.project_review_editions
FOR SELECT TO authenticated USING(EXISTS(
  SELECT 1 FROM public.projects project WHERE project.id=project_id AND public.is_studio_comember(project.designer_id)
));
DROP POLICY IF EXISTS project_review_items_studio_rw ON public.project_review_items;
CREATE POLICY project_review_items_studio_read ON public.project_review_items
FOR SELECT TO authenticated USING(EXISTS(
  SELECT 1 FROM public.project_review_editions edition JOIN public.projects project ON project.id=edition.project_id
  WHERE edition.id=edition_id AND public.is_studio_comember(project.designer_id)
));
DROP POLICY IF EXISTS project_ffe_media_assets_studio_rw ON public.project_ffe_media_assets;
CREATE POLICY project_ffe_media_assets_studio_read ON public.project_ffe_media_assets
FOR SELECT TO authenticated USING(EXISTS(
  SELECT 1 FROM public.projects project WHERE project.id=project_id AND public.is_studio_comember(project.designer_id)
));
CREATE POLICY project_review_access_studio_read ON public.project_review_access
FOR SELECT TO authenticated USING(EXISTS(
  SELECT 1 FROM public.project_review_editions edition JOIN public.projects project ON project.id=edition.project_id
  WHERE edition.id=edition_id AND public.is_studio_comember(project.designer_id)
));
CREATE POLICY project_ffe_board_reconciliation_studio_read ON public.project_ffe_board_reconciliation
FOR SELECT TO authenticated USING(EXISTS(
  SELECT 1 FROM public.projects project WHERE project.id=project_id AND public.is_studio_comember(project.designer_id)
));
CREATE POLICY item_feedback_studio_review_read ON public.item_feedback
FOR SELECT TO authenticated USING(
  project_review_item_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.project_review_items review_item
    JOIN public.project_review_editions edition ON edition.id=review_item.edition_id
    JOIN public.projects project ON project.id=edition.project_id
    WHERE review_item.id=project_review_item_id AND public.is_studio_comember(project.designer_id)
  )
);

REVOKE ALL ON public.project_ffe_selection_threads,public.project_review_editions,
  public.project_review_items,public.project_review_media_assets,public.project_ffe_media_assets,
  public.project_review_delivery_attempts,public.project_ffe_import_batches,
  public.project_ffe_import_rows,public.project_ffe_command_idempotency,
  public.purchase_order_changes,public.project_review_access,
  public.project_ffe_board_reconciliation
FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.project_ffe_selection_threads,public.project_review_editions,
  public.project_review_items,public.project_review_media_assets,public.project_ffe_media_assets,
  public.project_review_delivery_attempts,public.project_ffe_import_batches,
  public.project_ffe_import_rows,public.purchase_order_changes,public.project_review_access,
  public.project_ffe_board_reconciliation TO authenticated;
GRANT SELECT ON public.project_ffe_command_idempotency TO authenticated;
GRANT ALL ON public.project_ffe_selection_threads,public.project_review_editions,
  public.project_review_items,public.project_review_media_assets,public.project_ffe_media_assets,
  public.project_review_delivery_attempts,public.project_ffe_import_batches,
  public.project_ffe_import_rows,public.project_ffe_command_idempotency,
  public.purchase_order_changes,public.project_review_access,
  public.project_ffe_board_reconciliation TO service_role;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.project_ffe_items FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLES FROM authenticated;

REVOKE ALL ON FUNCTION public.guard_project_board_public_media_reference(),
  public.guard_ffe_media_project_identity(),public.guard_published_review_media_asset(),
  public.assert_project_ffe_thread_consistency()
FROM PUBLIC,anon,authenticated,service_role;
