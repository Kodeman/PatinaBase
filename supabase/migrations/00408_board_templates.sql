-- ════════════════════════════════════════════════════════════════════════════
-- 00408 — Board templates: studio stamps + immutable Patina starters
--
-- A template stores a detached composition, never live board/product/capture/
-- palette ownership. save_board_as_template() performs the snapshot and
-- recursively strips owner-reference keys server-side. materialize_board_template()
-- stamps real proposal_board_items under one authorized proposal/project.
--
-- Patina starters use stable `patina.*` template keys and are immutable even
-- to service-role callers unless an explicit transaction-local maintenance GUC
-- (`app.allow_patina_template_mutation=on`) is set by a future migration.
-- Studio rows are readable to every active non-guest member of that exact
-- active design_studio; composition/owner fields are immutable after creation.
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.board_templates (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  template_key text NOT NULL UNIQUE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text,
  kind text NOT NULL CHECK (kind IN ('seeded', 'studio')),
  studio_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  canvas_width integer NOT NULL CHECK (canvas_width BETWEEN 320 AND 20000),
  canvas_height integer NOT NULL CHECK (canvas_height BETWEEN 240 AND 20000),
  background_color text NOT NULL DEFAULT '#FAF8F5'
    CHECK (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  sections jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(sections) = 'array'),
  items jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(items) = 'array'),
  cover_url text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT board_templates_owner_shape CHECK (
    (
      kind = 'seeded'
      AND studio_id IS NULL
      AND created_by IS NULL
      AND template_key LIKE 'patina.%'
    )
    OR (
      kind = 'studio'
      AND studio_id IS NOT NULL
      AND template_key LIKE 'studio.%'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_board_templates_studio_updated
  ON public.board_templates(studio_id, updated_at DESC)
  WHERE studio_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_board_templates_seeded_key
  ON public.board_templates(template_key)
  WHERE kind = 'seeded';

DROP TRIGGER IF EXISTS set_updated_at_board_templates
  ON public.board_templates;
CREATE TRIGGER set_updated_at_board_templates
BEFORE UPDATE ON public.board_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.board_templates IS
  'Detached mood-board composition stamps. kind=seeded rows are migration-owned '
  'Patina starters; kind=studio rows belong to one active design studio.';

-- ── 1. Row immutability ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_board_template_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.kind = 'seeded'
     AND COALESCE(
       current_setting('app.allow_patina_template_mutation', true),
       'off'
     ) <> 'on'
  THEN
    RAISE EXCEPTION 'Patina board templates are immutable'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.kind = 'studio' THEN
    IF NEW.template_key IS DISTINCT FROM OLD.template_key
       OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.studio_id IS DISTINCT FROM OLD.studio_id
       OR NEW.canvas_width IS DISTINCT FROM OLD.canvas_width
       OR NEW.canvas_height IS DISTINCT FROM OLD.canvas_height
       OR NEW.background_color IS DISTINCT FROM OLD.background_color
       OR NEW.sections IS DISTINCT FROM OLD.sections
       OR NEW.items IS DISTINCT FROM OLD.items
       OR (
         NEW.created_by IS DISTINCT FROM OLD.created_by
         AND NOT (OLD.created_by IS NOT NULL AND NEW.created_by IS NULL)
       )
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'studio template composition and ownership are immutable'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_board_template_immutability()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS a_guard_board_template_immutability_trg
  ON public.board_templates;
CREATE TRIGGER a_guard_board_template_immutability_trg
BEFORE UPDATE OR DELETE ON public.board_templates
FOR EACH ROW EXECUTE FUNCTION public.guard_board_template_immutability();

-- ── 2. RLS: starters + exact active design-studio membership ──────────────

ALTER TABLE public.board_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_templates_select ON public.board_templates;
CREATE POLICY board_templates_select
ON public.board_templates FOR SELECT TO authenticated
USING (
  kind = 'seeded'
  OR (
    kind = 'studio'
    AND EXISTS (
      SELECT 1
      FROM public.organizations AS studio
      WHERE studio.id = board_templates.studio_id
        AND studio.type = 'design_studio'
        AND studio.status = 'active'
        AND public.is_active_org_member(studio.id)
    )
  )
);

DROP POLICY IF EXISTS board_templates_studio_update
  ON public.board_templates;
CREATE POLICY board_templates_studio_update
ON public.board_templates FOR UPDATE TO authenticated
USING (
  kind = 'studio'
  AND EXISTS (
    SELECT 1
    FROM public.organizations AS studio
    WHERE studio.id = board_templates.studio_id
      AND studio.type = 'design_studio'
      AND studio.status = 'active'
      AND public.is_active_org_member(studio.id)
  )
)
WITH CHECK (
  kind = 'studio'
  AND EXISTS (
    SELECT 1
    FROM public.organizations AS studio
    WHERE studio.id = board_templates.studio_id
      AND studio.type = 'design_studio'
      AND studio.status = 'active'
      AND public.is_active_org_member(studio.id)
  )
);

DROP POLICY IF EXISTS board_templates_studio_delete
  ON public.board_templates;
CREATE POLICY board_templates_studio_delete
ON public.board_templates FOR DELETE TO authenticated
USING (
  kind = 'studio'
  AND EXISTS (
    SELECT 1
    FROM public.organizations AS studio
    WHERE studio.id = board_templates.studio_id
      AND studio.type = 'design_studio'
      AND studio.status = 'active'
      AND public.is_active_org_member(studio.id)
  )
);

-- INSERT is intentionally RPC-only so an authenticated caller cannot forge an
-- unsanitized composition. Studio members may rename/describe/delete their own
-- row; the guard keeps composition/ownership frozen.
REVOKE ALL ON TABLE public.board_templates FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE (name, description, cover_url), DELETE
  ON TABLE public.board_templates TO authenticated;
GRANT ALL ON TABLE public.board_templates TO service_role;

-- ── 3. Recursive owner-reference scrubber ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sanitize_board_template_json(p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_value IS NULL THEN
    RETURN NULL;
  END IF;

  CASE jsonb_typeof(p_value)
    WHEN 'object' THEN
      SELECT COALESCE(
        jsonb_object_agg(entry.key, public.sanitize_board_template_json(entry.value)),
        '{}'::jsonb
      )
      INTO v_result
      FROM jsonb_each(p_value) AS entry
      WHERE entry.key <> ALL (ARRAY[
        'product_id',
        'capture_id',
        'palette_id',
        'proposal_id',
        'project_id',
        'board_id',
        'source_board_id',
        'source_project_board_id',
        'scope_room_id',
        'project_room_id',
        'created_by',
        'owner_user_id',
        'user_id',
        'designer_id',
        'client_id',
        'studio_id',
        'organization_id'
      ]::text[]);
      RETURN v_result;

    WHEN 'array' THEN
      SELECT COALESCE(
        jsonb_agg(
          public.sanitize_board_template_json(entry.value)
          ORDER BY entry.ordinality
        ),
        '[]'::jsonb
      )
      INTO v_result
      FROM jsonb_array_elements(p_value)
        WITH ORDINALITY AS entry(value, ordinality);
      RETURN v_result;

    ELSE
      RETURN p_value;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.sanitize_board_template_json(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- ── 4. Save a live board as a detached studio template ───────────────────────

CREATE OR REPLACE FUNCTION public.save_board_as_template(
  p_board_id uuid,
  p_studio_id uuid,
  p_name text,
  p_description text DEFAULT NULL
)
RETURNS public.board_templates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_board public.proposal_boards%ROWTYPE;
  v_owner_id uuid;
  v_items jsonb;
  v_template public.board_templates%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF length(btrim(COALESCE(p_name, ''))) = 0 THEN
    RAISE EXCEPTION 'template name is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT board.*
  INTO v_board
  FROM public.proposal_boards AS board
  WHERE board.id = p_board_id
    AND board.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'board not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(proposal.designer_id, project.designer_id)
  INTO v_owner_id
  FROM (VALUES (1)) AS singleton(dummy)
  LEFT JOIN public.proposals AS proposal ON proposal.id = v_board.proposal_id
  LEFT JOIN public.projects AS project ON project.id = v_board.project_id;

  IF v_owner_id IS NULL
     OR NOT public.is_design_studio_comember(v_owner_id)
  THEN
    RAISE EXCEPTION 'board not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Both the caller and the board's owning designer must be active non-guest
  -- members of the exact active design_studio receiving the template.
  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations AS studio
    JOIN public.organization_members AS actor_membership
      ON actor_membership.organization_id = studio.id
     AND actor_membership.user_id = auth.uid()
     AND actor_membership.status = 'active'
     AND actor_membership.role <> 'guest'
    JOIN public.organization_members AS owner_membership
      ON owner_membership.organization_id = studio.id
     AND owner_membership.user_id = v_owner_id
     AND owner_membership.status = 'active'
     AND owner_membership.role <> 'guest'
    WHERE studio.id = p_studio_id
      AND studio.type = 'design_studio'
      AND studio.status = 'active'
  ) THEN
    RAISE EXCEPTION 'template studio is not an authorized design workspace'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'type', item.type,
    'x', item.x,
    'y', item.y,
    'width', item.width,
    'height', item.height,
    'z_index', item.z_index,
    'rotation', item.rotation,
    'locked', item.locked,
    'image_url', item.image_url,
    'content', item.content,
    'data', public.sanitize_board_template_json(item.data)
  )) ORDER BY item.z_index, item.created_at, item.id), '[]'::jsonb)
  INTO v_items
  FROM public.proposal_board_items AS item
  WHERE item.board_id = p_board_id;

  INSERT INTO public.board_templates (
    template_key,
    name,
    description,
    kind,
    studio_id,
    canvas_width,
    canvas_height,
    background_color,
    sections,
    items,
    cover_url,
    created_by
  )
  VALUES (
    'studio.' || extensions.gen_random_uuid()::text,
    btrim(p_name),
    NULLIF(btrim(p_description), ''),
    'studio',
    p_studio_id,
    v_board.canvas_width,
    v_board.canvas_height,
    v_board.background_color,
    public.sanitize_board_template_json(v_board.sections),
    v_items,
    v_board.cover_image_url,
    auth.uid()
  )
  RETURNING * INTO v_template;

  RETURN v_template;
END;
$$;

COMMENT ON FUNCTION public.save_board_as_template(uuid, uuid, text, text) IS
  'Snapshots an authorized live board into one exact design studio. Product, '
  'capture, palette, proposal, project, board, creator, and owner references '
  'are stripped recursively; composition data remains detached.';

-- ── 5. Materialize a template as an independent live board ────────────────────

CREATE OR REPLACE FUNCTION public.materialize_board_template(
  p_template_id uuid,
  p_proposal_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_scope_room_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_template public.board_templates%ROWTYPE;
  v_board_id uuid;
  v_sort_order integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF num_nonnulls(p_proposal_id, p_project_id) <> 1 THEN
    RAISE EXCEPTION 'exactly one board owner is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT template.* INTO v_template
  FROM public.board_templates AS template
  WHERE template.id = p_template_id
    AND (
      template.kind = 'seeded'
      OR (
        template.kind = 'studio'
        AND EXISTS (
          SELECT 1
          FROM public.organizations AS studio
          JOIN public.organization_members AS membership
            ON membership.organization_id = studio.id
           AND membership.user_id = auth.uid()
           AND membership.status = 'active'
           AND membership.role <> 'guest'
          WHERE studio.id = template.studio_id
            AND studio.type = 'design_studio'
            AND studio.status = 'active'
        )
      )
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'template not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_proposal_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.proposals AS proposal
      WHERE proposal.id = p_proposal_id
        AND proposal.status = 'draft'
        AND public.is_design_studio_comember(proposal.designer_id)
    ) THEN
      RAISE EXCEPTION 'draft proposal not found or not accessible'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_scope_room_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.proposal_scope_rooms AS room
      WHERE room.id = p_scope_room_id
        AND room.proposal_id = p_proposal_id
    ) THEN
      RAISE EXCEPTION 'scope room does not belong to the target proposal'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF p_scope_room_id IS NOT NULL THEN
      RAISE EXCEPTION 'project-owned boards cannot target a proposal scope room'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.projects AS project
      WHERE project.id = p_project_id
        AND public.is_design_studio_comember(project.designer_id)
    ) THEN
      RAISE EXCEPTION 'project not found or not accessible'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  SELECT COALESCE(max(board.sort_order), -1) + 1
  INTO v_sort_order
  FROM public.proposal_boards AS board
  WHERE board.proposal_id IS NOT DISTINCT FROM p_proposal_id
    AND board.project_id IS NOT DISTINCT FROM p_project_id;

  INSERT INTO public.proposal_boards (
    proposal_id,
    project_id,
    name,
    scope_room_id,
    cover_image_url,
    canvas_width,
    canvas_height,
    background_color,
    sort_order,
    sections,
    status
  )
  VALUES (
    p_proposal_id,
    p_project_id,
    COALESCE(NULLIF(btrim(p_name), ''), v_template.name),
    p_scope_room_id,
    v_template.cover_url,
    v_template.canvas_width,
    v_template.canvas_height,
    v_template.background_color,
    v_sort_order,
    public.sanitize_board_template_json(v_template.sections),
    'active'
  )
  RETURNING id INTO v_board_id;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_template.items) AS item
    WHERE item->>'type' IS NULL
       OR item->>'type' NOT IN (
         'product', 'capture', 'image', 'palette', 'note', 'room_scan'
       )
  ) THEN
    RAISE EXCEPTION 'template contains an invalid board item type'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.proposal_board_items (
    board_id,
    type,
    x,
    y,
    width,
    height,
    z_index,
    rotation,
    locked,
    product_id,
    capture_id,
    palette_id,
    image_url,
    content,
    data
  )
  SELECT
    v_board_id,
    item->>'type',
    COALESCE((item->>'x')::numeric, 0),
    COALESCE((item->>'y')::numeric, 0),
    COALESCE((item->>'width')::numeric, 240),
    CASE
      WHEN item->>'height' IS NULL THEN NULL
      ELSE (item->>'height')::numeric
    END,
    COALESCE((item->>'z_index')::integer, 0),
    COALESCE((item->>'rotation')::numeric, 0),
    COALESCE((item->>'locked')::boolean, false),
    NULL,
    NULL,
    NULL,
    item->>'image_url',
    item->>'content',
    COALESCE(
      public.sanitize_board_template_json(item->'data'),
      '{}'::jsonb
    )
  FROM jsonb_array_elements(v_template.items) AS item;

  RETURN v_board_id;
END;
$$;

COMMENT ON FUNCTION public.materialize_board_template(
  uuid, uuid, uuid, text, uuid
) IS
  'Stamps a readable Patina/studio template into one authorized draft proposal '
  'or project. Creates independent board/items rows with no template or source '
  'FK and no product/capture/palette ownership references.';

REVOKE ALL ON FUNCTION public.save_board_as_template(uuid, uuid, text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.materialize_board_template(
  uuid, uuid, uuid, text, uuid
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.save_board_as_template(
  uuid, uuid, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_board_template(
  uuid, uuid, uuid, text, uuid
) TO authenticated;
