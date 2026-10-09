-- US-21 T-59 · The Build room walk fixture: Whole Home Renovation (SPEC §4).
--
-- Local only. The e2e suite (pieces-build-room.spec.ts) runs this through
-- e2e/helpers/psql.ts before every scenario, and the walk seed
-- supabase/seed/dev/pieces_build_room_walk_dev.sql includes it with \ir.
-- It is never wired into config.toml and nothing of it ships.
--
-- Idempotent: it removes its own project (cascade) and products, then builds
-- them again. Every id is prefixed e6590000-…, so it never touches other rows.
--
-- The state is §4.4 "Before (frame 1)": 7 rooms, the §4.2 lines with their
-- rough figures (per unit, the way the Rough in column reads them), F1 and T1
-- placed per §4.3, R1a attached to R1, B1–B6 not yet grouped, and no client
-- linked (§4.1). Lines are created through the RPCs the Build room calls, as
-- Leah, so threads, stages and guards are the app's own; the specced lines'
-- makers and prices are then set as postgres (the RPC-only guard lets the
-- superuser through), since this release has no post-placement price writer.

BEGIN;

-- ── Teardown ───────────────────────────────────────────────────────────────
DELETE FROM public.projects WHERE id = 'e6590000-0000-4000-8000-000000000001';
UPDATE public.products SET merged_into_id = NULL
 WHERE id::text LIKE 'e6590000-0000-4000-8000-0000000001%';
DELETE FROM public.products
 WHERE id::text LIKE 'e6590000-0000-4000-8000-0000000001%';

DELETE FROM public.vendors
 WHERE id::text LIKE 'e6590000-0000-4000-8000-0000000002%';

-- R1's maker and R1a's hanger, as vendor rows: release readiness and the PO
-- read vendor_id, not the free-text maker.
INSERT INTO public.vendors (id, name, is_patina_catalog, founding_circle) VALUES
  ('e6590000-0000-4000-8000-000000000201', 'Phillip Jeffries', false, false),
  ('e6590000-0000-4000-8000-000000000202', 'Wallpaper hanger', false, false);

-- ── The job and its rooms (Leah's studio; no client) ───────────────────────
INSERT INTO public.projects (id, name, status, created_by, designer_id, studio_id)
VALUES (
  'e6590000-0000-4000-8000-000000000001', 'Whole Home Renovation', 'active',
  'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004',
  'b0000000-0000-0000-0000-000000000001'
);

INSERT INTO public.project_rooms (id, project_id, name, sort_order) VALUES
  ('e6590000-0000-4000-8000-000000000011', 'e6590000-0000-4000-8000-000000000001', 'Hall', 1),
  ('e6590000-0000-4000-8000-000000000012', 'e6590000-0000-4000-8000-000000000001', 'Living Room', 2),
  ('e6590000-0000-4000-8000-000000000013', 'e6590000-0000-4000-8000-000000000001', 'Dining', 3),
  ('e6590000-0000-4000-8000-000000000014', 'e6590000-0000-4000-8000-000000000001', 'Kitchen', 4),
  ('e6590000-0000-4000-8000-000000000015', 'e6590000-0000-4000-8000-000000000001', 'Primary Bath', 5),
  ('e6590000-0000-4000-8000-000000000016', 'e6590000-0000-4000-8000-000000000001', 'Sunroom', 6),
  ('e6590000-0000-4000-8000-000000000017', 'e6590000-0000-4000-8000-000000000001', 'Bedroom', 7);

-- ── Studio Library products ([illustrative] in SPEC §4.2) ───────────────────
-- 0101/0102: the a6 fill results for "knob". 0103: R1's wallpaper, which a
-- line names (the refused delete, S5). 0104: its duplicate, merged in S5.
INSERT INTO public.products
  (id, name, brand, finish, category, layer, studio_id, owner_user_id, status,
   price_retail, price_trade, vendor_contact, lead_time_weeks, payment_terms, usage_notes, captured_at)
VALUES
  ('e6590000-0000-4000-8000-000000000101', 'Emtek Ribbon & Reed knob, satin brass', 'Emtek', 'satin brass',
   'hardware', 'studio', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004',
   'published', 3800, 3100, '{"name":"Emtek trade desk"}', 2, 'full_upfront', 'Cabinet knob', now()),
  ('e6590000-0000-4000-8000-000000000102', 'Rejuvenation Mission knob, aged brass', 'Rejuvenation', 'aged brass',
   'hardware', 'studio', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004',
   'published', 2400, 1900, '{"name":"Rejuvenation trade"}', 2, 'full_upfront', 'Cabinet knob', now()),
  ('e6590000-0000-4000-8000-000000000103', 'Phillip Jeffries Manila Hemp, Chalk', 'Phillip Jeffries', 'Chalk',
   'wallcovering', 'studio', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004',
   'published', 23000, 18400, '{"name":"Phillip Jeffries trade"}', 4, 'full_upfront', 'Grasscloth, per roll', now()),
  ('e6590000-0000-4000-8000-000000000104', 'Phillip Jeffries Manila Hemp - Chalk', 'Phillip Jeffries', 'Chalk',
   'wallcovering', 'studio', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004',
   'published', 23000, 18400, '{"name":"Phillip Jeffries trade"}', 4, 'full_upfront', 'Duplicate entry', now());

-- ── The lines, as Leah, through the Build room's own RPCs ──────────────────
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'a0000000-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- One batch per room, in §4.2 order. roughCents is per unit.
SELECT public.batch_create_named_project_needs(jsonb_build_object(
  'projectId', 'e6590000-0000-4000-8000-000000000001', 'roomId', 'e6590000-0000-4000-8000-000000000011',
  'assignmentScope', 'room', 'idempotencyKey', 'e659-hall-' || gen_random_uuid(),
  'lines', jsonb_build_array(
    jsonb_build_object('name', 'Console table', 'quantity', 1, 'unit', 'each', 'roughCents', 120000),
    jsonb_build_object('name', 'Runner, 2′6″ × 10′', 'quantity', 1, 'unit', 'each', 'roughCents', 68000))));

SELECT public.batch_create_named_project_needs(jsonb_build_object(
  'projectId', 'e6590000-0000-4000-8000-000000000001', 'roomId', 'e6590000-0000-4000-8000-000000000012',
  'assignmentScope', 'room', 'idempotencyKey', 'e659-living-' || gen_random_uuid(),
  'lines', jsonb_build_array(
    jsonb_build_object('name', 'Custom cabinet', 'quantity', 2, 'unit', 'each', 'roughCents', 480000),
    jsonb_build_object('name', 'Countertop for custom cabinets', 'quantity', 2, 'unit', 'each', 'roughCents', 140000),
    jsonb_build_object('name', 'Hardware, 2 knobs for custom cabinet', 'quantity', 2, 'unit', 'each', 'roughCents', 3800),
    jsonb_build_object('name', 'Hardware, 4 pulls for custom cabinet', 'quantity', 4, 'unit', 'each', 'roughCents', 5200),
    jsonb_build_object('name', 'Sofa, 96 in', 'quantity', 1, 'unit', 'each', 'roughCents', 720000),
    jsonb_build_object('name', 'White oak floor, satin Bona finish', 'quantity', 830, 'unit', 'sq_ft'))));

SELECT public.batch_create_named_project_needs(jsonb_build_object(
  'projectId', 'e6590000-0000-4000-8000-000000000001', 'roomId', 'e6590000-0000-4000-8000-000000000013',
  'assignmentScope', 'room', 'idempotencyKey', 'e659-dining-' || gen_random_uuid(),
  'lines', jsonb_build_array(
    jsonb_build_object('name', 'Dining table, custom walnut', 'quantity', 1, 'unit', 'each'),
    jsonb_build_object('name', 'Dining chairs', 'quantity', 8, 'unit', 'each', 'roughCents', 90000),
    jsonb_build_object('name', 'Counter stools', 'quantity', 3, 'unit', 'each', 'roughCents', 42000))));

SELECT public.batch_create_named_project_needs(jsonb_build_object(
  'projectId', 'e6590000-0000-4000-8000-000000000001', 'roomId', 'e6590000-0000-4000-8000-000000000014',
  'assignmentScope', 'room', 'idempotencyKey', 'e659-kitchen-' || gen_random_uuid(),
  'lines', jsonb_build_array(
    jsonb_build_object('name', 'Pendant lights, island', 'quantity', 3, 'unit', 'each', 'roughCents', 64000),
    jsonb_build_object('name', 'Faucet, bridge, unlacquered brass', 'quantity', 1, 'unit', 'each', 'roughCents', 115000))));

SELECT public.batch_create_named_project_needs(jsonb_build_object(
  'projectId', 'e6590000-0000-4000-8000-000000000001', 'roomId', 'e6590000-0000-4000-8000-000000000015',
  'assignmentScope', 'room', 'idempotencyKey', 'e659-bath-' || gen_random_uuid(),
  'lines', jsonb_build_array(
    jsonb_build_object('name', 'Valve and trim', 'quantity', 1, 'unit', 'each', 'roughCents', 65000),
    jsonb_build_object('name', 'Shower head', 'quantity', 1, 'unit', 'each', 'roughCents', 32000),
    jsonb_build_object('name', 'Hand shower', 'quantity', 1, 'unit', 'each', 'roughCents', 28000),
    jsonb_build_object('name', 'Linear drain', 'quantity', 1, 'unit', 'each', 'roughCents', 24000),
    jsonb_build_object('name', 'Niche tile', 'quantity', 1, 'unit', 'lot', 'roughCents', 16000),
    jsonb_build_object('name', 'Glass panel', 'quantity', 1, 'unit', 'each', 'roughCents', 180000),
    jsonb_build_object('name', 'Vanity, 60 in, double', 'quantity', 1, 'unit', 'each', 'roughCents', 320000),
    jsonb_build_object('name', 'Porcelain floor tile, 12 × 24, matte', 'quantity', 280, 'unit', 'sq_ft'))));

SELECT public.batch_create_named_project_needs(jsonb_build_object(
  'projectId', 'e6590000-0000-4000-8000-000000000001', 'roomId', 'e6590000-0000-4000-8000-000000000016',
  'assignmentScope', 'room', 'idempotencyKey', 'e659-sunroom-' || gen_random_uuid(),
  'lines', jsonb_build_array(
    jsonb_build_object('name', 'Rattan lounge chair', 'quantity', 2, 'unit', 'each', 'roughCents', 110000))));

SELECT public.batch_create_named_project_needs(jsonb_build_object(
  'projectId', 'e6590000-0000-4000-8000-000000000001', 'roomId', 'e6590000-0000-4000-8000-000000000017',
  'assignmentScope', 'room', 'idempotencyKey', 'e659-bedroom-' || gen_random_uuid(),
  'lines', jsonb_build_array(
    jsonb_build_object('name', 'Wallpaper, grasscloth', 'quantity', 9, 'unit', 'roll'),
    jsonb_build_object('name', 'Bed, king, upholstered', 'quantity', 1, 'unit', 'each', 'roughCents', 420000),
    jsonb_build_object('name', 'Nightstands', 'quantity', 2, 'unit', 'each', 'roughCents', 95000))));

-- §4.3: F1 in four rooms, T1 in four with its area notes.
SELECT public.set_line_placements(
  (SELECT id FROM public.project_ffe_items WHERE project_id = 'e6590000-0000-4000-8000-000000000001'
     AND name = 'White oak floor, satin Bona finish'),
  jsonb_build_array(
    jsonb_build_object('roomId', 'e6590000-0000-4000-8000-000000000012', 'quantity', 320),
    jsonb_build_object('roomId', 'e6590000-0000-4000-8000-000000000011', 'quantity', 120),
    jsonb_build_object('roomId', 'e6590000-0000-4000-8000-000000000013', 'quantity', 180),
    jsonb_build_object('roomId', 'e6590000-0000-4000-8000-000000000014', 'quantity', 210)));

SELECT public.set_line_placements(
  (SELECT id FROM public.project_ffe_items WHERE project_id = 'e6590000-0000-4000-8000-000000000001'
     AND name = 'Porcelain floor tile, 12 × 24, matte'),
  jsonb_build_array(
    jsonb_build_object('roomId', 'e6590000-0000-4000-8000-000000000015', 'quantity', 72),
    jsonb_build_object('roomId', 'e6590000-0000-4000-8000-000000000016', 'quantity', 148),
    jsonb_build_object('roomId', 'e6590000-0000-4000-8000-000000000011', 'quantity', 36, 'areaNote', 'back entry'),
    jsonb_build_object('roomId', 'e6590000-0000-4000-8000-000000000014', 'quantity', 24, 'areaNote', 'pantry')));

-- R1 filled with its product (the need label stays on the thread, D2).
SELECT public.place_product_in_project_v2(jsonb_build_object(
  'projectId', 'e6590000-0000-4000-8000-000000000001',
  'productId', 'e6590000-0000-4000-8000-000000000103',
  'placeholderSelectionId', (SELECT id FROM public.project_ffe_items
     WHERE project_id = 'e6590000-0000-4000-8000-000000000001' AND name = 'Wallpaper, grasscloth'),
  'assignmentScope', 'room', 'roomId', 'e6590000-0000-4000-8000-000000000017',
  'quantity', 9, 'itemType', 'fixed', 'duplicateMode', 'reuse',
  'roleConfigurationIdentity', 'default', 'idempotencyKey', 'e659-fill-r1-' || gen_random_uuid()));

-- R1a: the hanger's labor, on R1 (D4, D5).
SELECT public.add_labor_line(
  (SELECT id FROM public.project_ffe_items WHERE project_id = 'e6590000-0000-4000-8000-000000000001'
     AND product_id = 'e6590000-0000-4000-8000-000000000103'),
  jsonb_build_object('name', 'Install, wallpaper hanger', 'quantity', 9, 'unit', 'roll'),
  8500);

RESET ROLE;

-- ── Makers and prices on the specced lines (postgres; see the header) ──────
SELECT set_config('app.ffe_mutation_rpc', 'on', true);

UPDATE public.project_ffe_items
   SET vendor_name = 'Nord Hardwood Co.', unit_price_cents = 1150, line_total_cents = 1150 * quantity, design_disposition = 'selected', item_type = 'fixed'
 WHERE project_id = 'e6590000-0000-4000-8000-000000000001' AND name = 'White oak floor, satin Bona finish';
UPDATE public.project_ffe_items
   SET vendor_name = 'The Tile Shop', unit_price_cents = 680, line_total_cents = 680 * quantity, design_disposition = 'selected', item_type = 'fixed'
 WHERE project_id = 'e6590000-0000-4000-8000-000000000001' AND name = 'Porcelain floor tile, 12 × 24, matte';
UPDATE public.project_ffe_items
   SET vendor_name = 'Woodward & Sons', item_type = 'fixed', unit_price_cents = 680000, line_total_cents = 680000, trade_price_cents = 540000,
       design_disposition = 'selected'
 WHERE project_id = 'e6590000-0000-4000-8000-000000000001' AND name = 'Dining table, custom walnut';
UPDATE public.project_ffe_items
   SET vendor_id = 'e6590000-0000-4000-8000-000000000201', vendor_name = 'Phillip Jeffries', trade_price_cents = 18400,
       design_disposition = 'selected'
 WHERE project_id = 'e6590000-0000-4000-8000-000000000001'
   AND product_id = 'e6590000-0000-4000-8000-000000000103';
-- R1a's maker is the hanger, so it is ready with its piece (D1 L1).
UPDATE public.project_ffe_items
   SET vendor_id = 'e6590000-0000-4000-8000-000000000202', vendor_name = 'Wallpaper hanger', design_disposition = 'selected'
 WHERE project_id = 'e6590000-0000-4000-8000-000000000001' AND line_kind = 'labor';

COMMIT;
