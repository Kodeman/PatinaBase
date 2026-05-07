-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: Proposal Captures (Inbox)
-- 5 inbox captures owned by the dev designer (designer@patina.dev,
-- a0000000-0000-0000-0000-000000000004), used by the FF&E test plan and
-- manual extension QA. Three rows have product_id set (consume-ready);
-- two are raw drafts that require draft promotion before consume_capture
-- will accept them.
--
-- Idempotent: ON CONFLICT (id) DO NOTHING.
--
-- assigned-status rows are NOT static-seeded — the
-- proposal_captures_guard_proposal_owner trigger requires the target
-- proposal/room to already exist, so those are inserted at e2e runtime.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO proposal_captures (
  id, designer_id, product_id, proposal_id, scope_room_id,
  ffe_category_slug, source_url, raw_payload, thumbnail_url, status,
  captured_at
)
VALUES
-- 1. Consume-ready: Velvet Club Chair (product 0012)
('b0000000-0000-0000-0000-000000000001',
 'a0000000-0000-0000-0000-000000000004',
 'a0000000-0000-0000-0000-000000000012',
 NULL, NULL, NULL,
 'https://www.article.com/product/velvet-club-chair',
 jsonb_build_object(
   'productName', 'Velvet Club Chair',
   'price', jsonb_build_object('value', 125000, 'currency', 'USD', 'raw', '$1,250.00'),
   'manufacturer', 'Article',
   'confidence', 'high',
   'extractedAt', NOW()
 ),
 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=400&q=80',
 'inbox',
 NOW() - INTERVAL '2 hours'),

-- 2. Consume-ready: Brass Arc Floor Lamp (product 0011)
('b0000000-0000-0000-0000-000000000002',
 'a0000000-0000-0000-0000-000000000004',
 'a0000000-0000-0000-0000-000000000011',
 NULL, NULL, NULL,
 'https://www.schoolhouse.com/products/brass-arc-floor-lamp',
 jsonb_build_object(
   'productName', 'Brass Arc Floor Lamp',
   'price', jsonb_build_object('value', 89000, 'currency', 'USD', 'raw', '$890.00'),
   'manufacturer', 'Schoolhouse',
   'confidence', 'high',
   'extractedAt', NOW()
 ),
 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=400&q=80',
 'inbox',
 NOW() - INTERVAL '1 hour'),

-- 3. Consume-ready: Marble Side Table (product 0013)
('b0000000-0000-0000-0000-000000000003',
 'a0000000-0000-0000-0000-000000000004',
 'a0000000-0000-0000-0000-000000000013',
 NULL, NULL, NULL,
 'https://www.cb2.com/marble-side-table',
 jsonb_build_object(
   'productName', 'Marble Side Table',
   'price', jsonb_build_object('value', 89900, 'currency', 'USD', 'raw', '$899.00'),
   'manufacturer', 'CB2',
   'confidence', 'high',
   'extractedAt', NOW()
 ),
 'https://images.unsplash.com/photo-1499933374294-4584851497cc?auto=format&fit=crop&w=400&q=80',
 'inbox',
 NOW() - INTERVAL '30 minutes'),

-- 4. Raw draft (no product_id yet — needs portal draft promotion)
('b0000000-0000-0000-0000-000000000004',
 'a0000000-0000-0000-0000-000000000004',
 NULL,
 NULL, NULL, NULL,
 'https://example-vendor.com/woven-rattan-pendant',
 jsonb_build_object(
   'productName', 'Woven Rattan Pendant',
   'price', jsonb_build_object('value', 38000, 'currency', 'USD', 'raw', '$380.00'),
   'manufacturer', 'Unknown',
   'confidence', 'medium',
   'extractedAt', NOW()
 ),
 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=400&q=80',
 'inbox',
 NOW() - INTERVAL '15 minutes'),

-- 5. Raw draft (no product_id yet — needs portal draft promotion)
('b0000000-0000-0000-0000-000000000005',
 'a0000000-0000-0000-0000-000000000004',
 NULL,
 NULL, NULL, NULL,
 'https://example-vendor.com/handwoven-throw-blanket',
 jsonb_build_object(
   'productName', 'Handwoven Throw Blanket',
   'price', jsonb_build_object('value', 14500, 'currency', 'USD', 'raw', '$145.00'),
   'manufacturer', 'Mercado Mayoral',
   'confidence', 'low',
   'extractedAt', NOW()
 ),
 'https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?auto=format&fit=crop&w=400&q=80',
 'inbox',
 NOW() - INTERVAL '5 minutes')

ON CONFLICT (id) DO NOTHING;
