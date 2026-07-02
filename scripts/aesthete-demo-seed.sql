-- ════════════════════════════════════════════════════════════════════════════
-- Aesthete Engine — demo seed  (Wave 3D; skeleton was Wave 0A)
--
-- A richer, walk-ready picture ON TOP of the reset baseline. `supabase db
-- reset` already gives you 12 seed products + spectrums/DNA via
-- supabase/seed/aesthete_demo.sql (2A's aesthete_dev_demo_seed(), 00244 §9).
-- This script EXTENDS that baseline — it never duplicates it:
--
--   §1  8 published catalog products across category × budget tiers, with
--       VERIFIED image URLs, hand-set canonical spectrums, product_dna rows,
--       and primary archetypes — so matching, category probes, and the budget
--       bell have real range.
--   §2  2 draft-only products (status in_review, product_dna_drafts only) —
--       the teaching-prefill demo path (§5.2 canonical-else-draft).
--   §3  material_compatibility rows in the 00244 evaluator's bucket vocab
--       (table was empty; G2 rolled this to 3D).
--   §4  Designer fuel for designer@patina.dev: a portfolio set, ~30 pairwise
--       taste_judgments + 2 taste_corrections — Your Eye + the nightly refit
--       (Wave 4A) have something to chew on.
--   §5  One client profile (client@patina.dev) + interactions (views/saves/
--       skips) + a behavior-stats refresh — the behavioral term demo.
--
-- SYNTHETIC-DATA TAGGING (learning loops/audits must be able to exclude it):
--   • every fixed UUID uses the ae3d0000-… prefix (aesthete wave-3D);
--   • all §4 judgments hang off ONE demo teaching_session
--     (ae3d0000-…-00000000e5e5) — exclude by session_id;
--   • corrections carry free_text prefixed '[aesthete-demo]';
--   • demo products carry tags = {aesthete-demo-seed}.
--   Synthetic judgments are demo theater, never training truth.
--
-- Idempotent (fixed UUIDs + ON CONFLICT / NOT-EXISTS guards — applies clean
-- twice) and PROD-SAFE: the whole body no-ops unless the local dev sentinel
-- product exists. Run after `supabase db reset`:
--
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     < scripts/aesthete-demo-seed.sql
--
-- Design contract: docs/prds/AE/aesthete-engine-system-design.md (§5, §14).
-- Conventions: scripts/the-document-track5-demo-coordination.sql.
-- ════════════════════════════════════════════════════════════════════════════

begin;

DO $seed$
DECLARE
  v_designer uuid := 'a0000000-0000-0000-0000-000000000004';  -- designer@patina.dev
  v_client   uuid := 'a0000000-0000-0000-0000-000000000005';  -- client@patina.dev
  v_session  uuid := 'ae3d0000-0000-4000-8000-00000000e5e5';  -- demo teaching session (the synthetic tag)
  v_csp      uuid := 'ae3d0000-0000-4000-8000-00000000c11e';  -- demo client_style_profiles id
  v_csp_key  uuid := 'ae3d0000-0000-4000-8000-00000000ce55';  -- its session_key (bearer capability)
  v_style_id uuid;
  r record;
BEGIN
  -- ── prod guard: same sentinel as aesthete_dev_demo_seed() (00244 §9) ──────
  IF NOT EXISTS (SELECT 1 FROM products p
                  WHERE p.id = 'a0000000-0000-0000-0000-000000000001'
                    AND p.name = 'Heirloom Oak Dining Table') THEN
    RAISE NOTICE 'aesthete-demo-seed: dev seed catalog absent (prod path) — no-op.';
    RETURN;
  END IF;

  -- Baseline dependency: make sure 2A's dev demo layer is present (it is
  -- idempotent and invoked on every db reset; harmless to call again).
  PERFORM aesthete_dev_demo_seed();

  -- ═══ §1. Published demo catalog — 8 products across category × budget ═════
  -- Image URLs verified 200 on 2026-07-02 (same unsplash style as
  -- supabase/seed/products.sql).
  INSERT INTO products (id, name, slug, brand, description, price_retail, price_trade,
                        category, status, layer, patina_managed, materials, colors,
                        style_tags, tags, finish, images, source_url, quality_score,
                        captured_by, captured_at, published_at, created_at, updated_at)
  VALUES
    -- chair · curated-comfort tier · warm/relaxed (rattan + oak)
    ('ae3d0000-0000-4000-8000-000000000001', 'Cane & Oak Lounge Chair', 'cane-oak-lounge-chair',
     'Maré Studio', 'Bent white-oak frame with hand-woven natural cane back and a loose linen cushion. The cane relaxes and golds with a decade of afternoons.',
     240000, 192000, 'chair', 'published', 'catalog', true,
     ARRAY['White oak', 'Natural cane', 'Linen'], ARRAY['Natural Oak', 'Cane'],
     ARRAY['Coastal Calm', 'Japandi'], ARRAY['aesthete-demo-seed', 'lounge-chair'],
     'Natural oil', ARRAY['https://images.unsplash.com/photo-1550254478-ead40cc54513?auto=format&fit=crop&w=1200&q=80'],
     'http://dev.invalid/aesthete-demo/3d-01', 84, v_designer, now(), now(), now() - interval '28 days', now()),

    -- sofa · heirloom range · warm leather midcentury
    ('ae3d0000-0000-4000-8000-000000000002', 'Tanned Leather Sofa', 'tanned-leather-sofa',
     'Fjord & Hide', 'Vegetable-tanned aniline leather over a kiln-dried beech frame. Scratches burnish in; the seat earns a saddle sheen where people actually sit.',
     620000, 496000, 'sofa', 'published', 'catalog', true,
     ARRAY['Aniline leather', 'Kiln-dried beech'], ARRAY['Tan'],
     ARRAY['Midcentury Modern'], ARRAY['aesthete-demo-seed', 'sofa'],
     'Vegetable-tanned aniline', ARRAY['https://images.unsplash.com/photo-1540574163026-643ea20ade25?auto=format&fit=crop&w=1200&q=80'],
     'http://dev.invalid/aesthete-demo/3d-02', 88, v_designer, now(), now(), now() - interval '55 days', now()),

    -- storage · mid tier · cool industrial (metal)
    ('ae3d0000-0000-4000-8000-000000000003', 'Blackened Steel Étagère', 'blackened-steel-etagere',
     'Foundry North', 'Hot-rolled steel étagère, waxed to hold its mill scale. Open shelving with a welded, seamless frame — the loft piece that outlives the loft.',
     340000, 272000, 'storage', 'published', 'catalog', true,
     ARRAY['Hot-rolled steel', 'Smoked glass'], ARRAY['Matte Black'],
     ARRAY['Industrial'], ARRAY['aesthete-demo-seed', 'shelving'],
     'Wax-sealed steel', ARRAY['https://images.unsplash.com/photo-1538688525198-9b88f6f53126?auto=format&fit=crop&w=1200&q=80'],
     'http://dev.invalid/aesthete-demo/3d-03', 79, v_designer, now(), now(), now() - interval '41 days', now()),

    -- sofa · starter-reachable · bold color statement
    ('ae3d0000-0000-4000-8000-000000000004', 'Persimmon Compact Sofa', 'persimmon-compact-sofa',
     'Atelier Ocre', 'Apartment-scale two-seater in a persimmon performance weave. One saturated move that carries a small room.',
     189000, 151200, 'sofa', 'published', 'catalog', true,
     ARRAY['Performance weave', 'Solid pine'], ARRAY['Persimmon'],
     ARRAY['Bold Eclectic'], ARRAY['aesthete-demo-seed', 'loveseat'],
     'Stain-resistant weave', ARRAY['https://images.unsplash.com/photo-1567016432779-094069958ea5?auto=format&fit=crop&w=1200&q=80'],
     'http://dev.invalid/aesthete-demo/3d-04', 72, v_designer, now(), now(), now() - interval '19 days', now()),

    -- storage · heirloom range · formal/timeless (oak library)
    ('ae3d0000-0000-4000-8000-000000000005', 'Oak Library Bookcase', 'oak-library-bookcase',
     'Whitfield Joinery', 'Floor-to-ceiling quarter-sawn oak library wall, pegged shelves, no fasteners visible. Built for three generations of rereading.',
     520000, 416000, 'storage', 'published', 'catalog', true,
     ARRAY['Quarter-sawn white oak'], ARRAY['Natural Oak'],
     ARRAY['Traditional', 'Warm Minimalist'], ARRAY['aesthete-demo-seed', 'bookcase'],
     'Hand-rubbed oil', ARRAY['https://images.unsplash.com/photo-1594620302200-9a762244a156?auto=format&fit=crop&w=1200&q=80'],
     'http://dev.invalid/aesthete-demo/3d-05', 90, v_designer, now(), now(), now() - interval '63 days', now()),

    -- lighting · starter tier · quiet Scandinavian
    ('ae3d0000-0000-4000-8000-000000000006', 'Dome Pendant Light', 'dome-pendant-light',
     'Lampverk', 'Spun-steel dome pendant in soft white enamel. Falls quietly over a table and lets the food be the color.',
     96000, 76800, 'lighting', 'published', 'catalog', true,
     ARRAY['Spun steel', 'Enamel'], ARRAY['Soft White'],
     ARRAY['Warm Minimalist'], ARRAY['aesthete-demo-seed', 'pendant'],
     'Baked enamel', ARRAY['https://images.unsplash.com/photo-1524484485831-a92ffc0de03f?auto=format&fit=crop&w=1200&q=80'],
     'http://dev.invalid/aesthete-demo/3d-06', 76, v_designer, now(), now(), now() - interval '33 days', now()),

    -- chair · entry price · cool midcentury shell
    ('ae3d0000-0000-4000-8000-000000000007', 'Ebon Shell Dining Chair', 'ebon-shell-dining-chair',
     'Studio Norr', 'Molded shell dining chair in charcoal with turned oak legs. The workhorse chair that disappears politely under any table.',
     48000, 38400, 'chair', 'published', 'catalog', true,
     ARRAY['Molded shell', 'Oak'], ARRAY['Charcoal'],
     ARRAY['Midcentury'], ARRAY['aesthete-demo-seed', 'dining-chair'],
     'Matte shell', ARRAY['https://images.unsplash.com/photo-1592078615290-033ee584e267?auto=format&fit=crop&w=1200&q=80'],
     'http://dev.invalid/aesthete-demo/3d-07', 68, v_designer, now(), now(), now() - interval '12 days', now()),

    -- chair · starter-reachable · structured transitional
    ('ae3d0000-0000-4000-8000-000000000008', 'Highback Wool Dining Chair', 'highback-wool-dining-chair',
     'Hartwell & Gray', 'High, gently-curved back in dove wool over an ash frame. Formal enough for holidays, comfortable enough for homework.',
     145000, 116000, 'chair', 'published', 'catalog', true,
     ARRAY['Wool', 'Solid ash'], ARRAY['Dove Grey'],
     ARRAY['Moody Traditional'], ARRAY['aesthete-demo-seed', 'dining-chair'],
     'Wool upholstery', ARRAY['https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?auto=format&fit=crop&w=1200&q=80'],
     'http://dev.invalid/aesthete-demo/3d-08', 81, v_designer, now(), now(), now() - interval '24 days', now())
  ON CONFLICT (id) DO NOTHING;

  -- Canonical spectrums (designer-owned, source='manual' — §5.2).
  INSERT INTO product_style_spectrum
    (product_id, warmth, complexity, formality, timelessness, boldness, craftsmanship,
     assigned_by, source, confidence)
  VALUES
    ('ae3d0000-0000-4000-8000-000000000001',  0.50,  0.10, -0.40,  0.40, -0.10,  0.70, v_designer, 'manual', '{"warmth":0.7,"craftsmanship":0.7}'),
    ('ae3d0000-0000-4000-8000-000000000002',  0.60, -0.10,  0.00,  0.60,  0.20,  0.70, v_designer, 'manual', '{"warmth":0.7,"timelessness":0.7}'),
    ('ae3d0000-0000-4000-8000-000000000003', -0.50, -0.10,  0.20,  0.30,  0.40,  0.60, v_designer, 'manual', '{"warmth":0.7,"boldness":0.7}'),
    ('ae3d0000-0000-4000-8000-000000000004',  0.40,  0.20, -0.30, -0.10,  0.70,  0.40, v_designer, 'manual', '{"boldness":0.7}'),
    ('ae3d0000-0000-4000-8000-000000000005',  0.40,  0.30,  0.50,  0.80, -0.10,  0.80, v_designer, 'manual', '{"formality":0.7,"timelessness":0.7}'),
    ('ae3d0000-0000-4000-8000-000000000006', -0.10, -0.60, -0.10,  0.40, -0.20,  0.50, v_designer, 'manual', '{"complexity":0.7}'),
    ('ae3d0000-0000-4000-8000-000000000007', -0.20, -0.50,  0.00,  0.50,  0.10,  0.40, v_designer, 'manual', '{"complexity":0.7}'),
    ('ae3d0000-0000-4000-8000-000000000008',  0.10, -0.10,  0.40,  0.50, -0.10,  0.60, v_designer, 'manual', '{"formality":0.7}')
  ON CONFLICT (product_id) DO NOTHING;

  -- Product DNA (patina is the brand dimension — §5.2 F5 first-class).
  INSERT INTO product_dna
    (product_id, patina_potential, material_honesty, craftsmanship_tier,
     color_temperature, dominant_color, palette_family,
     durability_for, comfort, flexibility, primary_function,
     maintenance_reality, value_story, provenance_story, confidence, attr_source)
  VALUES
    ('ae3d0000-0000-4000-8000-000000000001', 0.75, 0.90, 0.80,  0.45, 'golden cane', 'warm neutral',
     ARRAY['high_traffic'], 0.80, 0.40, 'seating', '{"kids": "fine", "pets": "caution"}',
     'Cane that golds instead of wearing out.', 'Woven by a two-family workshop on the Douro.',
     '{"patina_potential": 0.75}', '{"patina_potential": "designer"}'),
    ('ae3d0000-0000-4000-8000-000000000002', 0.90, 0.95, 0.85,  0.55, 'saddle tan', 'warm earth',
     ARRAY['kids','pets','high_traffic'], 0.85, 0.30, 'seating', '{"kids": "fine", "pets": "fine"}',
     'Aniline leather that tells on every good year.', 'Hides tanned in oak-bark pits, eight weeks to the hide.',
     '{"patina_potential": 0.9, "craftsmanship_tier": 0.85}', '{"patina_potential": "designer"}'),
    ('ae3d0000-0000-4000-8000-000000000003', 0.70, 0.90, 0.75, -0.40, 'mill-scale black', 'monochrome',
     ARRAY['high_traffic'], NULL, 0.60, 'storage', '{}',
     'Steel that keeps its mill scale honestly.', NULL,
     '{"patina_potential": 0.7}', '{}'),
    ('ae3d0000-0000-4000-8000-000000000004', 0.25, 0.55, 0.45,  0.50, 'persimmon', 'bold primary',
     ARRAY['kids'], 0.75, 0.70, 'seating', '{"kids": "fine", "pets": "caution"}',
     NULL, NULL, '{}', '{}'),
    ('ae3d0000-0000-4000-8000-000000000005', 0.85, 0.95, 0.90,  0.50, 'quarter-sawn oak', 'warm earth',
     ARRAY['high_traffic'], NULL, 0.20, 'storage', '{"kids": "fine"}',
     'Shelving joined to carry books, not decor.', 'Pegged joinery — not a fastener in the piece.',
     '{"patina_potential": 0.85, "craftsmanship_tier": 0.9}', '{"craftsmanship_tier": "designer"}'),
    ('ae3d0000-0000-4000-8000-000000000006', 0.35, 0.80, 0.60, -0.10, 'soft white', 'cool neutral',
     NULL, NULL, NULL, 'lighting', '{}', 'Enamel wears to a soft glow at the rim.', NULL,
     '{}', '{}'),
    ('ae3d0000-0000-4000-8000-000000000007', 0.30, 0.65, 0.50, -0.20, 'charcoal', 'monochrome',
     ARRAY['kids','high_traffic'], 0.60, 0.80, 'dining', '{"kids": "fine", "pets": "fine"}',
     'The chair you buy six of and forget about.', NULL, '{}', '{}'),
    ('ae3d0000-0000-4000-8000-000000000008', 0.45, 0.75, 0.70,  0.20, 'dove grey', 'cool neutral',
     ARRAY['kids'], 0.80, 0.30, 'dining', '{"kids": "fine"}',
     NULL, NULL, '{"craftsmanship_tier": 0.7}', '{}')
  ON CONFLICT (product_id) DO NOTHING;

  -- Primary archetypes (product_styles) — resolved by name against the 00006
  -- taxonomy; a missing name is skipped with a NOTICE.
  FOR r IN
    SELECT * FROM (VALUES
      ('ae3d0000-0000-4000-8000-000000000001'::uuid, 'Coastal'),
      ('ae3d0000-0000-4000-8000-000000000002'::uuid, 'Mid-Century Modern'),
      ('ae3d0000-0000-4000-8000-000000000003'::uuid, 'Modern Industrial'),
      ('ae3d0000-0000-4000-8000-000000000004'::uuid, 'Maximalist'),
      ('ae3d0000-0000-4000-8000-000000000005'::uuid, 'Traditional'),
      ('ae3d0000-0000-4000-8000-000000000006'::uuid, 'Scandinavian Minimal'),
      ('ae3d0000-0000-4000-8000-000000000007'::uuid, 'Mid-Century Modern'),
      ('ae3d0000-0000-4000-8000-000000000008'::uuid, 'Transitional')
    ) t(product_id, style_name)
  LOOP
    SELECT id INTO v_style_id FROM styles WHERE name = r.style_name;
    IF v_style_id IS NULL THEN
      RAISE NOTICE 'aesthete-demo-seed: style "%" not in the 00006 taxonomy — skipping archetype for %',
        r.style_name, r.product_id;
    ELSE
      INSERT INTO product_styles (product_id, style_id, confidence, assigned_by, is_primary, source)
      VALUES (r.product_id, v_style_id, 0.9, v_designer, true, 'manual')
      ON CONFLICT (product_id, style_id) DO NOTHING;
    END IF;
  END LOOP;

  -- ═══ §2. Draft-only products (teaching-prefill demo, §5.2) ═════════════════
  -- status='in_review' keeps them out of the anon match walk; each carries a
  -- product_dna_drafts row in a different triage confidence band.
  INSERT INTO products (id, name, slug, brand, description, price_retail, price_trade,
                        category, status, layer, patina_managed, materials, colors,
                        style_tags, tags, finish, images, source_url, quality_score,
                        captured_by, captured_at, created_at, updated_at)
  VALUES
    ('ae3d0000-0000-4000-8000-000000000009', 'Whitewashed Oak Stool', 'whitewashed-oak-stool',
     'Studio Norr', 'Low whitewashed oak stool — seat, step, or side table as the day demands.',
     32000, 25600, 'chair', 'in_review', 'catalog', true,
     ARRAY['White oak'], ARRAY['Whitewash'],
     ARRAY['Warm Minimalist'], ARRAY['aesthete-demo-seed', 'stool'],
     'Whitewash', ARRAY['https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=1200&q=80'],
     'http://dev.invalid/aesthete-demo/3d-09', 61, v_designer, now(), now() - interval '4 days', now()),
    ('ae3d0000-0000-4000-8000-00000000000a', 'Carved Mango-Wood Shelf', 'carved-mango-wood-shelf',
     'Bazaar & Vine', 'Tall hand-carved mango-wood shelf with open niches — a collector''s wall in one piece.',
     58000, 46400, 'storage', 'in_review', 'catalog', true,
     ARRAY['Mango wood'], ARRAY['Bleached Wood'],
     ARRAY['Bold Eclectic'], ARRAY['aesthete-demo-seed', 'shelf'],
     'Raw carved wood', ARRAY['https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&w=1200&q=80'],
     'http://dev.invalid/aesthete-demo/3d-10', 57, v_designer, now(), now() - interval '2 days', now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO product_dna_drafts (product_id, draft, model, prompt_version, overall_confidence)
  VALUES
    -- low band → requires_deep_analysis in triage
    ('ae3d0000-0000-4000-8000-000000000009',
     '{"style": {"spectrums": {"warmth": 0.3, "complexity": -0.5, "formality": -0.4, "timelessness": 0.3, "boldness": -0.3, "craftsmanship": 0.5},
                 "spectrum_conf": {"warmth": 0.5, "complexity": 0.6, "formality": 0.5, "timelessness": 0.5, "boldness": 0.5, "craftsmanship": 0.5}},
       "overall_confidence": 0.55}'::jsonb,
     'aesthete-demo-seed', 'dev-seed-v1', 0.55),
    -- comfortable band → prefill-and-confirm
    ('ae3d0000-0000-4000-8000-00000000000a',
     '{"style": {"spectrums": {"warmth": 0.4, "complexity": 0.6, "formality": -0.3, "timelessness": 0.2, "boldness": 0.5, "craftsmanship": 0.7},
                 "spectrum_conf": {"warmth": 0.8, "complexity": 0.8, "formality": 0.7, "timelessness": 0.7, "boldness": 0.8, "craftsmanship": 0.8}},
       "overall_confidence": 0.78}'::jsonb,
     'aesthete-demo-seed', 'dev-seed-v1', 0.78)
  ON CONFLICT (product_id, prompt_version) DO NOTHING;

  -- ═══ §3. material_compatibility (00005 table; was empty — G2 → 3D) ═════════
  -- Vocabulary matches BOTH the 00005 CHECK (excellent|good|caution|avoid) and
  -- the 00244 evaluator regex (complement|pair|excellent|good ⇒ +0.1 bonus).
  -- material_a/material_b use the _aesthete_material_bucket vocabulary
  -- (wood/metal/fabric/leather/ceramic/marble/glass/rattan/stone).
  INSERT INTO material_compatibility (id, material_a, material_b, compatibility, notes)
  VALUES
    ('ae3d0000-0000-4000-8000-00000000ac01', 'wood',    'leather', 'excellent', 'Classic pairing — both age visibly and warmly.'),
    ('ae3d0000-0000-4000-8000-00000000ac02', 'wood',    'metal',   'good',      'Warm-on-cool contrast; keep the metal matte.'),
    ('ae3d0000-0000-4000-8000-00000000ac03', 'wood',    'fabric',  'good',      'Default upholstery move — hard frame, soft seat.'),
    ('ae3d0000-0000-4000-8000-00000000ac04', 'ceramic', 'wood',    'good',      'Hand-thrown glaze reads best against grain.'),
    ('ae3d0000-0000-4000-8000-00000000ac05', 'metal',   'leather', 'excellent', 'Industrial frame, saddle seat — earns wear together.'),
    ('ae3d0000-0000-4000-8000-00000000ac06', 'rattan',  'fabric',  'good',      'Woven-on-woven texture without weight.'),
    ('ae3d0000-0000-4000-8000-00000000ac07', 'marble',  'metal',   'good',      'Cool luxury pairing; brass softens it.'),
    ('ae3d0000-0000-4000-8000-00000000ac08', 'glass',   'metal',   'caution',   'Cold-on-cold — needs a warm third material in the room.')
  ON CONFLICT (material_a, material_b) DO NOTHING;

  -- ═══ §4. Designer fuel — portfolio, judgments, corrections ═════════════════

  -- Portfolio set (v_D0 cold-start seed, §5.4). Embeddings are written by the
  -- portfolio_embed job (Wave 4B) — status stays 'pending' honestly.
  INSERT INTO designer_portfolio_items (id, designer_id, storage_path, caption, status)
  VALUES
    ('ae3d0000-0000-4000-8000-00000000f001', v_designer, 'aesthete-demo/portfolio/leah-01.jpg', 'Aspen loft — oak, linen, iron', 'pending'),
    ('ae3d0000-0000-4000-8000-00000000f002', v_designer, 'aesthete-demo/portfolio/leah-02.jpg', 'Reading corner, cane + wool',   'pending'),
    ('ae3d0000-0000-4000-8000-00000000f003', v_designer, 'aesthete-demo/portfolio/leah-03.jpg', 'Dining room, quarter-sawn oak', 'pending'),
    ('ae3d0000-0000-4000-8000-00000000f004', v_designer, 'aesthete-demo/portfolio/leah-04.jpg', 'Entry — terracotta and brass',  'pending'),
    ('ae3d0000-0000-4000-8000-00000000f005', v_designer, 'aesthete-demo/portfolio/leah-05.jpg', 'Client library wall',           'pending'),
    ('ae3d0000-0000-4000-8000-00000000f006', v_designer, 'aesthete-demo/portfolio/leah-06.jpg', 'Window seat, washed linen',     'pending')
  ON CONFLICT (id) DO NOTHING;

  -- The demo teaching session — the ONE synthetic tag every judgment hangs off.
  INSERT INTO teaching_sessions (id, designer_id, mode, started_at, completed_at, products_taught, duration_seconds)
  VALUES (v_session, v_designer, 'quick_tags', now() - interval '3 days', now() - interval '3 days' + interval '22 minutes', 30, 1320)
  ON CONFLICT (id) DO NOTHING;

  -- ~30 pairwise judgments expressing a coherent taste: warm > cool,
  -- craft/patina > polish, quiet > loud — with a few honest exceptions so the
  -- refit has texture. Append-only table with identity ids ⇒ idempotency is
  -- guarded on the demo session having no rows yet.
  IF NOT EXISTS (SELECT 1 FROM taste_judgments WHERE session_id = v_session) THEN
    INSERT INTO taste_judgments (designer_id, product_a, product_b, choice, context, kind, session_id, latency_ms, created_at)
    SELECT v_designer, a, b, c, 'self', 'judgment', v_session,
           1200 + (row_number() OVER ()) * 137 % 2600,
           now() - interval '3 days' + (row_number() OVER ()) * interval '40 seconds'
    FROM (VALUES
      -- warm wood over cool metal/stone
      ('a0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000013'::uuid, 'a'),
      ('a0000000-0000-0000-0000-000000000002'::uuid, 'ae3d0000-0000-4000-8000-000000000003'::uuid, 'a'),
      ('ae3d0000-0000-4000-8000-000000000002'::uuid, 'ae3d0000-0000-4000-8000-000000000007'::uuid, 'a'),
      ('a0000000-0000-0000-0000-000000000003'::uuid, 'a0000000-0000-0000-0000-000000000013'::uuid, 'a'),
      ('ae3d0000-0000-4000-8000-000000000001'::uuid, 'ae3d0000-0000-4000-8000-000000000006'::uuid, 'a'),
      -- craftsmanship / patina first
      ('a0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000021'::uuid, 'a'),
      ('ae3d0000-0000-4000-8000-000000000005'::uuid, 'ae3d0000-0000-4000-8000-000000000004'::uuid, 'a'),
      ('a0000000-0000-0000-0000-000000000005'::uuid, 'a0000000-0000-0000-0000-000000000021'::uuid, 'a'),
      ('ae3d0000-0000-4000-8000-000000000002'::uuid, 'ae3d0000-0000-4000-8000-000000000004'::uuid, 'a'),
      ('a0000000-0000-0000-0000-000000000011'::uuid, 'a0000000-0000-0000-0000-000000000021'::uuid, 'a'),
      -- quiet lines over statement (usually)
      ('a0000000-0000-0000-0000-000000000010'::uuid, 'ae3d0000-0000-4000-8000-000000000004'::uuid, 'a'),
      ('ae3d0000-0000-4000-8000-000000000006'::uuid, 'ae3d0000-0000-4000-8000-000000000003'::uuid, 'a'),
      ('ae3d0000-0000-4000-8000-000000000008'::uuid, 'ae3d0000-0000-4000-8000-000000000004'::uuid, 'a'),
      ('a0000000-0000-0000-0000-000000000020'::uuid, 'ae3d0000-0000-4000-8000-000000000004'::uuid, 'a'),
      -- …but backs one bold move when the craft is real
      ('a0000000-0000-0000-0000-000000000012'::uuid, 'ae3d0000-0000-4000-8000-000000000006'::uuid, 'a'),
      ('ae3d0000-0000-4000-8000-000000000004'::uuid, 'a0000000-0000-0000-0000-000000000021'::uuid, 'a'),
      -- ordering flipped (b-wins) so the fit is not order-degenerate
      ('a0000000-0000-0000-0000-000000000013'::uuid, 'a0000000-0000-0000-0000-000000000002'::uuid, 'b'),
      ('ae3d0000-0000-4000-8000-000000000007'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'b'),
      ('ae3d0000-0000-4000-8000-000000000003'::uuid, 'ae3d0000-0000-4000-8000-000000000005'::uuid, 'b'),
      ('a0000000-0000-0000-0000-000000000021'::uuid, 'a0000000-0000-0000-0000-000000000003'::uuid, 'b'),
      ('ae3d0000-0000-4000-8000-000000000006'::uuid, 'ae3d0000-0000-4000-8000-000000000001'::uuid, 'b'),
      ('a0000000-0000-0000-0000-000000000013'::uuid, 'ae3d0000-0000-4000-8000-000000000002'::uuid, 'b'),
      -- lighting & rugs: warm handmade over machined
      ('a0000000-0000-0000-0000-000000000004'::uuid, 'ae3d0000-0000-4000-8000-000000000006'::uuid, 'a'),
      ('ae440000-0000-4000-8000-00000000d002'::uuid, 'a0000000-0000-0000-0000-000000000020'::uuid, 'a'),
      ('a0000000-0000-0000-0000-000000000011'::uuid, 'ae3d0000-0000-4000-8000-000000000006'::uuid, 'a'),
      ('ae440000-0000-4000-8000-00000000d001'::uuid, 'ae3d0000-0000-4000-8000-000000000008'::uuid, 'a'),
      -- honest ambivalence
      ('a0000000-0000-0000-0000-000000000010'::uuid, 'ae3d0000-0000-4000-8000-000000000002'::uuid, 'both'),
      ('ae3d0000-0000-4000-8000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000012'::uuid, 'both'),
      ('ae3d0000-0000-4000-8000-000000000007'::uuid, 'ae3d0000-0000-4000-8000-000000000006'::uuid, 'neither'),
      ('a0000000-0000-0000-0000-000000000022'::uuid, 'a0000000-0000-0000-0000-000000000021'::uuid, 'a')
    ) j(a, b, c);
    RAISE NOTICE 'aesthete-demo-seed: inserted 30 demo taste_judgments (session %)', v_session;
  ELSE
    RAISE NOTICE 'aesthete-demo-seed: demo taste_judgments already present — skipped.';
  END IF;

  -- (the 2 corrections land in §5 — one references the demo client profile,
  -- which must exist first for the fk_taste_corrections_client_profile FK)

  -- ═══ §5. Client profile + behavioral fuel (+ the §4 corrections) ═══════════
  -- A claimed profile for client@patina.dev (hand-set, deterministic — the
  -- anon quiz path is exercised live by the gate/eval, not seeded here).
  INSERT INTO client_style_profiles
    (id, user_id, session_key, source,
     warmth, complexity, formality, timelessness, boldness, craftsmanship,
     spectrum_confidence, archetype_weights, budget,
     material_affinities, functional_priorities, patina_affinity,
     confidence, is_current, version)
  VALUES
    (v_csp, v_client, v_csp_key, 'quiz',
     0.55, -0.35, -0.15, 0.40, -0.15, 0.45,
     '{"warmth": 0.8, "complexity": 0.7, "formality": 0.5, "timelessness": 0.5, "boldness": 0.5, "craftsmanship": 0.6}',
     '{}',
     '{"min_cents": 200000, "max_cents": 500000, "label": "Curated Comfort", "value_orientation": 0.1}',
     '{"wood": 0.9, "fabric": 0.6}', '{"durability": "kids_pets"}', 0.4,
     0.7, true, 1)
  ON CONFLICT (id) DO NOTHING;

  -- 2 corrections (append-only; guarded on the [aesthete-demo] free_text tag).
  IF NOT EXISTS (SELECT 1 FROM taste_corrections
                  WHERE designer_id = v_designer AND free_text LIKE '[aesthete-demo]%') THEN
    INSERT INTO taste_corrections
      (designer_id, subject, product_id, replacement_product_id, client_profile_id,
       direction, free_text, surface, created_at)
    VALUES
      -- spectrum nudge from teaching: the velvet chair reads warmer than filed
      (v_designer, 'spectrum', 'a0000000-0000-0000-0000-000000000012', NULL, NULL,
       '{"warmth": 0.2, "boldness": 0.1}',
       '[aesthete-demo] Moss velvet in the room reads warmer and bolder than the sheet says.',
       'teaching', now() - interval '2 days'),
      -- correction-with-replacement in client context (weight-2.0 pairwise, §8.2)
      (v_designer, 'match', 'a0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000003', v_csp,
       '{"warmth": 0.3, "craftsmanship": 0.2}',
       '[aesthete-demo] For this client the marble side table is too cold — the live-edge piece is the same slot, warmer.',
       'library', now() - interval '1 day');
    RAISE NOTICE 'aesthete-demo-seed: inserted 2 demo taste_corrections.';
  ELSE
    RAISE NOTICE 'aesthete-demo-seed: demo taste_corrections already present — skipped.';
  END IF;

  -- Interactions (views/saves/skips) — the F10 behavioral stream (§5.5).
  -- product_id is TEXT (00067 iOS legacy).
  INSERT INTO interactions (id, user_id, product_id, event_type, metadata, created_at)
  VALUES
    ('ae3d0000-0000-4000-8000-00000000b001', v_client, 'a0000000-0000-0000-0000-000000000001', 'view', '{"demo": "aesthete-demo-seed"}', now() - interval '6 days'),
    ('ae3d0000-0000-4000-8000-00000000b002', v_client, 'a0000000-0000-0000-0000-000000000001', 'save', '{"demo": "aesthete-demo-seed"}', now() - interval '6 days'),
    ('ae3d0000-0000-4000-8000-00000000b003', v_client, 'ae440000-0000-4000-8000-00000000d002', 'view', '{"demo": "aesthete-demo-seed"}', now() - interval '5 days'),
    ('ae3d0000-0000-4000-8000-00000000b004', v_client, 'ae440000-0000-4000-8000-00000000d002', 'save', '{"demo": "aesthete-demo-seed"}', now() - interval '5 days'),
    ('ae3d0000-0000-4000-8000-00000000b005', v_client, 'ae3d0000-0000-4000-8000-000000000001', 'view', '{"demo": "aesthete-demo-seed"}', now() - interval '4 days'),
    ('ae3d0000-0000-4000-8000-00000000b006', v_client, 'ae3d0000-0000-4000-8000-000000000001', 'save', '{"demo": "aesthete-demo-seed"}', now() - interval '4 days'),
    ('ae3d0000-0000-4000-8000-00000000b007', v_client, 'ae3d0000-0000-4000-8000-000000000003', 'view', '{"demo": "aesthete-demo-seed"}', now() - interval '4 days'),
    ('ae3d0000-0000-4000-8000-00000000b008', v_client, 'ae3d0000-0000-4000-8000-000000000003', 'skip', '{"demo": "aesthete-demo-seed"}', now() - interval '4 days'),
    ('ae3d0000-0000-4000-8000-00000000b009', v_client, 'ae3d0000-0000-4000-8000-000000000004', 'view', '{"demo": "aesthete-demo-seed"}', now() - interval '3 days'),
    ('ae3d0000-0000-4000-8000-00000000b00a', v_client, 'ae3d0000-0000-4000-8000-000000000004', 'skip', '{"demo": "aesthete-demo-seed"}', now() - interval '3 days'),
    ('ae3d0000-0000-4000-8000-00000000b00b', v_client, 'a0000000-0000-0000-0000-000000000010', 'view', '{"demo": "aesthete-demo-seed"}', now() - interval '2 days'),
    ('ae3d0000-0000-4000-8000-00000000b00c', v_client, 'ae3d0000-0000-4000-8000-000000000002', 'view', '{"demo": "aesthete-demo-seed"}', now() - interval '2 days'),
    ('ae3d0000-0000-4000-8000-00000000b00d', v_client, 'ae3d0000-0000-4000-8000-000000000002', 'save', '{"demo": "aesthete-demo-seed"}', now() - interval '2 days'),
    ('ae3d0000-0000-4000-8000-00000000b00e', v_client, 'ae3d0000-0000-4000-8000-000000000005', 'view', '{"demo": "aesthete-demo-seed"}', now() - interval '1 day')
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'aesthete-demo-seed: done — 8 published + 2 draft-only products, 8 material pairs, 6 portfolio items, judgments/corrections, client profile + 14 interactions.';
END $seed$;

commit;

-- Pull the new interactions into the F10 matview (function is SECURITY
-- DEFINER, service_role-granted; psql-as-postgres may call it directly).
-- Outside the transaction: harmless if it fails on an unmigrated DB.
SELECT refresh_product_behavior_stats();

-- ── readback ──────────────────────────────────────────────────────────────────
SELECT '— demo catalog —' AS section;
SELECT count(*) FILTER (WHERE status = 'published')  AS published,
       count(*) FILTER (WHERE status = 'in_review')  AS draft_only
  FROM products WHERE id::text LIKE 'ae3d0000-%';
SELECT '— coverage —' AS section;
SELECT (SELECT count(*) FROM product_style_spectrum)                                        AS canonical_spectrums,
       (SELECT count(*) FROM product_dna)                                                   AS dna_rows,
       (SELECT count(*) FROM product_dna_drafts)                                            AS drafts,
       (SELECT count(*) FROM material_compatibility)                                        AS material_pairs,
       (SELECT count(*) FROM taste_judgments
         WHERE session_id = 'ae3d0000-0000-4000-8000-00000000e5e5')                         AS demo_judgments,
       (SELECT count(*) FROM taste_corrections WHERE free_text LIKE '[aesthete-demo]%')     AS demo_corrections,
       (SELECT count(*) FROM designer_portfolio_items
         WHERE designer_id = 'a0000000-0000-0000-0000-000000000004')                        AS portfolio_items,
       (SELECT count(*) FROM interactions WHERE id::text LIKE 'ae3d0000-%')                 AS demo_interactions,
       (SELECT count(*) FROM product_behavior_stats)                                        AS behavior_stats_rows;
