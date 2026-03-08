-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: RoomPlan Features
-- Description: Adds rooms, room_features, and user_style_signals tables for
--              enhanced RoomPlan integration from the Patina iOS app
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- ROOMS TABLE
-- Parent entity for user's physical spaces (can have multiple scans)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Room Info
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'other', -- 'living_room', 'bedroom', 'kitchen', 'bathroom', 'dining_room', 'office', 'other'

  -- Dimensions (from processed scan)
  width_meters FLOAT,
  length_meters FLOAT,
  height_meters FLOAT,
  floor_area_sqm FLOAT,
  volume_cbm FLOAT,

  -- Style signals (JSONB for flexibility)
  style_signals JSONB DEFAULT '{}'::jsonb,

  -- Metadata
  scan_count INTEGER DEFAULT 0,
  emergence_count INTEGER DEFAULT 0,
  last_emergence_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rooms_user_id ON rooms(user_id);
CREATE INDEX IF NOT EXISTS idx_rooms_type ON rooms(type);
CREATE INDEX IF NOT EXISTS idx_rooms_created ON rooms(created_at DESC);

-- RLS
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their rooms" ON rooms
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Designers can view client rooms" ON rooms
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM designer_clients
      WHERE designer_clients.designer_id = auth.uid()
      AND designer_clients.client_id = rooms.user_id
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- ROOM FEATURES TABLE
-- Extracted architectural features from room scans
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS room_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  scan_id UUID REFERENCES room_scans(id) ON DELETE CASCADE,

  -- Feature Type
  type TEXT NOT NULL, -- 'window', 'door', 'fireplace', 'built_in_shelving', 'alcove', 'column', 'beam'

  -- Position (in meters, relative to room origin)
  position_x FLOAT NOT NULL,
  position_y FLOAT NOT NULL,
  position_z FLOAT NOT NULL,

  -- Dimensions (optional, in meters)
  width FLOAT,
  height FLOAT,
  depth FLOAT,

  -- Detection confidence (0.0 - 1.0)
  confidence FLOAT,

  -- Additional metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_room_features_room_id ON room_features(room_id);
CREATE INDEX IF NOT EXISTS idx_room_features_scan_id ON room_features(scan_id);
CREATE INDEX IF NOT EXISTS idx_room_features_type ON room_features(type);

-- RLS
ALTER TABLE room_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their room features" ON room_features
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM rooms
      WHERE rooms.id = room_features.room_id
      AND rooms.user_id = auth.uid()
    )
  );

CREATE POLICY "Designers can view client room features" ON room_features
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM rooms
      JOIN designer_clients ON designer_clients.client_id = rooms.user_id
      WHERE rooms.id = room_features.room_id
      AND designer_clients.designer_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- USER STYLE SIGNALS TABLE
-- Aggregated style preferences across all user's rooms
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_style_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner (one row per user)
  user_id UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Aggregated signals (0.0 - 1.0 scale)
  natural_light_preference FLOAT,
  openness_preference FLOAT,
  warmth_preference FLOAT,
  texture_preference FLOAT,

  -- Additional derived preferences
  color_temperature TEXT, -- 'warm', 'neutral', 'cool'
  space_density TEXT, -- 'minimal', 'balanced', 'layered'
  formality_level TEXT, -- 'casual', 'transitional', 'formal'

  -- Source tracking
  source_room_ids UUID[] DEFAULT '{}',
  last_calculated_at TIMESTAMPTZ,

  -- Raw signal data for recomputation
  signal_history JSONB DEFAULT '[]'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE user_style_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their style signals" ON user_style_signals
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Designers can view client style signals" ON user_style_signals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM designer_clients
      WHERE designer_clients.designer_id = auth.uid()
      AND designer_clients.client_id = user_style_signals.user_id
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_user_style_signals_updated_at BEFORE UPDATE ON user_style_signals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- ALTER ROOM_SCANS TABLE
-- Add quality metrics and room relationship
-- ═══════════════════════════════════════════════════════════════════════════

-- Add new columns to room_scans
ALTER TABLE room_scans
  ADD COLUMN IF NOT EXISTS quality_grade TEXT, -- 'excellent', 'good', 'acceptable', 'poor'
  ADD COLUMN IF NOT EXISTS coverage_percentage FLOAT, -- 0.0 - 1.0
  ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES rooms(id) ON DELETE SET NULL;

-- Index for room relationship
CREATE INDEX IF NOT EXISTS idx_room_scans_room_id ON room_scans(room_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to increment room scan count
CREATE OR REPLACE FUNCTION increment_room_scan_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.room_id IS NOT NULL THEN
    UPDATE rooms
    SET scan_count = scan_count + 1,
        updated_at = NOW()
    WHERE id = NEW.room_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-increment scan count
CREATE TRIGGER on_room_scan_insert
  AFTER INSERT ON room_scans
  FOR EACH ROW
  WHEN (NEW.room_id IS NOT NULL)
  EXECUTE FUNCTION increment_room_scan_count();

-- Function to aggregate user style signals from rooms
CREATE OR REPLACE FUNCTION aggregate_user_style_signals(p_user_id UUID)
RETURNS void AS $$
DECLARE
  v_room RECORD;
  v_total_rooms INTEGER := 0;
  v_natural_light FLOAT := 0;
  v_openness FLOAT := 0;
  v_warmth FLOAT := 0;
  v_texture FLOAT := 0;
  v_room_ids UUID[] := '{}';
BEGIN
  -- Aggregate signals from all user's rooms
  FOR v_room IN
    SELECT id, style_signals
    FROM rooms
    WHERE user_id = p_user_id
    AND style_signals IS NOT NULL
    AND style_signals != '{}'::jsonb
  LOOP
    v_total_rooms := v_total_rooms + 1;
    v_room_ids := array_append(v_room_ids, v_room.id);

    v_natural_light := v_natural_light + COALESCE((v_room.style_signals->>'naturalLight')::FLOAT, 0);
    v_openness := v_openness + COALESCE((v_room.style_signals->>'openness')::FLOAT, 0);
    v_warmth := v_warmth + COALESCE((v_room.style_signals->>'warmth')::FLOAT, 0);
    v_texture := v_texture + COALESCE((v_room.style_signals->>'texture')::FLOAT, 0);
  END LOOP;

  -- Calculate averages and upsert
  IF v_total_rooms > 0 THEN
    INSERT INTO user_style_signals (
      user_id,
      natural_light_preference,
      openness_preference,
      warmth_preference,
      texture_preference,
      source_room_ids,
      last_calculated_at
    ) VALUES (
      p_user_id,
      v_natural_light / v_total_rooms,
      v_openness / v_total_rooms,
      v_warmth / v_total_rooms,
      v_texture / v_total_rooms,
      v_room_ids,
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      natural_light_preference = EXCLUDED.natural_light_preference,
      openness_preference = EXCLUDED.openness_preference,
      warmth_preference = EXCLUDED.warmth_preference,
      texture_preference = EXCLUDED.texture_preference,
      source_room_ids = EXCLUDED.source_room_ids,
      last_calculated_at = EXCLUDED.last_calculated_at,
      updated_at = NOW();
  END IF;
END;
$$ LANGUAGE plpgsql;
