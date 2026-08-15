-- ═══════════════════════════════════════════════════════════════════════════
-- Match RPC tests (migration 00244) — THE deterministic ranking suite
--
-- Exercises design §10 (+ §9.2 dial, §5.5 tables, salvage §b/§c/§e):
--   1. Rule-predicate evaluator unit checks (all/any/ops/fail-closed).
--   2. Anon quiz → get_aesthete_matches over a controlled 14-product
--      'bench' fixture set: exact top-1 for the warm/craft profile.
--   3. Why payload law: ≤ 3 reasons, ≥ 1 concrete (material/price/room
--      terms), NO digits and no standalone "AI" in any phrase; blend block
--      carries w=0 / house v1; T_taste absent from terms (both thetas NULL
--      → neutral degrade, term dropped from renormalization).
--   4. Exploration: exactly 2 stretch slots at limit 10 (ranks 9–10),
--      stretch_axis named; DETERMINISM — two same-day calls return
--      identical rankings + flags (hashtext(session_key || date) seed).
--   5. Hard filters: price > 1.25·budget_max excluded; personal-layer
--      product invisible to anon (catalog+published only); taste_rules
--      action='block' removes matching products.
--   6. match_events: one row per call, results carry per-term
--      contributions, latency_ms present, source='quiz' for anon; RLS =
--      admin-only SELECT (designer sees zero rows).
--   7. Unknown session_key raises the 404-style P0002.
--   8. aesthete_search seam: FTS hit + layer-awareness via RLS (invoker).
--
-- Uses the seeded dev accounts (supabase/seed/dev-accounts.sql).
-- Run after `supabase db reset` so seeds are present.
--
-- How to run:
--   scripts/run-supabase-sql-test.sh supabase/tests/aesthete/match_rpc_test.sql
--
-- The script wraps everything in a single transaction and ROLLBACKs at the
-- end so it can be re-run without side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── helpers ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.assume_anon()
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO anon, authenticated;

-- ─── fixtures: a controlled 'bench' category ────────────────────────────────
-- Client profile (below) comes out of the §7.2 loadings math as:
--   warmth .74 · complexity −.50 · formality −.26 · timelessness .53 ·
--   boldness −.30 · craftsmanship .63 · budget 500000–1500000 (ω .7)
-- b01 carries EXACTLY that spectrum + wood + kids-durability + patina DNA →
-- must be top-1. b13 prices past 1.25·budget_max; b14 is personal-layer.

SELECT public.aesthete_dev_demo_seed();  -- idempotent; rolled back with us

INSERT INTO products (id, name, description, category, price_retail, layer, status,
                      patina_managed, brand, materials, source_url, captured_by,
                      captured_at, published_at, quality_score)
SELECT x.id::uuid, x.nm, 'match-suite fixture', 'bench', x.price, x.layer, x.status,
       (x.layer = 'catalog'), x.brand, x.mats, 'http://test.invalid/bench/' || x.nm,
       'a0000000-0000-0000-0000-000000000004', now(),
       CASE WHEN x.status = 'published' THEN now() END, 70
FROM (VALUES
  ('ae2a4000-0000-4000-8000-0000000000b1', 'Bench Warmcraft', 800000, 'catalog', 'published', 'B01', ARRAY['White oak']),
  ('ae2a4000-0000-4000-8000-0000000000b2', 'Bench Coolsteel', 800000, 'catalog', 'published', 'B02', ARRAY['Steel']),
  ('ae2a4000-0000-4000-8000-0000000000b3', 'Bench Three',     800000, 'catalog', 'published', 'B03', ARRAY['Walnut']),
  ('ae2a4000-0000-4000-8000-0000000000b4', 'Bench Four',      800000, 'catalog', 'published', 'B04', ARRAY['Glass']),
  ('ae2a4000-0000-4000-8000-0000000000b5', 'Bench Five',      800000, 'catalog', 'published', 'B05', ARRAY['Marble']),
  ('ae2a4000-0000-4000-8000-0000000000b6', 'Bench Six',       800000, 'catalog', 'published', 'B06', ARRAY['Steel']),
  ('ae2a4000-0000-4000-8000-0000000000b7', 'Bench Seven',     800000, 'catalog', 'published', 'B07', ARRAY['Rattan']),
  ('ae2a4000-0000-4000-8000-0000000000b8', 'Bench Eight',     800000, 'catalog', 'published', 'B08', ARRAY['Leather']),
  ('ae2a4000-0000-4000-8000-0000000000b9', 'Bench Nine',      800000, 'catalog', 'published', 'B09', ARRAY['Ceramic']),
  ('ae2a4000-0000-4000-8000-0000000000c1', 'Bench Ten',       800000, 'catalog', 'published', 'B10', ARRAY['Linen']),
  ('ae2a4000-0000-4000-8000-0000000000c2', 'Bench Eleven',    800000, 'catalog', 'published', 'B11', ARRAY['Iron']),
  ('ae2a4000-0000-4000-8000-0000000000c3', 'Bench Twelve',    800000, 'catalog', 'published', 'B12', ARRAY['Pine']),
  ('ae2a4000-0000-4000-8000-0000000000d3', 'Bench Overbudget', 2000000, 'catalog', 'published', 'B13', ARRAY['White oak']),
  ('ae2a4000-0000-4000-8000-0000000000d4', 'Bench Personal',  800000, 'personal', 'draft', 'B14', ARRAY['White oak'])
) x(id, nm, price, layer, status, brand, mats);

UPDATE products SET owner_user_id = 'a0000000-0000-0000-0000-000000000004'
 WHERE id = 'ae2a4000-0000-4000-8000-0000000000d4';

INSERT INTO product_style_spectrum
  (product_id, warmth, complexity, formality, timelessness, boldness, craftsmanship, assigned_by, source)
SELECT x.id::uuid, x.w, x.c, x.f, x.t, x.b, x.cr,
       'a0000000-0000-0000-0000-000000000004', 'manual'
FROM (VALUES
  ('ae2a4000-0000-4000-8000-0000000000b1',  0.74, -0.50, -0.26,  0.53, -0.30,  0.63),
  ('ae2a4000-0000-4000-8000-0000000000b2', -0.70, -0.40,  0.30,  0.00,  0.20,  0.00),
  ('ae2a4000-0000-4000-8000-0000000000b3',  0.50, -0.30, -0.20,  0.40, -0.20,  0.50),
  ('ae2a4000-0000-4000-8000-0000000000b4',  0.20,  0.00,  0.00,  0.20,  0.00,  0.30),
  ('ae2a4000-0000-4000-8000-0000000000b5', -0.20,  0.40,  0.50, -0.30,  0.60,  0.10),
  ('ae2a4000-0000-4000-8000-0000000000b6',  0.60, -0.40, -0.30,  0.50, -0.25,  0.55),
  ('ae2a4000-0000-4000-8000-0000000000b7',  0.00,  0.30, -0.50,  0.10,  0.50,  0.70),
  ('ae2a4000-0000-4000-8000-0000000000b8', -0.50, -0.20,  0.60,  0.30, -0.10,  0.20),
  ('ae2a4000-0000-4000-8000-0000000000b9',  0.30,  0.50,  0.20, -0.20,  0.40,  0.40),
  ('ae2a4000-0000-4000-8000-0000000000c1',  0.10, -0.10,  0.10,  0.00,  0.10,  0.10),
  ('ae2a4000-0000-4000-8000-0000000000c2', -0.35,  0.25, -0.15,  0.15,  0.35,  0.30),
  ('ae2a4000-0000-4000-8000-0000000000c3',  0.45,  0.10, -0.40,  0.35,  0.05,  0.45),
  ('ae2a4000-0000-4000-8000-0000000000d3',  0.74, -0.50, -0.26,  0.53, -0.30,  0.63),
  ('ae2a4000-0000-4000-8000-0000000000d4',  0.74, -0.50, -0.26,  0.53, -0.30,  0.63)
) x(id, w, c, f, t, b, cr)
ON CONFLICT (product_id) DO NOTHING;

INSERT INTO product_dna
  (product_id, patina_potential, material_honesty, craftsmanship_tier, color_temperature,
   dominant_color, durability_for, maintenance_reality, value_story, provenance_story)
VALUES
  ('ae2a4000-0000-4000-8000-0000000000b1', 0.90, 0.90, 0.90, 0.60, 'warm oak',
   ARRAY['kids','pets'], '{"kids": "fine"}', 'Built to outlast its first house.',
   'Bench-made from estate oak.'),
  ('ae2a4000-0000-4000-8000-0000000000b3', 0.50, 0.60, 0.60, 0.40, 'walnut', NULL, '{}', NULL, NULL)
ON CONFLICT (product_id) DO NOTHING;

-- ─── assertions ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  u_designer uuid := 'a0000000-0000-0000-0000-000000000004';
  key1 uuid := 'ae2a4000-aaaa-4000-8000-000000000001';
  b1 uuid := 'ae2a4000-0000-4000-8000-0000000000b1';
  b_over uuid := 'ae2a4000-0000-4000-8000-0000000000d3';
  b_personal uuid := 'ae2a4000-0000-4000-8000-0000000000d4';
  combo jsonb := '{"visual_resonance": "warm_minimal", "lifestyle": ["family"], "material": "weathered_oak", "investment": "heirloom", "catalyst": "new_home"}';
  v_json jsonb;
  v_count int;
  v_events_before int;
  v_run1 jsonb;
  v_run2 jsonb;
  v_row record;
  v_reason jsonb;
  v_rule uuid;
  v_raised boolean;
  attrs jsonb := '{"warmth": 0.8, "complexity": -0.2, "category": "bench", "brand": "B01", "materials": ["White oak"], "price_retail": 800000}';
BEGIN
  -- ── 1. rule-predicate evaluator (salvage §c vocabulary) ──
  ASSERT _aesthete_rule_matches('{"all": [{"attr": "warmth", "gte": 0.5}]}'::jsonb, attrs),
    'rule: all/gte should match';
  ASSERT NOT _aesthete_rule_matches('{"all": [{"attr": "warmth", "gte": 0.9}]}'::jsonb, attrs),
    'rule: gte above value should not match';
  ASSERT _aesthete_rule_matches(
    '{"all": [{"attr": "warmth", "gte": 0.5}, {"attr": "complexity", "lte": 0}]}'::jsonb, attrs),
    'rule: multi-condition all should match';
  ASSERT _aesthete_rule_matches('{"any": [{"attr": "warmth", "lt": 0}, {"attr": "brand", "eq": "B01"}]}'::jsonb, attrs),
    'rule: any with one true arm should match';
  ASSERT _aesthete_rule_matches('{"all": [{"attr": "category", "in": ["bench", "sofa"]}]}'::jsonb, attrs),
    'rule: in-list should match';
  ASSERT _aesthete_rule_matches('{"all": [{"attr": "materials", "contains": "White oak"}]}'::jsonb, attrs),
    'rule: array contains should match';
  ASSERT NOT _aesthete_rule_matches('{"all": [{"attr": "missing_attr", "gte": 0}]}'::jsonb, attrs),
    'rule: missing attr fails closed';
  ASSERT NOT _aesthete_rule_matches('{"nonsense": true}'::jsonb, attrs),
    'rule: malformed predicate fails closed';
  ASSERT NOT _aesthete_rule_matches('{"all": [{"attr": "warmth"}]}'::jsonb, attrs),
    'rule: op-less condition fails closed';

  -- ── 2. anon quiz → matches over the bench fixture ──
  PERFORM pg_temp.assume_anon();
  v_json := submit_style_quiz(key1, combo, '{}', 'marketing_site', '{}');
  ASSERT (v_json->'spectrums'->>'warmth')::real > 0.7, 'quiz: warm profile expected';

  SELECT count(*) INTO v_events_before FROM match_events;  -- (counts as anon: RLS…
  PERFORM pg_temp.reset_role();
  SELECT count(*) INTO v_events_before FROM match_events;  -- …so recount as postgres)
  PERFORM pg_temp.assume_anon();

  -- run 1
  SELECT jsonb_agg(jsonb_build_object('pid', m.product_id, 'rank', m.rank, 'ex', m.is_exploration)
                   ORDER BY m.rank) INTO v_run1
    FROM get_aesthete_matches(p_session_key := key1, p_category := 'bench', p_limit := 10) m;
  ASSERT jsonb_array_length(v_run1) = 10, 'expected 10 rows, got ' || jsonb_array_length(v_run1);
  ASSERT (v_run1->0->>'pid')::uuid = b1,
    'exact top-1: warm/craft bench expected first, got ' || (v_run1->0->>'pid');

  -- exploration: exactly 2 at limit 10, at ranks 9 and 10
  SELECT count(*) INTO v_count FROM jsonb_array_elements(v_run1) e WHERE (e->>'ex')::boolean;
  ASSERT v_count = 2, 'expected 2 exploration slots, got ' || v_count;
  ASSERT (v_run1->8->>'ex')::boolean AND (v_run1->9->>'ex')::boolean,
    'exploration slots must be the last two ranks';

  -- run 2 — same-day determinism (seeded per (session_key, current_date))
  SELECT jsonb_agg(jsonb_build_object('pid', m.product_id, 'rank', m.rank, 'ex', m.is_exploration)
                   ORDER BY m.rank) INTO v_run2
    FROM get_aesthete_matches(p_session_key := key1, p_category := 'bench', p_limit := 10) m;
  ASSERT v_run1 = v_run2, 'same-day runs must be identical (deterministic seed)';

  -- hard filters: over-budget + personal-layer absent
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_run1) e WHERE (e->>'pid')::uuid = b_over),
    'price > 1.25×budget_max must be hard-filtered';
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_run1) e WHERE (e->>'pid')::uuid = b_personal),
    'anon must see catalog-only (personal-layer leaked)';

  -- ── 3. why payload law (§10.6) on every returned row ──
  FOR v_row IN
    SELECT m.rank AS mrank, m.is_exploration AS mex, m.why AS mwhy
      FROM get_aesthete_matches(p_session_key := key1, p_category := 'bench', p_limit := 10) m
  LOOP
    ASSERT jsonb_array_length(v_row.mwhy->'top_reasons') BETWEEN 1 AND 3,
      'why: 1–3 reasons required at rank ' || v_row.mrank;
    ASSERT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_row.mwhy->'top_reasons') e
       WHERE e->>'term' IN ('material_color', 'budget', 'function', 'context', 'patina')),
      'why: at least one concrete reason required at rank ' || v_row.mrank;
    FOR v_reason IN
      SELECT e FROM jsonb_array_elements((v_row.mwhy->'top_reasons') || (v_row.mwhy->'cautions')) e
    LOOP
      ASSERT (v_reason->>'phrase') !~ '[0-9]',
        'copy law: digits in phrase "' || (v_reason->>'phrase') || '"';
      ASSERT (v_reason->>'phrase') !~* '\yAI\y',
        'copy law: "AI" in phrase "' || (v_reason->>'phrase') || '"';
    END LOOP;
    ASSERT (v_row.mwhy->'blend'->>'w')::real = 0, 'anon blend.w must be 0';
    ASSERT (v_row.mwhy->'blend'->>'house_version')::int = 1, 'blend.house_version must be 1';
    ASSERT NOT (v_row.mwhy->'terms' ? 'taste'),
      'T_taste must drop when both thetas are NULL (neutral degrade)';
    ASSERT (v_row.mwhy->>'score')::int BETWEEN 0 AND 100, 'why.score must be 0–100';
    IF v_row.mex THEN
      ASSERT v_row.mwhy->>'stretch_axis' IS NOT NULL, 'exploration rows must name a stretch axis';
    END IF;
  END LOOP;

  -- ── 4. taste_rules action='block' hard filter ──
  PERFORM pg_temp.reset_role();
  INSERT INTO taste_rules (owner_scope, designer_id, scope, predicate, action, magnitude)
  VALUES ('house', NULL, 'category', '{"all": [{"attr": "warmth", "gte": 0.7}]}', 'block', 0.1)
  RETURNING id INTO v_rule;
  UPDATE taste_rules SET scope_value = 'bench' WHERE id = v_rule;

  PERFORM pg_temp.assume_anon();
  SELECT count(*) INTO v_count
    FROM get_aesthete_matches(p_session_key := key1, p_category := 'bench', p_limit := 20) m
   WHERE m.product_id = b1;
  ASSERT v_count = 0, 'block rule (warmth ≥ 0.7) must remove the warm bench';
  PERFORM pg_temp.reset_role();
  DELETE FROM taste_rules WHERE id = v_rule;

  -- ── 5. match_events: written with contributions; source; latency ──
  SELECT count(*) INTO v_count FROM match_events;
  ASSERT v_count >= v_events_before + 4, 'one match_events row per call expected';
  SELECT me.results, me.source, me.latency_ms, me.w_effective
    INTO v_row
    FROM match_events me ORDER BY me.id DESC LIMIT 1;
  ASSERT v_row.source = 'quiz', 'anon source must infer quiz, got ' || v_row.source;
  ASSERT v_row.latency_ms IS NOT NULL, 'latency_ms must be logged';
  ASSERT jsonb_array_length(v_row.results) >= 1
     AND (v_row.results->0->'terms') IS NOT NULL
     AND jsonb_typeof(v_row.results->0->'terms') = 'object',
    'results must carry per-term contributions';

  -- RLS: a non-admin designer reads zero match_events rows
  PERFORM pg_temp.assume_user(u_designer);
  SELECT count(*) INTO v_count FROM match_events;
  ASSERT v_count = 0, 'match_events must be admin-SELECT only';
  PERFORM pg_temp.reset_role();

  -- ── 6. unknown session_key raises 404-style ──
  v_raised := false;
  BEGIN
    PERFORM * FROM get_aesthete_matches(p_session_key := 'ae2a4000-dead-4000-8000-00000000dead');
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'unknown session_key must raise P0002';

  -- ── 7. aesthete_search seam: FTS + layer-awareness (invoker RLS) ──
  PERFORM pg_temp.assume_user(u_designer);
  SELECT count(*) INTO v_count FROM aesthete_search('bench', '{"category": "bench"}');
  ASSERT v_count >= 10, 'aesthete_search: FTS should find the bench fixtures, got ' || v_count;
  -- The designer OWNS the personal bench → visible; an unrelated authed user
  -- must not see it (products RLS through the invoker function).
  ASSERT EXISTS (SELECT 1 FROM aesthete_search('Bench Personal', '{}') s WHERE s.product_id = b_personal),
    'aesthete_search: owner must see own personal-layer product';
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000006');  -- manufacturer@patina.dev
  ASSERT NOT EXISTS (SELECT 1 FROM aesthete_search('Bench Personal', '{}') s WHERE s.product_id = b_personal),
    'aesthete_search: personal-layer product must not leak across users';
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'match_rpc_test: ALL ASSERTIONS PASSED';
END $$;

ROLLBACK;
