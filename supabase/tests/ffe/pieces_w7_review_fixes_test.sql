-- ═══════════════════════════════════════════════════════════════════════════
-- US-21 T-61a — W7 review fixes in SQL (migration 00762; SQ-697; from the
-- T-61 review, SQ-667)
--
-- Anchors: _activate_proposal_as_project_impl (00331:520, renamed 00390:807;
-- palette INSERT now ON CONFLICT, 00762); project_palettes_one_per_room
-- (00760); guard_project_room_handbacks_append_only (00755:392, 00762);
-- project_ffe_allowance_fills.filled_by (00752:57); record_project_ffe_
-- receipt_batch (00758:407, 00762); _product_on_a_schedule_line (00753:53,
-- 00762); guard_products_referenced_delete (00758:363);
-- project_palettes_room_same_project (00761:31).
--
-- Studio A: owner O, client C, actor X (hands back a room, fills an
-- allowance; nothing else names X). Studio B: owner B. Designer D (own
-- studio) activates the palette proposal for client C.
--
-- Named cases, each one DO block:
--   f8_activation   a proposal with two palettes in Living and one with no
--                   room activates; Living has one project_palettes row with
--                   both palettes' swatches in order, both names and notes;
--                   the no-room palette keeps its own row
--   f13_actor_fk    deleting X's auth user (and so X's profile) keeps the
--                   hand-back and the fill with a NULL actor; a normal
--                   UPDATE and a DELETE of the hand-back are still refused
--   f5_receipts     B and C get 42501, with or without photo ids (the photo
--                   check no longer runs first); O records a batch by room
--   f12_oracle      B asks about A's referenced product: false; O: true;
--                   A's unreferenced product: false; DELETE as service_role
--                   is still refused; the palette trigger has a search_path
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 -f supabase/tests/ffe/pieces_w7_review_fixes_test.sql
--
-- One transaction, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('76200000-0000-4000-8000-0000000000a1', 't61a-owner@test.invalid',   '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- O
  ('76200000-0000-4000-8000-0000000000a2', 't61a-client@test.invalid',  '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- C
  ('76200000-0000-4000-8000-0000000000a5', 't61a-owner-b@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- B
  ('76200000-0000-4000-8000-0000000000a9', 't61a-actor@test.invalid',   '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'); -- X

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('76200000-0000-4000-8000-0000000000a1', 't61a-owner@test.invalid',   'T61a Owner',   true,  now(), now()),
  ('76200000-0000-4000-8000-0000000000a2', 't61a-client@test.invalid',  'T61a Client',  false, now(), now()),
  ('76200000-0000-4000-8000-0000000000a5', 't61a-owner-b@test.invalid', 'T61a Owner B', true,  now(), now()),
  ('76200000-0000-4000-8000-0000000000a9', 't61a-actor@test.invalid',   'T61a Actor',   false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug)
VALUES
  ('76200000-0000-4000-8000-0000000000f1', 'design_studio', 'T61a Studio A', 't61a-studio-a-test'),
  ('76200000-0000-4000-8000-0000000000f2', 'design_studio', 'T61a Studio B', 't61a-studio-b-test');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('76200000-0000-4000-8000-0000000000e1', '76200000-0000-4000-8000-0000000000a1', '76200000-0000-4000-8000-0000000000f1', 'owner', 'active', now()),
  ('76200000-0000-4000-8000-0000000000e5', '76200000-0000-4000-8000-0000000000a5', '76200000-0000-4000-8000-0000000000f2', 'owner', 'active', now());

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status)
VALUES ('76200000-0000-4000-8000-000000000001', 'T61a Whole Home',
        '76200000-0000-4000-8000-0000000000a1', '76200000-0000-4000-8000-0000000000a2',
        '76200000-0000-4000-8000-0000000000a1', '76200000-0000-4000-8000-0000000000f1', 'active');

INSERT INTO public.project_rooms (id, project_id, name, sort_order) VALUES
  ('76200000-0000-4000-8000-000000000031', '76200000-0000-4000-8000-000000000001', 'Living', 0),
  ('76200000-0000-4000-8000-000000000032', '76200000-0000-4000-8000-000000000001', 'Dining', 1);

INSERT INTO public.vendors (id, name)
VALUES ('76200000-0000-4000-8000-000000000011', 'T61a Workroom');

-- Studio-layer products (00152 products_studio_requires_metadata):
-- K is on a line; U is on none.
INSERT INTO public.products (
  id, name, captured_at, layer, studio_id,
  vendor_contact, lead_time_weeks, payment_terms, category, usage_notes
) VALUES
  ('76200000-0000-4000-8000-000000000021', 'T61a Lounge chair', now(), 'studio', '76200000-0000-4000-8000-0000000000f1',
   '{}'::jsonb, 6, 'net_30', 'seating', 'test'),
  ('76200000-0000-4000-8000-000000000022', 'T61a Stool',        now(), 'studio', '76200000-0000-4000-8000-0000000000f1',
   '{}'::jsonb, 6, 'net_30', 'seating', 'test');

-- Lines (fixture writes, as postgres):
--   201 allowance, signed on Authorization No. 1   → F13 (the fill)
--   202 lounge chair on K                          → F12
--   203 oak floor, 5 sq ft, on a confirmed PO      → F5
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, item_type, product_id, vendor_id, vendor_name, quantity, unit,
  unit_price_cents, line_total_cents, budget_min_cents, budget_max_cents, design_disposition,
  assignment_scope, project_room_id, sort_order
) VALUES
  ('76200000-0000-4000-8000-000000000201', '76200000-0000-4000-8000-000000000001', 'Hall sconces',
   'approved', 'allowance', NULL, '76200000-0000-4000-8000-000000000011', 'T61a Workroom', 2, 'each',
   0, 0, 0, 90000, 'selected', 'unassigned', NULL, 0),
  ('76200000-0000-4000-8000-000000000202', '76200000-0000-4000-8000-000000000001', 'Lounge chair',
   'specified', 'fixed', '76200000-0000-4000-8000-000000000021', '76200000-0000-4000-8000-000000000011', 'T61a Workroom', 1, 'each',
   120000, 120000, NULL, NULL, 'selected', 'room', '76200000-0000-4000-8000-000000000031', 1),
  ('76200000-0000-4000-8000-000000000203', '76200000-0000-4000-8000-000000000001', 'Oak floor',
   'specified', 'fixed', NULL, '76200000-0000-4000-8000-000000000011', 'T61a Workroom', 5, 'sq_ft',
   1150, 5750, NULL, NULL, 'selected', 'unassigned', NULL, 2);

INSERT INTO public.proposals (id, project_id, designer_id, title, status, document_kind, commercial_state, total_amount, subtotal)
VALUES ('76200000-0000-4000-8000-000000000411', '76200000-0000-4000-8000-000000000001', '76200000-0000-4000-8000-0000000000a1',
        'T61a Authorization No. 1', 'accepted', 'furnishings_authorization', 'executed', 90000, 90000);
INSERT INTO public.project_commercial_documents (id, project_id, proposal_id, document_kind, wave_name, is_origin, bound_at, executed_at, created_by)
VALUES ('76200000-0000-4000-8000-000000000412', '76200000-0000-4000-8000-000000000001', '76200000-0000-4000-8000-000000000411',
        'furnishings_authorization', 'Authorization No. 1', false, now(), now(), '76200000-0000-4000-8000-0000000000a1');
INSERT INTO public.furnishing_authorization_items (
  id, commercial_document_id, source_ffe_item_id, name, room_name, category, item_type,
  quantity, client_unit_price_cents, client_line_total_cents, vendor_id, vendor_name, sort_order
) VALUES ('76200000-0000-4000-8000-000000000421', '76200000-0000-4000-8000-000000000412', '76200000-0000-4000-8000-000000000201',
          'Hall sconces', 'Throughout', 'lighting', 'allowance', 2, 45000, 90000,
          '76200000-0000-4000-8000-000000000011', 'T61a Workroom', 0);
SELECT set_config('app.ffe_mutation_rpc', '', true);

-- X's two records, as the RPCs would write them.
INSERT INTO public.project_room_handbacks (id, project_id, project_room_id, handed_back_by)
VALUES ('76200000-0000-4000-8000-000000000501', '76200000-0000-4000-8000-000000000001',
        '76200000-0000-4000-8000-000000000031', '76200000-0000-4000-8000-0000000000a9');
INSERT INTO public.project_ffe_allowance_fills (
  id, ffe_item_id, authorization_item_id, ceiling_cents, filled_cents, variance_cents, filled_by
) VALUES ('76200000-0000-4000-8000-000000000502', '76200000-0000-4000-8000-000000000201',
          '76200000-0000-4000-8000-000000000421', 90000, 60000, 30000, '76200000-0000-4000-8000-0000000000a9');

CREATE OR REPLACE FUNCTION pg_temp.assume(p_actor uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

-- Runs p_sql and returns 'code|message' for the error it raised, or NULL.
CREATE OR REPLACE FUNCTION pg_temp.refusal(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_state text; v_message text;
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
  RETURN v_state || '|' || v_message;
END;
$$;

-- ─── f8_activation ─────────────────────────────────────────────────────────

-- D activates through the public RPC. 00511: an activating designer holds a
-- designer-domain role, which provisions D's own studio (00295).
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('76200000-0000-4000-8000-0000000000a3', 't61a-designer-d@test.invalid', '', now(), now(), now(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES ('76200000-0000-4000-8000-0000000000a3', 't61a-designer-d@test.invalid', 'T61a Designer D', now(), now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT '76200000-0000-4000-8000-0000000000a3', role.id, '76200000-0000-4000-8000-0000000000a3'
FROM public.roles AS role WHERE role.name = 'studio_owner';

INSERT INTO public.designer_clients (id, designer_id, client_id, status)
VALUES ('76200000-0000-4000-8000-000000000601', '76200000-0000-4000-8000-0000000000a3',
        '76200000-0000-4000-8000-0000000000a2', 'proposal');

INSERT INTO public.proposals (id, designer_id, client_id, designer_client_id, title, status, total_amount)
VALUES ('76200000-0000-4000-8000-000000000611', '76200000-0000-4000-8000-0000000000a3',
        '76200000-0000-4000-8000-0000000000a2', '76200000-0000-4000-8000-000000000601',
        'T61a Palette Proposal', 'draft', 0);

INSERT INTO public.proposal_scope_rooms (id, proposal_id, name, sort_order)
VALUES ('76200000-0000-4000-8000-000000000621', '76200000-0000-4000-8000-000000000611', 'Living', 0);

-- Two palettes in Living (Walls first, then Trim) and one with no room.
INSERT INTO public.proposal_palettes (id, proposal_id, name, scope_room_id, is_primary, notes, sort_order)
VALUES
  ('76200000-0000-4000-8000-000000000631', '76200000-0000-4000-8000-000000000611', 'Walls',
   '76200000-0000-4000-8000-000000000621', true,  'Eggshell throughout', 0),
  ('76200000-0000-4000-8000-000000000632', '76200000-0000-4000-8000-000000000611', 'Trim',
   '76200000-0000-4000-8000-000000000621', false, 'Semi-gloss', 1),
  ('76200000-0000-4000-8000-000000000633', '76200000-0000-4000-8000-000000000611', 'House',
   NULL, false, NULL, 2);

INSERT INTO public.palette_swatches (palette_id, hex, name, sort_order)
VALUES
  ('76200000-0000-4000-8000-000000000631', '#F2EEE6', 'Wall white', 0),
  ('76200000-0000-4000-8000-000000000631', '#D9D2C5', 'Wall greige', 1),
  ('76200000-0000-4000-8000-000000000632', '#FFFFFF', 'Trim white', 0),
  ('76200000-0000-4000-8000-000000000633', '#333333', 'Door black', 0);

SELECT set_config('app.proposal_accept_id', '76200000-0000-4000-8000-000000000611', true);
UPDATE public.proposals SET status = 'accepted' WHERE id = '76200000-0000-4000-8000-000000000611';
SELECT set_config('app.proposal_accept_id', '', true);

-- Before 00762 this raised 23505 on project_palettes_one_per_room.
SELECT pg_temp.assume('76200000-0000-4000-8000-0000000000a3');
SET LOCAL ROLE authenticated;
SELECT public.activate_proposal_as_project('76200000-0000-4000-8000-000000000611'::uuid) IS NOT NULL
  AS t61a_activated;
RESET ROLE;

DO $f8_activation$
DECLARE
  v_project_id uuid;
  v_rows       integer;
  v_row        public.project_palettes%ROWTYPE;
  v_hexes      text;
BEGIN
  SELECT project_id INTO v_project_id FROM public.proposals
  WHERE id = '76200000-0000-4000-8000-000000000611';
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'f8_activation: activation must create the project';
  END IF;

  SELECT count(*) INTO v_rows
  FROM public.project_palettes palette
  JOIN public.project_rooms room ON room.id = palette.scope_room_id
  WHERE palette.project_id = v_project_id AND room.name = 'Living';
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'f8_activation: Living must have exactly one palette row, got %', v_rows;
  END IF;

  SELECT palette.* INTO v_row
  FROM public.project_palettes palette
  JOIN public.project_rooms room ON room.id = palette.scope_room_id
  WHERE palette.project_id = v_project_id AND room.name = 'Living';

  SELECT string_agg(swatch ->> 'hex', ',' ORDER BY ordinality) INTO v_hexes
  FROM jsonb_array_elements(v_row.swatches) WITH ORDINALITY AS s(swatch, ordinality);
  IF v_hexes IS DISTINCT FROM '#F2EEE6,#D9D2C5,#FFFFFF' THEN
    RAISE EXCEPTION 'f8_activation: Living must hold both palettes'' swatches in order, got %', v_hexes;
  END IF;

  IF v_row.source_palette_id <> '76200000-0000-4000-8000-000000000631'
     OR v_row.name IS DISTINCT FROM 'Walls · Trim'
     OR v_row.notes IS DISTINCT FROM E'Eggshell throughout\n\nSemi-gloss'
     OR NOT v_row.is_primary THEN
    RAISE EXCEPTION 'f8_activation: the first palette is the room''s row with both names and notes, got %',
      to_jsonb(v_row) - 'swatches';
  END IF;

  SELECT count(*) INTO v_rows
  FROM public.project_palettes
  WHERE project_id = v_project_id AND scope_room_id IS NULL
    AND source_palette_id = '76200000-0000-4000-8000-000000000633'
    AND swatches -> 0 ->> 'hex' = '#333333';
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'f8_activation: the no-room palette must keep its own row, got %', v_rows;
  END IF;

  SELECT count(*) INTO v_rows FROM public.project_palettes WHERE project_id = v_project_id;
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'f8_activation: the project must have 2 palette rows (Living, no room), got %', v_rows;
  END IF;

  RAISE NOTICE 'f8_activation: ok';
END
$f8_activation$;

-- ─── f13_actor_fk ──────────────────────────────────────────────────────────

DO $f13_actor_fk$
DECLARE
  v_handback public.project_room_handbacks%ROWTYPE;
  v_fill     public.project_ffe_allowance_fills%ROWTYPE;
  v_err      text;
BEGIN
  -- Deleting the auth user cascades to the profile (profiles_id_fkey).
  DELETE FROM auth.users WHERE id = '76200000-0000-4000-8000-0000000000a9';
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = '76200000-0000-4000-8000-0000000000a9') THEN
    RAISE EXCEPTION 'f13_actor_fk: the profile must be gone';
  END IF;

  SELECT * INTO v_handback FROM public.project_room_handbacks
  WHERE id = '76200000-0000-4000-8000-000000000501';
  IF NOT FOUND OR v_handback.handed_back_by IS NOT NULL
     OR v_handback.project_room_id <> '76200000-0000-4000-8000-000000000031' THEN
    RAISE EXCEPTION 'f13_actor_fk: the hand-back must survive with a NULL actor, got %', to_jsonb(v_handback);
  END IF;

  SELECT * INTO v_fill FROM public.project_ffe_allowance_fills
  WHERE id = '76200000-0000-4000-8000-000000000502';
  IF NOT FOUND OR v_fill.filled_by IS NOT NULL OR v_fill.filled_cents <> 60000 THEN
    RAISE EXCEPTION 'f13_actor_fk: the fill must survive with a NULL actor, got %', to_jsonb(v_fill);
  END IF;

  -- Every other UPDATE or DELETE of a hand-back is still refused.
  v_err := pg_temp.refusal($sql$
    UPDATE public.project_room_handbacks SET handed_back_at = handed_back_at - interval '1 day'
    WHERE id = '76200000-0000-4000-8000-000000000501'$sql$);
  IF v_err IS NULL OR split_part(v_err, '|', 1) <> '23514' THEN
    RAISE EXCEPTION 'f13_actor_fk: a normal UPDATE must be refused with 23514, got %', v_err;
  END IF;

  v_err := pg_temp.refusal($sql$
    UPDATE public.project_room_handbacks SET handed_back_by = '76200000-0000-4000-8000-0000000000a1'
    WHERE id = '76200000-0000-4000-8000-000000000501'$sql$);
  IF v_err IS NULL OR split_part(v_err, '|', 1) <> '23514' THEN
    RAISE EXCEPTION 'f13_actor_fk: setting the actor back must be refused with 23514, got %', v_err;
  END IF;

  v_err := pg_temp.refusal($sql$
    DELETE FROM public.project_room_handbacks WHERE id = '76200000-0000-4000-8000-000000000501'$sql$);
  IF v_err IS NULL OR split_part(v_err, '|', 1) <> '23514' THEN
    RAISE EXCEPTION 'f13_actor_fk: a DELETE must be refused with 23514, got %', v_err;
  END IF;

  -- Nulling the actor and changing another column in one UPDATE is refused.
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
  VALUES ('76200000-0000-4000-8000-0000000000a8', 't61a-actor-2@test.invalid', '', now(), now(), now(),
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
  VALUES ('76200000-0000-4000-8000-0000000000a8', 't61a-actor-2@test.invalid', 'T61a Actor 2', now(), now())
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.project_room_handbacks (id, project_id, project_room_id, handed_back_by)
  VALUES ('76200000-0000-4000-8000-000000000503', '76200000-0000-4000-8000-000000000001',
          '76200000-0000-4000-8000-000000000032', '76200000-0000-4000-8000-0000000000a8');
  v_err := pg_temp.refusal($sql$
    UPDATE public.project_room_handbacks
       SET handed_back_by = NULL, project_room_id = '76200000-0000-4000-8000-000000000031'
     WHERE id = '76200000-0000-4000-8000-000000000503'$sql$);
  IF v_err IS NULL OR split_part(v_err, '|', 1) <> '23514' THEN
    RAISE EXCEPTION 'f13_actor_fk: nulling the actor with another change must be refused, got %', v_err;
  END IF;

  RAISE NOTICE 'f13_actor_fk: ok';
END
$f13_actor_fk$;

-- ─── f5_receipts ───────────────────────────────────────────────────────────

DO $f5_setup$
BEGIN
  PERFORM pg_temp.assume('76200000-0000-4000-8000-0000000000a1');
  PERFORM public.set_line_placements('76200000-0000-4000-8000-000000000203', '[
    {"roomId":"76200000-0000-4000-8000-000000000031","quantity":2},
    {"roomId":"76200000-0000-4000-8000-000000000032","quantity":3}
  ]'::jsonb);
END
$f5_setup$;

INSERT INTO public.purchase_orders (
  id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, is_patina_catalog
) VALUES (
  '76200000-0000-4000-8000-000000000701', '76200000-0000-4000-8000-0000000000a1',
  '76200000-0000-4000-8000-000000000001', '76200000-0000-4000-8000-000000000011',
  'net_30', 5750, 'confirmed', false
);

UPDATE public.project_ffe_items
SET purchase_order_id = '76200000-0000-4000-8000-000000000701', status = 'ordered'
WHERE id = '76200000-0000-4000-8000-000000000203';

DO $f5_receipts$
DECLARE
  v_err      text;
  v_actor    uuid;
  v_photos   text;
  v_result   jsonb;
  v_living   uuid;
  v_dining   uuid;
  v_received jsonb;
BEGIN
  SELECT id INTO v_living FROM public.project_ffe_placements
  WHERE ffe_item_id = '76200000-0000-4000-8000-000000000203'
    AND project_room_id = '76200000-0000-4000-8000-000000000031';
  SELECT id INTO v_dining FROM public.project_ffe_placements
  WHERE ffe_item_id = '76200000-0000-4000-8000-000000000203'
    AND project_room_id = '76200000-0000-4000-8000-000000000032';

  -- B (another studio) and C (the client), each without and with photo ids.
  -- Before 00762 the photo check ran first and answered 23000 to a photo id.
  FOREACH v_actor IN ARRAY ARRAY['76200000-0000-4000-8000-0000000000a5',
                                 '76200000-0000-4000-8000-0000000000a2']::uuid[] LOOP
    FOREACH v_photos IN ARRAY ARRAY['{}', '{76200000-0000-4000-8000-000000000799}'] LOOP
      PERFORM pg_temp.assume(v_actor);
      v_err := pg_temp.refusal(format(
        'SELECT public.record_project_ffe_receipt_batch(%L, %L::jsonb, %L, NULL, %L::uuid[])',
        '76200000-0000-4000-8000-000000000701',
        '[{"selectionId":"76200000-0000-4000-8000-000000000203","receivedQuantity":5}]',
        'clean', v_photos));
      IF v_err IS NULL OR split_part(v_err, '|', 1) <> '42501' THEN
        RAISE EXCEPTION 'f5_receipts: % with photos % must get 42501, got %', v_actor, v_photos, v_err;
      END IF;
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.project_ffe_placement_receipts
             WHERE placement_id IN (v_living, v_dining)) THEN
    RAISE EXCEPTION 'f5_receipts: a refused batch must record nothing';
  END IF;

  -- O records all 5, named by room: Living 2, Dining 3.
  PERFORM pg_temp.assume('76200000-0000-4000-8000-0000000000a1');
  v_result := public.record_project_ffe_receipt_batch(
    '76200000-0000-4000-8000-000000000701',
    jsonb_build_array(jsonb_build_object(
      'selectionId', '76200000-0000-4000-8000-000000000203',
      'receivedQuantity', 5,
      'placements', jsonb_build_array(
        jsonb_build_object('placementId', v_living, 'quantity', 2),
        jsonb_build_object('placementId', v_dining, 'quantity', 3)))),
    'clean');
  IF v_result IS NULL OR NOT (v_result ? 'inspectionId') THEN
    RAISE EXCEPTION 'f5_receipts: the studio batch must record, got %', v_result;
  END IF;

  SELECT jsonb_object_agg(receipt.placement_id::text, receipt.quantity) INTO v_received
  FROM public.project_ffe_placement_receipts receipt
  WHERE receipt.placement_id IN (v_living, v_dining);
  IF v_received IS DISTINCT FROM jsonb_build_object(v_living::text, 2, v_dining::text, 3) THEN
    RAISE EXCEPTION 'f5_receipts: receipts must be Living 2, Dining 3, got %', v_received;
  END IF;
  IF (SELECT received_quantity FROM public.project_ffe_items
      WHERE id = '76200000-0000-4000-8000-000000000203') <> 5 THEN
    RAISE EXCEPTION 'f5_receipts: received_quantity must be 5';
  END IF;

  RAISE NOTICE 'f5_receipts: ok';
END
$f5_receipts$;

-- ─── f12_oracle ────────────────────────────────────────────────────────────

DO $f12_oracle$
BEGIN
  PERFORM pg_temp.assume('76200000-0000-4000-8000-0000000000a5');
  IF public._product_on_a_schedule_line('76200000-0000-4000-8000-000000000021') THEN
    RAISE EXCEPTION 'f12_oracle: studio B must get false for studio A''s referenced product';
  END IF;

  PERFORM pg_temp.assume('76200000-0000-4000-8000-0000000000a1');
  IF NOT public._product_on_a_schedule_line('76200000-0000-4000-8000-000000000021') THEN
    RAISE EXCEPTION 'f12_oracle: studio A must get true for its referenced product';
  END IF;
  IF public._product_on_a_schedule_line('76200000-0000-4000-8000-000000000022') THEN
    RAISE EXCEPTION 'f12_oracle: studio A must get false for its unreferenced product';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public._product_on_a_schedule_line(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'f12_oracle: authenticated must keep EXECUTE (products_studio_delete calls it)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.project_palettes_room_same_project()'::regprocedure
      AND proconfig @> ARRAY['search_path=public, pg_temp']
  ) THEN
    RAISE EXCEPTION 'f12_oracle: project_palettes_room_same_project must set search_path, got %',
      (SELECT proconfig FROM pg_proc WHERE oid = 'public.project_palettes_room_same_project()'::regprocedure);
  END IF;

  RAISE NOTICE 'f12_oracle: ok';
END
$f12_oracle$;

-- The delete guard binds the service role.
DO $f12_service_delete$
DECLARE
  v_err text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  SET LOCAL ROLE service_role;
  BEGIN
    DELETE FROM public.products WHERE id = '76200000-0000-4000-8000-000000000021';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLSTATE || '|' || SQLERRM;
  END;
  RESET ROLE;

  IF v_err IS NULL OR split_part(v_err, '|', 1) <> '23514' THEN
    RAISE EXCEPTION 'f12_oracle: DELETE as service_role must be refused with 23514, got %', v_err;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = '76200000-0000-4000-8000-000000000021') THEN
    RAISE EXCEPTION 'f12_oracle: the referenced product must still exist';
  END IF;
  RAISE NOTICE 'f12_service_delete: ok';
END
$f12_service_delete$;

DO $done$ BEGIN RAISE NOTICE 'pieces_w7_review_fixes_test: all cases passed'; END $done$;

ROLLBACK;
