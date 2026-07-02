-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00246: Frozen-contract shims — process_style_quiz + get_recommendations
--
-- Design contract: docs/prds/AE/aesthete-engine-system-design.md §10.7
-- ("frozen contracts — iOS ships nothing") · §18 (grants) · 00067 (the
-- frozen signatures + RETURNS shapes, copied byte-for-byte below).
-- (§15.4 row "00246 quiz_bridge" — replaces the G0 reservation in place.)
--
-- What this ships:
--   1. process_style_quiz(quiz_answers jsonb, timings jsonb) → jsonb —
--      FROZEN signature; the body now delegates computation to
--      _compute_quiz_profile (00243) while keeping the legacy side-effects
--      (quiz_sessions insert + user_style_signals upsert) and returning the
--      legacy 14-key response shape unchanged.
--   2. get_recommendations(p_room_id, p_category, p_limit, p_offset) —
--      FROZEN signature AND RETURNS TABLE (byte-compatible with 00067);
--      the body is a shim: resolve the caller's client_style_profiles
--      (else bridge legacy user_style_signals into a 'derived' profile,
--      else a shared neutral profile), call get_aesthete_matches, map
--      score → 0–100 int, join the product/vendor columns iOS expects.
--
-- Documented deviations / implementation choices (flagged to the conductor):
--   • process_style_quiz response VALUES now come from the engine (keys and
--     types are unchanged): primary_style = the archetype name from the
--     styles taxonomy ('Warm Modern' vs the old hardcoded 'Warm Minimalist';
--     fallback 'Style Explorer'), confidence = the honest §7.2 profile
--     confidence (was a constant 0.75). budget_label keeps the LEGACY
--     display strings ('$500-$2K'/'$2K-$5K'/'$5K+'/'TBD') and budget_min/
--     budget_max stay in DOLLARS, exactly as 00067 returned them.
--   • Strictness: unknown Q1/Q3/Q4 option keys now RAISE (loadings-table
--     law, 00243) where 00067 silently defaulted. iOS sends the fixed
--     vocabulary; garbage now fails loudly instead of returning junk.
--   • quiz_sessions.computed_profile stores the legacy-shaped profile PLUS
--     an additive 'engine' key carrying the full §7.2 profile (additive
--     only — nothing reads computed_profile positionally).
--   • space_density keeps the legacy investment-driven write bands
--     (light/balanced/curated) for user_style_signals — 00067 behavior;
--     claim_quiz_session (00243) uses the complexity-driven vocabulary.
--   • process_style_quiz does NOT create client_style_profiles (per the
--     wave brief: legacy side-effects only). The get_recommendations shim
--     bridges user_style_signals → a source='derived' profile on first
--     call, so quiz → recommendations still personalizes end-to-end.
--   • Profile-less callers (incl. anon — 00067 grants anon) are served
--     through a shared NEUTRAL profile at a fixed session key
--     (ae460000-…e057), get-or-created inside the shim so the 00243
--     janitor purging it is self-healing. Neutral = no spectrums, no
--     budget: the match degrades to behavioral+patina-ish ordering, which
--     mirrors the old generic path.
--   • The shim sets GUC aesthete.match_source = 'ios' (transaction-local)
--     so match_events attributes these calls per §5.5.
--   • The old random ±5 score jitter is gone — scores are now real.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. process_style_quiz — FROZEN signature (00067) ────────────────────────
CREATE OR REPLACE FUNCTION process_style_quiz(
  quiz_answers JSONB,
  timings JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_profile jsonb;
  v_quiz_id uuid;
  v_warmth real; v_complexity real; v_formality real;
  v_texture real; v_openness real; v_light real;
  v_fp jsonb;
  v_aff_fabric real; v_aff_rattan real;
  v_material text; v_investment text;
  v_primary_material text;
  v_budget_label text; v_budget_min int; v_budget_max int;
  v_space_density text;
  v_color_temp text; v_formality_level text; v_palette text;
  v_legacy jsonb;
BEGIN
  -- Engine computation (00243). Unknown Q1/Q3/Q4 options raise (header note).
  v_profile := _compute_quiz_profile(quiz_answers);

  v_warmth := COALESCE((v_profile->'spectrums'->>'warmth')::real, 0);
  v_complexity := COALESCE((v_profile->'spectrums'->>'complexity')::real, 0);
  v_formality := COALESCE((v_profile->'spectrums'->>'formality')::real, 0);
  v_fp := COALESCE(v_profile->'functional_priorities', '{}'::jsonb);
  v_aff_fabric := COALESCE((v_profile->'material_affinities'->>'fabric')::real, 0);
  v_aff_rattan := COALESCE((v_profile->'material_affinities'->>'rattan')::real, 0);

  -- Legacy 0..1 signals on the documented 00243 bridge mapping.
  SELECT COALESCE(sum(m.aff * m.t) / NULLIF(sum(m.aff), 0), 0.5) INTO v_texture
    FROM (SELECT e.value::real AS aff,
                 CASE e.key WHEN 'wood' THEN 0.7 WHEN 'leather' THEN 0.8
                            WHEN 'rattan' THEN 0.6 WHEN 'fabric' THEN 0.4
                            WHEN 'metal' THEN 0.3 ELSE 0.5 END AS t
            FROM jsonb_each_text(COALESCE(v_profile->'material_affinities', '{}'::jsonb)) e) m;

  v_openness := GREATEST(0.0, LEAST(1.0,
    (1 - v_complexity) / 2
    + CASE WHEN v_fp ? 'hosting' THEN 0.1 ELSE 0 END
    + CASE WHEN v_fp->>'durability' = 'kids_pets' THEN 0.1 ELSE 0 END));
  v_light := GREATEST(0.0, LEAST(1.0, 0.5 + 0.2 * v_aff_fabric + 0.1 * v_aff_rattan));

  v_color_temp := CASE WHEN v_warmth >= 0.2 THEN 'warm' WHEN v_warmth <= -0.2 THEN 'cool' ELSE 'neutral' END;
  v_formality_level := CASE WHEN v_formality >= 0.2 THEN 'structured' WHEN v_formality <= -0.2 THEN 'relaxed' ELSE 'balanced' END;
  v_palette := CASE WHEN v_warmth >= 0.2 THEN 'Warm' WHEN v_warmth <= -0.2 THEN 'Cool' ELSE 'Neutral' END;

  -- Legacy material/budget vocabularies (00067 verbatim).
  v_material := quiz_answers->>'material';
  v_investment := quiz_answers->>'investment';
  v_primary_material := CASE v_material
    WHEN 'weathered_oak' THEN 'Oak'
    WHEN 'soft_linen' THEN 'Linen'
    WHEN 'aged_leather' THEN 'Leather'
    WHEN 'brushed_metal' THEN 'Metal'
    WHEN 'woven_rattan' THEN 'Rattan'
    ELSE 'Mixed' END;
  v_budget_label := CASE v_investment
    WHEN 'starter' THEN '$500-$2K'
    WHEN 'curated_comfort' THEN '$2K-$5K'
    WHEN 'heirloom' THEN '$5K+'
    WHEN 'discuss' THEN 'TBD'
    ELSE '$2K-$5K' END;
  v_budget_min := COALESCE(((v_profile->'budget'->>'min_cents')::bigint / 100)::int,
    CASE v_investment WHEN 'starter' THEN 500 WHEN 'heirloom' THEN 5000
                      WHEN 'discuss' THEN 0 ELSE 2000 END);
  v_budget_max := COALESCE(((v_profile->'budget'->>'max_cents')::bigint / 100)::int,
    CASE v_investment WHEN 'starter' THEN 2000 WHEN 'heirloom' THEN 15000
                      WHEN 'discuss' THEN 0 ELSE 5000 END);
  v_space_density := CASE v_investment
    WHEN 'starter' THEN 'light'
    WHEN 'heirloom' THEN 'curated'
    ELSE 'balanced' END;

  -- The legacy 14-key response shape (00067) — keys and types unchanged.
  v_legacy := jsonb_build_object(
    'primary_style', COALESCE(v_profile->'archetype'->>'primary', 'Style Explorer'),
    'primary_material', v_primary_material,
    'palette_warmth', v_palette,
    'budget_label', v_budget_label,
    'budget_min', v_budget_min,
    'budget_max', v_budget_max,
    'confidence', COALESCE((v_profile->>'confidence')::real, 0.5),
    'warmth', GREATEST(0.0, LEAST(1.0, (v_warmth + 1) / 2)),
    'openness', v_openness,
    'texture', v_texture,
    'natural_light', v_light,
    'formality', v_formality_level,
    'color_temperature', v_color_temp,
    'space_density', v_space_density
  );

  -- Legacy side-effect 1: quiz session (computed_profile = legacy shape +
  -- additive engine key, header note).
  INSERT INTO quiz_sessions (user_id, responses, computed_profile, completed_at)
  VALUES (v_user,
          jsonb_build_object('answers', quiz_answers, 'timings', COALESCE(timings, '{}'::jsonb)),
          v_legacy || jsonb_build_object('engine', v_profile),
          now())
  RETURNING id INTO v_quiz_id;

  -- Legacy side-effect 2: user_style_signals upsert (FK → profiles).
  IF v_user IS NOT NULL AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = v_user) THEN
    INSERT INTO user_style_signals (
      user_id, warmth_preference, openness_preference, texture_preference,
      natural_light_preference, formality_level, color_temperature, space_density,
      last_calculated_at
    ) VALUES (
      v_user, GREATEST(0.0, LEAST(1.0, (v_warmth + 1) / 2)), v_openness, v_texture,
      v_light, v_formality_level, v_color_temp, v_space_density,
      now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      warmth_preference        = EXCLUDED.warmth_preference,
      openness_preference      = EXCLUDED.openness_preference,
      texture_preference       = EXCLUDED.texture_preference,
      natural_light_preference = EXCLUDED.natural_light_preference,
      formality_level          = EXCLUDED.formality_level,
      color_temperature        = EXCLUDED.color_temperature,
      space_density            = EXCLUDED.space_density,
      last_calculated_at       = now(),
      updated_at               = now();
  END IF;

  RETURN v_legacy;
END $fn$;

COMMENT ON FUNCTION process_style_quiz(jsonb, jsonb) IS
  'FROZEN iOS contract (00067 signature + response keys; design §10.7): body now delegates to _compute_quiz_profile (quiz v2, loadings-as-data) while writing the legacy quiz_sessions + user_style_signals side-effects and returning the legacy 14-key shape. iOS ships nothing.';

GRANT EXECUTE ON FUNCTION process_style_quiz(jsonb, jsonb) TO authenticated;

-- ─── 2. get_recommendations — FROZEN signature + RETURNS shape (00067) ───────
CREATE OR REPLACE FUNCTION get_recommendations(
  p_room_id UUID DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id TEXT,
  name TEXT,
  price_cents INT,
  match_score INT,
  maker_name TEXT,
  maker_location TEXT,
  maker_story TEXT,
  image_url TEXT,
  usdz_url TEXT,
  style_tags TEXT[],
  material_tags TEXT[],
  badges TEXT[],
  category TEXT,
  tier TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_sk uuid;
  v_neutral uuid := 'ae460000-0000-4000-8000-00000000e057';  -- shared neutral profile key
  v_signals user_style_signals;
BEGIN
  -- 1. The caller's current engine profile, newest first.
  IF v_user IS NOT NULL THEN
    SELECT csp.session_key INTO v_sk
      FROM client_style_profiles csp
     WHERE csp.user_id = v_user AND csp.is_current
     ORDER BY csp.updated_at DESC
     LIMIT 1;

    -- 2. Bridge legacy user_style_signals → a 'derived' profile (§10.7).
    --    Inverse of the 00243 claim mapping: warmth = 2·warmth01 − 1,
    --    complexity = 1 − 2·openness, formality from the level bands; only
    --    those three dims carry (low) confidence — the rest drop in scoring.
    IF v_sk IS NULL THEN
      SELECT uss.* INTO v_signals FROM user_style_signals uss WHERE uss.user_id = v_user;
      IF FOUND THEN
        v_sk := gen_random_uuid();
        INSERT INTO client_style_profiles
          (user_id, session_key, source, warmth, complexity, formality,
           spectrum_confidence, budget, confidence, is_current, version)
        VALUES
          (v_user, v_sk, 'derived',
           GREATEST(-1.0, LEAST(1.0, 2 * COALESCE(v_signals.warmth_preference, 0.5) - 1))::real,
           GREATEST(-1.0, LEAST(1.0, 1 - 2 * COALESCE(v_signals.openness_preference, 0.5)))::real,
           CASE v_signals.formality_level WHEN 'structured' THEN 0.4 WHEN 'relaxed' THEN -0.4 ELSE 0 END::real,
           '{"warmth": 0.4, "complexity": 0.3, "formality": 0.3}'::jsonb,
           '{}'::jsonb, 0.3, true, 1);
      END IF;
    END IF;
  END IF;

  -- 3. Neutral shared profile (anon / signal-less callers) — get-or-create
  --    at a fixed key so the 00243 janitor purging it self-heals.
  IF v_sk IS NULL THEN
    SELECT csp.session_key INTO v_sk
      FROM client_style_profiles csp
     WHERE csp.session_key = v_neutral AND csp.is_current;
    IF v_sk IS NULL THEN
      INSERT INTO client_style_profiles
        (session_key, source, spectrum_confidence, budget, confidence, is_current, version)
      VALUES (v_neutral, 'derived', '{}'::jsonb, '{}'::jsonb, 0.2, true, 1)
      ON CONFLICT DO NOTHING;
      v_sk := v_neutral;
    END IF;
  END IF;

  -- match_events attribution (§5.5): these calls are the iOS path.
  PERFORM set_config('aesthete.match_source', 'ios', true);

  RETURN QUERY
  SELECT p.id::text,
         p.name,
         COALESCE(p.price_retail, 0) AS price_cents,
         LEAST(100, GREATEST(0, round((m.score * 100)::numeric)))::int AS match_score,
         COALESCE(v.name, 'Unknown Maker') AS maker_name,
         v.made_in AS maker_location,
         v.brand_story::text AS maker_story,
         CASE WHEN p.images IS NOT NULL AND array_length(p.images, 1) > 0
              THEN p.images[1] END AS image_url,
         NULL::text AS usdz_url,
         COALESCE(p.style_tags, ARRAY[]::text[]) AS style_tags,
         COALESCE(p.materials, ARRAY[]::text[]) AS material_tags,
         COALESCE(p.tags, ARRAY[]::text[]) AS badges,
         COALESCE(p.category, 'decor') AS category,
         CASE
           WHEN COALESCE(p.quality_score, 0) >= 80 THEN 'designer_selection'
           WHEN p.published_at IS NOT NULL THEN 'style_match'
           ELSE 'new_arrival'
         END AS tier
    FROM get_aesthete_matches(
           p_session_key := v_sk,
           p_category := p_category,
           p_room_id := p_room_id,
           p_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50),
           p_offset := GREATEST(COALESCE(p_offset, 0), 0)) m
    JOIN products p ON p.id = m.product_id
    LEFT JOIN vendors v ON p.vendor_id = v.id
   ORDER BY m.rank;
END $fn$;

COMMENT ON FUNCTION get_recommendations(uuid, text, int, int) IS
  'FROZEN iOS contract (00067 signature + RETURNS TABLE, byte-compatible; design §10.7): shim over get_aesthete_matches. Resolves the caller''s client_style_profiles, else bridges legacy user_style_signals into a derived profile, else serves the shared neutral profile; maps engine score → 0–100 int and joins the product/vendor columns iOS reads. Sets aesthete.match_source=ios for match_events.';

GRANT EXECUTE ON FUNCTION get_recommendations(uuid, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION get_recommendations(uuid, text, int, int) TO anon;
