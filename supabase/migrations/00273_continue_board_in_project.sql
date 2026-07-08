-- 00273_continue_board_in_project.sql
-- Track S² · B8 (Schedule & Boards Wave 3): the "Continue this board in the
-- project" copy RPC.
--
-- 00272 gave proposal_boards a project owner + RLS. This adds the act that
-- spins a FROZEN project_boards snapshot row (00180 JSONB) into a LIVE, editable
-- project-owned proposal_boards row (+ items). The signed snapshot is untouched
-- and stays the record; the new board is a fresh working surface.
--
-- SECURITY INVOKER: the function runs as the caller, so every write is checked
-- by the 00272 project-owner RLS legs (a non-designer's INSERT would fail). The
-- explicit designer check up front is defense + a clean error message.
--
-- Sections: project_boards has no sections column (00180 froze only items). We
-- recover the section LAYOUT by preferring the source proposal board's named
-- sections (via the soft source_board_id back-ref), falling back to generic
-- sections derived from the distinct data.section_id keys still carried by the
-- snapshot items — so item→section membership survives either way.
--
-- Idempotent definition (CREATE OR REPLACE); re-runnable.

CREATE OR REPLACE FUNCTION public.continue_board_in_project(p_project_board_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pb          public.project_boards%ROWTYPE;
  v_designer_id uuid;
  v_sections    jsonb;
  v_new_id      uuid;
BEGIN
  -- RLS-filtered read: yields nothing unless the caller participates in the
  -- project (00179 "Inherit project access for boards").
  SELECT * INTO v_pb FROM public.project_boards WHERE id = p_project_board_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'continue_board_in_project: board % not found or access denied', p_project_board_id;
  END IF;

  -- Only the project's designer may spin up a live editable board.
  SELECT designer_id INTO v_designer_id FROM public.projects WHERE id = v_pb.project_id;
  IF v_designer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'continue_board_in_project: only the project designer may continue a board';
  END IF;

  -- Recover the section layout. Prefer the source proposal board's named
  -- sections (RLS-gated read; NULL if the caller can't see it or it's gone),
  -- then fall back to generic sections from the items' distinct section_ids.
  SELECT sections INTO v_sections
  FROM public.proposal_boards
  WHERE id = v_pb.source_board_id;

  IF v_sections IS NULL
     OR jsonb_typeof(v_sections) <> 'array'
     OR jsonb_array_length(v_sections) = 0 THEN
    SELECT COALESCE(
             jsonb_agg(jsonb_build_object('id', sid, 'name', 'Section') ORDER BY sid),
             '[]'::jsonb
           )
    INTO v_sections
    FROM (
      SELECT DISTINCT (elem->'data'->>'section_id') AS sid
      FROM jsonb_array_elements(COALESCE(v_pb.items, '[]'::jsonb)) elem
      WHERE (elem->'data'->>'section_id') IS NOT NULL
        AND btrim(elem->'data'->>'section_id') <> ''
    ) s;
  END IF;

  -- New live, project-owned board (proposal_id NULL). scope_room_id stays NULL:
  -- its FK targets proposal_scope_rooms, which an activated project has none of.
  INSERT INTO public.proposal_boards (
    proposal_id, project_id, name, scope_room_id, cover_image_url,
    canvas_width, canvas_height, background_color, sort_order,
    sections, status
  )
  VALUES (
    NULL, v_pb.project_id, v_pb.name, NULL, v_pb.cover_image_url,
    v_pb.canvas_width, v_pb.canvas_height, v_pb.background_color, v_pb.sort_order,
    COALESCE(v_sections, '[]'::jsonb), 'active'
  )
  RETURNING id INTO v_new_id;

  -- Items from the JSONB snapshot → live rows. The 00180 snapshot strips
  -- id/locked/capture_id/palette_id; geometry + product_id + image/content/data
  -- (incl. data.section_id) carry verbatim so membership + provenance survive.
  INSERT INTO public.proposal_board_items (
    board_id, type, x, y, width, height, z_index, rotation, locked,
    product_id, capture_id, palette_id, image_url, content, data
  )
  SELECT
    v_new_id,
    COALESCE(elem->>'type', 'image'),
    COALESCE((elem->>'x')::numeric, 0),
    COALESCE((elem->>'y')::numeric, 0),
    COALESCE((elem->>'width')::numeric, 240),
    CASE WHEN elem->>'height' IS NULL THEN NULL ELSE (elem->>'height')::numeric END,
    COALESCE((elem->>'z_index')::int, 0),
    COALESCE((elem->>'rotation')::numeric, 0),
    false,
    CASE WHEN elem->>'product_id' IS NULL OR btrim(elem->>'product_id') = ''
         THEN NULL ELSE (elem->>'product_id')::uuid END,
    NULL,
    NULL,
    elem->>'image_url',
    elem->>'content',
    COALESCE(elem->'data', '{}'::jsonb)
  FROM jsonb_array_elements(COALESCE(v_pb.items, '[]'::jsonb)) elem;

  RETURN v_new_id;
END;
$$;

-- Default privileges grant EXECUTE to PUBLIC (and thus anon) at creation — I51.
REVOKE ALL ON FUNCTION public.continue_board_in_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.continue_board_in_project(uuid) TO authenticated;
