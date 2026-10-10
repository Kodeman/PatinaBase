-- ═══════════════════════════════════════════════════════════════════════════
-- 00750 — a supersede carries the designer's work
-- (US-21 T-44, SQ-650; CONTRACT §2 row 00750; D9; T-21 review F3)
--
-- Anchors:
--   supersede_project_selection   00750 (base 00661:374)
--   spec_book_attach_ffe_line     seeds the successor's spec row (00694)
--   add_labor_line                00737 §4
--   set_line_placements           00737 §6 (table 00734)
--
-- Cases:
--   (1) a piece replaced by another product: line notes, unit, Rough $, the
--       designer-authored spec fields and both room placements carry; the
--       product-seeded finish and colour come from the new product; the
--       active labor and COM children are re-parented, the removed
--       accessory stays; the need label is untouched (S3, R1-F19/F20)
--   (2) a labor line superseded: still labor, still linked to its piece,
--       with its unit and Rough $ (F3); a product replacement is refused
--   (3) a COM child superseded: still a COM child of its piece
--   (4) the piece superseded again: the superseded labor stays with the
--       predecessor; its active successor and the COM successor move
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 -f supabase/tests/ffe/pieces_supersede_carries_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ── Actors, studio, project, rooms, vendor, products ──────────────────────
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('75000000-0000-4000-8000-0000000000a1', 'p750-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('75000000-0000-4000-8000-0000000000a2', 'p750-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('75000000-0000-4000-8000-0000000000a1', 'p750-designer@test.invalid', 'P750 Designer', true, now(), now()),
  ('75000000-0000-4000-8000-0000000000a2', 'p750-client@test.invalid', 'P750 Client', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug)
VALUES ('75000000-0000-4000-8000-0000000000f1', 'design_studio', 'P750 Studio', 'p750-studio-test');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('75000000-0000-4000-8000-0000000000e1', '75000000-0000-4000-8000-0000000000a1',
        '75000000-0000-4000-8000-0000000000f1', 'owner', 'active', now());

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status)
VALUES ('75000000-0000-4000-8000-000000000001', 'P750 Whole Home',
        '75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-0000000000a2',
        '75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-0000000000f1', 'active');

INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES
  ('75000000-0000-4000-8000-000000000021', '75000000-0000-4000-8000-000000000001', 'Living Room', 0),
  ('75000000-0000-4000-8000-000000000022', '75000000-0000-4000-8000-000000000001', 'Dining', 1);

INSERT INTO public.vendors (id, name)
VALUES ('75000000-0000-4000-8000-000000000011', 'P750 Workroom');

-- Product A is the chair first chosen; product B replaces it.
INSERT INTO public.products (
  id, name, layer, owner_user_id, captured_at, vendor_id, category, price_retail, price_trade,
  finish, materials, colors
) VALUES
  ('75000000-0000-4000-8000-000000000031', 'P750 Lounge chair A', 'personal',
   '75000000-0000-4000-8000-0000000000a1', now(), '75000000-0000-4000-8000-000000000011',
   'Seating', 240000, 180000, 'Walnut', ARRAY['Boucle'], ARRAY['Ivory']),
  ('75000000-0000-4000-8000-000000000032', 'P750 Lounge chair B', 'personal',
   '75000000-0000-4000-8000-0000000000a1', now(), '75000000-0000-4000-8000-000000000011',
   'Seating', 260000, 190000, 'Oak', ARRAY['Leather'], ARRAY['Cognac']);

-- The piece: 2 lounge chairs, one in the Living Room, one in Dining.
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, product_id, name, status, quantity, unit, rough_cents, notes,
  unit_price_cents, line_total_cents, vendor_id, vendor_name, assignment_scope,
  project_room_id, design_disposition
) VALUES (
  '75000000-0000-4000-8000-000000000101', '75000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000031', 'P750 Lounge chair A', 'specified', 2, 'each', 480000,
  'Tight back, no skirt', 240000, 480000, '75000000-0000-4000-8000-000000000011', 'P750 Workroom',
  'room', '75000000-0000-4000-8000-000000000021', 'selected'
);

-- Its children: a COM seat fabric (active) and an accessory removed earlier.
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, quantity, unit, rough_cents, unit_price_cents, line_total_cents,
  vendor_id, vendor_name, assignment_scope, project_room_id, design_disposition,
  parent_ffe_item_id, link_kind, removed_at, removed_by, removal_reason, removed_disposition
) VALUES
  ('75000000-0000-4000-8000-000000000111', '75000000-0000-4000-8000-000000000001', 'Seat fabric',
   'specified', 4, 'yard', 36000, 9000, 36000, '75000000-0000-4000-8000-000000000011', 'P750 Workroom',
   'room', '75000000-0000-4000-8000-000000000021', 'selected',
   '75000000-0000-4000-8000-000000000101', 'com', NULL, NULL, NULL, NULL),
  ('75000000-0000-4000-8000-000000000112', '75000000-0000-4000-8000-000000000001', 'Ottoman',
   'specified', 1, 'each', NULL, 50000, 50000, '75000000-0000-4000-8000-000000000011', 'P750 Workroom',
   'room', '75000000-0000-4000-8000-000000000021', 'not_selected',
   '75000000-0000-4000-8000-000000000101', 'accessory', now() - interval '1 hour',
   '75000000-0000-4000-8000-0000000000a1', 'not needed', 'candidate');
SELECT set_config('app.ffe_mutation_rpc', '', true);

-- The need label the studio wrote for the chair.
UPDATE public.project_ffe_selection_threads thread SET need_label = 'Lounge chairs, by the fire'
FROM public.project_ffe_items item
WHERE item.id = '75000000-0000-4000-8000-000000000101' AND thread.id = item.selection_thread_id;

-- The designer's spec work on the chair. finish and colour stay as seeded from
-- product A (product_master); material is the designer's own; location,
-- notes and media are designer-authored.
UPDATE public.project_ffe_specs SET
  material = 'Belgian linen',
  exact_location = 'Either side of the fireplace',
  client_notes = 'Kid-proof fabric',
  trade_notes = 'Confirm seat height 17 in',
  install_notes = 'White glove, remove packaging',
  care_notes = 'Vacuum weekly',
  warranty_notes = 'Frame 10 years',
  selected_media = '[{"url": "https://example.invalid/chair-swatch.jpg"}]'::jsonb
WHERE ffe_item_id = '75000000-0000-4000-8000-000000000101';

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

CREATE OR REPLACE FUNCTION pg_temp.placements(p_item uuid)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'room', project_room_id, 'quantity', quantity, 'areaNote', area_note, 'sortOrder', sort_order)
    ORDER BY sort_order), '[]'::jsonb)
  FROM public.project_ffe_placements WHERE ffe_item_id = p_item;
$$;

CREATE TEMP TABLE t750 (key text PRIMARY KEY, id uuid) ON COMMIT DROP;

-- Studio-session setup: the labor line and the two room placements.
DO $$
DECLARE v_labor uuid;
BEGIN
  PERFORM pg_temp.assume('75000000-0000-4000-8000-0000000000a1');
  v_labor := (public.add_labor_line('75000000-0000-4000-8000-000000000101',
    jsonb_build_object('name', 'Assembly', 'quantity', 3, 'unit', 'hour', 'roughCents', 27000,
                       'vendorId', '75000000-0000-4000-8000-000000000011'), 9000)->>'selectionId')::uuid;
  INSERT INTO t750 VALUES ('labor', v_labor);
  PERFORM public.set_line_placements('75000000-0000-4000-8000-000000000101', jsonb_build_array(
    jsonb_build_object('roomId', '75000000-0000-4000-8000-000000000021', 'quantity', 1, 'areaNote', 'Left of the fire'),
    jsonb_build_object('roomId', '75000000-0000-4000-8000-000000000022', 'quantity', 1)));
END;
$$;

-- ── (1) The piece replaced by product B ────────────────────────────────────
DO $$
DECLARE
  v_old constant uuid := '75000000-0000-4000-8000-000000000101';
  v_result jsonb;
  v_new public.project_ffe_items%ROWTYPE;
  v_id uuid;
  v_spec public.project_ffe_specs%ROWTYPE;
  v_old_placements jsonb := pg_temp.placements('75000000-0000-4000-8000-000000000101');
  v_labor uuid := (SELECT id FROM t750 WHERE key = 'labor');
  v_child public.project_ffe_items%ROWTYPE;
BEGIN
  PERFORM pg_temp.assume('75000000-0000-4000-8000-0000000000a1');
  ASSERT jsonb_array_length(v_old_placements) = 2, 'setup: the chair is placed in two rooms';

  v_result := public.supersede_project_selection(jsonb_build_object(
    'selectionId', v_old, 'productId', '75000000-0000-4000-8000-000000000032'));
  SELECT * INTO v_new FROM public.project_ffe_items WHERE id = (v_result->>'selectionId')::uuid;
  INSERT INTO t750 VALUES ('piece2', v_new.id);

  ASSERT v_new.supersedes_ffe_item_id = v_old AND v_new.product_id = '75000000-0000-4000-8000-000000000032',
    'FAIL 1: supersede mints the successor on product B';
  ASSERT (SELECT design_disposition FROM public.project_ffe_items WHERE id = v_old) = 'superseded',
    'FAIL 1: the predecessor is superseded';

  -- Line columns.
  ASSERT v_new.notes = 'Tight back, no skirt',
    format('FAIL 1: line notes carry, got %L', v_new.notes);
  ASSERT v_new.unit = 'each' AND v_new.rough_cents = 480000,
    format('FAIL 1: unit and Rough $ carry, got %s / %s', v_new.unit, v_new.rough_cents);
  ASSERT v_new.line_kind = 'goods' AND v_new.link_kind IS NULL AND v_new.parent_ffe_item_id IS NULL,
    'FAIL 1: a piece stays a top-level goods line';
  ASSERT v_new.unit_price_cents = 260000 AND v_new.line_total_cents = 520000,
    format('FAIL 1: product B prices the line (base behaviour), got %s / %s',
      v_new.unit_price_cents, v_new.line_total_cents);

  -- Spec row.
  SELECT * INTO v_spec FROM public.project_ffe_specs WHERE ffe_item_id = v_new.id;
  ASSERT v_spec.material = 'Belgian linen',
    format('FAIL 1: the designer''s material carries, got %L', v_spec.material);
  ASSERT NOT (v_spec.field_provenance ? 'material'),
    format('FAIL 1: a carried designer value has no product provenance, got %s', v_spec.field_provenance);
  ASSERT v_spec.finish = 'Oak' AND v_spec.field_provenance->>'finish' = 'product_master',
    format('FAIL 1: a product-seeded finish comes from product B, got %L / %s', v_spec.finish, v_spec.field_provenance);
  ASSERT v_spec.color_fabric = 'Cognac',
    format('FAIL 1: a product-seeded colour comes from product B, got %L', v_spec.color_fabric);
  ASSERT v_spec.exact_location = 'Either side of the fireplace'
     AND v_spec.client_notes = 'Kid-proof fabric'
     AND v_spec.trade_notes = 'Confirm seat height 17 in'
     AND v_spec.install_notes = 'White glove, remove packaging'
     AND v_spec.care_notes = 'Vacuum weekly'
     AND v_spec.warranty_notes = 'Frame 10 years',
    'FAIL 1: location and the five spec notes carry';
  ASSERT v_spec.selected_media = '[{"url": "https://example.invalid/chair-swatch.jpg"}]'::jsonb,
    format('FAIL 1: selected media carries, got %s', v_spec.selected_media);
  ASSERT v_spec.routing_source->>'supersedesSelectionId' = v_old::text,
    format('FAIL 1: routing_source names the predecessor, got %s', v_spec.routing_source);
  ASSERT (SELECT material FROM public.project_ffe_specs WHERE ffe_item_id = v_old) = 'Belgian linen',
    'FAIL 1: the predecessor''s spec row is untouched';

  -- Room placements: copied, the predecessor keeps its own.
  ASSERT pg_temp.placements(v_new.id) = v_old_placements,
    format('FAIL 1: placements copy, got %s, want %s', pg_temp.placements(v_new.id), v_old_placements);
  ASSERT pg_temp.placements(v_old) = v_old_placements,
    'FAIL 1: the predecessor keeps its placements';
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_ffe_placements a JOIN public.project_ffe_placements b
                     ON a.id = b.id WHERE a.ffe_item_id = v_new.id AND b.ffe_item_id = v_old),
    'FAIL 1: placements are new rows, not moved';

  -- Children: active labor and COM re-parented, not copied; removed accessory stays.
  SELECT * INTO v_child FROM public.project_ffe_items WHERE id = v_labor;
  ASSERT v_child.parent_ffe_item_id = v_new.id AND v_child.line_kind = 'labor' AND v_child.link_kind = 'labor',
    'FAIL 1: the labor line is re-parented to the new piece';
  ASSERT (SELECT parent_ffe_item_id FROM public.project_ffe_items
          WHERE id = '75000000-0000-4000-8000-000000000111') = v_new.id,
    'FAIL 1: the COM fabric is re-parented to the new piece';
  ASSERT (SELECT parent_ffe_item_id FROM public.project_ffe_items
          WHERE id = '75000000-0000-4000-8000-000000000112') = v_old,
    'FAIL 1: the removed accessory stays with the predecessor';
  ASSERT (SELECT count(*) FROM public.project_ffe_items
          WHERE project_id = '75000000-0000-4000-8000-000000000001' AND line_kind = 'labor') = 1,
    'FAIL 1: children are re-parented, not copied';

  -- The need label is the thread's and is untouched.
  ASSERT v_new.selection_thread_id = (SELECT selection_thread_id FROM public.project_ffe_items WHERE id = v_old),
    'FAIL 1: the successor joins the same thread';
  ASSERT (SELECT need_label FROM public.project_ffe_selection_threads WHERE id = v_new.selection_thread_id)
         = 'Lounge chairs, by the fire',
    'FAIL 1: the need label is untouched';
END;
$$;

-- ── (2) The labor line superseded ──────────────────────────────────────────
DO $$
DECLARE
  v_labor uuid := (SELECT id FROM t750 WHERE key = 'labor');
  v_piece uuid := (SELECT id FROM t750 WHERE key = 'piece2');
  v_err text;
  v_new public.project_ffe_items%ROWTYPE;
  v_id uuid;
BEGIN
  PERFORM pg_temp.assume('75000000-0000-4000-8000-0000000000a1');

  v_err := pg_temp.refusal(format('SELECT public.supersede_project_selection(%L::jsonb)',
    jsonb_build_object('selectionId', v_labor, 'productId', '75000000-0000-4000-8000-000000000032')));
  ASSERT v_err = '23514|Labor isn''t replaced with a product.',
    format('FAIL 2: a labor line is never replaced by a product, got %L', v_err);

  v_id := (public.supersede_project_selection(jsonb_build_object(
    'selectionId', v_labor, 'name', 'Assembly and placement'))->>'selectionId')::uuid;
  SELECT * INTO v_new FROM public.project_ffe_items WHERE id = v_id;
  INSERT INTO t750 VALUES ('labor2', v_new.id);

  ASSERT v_new.name = 'Assembly and placement' AND v_new.supersedes_ffe_item_id = v_labor,
    'FAIL 2: supersede mints the renamed labor line';
  ASSERT v_new.line_kind = 'labor' AND v_new.link_kind = 'labor' AND v_new.parent_ffe_item_id = v_piece,
    format('FAIL 2: the successor stays labor under its piece, got %s / %s / %s',
      v_new.line_kind, v_new.link_kind, v_new.parent_ffe_item_id);
  ASSERT v_new.unit = 'hour' AND v_new.rough_cents = 27000 AND v_new.quantity = 3,
    format('FAIL 2: unit, Rough $ and quantity carry, got %s / %s / %s',
      v_new.unit, v_new.rough_cents, v_new.quantity);
  ASSERT v_new.unit_price_cents = 9000 AND v_new.line_total_cents = 27000,
    format('FAIL 2: the labor price carries, got %s / %s', v_new.unit_price_cents, v_new.line_total_cents);
END;
$$;

-- ── (3) The COM child superseded ───────────────────────────────────────────
DO $$
DECLARE
  v_com constant uuid := '75000000-0000-4000-8000-000000000111';
  v_piece uuid := (SELECT id FROM t750 WHERE key = 'piece2');
  v_new public.project_ffe_items%ROWTYPE;
  v_id uuid;
BEGIN
  PERFORM pg_temp.assume('75000000-0000-4000-8000-0000000000a1');
  v_id := (public.supersede_project_selection(jsonb_build_object('selectionId', v_com))->>'selectionId')::uuid;
  SELECT * INTO v_new FROM public.project_ffe_items WHERE id = v_id;
  INSERT INTO t750 VALUES ('com2', v_new.id);
  ASSERT v_new.line_kind = 'goods' AND v_new.link_kind = 'com' AND v_new.parent_ffe_item_id = v_piece,
    format('FAIL 3: the COM successor stays a COM child of its piece, got %s / %s / %s',
      v_new.line_kind, v_new.link_kind, v_new.parent_ffe_item_id);
  ASSERT v_new.unit = 'yard' AND v_new.rough_cents = 36000,
    format('FAIL 3: unit and Rough $ carry, got %s / %s', v_new.unit, v_new.rough_cents);
END;
$$;

-- ── (4) The piece superseded again ─────────────────────────────────────────
DO $$
DECLARE
  v_piece2 uuid := (SELECT id FROM t750 WHERE key = 'piece2');
  v_piece3 uuid;
  v_spec public.project_ffe_specs%ROWTYPE;
BEGIN
  PERFORM pg_temp.assume('75000000-0000-4000-8000-0000000000a1');
  v_piece3 := (public.supersede_project_selection(jsonb_build_object('selectionId', v_piece2))->>'selectionId')::uuid;

  ASSERT (SELECT parent_ffe_item_id FROM public.project_ffe_items
          WHERE id = (SELECT id FROM t750 WHERE key = 'labor2')) = v_piece3,
    'FAIL 4: the active labor follows the piece';
  ASSERT (SELECT parent_ffe_item_id FROM public.project_ffe_items
          WHERE id = (SELECT id FROM t750 WHERE key = 'com2')) = v_piece3,
    'FAIL 4: the active COM follows the piece';
  ASSERT (SELECT parent_ffe_item_id FROM public.project_ffe_items
          WHERE id = (SELECT id FROM t750 WHERE key = 'labor')) = v_piece2,
    'FAIL 4: the superseded labor stays with the predecessor';
  ASSERT (SELECT parent_ffe_item_id FROM public.project_ffe_items
          WHERE id = '75000000-0000-4000-8000-000000000111') = v_piece2,
    'FAIL 4: the superseded COM stays with the predecessor';
  ASSERT pg_temp.placements(v_piece3) = pg_temp.placements(v_piece2)
     AND jsonb_array_length(pg_temp.placements(v_piece3)) = 2,
    'FAIL 4: the placements carry again';

  -- Same product, no replacement: the carried spec is intact.
  SELECT * INTO v_spec FROM public.project_ffe_specs WHERE ffe_item_id = v_piece3;
  ASSERT v_spec.material = 'Belgian linen' AND v_spec.finish = 'Oak'
     AND v_spec.exact_location = 'Either side of the fireplace',
    format('FAIL 4: the spec carries across a second supersede, got %L / %L / %L',
      v_spec.material, v_spec.finish, v_spec.exact_location);
  ASSERT (SELECT need_label FROM public.project_ffe_selection_threads thread
          JOIN public.project_ffe_items item ON item.selection_thread_id = thread.id
          WHERE item.id = v_piece3) = 'Lounge chairs, by the fire',
    'FAIL 4: the need label is still untouched';
END;
$$;

SELECT 'pieces_supersede_carries_test: all assertions passed' AS result;

ROLLBACK;
