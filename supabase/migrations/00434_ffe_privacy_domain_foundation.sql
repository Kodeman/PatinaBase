-- Materialized from Strata's migration ledger (applied out-of-band 2026-08-10;
-- git had no source file on main). Do not re-run manually.
-- ═══════════════════════════════════════════════════════════════════════════
-- 00434 — FF&E privacy-first domain foundation
--
-- The first statements fail closed: raw client reads of working FF&E/boards,
-- project live-board shares, and project uploads to the legacy public mood-board
-- bucket are removed before any new working columns are created.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Clients can view their project FFE items"
  ON public.project_ffe_items;
DROP POLICY IF EXISTS "Clients view their project boards"
  ON public.proposal_boards;
DROP POLICY IF EXISTS "Clients view items on their project boards"
  ON public.proposal_board_items;
DROP POLICY IF EXISTS "Inherit project access for boards"
  ON public.project_boards;
DROP POLICY IF EXISTS item_feedback_client_insert ON public.item_feedback;
DROP POLICY IF EXISTS item_feedback_client_select ON public.item_feedback;

UPDATE public.document_shares share
SET status = 'revoked', updated_at = now()
FROM public.proposal_boards board
WHERE share.board_id = board.id
  AND board.project_id IS NOT NULL
  AND share.status = 'active';

DROP POLICY IF EXISTS "Designers can upload project board images" ON storage.objects;
DROP POLICY IF EXISTS "Designers can replace project board images" ON storage.objects;
DROP POLICY IF EXISTS "Designers can delete project board images" ON storage.objects;

CREATE OR REPLACE FUNCTION public.create_board_share(
  p_board_id uuid,
  p_label text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS TABLE(id uuid, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_token text;
  v_hash text;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    RAISE EXCEPTION 'expiry must be in the future'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.proposal_boards board
    JOIN public.proposals proposal ON proposal.id = board.proposal_id
    WHERE board.id = p_board_id
      AND board.project_id IS NULL
      AND board.status = 'active'
      AND proposal.status IN ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired')
      AND public.is_design_studio_comember(proposal.designer_id)
  ) THEN
    RAISE EXCEPTION 'proposal board not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  INSERT INTO public.document_shares (
    proposal_id, spec_book_artifact_id, board_id, token_hash, label,
    visibility, status, expires_at, created_by
  ) VALUES (
    NULL, NULL, p_board_id, v_hash, NULLIF(btrim(p_label), ''),
    jsonb_build_object('feedbackEnabled', false), 'active', p_expires_at, auth.uid()
  )
  RETURNING document_shares.id INTO v_id;
  RETURN QUERY SELECT v_id, v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_board_share(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_hash text;
  v_share public.document_shares;
  v_payload jsonb;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9A-Fa-f]{64}$' THEN
    RETURN NULL;
  END IF;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  SELECT share.* INTO v_share
  FROM public.document_shares share
  JOIN public.proposal_boards board ON board.id = share.board_id
  JOIN public.proposals proposal ON proposal.id = board.proposal_id
  WHERE share.token_hash = v_hash
    AND share.status = 'active'
    AND (share.expires_at IS NULL OR share.expires_at > now())
    AND board.project_id IS NULL
    AND board.status = 'active'
    AND proposal.status IN ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired')
  LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'shareId', v_share.id,
    'label', v_share.label,
    'shareExpiresAt', v_share.expires_at,
    'studioName', COALESCE(profile.full_name, profile.email, 'the studio'),
    'board', jsonb_build_object(
      'id', board.id,
      'name', board.name,
      'cover_image_url', board.cover_image_url,
      'canvas_width', board.canvas_width,
      'canvas_height', board.canvas_height,
      'background_color', board.background_color,
      'sections', CASE WHEN jsonb_typeof(board.sections) = 'array' THEN board.sections ELSE '[]'::jsonb END,
      'items', COALESCE((
        SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id', item.id, 'type', item.type, 'x', item.x, 'y', item.y,
          'width', item.width, 'height', item.height, 'z_index', item.z_index,
          'rotation', item.rotation, 'locked', item.locked,
          'image_url', item.image_url, 'content', item.content,
          'data', jsonb_strip_nulls(jsonb_build_object(
            'name', item.data->'name', 'text', item.data->'text',
            'image_url', item.data->'image_url',
            'thumbnail_url', item.data->'thumbnail_url',
            'original_image_url', item.data->'original_image_url',
            'room_type', item.data->'room_type', 'swatches', item.data->'swatches',
            'price_cents', item.data->'price_cents', 'vendor_name', item.data->'vendor_name',
            'source_url', item.data->'source_url',
            'lead_time_weeks', item.data->'lead_time_weeks',
            'section_id', item.data->'section_id'
          ))
        )) ORDER BY item.z_index, item.created_at, item.id)
        FROM public.proposal_board_items item WHERE item.board_id = board.id
      ), '[]'::jsonb)
    )
  ) INTO v_payload
  FROM public.proposal_boards board
  JOIN public.proposals proposal ON proposal.id = board.proposal_id
  LEFT JOIN public.profiles profile ON profile.id = proposal.designer_id
  WHERE board.id = v_share.board_id AND board.project_id IS NULL;

  UPDATE public.document_shares
  SET view_count = view_count + 1, last_viewed_at = now()
  WHERE id = v_share.id;
  RETURN v_payload;
END;
$$;

INSERT INTO public.project_ffe_media_reconciliation (
  source_bucket, source_path, classification, project_id, proposal_id,
  source_checksum, disposition
)
SELECT
  object.bucket_id,
  object.name,
  CASE
    WHEN project.id IS NOT NULL THEN 'project_working'
    WHEN proposal.id IS NOT NULL THEN 'proposal_legacy'
    ELSE 'unclassified'
  END,
  project.id,
  CASE WHEN project.id IS NULL THEN proposal.id ELSE NULL END,
  lower(COALESCE(object.metadata->>'eTag', object.metadata->>'etag')),
  CASE WHEN project.id IS NULL AND proposal.id IS NOT NULL
    THEN 'retained_proposal' ELSE 'pending' END
FROM storage.objects object
LEFT JOIN public.projects project
  ON project.id::text = (storage.foldername(object.name))[1]
LEFT JOIN public.proposals proposal
  ON proposal.id::text = (storage.foldername(object.name))[1]
WHERE object.bucket_id = 'proposal-mood-boards'
ON CONFLICT (source_bucket, source_path) DO UPDATE SET
  classification = EXCLUDED.classification,
  project_id = EXCLUDED.project_id,
  proposal_id = EXCLUDED.proposal_id,
  source_checksum = COALESCE(EXCLUDED.source_checksum, project_ffe_media_reconciliation.source_checksum),
  disposition = CASE
    WHEN project_ffe_media_reconciliation.disposition IN ('verified', 'quarantined', 'deleted')
      THEN project_ffe_media_reconciliation.disposition
    ELSE EXCLUDED.disposition
  END;

-- Selection identity and deterministic existing-row reconciliation.
CREATE TABLE IF NOT EXISTS public.project_ffe_selection_threads (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  primary_ffe_item_id uuid,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_ffe_items
  ADD COLUMN IF NOT EXISTS selection_thread_id uuid,
  ADD COLUMN IF NOT EXISTS supersedes_ffe_item_id uuid,
  ADD COLUMN IF NOT EXISTS design_disposition text,
  ADD COLUMN IF NOT EXISTS assignment_scope text,
  ADD COLUMN IF NOT EXISTS removed_at timestamptz,
  ADD COLUMN IF NOT EXISTS removed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS removal_reason text;

INSERT INTO public.project_ffe_selection_threads (id, project_id, primary_ffe_item_id, created_by, created_at, updated_at)
SELECT item.id, item.project_id, item.id, NULL, item.created_at, item.updated_at
FROM public.project_ffe_items item
ON CONFLICT (id) DO NOTHING;

UPDATE public.project_ffe_items
SET selection_thread_id = id,
    design_disposition = 'selected',
    assignment_scope = CASE WHEN project_room_id IS NULL THEN 'throughout' ELSE 'room' END
WHERE selection_thread_id IS NULL
   OR design_disposition IS NULL
   OR assignment_scope IS NULL;

ALTER TABLE public.project_ffe_items
  ALTER COLUMN selection_thread_id SET NOT NULL,
  ALTER COLUMN design_disposition SET DEFAULT 'candidate',
  ALTER COLUMN design_disposition SET NOT NULL,
  ALTER COLUMN assignment_scope SET DEFAULT 'unassigned',
  ALTER COLUMN assignment_scope SET NOT NULL;

ALTER TABLE public.project_ffe_items
  DROP CONSTRAINT IF EXISTS project_ffe_items_selection_thread_id_fkey,
  ADD CONSTRAINT project_ffe_items_selection_thread_id_fkey
    FOREIGN KEY (selection_thread_id)
    REFERENCES public.project_ffe_selection_threads(id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  DROP CONSTRAINT IF EXISTS project_ffe_items_supersedes_ffe_item_id_fkey,
  ADD CONSTRAINT project_ffe_items_supersedes_ffe_item_id_fkey
    FOREIGN KEY (supersedes_ffe_item_id)
    REFERENCES public.project_ffe_items(id) ON DELETE RESTRICT,
  DROP CONSTRAINT IF EXISTS project_ffe_items_design_disposition_check,
  ADD CONSTRAINT project_ffe_items_design_disposition_check CHECK (
    design_disposition IN ('candidate', 'selected', 'alternate', 'not_selected', 'superseded')
  ),
  DROP CONSTRAINT IF EXISTS project_ffe_items_assignment_scope_check,
  ADD CONSTRAINT project_ffe_items_assignment_scope_check CHECK (
    assignment_scope IN ('room', 'throughout', 'unassigned')
    AND ((assignment_scope = 'room') = (project_room_id IS NOT NULL))
  ),
  DROP CONSTRAINT IF EXISTS project_ffe_items_removal_audit_check,
  ADD CONSTRAINT project_ffe_items_removal_audit_check CHECK (
    (removed_at IS NULL AND removed_by IS NULL AND removal_reason IS NULL)
    OR (removed_at IS NOT NULL AND removed_by IS NOT NULL AND btrim(COALESCE(removal_reason, '')) <> '')
  );

ALTER TABLE public.project_ffe_selection_threads
  DROP CONSTRAINT IF EXISTS project_ffe_selection_threads_primary_ffe_item_id_fkey,
  ADD CONSTRAINT project_ffe_selection_threads_primary_ffe_item_id_fkey
    FOREIGN KEY (primary_ffe_item_id)
    REFERENCES public.project_ffe_items(id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_ffe_selected_per_thread
  ON public.project_ffe_items(selection_thread_id)
  WHERE design_disposition = 'selected' AND removed_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_ffe_replacement_successor
  ON public.project_ffe_items(supersedes_ffe_item_id)
  WHERE supersedes_ffe_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_ffe_items_assignment
  ON public.project_ffe_items(project_id, assignment_scope, created_at);
CREATE INDEX IF NOT EXISTS idx_project_ffe_items_thread
  ON public.project_ffe_items(selection_thread_id, created_at);

-- Project board routing and placement identity.
ALTER TABLE public.proposal_boards
  ADD COLUMN IF NOT EXISTS project_room_id uuid REFERENCES public.project_rooms(id) ON DELETE SET NULL;
ALTER TABLE public.proposal_board_items
  ADD COLUMN IF NOT EXISTS project_ffe_item_id uuid REFERENCES public.project_ffe_items(id) ON DELETE RESTRICT;

ALTER TABLE public.proposal_boards
  DROP CONSTRAINT IF EXISTS proposal_boards_owner_room_axis_check,
  ADD CONSTRAINT proposal_boards_owner_room_axis_check CHECK (
    (proposal_id IS NOT NULL AND project_id IS NULL AND project_room_id IS NULL)
    OR (project_id IS NOT NULL AND proposal_id IS NULL AND scope_room_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_proposal_boards_project_room
  ON public.proposal_boards(project_room_id) WHERE project_room_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposal_board_items_selection
  ON public.proposal_board_items(project_ffe_item_id) WHERE project_ffe_item_id IS NOT NULL;

-- Immutable client review editions and items.
CREATE TABLE IF NOT EXISTS public.project_review_editions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  edition_number integer NOT NULL CHECK (edition_number > 0),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'superseded', 'finalized')),
  client_price_mode text NOT NULL DEFAULT 'hide'
    CHECK (client_price_mode IN ('hide', 'unit', 'line_total')),
  room_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(room_snapshot) = 'array'),
  board_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(board_snapshot) = 'array'),
  snapshot_hash text CHECK (snapshot_hash IS NULL OR snapshot_hash ~ '^[0-9a-f]{64}$'),
  published_at timestamptz,
  published_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  superseded_at timestamptz,
  finalized_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, edition_number),
  CHECK (
    (status = 'draft' AND published_at IS NULL AND snapshot_hash IS NULL)
    OR (status <> 'draft' AND published_at IS NOT NULL AND snapshot_hash IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_review_one_published
  ON public.project_review_editions(project_id)
  WHERE status = 'published';

CREATE TABLE IF NOT EXISTS public.project_review_items (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  edition_id uuid NOT NULL REFERENCES public.project_review_editions(id) ON DELETE RESTRICT,
  source_ffe_item_id uuid NOT NULL REFERENCES public.project_ffe_items(id) ON DELETE RESTRICT,
  selection_thread_id uuid NOT NULL REFERENCES public.project_ffe_selection_threads(id) ON DELETE RESTRICT,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  project_room_id uuid REFERENCES public.project_rooms(id) ON DELETE SET NULL,
  item_snapshot jsonb NOT NULL CHECK (jsonb_typeof(item_snapshot) = 'object'),
  room_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(room_snapshot) = 'object'),
  client_fields jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(client_fields) = 'object'),
  client_unit_price_cents integer CHECK (client_unit_price_cents IS NULL OR client_unit_price_cents >= 0),
  client_line_total_cents integer CHECK (client_line_total_cents IS NULL OR client_line_total_cents >= 0),
  media_manifest jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(media_manifest) = 'array'),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (edition_id, source_ffe_item_id)
);

ALTER TABLE public.item_feedback
  ADD COLUMN IF NOT EXISTS project_review_item_id uuid
    REFERENCES public.project_review_items(id) ON DELETE RESTRICT;
ALTER TABLE public.item_feedback
  DROP CONSTRAINT IF EXISTS item_feedback_one_anchor,
  ADD CONSTRAINT item_feedback_one_anchor CHECK (
    num_nonnulls(proposal_item_id, ffe_item_id, board_item_id, project_review_item_id) = 1
  );
CREATE INDEX IF NOT EXISTS idx_item_feedback_review_item
  ON public.item_feedback(project_review_item_id)
  WHERE project_review_item_id IS NOT NULL;

CREATE POLICY item_feedback_client_insert
ON public.item_feedback FOR INSERT TO authenticated
WITH CHECK (
  proposal_item_id IS NOT NULL
  AND ffe_item_id IS NULL
  AND board_item_id IS NULL
  AND project_review_item_id IS NULL
  AND client_id = auth.uid()
  AND public.can_submit_item_feedback_anchor(proposal_item_id, NULL, NULL)
);

CREATE POLICY item_feedback_client_select
ON public.item_feedback FOR SELECT TO authenticated
USING (
  proposal_item_id IS NOT NULL
  AND ffe_item_id IS NULL
  AND board_item_id IS NULL
  AND project_review_item_id IS NULL
  AND client_id = auth.uid()
  AND public.can_access_item_feedback_anchor(proposal_item_id, NULL, NULL)
);

CREATE TABLE IF NOT EXISTS public.project_review_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  edition_id uuid NOT NULL REFERENCES public.project_review_editions(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed')),
  error_code text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (edition_id, idempotency_key)
);

-- Spreadsheet/PDF staging is inert until transactional commit.
CREATE TABLE IF NOT EXISTS public.project_ffe_import_batches (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_kind text NOT NULL CHECK (source_kind IN ('csv', 'xls', 'xlsx', 'pdf')),
  file_hash text NOT NULL CHECK (file_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'staged'
    CHECK (status IN ('staged', 'committed', 'failed', 'abandoned')),
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count BETWEEN 0 AND 5000),
  committed_at timestamptz,
  staged_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, file_hash)
);

CREATE TABLE IF NOT EXISTS public.project_ffe_import_rows (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.project_ffe_import_batches(id) ON DELETE CASCADE,
  row_ordinal integer NOT NULL CHECK (row_ordinal BETWEEN 1 AND 5000),
  raw_row jsonb NOT NULL CHECK (jsonb_typeof(raw_row) = 'object'),
  normalized_row jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(normalized_row) = 'object'),
  project_room_id uuid REFERENCES public.project_rooms(id) ON DELETE SET NULL,
  assignment_scope text CHECK (assignment_scope IN ('room', 'throughout', 'unassigned')),
  duplicate_mode text CHECK (duplicate_mode IN ('reuse', 'create', 'hold')),
  imported_approval_text text,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(validation_errors) = 'array'),
  committed_ffe_item_id uuid REFERENCES public.project_ffe_items(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, row_ordinal)
);

CREATE TABLE IF NOT EXISTS public.project_ffe_command_idempotency (
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.purchase_order_changes (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  project_ffe_item_id uuid REFERENCES public.project_ffe_items(id) ON DELETE RESTRICT,
  change_kind text NOT NULL
    CHECK (change_kind IN ('vendor_change', 'cancellation', 'credit', 'claim', 'remedy', 'new_scope')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'cancelled')),
  reason text NOT NULL CHECK (char_length(btrim(reason)) >= 5),
  prior_snapshot jsonb NOT NULL CHECK (jsonb_typeof(prior_snapshot) = 'object'),
  replacement_purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.project_ffe_selection_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_review_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_review_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_review_delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_ffe_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_ffe_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_ffe_command_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_changes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.guard_project_ffe_selection_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_thread public.project_ffe_selection_threads%ROWTYPE;
  v_predecessor public.project_ffe_items%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT'
     AND NEW.assignment_scope = 'unassigned'
     AND (NEW.source_proposal_item_id IS NOT NULL
          OR NEW.source_authorization_item_id IS NOT NULL
          OR NEW.source_decision_id IS NOT NULL)
  THEN
    NEW.assignment_scope := CASE WHEN NEW.project_room_id IS NULL THEN 'throughout' ELSE 'room' END;
  END IF;
  IF NEW.selection_thread_id IS NULL THEN
    NEW.selection_thread_id := extensions.gen_random_uuid();
    INSERT INTO public.project_ffe_selection_threads(id, project_id, created_by)
    VALUES (NEW.selection_thread_id, NEW.project_id, auth.uid());
  ELSE
    SELECT * INTO v_thread FROM public.project_ffe_selection_threads
    WHERE id = NEW.selection_thread_id;
    IF NOT FOUND THEN
      INSERT INTO public.project_ffe_selection_threads(id, project_id, created_by)
      VALUES (NEW.selection_thread_id, NEW.project_id, auth.uid());
    ELSIF v_thread.project_id <> NEW.project_id THEN
      RAISE EXCEPTION 'selection thread belongs to another project'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  IF NEW.assignment_scope = 'room' THEN
    IF NEW.project_room_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.project_rooms room
      WHERE room.id = NEW.project_room_id AND room.project_id = NEW.project_id
    ) THEN
      RAISE EXCEPTION 'room assignment does not belong to selection project'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  ELSIF NEW.project_room_id IS NOT NULL THEN
    RAISE EXCEPTION 'non-room assignment cannot carry a room'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.supersedes_ffe_item_id IS NOT NULL THEN
    SELECT * INTO v_predecessor FROM public.project_ffe_items
    WHERE id = NEW.supersedes_ffe_item_id;
    IF NOT FOUND OR v_predecessor.project_id <> NEW.project_id
       OR v_predecessor.selection_thread_id <> NEW.selection_thread_id
       OR v_predecessor.id = NEW.id
    THEN
      RAISE EXCEPTION 'replacement predecessor must be in the same project and thread'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF EXISTS (
      WITH RECURSIVE successors AS (
        SELECT item.id, item.supersedes_ffe_item_id
        FROM public.project_ffe_items item WHERE item.id = NEW.supersedes_ffe_item_id
        UNION ALL
        SELECT item.id, item.supersedes_ffe_item_id
        FROM public.project_ffe_items item
        JOIN successors prior ON item.supersedes_ffe_item_id = prior.id
      )
      SELECT 1 FROM successors WHERE id = NEW.id
    ) THEN
      RAISE EXCEPTION 'replacement chain cannot contain a cycle'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aaa_guard_project_ffe_selection_integrity_trg ON public.project_ffe_items;
CREATE TRIGGER aaa_guard_project_ffe_selection_integrity_trg
BEFORE INSERT OR UPDATE OF project_id, project_room_id, assignment_scope,
  selection_thread_id, supersedes_ffe_item_id
ON public.project_ffe_items
FOR EACH ROW EXECUTE FUNCTION public.guard_project_ffe_selection_integrity();

CREATE OR REPLACE FUNCTION public.set_project_ffe_thread_primary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.project_ffe_selection_threads
  SET primary_ffe_item_id = CASE
        WHEN NEW.design_disposition = 'selected' AND NEW.removed_at IS NULL THEN NEW.id
        ELSE COALESCE(primary_ffe_item_id, NEW.id)
      END,
      updated_at = now()
  WHERE id = NEW.selection_thread_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_set_project_ffe_thread_primary_trg ON public.project_ffe_items;
CREATE TRIGGER zz_set_project_ffe_thread_primary_trg
AFTER INSERT OR UPDATE OF design_disposition, removed_at
ON public.project_ffe_items
FOR EACH ROW EXECUTE FUNCTION public.set_project_ffe_thread_primary();

CREATE OR REPLACE FUNCTION public.guard_project_board_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.proposal_id IS NOT NULL THEN
    IF NEW.project_room_id IS NOT NULL OR (
      NEW.scope_room_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.proposal_scope_rooms room
        WHERE room.id = NEW.scope_room_id AND room.proposal_id = NEW.proposal_id
      )
    ) THEN
      RAISE EXCEPTION 'proposal board room belongs to another proposal'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  ELSE
    IF NEW.scope_room_id IS NOT NULL OR (
      NEW.project_room_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.project_rooms room
        WHERE room.id = NEW.project_room_id AND room.project_id = NEW.project_id
      )
    ) THEN
      RAISE EXCEPTION 'project board room belongs to another project'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_project_board_ownership_trg ON public.proposal_boards;
CREATE TRIGGER guard_project_board_ownership_trg
BEFORE INSERT OR UPDATE OF proposal_id, project_id, scope_room_id, project_room_id
ON public.proposal_boards
FOR EACH ROW EXECUTE FUNCTION public.guard_project_board_ownership();

CREATE OR REPLACE FUNCTION public.guard_board_selection_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_board public.proposal_boards%ROWTYPE;
  v_selection public.project_ffe_items%ROWTYPE;
BEGIN
  IF NEW.project_ffe_item_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_board FROM public.proposal_boards WHERE id = NEW.board_id;
  SELECT * INTO v_selection FROM public.project_ffe_items WHERE id = NEW.project_ffe_item_id;
  IF v_board.id IS NULL OR v_selection.id IS NULL
     OR v_board.project_id IS NULL
     OR v_selection.project_id <> v_board.project_id
     OR (NEW.product_id IS NOT NULL AND v_selection.product_id IS DISTINCT FROM NEW.product_id)
     OR (v_board.project_room_id IS NOT NULL
         AND v_selection.assignment_scope = 'room'
         AND v_selection.project_room_id <> v_board.project_room_id)
  THEN
    RAISE EXCEPTION 'board placement, selection, product, and room must share a project owner'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_board_selection_ownership_trg ON public.proposal_board_items;
CREATE TRIGGER guard_board_selection_ownership_trg
BEFORE INSERT OR UPDATE OF board_id, product_id, project_ffe_item_id
ON public.proposal_board_items
FOR EACH ROW EXECUTE FUNCTION public.guard_board_selection_ownership();

CREATE OR REPLACE FUNCTION public.guard_published_project_review()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_status text;
BEGIN
  IF TG_TABLE_NAME = 'project_review_editions' THEN
    IF TG_OP = 'DELETE' AND OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'published review editions are immutable'
        USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status <> 'draft'
       AND current_setting('app.project_review_publish', true) <> 'on'
    THEN
      RAISE EXCEPTION 'published review editions are immutable'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT status INTO v_status FROM public.project_review_editions
  WHERE id = COALESCE(NEW.edition_id, OLD.edition_id);
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'published review items are immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS guard_published_project_review_editions_trg ON public.project_review_editions;
CREATE TRIGGER guard_published_project_review_editions_trg
BEFORE UPDATE OR DELETE ON public.project_review_editions
FOR EACH ROW EXECUTE FUNCTION public.guard_published_project_review();
DROP TRIGGER IF EXISTS guard_published_project_review_items_trg ON public.project_review_items;
CREATE TRIGGER guard_published_project_review_items_trg
BEFORE UPDATE OR DELETE ON public.project_review_items
FOR EACH ROW EXECUTE FUNCTION public.guard_published_project_review();

CREATE OR REPLACE FUNCTION public.guard_purchase_order_change_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'purchase order change records are immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
     OR NEW.project_ffe_item_id IS DISTINCT FROM OLD.project_ffe_item_id
     OR NEW.change_kind IS DISTINCT FROM OLD.change_kind
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.prior_snapshot IS DISTINCT FROM OLD.prior_snapshot
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'purchase order change evidence is immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_purchase_order_change_immutable_trg ON public.purchase_order_changes;
CREATE TRIGGER guard_purchase_order_change_immutable_trg
BEFORE UPDATE OR DELETE ON public.purchase_order_changes
FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_order_change_immutable();

-- Studio RLS for new working tables; clients use only curated definer RPCs.
DROP POLICY IF EXISTS project_ffe_selection_threads_studio_rw ON public.project_ffe_selection_threads;
CREATE POLICY project_ffe_selection_threads_studio_rw ON public.project_ffe_selection_threads
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.is_studio_comember(p.designer_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.is_studio_comember(p.designer_id)));

DROP POLICY IF EXISTS project_review_editions_studio_rw ON public.project_review_editions;
CREATE POLICY project_review_editions_studio_rw ON public.project_review_editions
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.is_studio_comember(p.designer_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.is_studio_comember(p.designer_id)));

DROP POLICY IF EXISTS project_review_items_studio_rw ON public.project_review_items;
CREATE POLICY project_review_items_studio_rw ON public.project_review_items
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.project_review_editions edition
  JOIN public.projects p ON p.id = edition.project_id
  WHERE edition.id = project_review_items.edition_id
    AND public.is_studio_comember(p.designer_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.project_review_editions edition
  JOIN public.projects p ON p.id = edition.project_id
  WHERE edition.id = project_review_items.edition_id
    AND public.is_studio_comember(p.designer_id)
));

DROP POLICY IF EXISTS project_review_delivery_attempts_studio_read ON public.project_review_delivery_attempts;
CREATE POLICY project_review_delivery_attempts_studio_read ON public.project_review_delivery_attempts
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.project_review_editions edition
  JOIN public.projects p ON p.id = edition.project_id
  WHERE edition.id = project_review_delivery_attempts.edition_id
    AND public.is_studio_comember(p.designer_id)
));

DROP POLICY IF EXISTS project_ffe_import_batches_studio_read ON public.project_ffe_import_batches;
CREATE POLICY project_ffe_import_batches_studio_read ON public.project_ffe_import_batches
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.is_studio_comember(p.designer_id)));

DROP POLICY IF EXISTS project_ffe_import_rows_studio_read ON public.project_ffe_import_rows;
CREATE POLICY project_ffe_import_rows_studio_read ON public.project_ffe_import_rows
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.project_ffe_import_batches batch
  JOIN public.projects p ON p.id = batch.project_id
  WHERE batch.id = project_ffe_import_rows.batch_id
    AND public.is_studio_comember(p.designer_id)
));

DROP POLICY IF EXISTS project_ffe_command_idempotency_actor_read ON public.project_ffe_command_idempotency;
CREATE POLICY project_ffe_command_idempotency_actor_read ON public.project_ffe_command_idempotency
FOR SELECT TO authenticated USING (actor_id = auth.uid());

DROP POLICY IF EXISTS purchase_order_changes_studio_read ON public.purchase_order_changes;
CREATE POLICY purchase_order_changes_studio_read ON public.purchase_order_changes
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.is_studio_comember(p.designer_id)));

GRANT SELECT ON public.project_ffe_selection_threads, public.project_review_editions,
  public.project_review_items, public.project_review_delivery_attempts,
  public.project_ffe_import_batches, public.project_ffe_import_rows,
  public.purchase_order_changes TO authenticated;
GRANT SELECT ON public.project_ffe_command_idempotency TO authenticated;
GRANT ALL ON public.project_ffe_selection_threads, public.project_review_editions,
  public.project_review_items, public.project_review_delivery_attempts,
  public.project_ffe_import_batches, public.project_ffe_import_rows,
  public.project_ffe_command_idempotency, public.purchase_order_changes TO service_role;

REVOKE ALL ON FUNCTION public.guard_project_ffe_selection_integrity(),
  public.set_project_ffe_thread_primary(), public.guard_project_board_ownership(),
  public.guard_board_selection_ownership(), public.guard_published_project_review(),
  public.guard_purchase_order_change_immutable()
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_board_share(uuid, text, timestamptz),
  public.resolve_board_share(text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_board_share(uuid, text, timestamptz)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_board_share(text)
  TO anon, authenticated, service_role;

COMMENT ON COLUMN public.project_ffe_items.status IS
  'Procurement/logistics progression only. Design disposition, client verdict, and purchase authority are independent axes.';
COMMENT ON COLUMN public.project_ffe_specs.readiness_status IS
  'Compatibility cache only. Authoritative readiness is derived from the active spec-book template and commercial requirements.';
