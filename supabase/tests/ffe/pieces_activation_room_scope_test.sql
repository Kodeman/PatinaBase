-- ═══════════════════════════════════════════════════════════════════════════
-- US-21 T-60h — Activating a proposal with pieces in rooms goes through, and a
-- merged palette keeps its order (migration 00763; SQ-706; from the T-60f
-- walk, SQ-704, QA.md F17/F18)
--
-- Anchors: guard_project_ffe_selection_integrity (00438:266, raise at :298);
-- _activate_proposal_as_project_impl (00762:53 → 00763);
-- _apply_client_decision_authorized (00666:570 → 00763);
-- set_line_placements (00734 lineage); project_palettes_one_per_room (00760).
--
-- Designer D (own studio) activates a legacy proposal for client C.
--
-- Named cases, each one DO block:
--   f18_activation   the accepted proposal has a sofa in Living and a rug in
--                    no room. Activation goes through (before 00763: 23514
--                    'non-room assignment cannot carry a room'). The sofa is
--                    'room' in the new Living with no placement row, and D
--                    can place it in Living (one placement row); the rug is
--                    'unassigned' with no room
--   f18_decision     a non-blocking client decision with a room feeds a
--                    'room' line in that room (before 00763: 23514); one with
--                    no room feeds an 'unassigned' line; an existing
--                    'unassigned' decision line moves to 'room' when its
--                    decision names a room
--   f17_swatches     three palettes in Living (Walls 2 swatches, Trim 1,
--                    Ceiling 1) merge into one row whose swatches run
--                    sort_order 0..3 in palette order
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 -f supabase/tests/ffe/pieces_activation_room_scope_test.sql
--
-- One transaction, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('76300000-0000-4000-8000-0000000000a2', 't60h-client@test.invalid',     '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- C
  ('76300000-0000-4000-8000-0000000000a3', 't60h-designer-d@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'); -- D

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('76300000-0000-4000-8000-0000000000a2', 't60h-client@test.invalid',     'T60h Client',     false, now(), now()),
  ('76300000-0000-4000-8000-0000000000a3', 't60h-designer-d@test.invalid', 'T60h Designer D', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

-- 00511: an activating designer holds a designer-domain role, which
-- provisions D's own studio (00295).
INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT '76300000-0000-4000-8000-0000000000a3', role.id, '76300000-0000-4000-8000-0000000000a3'
FROM public.roles AS role WHERE role.name = 'studio_owner';

INSERT INTO public.designer_clients (id, designer_id, client_id, status)
VALUES ('76300000-0000-4000-8000-000000000601', '76300000-0000-4000-8000-0000000000a3',
        '76300000-0000-4000-8000-0000000000a2', 'proposal');

INSERT INTO public.proposals (id, designer_id, client_id, designer_client_id, title, status, total_amount)
VALUES ('76300000-0000-4000-8000-000000000611', '76300000-0000-4000-8000-0000000000a3',
        '76300000-0000-4000-8000-0000000000a2', '76300000-0000-4000-8000-000000000601',
        'T60h Rooms Proposal', 'draft', 0);

INSERT INTO public.proposal_scope_rooms (id, proposal_id, name, sort_order)
VALUES ('76300000-0000-4000-8000-000000000621', '76300000-0000-4000-8000-000000000611', 'Living', 0);

-- One piece in Living, one in no room.
INSERT INTO public.proposal_items (
  id, proposal_id, scope_room_id, name, quantity,
  unit_price, unit_sell_price, line_total_cents, position
) VALUES
  ('76300000-0000-4000-8000-000000000641', '76300000-0000-4000-8000-000000000611',
   '76300000-0000-4000-8000-000000000621', 'T60h Sofa', 2, 100000, 150000, 300000, 0),
  ('76300000-0000-4000-8000-000000000642', '76300000-0000-4000-8000-000000000611',
   NULL, 'T60h Rug', 1, 40000, 60000, 60000, 1);

-- Three palettes in Living: Walls (two swatches), Trim, Ceiling. Each
-- palette's swatches start at sort_order 0.
INSERT INTO public.proposal_palettes (id, proposal_id, name, scope_room_id, is_primary, sort_order)
VALUES
  ('76300000-0000-4000-8000-000000000631', '76300000-0000-4000-8000-000000000611', 'Walls',
   '76300000-0000-4000-8000-000000000621', true,  0),
  ('76300000-0000-4000-8000-000000000632', '76300000-0000-4000-8000-000000000611', 'Trim',
   '76300000-0000-4000-8000-000000000621', false, 1),
  ('76300000-0000-4000-8000-000000000633', '76300000-0000-4000-8000-000000000611', 'Ceiling',
   '76300000-0000-4000-8000-000000000621', false, 2);

INSERT INTO public.palette_swatches (palette_id, hex, name, sort_order)
VALUES
  ('76300000-0000-4000-8000-000000000631', '#F2EEE6', 'Wall white',    0),
  ('76300000-0000-4000-8000-000000000631', '#D9D2C5', 'Wall greige',   1),
  ('76300000-0000-4000-8000-000000000632', '#FFFFFF', 'Trim white',    0),
  ('76300000-0000-4000-8000-000000000633', '#FAFAF7', 'Ceiling white', 0);

SELECT set_config('app.proposal_accept_id', '76300000-0000-4000-8000-000000000611', true);
UPDATE public.proposals SET status = 'accepted' WHERE id = '76300000-0000-4000-8000-000000000611';
SELECT set_config('app.proposal_accept_id', '', true);

CREATE OR REPLACE FUNCTION pg_temp.assume(p_actor uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

-- D activates through the public RPC. Before 00763 this raised 23514
-- 'non-room assignment cannot carry a room' on the sofa.
SELECT pg_temp.assume('76300000-0000-4000-8000-0000000000a3');
SET LOCAL ROLE authenticated;
SELECT public.activate_proposal_as_project('76300000-0000-4000-8000-000000000611'::uuid) IS NOT NULL
  AS t60h_activated;
RESET ROLE;

-- ─── f18_activation ────────────────────────────────────────────────────────

DO $f18_activation$
DECLARE
  v_project_id uuid;
  v_living_id  uuid;
  v_sofa       public.project_ffe_items%ROWTYPE;
  v_rug        public.project_ffe_items%ROWTYPE;
  v_rows       integer;
  v_placed     jsonb;
BEGIN
  SELECT project_id INTO v_project_id FROM public.proposals
  WHERE id = '76300000-0000-4000-8000-000000000611';
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'f18_activation: activation must create the project';
  END IF;

  SELECT id INTO v_living_id FROM public.project_rooms
  WHERE project_id = v_project_id
    AND source_scope_room_id = '76300000-0000-4000-8000-000000000621';
  IF v_living_id IS NULL THEN
    RAISE EXCEPTION 'f18_activation: Living must be carried to the project';
  END IF;

  SELECT * INTO v_sofa FROM public.project_ffe_items
  WHERE project_id = v_project_id
    AND source_proposal_item_id = '76300000-0000-4000-8000-000000000641';
  IF v_sofa.id IS NULL
     OR v_sofa.assignment_scope IS DISTINCT FROM 'room'
     OR v_sofa.project_room_id IS DISTINCT FROM v_living_id THEN
    RAISE EXCEPTION 'f18_activation: the sofa must be a room line in Living, got scope % room %',
      v_sofa.assignment_scope, v_sofa.project_room_id;
  END IF;

  SELECT * INTO v_rug FROM public.project_ffe_items
  WHERE project_id = v_project_id
    AND source_proposal_item_id = '76300000-0000-4000-8000-000000000642';
  IF v_rug.id IS NULL
     OR v_rug.assignment_scope IS DISTINCT FROM 'unassigned'
     OR v_rug.project_room_id IS NOT NULL THEN
    RAISE EXCEPTION 'f18_activation: the rug must be unassigned with no room, got scope % room %',
      v_rug.assignment_scope, v_rug.project_room_id;
  END IF;

  -- A line in one room is its primary room alone: no placement row (00734).
  SELECT count(*) INTO v_rows FROM public.project_ffe_placements
  WHERE ffe_item_id IN (v_sofa.id, v_rug.id);
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'f18_activation: activation writes no placement rows, got %', v_rows;
  END IF;

  -- D can place the activated sofa in its room: one placement row, Living.
  PERFORM pg_temp.assume('76300000-0000-4000-8000-0000000000a3');
  SET LOCAL ROLE authenticated;
  v_placed := public.set_line_placements(v_sofa.id,
    jsonb_build_array(jsonb_build_object('roomId', v_living_id, 'quantity', 2)));
  RESET ROLE;

  SELECT count(*) INTO v_rows FROM public.project_ffe_placements
  WHERE ffe_item_id = v_sofa.id AND project_room_id = v_living_id AND quantity = 2;
  IF v_rows <> 1 OR jsonb_array_length(v_placed -> 'placements') <> 1 THEN
    RAISE EXCEPTION 'f18_activation: the sofa must hold one Living placement, got % (%)', v_rows, v_placed;
  END IF;

  SELECT * INTO v_sofa FROM public.project_ffe_items WHERE id = v_sofa.id;
  IF v_sofa.assignment_scope IS DISTINCT FROM 'room' OR v_sofa.project_room_id IS DISTINCT FROM v_living_id THEN
    RAISE EXCEPTION 'f18_activation: placing keeps the sofa in Living';
  END IF;

  RAISE NOTICE 'f18_activation: ok';
END
$f18_activation$;

-- ─── f18_decision ──────────────────────────────────────────────────────────

-- A studio-layer product (00152 products_studio_requires_metadata) and three
-- non-blocking decisions on the activated project, applied as the runtime
-- would (owner-only impl, as postgres; d7_review_fixes_test does the same).
INSERT INTO public.organizations (id, type, name, slug)
VALUES ('76300000-0000-4000-8000-0000000000f1', 'design_studio', 'T60h Catalog Studio', 't60h-catalog-studio-test');

INSERT INTO public.products (
  id, name, captured_at, layer, studio_id,
  vendor_contact, lead_time_weeks, payment_terms, category, usage_notes
) VALUES ('76300000-0000-4000-8000-000000000021', 'T60h Side table', now(), 'studio', '76300000-0000-4000-8000-0000000000f1',
          '{}'::jsonb, 6, 'net_30', 'tables', 'test');

DO $f18_decision$
DECLARE
  v_project_id uuid;
  v_living_id  uuid;
  v_line       public.project_ffe_items%ROWTYPE;
BEGIN
  SELECT project_id INTO v_project_id FROM public.proposals
  WHERE id = '76300000-0000-4000-8000-000000000611';
  SELECT id INTO v_living_id FROM public.project_rooms
  WHERE project_id = v_project_id
    AND source_scope_room_id = '76300000-0000-4000-8000-000000000621';

  -- 701 names Living; 702 names no room; 703 names Living and already has an
  -- unassigned line.
  INSERT INTO public.client_decisions (id, designer_client_id, designer_id, project_id, title, room_id, sent_at)
  VALUES
    ('76300000-0000-4000-8000-000000000701', '76300000-0000-4000-8000-000000000601',
     '76300000-0000-4000-8000-0000000000a3', v_project_id, 'T60h Living side table', v_living_id, now()),
    ('76300000-0000-4000-8000-000000000702', '76300000-0000-4000-8000-000000000601',
     '76300000-0000-4000-8000-0000000000a3', v_project_id, 'T60h Spare side table', NULL, now()),
    ('76300000-0000-4000-8000-000000000703', '76300000-0000-4000-8000-000000000601',
     '76300000-0000-4000-8000-0000000000a3', v_project_id, 'T60h Moved side table', v_living_id, now());

  INSERT INTO public.client_decision_options (id, decision_id, name, price, quantity, product_id, selected, sort_order)
  VALUES
    ('76300000-0000-4000-8000-000000000711', '76300000-0000-4000-8000-000000000701',
     'T60h Side table', 50000, 1, '76300000-0000-4000-8000-000000000021', false, 0),
    ('76300000-0000-4000-8000-000000000712', '76300000-0000-4000-8000-000000000702',
     'T60h Side table', 50000, 1, '76300000-0000-4000-8000-000000000021', false, 0),
    ('76300000-0000-4000-8000-000000000713', '76300000-0000-4000-8000-000000000703',
     'T60h Side table', 50000, 1, '76300000-0000-4000-8000-000000000021', false, 0);

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  INSERT INTO public.project_ffe_items (project_id, name, source_decision_id, assignment_scope, unit_price_cents, line_total_cents)
  VALUES (v_project_id, 'T60h decision slot', '76300000-0000-4000-8000-000000000703', 'unassigned', 0, 0);
  PERFORM set_config('app.ffe_mutation_rpc', '', true);

  -- Before 00763 this raised 23514 'non-room assignment cannot carry a room'.
  PERFORM public._apply_client_decision_authorized(
    '76300000-0000-4000-8000-000000000701', '76300000-0000-4000-8000-000000000711',
    '76300000-0000-4000-8000-0000000000a2');
  SELECT * INTO v_line FROM public.project_ffe_items
  WHERE source_decision_id = '76300000-0000-4000-8000-000000000701';
  IF v_line.id IS NULL
     OR v_line.assignment_scope IS DISTINCT FROM 'room'
     OR v_line.project_room_id IS DISTINCT FROM v_living_id THEN
    RAISE EXCEPTION 'f18_decision: a decision in Living must feed a room line in Living, got scope % room %',
      v_line.assignment_scope, v_line.project_room_id;
  END IF;

  PERFORM public._apply_client_decision_authorized(
    '76300000-0000-4000-8000-000000000702', '76300000-0000-4000-8000-000000000712',
    '76300000-0000-4000-8000-0000000000a2');
  SELECT * INTO v_line FROM public.project_ffe_items
  WHERE source_decision_id = '76300000-0000-4000-8000-000000000702';
  IF v_line.id IS NULL
     OR v_line.assignment_scope IS DISTINCT FROM 'unassigned'
     OR v_line.project_room_id IS NOT NULL THEN
    RAISE EXCEPTION 'f18_decision: a decision with no room must feed an unassigned line, got scope % room %',
      v_line.assignment_scope, v_line.project_room_id;
  END IF;

  -- Before 00763 the UPDATE raised 23514 the same way.
  PERFORM public._apply_client_decision_authorized(
    '76300000-0000-4000-8000-000000000703', '76300000-0000-4000-8000-000000000713',
    '76300000-0000-4000-8000-0000000000a2');
  SELECT * INTO v_line FROM public.project_ffe_items
  WHERE source_decision_id = '76300000-0000-4000-8000-000000000703';
  IF v_line.assignment_scope IS DISTINCT FROM 'room'
     OR v_line.project_room_id IS DISTINCT FROM v_living_id
     OR v_line.name IS DISTINCT FROM 'T60h Side table' THEN
    RAISE EXCEPTION 'f18_decision: the existing line must move to Living as a room line, got scope % room % name %',
      v_line.assignment_scope, v_line.project_room_id, v_line.name;
  END IF;

  RAISE NOTICE 'f18_decision: ok';
END
$f18_decision$;

-- ─── f17_swatches ──────────────────────────────────────────────────────────

DO $f17_swatches$
DECLARE
  v_project_id uuid;
  v_row        public.project_palettes%ROWTYPE;
  v_by_array   text;
  v_by_sort    text;
  v_sorts      text;
BEGIN
  SELECT project_id INTO v_project_id FROM public.proposals
  WHERE id = '76300000-0000-4000-8000-000000000611';

  SELECT palette.* INTO v_row
  FROM public.project_palettes palette
  JOIN public.project_rooms room ON room.id = palette.scope_room_id
  WHERE palette.project_id = v_project_id AND room.name = 'Living';
  IF v_row.id IS NULL OR v_row.name IS DISTINCT FROM 'Walls · Trim · Ceiling' THEN
    RAISE EXCEPTION 'f17_swatches: Living must hold the three merged palettes, got %', v_row.name;
  END IF;

  SELECT string_agg(s.swatch ->> 'name', ',' ORDER BY s.ordinality),
         string_agg(s.swatch ->> 'sort_order', ',' ORDER BY s.ordinality)
  INTO v_by_array, v_sorts
  FROM jsonb_array_elements(v_row.swatches) WITH ORDINALITY AS s(swatch, ordinality);

  -- The Finishes lens orders by sort_order: it must read the palettes in order.
  SELECT string_agg(s.swatch ->> 'name', ',' ORDER BY (s.swatch ->> 'sort_order')::integer, s.ordinality)
  INTO v_by_sort
  FROM jsonb_array_elements(v_row.swatches) WITH ORDINALITY AS s(swatch, ordinality);

  IF v_by_array IS DISTINCT FROM 'Wall white,Wall greige,Trim white,Ceiling white'
     OR v_sorts IS DISTINCT FROM '0,1,2,3'
     OR v_by_sort IS DISTINCT FROM v_by_array THEN
    RAISE EXCEPTION 'f17_swatches: merged swatches must run 0..3 in palette order, got [%] sort [%] by sort [%]',
      v_by_array, v_sorts, v_by_sort;
  END IF;

  RAISE NOTICE 'f17_swatches: ok';
END
$f17_swatches$;

ROLLBACK;
