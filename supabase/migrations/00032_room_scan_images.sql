-- =============================================================================
-- Migration: Room Scan Multi-Image Support
-- Description: Adds support for multiple images per room scan (10 images)
-- Each scan can have 1 hero image + up to 9 supporting images
-- =============================================================================

-- =============================================================================
-- ROOM_SCAN_IMAGES TABLE
-- Individual room images with role and metadata
-- =============================================================================

CREATE TABLE IF NOT EXISTS room_scan_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  scan_id UUID NOT NULL REFERENCES room_scans(id) ON DELETE CASCADE,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,

  -- Image Classification
  role TEXT NOT NULL, -- 'hero', 'feature_window', 'feature_door', 'coverage_early', etc.
  is_primary BOOLEAN NOT NULL DEFAULT false, -- True for hero image
  display_order INTEGER NOT NULL DEFAULT 0, -- 0 = hero, 1-9 = supporting

  -- Associated Feature (nullable)
  feature_category TEXT, -- 'window', 'fireplace', 'bookshelf', etc.
  feature_confidence FLOAT,

  -- Image Storage
  image_url TEXT NOT NULL, -- Supabase Storage URL
  thumbnail_url TEXT, -- Optional smaller version

  -- Quality Metrics
  quality_score FLOAT, -- Overall quality (0.0-1.0)
  sharpness_score FLOAT,
  brightness_score FLOAT,
  composition_score FLOAT,
  stability_score FLOAT,

  -- Image Metadata
  width INTEGER,
  height INTEGER,
  file_size_bytes INTEGER,
  mime_type TEXT DEFAULT 'image/heic',

  -- Capture Context
  captured_at TIMESTAMPTZ NOT NULL,
  device_orientation TEXT,
  light_estimate FLOAT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Primary lookup by scan
CREATE INDEX IF NOT EXISTS idx_room_scan_images_scan_id
  ON room_scan_images(scan_id);

-- Find primary/hero images
CREATE INDEX IF NOT EXISTS idx_room_scan_images_primary
  ON room_scan_images(scan_id, is_primary)
  WHERE is_primary = true;

-- Find images by role
CREATE INDEX IF NOT EXISTS idx_room_scan_images_role
  ON room_scan_images(scan_id, role);

-- Find feature-anchored images
CREATE INDEX IF NOT EXISTS idx_room_scan_images_feature
  ON room_scan_images(scan_id, feature_category)
  WHERE feature_category IS NOT NULL;

-- Display ordering
CREATE INDEX IF NOT EXISTS idx_room_scan_images_order
  ON room_scan_images(scan_id, display_order);

-- Quality-based sorting
CREATE INDEX IF NOT EXISTS idx_room_scan_images_quality
  ON room_scan_images(scan_id, quality_score DESC);

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

ALTER TABLE room_scan_images ENABLE ROW LEVEL SECURITY;

-- Users can view their own room scan images
CREATE POLICY "Users can view their room scan images"
  ON room_scan_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM room_scans rs
      WHERE rs.id = room_scan_images.scan_id
      AND rs.user_id = auth.uid()
    )
  );

-- Users can insert images for their own scans
CREATE POLICY "Users can insert room scan images"
  ON room_scan_images FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM room_scans rs
      WHERE rs.id = room_scan_images.scan_id
      AND rs.user_id = auth.uid()
    )
  );

-- Users can update their own room scan images
CREATE POLICY "Users can update their room scan images"
  ON room_scan_images FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM room_scans rs
      WHERE rs.id = room_scan_images.scan_id
      AND rs.user_id = auth.uid()
    )
  );

-- Users can delete their own room scan images
CREATE POLICY "Users can delete their room scan images"
  ON room_scan_images FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM room_scans rs
      WHERE rs.id = room_scan_images.scan_id
      AND rs.user_id = auth.uid()
    )
  );

-- Designers can view client room scan images (via room_scan_associations)
CREATE POLICY "Designers can view associated room scan images"
  ON room_scan_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM room_scan_associations rsa
      WHERE rsa.scan_id = room_scan_images.scan_id
      AND rsa.designer_id = auth.uid()
      AND rsa.status = 'active'
    )
  );

-- =============================================================================
-- UPDATE ROOM_SCANS TABLE
-- Add aggregate image metadata
-- =============================================================================

-- Total image count for this scan
ALTER TABLE room_scans
  ADD COLUMN IF NOT EXISTS image_count INTEGER DEFAULT 0;

-- Average quality score across all images
ALTER TABLE room_scans
  ADD COLUMN IF NOT EXISTS average_image_quality FLOAT;

-- =============================================================================
-- TRIGGER: Update room_scans aggregate counts
-- =============================================================================

CREATE OR REPLACE FUNCTION update_room_scan_image_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' THEN
    UPDATE room_scans
    SET
      image_count = (
        SELECT COUNT(*) FROM room_scan_images WHERE scan_id = COALESCE(NEW.scan_id, OLD.scan_id)
      ),
      average_image_quality = (
        SELECT AVG(quality_score) FROM room_scan_images WHERE scan_id = COALESCE(NEW.scan_id, OLD.scan_id)
      )
    WHERE id = COALESCE(NEW.scan_id, OLD.scan_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for insert/delete
DROP TRIGGER IF EXISTS trigger_update_room_scan_image_counts ON room_scan_images;
CREATE TRIGGER trigger_update_room_scan_image_counts
  AFTER INSERT OR DELETE ON room_scan_images
  FOR EACH ROW
  EXECUTE FUNCTION update_room_scan_image_counts();

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to get all images for a scan in display order
CREATE OR REPLACE FUNCTION get_room_scan_images(p_scan_id UUID)
RETURNS TABLE (
  id UUID,
  role TEXT,
  is_primary BOOLEAN,
  display_order INTEGER,
  image_url TEXT,
  quality_score FLOAT,
  feature_category TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rsi.id,
    rsi.role,
    rsi.is_primary,
    rsi.display_order,
    rsi.image_url,
    rsi.quality_score,
    rsi.feature_category
  FROM room_scan_images rsi
  WHERE rsi.scan_id = p_scan_id
  ORDER BY rsi.display_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get hero image for a scan
CREATE OR REPLACE FUNCTION get_room_scan_hero_image(p_scan_id UUID)
RETURNS TABLE (
  id UUID,
  image_url TEXT,
  quality_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rsi.id,
    rsi.image_url,
    rsi.quality_score
  FROM room_scan_images rsi
  WHERE rsi.scan_id = p_scan_id
  AND rsi.is_primary = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE room_scan_images IS 'Individual images captured during room scans, up to 10 per scan (1 hero + 9 supporting)';
COMMENT ON COLUMN room_scan_images.role IS 'Image role: hero, feature_window, feature_door, feature_fireplace, coverage_early, coverage_mid, coverage_late, supplemental';
COMMENT ON COLUMN room_scan_images.is_primary IS 'True for the hero/primary display image';
COMMENT ON COLUMN room_scan_images.display_order IS 'Display order: 0 = hero, 1-9 = supporting images';
COMMENT ON COLUMN room_scan_images.feature_category IS 'Associated detected feature (window, fireplace, bookshelf, etc.)';
COMMENT ON COLUMN room_scan_images.quality_score IS 'Overall quality score 0.0-1.0 based on sharpness, brightness, composition, stability';
