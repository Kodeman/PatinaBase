-- ═══════════════════════════════════════════════════════════════════════════
-- 00730 — need label survives a fill, unit, Rough $, paste batch, build fields
-- (US-21 T-10, SQ-616; CONTRACT §2 row 00730; D2, D3, D12, D13)
--
-- Anchors:
--   _place_product_in_project_v2_00438_impl  00730 §1 (base 00678:1263; the
--     fill's name overwrite 00678:1378)
--   place_product_in_project_v2               00447:190 (public entry)
--   create_named_project_need                 00435:332 (SQL INVOKER wrapper)
--   supersede_project_selection               00661:374
--   batch_create_named_project_needs          00730 §2
--   set_project_ffe_line_build_fields         00730 §3
--   ffe_line_authorization_state              00705:79
--   columns unit / rough_cents / line_kind, thread need_label   00729
--
-- Cases:
--   (1) paste batch: 4 Living Room lines in one call (S1), room scope right
--   (2) paste batch: unassigned scope; replay; all-or-nothing; refusals
--   (3) create: need label from name or needLabel; Rough $ in rough_cents,
--       never budget_max_cents (D12)
--   (4) fill "Hardware, 2 knobs for custom cabinet" with the Emtek knob: the
--       line name takes the product, the thread's need label is unchanged
--       (S3, a6, D2)
--   (5) supersede: the need label survives it too
--   (6) unknown unit / lineKind / roughCents refused, naming the CHECK
--   (7) build fields on an open line
--   (8) locks: a released line refuses quantity and unit, keeps name,
--       needLabel and Rough $ editable; a removed line refuses everything
--   (9) authority and grants
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 -f supabase/tests/ffe/pieces_need_unit_rough_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ── Actors, studio, project, rooms, product ───────────────────────────────
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('73000000-0000-4000-8000-0000000000a1', 'p730-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('73000000-0000-4000-8000-0000000000a2', 'p730-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('73000000-0000-4000-8000-0000000000a3', 'p730-outsider@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('73000000-0000-4000-8000-0000000000a1', 'p730-designer@test.invalid', 'P730 Designer', true, now(), now()),
  ('73000000-0000-4000-8000-0000000000a2', 'p730-client@test.invalid', 'P730 Client', false, now(), now()),
  ('73000000-0000-4000-8000-0000000000a3', 'p730-outsider@test.invalid', 'P730 Outsider', true, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug)
VALUES ('73000000-0000-4000-8000-0000000000f1', 'design_studio', 'P730 Studio', 'p730-studio-test');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('73000000-0000-4000-8000-0000000000e1', '73000000-0000-4000-8000-0000000000a1',
        '73000000-0000-4000-8000-0000000000f1', 'owner', 'active', now());

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status)
VALUES ('73000000-0000-4000-8000-000000000001', 'P730 Whole Home',
        '73000000-0000-4000-8000-0000000000a1', '73000000-0000-4000-8000-0000000000a2',
        '73000000-0000-4000-8000-0000000000a1', '73000000-0000-4000-8000-0000000000f1', 'active');

INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES
  ('73000000-0000-4000-8000-000000000021', '73000000-0000-4000-8000-000000000001', 'Living Room', 0),
  ('73000000-0000-4000-8000-000000000022', '73000000-0000-4000-8000-000000000001', 'Kitchen', 1);

INSERT INTO public.vendors (id, name)
VALUES ('73000000-0000-4000-8000-000000000011', 'Emtek');

INSERT INTO public.products (
  id, name, layer, owner_user_id, captured_at, vendor_id, category, price_retail, price_trade
) VALUES (
  '73000000-0000-4000-8000-000000000031', 'Emtek Ribbon & Reed knob · satin brass', 'personal',
  '73000000-0000-4000-8000-0000000000a1', now(), '73000000-0000-4000-8000-000000000011',
  'Hardware', 3800, 2600
);

CREATE OR REPLACE FUNCTION pg_temp.assume(p_actor uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.need_label(p_item uuid)
RETURNS text LANGUAGE sql AS $$
  SELECT thread.need_label
  FROM public.project_ffe_items item
  JOIN public.project_ffe_selection_threads thread ON thread.id = item.selection_thread_id
  WHERE item.id = p_item;
$$;

-- Runs p_sql and returns 'code|constraint|message' for the error it raised,
-- or NULL when it succeeded.
CREATE OR REPLACE FUNCTION pg_temp.refusal(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_state text; v_constraint text; v_message text;
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_constraint = CONSTRAINT_NAME,
    v_message = MESSAGE_TEXT;
  RETURN v_state || '|' || COALESCE(v_constraint, '') || '|' || v_message;
END;
$$;

CREATE TEMP TABLE t730 (key text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT ALL ON t730 TO PUBLIC;

-- ── (1) Paste batch: four Living Room lines in one call (S1, D13) ──────────
DO $$
DECLARE
  v_result jsonb;
  v_before integer;
  v_ids uuid[];
  v_item public.project_ffe_items%ROWTYPE;
  v_i integer;
  v_names text[] := ARRAY['Sofa', 'Coffee table', 'Area rug', 'Floor lamp'];
BEGIN
  PERFORM pg_temp.assume('73000000-0000-4000-8000-0000000000a1');
  SELECT count(*) INTO v_before FROM public.project_ffe_items
  WHERE project_id = '73000000-0000-4000-8000-000000000001';

  v_result := public.batch_create_named_project_needs(jsonb_build_object(
    'projectId', '73000000-0000-4000-8000-000000000001',
    'roomId', '73000000-0000-4000-8000-000000000021',
    'assignmentScope', 'room',
    'idempotencyKey', 'p730-living-paste',
    'lines', jsonb_build_array(
      jsonb_build_object('name', 'Sofa', 'roughCents', 480000),
      jsonb_build_object('name', 'Coffee table', 'quantity', 1),
      jsonb_build_object('name', 'Area rug', 'quantity', 96, 'unit', 'sq_ft', 'roughCents', 120000),
      jsonb_build_object('name', 'Floor lamp', 'quantity', 2)
    )
  ));

  ASSERT jsonb_typeof(v_result->'selectionIds') = 'array'
     AND jsonb_array_length(v_result->'selectionIds') = 4,
    format('FAIL 1: the batch returns four selectionIds, got %s', v_result);
  ASSERT (SELECT count(*) FROM public.project_ffe_items
          WHERE project_id = '73000000-0000-4000-8000-000000000001') = v_before + 4,
    'FAIL 1: one call writes exactly four lines';

  SELECT array_agg(value::uuid ORDER BY ordinality) INTO v_ids
  FROM jsonb_array_elements_text(v_result->'selectionIds') WITH ORDINALITY;
  FOR v_i IN 1..4 LOOP
    SELECT * INTO v_item FROM public.project_ffe_items WHERE id = v_ids[v_i];
    ASSERT v_item.name = v_names[v_i],
      format('FAIL 1: line %s keeps paste order, got %L', v_i, v_item.name);
    ASSERT v_item.project_room_id = '73000000-0000-4000-8000-000000000021'
       AND v_item.assignment_scope = 'room',
      format('FAIL 1: line %s is filed in Living Room with room scope', v_i);
    ASSERT v_item.product_id IS NULL AND v_item.item_type = 'tbd' AND v_item.line_kind = 'goods'
       AND v_item.design_disposition = 'candidate',
      format('FAIL 1: line %s is a goods placeholder', v_i);
    ASSERT pg_temp.need_label(v_item.id) = v_names[v_i],
      format('FAIL 1: line %s thread need label is its name, got %L', v_i, pg_temp.need_label(v_item.id));
    ASSERT v_item.budget_max_cents IS NULL AND v_item.budget_min_cents IS NULL,
      format('FAIL 1: line %s carries no allowance', v_i);
  END LOOP;

  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = v_ids[3];
  ASSERT v_item.unit = 'sq_ft' AND v_item.quantity = 96 AND v_item.rough_cents = 120000,
    format('FAIL 1: the rug keeps 96 sq_ft and its Rough $, got %s %s %s',
           v_item.quantity, v_item.unit, v_item.rough_cents);
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = v_ids[4];
  ASSERT v_item.unit = 'each' AND v_item.quantity = 2 AND v_item.rough_cents IS NULL,
    'FAIL 1: an omitted unit is each and an omitted Rough $ is null';

  INSERT INTO t730 VALUES ('sofa', v_ids[1]);
END $$;

-- ── (2) Paste batch: unassigned scope, replay, all-or-nothing, refusals ─────
DO $$
DECLARE
  v_request jsonb := jsonb_build_object(
    'projectId', '73000000-0000-4000-8000-000000000001',
    'roomId', NULL,
    'assignmentScope', 'unassigned',
    'idempotencyKey', 'p730-unassigned-paste',
    'lines', jsonb_build_array(
      jsonb_build_object('name', 'Hall runner'),
      jsonb_build_object('name', 'Mudroom bench', 'unit', 'lot')));
  v_first jsonb;
  v_again jsonb;
  v_before integer;
  v_err text;
  v_lines jsonb := '[]'::jsonb;
  v_i integer;
BEGIN
  PERFORM pg_temp.assume('73000000-0000-4000-8000-0000000000a1');
  v_first := public.batch_create_named_project_needs(v_request);
  ASSERT (SELECT bool_and(item.project_room_id IS NULL AND item.assignment_scope = 'unassigned')
          FROM public.project_ffe_items item
          WHERE item.id IN (SELECT value::uuid FROM jsonb_array_elements_text(v_first->'selectionIds'))),
    'FAIL 2: a "Not in a room yet" paste files unassigned with no room';

  SELECT count(*) INTO v_before FROM public.project_ffe_items
  WHERE project_id = '73000000-0000-4000-8000-000000000001';
  v_again := public.batch_create_named_project_needs(v_request);
  ASSERT v_again = v_first, format('FAIL 2: a replay returns the same ids, got %s vs %s', v_again, v_first);
  ASSERT (SELECT count(*) FROM public.project_ffe_items
          WHERE project_id = '73000000-0000-4000-8000-000000000001') = v_before,
    'FAIL 2: a replay writes nothing';

  -- All or nothing: the third line's unit is refused, so the first two vanish.
  v_err := pg_temp.refusal(format('SELECT public.batch_create_named_project_needs(%L::jsonb)',
    jsonb_build_object(
      'projectId', '73000000-0000-4000-8000-000000000001',
      'roomId', '73000000-0000-4000-8000-000000000022', 'assignmentScope', 'room',
      'idempotencyKey', 'p730-partial-paste',
      'lines', jsonb_build_array(
        jsonb_build_object('name', 'Kitchen stool'),
        jsonb_build_object('name', 'Pendant'),
        jsonb_build_object('name', 'Paint', 'unit', 'gallon')))::text));
  ASSERT v_err LIKE '23514|project_ffe_items_unit_check|unit must be one of%',
    format('FAIL 2: a bad unit refuses the whole batch, got %L', v_err);
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_ffe_items
                     WHERE project_room_id = '73000000-0000-4000-8000-000000000022'),
    'FAIL 2: a refused batch leaves no line behind';

  -- An allowance key never rides in on a paste (D12).
  v_err := pg_temp.refusal(format('SELECT public.batch_create_named_project_needs(%L::jsonb)',
    jsonb_build_object(
      'projectId', '73000000-0000-4000-8000-000000000001', 'assignmentScope', 'unassigned',
      'idempotencyKey', 'p730-allowance-paste',
      'lines', jsonb_build_array(jsonb_build_object('name', 'Sconce', 'budgetMaxCents', 50000)))::text));
  ASSERT v_err LIKE '23514||line 1 takes only name, quantity, unit and roughCents',
    format('FAIL 2: a line key outside the allow-list is refused, got %L', v_err);

  FOR v_i IN 1..101 LOOP
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('name', 'Line ' || v_i));
  END LOOP;
  v_err := pg_temp.refusal(format('SELECT public.batch_create_named_project_needs(%L::jsonb)',
    jsonb_build_object(
      'projectId', '73000000-0000-4000-8000-000000000001', 'assignmentScope', 'unassigned',
      'idempotencyKey', 'p730-too-many', 'lines', v_lines)::text));
  ASSERT v_err = '23514||lines must be an array of 1 to 100 entries',
    format('FAIL 2: 101 lines are refused, got %L', v_err);

  v_err := pg_temp.refusal(format('SELECT public.batch_create_named_project_needs(%L::jsonb)',
    jsonb_build_object(
      'projectId', '73000000-0000-4000-8000-000000000001', 'assignmentScope', 'unassigned',
      'idempotencyKey', 'p730-blank-name',
      'lines', jsonb_build_array(jsonb_build_object('name', '  ')))::text));
  ASSERT v_err = '23514||manual selections and placeholders require a name',
    format('FAIL 2: a blank pasted name is refused, got %L', v_err);
END $$;

-- ── (3) Create: need label and Rough $ (D2, D12) ──────────────────────────
DO $$
DECLARE
  v_result jsonb;
  v_item public.project_ffe_items%ROWTYPE;
BEGIN
  PERFORM pg_temp.assume('73000000-0000-4000-8000-0000000000a1');
  v_result := public.create_named_project_need(jsonb_build_object(
    'projectId', '73000000-0000-4000-8000-000000000001',
    'assignmentScope', 'unassigned',
    'name', 'Hardware, 2 knobs for custom cabinet',
    'quantity', 2,
    'idempotencyKey', 'p730-knobs'));
  ASSERT v_result->>'outcome' = 'created', format('FAIL 3: the knobs need is created, got %s', v_result);
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = (v_result->>'selectionId')::uuid;
  ASSERT pg_temp.need_label(v_item.id) = 'Hardware, 2 knobs for custom cabinet',
    'FAIL 3: with no needLabel the thread takes the line name';
  ASSERT v_item.unit = 'each' AND v_item.line_kind = 'goods' AND v_item.rough_cents IS NULL,
    'FAIL 3: defaults are each, goods, no Rough $';
  INSERT INTO t730 VALUES ('knobs', v_item.id);

  v_result := public.create_named_project_need(jsonb_build_object(
    'projectId', '73000000-0000-4000-8000-000000000001',
    'roomId', '73000000-0000-4000-8000-000000000021', 'assignmentScope', 'room',
    'name', 'Sectional', 'needLabel', 'Sofa, living room',
    'roughCents', 480000, 'unit', 'each', 'lineKind', 'goods',
    'idempotencyKey', 'p730-sectional'));
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = (v_result->>'selectionId')::uuid;
  ASSERT v_item.name = 'Sectional' AND pg_temp.need_label(v_item.id) = 'Sofa, living room',
    'FAIL 3: needLabel names the thread while the line keeps its own name';
  ASSERT v_item.rough_cents = 480000,
    format('FAIL 3: Rough $ is stored in rough_cents, got %s', v_item.rough_cents);
  ASSERT v_item.budget_max_cents IS NULL AND v_item.budget_min_cents IS NULL
     AND v_item.item_type = 'tbd',
    format('FAIL 3: Rough $ is never an allowance (budget_max %s, item_type %s)',
           v_item.budget_max_cents, v_item.item_type);
  INSERT INTO t730 VALUES ('sectional', v_item.id);
END $$;

-- ── (4) Fill: the need label survives (S3, a6, D2) ────────────────────────
DO $$
DECLARE
  v_knobs uuid := (SELECT id FROM t730 WHERE key = 'knobs');
  v_thread uuid;
  v_result jsonb;
  v_item public.project_ffe_items%ROWTYPE;
BEGIN
  PERFORM pg_temp.assume('73000000-0000-4000-8000-0000000000a1');
  SELECT selection_thread_id INTO v_thread FROM public.project_ffe_items WHERE id = v_knobs;
  v_result := public.place_product_in_project_v2(jsonb_build_object(
    'projectId', '73000000-0000-4000-8000-000000000001',
    'productId', '73000000-0000-4000-8000-000000000031',
    'placeholderSelectionId', v_knobs,
    'assignmentScope', 'unassigned',
    'idempotencyKey', 'p730-knobs-fill'));
  ASSERT v_result->>'outcome' = 'filled', format('FAIL 4: the knob fills the line, got %s', v_result);
  ASSERT (v_result->>'selectionId')::uuid = v_knobs, 'FAIL 4: the fill keeps the line id';

  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = v_knobs;
  ASSERT v_item.name = 'Emtek Ribbon & Reed knob · satin brass',
    format('FAIL 4: the line name takes the product name, got %L', v_item.name);
  ASSERT v_item.product_id = '73000000-0000-4000-8000-000000000031' AND v_item.selection_thread_id = v_thread,
    'FAIL 4: the line carries the product on the same thread';
  ASSERT v_item.line_total_cents = 7600,
    format('FAIL 4: 2 knobs at $38 is $76, got %s', v_item.line_total_cents);
  ASSERT pg_temp.need_label(v_knobs) = 'Hardware, 2 knobs for custom cabinet',
    format('FAIL 4: the thread''s need label is unchanged by the fill, got %L', pg_temp.need_label(v_knobs));
END $$;

-- ── (5) Supersede: the need label survives it too ──────────────────────────
DO $$
DECLARE
  v_knobs uuid := (SELECT id FROM t730 WHERE key = 'knobs');
  v_result jsonb;
  v_new public.project_ffe_items%ROWTYPE;
BEGIN
  PERFORM pg_temp.assume('73000000-0000-4000-8000-0000000000a1');
  v_result := public.supersede_project_selection(jsonb_build_object(
    'selectionId', v_knobs, 'name', 'Emtek knob, polished nickel'));
  SELECT * INTO v_new FROM public.project_ffe_items WHERE id = (v_result->>'selectionId')::uuid;
  ASSERT v_new.id <> v_knobs AND v_new.supersedes_ffe_item_id = v_knobs,
    'FAIL 5: supersede mints the successor';
  ASSERT v_new.name = 'Emtek knob, polished nickel',
    'FAIL 5: the successor carries its own name';
  ASSERT pg_temp.need_label(v_new.id) = 'Hardware, 2 knobs for custom cabinet',
    format('FAIL 5: the need label survives a supersede, got %L', pg_temp.need_label(v_new.id));
  INSERT INTO t730 VALUES ('knobs2', v_new.id);
END $$;

-- ── (6) Unknown values are refused, naming the CHECK ───────────────────────
DO $$
DECLARE
  v_err text;
  v_base jsonb := jsonb_build_object(
    'projectId', '73000000-0000-4000-8000-000000000001', 'assignmentScope', 'unassigned',
    'name', 'Probe');
BEGIN
  PERFORM pg_temp.assume('73000000-0000-4000-8000-0000000000a1');
  v_err := pg_temp.refusal(format('SELECT public.create_named_project_need(%L::jsonb)',
    (v_base || jsonb_build_object('unit', 'gallon', 'idempotencyKey', 'p730-unit'))::text));
  ASSERT v_err = '23514|project_ffe_items_unit_check|unit must be one of each, sq_ft, lin_ft, roll, yard, box, hour, lot',
    format('FAIL 6: an unknown unit is refused by name, got %L', v_err);

  v_err := pg_temp.refusal(format('SELECT public.create_named_project_need(%L::jsonb)',
    (v_base || jsonb_build_object('lineKind', 'labor', 'idempotencyKey', 'p730-kind'))::text));
  ASSERT v_err = '23514|project_ffe_items_line_kind_check|lineKind must be goods; a labor line is added with add_labor_line',
    format('FAIL 6: labor never enters through the create path, got %L', v_err);

  v_err := pg_temp.refusal(format('SELECT public.create_named_project_need(%L::jsonb)',
    (v_base || jsonb_build_object('roughCents', -5, 'idempotencyKey', 'p730-rough'))::text));
  ASSERT v_err = '23514|project_ffe_items_rough_cents_check|roughCents must be a whole number of cents, 0 or more',
    format('FAIL 6: a negative Rough $ is refused, got %L', v_err);

  v_err := pg_temp.refusal(format('SELECT public.create_named_project_need(%L::jsonb)',
    (v_base || jsonb_build_object('roughCents', 12.5, 'idempotencyKey', 'p730-rough-frac'))::text));
  ASSERT v_err LIKE '23514|project_ffe_items_rough_cents_check|%',
    format('FAIL 6: a fractional Rough $ is refused, got %L', v_err);

  -- The column CHECK from 00729 still backs the RPC.
  v_err := pg_temp.refusal($sql$
    UPDATE public.project_ffe_items SET unit = 'gallon'
    WHERE id = (SELECT id FROM t730 WHERE key = 'sectional')$sql$);
  ASSERT v_err LIKE '23514|project_ffe_items_unit_check|%',
    format('FAIL 6: the unit column CHECK holds, got %L', v_err);
END $$;

-- ── (7) Build fields on an open line ──────────────────────────────────────
DO $$
DECLARE
  v_id uuid := (SELECT id FROM t730 WHERE key = 'knobs2');
  v_item public.project_ffe_items%ROWTYPE;
  v_err text;
BEGIN
  PERFORM pg_temp.assume('73000000-0000-4000-8000-0000000000a1');
  v_item := public.set_project_ffe_line_build_fields(v_id, jsonb_build_object(
    'name', 'Emtek knob, polished nickel, 4 pack', 'needLabel', 'Hardware, cabinet knobs',
    'quantity', 4, 'unit', 'box', 'roughCents', 15000));
  ASSERT v_item.name = 'Emtek knob, polished nickel, 4 pack' AND v_item.quantity = 4
     AND v_item.unit = 'box' AND v_item.rough_cents = 15000,
    format('FAIL 7: every build field is written, got %s/%s/%s/%s',
           v_item.name, v_item.quantity, v_item.unit, v_item.rough_cents);
  ASSERT v_item.line_total_cents = 4 * v_item.unit_price_cents,
    format('FAIL 7: the line total follows the quantity, got %s', v_item.line_total_cents);
  ASSERT v_item.budget_max_cents IS NULL,
    'FAIL 7: Rough $ never writes budget_max_cents';
  ASSERT pg_temp.need_label(v_id) = 'Hardware, cabinet knobs',
    'FAIL 7: needLabel writes the thread';

  v_item := public.set_project_ffe_line_build_fields(v_id, '{"roughCents": null}'::jsonb);
  ASSERT v_item.rough_cents IS NULL AND v_item.quantity = 4 AND v_item.unit = 'box',
    'FAIL 7: roughCents null clears it and leaves the rest';

  v_err := pg_temp.refusal(format('SELECT public.set_project_ffe_line_build_fields(%L, %L::jsonb)',
    v_id, '{"budgetMaxCents": 5000}'));
  ASSERT v_err = '23514||set_project_ffe_line_build_fields: only name, needLabel, quantity, unit and roughCents can be set here',
    format('FAIL 7: an allowance key is refused, got %L', v_err);
  v_err := pg_temp.refusal(format('SELECT public.set_project_ffe_line_build_fields(%L, %L::jsonb)',
    v_id, '{"quantity": 0}'));
  ASSERT v_err = '23514||quantity must be a positive whole number',
    format('FAIL 7: quantity 0 is refused, got %L', v_err);
  v_err := pg_temp.refusal(format('SELECT public.set_project_ffe_line_build_fields(%L, %L::jsonb)',
    v_id, '{"unit": "gallon"}'));
  ASSERT v_err LIKE '23514|project_ffe_items_unit_check|%',
    format('FAIL 7: an unknown unit is refused, got %L', v_err);
  v_err := pg_temp.refusal(format('SELECT public.set_project_ffe_line_build_fields(%L, %L::jsonb)',
    v_id, '{"needLabel": "  "}'));
  ASSERT v_err = '23514||needLabel cannot be blank',
    format('FAIL 7: a blank needLabel is refused, got %L', v_err);
END $$;

-- ── (8) Locks: released, on a PO, removed ─────────────────────────────────
-- A sent authorization over the sectional (released), a PO over the sofa.
INSERT INTO public.proposals (id, project_id, designer_id, title, status, document_kind, commercial_state, total_amount, subtotal)
VALUES ('73000000-0000-4000-8000-000000000041', '73000000-0000-4000-8000-000000000001',
        '73000000-0000-4000-8000-0000000000a1', 'P730 Authorization No. 1', 'sent',
        'furnishings_authorization', 'sent', 0, 0);
INSERT INTO public.project_commercial_documents (id, project_id, proposal_id, document_kind, wave_name, is_origin, bound_at, created_by)
VALUES ('73000000-0000-4000-8000-000000000042', '73000000-0000-4000-8000-000000000001',
        '73000000-0000-4000-8000-000000000041', 'furnishings_authorization', 'Authorization No. 1',
        false, now(), '73000000-0000-4000-8000-0000000000a1');
INSERT INTO public.furnishing_authorization_items (id, commercial_document_id, source_ffe_item_id, name, quantity, client_unit_price_cents, client_line_total_cents)
VALUES ('73000000-0000-4000-8000-000000000043', '73000000-0000-4000-8000-000000000042',
        (SELECT id FROM t730 WHERE key = 'sectional'), 'Sectional', 1, 0, 0);

INSERT INTO public.purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, created_by)
VALUES ('73000000-0000-4000-8000-000000000051', '73000000-0000-4000-8000-0000000000a1',
        '73000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000011',
        'net_30', 0, 'draft', '73000000-0000-4000-8000-0000000000a1');
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
UPDATE public.project_ffe_items SET purchase_order_id = '73000000-0000-4000-8000-000000000051'
WHERE id = (SELECT id FROM t730 WHERE key = 'sofa');

DO $$
DECLARE
  v_sectional uuid := (SELECT id FROM t730 WHERE key = 'sectional');
  v_sofa uuid := (SELECT id FROM t730 WHERE key = 'sofa');
  v_item public.project_ffe_items%ROWTYPE;
  v_err text;
  v_released constant text := '23514||This line is released. Quantity and unit change through Record a change.';
BEGIN
  PERFORM pg_temp.assume('73000000-0000-4000-8000-0000000000a1');
  ASSERT public.ffe_line_authorization_state(v_sectional) = 'sent', 'FAIL 8: fixture is released';

  v_err := pg_temp.refusal(format('SELECT public.set_project_ffe_line_build_fields(%L, %L::jsonb)',
    v_sectional, '{"quantity": 2}'));
  ASSERT v_err = v_released, format('FAIL 8: a released line refuses quantity, got %L', v_err);
  v_err := pg_temp.refusal(format('SELECT public.set_project_ffe_line_build_fields(%L, %L::jsonb)',
    v_sectional, '{"unit": "lot"}'));
  ASSERT v_err = v_released, format('FAIL 8: a released line refuses unit, got %L', v_err);
  v_err := pg_temp.refusal(format('SELECT public.set_project_ffe_line_build_fields(%L, %L::jsonb)',
    v_sofa, '{"quantity": 3}'));
  ASSERT v_err = v_released, format('FAIL 8: a line on a PO refuses quantity, got %L', v_err);
  v_err := pg_temp.refusal(format('SELECT public.set_project_ffe_line_build_fields(%L, %L::jsonb)',
    v_sofa, '{"unit": "lot"}'));
  ASSERT v_err = v_released, format('FAIL 8: a line on a PO refuses unit, got %L', v_err);

  v_item := public.set_project_ffe_line_build_fields(v_sectional, jsonb_build_object(
    'name', 'Sectional, performance velvet', 'needLabel', 'Sofa, living room, deep',
    'roughCents', 520000, 'quantity', 1, 'unit', 'each'));
  ASSERT v_item.name = 'Sectional, performance velvet' AND v_item.rough_cents = 520000
     AND v_item.quantity = 1 AND v_item.unit = 'each',
    'FAIL 8: name and Rough $ stay editable on a released line (unchanged quantity/unit pass)';
  ASSERT pg_temp.need_label(v_sectional) = 'Sofa, living room, deep',
    'FAIL 8: needLabel stays editable on a released line';
  ASSERT v_item.budget_max_cents IS NULL, 'FAIL 8: Rough $ never writes budget_max_cents';

  -- A removed line refuses everything.
  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.project_ffe_items
  SET removed_at = now(), removed_by = '73000000-0000-4000-8000-0000000000a1',
      removal_reason = 'p730 removed', design_disposition = 'not_selected'
  WHERE id = (SELECT id FROM t730 WHERE key = 'knobs2');
  v_err := pg_temp.refusal(format('SELECT public.set_project_ffe_line_build_fields(%L, %L::jsonb)',
    (SELECT id FROM t730 WHERE key = 'knobs2'), '{"name": "Back again"}'));
  ASSERT v_err = '23514||set_project_ffe_line_build_fields: line was removed',
    format('FAIL 8: a removed line is refused, got %L', v_err);
END $$;

-- ── (9) Authority and grants ──────────────────────────────────────────────
DO $$
DECLARE v_err text;
BEGIN
  PERFORM pg_temp.assume('73000000-0000-4000-8000-0000000000a3');
  v_err := pg_temp.refusal(format('SELECT public.batch_create_named_project_needs(%L::jsonb)',
    jsonb_build_object('projectId', '73000000-0000-4000-8000-000000000001',
      'assignmentScope', 'unassigned', 'idempotencyKey', 'p730-outsider',
      'lines', jsonb_build_array(jsonb_build_object('name', 'Intruder')))::text));
  ASSERT v_err = '42501||project not found or access denied',
    format('FAIL 9: an outsider cannot paste lines, got %L', v_err);
  v_err := pg_temp.refusal(format('SELECT public.set_project_ffe_line_build_fields(%L, %L::jsonb)',
    (SELECT id FROM t730 WHERE key = 'sectional'), '{"roughCents": 1}'));
  ASSERT v_err = '42501||project not found or access denied',
    format('FAIL 9: an outsider cannot set build fields, got %L', v_err);

  PERFORM pg_temp.assume('73000000-0000-4000-8000-0000000000a2');
  v_err := pg_temp.refusal(format('SELECT public.set_project_ffe_line_build_fields(%L, %L::jsonb)',
    (SELECT id FROM t730 WHERE key = 'sectional'), '{"roughCents": 1}'));
  ASSERT v_err = '42501||project not found or access denied',
    format('FAIL 9: the client cannot set build fields, got %L', v_err);

  ASSERT has_function_privilege('authenticated', 'public.batch_create_named_project_needs(jsonb)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.batch_create_named_project_needs(jsonb)', 'EXECUTE'),
    'FAIL 9: batch_create_named_project_needs is authenticated-only';
  ASSERT has_function_privilege('authenticated', 'public.set_project_ffe_line_build_fields(uuid,jsonb)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.set_project_ffe_line_build_fields(uuid,jsonb)', 'EXECUTE'),
    'FAIL 9: set_project_ffe_line_build_fields is authenticated-only';
  ASSERT NOT has_function_privilege('authenticated', 'public._place_product_in_project_v2_00438_impl(jsonb)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public._place_product_in_project_v2_00438_impl(jsonb)', 'EXECUTE'),
    'FAIL 9: the rewritten impl keeps its revoked ACL';
END $$;

-- The batch runs for a real authenticated caller, not only as postgres.
SELECT pg_temp.assume('73000000-0000-4000-8000-0000000000a1');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.batch_create_named_project_needs(jsonb_build_object(
    'projectId', '73000000-0000-4000-8000-000000000001',
    'roomId', '73000000-0000-4000-8000-000000000021', 'assignmentScope', 'room',
    'idempotencyKey', 'p730-as-authenticated',
    'lines', jsonb_build_array(jsonb_build_object('name', 'Side table', 'roughCents', 90000))));
  ASSERT jsonb_array_length(v_result->'selectionIds') = 1,
    'FAIL 9: an authenticated studio member pastes through the RPC';
  INSERT INTO t730 VALUES ('side', (v_result->'selectionIds'->>0)::uuid);
  PERFORM public.set_project_ffe_line_build_fields((v_result->'selectionIds'->>0)::uuid,
    '{"quantity": 2, "unit": "each"}'::jsonb);
END $$;
RESET ROLE;

DO $$
BEGIN
  ASSERT (SELECT quantity FROM public.project_ffe_items WHERE id = (SELECT id FROM t730 WHERE key = 'side')) = 2,
    'FAIL 9: the authenticated build-fields write landed';
END $$;

ROLLBACK;
