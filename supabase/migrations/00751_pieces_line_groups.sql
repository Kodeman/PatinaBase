-- ═══════════════════════════════════════════════════════════════════════════
-- 00751 — Line groups: a heading inside a room, the shower's components
--         (US-21 slice 4, W5; D6, ruling Q9; T-45, SQ-651)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRACT §2 "00751" (artifacts/pieces-building-room-2026-10-08/build/
-- CONTRACT.md); direction.md D6 and Q9 ("a heading with no money, no stage
-- and no acts of its own"); scenario S3, the shower.
--
-- Adds GRANT/REVOKE → regenerate supabase/seed/00-legacy-grants.sql (the W5
-- reset owner, T-49, does it; CONTRACT §4).
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- project_line_groups
--   One row per group heading: project, room (NULL for the unassigned pile),
--   name, sort_order. A group carries NO money, NO stage and NO acts: it has
--   no price, quantity, status or disposition column, and nothing sums,
--   releases or orders through it. It is an outline heading only.
--
-- project_ffe_items.line_group_id
--   uuid REFERENCES project_line_groups ON DELETE SET NULL. NULL = ungrouped
--   (every existing line). Deleting a group, or its room, ungroups its lines
--   and never deletes them.
--
-- set_line_group(p_ffe_item_ids uuid[], p_group jsonb) RETURNS jsonb
--   p_group is one of:
--     {groupId}        move the lines into that existing group;
--     {name, roomId}   create a group (roomId null = the unassigned pile) at
--                      the end of that room's groups, and move the lines in;
--     null             ungroup the lines.
--   Rules:
--   - every line belongs to one project, which the caller may buy for
--     (_ffe_require_studio_project, 00717:75);
--   - a group sits inside one room (Q9): each line's primary room
--     (project_room_id) must be the group's room;
--   - a removed line is not grouped ("This line was removed."); it may be
--     ungrouped;
--   - a group left with no lines by the move is deleted;
--   - it writes line_group_id only: never quantity, unit, money, status or
--     disposition.
--   Returns {groupId (null when ungrouped), ffeItemIds, deletedGroupIds}.
--
-- _spec_book_current_item_snapshots
--   CREATE OR REPLACE base: 00737_pieces_w2_review_fixes.sql:1047 (the newest
--   body; it superseded the 00735:47 base the contract names). Adds the key
--   lineGroup = {id, name}, NULL when ungrouped, so jsonb_strip_nulls drops it
--   and every ungrouped line keeps its content_hash (no issued book reports a
--   revision on deploy). Grants re-issued as in the base.
--
-- ── ACCESS ──────────────────────────────────────────────────────────────────
-- project_line_groups: SELECT TO authenticated USING can_buy_for_project
-- (00702:60). No client policy: a client JWT reads 0 rows. INSERT, UPDATE and
-- DELETE are revoked from authenticated and anon; the only writer is
-- set_line_group (SECURITY DEFINER).
--
-- Idempotent: CREATE TABLE / INDEX IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
-- DROP POLICY IF EXISTS, CREATE OR REPLACE FUNCTION.
-- Test: supabase/tests/ffe/pieces_line_groups_test.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. project_line_groups ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_line_groups (
  id              uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id      uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  project_room_id uuid        REFERENCES public.project_rooms(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  sort_order      integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_line_groups_name_check CHECK (btrim(name) <> '')
);

CREATE INDEX IF NOT EXISTS idx_project_line_groups_project
  ON public.project_line_groups (project_id, project_room_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_project_line_groups_room
  ON public.project_line_groups (project_room_id);

COMMENT ON TABLE public.project_line_groups IS
  'A group heading inside a room (00751, D6, Q9): the shower''s components. No money, no stage and '
  'no acts of its own. Read: can_buy_for_project. Written only through set_line_group.';

ALTER TABLE public.project_line_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_line_groups_studio_select ON public.project_line_groups;
CREATE POLICY project_line_groups_studio_select ON public.project_line_groups
  FOR SELECT TO authenticated
  USING (public.can_buy_for_project(project_id));

REVOKE ALL ON TABLE public.project_line_groups FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.project_line_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_line_groups TO service_role;

-- ─── 2. project_ffe_items.line_group_id ─────────────────────────────────────

ALTER TABLE public.project_ffe_items
  ADD COLUMN IF NOT EXISTS line_group_id uuid
    REFERENCES public.project_line_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_ffe_items_line_group
  ON public.project_ffe_items (line_group_id)
  WHERE line_group_id IS NOT NULL;

COMMENT ON COLUMN public.project_ffe_items.line_group_id IS
  'The group heading this line sits under (00751, D6). NULL = ungrouped. Written only by set_line_group.';

-- ─── 3. set_line_group ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_line_group(p_ffe_item_ids uuid[], p_group jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_ids        uuid[];
  v_project_id uuid;
  v_count      integer;
  v_projects   integer;
  v_group     public.project_line_groups%ROWTYPE;
  v_group_id   uuid;
  v_room_id    uuid;
  v_name       text;
  v_old_groups uuid[];
  v_deleted    uuid[];
  v_uuid_re    constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  SELECT array_agg(DISTINCT x) INTO v_ids
  FROM unnest(p_ffe_item_ids) AS x
  WHERE x IS NOT NULL;
  IF v_ids IS NULL THEN
    RAISE EXCEPTION 'Name at least one line.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_group IS NOT NULL AND jsonb_typeof(p_group) = 'null' THEN
    p_group := NULL;
  END IF;
  IF p_group IS NOT NULL AND jsonb_typeof(p_group) <> 'object' THEN
    RAISE EXCEPTION 'A group is {groupId}, {name, roomId} or null.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Lock the lines; they must exist and share one project.
  PERFORM 1 FROM public.project_ffe_items i
  WHERE i.id = ANY (v_ids)
  ORDER BY i.id
  FOR UPDATE;

  SELECT count(*), count(DISTINCT i.project_id), min(i.project_id::text)::uuid
  INTO v_count, v_projects, v_project_id
  FROM public.project_ffe_items i
  WHERE i.id = ANY (v_ids);

  IF v_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'line not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_projects > 1 THEN
    RAISE EXCEPTION 'The lines are in different projects.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public._ffe_require_studio_project(v_project_id);

  SELECT array_agg(DISTINCT i.line_group_id) INTO v_old_groups
  FROM public.project_ffe_items i
  WHERE i.id = ANY (v_ids) AND i.line_group_id IS NOT NULL;

  IF p_group IS NOT NULL THEN
    IF p_group ? 'groupId' THEN
      IF jsonb_typeof(p_group -> 'groupId') IS DISTINCT FROM 'string'
         OR (p_group ->> 'groupId') !~* v_uuid_re THEN
        RAISE EXCEPTION 'A group is {groupId}, {name, roomId} or null.'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      SELECT * INTO v_group
      FROM public.project_line_groups g
      WHERE g.id = (p_group ->> 'groupId')::uuid
      FOR UPDATE;
      IF NOT FOUND OR v_group.project_id <> v_project_id THEN
        RAISE EXCEPTION 'That group is not in this project.'
          USING ERRCODE = 'check_violation';
      END IF;
      v_room_id := v_group.project_room_id;
    ELSE
      v_name := NULLIF(btrim(p_group ->> 'name'), '');
      IF jsonb_typeof(p_group -> 'name') IS DISTINCT FROM 'string' OR v_name IS NULL THEN
        RAISE EXCEPTION 'A group needs a name.'
          USING ERRCODE = 'check_violation';
      END IF;
      IF jsonb_typeof(p_group -> 'roomId') = 'string' THEN
        IF (p_group ->> 'roomId') !~* v_uuid_re THEN
          RAISE EXCEPTION 'A group is {groupId}, {name, roomId} or null.'
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
        v_room_id := (p_group ->> 'roomId')::uuid;
        IF NOT EXISTS (
          SELECT 1 FROM public.project_rooms room
          WHERE room.id = v_room_id AND room.project_id = v_project_id
        ) THEN
          RAISE EXCEPTION 'That room is not in this project.'
            USING ERRCODE = 'check_violation';
        END IF;
      ELSIF p_group ? 'roomId' AND jsonb_typeof(p_group -> 'roomId') <> 'null' THEN
        RAISE EXCEPTION 'A group is {groupId}, {name, roomId} or null.'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
    END IF;

    -- Q9: a group sits inside one room. A removed line is not grouped.
    IF EXISTS (
      SELECT 1 FROM public.project_ffe_items i
      WHERE i.id = ANY (v_ids) AND i.removed_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'This line was removed.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.project_ffe_items i
      WHERE i.id = ANY (v_ids) AND i.project_room_id IS DISTINCT FROM v_room_id
    ) THEN
      RAISE EXCEPTION 'A group sits inside one room; a line is in another.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_group.id IS NULL THEN
      INSERT INTO public.project_line_groups (project_id, project_room_id, name, sort_order)
      VALUES (
        v_project_id, v_room_id, v_name,
        COALESCE((
          SELECT max(g.sort_order) + 1 FROM public.project_line_groups g
          WHERE g.project_id = v_project_id
            AND g.project_room_id IS NOT DISTINCT FROM v_room_id
        ), 0)
      )
      RETURNING * INTO v_group;
    END IF;
    v_group_id := v_group.id;
  END IF;

  -- Only line_group_id moves.
  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.project_ffe_items i
  SET line_group_id = v_group_id
  WHERE i.id = ANY (v_ids)
    AND i.line_group_id IS DISTINCT FROM v_group_id;

  -- A group the move left empty is deleted.
  WITH gone AS (
    DELETE FROM public.project_line_groups g
    WHERE g.id = ANY (COALESCE(v_old_groups, ARRAY[]::uuid[]))
      AND g.id IS DISTINCT FROM v_group_id
      AND NOT EXISTS (
        SELECT 1 FROM public.project_ffe_items i WHERE i.line_group_id = g.id
      )
    RETURNING g.id
  )
  SELECT array_agg(gone.id ORDER BY gone.id) INTO v_deleted FROM gone;

  RETURN jsonb_build_object(
    'groupId', v_group_id,
    'ffeItemIds', to_jsonb(v_ids),
    'deletedGroupIds', COALESCE(to_jsonb(v_deleted), '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.set_line_group(uuid[], jsonb) IS
  'Groups lines under a heading inside a room (00751, D6, Q9). p_group: {groupId} | {name, roomId} '
  '(creates the group) | null (ungroup). Lines share one project and the group''s room; a removed line '
  'is not grouped. A group the move leaves empty is deleted. Writes line_group_id only: never money, '
  'quantity, stage or disposition. Returns {groupId, ffeItemIds, deletedGroupIds}.';

REVOKE ALL ON FUNCTION public.set_line_group(uuid[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_line_group(uuid[], jsonb) TO authenticated;

-- ─── 4. _spec_book_current_item_snapshots (base 00737:1047) ─────────────────

CREATE OR REPLACE FUNCTION public._spec_book_current_item_snapshots(p_spec_book_id uuid)
RETURNS TABLE (
  ffe_item_id uuid,
  item_type text,
  document_code text,
  chapter_position integer,
  item_position integer,
  item_snapshot jsonb,
  content_hash text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  WITH source AS (
    SELECT
      i.id AS ffe_item_id,
      i.item_type,
      i.doc_code,
      COALESCE(c.position, 2147483647) AS chapter_position,
      s.position AS item_position,
      jsonb_strip_nulls(jsonb_build_object(
        'ffeItemId', i.id,
        'itemType', i.item_type,
        'documentCode', i.doc_code,
        'name', i.name,
        'needLabel', CASE WHEN t.primary_ffe_item_id = i.id THEN NULLIF(t.need_label, i.name) END,
        'projectId', i.project_id,
        'room', CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', r.id, 'name', r.name
        ) END,
        'lineGroup', CASE WHEN lg.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', lg.id, 'name', lg.name
        ) END,
        'placements', pl.placements,
        'quantity', i.quantity,
        'unit', NULLIF(i.unit, 'each'),
        'lineKind', NULLIF(i.line_kind, 'goods'),
        'parentFfeItemId', CASE WHEN i.line_kind = 'labor' THEN i.parent_ffe_item_id END,
        'category', i.ffe_category,
        'selectedMedia', CASE
          WHEN jsonb_array_length(sp.selected_media) > 0 THEN sp.selected_media
          ELSE COALESCE(to_jsonb(p.images), '[]'::jsonb)
        END,
        'selection', jsonb_build_object(
          'sku', public._spec_book_resolve_field(
            to_jsonb(sp.sku), i.custom_fields->'sku', to_jsonb(p.sku),
            p.capture_provenance#>'{studioCustom,sku}', sp.na_declarations->'sku',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'sku', '')::timestamptz,
            sp.field_provenance->>'sku'
          ),
          'finish', public._spec_book_resolve_field(
            to_jsonb(sp.finish), i.custom_fields->'finish', to_jsonb(p.finish),
            p.capture_provenance#>'{studioCustom,finish}', sp.na_declarations->'finish',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'finish', '')::timestamptz,
            sp.field_provenance->>'finish'
          ),
          'material', public._spec_book_resolve_field(
            to_jsonb(sp.material), i.custom_fields->'material', to_jsonb(p.materials),
            p.capture_provenance#>'{studioCustom,material}', sp.na_declarations->'material',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'material', '')::timestamptz,
            sp.field_provenance->>'material'
          ),
          'colorFabric', public._spec_book_resolve_field(
            to_jsonb(sp.color_fabric), i.custom_fields->'colorFabric', to_jsonb(p.colors),
            p.capture_provenance#>'{studioCustom,colorFabric}', sp.na_declarations->'colorFabric',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'colorFabric', '')::timestamptz,
            sp.field_provenance->>'colorFabric'
          ),
          'dimensions', public._spec_book_resolve_field(
            sp.selected_dimensions, i.custom_fields->'dimensions', p.dimensions,
            p.capture_provenance#>'{studioCustom,dimensions}', sp.na_declarations->'dimensions',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'dimensions', '')::timestamptz,
            sp.field_provenance->>'dimensions'
          ),
          'exactLocation', public._spec_book_resolve_field(
            to_jsonb(sp.exact_location), i.custom_fields->'exactLocation', NULL,
            p.capture_provenance#>'{studioCustom,exactLocation}', sp.na_declarations->'exactLocation',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'exactLocation', '')::timestamptz,
            sp.field_provenance->>'exactLocation'
          )
        ),
        'notes', jsonb_build_object(
          'client', sp.client_notes,
          'trade', sp.trade_notes,
          'install', sp.install_notes,
          'private', i.notes,
          'care', sp.care_notes,
          'warranty', sp.warranty_notes
        ),
        'pricing', jsonb_build_object(
          'clientPriceCents', i.unit_price_cents,
          'tradePriceCents', i.trade_price_cents,
          'markupPercent', i.markup_percent,
          'currency', i.currency
        ),
        'vendor', jsonb_build_object(
          'id', i.vendor_id,
          'name', i.vendor_name,
          'internalContact', p.vendor_contact
        ),
        'configuration', CASE WHEN sp.configuration_id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', sp.configuration_id,
          'snapshot', sp.configuration_snapshot,
          'snapshotHash', sp.configuration_snapshot_hash,
          'lockedAt', sp.configuration_locked_at
        ) END,
        'provenance', sp.field_provenance,
        'sourceVerification', sp.source_verifications,
        'naDeclarations', sp.na_declarations,
        'readinessStatus', sp.readiness_status,
        'rowVersion', sp.row_version
      )) AS snapshot
    FROM public.spec_book_item_settings s
    JOIN public.spec_books b ON b.id = s.spec_book_id
    JOIN public.project_ffe_items i ON i.id = s.ffe_item_id
    JOIN public.project_ffe_specs sp ON sp.ffe_item_id = i.id
    LEFT JOIN public.spec_book_chapters c ON c.id = s.chapter_id
    LEFT JOIN public.project_rooms r ON r.id = i.project_room_id
    LEFT JOIN public.products p ON p.id = i.product_id
    LEFT JOIN public.project_ffe_selection_threads t ON t.id = i.selection_thread_id
    LEFT JOIN public.project_line_groups lg ON lg.id = i.line_group_id
    LEFT JOIN LATERAL (
      SELECT CASE WHEN count(*) > 1 THEN jsonb_agg(jsonb_build_object(
          'roomName', pr.name,
          'quantity', fp.quantity,
          'areaNote', fp.area_note
        ) ORDER BY fp.sort_order, fp.created_at, fp.id)
      END AS placements
      FROM public.project_ffe_placements fp
      JOIN public.project_rooms pr ON pr.id = fp.project_room_id
      WHERE fp.ffe_item_id = i.id
    ) pl ON true
    WHERE s.spec_book_id = p_spec_book_id
      AND s.included
      AND (c.id IS NULL OR c.included)
      AND i.removed_at IS NULL
  )
  SELECT
    source.ffe_item_id,
    source.item_type,
    source.doc_code,
    source.chapter_position,
    source.item_position,
    source.snapshot,
    encode(
      extensions.digest(public._spec_book_canonical_json(source.snapshot), 'sha256'),
      'hex'
    )
  FROM source
  ORDER BY source.chapter_position, source.item_position, source.ffe_item_id;
$$;

REVOKE ALL ON FUNCTION public._spec_book_current_item_snapshots(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._spec_book_current_item_snapshots(uuid) TO service_role;
