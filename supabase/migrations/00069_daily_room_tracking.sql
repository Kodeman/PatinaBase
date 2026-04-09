-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: The Daily Room — Data Tracking Schema
-- ═══════════════════════════════════════════════════════════════════════════
-- Adds the behavioral telemetry tables described in
-- docs/specs/Data Tracking/patina-data-architecture.md (Part 3).
--
-- New tables:
--   - daily_stories            editorial content shown in Zone 2
--   - user_room_engagement     per-user × per-room aggregates
--   - product_user_dwell       per-user × per-product dwell aggregates
--   - product_engagement       global product engagement metrics
--   - feed_cache_meta          nightly-generated ranked feed per (user, room)
--   - spatial_context          pre-rendered "why it fits" strings
--
-- Also extends the existing `interactions.event_type` check constraint to
-- allow the Daily Room Zone 4 event vocabulary, since the iOS app batches
-- many more event types than the original ('view','save','skip','ar_place',
-- 'dwell','share').
--
-- Note: products.id, rooms.id, and auth.users.id are all UUID in this
-- project (the spec used INT for product_id — adapted here).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── EXTEND interactions.event_type CHECK ──────────────────────────────────
ALTER TABLE interactions DROP CONSTRAINT IF EXISTS interactions_event_type_check;
ALTER TABLE interactions ADD CONSTRAINT interactions_event_type_check
  CHECK (event_type IN (
    -- Legacy / existing
    'view', 'save', 'skip', 'ar_place', 'dwell', 'share',
    -- Zone 2: stories
    'story_viewed', 'story_tapped', 'story_scroll_depth',
    'story_product_viewed', 'story_product_added', 'story_scrolled_past',
    -- Zone 3: room channels
    'room_channel_viewed', 'room_channel_switched', 'room_channel_dwell',
    'feed_filter_applied', 'new_picks_viewed',
    -- Zone 4: product feed
    'product_dwell', 'product_add_initiated', 'product_added_to_room',
    'product_add_cancelled', 'product_saved', 'product_material_viewed',
    'product_swiped_right', 'product_swiped_left', 'product_detail_opened',
    'product_insight_viewed', 'product_pairing_tapped', 'product_shared',
    'feed_loaded', 'feed_exhausted', 'feed_scroll_depth', 'feed_refreshed'
  ));

-- Room context for interactions (nullable; older rows won't have it).
ALTER TABLE interactions
  ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS session_id UUID;

CREATE INDEX IF NOT EXISTS idx_interactions_room ON interactions(room_id);
CREATE INDEX IF NOT EXISTS idx_interactions_session ON interactions(session_id);

-- ─── DAILY STORIES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_type VARCHAR(50) NOT NULL
    CHECK (story_type IN (
      'maker_spotlight', 'material_deep_dive', 'room_transformation',
      'design_principle', 'new_arrivals', 'community'
    )),
  title VARCHAR(200) NOT NULL,
  subtitle VARCHAR(300),
  hero_image_url TEXT NOT NULL,
  body_content TEXT,                             -- Markdown
  maker_id UUID,                                 -- FK deferred (no makers table yet)
  embedded_products UUID[] DEFAULT '{}',         -- product IDs shown in story
  read_time_minutes INT DEFAULT 3,
  publish_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),
  engagement_summary JSONB DEFAULT '{}'::jsonb,  -- aggregated metrics
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stories_publish ON daily_stories(publish_date, status);
CREATE INDEX IF NOT EXISTS idx_stories_type ON daily_stories(story_type);

ALTER TABLE daily_stories ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read published stories
CREATE POLICY "Authenticated users can read published stories"
  ON daily_stories FOR SELECT
  TO authenticated
  USING (status = 'published' AND publish_date <= CURRENT_DATE);

-- Service role handles writes (admin portal via service client)
CREATE POLICY "Service role manages stories"
  ON daily_stories FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ─── USER ROOM ENGAGEMENT ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_room_engagement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  total_dwell_ms BIGINT DEFAULT 0,
  session_count INT DEFAULT 0,
  products_viewed INT DEFAULT 0,
  products_added INT DEFAULT 0,
  products_saved INT DEFAULT 0,
  last_active TIMESTAMPTZ,
  primary_category VARCHAR(50),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, room_id)
);

CREATE INDEX IF NOT EXISTS idx_ure_user ON user_room_engagement(user_id);
CREATE INDEX IF NOT EXISTS idx_ure_active ON user_room_engagement(user_id, last_active DESC);

ALTER TABLE user_room_engagement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own room engagement"
  ON user_room_engagement FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages room engagement"
  ON user_room_engagement FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ─── PRODUCT USER DWELL ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_user_dwell (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  total_dwell_ms BIGINT DEFAULT 0,
  view_count INT DEFAULT 0,
  max_single_dwell_ms INT DEFAULT 0,
  avg_visibility_pct FLOAT DEFAULT 0,
  computed_interest_score FLOAT DEFAULT 0,       -- 0.0 to 1.0
  last_seen TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_pud_user_score
  ON product_user_dwell(user_id, computed_interest_score DESC);
CREATE INDEX IF NOT EXISTS idx_pud_product ON product_user_dwell(product_id);

ALTER TABLE product_user_dwell ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own dwell"
  ON product_user_dwell FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages dwell"
  ON product_user_dwell FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ─── PRODUCT ENGAGEMENT (global) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_engagement (
  product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  total_impressions INT DEFAULT 0,
  total_dwell_ms BIGINT DEFAULT 0,
  avg_dwell_ms INT DEFAULT 0,
  save_rate FLOAT DEFAULT 0,
  add_to_room_rate FLOAT DEFAULT 0,
  detail_open_rate FLOAT DEFAULT 0,
  share_rate FLOAT DEFAULT 0,
  avg_match_when_shown FLOAT DEFAULT 0,
  declining_flag BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pe_declining ON product_engagement(declining_flag)
  WHERE declining_flag = TRUE;

ALTER TABLE product_engagement ENABLE ROW LEVEL SECURITY;

-- Designers/admins read via service role; authenticated can read aggregate.
CREATE POLICY "Authenticated read product engagement"
  ON product_engagement FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role manages product engagement"
  ON product_engagement FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ─── FEED CACHE META ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feed_cache_meta (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  products_ranked UUID[] NOT NULL DEFAULT '{}',  -- ordered product IDs
  new_since_last_view INT DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(user_id, room_id)
);

CREATE INDEX IF NOT EXISTS idx_fcm_expires ON feed_cache_meta(expires_at);

ALTER TABLE feed_cache_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own feed cache"
  ON feed_cache_meta FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages feed cache"
  ON feed_cache_meta FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ─── SPATIAL CONTEXT ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spatial_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  context_type VARCHAR(50) NOT NULL
    CHECK (context_type IN ('dimension_fit', 'lighting', 'pairing', 'orientation')),
  context_text TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, room_id, context_type)
);

CREATE INDEX IF NOT EXISTS idx_sc_product_room ON spatial_context(product_id, room_id);

ALTER TABLE spatial_context ENABLE ROW LEVEL SECURITY;

-- Users can read context for their own rooms
CREATE POLICY "Users read spatial context for own rooms"
  ON spatial_context FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rooms
      WHERE rooms.id = spatial_context.room_id
        AND rooms.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role manages spatial context"
  ON spatial_context FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ─── updated_at TRIGGERS ────────────────────────────────────────────────────
CREATE TRIGGER update_daily_stories_updated_at BEFORE UPDATE ON daily_stories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_room_engagement_updated_at BEFORE UPDATE ON user_room_engagement
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_user_dwell_updated_at BEFORE UPDATE ON product_user_dwell
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_engagement_updated_at BEFORE UPDATE ON product_engagement
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
