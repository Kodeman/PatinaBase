-- ═══════════════════════════════════════════════════════════════════════════
-- 00411 — Atomic structural persistence for the MoodBoard room
--
-- One semantic room command may add/delete/update several pins plus the board
-- row. Sending those as independent HTTP mutations can leave a partially
-- applied command. This invoker-rights RPC validates and replaces the live
-- board state in one PostgreSQL transaction; ordinary table RLS remains the
-- authorization boundary for proposal- and project-owned boards.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.apply_board_room_state(
  p_board_id uuid,
  p_owner_kind text,
  p_owner_id uuid,
  p_state jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_items jsonb;
  v_item jsonb;
  v_board_id uuid;
  v_item_id uuid;
  v_written integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_owner_kind NOT IN ('proposal', 'project') THEN
    RAISE EXCEPTION 'invalid board owner kind'
      USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_typeof(p_state) IS DISTINCT FROM 'object'
     OR jsonb_typeof(COALESCE(p_state->'items', 'null'::jsonb)) IS DISTINCT FROM 'array'
     OR jsonb_typeof(COALESCE(p_state->'sections', 'null'::jsonb)) IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'invalid board room state'
      USING ERRCODE = 'check_violation';
  END IF;

  v_items := p_state->'items';
  IF jsonb_array_length(v_items) > 1000 THEN
    RAISE EXCEPTION 'board item limit exceeded'
      USING ERRCODE = 'program_limit_exceeded';
  END IF;
  IF nullif(btrim(p_state->>'name'), '') IS NULL
     OR length(p_state->>'name') > 200
     OR jsonb_typeof(p_state->'canvasWidth') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_state->'canvasHeight') IS DISTINCT FROM 'number'
     OR p_state->>'canvasWidth' !~ '^[0-9]+$'
     OR p_state->>'canvasHeight' !~ '^[0-9]+$'
     OR (p_state->>'canvasWidth')::integer NOT BETWEEN 40 AND 100000
     OR (p_state->>'canvasHeight')::integer NOT BETWEEN 40 AND 100000
     OR p_state->>'backgroundColor' !~ '^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$'
  THEN
    RAISE EXCEPTION 'invalid board fields'
      USING ERRCODE = 'check_violation';
  END IF;

  IF jsonb_array_length(p_state->'sections') > 100 OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_state->'sections') AS section
    WHERE jsonb_typeof(section) IS DISTINCT FROM 'object'
       OR jsonb_typeof(section->'id') IS DISTINCT FROM 'string'
       OR nullif(btrim(section->>'id'), '') IS NULL
       OR length(section->>'id') > 128
       OR jsonb_typeof(section->'name') IS DISTINCT FROM 'string'
       OR nullif(btrim(section->>'name'), '') IS NULL
       OR length(section->>'name') > 200
       OR (section ? 'color' AND jsonb_typeof(section->'color') IS DISTINCT FROM 'string')
       OR (section ? 'color' AND section->>'color' !~ '^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$')
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(section) AS keys(key)
         WHERE keys.key NOT IN ('id', 'name', 'color')
       )
  ) OR (
    SELECT count(*) FROM jsonb_array_elements(p_state->'sections')
  ) IS DISTINCT FROM (
    SELECT count(DISTINCT section->>'id')
    FROM jsonb_array_elements(p_state->'sections') AS section
  ) THEN
    RAISE EXCEPTION 'invalid board sections'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.proposal_boards
  SET name = btrim(p_state->>'name'),
      canvas_width = (p_state->>'canvasWidth')::integer,
      canvas_height = (p_state->>'canvasHeight')::integer,
      background_color = p_state->>'backgroundColor',
      sections = p_state->'sections'
  WHERE id = p_board_id
    AND (
      (p_owner_kind = 'proposal' AND proposal_id = p_owner_id AND project_id IS NULL)
      OR
      (p_owner_kind = 'project' AND project_id = p_owner_id AND proposal_id IS NULL)
    )
  RETURNING id INTO v_board_id;

  -- UPDATE is intentionally the authorization probe: invoker rights + the
  -- table's designer policies collapse missing, wrong-owner, and forbidden.
  IF v_board_id IS NULL THEN
    RAISE EXCEPTION 'board unavailable'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF (
    SELECT count(*)
    FROM jsonb_array_elements(v_items) AS entry
    WHERE jsonb_typeof(entry) IS DISTINCT FROM 'object'
       OR jsonb_typeof(entry->'id') IS DISTINCT FROM 'string'
       OR entry->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) > 0 OR (
    SELECT count(*)
    FROM jsonb_array_elements(v_items)
  ) IS DISTINCT FROM (
    SELECT count(DISTINCT entry->>'id')
    FROM jsonb_array_elements(v_items) AS entry
  ) THEN
    RAISE EXCEPTION 'board item ids must be present and unique'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.proposal_board_items existing
    JOIN jsonb_array_elements(v_items) AS entry
      ON existing.id = (entry->>'id')::uuid
    WHERE existing.board_id <> p_board_id
  ) THEN
    RAISE EXCEPTION 'board item id belongs to another board'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  DELETE FROM public.proposal_board_items existing
  WHERE existing.board_id = p_board_id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_items) AS entry
      WHERE (entry->>'id')::uuid = existing.id
    );

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR v_item->>'type' NOT IN ('product', 'capture', 'image', 'palette', 'note', 'room_scan')
       OR jsonb_typeof(v_item->'x') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_item->'y') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_item->'width') IS DISTINCT FROM 'number'
       OR v_item->>'x' !~ '^[0-9]+([.][0-9]+)?$'
       OR v_item->>'y' !~ '^[0-9]+([.][0-9]+)?$'
       OR v_item->>'width' !~ '^[0-9]+([.][0-9]+)?$'
       OR (
         v_item ? 'height'
         AND v_item->'height' <> 'null'::jsonb
         AND (
           jsonb_typeof(v_item->'height') IS DISTINCT FROM 'number'
           OR v_item->>'height' !~ '^[0-9]+([.][0-9]+)?$'
         )
       )
       OR (v_item ? 'zIndex' AND (
         jsonb_typeof(v_item->'zIndex') IS DISTINCT FROM 'number'
         OR v_item->>'zIndex' !~ '^-?[0-9]+$'
       ))
       OR (v_item ? 'rotation' AND (
         jsonb_typeof(v_item->'rotation') IS DISTINCT FROM 'number'
         OR v_item->>'rotation' !~ '^-?[0-9]+([.][0-9]+)?$'
       ))
       OR (v_item ? 'locked' AND jsonb_typeof(v_item->'locked') IS DISTINCT FROM 'boolean')
       OR jsonb_typeof(COALESCE(v_item->'data', '{}'::jsonb)) IS DISTINCT FROM 'object'
       OR pg_column_size(COALESCE(v_item->'data', '{}'::jsonb)) > 262144
       OR (v_item ? 'content' AND v_item->'content' <> 'null'::jsonb AND jsonb_typeof(v_item->'content') IS DISTINCT FROM 'string')
       OR length(COALESCE(v_item->>'content', '')) > 100000
       OR (v_item ? 'imageUrl' AND v_item->'imageUrl' <> 'null'::jsonb AND jsonb_typeof(v_item->'imageUrl') IS DISTINCT FROM 'string')
       OR length(COALESCE(v_item->>'imageUrl', '')) > 4096
       OR EXISTS (
         SELECT 1
         FROM (VALUES ('productId'), ('captureId'), ('paletteId')) AS field(name)
         WHERE v_item ? field.name
           AND v_item->field.name <> 'null'::jsonb
           AND (
             jsonb_typeof(v_item->field.name) IS DISTINCT FROM 'string'
             OR v_item->>field.name !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           )
       )
    THEN
      RAISE EXCEPTION 'invalid board item'
        USING ERRCODE = 'check_violation';
    END IF;
    IF (v_item->>'x')::numeric < 0
       OR (v_item->>'y')::numeric < 0
       OR (v_item->>'y')::numeric > (p_state->>'canvasHeight')::numeric
       OR (v_item->>'width')::numeric NOT BETWEEN 40 AND 100000
       OR (v_item->>'x')::numeric + (v_item->>'width')::numeric > (p_state->>'canvasWidth')::numeric
       OR (
         v_item ? 'height'
         AND v_item->'height' <> 'null'::jsonb
         AND (
           (v_item->>'height')::numeric NOT BETWEEN 40 AND 100000
           OR (v_item->>'y')::numeric + (v_item->>'height')::numeric > (p_state->>'canvasHeight')::numeric
         )
       )
       OR COALESCE((v_item->>'zIndex')::integer, 0) NOT BETWEEN -1000000 AND 1000000
       OR COALESCE((v_item->>'rotation')::numeric, 0) NOT BETWEEN -36000 AND 36000
    THEN
      RAISE EXCEPTION 'board item geometry is out of range'
        USING ERRCODE = 'check_violation';
    END IF;
    v_item_id := (v_item->>'id')::uuid;

    INSERT INTO public.proposal_board_items (
      id, board_id, type, x, y, width, height, z_index, rotation, locked,
      product_id, capture_id, palette_id, image_url, content, data
    ) VALUES (
      v_item_id,
      p_board_id,
      v_item->>'type',
      COALESCE((v_item->>'x')::numeric, 0),
      COALESCE((v_item->>'y')::numeric, 0),
      (v_item->>'width')::numeric,
      CASE WHEN v_item->'height' IS NULL OR v_item->'height' = 'null'::jsonb
        THEN NULL ELSE (v_item->>'height')::numeric END,
      COALESCE((v_item->>'zIndex')::integer, 0),
      COALESCE((v_item->>'rotation')::numeric, 0),
      COALESCE((v_item->>'locked')::boolean, false),
      nullif(v_item->>'productId', '')::uuid,
      nullif(v_item->>'captureId', '')::uuid,
      nullif(v_item->>'paletteId', '')::uuid,
      nullif(v_item->>'imageUrl', ''),
      v_item->>'content',
      COALESCE(v_item->'data', '{}'::jsonb)
    )
    ON CONFLICT (id) DO UPDATE
    SET type = EXCLUDED.type,
        x = EXCLUDED.x,
        y = EXCLUDED.y,
        width = EXCLUDED.width,
        height = EXCLUDED.height,
        z_index = EXCLUDED.z_index,
        rotation = EXCLUDED.rotation,
        locked = EXCLUDED.locked,
        product_id = EXCLUDED.product_id,
        capture_id = EXCLUDED.capture_id,
        palette_id = EXCLUDED.palette_id,
        image_url = EXCLUDED.image_url,
        content = EXCLUDED.content,
        data = EXCLUDED.data
    WHERE proposal_board_items.board_id = p_board_id;

    GET DIAGNOSTICS v_written = ROW_COUNT;
    IF v_written <> 1 THEN
      RAISE EXCEPTION 'board item could not be written'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.apply_board_room_state(uuid, text, uuid, jsonb) IS
  'Atomically replaces one live MoodBoard board row and item set. Runs with '
  'invoker rights so proposal_boards/proposal_board_items RLS remains the '
  'authorization boundary.';

REVOKE ALL ON FUNCTION public.apply_board_room_state(uuid, text, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_board_room_state(uuid, text, uuid, jsonb)
  TO authenticated;
