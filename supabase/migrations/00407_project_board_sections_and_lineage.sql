-- ════════════════════════════════════════════════════════════════════════════
-- 00407 — Frozen board sections, continuation lineage, client composition
--
-- project_boards lineage: 00179 table → 00180 activation snapshot → latest
-- activate_proposal_as_project body 00398. Rather than re-copy the 00398
-- activation monolith, a BEFORE INSERT trigger snapshots the source board's
-- sections into every future project_boards row. Existing snapshots are
-- backfilled from their soft source_board_id while it still resolves.
--
-- Function lineage:
--   • continue_board_in_project: latest body 00273, grafted with persisted
--     sections, source_project_board_id, an exact design-studio co-member
--     author check, and concurrency-safe idempotency.
--   • get_client_proposal_bundle: latest body 00390, reproduced in full with
--     only board.sections + item data.section_id added to the safe projection.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Persist sections on frozen project snapshots ──────────────────────

ALTER TABLE public.project_boards
  ADD COLUMN IF NOT EXISTS sections jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.project_boards
  DROP CONSTRAINT IF EXISTS project_boards_sections_array;
ALTER TABLE public.project_boards
  ADD CONSTRAINT project_boards_sections_array
  CHECK (jsonb_typeof(sections) = 'array');

COMMENT ON COLUMN public.project_boards.sections IS
  'Frozen ordered [{id,name,color?}] section definitions captured with the '
  'signed board snapshot. Item membership remains in items[*].data.section_id.';

CREATE OR REPLACE FUNCTION public.snapshot_project_board_sections()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sections jsonb;
BEGIN
  IF NEW.source_board_id IS NOT NULL
     AND (
       NEW.sections IS NULL
       OR jsonb_typeof(NEW.sections) <> 'array'
       OR jsonb_array_length(NEW.sections) = 0
     ) THEN
    SELECT board.sections
    INTO v_sections
    FROM public.proposal_boards AS board
    WHERE board.id = NEW.source_board_id;

    IF jsonb_typeof(v_sections) = 'array' THEN
      NEW.sections := v_sections;
    END IF;
  END IF;

  NEW.sections := COALESCE(NEW.sections, '[]'::jsonb);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_project_board_sections()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS snapshot_project_board_sections_trg
  ON public.project_boards;
CREATE TRIGGER snapshot_project_board_sections_trg
BEFORE INSERT OR UPDATE OF source_board_id ON public.project_boards
FOR EACH ROW EXECUTE FUNCTION public.snapshot_project_board_sections();

UPDATE public.project_boards AS snapshot
SET sections = source.sections
FROM public.proposal_boards AS source
WHERE source.id = snapshot.source_board_id
  AND jsonb_typeof(source.sections) = 'array'
  AND jsonb_array_length(source.sections) > 0
  AND (
    jsonb_typeof(snapshot.sections) <> 'array'
    OR jsonb_array_length(snapshot.sections) = 0
  );

-- ── 2. Durable one-to-one continuation lineage ───────────────────────────────

ALTER TABLE public.proposal_boards
  ADD COLUMN IF NOT EXISTS source_project_board_id uuid
    REFERENCES public.project_boards(id) ON DELETE RESTRICT;

ALTER TABLE public.proposal_boards
  DROP CONSTRAINT IF EXISTS proposal_boards_source_project_owner;
ALTER TABLE public.proposal_boards
  ADD CONSTRAINT proposal_boards_source_project_owner
  CHECK (source_project_board_id IS NULL OR project_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_proposal_boards_source_project_board
  ON public.proposal_boards(source_project_board_id)
  WHERE source_project_board_id IS NOT NULL;

COMMENT ON COLUMN public.proposal_boards.source_project_board_id IS
  'Immutable lineage to the frozen project_boards snapshot continued into this '
  'live project-owned board. The partial unique index makes continuation '
  'idempotent under retries and concurrency.';

CREATE OR REPLACE FUNCTION public.guard_live_board_source_lineage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source_project_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.source_project_board_id IS DISTINCT FROM OLD.source_project_board_id
  THEN
    RAISE EXCEPTION 'live board source lineage is immutable'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.source_project_board_id IS NOT NULL THEN
    SELECT snapshot.project_id
    INTO v_source_project_id
    FROM public.project_boards AS snapshot
    WHERE snapshot.id = NEW.source_project_board_id;

    IF NOT FOUND OR v_source_project_id IS DISTINCT FROM NEW.project_id THEN
      RAISE EXCEPTION 'continued board must belong to its source snapshot project'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_live_board_source_lineage()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_live_board_source_lineage_trg
  ON public.proposal_boards;
CREATE TRIGGER guard_live_board_source_lineage_trg
BEFORE INSERT OR UPDATE OF source_project_board_id, project_id
ON public.proposal_boards
FOR EACH ROW EXECUTE FUNCTION public.guard_live_board_source_lineage();

-- ── 3. 00273 continuation body + durable idempotency ──────────────────────

CREATE OR REPLACE FUNCTION public.continue_board_in_project(
  p_project_board_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pb public.project_boards%ROWTYPE;
  v_designer_id uuid;
  v_sections jsonb;
  v_new_id uuid;
BEGIN
  -- RLS-filtered read: the caller must participate in the project.
  SELECT * INTO v_pb
  FROM public.project_boards
  WHERE id = p_project_board_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'continue_board_in_project: board % not found or access denied',
      p_project_board_id;
  END IF;

  -- Exact active design-studio peers share authoring authority (00399/00401).
  SELECT project.designer_id INTO v_designer_id
  FROM public.projects AS project
  WHERE project.id = v_pb.project_id;

  IF NOT public.is_design_studio_comember(v_designer_id) THEN
    RAISE EXCEPTION
      'continue_board_in_project: only the project design studio may continue a board'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Fast idempotent retry path.
  SELECT board.id INTO v_new_id
  FROM public.proposal_boards AS board
  WHERE board.source_project_board_id = p_project_board_id
  LIMIT 1;

  IF v_new_id IS NOT NULL THEN
    RETURN v_new_id;
  END IF;

  -- 00407 snapshots named sections directly. Retain 00273's fallbacks for a
  -- legacy/source-deleted row that could not be backfilled.
  v_sections := v_pb.sections;

  IF v_sections IS NULL
     OR jsonb_typeof(v_sections) <> 'array'
     OR jsonb_array_length(v_sections) = 0 THEN
    SELECT board.sections INTO v_sections
    FROM public.proposal_boards AS board
    WHERE board.id = v_pb.source_board_id;
  END IF;

  IF v_sections IS NULL
     OR jsonb_typeof(v_sections) <> 'array'
     OR jsonb_array_length(v_sections) = 0 THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object('id', section_id, 'name', 'Section')
        ORDER BY section_id
      ),
      '[]'::jsonb
    )
    INTO v_sections
    FROM (
      SELECT DISTINCT item->'data'->>'section_id' AS section_id
      FROM jsonb_array_elements(COALESCE(v_pb.items, '[]'::jsonb)) AS item
      WHERE item->'data'->>'section_id' IS NOT NULL
        AND btrim(item->'data'->>'section_id') <> ''
    ) AS recovered;
  END IF;

  INSERT INTO public.proposal_boards (
    proposal_id,
    project_id,
    source_project_board_id,
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
    NULL,
    v_pb.project_id,
    p_project_board_id,
    v_pb.name,
    NULL,
    v_pb.cover_image_url,
    v_pb.canvas_width,
    v_pb.canvas_height,
    v_pb.background_color,
    v_pb.sort_order,
    COALESCE(v_sections, '[]'::jsonb),
    'active'
  )
  ON CONFLICT (source_project_board_id)
    WHERE source_project_board_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_new_id;

  -- A concurrent continuation won. Read and return the canonical row without
  -- duplicating its items.
  IF v_new_id IS NULL THEN
    SELECT board.id INTO v_new_id
    FROM public.proposal_boards AS board
    WHERE board.source_project_board_id = p_project_board_id;

    IF v_new_id IS NULL THEN
      RAISE EXCEPTION 'continue_board_in_project: idempotent insert lost lineage'
        USING ERRCODE = 'serialization_failure';
    END IF;

    RETURN v_new_id;
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
    v_new_id,
    COALESCE(item->>'type', 'image'),
    COALESCE((item->>'x')::numeric, 0),
    COALESCE((item->>'y')::numeric, 0),
    COALESCE((item->>'width')::numeric, 240),
    CASE
      WHEN item->>'height' IS NULL THEN NULL
      ELSE (item->>'height')::numeric
    END,
    COALESCE((item->>'z_index')::integer, 0),
    COALESCE((item->>'rotation')::numeric, 0),
    false,
    CASE
      WHEN item->>'product_id' IS NULL OR btrim(item->>'product_id') = ''
        THEN NULL
      ELSE (item->>'product_id')::uuid
    END,
    NULL,
    NULL,
    item->>'image_url',
    item->>'content',
    COALESCE(item->'data', '{}'::jsonb)
  FROM jsonb_array_elements(COALESCE(v_pb.items, '[]'::jsonb)) AS item;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.continue_board_in_project(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.continue_board_in_project(uuid)
  TO authenticated;

-- ── 4. Client-safe bundle (00390 full body + board sections) ──────────────

CREATE OR REPLACE FUNCTION public.get_client_proposal_bundle(
  p_proposal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'get_client_proposal_bundle requires authentication'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT jsonb_build_object(
    'proposal', jsonb_strip_nulls(jsonb_build_object(
      'id', proposal.id,
      'project_id', proposal.project_id,
      'project', CASE
        WHEN project.id IS NULL THEN NULL
        ELSE jsonb_build_object('id', project.id, 'name', project.name)
      END,
      'designer_id', proposal.designer_id,
      'title', proposal.title,
      'description', proposal.description,
      'project_address', proposal.project_address,
      'cover_image', proposal.cover_image,
      'total_amount', proposal.total_amount,
      'payment_terms', proposal.payment_terms,
      'payment_notes', proposal.payment_notes,
      'status', proposal.status,
      'valid_until', proposal.valid_until,
      'sent_at', proposal.sent_at,
      'signed_at', proposal.signed_at,
      'signed_by_name', proposal.signed_by_name,
      'declined_at', proposal.declined_at,
      'decline_reason', proposal.decline_reason,
      'created_at', proposal.created_at,
      'updated_at', proposal.updated_at,
      'version', proposal.version,
      'parent_proposal_id', proposal.parent_proposal_id,
      'revision_summary', proposal.revision_summary,
      'personal_message', proposal.personal_message,
      'client_visibility_tier', proposal.client_visibility_tier,
      'feedback_enabled', proposal.feedback_enabled,
      'client', jsonb_strip_nulls(jsonb_build_object(
        'full_name', client.full_name
      )),
      'items', CASE
        WHEN proposal.client_visibility_tier = 'curated' THEN '[]'::jsonb
        ELSE COALESCE((
          SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
            'id', item.id,
            'proposal_id', item.proposal_id,
            'name', item.name,
            'description', item.description,
            'image_url', item.image_url,
            'room', item.room,
            'category', item.category,
            'quantity', item.quantity,
            'unit_sell_price', CASE
              WHEN proposal.client_visibility_tier = 'full'
                THEN item.unit_sell_price
              ELSE NULL
            END,
            'line_total_cents', CASE
              WHEN proposal.client_visibility_tier = 'full'
                THEN item.line_total_cents
              ELSE NULL
            END,
            'vendor_name', CASE
              WHEN proposal.client_visibility_tier = 'full'
                THEN item.vendor_name
              ELSE NULL
            END,
            'lead_time_weeks', item.lead_time_weeks,
            'notes', item.notes,
            'position', item.position,
            'item_type', item.item_type,
            'scope_room_id', item.scope_room_id,
            'budget_min_cents', CASE
              WHEN proposal.client_visibility_tier = 'full'
                THEN item.budget_min_cents
              ELSE NULL
            END,
            'budget_max_cents', CASE
              WHEN proposal.client_visibility_tier = 'full'
                THEN item.budget_max_cents
              ELSE NULL
            END,
            'ffe_category', item.ffe_category,
            'doc_code', item.doc_code,
            'created_at', item.created_at,
            'updated_at', item.updated_at,
            'client_product_snapshot', jsonb_strip_nulls(jsonb_build_object(
              'name', item.client_product_snapshot->'name',
              'images', item.client_product_snapshot->'images',
              'brand', CASE
                WHEN proposal.client_visibility_tier = 'full'
                  THEN item.client_product_snapshot->'brand'
                ELSE NULL
              END,
              'source_url', CASE
                WHEN proposal.client_visibility_tier = 'full'
                  THEN item.client_product_snapshot->'source_url'
                ELSE NULL
              END,
              'dimensions', item.client_product_snapshot->'dimensions',
              'materials', item.client_product_snapshot->'materials',
              'price_retail', CASE
                WHEN proposal.client_visibility_tier = 'full'
                  THEN item.client_product_snapshot->'price_retail'
                ELSE NULL
              END,
              'has_teaching', item.client_product_snapshot->'has_teaching',
              'record_completeness_hidden', CASE
                WHEN proposal.client_visibility_tier = 'full' THEN NULL
                ELSE 'true'::jsonb
              END
            ))
          )) ORDER BY item.position, item.id)
          FROM public.proposal_items AS item
          WHERE item.proposal_id = proposal.id
            AND item.item_type <> 'tbd'
        ), '[]'::jsonb)
      END
    )),
    'sections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', section.id,
        'proposal_id', section.proposal_id,
        'type', section.type,
        'title', section.title,
        'body', section.body,
        'metadata', CASE
          WHEN section.type = 'concept' THEN jsonb_strip_nulls(jsonb_build_object(
            'mood_board_urls', CASE
              WHEN jsonb_typeof(section.metadata->'mood_board_urls') = 'array'
                THEN COALESCE((
                  SELECT jsonb_agg(entry.value ORDER BY entry.ordinality)
                  FROM jsonb_array_elements(section.metadata->'mood_board_urls')
                    WITH ORDINALITY AS entry(value, ordinality)
                  WHERE jsonb_typeof(entry.value) = 'string'
                ), '[]'::jsonb)
              ELSE NULL
            END,
            'color_palette', CASE
              WHEN jsonb_typeof(section.metadata->'color_palette') = 'array'
                THEN COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object('hex', swatch.value->'hex')
                    ORDER BY swatch.ordinality
                  )
                  FROM jsonb_array_elements(section.metadata->'color_palette')
                    WITH ORDINALITY AS swatch(value, ordinality)
                  WHERE jsonb_typeof(swatch.value) = 'object'
                    AND jsonb_typeof(swatch.value->'hex') = 'string'
                ), '[]'::jsonb)
              ELSE NULL
            END
          ))
          WHEN section.type = 'space_plan' THEN jsonb_strip_nulls(jsonb_build_object(
            'floor_plan_url', CASE
              WHEN jsonb_typeof(section.metadata->'floor_plan_url') = 'string'
                THEN section.metadata->'floor_plan_url'
              ELSE NULL
            END
          ))
          ELSE '{}'::jsonb
        END,
        'sort_order', section.sort_order
      ) ORDER BY section.sort_order, section.id)
      FROM public.proposal_sections AS section
      WHERE section.proposal_id = proposal.id
    ), '[]'::jsonb),
    'payment_milestones', CASE
      WHEN proposal.client_visibility_tier = 'curated' THEN '[]'::jsonb
      ELSE COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', milestone.id,
          'proposal_id', milestone.proposal_id,
          'phase_id', milestone.phase_id,
          'label', milestone.label,
          'percentage', milestone.percentage,
          'amount_cents', CASE
            WHEN proposal.client_visibility_tier IS DISTINCT FROM 'curated'
              THEN milestone.amount_cents
            ELSE NULL
          END,
          'trigger_condition', milestone.trigger_condition,
          'sort_order', milestone.sort_order
        ) ORDER BY milestone.sort_order, milestone.id)
        FROM public.proposal_payment_milestones AS milestone
        WHERE milestone.proposal_id = proposal.id
      ), '[]'::jsonb)
    END,
    'phases', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', phase.id,
        'proposal_id', phase.proposal_id,
        'name', phase.name,
        'duration_weeks', phase.duration_weeks,
        'sort_order', phase.sort_order
      ) ORDER BY phase.sort_order, phase.id)
      FROM public.proposal_phases AS phase
      WHERE phase.proposal_id = proposal.id
    ), '[]'::jsonb),
    'exclusions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', exclusion.id,
        'proposal_id', exclusion.proposal_id,
        'description', exclusion.description,
        'category', exclusion.category,
        'sort_order', exclusion.sort_order
      ) ORDER BY exclusion.sort_order, exclusion.id)
      FROM public.proposal_exclusions AS exclusion
      WHERE exclusion.proposal_id = proposal.id
    ), '[]'::jsonb),
    'scope_rooms', COALESCE((
      SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', room.id,
        'proposal_id', room.proposal_id,
        'name', room.name,
        'room_type', room.room_type,
        'budget_cents', CASE
          WHEN proposal.client_visibility_tier = 'full'
            THEN room.budget_cents
          ELSE NULL
        END,
        'sort_order', room.sort_order
      )) ORDER BY room.sort_order, room.id)
      FROM public.proposal_scope_rooms AS room
      WHERE room.proposal_id = proposal.id
    ), '[]'::jsonb),
    'boards', CASE
      WHEN proposal.client_visibility_tier = 'curated' THEN '[]'::jsonb
      ELSE COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', board.id,
          'name', board.name,
          'cover_image_url', board.cover_image_url,
          'sort_order', board.sort_order,
          'canvas_width', board.canvas_width,
          'canvas_height', board.canvas_height,
          'background_color', board.background_color,
          'sections', CASE
            WHEN jsonb_typeof(board.sections) = 'array' THEN board.sections
            ELSE '[]'::jsonb
          END,
          'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', board_item.id,
              'type', board_item.type,
              'x', board_item.x,
              'y', board_item.y,
              'width', board_item.width,
              'height', board_item.height,
              'z_index', board_item.z_index,
              'rotation', board_item.rotation,
              'image_url', board_item.image_url,
              'content', board_item.content,
              'data', jsonb_strip_nulls(jsonb_build_object(
                'name', board_item.data->'name',
                'image_url', board_item.data->'image_url',
                'room_type', board_item.data->'room_type',
                'swatches', CASE
                  WHEN board_item.type = 'palette' THEN COALESCE((
                    SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                      'hex', swatch.value->'hex',
                      'name', CASE
                        WHEN jsonb_typeof(swatch.value->'name') = 'string'
                          THEN swatch.value->'name'
                        ELSE NULL
                      END,
                      'role', CASE
                        WHEN jsonb_typeof(swatch.value->'role') = 'string'
                          THEN swatch.value->'role'
                        ELSE NULL
                      END
                    )) ORDER BY swatch.ordinality)
                    FROM jsonb_array_elements(
                      CASE
                        WHEN jsonb_typeof(board_item.data->'swatches') = 'array'
                          THEN board_item.data->'swatches'
                        ELSE '[]'::jsonb
                      END
                    ) WITH ORDINALITY AS swatch(value, ordinality)
                    WHERE jsonb_typeof(swatch.value) = 'object'
                      AND jsonb_typeof(swatch.value->'hex') = 'string'
                  ), '[]'::jsonb)
                  ELSE NULL
                END,
                'price_cents', CASE
                  WHEN proposal.client_visibility_tier = 'full'
                    THEN board_item.data->'price_cents'
                  ELSE NULL
                END,
                'vendor_name', CASE
                  WHEN proposal.client_visibility_tier = 'full'
                    THEN board_item.data->'vendor_name'
                  ELSE NULL
                END,
                'source_url', CASE
                  WHEN proposal.client_visibility_tier = 'full'
                    THEN board_item.data->'source_url'
                  ELSE NULL
                END,
                'lead_time_weeks', board_item.data->'lead_time_weeks',
                'section_id', board_item.data->'section_id'
              ))
            ) ORDER BY board_item.z_index, board_item.id)
            FROM public.proposal_board_items AS board_item
            WHERE board_item.board_id = board.id
          ), '[]'::jsonb)
        ) ORDER BY board.sort_order, board.id)
        FROM public.proposal_boards AS board
        WHERE board.proposal_id = proposal.id
          AND board.status = 'active'
      ), '[]'::jsonb)
    END
  )
  INTO v_payload
  FROM public.proposals AS proposal
  LEFT JOIN public.profiles AS client ON client.id = proposal.client_id
  LEFT JOIN public.projects AS project ON project.id = proposal.project_id
  WHERE proposal.id = p_proposal_id
    AND proposal.client_id = auth.uid()
    AND proposal.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired');

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_proposal_bundle(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_proposal_bundle(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_client_proposal_bundle(uuid) IS
  'Latest 00390 client-safe proposal bundle with mood-board section definitions '
  'and item section membership added to the explicit board projection.';
