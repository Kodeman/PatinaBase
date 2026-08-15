-- Board-template isolation, starter stability, and materialization regressions
-- (00408 + 00409). Run after a fresh reset:
--   scripts/run-supabase-sql-test.sh supabase/tests/mood_boards/template_lifecycle_test.sql

BEGIN;

SET LOCAL statement_timeout = '20s';

CREATE OR REPLACE FUNCTION pg_temp.assume_mood_board_actor(
  p_actor uuid,
  p_role text DEFAULT 'authenticated'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_strip_nulls(jsonb_build_object(
      'sub', p_actor,
      'role', p_role
    ))::text,
    true
  );
  PERFORM set_config(
    'request.jwt.claim.sub',
    COALESCE(p_actor::text, ''),
    true
  );
  PERFORM set_config('request.jwt.claim.role', p_role, true);
END;
$$;

DO $$
BEGIN
  ASSERT (
    SELECT count(*) = 4
    FROM public.board_templates
    WHERE kind = 'seeded'
  ), 'exactly four migration-owned Patina starters must exist';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM (VALUES
      ('ba000000-0000-4000-8000-000000000001'::uuid, 'patina.single-room-concept'),
      ('ba000000-0000-4000-8000-000000000002'::uuid, 'patina.palette-material-study'),
      ('ba000000-0000-4000-8000-000000000003'::uuid, 'patina.zoned-furniture-plan'),
      ('ba000000-0000-4000-8000-000000000004'::uuid, 'patina.before-after-story')
    ) AS expected(id, template_key)
    LEFT JOIN public.board_templates AS template
      ON template.id = expected.id
     AND template.template_key = expected.template_key
     AND template.kind = 'seeded'
    WHERE template.id IS NULL
  ), 'Patina starter UUID/key mappings must remain stable';

  ASSERT NOT has_table_privilege(
    'authenticated',
    'public.board_templates',
    'INSERT'
  ), 'direct authenticated template inserts must remain RPC-only';

  BEGIN
    UPDATE public.board_templates
    SET name = 'Mutated starter'
    WHERE id = 'ba000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'seeded template unexpectedly updated';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.board_templates
    WHERE id = 'ba000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'seeded template unexpectedly deleted';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

INSERT INTO public.proposal_boards (
  id,
  proposal_id,
  name,
  cover_image_url,
  canvas_width,
  canvas_height,
  background_color,
  sections,
  status,
  sort_order
)
VALUES (
  'c4081000-0000-4000-8000-000000000001',
  'b3900000-0000-4000-8000-000000000001',
  'Template source board',
  'https://example.invalid/template-cover.webp',
  1280,
  900,
  '#F0EAE2',
  '[{
    "id":"template-zone",
    "name":"Template Zone",
    "metadata":{
      "project_id":"b0000000-0000-0000-0000-0000000000d1",
      "presentation":"keep"
    }
  }]'::jsonb,
  'active',
  0
);

INSERT INTO public.proposal_board_items (
  id,
  board_id,
  type,
  x,
  y,
  width,
  height,
  z_index,
  image_url,
  content,
  data
)
VALUES (
  'c4081100-0000-4000-8000-000000000001',
  'c4081000-0000-4000-8000-000000000001',
  'image',
  30,
  42,
  410,
  250,
  2,
  'https://example.invalid/template-item.webp',
  'Template item',
  '{
    "name":"Detached reference",
    "section_id":"template-zone",
    "presentation":"keep",
    "product_id":"d0000000-0000-0000-0000-000000000001",
    "nested":{
      "capture_id":"d0000000-0000-0000-0000-000000000002",
      "palette_id":"d0000000-0000-0000-0000-000000000003",
      "source_board_id":"d0000000-0000-0000-0000-000000000004",
      "user_id":"a0000000-0000-0000-0000-000000000004",
      "organization_id":"b0000000-0000-0000-0000-000000000001",
      "created_by":"a0000000-0000-0000-0000-000000000004",
      "label":"keep nested presentation"
    }
  }'::jsonb
);

-- Save and stamp as a studio peer rather than the source board's exact owner.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_mood_board_actor(
  'a0000000-0000-0000-0000-000000000003'
);

DO $$
DECLARE
  v_template public.board_templates%ROWTYPE;
  v_materialized_board_id uuid;
  v_materialized_data jsonb;
  v_materialized_sections jsonb;
  v_materialized_name text;
BEGIN
  SELECT template.*
  INTO v_template
  FROM public.save_board_as_template(
    'c4081000-0000-4000-8000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'Studio stamp fixture',
    'Detached composition regression'
  ) AS template;

  ASSERT v_template.kind = 'studio'
     AND v_template.studio_id =
       'b0000000-0000-0000-0000-000000000001'::uuid
     AND v_template.created_by =
       'a0000000-0000-0000-0000-000000000003'::uuid
     AND v_template.template_key LIKE 'studio.%',
    'save RPC must create one studio-owned template stamp';

  ASSERT NOT jsonb_path_exists(v_template.sections, '$.**.project_id')
     AND NOT jsonb_path_exists(v_template.items, '$.**.product_id')
     AND NOT jsonb_path_exists(v_template.items, '$.**.capture_id')
     AND NOT jsonb_path_exists(v_template.items, '$.**.palette_id')
     AND NOT jsonb_path_exists(v_template.items, '$.**.source_board_id')
     AND NOT jsonb_path_exists(v_template.items, '$.**.user_id')
     AND NOT jsonb_path_exists(v_template.items, '$.**.organization_id')
     AND NOT jsonb_path_exists(v_template.items, '$.**.created_by'),
    'template snapshot must recursively strip every live owner reference';

  ASSERT jsonb_path_exists(
    v_template.sections,
    '$.**.presentation ? (@ == "keep")'
  ) AND jsonb_path_exists(
    v_template.items,
    '$.**.label ? (@ == "keep nested presentation")'
  ), 'sanitizer must retain unrelated nested presentation data';

  UPDATE public.board_templates
  SET name = 'Renamed studio stamp'
  WHERE id = v_template.id;
  ASSERT FOUND, 'studio member must be able to rename its template';

  BEGIN
    UPDATE public.board_templates
    SET sections = '[]'::jsonb
    WHERE id = v_template.id;
    RAISE EXCEPTION 'studio template composition unexpectedly changed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  v_materialized_board_id := public.materialize_board_template(
    v_template.id,
    'b3900000-0000-4000-8000-000000000002',
    NULL,
    'Stamped live board',
    NULL
  );

  SELECT board.name, board.sections
  INTO v_materialized_name, v_materialized_sections
  FROM public.proposal_boards AS board
  WHERE board.id = v_materialized_board_id;

  ASSERT v_materialized_name = 'Stamped live board',
    'materializer must honor a nonblank board-name override';
  ASSERT NOT jsonb_path_exists(
    v_materialized_sections,
    '$.**.project_id'
  ) AND jsonb_path_exists(
    v_materialized_sections,
    '$.**.presentation ? (@ == "keep")'
  ), 'materialized sections must remain detached but composition-complete';

  SELECT item.data
  INTO v_materialized_data
  FROM public.proposal_board_items AS item
  WHERE item.board_id = v_materialized_board_id;

  ASSERT v_materialized_data->>'section_id' = 'template-zone'
     AND v_materialized_data->>'presentation' = 'keep'
     AND v_materialized_data #>> '{nested,label}' =
       'keep nested presentation',
    'materializer must retain detached board composition data';
  ASSERT NOT jsonb_path_exists(v_materialized_data, '$.**.product_id')
     AND NOT jsonb_path_exists(v_materialized_data, '$.**.capture_id')
     AND NOT jsonb_path_exists(v_materialized_data, '$.**.palette_id')
     AND NOT jsonb_path_exists(v_materialized_data, '$.**.source_board_id')
     AND NOT jsonb_path_exists(v_materialized_data, '$.**.user_id')
     AND NOT jsonb_path_exists(v_materialized_data, '$.**.organization_id')
     AND NOT jsonb_path_exists(v_materialized_data, '$.**.created_by'),
    'materialized item JSON must not regain stripped owner references';

  ASSERT EXISTS (
    SELECT 1
    FROM public.proposal_board_items AS item
    WHERE item.board_id = v_materialized_board_id
      AND item.product_id IS NULL
      AND item.capture_id IS NULL
      AND item.palette_id IS NULL
  ), 'materialized item foreign keys must all start detached';
END;
$$;

RESET ROLE;

-- auth.users uses ON DELETE SET NULL for creator provenance. The immutability
-- guard permits only that narrowing transition; composition and studio owner
-- remain frozen.
UPDATE public.board_templates
SET created_by = NULL
WHERE name = 'Renamed studio stamp';

DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1
    FROM public.board_templates
    WHERE name = 'Renamed studio stamp'
      AND kind = 'studio'
      AND studio_id = 'b0000000-0000-0000-0000-000000000001'
      AND created_by IS NULL
  ), 'creator FK cleanup must not invalidate a studio-owned template';
END;
$$;

-- Authenticated clients can discover Patina starters, but studio stamps are
-- visible only inside their exact active design studio.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_mood_board_actor(
  'a0000000-0000-0000-0000-000000000005'
);

DO $$
BEGIN
  ASSERT (
    SELECT count(*) = 4
    FROM public.board_templates
    WHERE kind = 'seeded'
  ), 'authenticated client must be able to read the four starter templates';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.board_templates
    WHERE name = 'Renamed studio stamp'
  ), 'client outside the studio must not see a studio template stamp';
END;
$$;

ROLLBACK;
