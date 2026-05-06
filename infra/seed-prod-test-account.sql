-- =============================================================================
-- Patina: prod test-account seed for kody@kochaver.com
-- =============================================================================
-- Idempotent. Single transaction. Refuses to run if the kody profile is missing.
-- Seeded UUIDs prefixed `00000000-0000-0000-0000-0000000000xx` for cleanup.
-- =============================================================================

BEGIN;

-- Refuse to run if the auth user / profile is missing.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = 'e01db20f-87c6-45a6-bc18-84c68e0e7452'
  ) THEN
    RAISE EXCEPTION 'profile e01db20f-87c6-45a6-bc18-84c68e0e7452 (kody@kochaver.com) not found';
  END IF;
END $$;

-- Vendor (no slug col on prod)
INSERT INTO vendors (id, name)
  VALUES ('00000000-0000-0000-0000-000000000a01', 'Acme Furnishings (seed)')
  ON CONFLICT (id) DO NOTHING;

-- Products (4 spanning FF&E categories) — captured_at NOT NULL
INSERT INTO products (id, name, slug, vendor_id, price_retail, status, captured_by, captured_at)
VALUES
  ('00000000-0000-0000-0000-000000000b01', 'Eames Lounge Chair (seed)', 'eames-lounge-seed',
    '00000000-0000-0000-0000-000000000a01', 749500, 'published',
    'e01db20f-87c6-45a6-bc18-84c68e0e7452', NOW()),
  ('00000000-0000-0000-0000-000000000b02', 'Linen Sectional (seed)', 'linen-sectional-seed',
    '00000000-0000-0000-0000-000000000a01', 489500, 'published',
    'e01db20f-87c6-45a6-bc18-84c68e0e7452', NOW()),
  ('00000000-0000-0000-0000-000000000b03', 'Brass Floor Lamp (seed)', 'brass-floor-lamp-seed',
    '00000000-0000-0000-0000-000000000a01',  89500, 'published',
    'e01db20f-87c6-45a6-bc18-84c68e0e7452', NOW()),
  ('00000000-0000-0000-0000-000000000b04', 'Vintage Persian Rug (seed)', 'vintage-persian-rug-seed',
    '00000000-0000-0000-0000-000000000a01', 325000, 'published',
    'e01db20f-87c6-45a6-bc18-84c68e0e7452', NOW())
ON CONFLICT (id) DO NOTHING;

-- Proposal
INSERT INTO proposals (id, designer_id, title, status)
  VALUES ('00000000-0000-0000-0000-000000000c01',
          'e01db20f-87c6-45a6-bc18-84c68e0e7452',
          'Smith Residence — Living Room (seed)', 'draft')
  ON CONFLICT (id) DO NOTHING;

-- Scope room (Wave 1)
INSERT INTO proposal_scope_rooms (id, proposal_id, name, room_type, ffe_categories)
  VALUES ('00000000-0000-0000-0000-000000000d01',
          '00000000-0000-0000-0000-000000000c01',
          'Living Room', 'living_room',
          ARRAY['seating','tables','lighting','rugs','art'])
  ON CONFLICT (id) DO NOTHING;

-- FF&E items (Wave 1): 1 fixed + 1 allowance + 1 tbd
-- Required NOT NULL: id, proposal_id, name, quantity, unit_price, unit_sell_price, line_total, item_type, position
INSERT INTO proposal_items
  (id, proposal_id, scope_room_id, product_id, name, quantity,
   unit_price, unit_sell_price, line_total, item_type, ffe_category,
   budget_min_cents, budget_max_cents, position)
VALUES
  ('00000000-0000-0000-0000-000000000e01',
   '00000000-0000-0000-0000-000000000c01',
   '00000000-0000-0000-0000-000000000d01',
   '00000000-0000-0000-0000-000000000b01',
   'Eames Lounge Chair (seed)',
   1, 749500, 749500, 749500,
   'fixed', 'seating', NULL, NULL, 0),
  ('00000000-0000-0000-0000-000000000e02',
   '00000000-0000-0000-0000-000000000c01',
   '00000000-0000-0000-0000-000000000d01',
   NULL,
   'Coffee Table (allowance)',
   1, 0, 0, 0,
   'allowance', 'tables', 100000, 250000, 1),
  ('00000000-0000-0000-0000-000000000e03',
   '00000000-0000-0000-0000-000000000c01',
   '00000000-0000-0000-0000-000000000d01',
   NULL,
   'Area Rug (TBD)',
   1, 0, 0, 0,
   'tbd', 'rugs', NULL, NULL, 2)
ON CONFLICT (id) DO NOTHING;

-- Captures (Wave 2): one inbox + one assigned
INSERT INTO proposal_captures
  (id, designer_id, product_id, source_url, raw_payload, status,
   proposal_id, scope_room_id, ffe_category_slug)
VALUES
  ('00000000-0000-0000-0000-000000000f01',
   'e01db20f-87c6-45a6-bc18-84c68e0e7452',
   NULL,
   'https://westelm.com/sample-chair',
   '{"name":"WestElm Chair (seed)","priceCents":24500}'::jsonb,
   'inbox',
   NULL, NULL, NULL),
  ('00000000-0000-0000-0000-000000000f02',
   'e01db20f-87c6-45a6-bc18-84c68e0e7452',
   '00000000-0000-0000-0000-000000000b03',
   'https://hermanmiller.com/sample-lamp',
   '{"name":"Brass Lamp (seed)"}'::jsonb,
   'assigned',
   '00000000-0000-0000-0000-000000000c01',
   '00000000-0000-0000-0000-000000000d01',
   'lighting')
ON CONFLICT (id) DO NOTHING;

-- Palette + 4 swatches (Wave 3)
INSERT INTO proposal_palettes (id, proposal_id, name, is_primary)
  VALUES ('00000000-0000-0000-0000-000000000901',
          '00000000-0000-0000-0000-000000000c01',
          'Whole Home (seed)', true)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO palette_swatches (id, palette_id, hex, name, role) VALUES
  ('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000901', '#F5EFE6', 'Warm Linen', 'foundation'),
  ('00000000-0000-0000-0000-000000000802', '00000000-0000-0000-0000-000000000901', '#A8B5A6', 'Sage Mist',  'wall'),
  ('00000000-0000-0000-0000-000000000803', '00000000-0000-0000-0000-000000000901', '#5C4A3A', 'Walnut',     'accent'),
  ('00000000-0000-0000-0000-000000000804', '00000000-0000-0000-0000-000000000901', '#1F2937', 'Slate',      'metal')
ON CONFLICT (id) DO NOTHING;

-- Apply Wave 5 phase template (gated on no phases yet for this proposal)
-- Impersonate kody via JWT claim so apply_phase_template's auth.uid() check passes.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM proposal_phases
    WHERE proposal_id = '00000000-0000-0000-0000-000000000c01'
  ) THEN
    PERFORM set_config('request.jwt.claim.sub', 'e01db20f-87c6-45a6-bc18-84c68e0e7452', true);
    PERFORM apply_phase_template(
      '00000000-0000-0000-0000-000000000c01'::uuid,
      'classic_5_phase'
    );
  END IF;
END $$;

-- Mark first deliverable of Discovery phase complete (Wave 4 demo)
UPDATE proposal_phase_deliverables
  SET completed_at = NOW(),
      completed_by = 'e01db20f-87c6-45a6-bc18-84c68e0e7452'
  WHERE phase_id = (
    SELECT id FROM proposal_phases
    WHERE proposal_id = '00000000-0000-0000-0000-000000000c01'
      AND phase_key   = 'discovery'
    LIMIT 1
  )
  AND completed_at IS NULL
  AND sort_order = 0;

COMMIT;

-- Summary view
SELECT
  (SELECT count(*) FROM proposal_scope_rooms WHERE proposal_id = '00000000-0000-0000-0000-000000000c01') AS rooms,
  (SELECT count(*) FROM proposal_items       WHERE proposal_id = '00000000-0000-0000-0000-000000000c01') AS items,
  (SELECT count(*) FROM proposal_palettes    WHERE proposal_id = '00000000-0000-0000-0000-000000000c01') AS palettes,
  (SELECT count(*) FROM palette_swatches s JOIN proposal_palettes p ON p.id = s.palette_id
                                            WHERE p.proposal_id = '00000000-0000-0000-0000-000000000c01') AS swatches,
  (SELECT count(*) FROM proposal_captures    WHERE designer_id  = 'e01db20f-87c6-45a6-bc18-84c68e0e7452' AND id::text LIKE '00000000-0000-0000-0000-00000000%') AS captures_seeded,
  (SELECT count(*) FROM proposal_phases      WHERE proposal_id  = '00000000-0000-0000-0000-000000000c01') AS phases,
  (SELECT count(*) FROM proposal_phase_deliverables d JOIN proposal_phases ph ON ph.id = d.phase_id
                                            WHERE ph.proposal_id = '00000000-0000-0000-0000-000000000c01') AS deliverables,
  (SELECT count(*) FROM proposal_phase_gates g JOIN proposal_phases ph ON ph.id = g.phase_id
                                            WHERE ph.proposal_id = '00000000-0000-0000-0000-000000000c01') AS gates;
