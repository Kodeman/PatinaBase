-- ═══════════════════════════════════════════════════════════════════════════
-- Studio buying Phase 1 spec provenance tests (migration 00714; US-16 C-17;
-- SQ-439, follow-up to 00694 / SQ-401)
--
--   A. _spec_book_resolve_field directly: a spec value with provenance
--      'product_master' is labelled product_master (and an FF&E line value
--      still wins over it); the same value with no provenance, and the 9-arg
--      00380 form, are labelled project_override.
--   B. End to end through _spec_book_current_item_snapshots: a line placed
--      with a product gets a seeded spec row whose sku resolves as
--      product_master; saving the same value keeps that; a designer edit
--      (the Spec Book editor's plain column UPDATE) drops the sku's
--      provenance key and the value resolves as project_override, while the
--      untouched seeded finish stays product_master.
--
-- How to run (after `supabase db reset`), from the repo root:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 -f supabase/tests/procurement/phase1_spec_provenance_test.sql
--
-- One transaction, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── A. the resolver ────────────────────────────────────────────────────────

DO $$
DECLARE r jsonb;
BEGIN
  r := public._spec_book_resolve_field(
    '"SEEDED-SKU"'::jsonb, NULL, '"MASTER-SKU"'::jsonb, NULL, NULL,
    '2026-07-20'::timestamptz, '2026-07-10'::timestamptz, '2026-06-01'::timestamptz, NULL,
    'product_master');
  ASSERT r->>'source' = 'product_master', 'FAIL A1: a seeded value should be product_master, got ' || r::text;
  ASSERT r->>'value' = 'SEEDED-SKU', 'FAIL A1: the seeded value should print, got ' || r::text;
  ASSERT (r->>'sourceUpdatedAt')::timestamptz = '2026-06-01'::timestamptz,
    'FAIL A1: a product-tier value carries the product timestamp, got ' || r::text;

  r := public._spec_book_resolve_field(
    '"EDITED-SKU"'::jsonb, NULL, '"MASTER-SKU"'::jsonb, NULL, NULL,
    '2026-07-20'::timestamptz, '2026-07-10'::timestamptz, '2026-06-01'::timestamptz, NULL,
    NULL);
  ASSERT r->>'source' = 'project_override' AND r->>'value' = 'EDITED-SKU',
    'FAIL A2: a value with no provenance is the project override, got ' || r::text;

  r := public._spec_book_resolve_field(
    '"SEEDED-SKU"'::jsonb, '"LINE-SKU"'::jsonb, '"MASTER-SKU"'::jsonb, NULL, NULL,
    '2026-07-20'::timestamptz, '2026-07-10'::timestamptz, '2026-06-01'::timestamptz, NULL,
    'product_master');
  ASSERT r->>'source' = 'ffe_line' AND r->>'value' = 'LINE-SKU',
    'FAIL A3: an FF&E line value wins over a seeded value, got ' || r::text;

  r := public._spec_book_resolve_field(
    '"SEEDED-SKU"'::jsonb, NULL, '"MASTER-SKU"'::jsonb, NULL, NULL,
    '2026-07-20'::timestamptz, '2026-07-10'::timestamptz, '2026-06-01'::timestamptz, NULL);
  ASSERT r->>'source' = 'project_override',
    'FAIL A4: the 9-arg form has no provenance and stays project_override, got ' || r::text;

  RAISE NOTICE 'Case A1–A4 (resolver: seeded = product_master, edited = override, line wins, 9-arg form): ok';
END $$;

-- ─── B. end to end through the snapshot ────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('69400000-0000-4000-8000-0000000000a1', 'p1prov-designer@test.invalid', '', NOW(), NOW(), NOW(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('69400000-0000-4000-8000-0000000000a1', 'p1prov-designer@test.invalid', 'P1 Provenance Designer', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (id, name, layer, owner_user_id, capture_source, captured_at, sku, finish)
VALUES ('69400000-0000-4000-8000-000000000101', 'Seeded chair', 'personal',
        '69400000-0000-4000-8000-0000000000a1', 'manual', NOW(), 'SK-9', 'Oiled walnut');

INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('69400000-0000-4000-8000-000000000001', 'P1 Provenance Project',
        '69400000-0000-4000-8000-0000000000a1', '69400000-0000-4000-8000-0000000000a1');

-- The book exists first, so placement also attaches the line to it (00380).
INSERT INTO spec_books (id, project_id, title, template_id, created_by)
VALUES ('69400000-0000-4000-8000-000000000501', '69400000-0000-4000-8000-000000000001',
        'P1 Provenance Book', '8f6e2600-6f25-4f20-a63d-d68d49c35a01',
        '69400000-0000-4000-8000-0000000000a1');

INSERT INTO project_ffe_items (id, project_id, name, status, quantity, product_id)
VALUES ('69400000-0000-4000-8000-000000000401', '69400000-0000-4000-8000-000000000001',
        'Seeded line', 'specified', 1, '69400000-0000-4000-8000-000000000101');

DO $$
DECLARE
  s project_ffe_specs%ROWTYPE;
  sel jsonb;
BEGIN
  SELECT * INTO s FROM project_ffe_specs WHERE ffe_item_id = '69400000-0000-4000-8000-000000000401';
  ASSERT s.sku = 'SK-9' AND s.field_provenance->>'sku' = 'product_master',
    'FAIL B0: placement should seed sku with product_master provenance, got ' || s.field_provenance::text;

  SELECT item_snapshot->'selection' INTO sel
  FROM public._spec_book_current_item_snapshots('69400000-0000-4000-8000-000000000501')
  WHERE ffe_item_id = '69400000-0000-4000-8000-000000000401';
  ASSERT sel IS NOT NULL, 'FAIL B1: the placed line should be in the book snapshot';
  ASSERT sel#>>'{sku,source}' = 'product_master' AND sel#>>'{sku,value}' = 'SK-9',
    'FAIL B1: a seeded sku should resolve as product_master, got ' || (sel->'sku')::text;
  ASSERT sel#>>'{finish,source}' = 'product_master',
    'FAIL B1: a seeded finish should resolve as product_master, got ' || (sel->'finish')::text;
  RAISE NOTICE 'Case B0–B1 (seeded value resolves as product_master): ok';
END $$;

-- The Spec Book editor resaves every column; an unchanged value is no edit.
UPDATE project_ffe_specs SET sku = 'SK-9', finish = 'Oiled walnut'
 WHERE ffe_item_id = '69400000-0000-4000-8000-000000000401';

DO $$
DECLARE s project_ffe_specs%ROWTYPE;
BEGIN
  SELECT * INTO s FROM project_ffe_specs WHERE ffe_item_id = '69400000-0000-4000-8000-000000000401';
  ASSERT s.field_provenance->>'sku' = 'product_master' AND s.field_provenance->>'finish' = 'product_master',
    'FAIL B2: resaving the seeded values must keep their provenance, got ' || s.field_provenance::text;
  RAISE NOTICE 'Case B2 (unchanged resave keeps product_master): ok';
END $$;

-- A designer edit: the editor writes the column and never field_provenance.
UPDATE project_ffe_specs SET sku = 'SK-9-CUSTOM', finish = 'Oiled walnut'
 WHERE ffe_item_id = '69400000-0000-4000-8000-000000000401';

DO $$
DECLARE
  s project_ffe_specs%ROWTYPE;
  sel jsonb;
BEGIN
  SELECT * INTO s FROM project_ffe_specs WHERE ffe_item_id = '69400000-0000-4000-8000-000000000401';
  ASSERT NOT (s.field_provenance ? 'sku'),
    'FAIL B3: an edited sku must lose its product_master key, got ' || s.field_provenance::text;
  ASSERT s.field_provenance->>'finish' = 'product_master',
    'FAIL B3: the untouched finish keeps its key, got ' || s.field_provenance::text;

  SELECT item_snapshot->'selection' INTO sel
  FROM public._spec_book_current_item_snapshots('69400000-0000-4000-8000-000000000501')
  WHERE ffe_item_id = '69400000-0000-4000-8000-000000000401';
  ASSERT sel#>>'{sku,source}' = 'project_override' AND sel#>>'{sku,value}' = 'SK-9-CUSTOM',
    'FAIL B3: an edited sku should resolve as project_override, got ' || (sel->'sku')::text;
  ASSERT sel#>>'{finish,source}' = 'product_master',
    'FAIL B3: the untouched finish should stay product_master, got ' || (sel->'finish')::text;
  RAISE NOTICE 'Case B3 (designer edit flips to project_override): ok';
END $$;

ROLLBACK;
