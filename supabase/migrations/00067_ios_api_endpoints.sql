-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: iOS API Endpoints
-- Description: Creates interactions table, process_style_quiz RPC, and
--              get_recommendations RPC for the Patina iOS app
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. INTERACTIONS TABLE
-- Lightweight table for iOS product interactions, synced to engagement_events
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'save', 'skip', 'ar_place', 'dwell', 'share')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interactions_user ON interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_interactions_product ON interactions(product_id);
CREATE INDEX IF NOT EXISTS idx_interactions_type ON interactions(event_type);
CREATE INDEX IF NOT EXISTS idx_interactions_created ON interactions(created_at DESC);

-- RLS
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own interactions" ON interactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own interactions" ON interactions
  FOR SELECT USING (auth.uid() = user_id);

-- Trigger: sync interactions to engagement_events for unified analytics
CREATE OR REPLACE FUNCTION sync_interaction_to_engagement()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO engagement_events (user_id, event_name, event_properties, platform, created_at)
  VALUES (
    NEW.user_id,
    'product_' || NEW.event_type,
    jsonb_build_object('product_id', NEW.product_id) || COALESCE(NEW.metadata, '{}'::jsonb),
    'ios',
    NEW.created_at
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_interaction
  AFTER INSERT ON interactions
  FOR EACH ROW
  EXECUTE FUNCTION sync_interaction_to_engagement();


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. PROCESS STYLE QUIZ RPC
-- Takes quiz answers, computes style signals, persists to quiz_sessions
-- and user_style_signals, returns computed profile
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION process_style_quiz(
  quiz_answers JSONB,
  timings JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_visual TEXT;
  v_lifestyle TEXT[];
  v_material TEXT;
  v_investment TEXT;
  v_catalyst TEXT;
  v_warmth FLOAT := 0.5;
  v_openness FLOAT := 0.5;
  v_texture FLOAT := 0.5;
  v_natural_light FLOAT := 0.5;
  v_formality TEXT := 'balanced';
  v_color_temp TEXT := 'neutral';
  v_space_density TEXT := 'balanced';
  v_primary_style TEXT;
  v_primary_material TEXT;
  v_palette_warmth TEXT;
  v_budget_label TEXT;
  v_budget_min INT;
  v_budget_max INT;
  v_confidence FLOAT := 0.75;
  v_profile JSONB;
  v_quiz_id UUID;
BEGIN
  -- Extract answers
  v_visual := quiz_answers->>'visual_resonance';
  v_lifestyle := ARRAY(SELECT jsonb_array_elements_text(quiz_answers->'lifestyle'));
  v_material := quiz_answers->>'material';
  v_investment := quiz_answers->>'investment';
  v_catalyst := quiz_answers->>'catalyst';

  -- Map visual resonance to style signals
  CASE v_visual
    WHEN 'warm_minimal' THEN
      v_warmth := 0.8; v_texture := 0.5; v_openness := 0.7;
      v_primary_style := 'Warm Minimalist';
      v_color_temp := 'warm';
    WHEN 'cool_modern' THEN
      v_warmth := 0.3; v_texture := 0.3; v_openness := 0.8;
      v_primary_style := 'Cool Modern';
      v_color_temp := 'cool';
    WHEN 'classic_comfort' THEN
      v_warmth := 0.7; v_texture := 0.7; v_openness := 0.4;
      v_primary_style := 'Classic Comfort';
      v_color_temp := 'warm';
    WHEN 'eclectic_curated' THEN
      v_warmth := 0.6; v_texture := 0.8; v_openness := 0.5;
      v_primary_style := 'Eclectic Curated';
      v_color_temp := 'neutral';
    ELSE
      v_primary_style := 'Style Explorer';
  END CASE;

  -- Map material preference
  CASE v_material
    WHEN 'weathered_oak' THEN
      v_texture := GREATEST(v_texture, 0.7); v_warmth := v_warmth + 0.05;
      v_primary_material := 'Oak';
    WHEN 'soft_linen' THEN
      v_texture := LEAST(v_texture, 0.4); v_natural_light := 0.7;
      v_primary_material := 'Linen';
    WHEN 'aged_leather' THEN
      v_texture := GREATEST(v_texture, 0.8);
      v_primary_material := 'Leather';
    WHEN 'brushed_metal' THEN
      v_texture := LEAST(v_texture, 0.3); v_color_temp := 'cool';
      v_primary_material := 'Metal';
    WHEN 'woven_rattan' THEN
      v_texture := GREATEST(v_texture, 0.6); v_natural_light := 0.6;
      v_primary_material := 'Rattan';
    ELSE
      v_primary_material := 'Mixed';
  END CASE;

  -- Map lifestyle to openness/formality
  IF 'entertaining' = ANY(v_lifestyle) THEN
    v_openness := v_openness + 0.1;
  END IF;
  IF 'sanctuary' = ANY(v_lifestyle) THEN
    v_formality := 'relaxed';
  END IF;
  IF 'work_from_home' = ANY(v_lifestyle) THEN
    v_formality := 'structured';
  END IF;
  IF 'family' = ANY(v_lifestyle) THEN
    v_openness := v_openness + 0.1; v_formality := 'relaxed';
  END IF;

  -- Map investment level
  CASE v_investment
    WHEN 'starter' THEN
      v_budget_label := '$500-$2K'; v_budget_min := 500; v_budget_max := 2000;
      v_space_density := 'light';
    WHEN 'curated_comfort' THEN
      v_budget_label := '$2K-$5K'; v_budget_min := 2000; v_budget_max := 5000;
      v_space_density := 'balanced';
    WHEN 'heirloom' THEN
      v_budget_label := '$5K+'; v_budget_min := 5000; v_budget_max := 15000;
      v_space_density := 'curated';
    WHEN 'discuss' THEN
      v_budget_label := 'TBD'; v_budget_min := 0; v_budget_max := 0;
      v_space_density := 'balanced';
    ELSE
      v_budget_label := '$2K-$5K'; v_budget_min := 2000; v_budget_max := 5000;
  END CASE;

  -- Clamp values
  v_warmth := LEAST(GREATEST(v_warmth, 0.0), 1.0);
  v_openness := LEAST(GREATEST(v_openness, 0.0), 1.0);
  v_texture := LEAST(GREATEST(v_texture, 0.0), 1.0);
  v_natural_light := LEAST(GREATEST(v_natural_light, 0.0), 1.0);

  -- Warmth label
  IF v_warmth >= 0.6 THEN v_palette_warmth := 'Warm';
  ELSIF v_warmth <= 0.4 THEN v_palette_warmth := 'Cool';
  ELSE v_palette_warmth := 'Neutral';
  END IF;

  -- Build profile
  v_profile := jsonb_build_object(
    'primary_style', v_primary_style,
    'primary_material', v_primary_material,
    'palette_warmth', v_palette_warmth,
    'budget_label', v_budget_label,
    'budget_min', v_budget_min,
    'budget_max', v_budget_max,
    'confidence', v_confidence,
    'warmth', v_warmth,
    'openness', v_openness,
    'texture', v_texture,
    'natural_light', v_natural_light,
    'formality', v_formality,
    'color_temperature', v_color_temp,
    'space_density', v_space_density
  );

  -- Save quiz session
  INSERT INTO quiz_sessions (user_id, responses, computed_profile, completed_at)
  VALUES (v_user_id, jsonb_build_object('answers', quiz_answers, 'timings', timings), v_profile, NOW())
  RETURNING id INTO v_quiz_id;

  -- Upsert style signals
  INSERT INTO user_style_signals (
    user_id, warmth_preference, openness_preference, texture_preference,
    natural_light_preference, formality_level, color_temperature, space_density,
    last_calculated_at
  ) VALUES (
    v_user_id, v_warmth, v_openness, v_texture,
    v_natural_light, v_formality, v_color_temp, v_space_density,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    warmth_preference = EXCLUDED.warmth_preference,
    openness_preference = EXCLUDED.openness_preference,
    texture_preference = EXCLUDED.texture_preference,
    natural_light_preference = EXCLUDED.natural_light_preference,
    formality_level = EXCLUDED.formality_level,
    color_temperature = EXCLUDED.color_temperature,
    space_density = EXCLUDED.space_density,
    last_calculated_at = NOW(),
    updated_at = NOW();

  RETURN v_profile;
END;
$$;

GRANT EXECUTE ON FUNCTION process_style_quiz TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. GET RECOMMENDATIONS RPC
-- Returns products with match scores, joined with vendor info,
-- formatted for direct consumption by iOS Product model
-- ═══════════════════════════════════════════════════════════════════════════

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
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_warmth FLOAT := 0.5;
  v_openness FLOAT := 0.5;
  v_texture FLOAT := 0.5;
  v_user_styles TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Fetch user style signals if available
  SELECT
    COALESCE(uss.warmth_preference, 0.5),
    COALESCE(uss.openness_preference, 0.5),
    COALESCE(uss.texture_preference, 0.5)
  INTO v_warmth, v_openness, v_texture
  FROM user_style_signals uss
  WHERE uss.user_id = v_user_id;

  -- Derive preferred style names from signals
  IF v_warmth > 0.6 AND v_texture < 0.5 THEN
    v_user_styles := ARRAY['warm_minimal', 'scandinavian', 'mid_century'];
  ELSIF v_warmth > 0.6 THEN
    v_user_styles := ARRAY['classic_comfort', 'warm_minimal', 'eclectic_curated'];
  ELSIF v_warmth < 0.4 THEN
    v_user_styles := ARRAY['cool_modern', 'industrial', 'contemporary'];
  ELSE
    v_user_styles := ARRAY['warm_minimal', 'scandinavian', 'classic_comfort', 'cool_modern'];
  END IF;

  -- If room provided, blend room style signals
  IF p_room_id IS NOT NULL THEN
    SELECT
      COALESCE((r.style_signals->>'warmth')::FLOAT, v_warmth)
    INTO v_warmth
    FROM rooms r
    WHERE r.id = p_room_id AND r.user_id = v_user_id;
  END IF;

  RETURN QUERY
  SELECT
    p.id::TEXT,
    p.name,
    COALESCE(p.price_retail, 0) AS price_cents,
    -- Compute match score (0-100)
    LEAST(100, GREATEST(0, (
      -- Base score from quality
      COALESCE(p.quality_score, 50)
      -- Style tag overlap bonus (up to +30)
      + CASE
          WHEN p.style_tags IS NOT NULL AND array_length(p.style_tags, 1) > 0 THEN
            (SELECT COUNT(*)::INT * 10 FROM unnest(p.style_tags) st WHERE st = ANY(v_user_styles))
          ELSE 0
        END
      -- Image presence bonus
      + CASE WHEN p.images IS NOT NULL AND array_length(p.images, 1) > 0 THEN 5 ELSE 0 END
      -- Price presence bonus
      + CASE WHEN p.price_retail IS NOT NULL AND p.price_retail > 0 THEN 3 ELSE 0 END
      -- Small random jitter for variety
      + (random() * 5)::INT
    )))::INT AS match_score,
    COALESCE(v.name, 'Unknown Maker') AS maker_name,
    v.made_in AS maker_location,
    v.brand_story::TEXT AS maker_story,
    CASE WHEN p.images IS NOT NULL AND array_length(p.images, 1) > 0
      THEN p.images[1] ELSE NULL END AS image_url,
    NULL::TEXT AS usdz_url,  -- No USDZ URLs in DB yet
    COALESCE(p.style_tags, ARRAY[]::TEXT[]) AS style_tags,
    COALESCE(p.materials, ARRAY[]::TEXT[]) AS material_tags,
    COALESCE(p.tags, ARRAY[]::TEXT[]) AS badges,
    COALESCE(p.category, 'decor') AS category,
    CASE
      WHEN COALESCE(p.quality_score, 0) >= 80 THEN 'designer_selection'
      WHEN p.published_at IS NOT NULL THEN 'style_match'
      ELSE 'new_arrival'
    END AS tier
  FROM products p
  LEFT JOIN vendors v ON p.vendor_id = v.id
  WHERE
    (p_category IS NULL OR p.category = p_category)
    AND COALESCE(p.status, 'published') = 'published'
  ORDER BY match_score DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION get_recommendations TO authenticated;
GRANT EXECUTE ON FUNCTION get_recommendations TO anon;
