-- ═══════════════════════════════════════════════════════════════════════════
-- Why-phrase breadth tests (migration 00251)
--
-- Exercises design §10.6 (the "why" copy) for the staged breadth layer:
--   1. Structure: why_phrase_alts is seeded; every seeded (term, band) carries
--      ≥ 4 variants (variant 0 = canonical + ≥ 3 alternates); variant 0 mirrors
--      the shipped why_phrases template exactly.
--   2. Copy law (§10.6): NO digits and NO standalone "AI" in any alternate.
--   3. Selector _ae_pick_why_phrase:
--      (a) returns a member of the (term, band) pool for a seeded pair;
--      (b) DETERMINISTIC — same (term, band, seed) → identical result twice;
--      (c) BREADTH — distinct seeds produce more than one distinct phrase for a
--          high-variety pair (the whole point of the flag);
--      (d) FALLBACK — a (term, band) with no alternates returns the canonical
--          why_phrases template unchanged (safe 1:1 drop-in for the RPC).
--
-- Convention: single transaction, plpgsql ASSERT, final ROLLBACK. Property
-- assertions (seed-robust) — no absolute row counts beyond the seeded set.
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/aesthete/why_phrases_breadth_test.sql
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_bad          text;
  v_min_variants int;
  v_a            text;
  v_b            text;
  v_distinct     int;
  v_canonical    text;
  v_seeded_pairs int;
BEGIN
  -- 1. Structure ─────────────────────────────────────────────────────────────
  SELECT count(*) INTO v_seeded_pairs
    FROM (SELECT DISTINCT term, band FROM why_phrase_alts) s;
  ASSERT v_seeded_pairs >= 8,
    'breadth: expected the exploit terms seeded, got ' || v_seeded_pairs || ' (term,band) pairs';

  -- every seeded (term, band) has variant 0 + at least 3 alternates
  SELECT min(c) INTO v_min_variants
    FROM (SELECT term, band, count(*) AS c FROM why_phrase_alts GROUP BY term, band) g;
  ASSERT v_min_variants >= 4,
    'breadth: some (term,band) has < 4 variants (need canonical + 3 alternates); min=' || v_min_variants;

  -- variant 0 must equal the shipped why_phrases copy (rotation keeps the original)
  SELECT a.term || '/' || a.band INTO v_bad
    FROM why_phrase_alts a
    JOIN why_phrases wp ON wp.term = a.term AND wp.band = a.band
   WHERE a.variant = 0 AND a.template <> wp.template
   LIMIT 1;
  ASSERT v_bad IS NULL,
    'breadth: variant 0 diverges from canonical why_phrases at ' || COALESCE(v_bad, '');

  -- 2. Copy law: no digits, no standalone "AI" ───────────────────────────────
  SELECT template INTO v_bad FROM why_phrase_alts WHERE template ~ '[0-9]' LIMIT 1;
  ASSERT v_bad IS NULL, 'copy law: digits in alternate "' || COALESCE(v_bad, '') || '"';

  SELECT template INTO v_bad FROM why_phrase_alts WHERE template ~* '\yAI\y' LIMIT 1;
  ASSERT v_bad IS NULL, 'copy law: standalone "AI" in alternate "' || COALESCE(v_bad, '') || '"';

  -- 3a. Selector returns a member of the pool ────────────────────────────────
  v_a := _ae_pick_why_phrase('spectrum', 'high', 'seed-alpha');
  ASSERT EXISTS (
    SELECT 1 FROM why_phrase_alts WHERE term = 'spectrum' AND band = 'high' AND template = v_a
  ), 'selector: returned "' || COALESCE(v_a, '') || '" not in the spectrum/high pool';

  -- 3b. Deterministic: same (term, band, seed) → same result ─────────────────
  v_a := _ae_pick_why_phrase('spectrum', 'high', 'a-fixed-product-id');
  v_b := _ae_pick_why_phrase('spectrum', 'high', 'a-fixed-product-id');
  ASSERT v_a = v_b, 'selector: not deterministic for a fixed seed';

  -- 3c. Breadth: distinct seeds yield > 1 distinct phrase ─────────────────────
  SELECT count(DISTINCT _ae_pick_why_phrase('spectrum', 'high', g::text))
    INTO v_distinct
    FROM generate_series(1, 200) g;
  ASSERT v_distinct >= 2,
    'breadth: spectrum/high still monotonous across 200 seeds (distinct=' || v_distinct || ')';

  -- 3d. Fallback: an unseeded (term, band) returns the canonical copy ─────────
  SELECT template INTO v_canonical FROM why_phrases WHERE term = 'generic' AND band = 'high';
  v_a := _ae_pick_why_phrase('generic', 'high', 'any-seed');
  ASSERT v_a = v_canonical,
    'selector: fallback for generic/high should equal why_phrases ("' || COALESCE(v_canonical, '') || '"), got "' || COALESCE(v_a, '') || '"';

  RAISE NOTICE 'why_phrases_breadth_test: OK (% seeded pairs, min % variants, % distinct spectrum/high phrases)',
    v_seeded_pairs, v_min_variants, v_distinct;
END $$;

ROLLBACK;
