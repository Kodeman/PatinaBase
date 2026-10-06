-- ═══════════════════════════════════════════════════════════════════════════
-- Studio buying Phase 1 carry tests (migrations 00693 + 00694; US-16 C-17; SQ-401)
--
--   A. 00693 mint carry: a personal product minted from a field capture
--      (capture_source = 'field_capture') picks up the capture's sku, finish,
--      materials, colors, dimensions and trade price; a value the INSERT
--      supplied is never overwritten; another designer's capture copies
--      nothing; a non-field-capture product is untouched.
--   B. 00694 placement seed: a line placed with a product gets a spec row
--      seeded from it, each seeded field marked 'product_master' in
--      field_provenance; a multi-value colors list is NOT seeded; a line
--      with no product gets the empty 00380 row.
--   C. 00694 backfill never overwrites: re-running the migration fills only
--      NULL columns, leaves a designer's value and its provenance alone,
--      skips an N/A field and a locked configuration snapshot.
--
-- How to run (after `supabase db reset`), from the repo root:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 -f supabase/tests/procurement/phase1_carry_test.sql
--
-- One transaction, rolled back at the end. Case C replays 00694 with \ir
-- (CREATE OR REPLACE + the NULL-only backfill), which is how it runs on push.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('69200000-0000-4000-8000-0000000000a1', 'p1carry-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('69200000-0000-4000-8000-0000000000a2', 'p1carry-other@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('69200000-0000-4000-8000-0000000000a1', 'p1carry-designer@test.invalid', 'P1 Carry Designer', NOW(), NOW()),
  ('69200000-0000-4000-8000-0000000000a2', 'p1carry-other@test.invalid',    'P1 Carry Other',    NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- FC1: the designer's capture with a full buy spec. FC2: another designer's.
INSERT INTO field_captures (id, client_capture_id, designer_id, sku, finish, materials, colors, dimensions, price_trade_cents)
VALUES
  ('69200000-0000-4000-8000-000000000201', '69200000-0000-4000-8000-000000000301', '69200000-0000-4000-8000-0000000000a1',
   ' SK-1 ', 'Walnut', ARRAY['Oak'], ARRAY['Natural', 'Black'],
   '{"width": 80, "height": 30, "depth": 20, "unit": "in"}'::jsonb, 120000),
  ('69200000-0000-4000-8000-000000000202', '69200000-0000-4000-8000-000000000302', '69200000-0000-4000-8000-0000000000a2',
   'OTHER-SKU', 'Ebony', ARRAY['Steel'], ARRAY['Red'], '{"width": 1}'::jsonb, 999);

-- ─── A. 00693 mint carry ────────────────────────────────────────────────────

-- P1: the commit_field_capture mint shape (00530:666-677): no sku, finish,
-- materials, colors, dimensions or trade price in the column list.
INSERT INTO products (id, name, price_retail, layer, owner_user_id, capture_source, field_capture_id, captured_at)
VALUES ('69200000-0000-4000-8000-000000000101', 'Field find', 200000, 'personal',
        '69200000-0000-4000-8000-0000000000a1', 'field_capture', '69200000-0000-4000-8000-000000000201', NOW());

-- P2: the same capture, but the INSERT supplies sku, materials and trade price.
INSERT INTO products (id, name, price_retail, layer, owner_user_id, capture_source, field_capture_id, captured_at,
                      sku, materials, price_trade)
VALUES ('69200000-0000-4000-8000-000000000102', 'Field find, typed', 200000, 'personal',
        '69200000-0000-4000-8000-0000000000a1', 'field_capture', '69200000-0000-4000-8000-000000000201', NOW(),
        'MINE', ARRAY['Steel'], 5);

-- P3: the designer's product naming the OTHER designer's capture.
INSERT INTO products (id, name, layer, owner_user_id, capture_source, field_capture_id, captured_at)
VALUES ('69200000-0000-4000-8000-000000000103', 'Borrowed capture', 'personal',
        '69200000-0000-4000-8000-0000000000a1', 'field_capture', '69200000-0000-4000-8000-000000000202', NOW());

-- P4: a manual product carrying a field_capture_id: the trigger does not fire.
INSERT INTO products (id, name, layer, owner_user_id, capture_source, field_capture_id, captured_at)
VALUES ('69200000-0000-4000-8000-000000000104', 'Manual entry', 'personal',
        '69200000-0000-4000-8000-0000000000a1', 'manual', '69200000-0000-4000-8000-000000000201', NOW());

DO $$
DECLARE p products%ROWTYPE;
BEGIN
  SELECT * INTO p FROM products WHERE id = '69200000-0000-4000-8000-000000000101';
  ASSERT p.sku = 'SK-1', 'FAIL A1: sku should carry trimmed, got ' || COALESCE(p.sku, 'null');
  ASSERT p.finish = 'Walnut', 'FAIL A1: finish should carry';
  ASSERT p.materials = ARRAY['Oak'], 'FAIL A1: materials should carry over the {} default, got ' || COALESCE(p.materials::text, 'null');
  ASSERT p.colors = ARRAY['Natural', 'Black'], 'FAIL A1: colors should carry';
  ASSERT p.dimensions = '{"width": 80, "height": 30, "depth": 20, "unit": "in"}'::jsonb, 'FAIL A1: dimensions should carry';
  ASSERT p.price_trade = 120000, 'FAIL A1: trade price should carry, got ' || COALESCE(p.price_trade::text, 'null');
  ASSERT p.price_retail = 200000, 'FAIL A1: retail must stay as inserted';

  SELECT * INTO p FROM products WHERE id = '69200000-0000-4000-8000-000000000102';
  ASSERT p.sku = 'MINE' AND p.materials = ARRAY['Steel'] AND p.price_trade = 5,
    'FAIL A2: supplied sku / materials / trade price must not be overwritten';
  ASSERT p.finish = 'Walnut', 'FAIL A2: an unsupplied finish should still carry';

  SELECT * INTO p FROM products WHERE id = '69200000-0000-4000-8000-000000000103';
  ASSERT p.sku IS NULL AND p.finish IS NULL AND p.price_trade IS NULL AND p.dimensions IS NULL,
    'FAIL A3: another designer''s capture must copy nothing';

  SELECT * INTO p FROM products WHERE id = '69200000-0000-4000-8000-000000000104';
  ASSERT p.sku IS NULL AND p.price_trade IS NULL, 'FAIL A4: a manual product must not be filled';
  RAISE NOTICE 'Case A1–A4 (mint carry, no overwrite, owner guard, source guard): ok';
END $$;

-- ─── B. 00694 placement seed ────────────────────────────────────────────────

INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('69200000-0000-4000-8000-000000000001', 'P1 Carry Project',
        '69200000-0000-4000-8000-0000000000a1', '69200000-0000-4000-8000-0000000000a1');

INSERT INTO project_ffe_items (id, project_id, name, status, quantity, product_id)
VALUES
  ('69200000-0000-4000-8000-000000000401', '69200000-0000-4000-8000-000000000001', 'Seeded line', 'specified', 1,
   '69200000-0000-4000-8000-000000000101'),
  ('69200000-0000-4000-8000-000000000402', '69200000-0000-4000-8000-000000000001', 'Named need',  'specified', 1, NULL),
  ('69200000-0000-4000-8000-000000000403', '69200000-0000-4000-8000-000000000001', 'Designer line', 'specified', 1,
   '69200000-0000-4000-8000-000000000101'),
  ('69200000-0000-4000-8000-000000000404', '69200000-0000-4000-8000-000000000001', 'Locked line', 'specified', 1,
   '69200000-0000-4000-8000-000000000101');

DO $$
DECLARE s project_ffe_specs%ROWTYPE;
BEGIN
  SELECT * INTO s FROM project_ffe_specs WHERE ffe_item_id = '69200000-0000-4000-8000-000000000401';
  ASSERT FOUND, 'FAIL B1: placement should create the spec row';
  ASSERT s.sku = 'SK-1' AND s.finish = 'Walnut' AND s.material = 'Oak', 'FAIL B1: sku / finish / material should seed';
  ASSERT s.selected_dimensions = '{"width": 80, "height": 30, "depth": 20, "unit": "in"}'::jsonb, 'FAIL B1: dimensions should seed';
  ASSERT s.color_fabric IS NULL, 'FAIL B1: two colors are options, not a choice; color_fabric must stay NULL';
  ASSERT s.field_provenance = '{"sku": "product_master", "finish": "product_master", "material": "product_master", "dimensions": "product_master"}'::jsonb,
    'FAIL B1: provenance should name exactly the seeded fields, got ' || s.field_provenance::text;

  SELECT * INTO s FROM project_ffe_specs WHERE ffe_item_id = '69200000-0000-4000-8000-000000000402';
  ASSERT FOUND AND s.sku IS NULL AND s.material IS NULL AND s.field_provenance = '{}'::jsonb,
    'FAIL B2: a line with no product gets the empty spec row';
  RAISE NOTICE 'Case B1–B2 (placement seed with provenance; options not seeded): ok';
END $$;

-- ─── C. 00694 backfill never overwrites ─────────────────────────────────────

-- Designer line: the designer typed a sku (provenance key gone), cleared the
-- rest, and declared material N/A. Locked line: cleared, then its
-- configuration snapshot is locked (00403 freezes those columns).
-- Seeded line: finish cleared, so the replay must refill only that.
UPDATE project_ffe_specs
   SET sku = 'DESIGNER-SKU', finish = NULL, material = NULL, selected_dimensions = NULL,
       field_provenance = '{}'::jsonb,
       na_declarations = '{"material": {"na": true, "reason": "COM, client supplies"}}'::jsonb
 WHERE ffe_item_id = '69200000-0000-4000-8000-000000000403';
UPDATE project_ffe_specs
   SET sku = NULL, finish = NULL, material = NULL, selected_dimensions = NULL, field_provenance = '{}'::jsonb
 WHERE ffe_item_id = '69200000-0000-4000-8000-000000000404';
-- Lock through the 00403 workflow bypass, then drop the bypass so the replay
-- runs under the guard (a locked row it touched would raise).
INSERT INTO product_configurations (id, product_id, owner_user_id, version, schema_revision, evaluation, snapshot, snapshot_hash)
VALUES ('69200000-0000-4000-8000-000000000501', '69200000-0000-4000-8000-000000000101',
        '69200000-0000-4000-8000-0000000000a1', 1, 1, '{}'::jsonb, '{"options": {}}'::jsonb, repeat('a', 64));
SELECT set_config('patina.configuration_spec_workflow', '00403', true);
UPDATE project_ffe_specs
   SET configuration_id = '69200000-0000-4000-8000-000000000501',
       configuration_snapshot = '{"options": {}}'::jsonb,
       configuration_snapshot_hash = repeat('a', 64),
       configuration_locked_at = NOW()
 WHERE ffe_item_id = '69200000-0000-4000-8000-000000000404';
SELECT set_config('patina.configuration_spec_workflow', '', true);
UPDATE project_ffe_specs
   SET finish = NULL, field_provenance = field_provenance - 'finish'
 WHERE ffe_item_id = '69200000-0000-4000-8000-000000000401';

\ir ../../migrations/00694_ffe_spec_seed_from_product.sql

DO $$
DECLARE s project_ffe_specs%ROWTYPE;
BEGIN
  SELECT * INTO s FROM project_ffe_specs WHERE ffe_item_id = '69200000-0000-4000-8000-000000000403';
  ASSERT s.sku = 'DESIGNER-SKU', 'FAIL C1: the designer''s sku must never be overwritten, got ' || COALESCE(s.sku, 'null');
  ASSERT NOT (s.field_provenance ? 'sku'), 'FAIL C1: no product_master provenance on the designer''s sku';
  ASSERT s.material IS NULL AND NOT (s.field_provenance ? 'material'), 'FAIL C1: an N/A material must stay unseeded';
  ASSERT s.finish = 'Walnut' AND s.field_provenance->>'finish' = 'product_master', 'FAIL C1: a NULL finish should backfill';
  ASSERT s.selected_dimensions IS NOT NULL AND s.field_provenance->>'dimensions' = 'product_master', 'FAIL C1: NULL dimensions should backfill';

  SELECT * INTO s FROM project_ffe_specs WHERE ffe_item_id = '69200000-0000-4000-8000-000000000404';
  ASSERT s.sku IS NULL AND s.finish IS NULL AND s.field_provenance = '{}'::jsonb,
    'FAIL C2: a locked configuration snapshot must not be backfilled';

  SELECT * INTO s FROM project_ffe_specs WHERE ffe_item_id = '69200000-0000-4000-8000-000000000401';
  ASSERT s.finish = 'Walnut' AND s.sku = 'SK-1' AND s.material = 'Oak', 'FAIL C3: replay refills only the cleared finish';
  ASSERT s.field_provenance = '{"sku": "product_master", "finish": "product_master", "material": "product_master", "dimensions": "product_master"}'::jsonb,
    'FAIL C3: provenance after replay, got ' || s.field_provenance::text;
  RAISE NOTICE 'Case C1–C3 (backfill fills NULLs only; designer value, N/A and lock respected): ok';
END $$;

ROLLBACK;
