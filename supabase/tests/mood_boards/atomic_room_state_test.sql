-- Atomic MoodBoard room-state persistence regression (00411).
-- Run after a fresh reset:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/mood_boards/atomic_room_state_test.sql

BEGIN;

SET LOCAL statement_timeout = '20s';

CREATE OR REPLACE FUNCTION pg_temp.assume_room_actor(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_actor, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_actor::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('a4110000-0000-4000-8000-000000000001', 'room-owner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4110000-0000-4000-8000-000000000002', 'room-client@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4110000-0000-4000-8000-000000000003', 'room-foreign@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('a4110000-0000-4000-8000-000000000001', 'room-owner@test.invalid', 'Room Owner', NOW(), NOW()),
  ('a4110000-0000-4000-8000-000000000002', 'room-client@test.invalid', 'Room Client', NOW(), NOW()),
  ('a4110000-0000-4000-8000-000000000003', 'room-foreign@test.invalid', 'Foreign Designer', NOW(), NOW())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name;

INSERT INTO public.proposals (
  id, designer_id, client_id, title, total_amount, status
)
VALUES
  ('a4111000-0000-4000-8000-000000000001',
   'a4110000-0000-4000-8000-000000000001',
   'a4110000-0000-4000-8000-000000000002',
   'Atomic room proposal', 100000, 'draft'),
  ('a4111000-0000-4000-8000-000000000002',
   'a4110000-0000-4000-8000-000000000003',
   'a4110000-0000-4000-8000-000000000002',
   'Foreign room proposal', 100000, 'draft');

INSERT INTO public.proposal_boards (
  id, proposal_id, name, canvas_width, canvas_height, background_color,
  sections, status, sort_order
)
VALUES
  ('a4112000-0000-4000-8000-000000000001',
   'a4111000-0000-4000-8000-000000000001', 'Original board', 1200, 800,
   '#FAF8F5', '[]'::jsonb, 'active', 0),
  ('a4112000-0000-4000-8000-000000000002',
   'a4111000-0000-4000-8000-000000000002', 'Foreign board', 1200, 800,
   '#FAF8F5', '[]'::jsonb, 'active', 0);

INSERT INTO public.proposal_board_items (
  id, board_id, type, x, y, width, height, z_index, rotation, content, data
)
VALUES
  ('a4113000-0000-4000-8000-000000000001',
   'a4112000-0000-4000-8000-000000000001', 'note', 40, 60, 220, 120, 0, 0,
   'Original note', '{}'::jsonb),
  ('a4113000-0000-4000-8000-000000000002',
   'a4112000-0000-4000-8000-000000000002', 'note', 40, 60, 220, 120, 0, 0,
   'Foreign note', '{}'::jsonb);

DO $$
BEGIN
  ASSERT has_function_privilege(
    'authenticated',
    'public.apply_board_room_state(uuid,text,uuid,jsonb)',
    'EXECUTE'
  ), 'authenticated must execute apply_board_room_state';
  ASSERT NOT has_function_privilege(
    'anon',
    'public.apply_board_room_state(uuid,text,uuid,jsonb)',
    'EXECUTE'
  ), 'anon must not execute apply_board_room_state';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_room_actor('a4110000-0000-4000-8000-000000000001');

-- One call replaces board fields and the complete item set.
SELECT public.apply_board_room_state(
  'a4112000-0000-4000-8000-000000000001',
  'proposal',
  'a4111000-0000-4000-8000-000000000001',
  '{
    "name":"Saved atomically",
    "canvasWidth":1400,
    "canvasHeight":900,
    "backgroundColor":"#EFEAE2",
    "sections":[{"id":"seating","name":"Seating","color":"#AA7755"}],
    "items":[
      {"id":"a4113000-0000-4000-8000-000000000001","type":"note","x":80,"y":90,"width":240,"height":140,"zIndex":2,"rotation":1.5,"locked":false,"content":"Updated note","data":{"section_id":"seating"}},
      {"id":"a4113000-0000-4000-8000-000000000003","type":"image","x":380,"y":100,"width":320,"height":240,"zIndex":3,"rotation":0,"locked":false,"imageUrl":"https://example.invalid/image.webp","data":{}}
    ]
  }'::jsonb
);

DO $$
BEGIN
  ASSERT (
    SELECT name = 'Saved atomically'
       AND canvas_width = 1400
       AND sections #>> '{0,name}' = 'Seating'
    FROM public.proposal_boards
    WHERE id = 'a4112000-0000-4000-8000-000000000001'
  ), 'board fields must be replaced';
  ASSERT (
    SELECT count(*) = 2
    FROM public.proposal_board_items
    WHERE board_id = 'a4112000-0000-4000-8000-000000000001'
  ), 'item set must be replaced';
  ASSERT (
    SELECT content = 'Updated note' AND x = 80 AND rotation = 1.5
    FROM public.proposal_board_items
    WHERE id = 'a4113000-0000-4000-8000-000000000001'
  ), 'existing item must receive its complete snapshot';
END;
$$;

-- A mixed valid/invalid payload must roll back its earlier board/item writes.
DO $$
BEGIN
  BEGIN
    PERFORM public.apply_board_room_state(
      'a4112000-0000-4000-8000-000000000001',
      'proposal',
      'a4111000-0000-4000-8000-000000000001',
      '{
        "name":"Must roll back",
        "canvasWidth":1400,
        "canvasHeight":900,
        "backgroundColor":"#FFFFFF",
        "sections":[],
        "items":[
          {"id":"a4113000-0000-4000-8000-000000000001","type":"note","x":100,"y":100,"width":240,"height":140,"content":"Must roll back","data":{}},
          {"id":"a4113000-0000-4000-8000-000000000004","type":"image","x":20,"y":20,"width":39,"height":80,"data":{}}
        ]
      }'::jsonb
    );
    RAISE EXCEPTION 'out-of-range payload unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  ASSERT (
    SELECT name = 'Saved atomically'
    FROM public.proposal_boards
    WHERE id = 'a4112000-0000-4000-8000-000000000001'
  ), 'failed call must roll back the board row';
  ASSERT (
    SELECT content = 'Updated note' AND x = 80
    FROM public.proposal_board_items
    WHERE id = 'a4113000-0000-4000-8000-000000000001'
  ), 'failed call must roll back earlier item writes';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.proposal_board_items
    WHERE id = 'a4113000-0000-4000-8000-000000000004'
  ), 'failed call must not leave a partial insert';
END;
$$;

-- Duplicate and cross-board ids are rejected without changing either board.
DO $$
DECLARE
  v_base jsonb := '{
    "name":"Invalid ids","canvasWidth":1400,"canvasHeight":900,
    "backgroundColor":"#FFFFFF","sections":[],"items":[]
  }'::jsonb;
BEGIN
  BEGIN
    PERFORM public.apply_board_room_state(
      'a4112000-0000-4000-8000-000000000001', 'proposal',
      'a4111000-0000-4000-8000-000000000001',
      jsonb_set(v_base, '{items}', '[
        {"id":"a4113000-0000-4000-8000-000000000001","type":"note","x":0,"y":0,"width":80,"height":80,"data":{}},
        {"id":"a4113000-0000-4000-8000-000000000001","type":"note","x":100,"y":0,"width":80,"height":80,"data":{}}
      ]'::jsonb)
    );
    RAISE EXCEPTION 'duplicate ids unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    PERFORM public.apply_board_room_state(
      'a4112000-0000-4000-8000-000000000001', 'proposal',
      'a4111000-0000-4000-8000-000000000001',
      jsonb_set(v_base, '{items}', '[
        {"id":"a4113000-0000-4000-8000-000000000002","type":"note","x":0,"y":0,"width":80,"height":80,"data":{}}
      ]'::jsonb)
    );
    RAISE EXCEPTION 'cross-board id unexpectedly succeeded';
  EXCEPTION WHEN integrity_constraint_violation THEN NULL;
  END;

  ASSERT (
    SELECT name = 'Saved atomically'
    FROM public.proposal_boards
    WHERE id = 'a4112000-0000-4000-8000-000000000001'
  ), 'id validation failures must roll back board changes';
END;
$$;

-- Wrong owner metadata and a foreign designer both collapse to unavailable.
DO $$
DECLARE
  v_state jsonb := '{
    "name":"Forbidden","canvasWidth":1200,"canvasHeight":800,
    "backgroundColor":"#FFFFFF","sections":[],"items":[]
  }'::jsonb;
BEGIN
  BEGIN
    PERFORM public.apply_board_room_state(
      'a4112000-0000-4000-8000-000000000001', 'proposal',
      'a4111000-0000-4000-8000-000000000002', v_state
    );
    RAISE EXCEPTION 'wrong owner id unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.apply_board_room_state(
      'a4112000-0000-4000-8000-000000000001', 'studio',
      'a4111000-0000-4000-8000-000000000001', v_state
    );
    RAISE EXCEPTION 'wrong owner kind unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;

SELECT pg_temp.assume_room_actor('a4110000-0000-4000-8000-000000000003');
DO $$
BEGIN
  BEGIN
    PERFORM public.apply_board_room_state(
      'a4112000-0000-4000-8000-000000000001', 'proposal',
      'a4111000-0000-4000-8000-000000000001',
      '{"name":"Foreign","canvasWidth":1200,"canvasHeight":800,"backgroundColor":"#FFFFFF","sections":[],"items":[]}'::jsonb
    );
    RAISE EXCEPTION 'cross-designer write unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;
ROLLBACK;
