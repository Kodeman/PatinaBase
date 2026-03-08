-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Hero Frames
-- Description: Adds hero frame support for room photos displayed on the
--              Patina iOS app home screen (Hero Frame feature)
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- ALTER ROOM_SCANS TABLE
-- Add hero frame columns
-- ═══════════════════════════════════════════════════════════════════════════

-- Hero frame image URL (stored in Supabase Storage)
ALTER TABLE room_scans
  ADD COLUMN IF NOT EXISTS hero_frame_url TEXT;

-- Quality score of the selected hero frame (0.0 - 1.0)
ALTER TABLE room_scans
  ADD COLUMN IF NOT EXISTS hero_frame_score FLOAT;

-- When the hero frame was captured
ALTER TABLE room_scans
  ADD COLUMN IF NOT EXISTS hero_frame_captured_at TIMESTAMPTZ;

-- Number of candidate frames evaluated during selection
ALTER TABLE room_scans
  ADD COLUMN IF NOT EXISTS hero_frame_candidate_count INTEGER;

-- ═══════════════════════════════════════════════════════════════════════════
-- ALTER ROOMS TABLE
-- Add emergence and stats fields
-- ═══════════════════════════════════════════════════════════════════════════

-- Number of saved items associated with this room
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS saved_item_count INTEGER DEFAULT 0;

-- Whether this room has an active emergence notification
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS has_active_emergence BOOLEAN DEFAULT false;

-- Current emergence message (null if no active emergence)
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS emergence_message TEXT;

-- ═══════════════════════════════════════════════════════════════════════════
-- STORAGE BUCKET
-- Create bucket for hero frame images
-- ═══════════════════════════════════════════════════════════════════════════

-- Create the storage bucket for hero frame images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'room-hero-frames',
  'room-hero-frames',
  true, -- Public access for image display
  524288, -- 512KB limit per image
  ARRAY['image/heic', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ═══════════════════════════════════════════════════════════════════════════
-- STORAGE POLICIES
-- RLS policies for hero frame bucket
-- ═══════════════════════════════════════════════════════════════════════════

-- Policy: Users can upload hero frames to their own folder
CREATE POLICY "Users can upload hero frames"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'room-hero-frames'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can update their own hero frames
CREATE POLICY "Users can update their hero frames"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'room-hero-frames'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can delete their own hero frames
CREATE POLICY "Users can delete their hero frames"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'room-hero-frames'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Public read access for hero frames (for display in app)
CREATE POLICY "Public read access for hero frames"
ON storage.objects FOR SELECT
USING (bucket_id = 'room-hero-frames');

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- Optimize queries for hero frame data
-- ═══════════════════════════════════════════════════════════════════════════

-- Index for finding rooms with active emergence
CREATE INDEX IF NOT EXISTS idx_rooms_active_emergence
ON rooms(has_active_emergence)
WHERE has_active_emergence = true;

-- Index for hero frame score (for quality sorting)
CREATE INDEX IF NOT EXISTS idx_room_scans_hero_frame_score
ON room_scans(hero_frame_score DESC)
WHERE hero_frame_url IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to set room emergence state
CREATE OR REPLACE FUNCTION set_room_emergence(
  p_room_id UUID,
  p_has_emergence BOOLEAN,
  p_message TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  UPDATE rooms
  SET
    has_active_emergence = p_has_emergence,
    emergence_message = CASE WHEN p_has_emergence THEN p_message ELSE NULL END,
    last_emergence_at = CASE WHEN p_has_emergence THEN NOW() ELSE last_emergence_at END,
    emergence_count = CASE WHEN p_has_emergence THEN emergence_count + 1 ELSE emergence_count END,
    updated_at = NOW()
  WHERE id = p_room_id;
END;
$$ LANGUAGE plpgsql;

-- Function to increment saved item count for a room
CREATE OR REPLACE FUNCTION increment_room_saved_items(
  p_room_id UUID,
  p_count INTEGER DEFAULT 1
)
RETURNS void AS $$
BEGIN
  UPDATE rooms
  SET
    saved_item_count = saved_item_count + p_count,
    updated_at = NOW()
  WHERE id = p_room_id;
END;
$$ LANGUAGE plpgsql;

-- Function to decrement saved item count for a room
CREATE OR REPLACE FUNCTION decrement_room_saved_items(
  p_room_id UUID,
  p_count INTEGER DEFAULT 1
)
RETURNS void AS $$
BEGIN
  UPDATE rooms
  SET
    saved_item_count = GREATEST(0, saved_item_count - p_count),
    updated_at = NOW()
  WHERE id = p_room_id;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- VIEW: rooms_with_hero_frames
-- Convenient view joining rooms with their latest scan's hero frame
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW rooms_with_hero_frames AS
SELECT
  r.id,
  r.user_id,
  r.name,
  r.type,
  r.floor_area_sqm,
  r.saved_item_count,
  r.has_active_emergence,
  r.emergence_message,
  r.created_at,
  r.updated_at,
  -- Hero frame from latest scan
  latest_scan.hero_frame_url,
  latest_scan.hero_frame_score,
  latest_scan.hero_frame_captured_at
FROM rooms r
LEFT JOIN LATERAL (
  SELECT
    rs.hero_frame_url,
    rs.hero_frame_score,
    rs.hero_frame_captured_at
  FROM room_scans rs
  WHERE rs.room_id = r.id
    AND rs.hero_frame_url IS NOT NULL
  ORDER BY rs.created_at DESC
  LIMIT 1
) latest_scan ON true;

-- Grant access to the view
GRANT SELECT ON rooms_with_hero_frames TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN room_scans.hero_frame_url IS 'URL to the hero frame image in Supabase Storage';
COMMENT ON COLUMN room_scans.hero_frame_score IS 'Quality score of the hero frame (0.0-1.0) based on sharpness, brightness, composition, and stability';
COMMENT ON COLUMN room_scans.hero_frame_captured_at IS 'Timestamp when the hero frame was captured during the AR walk';
COMMENT ON COLUMN room_scans.hero_frame_candidate_count IS 'Number of candidate frames evaluated before selecting the hero frame';
COMMENT ON COLUMN rooms.saved_item_count IS 'Number of furniture pieces saved to this room';
COMMENT ON COLUMN rooms.has_active_emergence IS 'Whether there is an unviewed emergence notification for this room';
COMMENT ON COLUMN rooms.emergence_message IS 'Current emergence notification message';
