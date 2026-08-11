-- Frozen section snapshot, continuation lineage, and client DTO regressions
-- (00407). Run after a fresh reset:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/mood_boards/lineage_and_client_bundle_test.sql

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

-- Source proposal board whose named sections are frozen with activation.
INSERT INTO public.proposal_boards (
  id,
  proposal_id,
  name,
  sections,
  status,
  sort_order
)
VALUES (
  'c4071000-0000-4000-8000-000000000001',
  'b3900000-0000-4000-8000-000000000001',
  'Lineage source board',
  '[
    {"id":"zone-a","name":"Conversation","color":"#AA7755"},
    {"id":"zone-b","name":"Reading"}
  ]'::jsonb,
  'active',
  0
);

INSERT INTO public.proposal_board_items (
  id,
  board_id,
  type,
  image_url,
  content,
  data
)
VALUES (
  'c4071100-0000-4000-8000-000000000001',
  'c4071000-0000-4000-8000-000000000001',
  'image',
  'https://example.invalid/source.webp',
  'Frozen item',
  '{"section_id":"zone-a"}'::jsonb
);

-- Omitting sections exercises the BEFORE trigger used by every activation RPC
-- without redefining the large activation monolith.
INSERT INTO public.project_boards (
  id,
  project_id,
  source_board_id,
  name,
  items,
  sort_order
)
VALUES (
  'c4072000-0000-4000-8000-000000000001',
  'b0000000-0000-0000-0000-0000000000d1',
  'c4071000-0000-4000-8000-000000000001',
  'Frozen lineage board',
  '[{
    "type":"image",
    "x":18,
    "y":22,
    "width":360,
    "height":220,
    "z_index":3,
    "rotation":2,
    "image_url":"https://example.invalid/frozen.webp",
    "content":"Frozen item",
    "data":{"section_id":"zone-a","asset_caption":"Preserved"}
  }]'::jsonb,
  0
);

DO $$
DECLARE
  v_sections jsonb;
BEGIN
  SELECT sections INTO v_sections
  FROM public.project_boards
  WHERE id = 'c4072000-0000-4000-8000-000000000001';

  ASSERT v_sections = '[
    {"id":"zone-a","name":"Conversation","color":"#AA7755"},
    {"id":"zone-b","name":"Reading"}
  ]'::jsonb,
    'project snapshot trigger must freeze source section definitions';

  ASSERT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uq_proposal_boards_source_project_board'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
  ), 'continuation lineage requires a database-enforced unique index';

  BEGIN
    INSERT INTO public.proposal_boards (
      id,
      project_id,
      source_project_board_id,
      name,
      status
    ) VALUES (
      'c4072100-0000-4000-8000-000000000001',
      'b0000000-0000-0000-0000-0000000000d3',
      'c4072000-0000-4000-8000-000000000001',
      'Wrong project lineage',
      'active'
    );
    RAISE EXCEPTION 'cross-project continuation lineage unexpectedly inserted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

END;
$$;

-- An exact design-studio peer can continue the frozen board. Sequential retry
-- proves the API contract; the partial UNIQUE index is the concurrent winner
-- boundary used by ON CONFLICT in the RPC.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_mood_board_actor(
  'a0000000-0000-0000-0000-000000000003'
);

DO $$
DECLARE
  v_first uuid;
  v_retry uuid;
  v_sections jsonb;
  v_item_data jsonb;
BEGIN
  v_first := public.continue_board_in_project(
    'c4072000-0000-4000-8000-000000000001'
  );
  v_retry := public.continue_board_in_project(
    'c4072000-0000-4000-8000-000000000001'
  );

  ASSERT v_first = v_retry,
    'retry must return the canonical continued board id';

  ASSERT (
    SELECT count(*) = 1
    FROM public.proposal_boards
    WHERE source_project_board_id =
      'c4072000-0000-4000-8000-000000000001'
  ), 'one frozen snapshot must materialize at most one live board';

  SELECT board.sections INTO v_sections
  FROM public.proposal_boards AS board
  WHERE board.id = v_first;
  ASSERT v_sections = '[
    {"id":"zone-a","name":"Conversation","color":"#AA7755"},
    {"id":"zone-b","name":"Reading"}
  ]'::jsonb,
    'continued board must use the persisted frozen section snapshot';

  SELECT item.data INTO v_item_data
  FROM public.proposal_board_items AS item
  WHERE item.board_id = v_first;
  ASSERT v_item_data->>'section_id' = 'zone-a'
     AND v_item_data->>'asset_caption' = 'Preserved',
    'continued items must retain section membership and composition data';

  BEGIN
    UPDATE public.proposal_boards
    SET source_project_board_id = NULL
    WHERE id = v_first;
    RAISE EXCEPTION 'continued-board lineage unexpectedly changed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.project_boards
    WHERE id = 'c4072000-0000-4000-8000-000000000001';
    ASSERT NOT FOUND,
      'immutable project-board snapshot unexpectedly deleted';
  EXCEPTION
    WHEN insufficient_privilege OR object_not_in_prerequisite_state THEN NULL;
  END;
END;
$$;

RESET ROLE;

-- Purpose-built sent proposal for the client-safe projection. Build while
-- draft, then cross the lifecycle boundary with triggers disabled so this test
-- does not dispatch notifications externally.
INSERT INTO public.proposals (
  id,
  designer_id,
  client_id,
  designer_client_id,
  title,
  total_amount,
  status,
  client_visibility_tier,
  valid_until
)
SELECT
  'c4073000-0000-4000-8000-000000000001',
  'a0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000005',
  relationship.id,
  'Client board projection fixture',
  0,
  'draft',
  'full',
  now() + interval '30 days'
FROM public.designer_clients AS relationship
WHERE relationship.designer_id =
    'a0000000-0000-0000-0000-000000000004'
  AND relationship.client_id =
    'a0000000-0000-0000-0000-000000000005'
ORDER BY relationship.created_at, relationship.id
LIMIT 1;

INSERT INTO public.proposal_boards (
  id,
  proposal_id,
  name,
  sections,
  status,
  sort_order
)
VALUES (
  'c4073100-0000-4000-8000-000000000001',
  'c4073000-0000-4000-8000-000000000001',
  'Client composition board',
  '[{"id":"client-zone","name":"Client Zone"}]'::jsonb,
  'active',
  0
);

INSERT INTO public.proposal_board_items (
  id,
  board_id,
  type,
  z_index,
  data
)
VALUES (
  'c4073200-0000-4000-8000-000000000001',
  'c4073100-0000-4000-8000-000000000001',
  'image',
  0,
  '{
    "name":"Client-visible item",
    "section_id":"client-zone",
    "vendor_name":"Shown vendor",
    "price_cents":32000,
    "cost_cents":17000,
    "internal_note":"not for the client"
  }'::jsonb
);

SET LOCAL session_replication_role = replica;
UPDATE public.proposals
SET status = 'sent', sent_at = now()
WHERE id = 'c4073000-0000-4000-8000-000000000001';
SET LOCAL session_replication_role = origin;

SELECT pg_temp.assume_mood_board_actor(
  'a0000000-0000-0000-0000-000000000005'
);

DO $$
DECLARE
  v_bundle jsonb;
  v_board jsonb;
  v_data jsonb;
BEGIN
  v_bundle := public.get_client_proposal_bundle(
    'c4073000-0000-4000-8000-000000000001'
  );
  v_board := v_bundle #> '{boards,0}';
  v_data := v_bundle #> '{boards,0,items,0,data}';

  ASSERT v_board->'sections' =
    '[{"id":"client-zone","name":"Client Zone"}]'::jsonb,
    'client proposal bundle must include board section definitions';
  ASSERT v_data->>'section_id' = 'client-zone',
    'client proposal bundle must include item section membership';
  ASSERT v_data->>'vendor_name' = 'Shown vendor'
     AND (v_data->>'price_cents')::integer = 32000,
    'full-visibility bundle must retain its established safe pricing fields';
  ASSERT NOT (v_data ? 'cost_cents')
     AND NOT (v_data ? 'internal_note'),
    'client bundle must keep arbitrary/internal board data outside the DTO';
END;
$$;

ROLLBACK;
