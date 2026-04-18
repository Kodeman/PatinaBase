-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Advanced Room Scan (v2 scan bundle)
-- Description: Extends room_scans + room_scan_images with the full RoomPlan
--              + ARKit artifact set (parametric JSON, ARWorldMap, scene mesh,
--              posed photos). Widens storage bucket limits/MIME types so a
--              complete scan bundle fits under one user/room prefix.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- ROOM_SCANS — v2 columns
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE room_scans
  ADD COLUMN IF NOT EXISTS captured_room_json_url TEXT,
  ADD COLUMN IF NOT EXISTS world_map_url TEXT,
  ADD COLUMN IF NOT EXISTS mesh_url TEXT,
  ADD COLUMN IF NOT EXISTS depth_archive_url TEXT,
  ADD COLUMN IF NOT EXISTS scan_bundle_url TEXT,
  ADD COLUMN IF NOT EXISTS scan_schema_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS device_model TEXT,
  ADD COLUMN IF NOT EXISTS os_version TEXT,
  ADD COLUMN IF NOT EXISTS has_lidar BOOLEAN,
  ADD COLUMN IF NOT EXISTS scan_bundle_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS multi_room_builder_id UUID,
  ADD COLUMN IF NOT EXISTS capture_environment JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN room_scans.captured_room_json_url IS 'RoomPlan CapturedRoom parametric Codable export (authoritative geometry)';
COMMENT ON COLUMN room_scans.world_map_url IS 'NSKeyedArchiver-serialized ARWorldMap for re-localization';
COMMENT ON COLUMN room_scans.mesh_url IS 'ARMeshAnchor-derived scene mesh, PLY';
COMMENT ON COLUMN room_scans.depth_archive_url IS 'Optional zip of sampled sceneDepth depthMap + confidenceMap frames (v2 opt-in)';
COMMENT ON COLUMN room_scans.scan_bundle_url IS 'Optional single zip of the entire on-device bundle';
COMMENT ON COLUMN room_scans.scan_schema_version IS '1 = legacy USDZ-only, 2 = advanced bundle (parametric + worldmap + mesh + posed photos)';
COMMENT ON COLUMN room_scans.multi_room_builder_id IS 'Groups scans stitched through a CapturedRoomBuilder session (future whole-home)';
COMMENT ON COLUMN room_scans.capture_environment IS 'Snapshot at scan end: { lightEstimate, thermalState, batteryLevel, motionQuality }';

CREATE INDEX IF NOT EXISTS idx_room_scans_schema_version
  ON room_scans(scan_schema_version);

CREATE INDEX IF NOT EXISTS idx_room_scans_multi_room_builder
  ON room_scans(multi_room_builder_id)
  WHERE multi_room_builder_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROOM_SCAN_IMAGES — posed photo columns
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE room_scan_images
  ADD COLUMN IF NOT EXISTS camera_transform DOUBLE PRECISION[],
  ADD COLUMN IF NOT EXISTS camera_intrinsics JSONB,
  ADD COLUMN IF NOT EXISTS euler_angles DOUBLE PRECISION[],
  ADD COLUMN IF NOT EXISTS photo_kind TEXT DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS is_full_resolution BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS associated_feature_id UUID REFERENCES room_features(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS timestamp_seconds DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS light_estimate_lumens DOUBLE PRECISION;

ALTER TABLE room_scan_images
  DROP CONSTRAINT IF EXISTS room_scan_images_photo_kind_check;

ALTER TABLE room_scan_images
  ADD CONSTRAINT room_scan_images_photo_kind_check
  CHECK (photo_kind IN ('hero', 'auto', 'user', 'feature'));

COMMENT ON COLUMN room_scan_images.camera_transform IS 'Row-major 4x4 ARCamera.transform at capture (length = 16)';
COMMENT ON COLUMN room_scan_images.camera_intrinsics IS '{ fx, fy, cx, cy, width, height } — ARCamera.intrinsics + image resolution';
COMMENT ON COLUMN room_scan_images.euler_angles IS '[pitch, yaw, roll] radians';
COMMENT ON COLUMN room_scan_images.photo_kind IS 'hero | auto (sampled) | user (shutter) | feature (anchored to a room_feature)';
COMMENT ON COLUMN room_scan_images.is_full_resolution IS 'True if captured from ARFrame at full sensor resolution (v2 user-shutter)';
COMMENT ON COLUMN room_scan_images.associated_feature_id IS 'Closest RoomPlan feature in 3D space when the photo was taken';
COMMENT ON COLUMN room_scan_images.timestamp_seconds IS 'Seconds since scan start';

CREATE INDEX IF NOT EXISTS idx_room_scan_images_kind
  ON room_scan_images(scan_id, photo_kind);

CREATE INDEX IF NOT EXISTS idx_room_scan_images_feature
  ON room_scan_images(associated_feature_id)
  WHERE associated_feature_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- STORAGE BUCKET ADJUSTMENTS
-- ═══════════════════════════════════════════════════════════════════════════

-- room-scans: raise limit to 500MB, broaden MIME types for the full bundle.
UPDATE storage.buckets
SET
  file_size_limit = 524288000,
  allowed_mime_types = ARRAY[
    'model/vnd.usdz+zip',
    'model/gltf+json',
    'model/gltf-binary',
    'model/ply',
    'application/octet-stream',
    'application/json',
    'application/zip',
    'image/heic',
    'image/jpeg',
    'image/png',
    'image/x-exr'
  ]
WHERE id = 'room-scans';

-- room-scan-thumbnails: raise to 5MB so HEIC hero at quality fits.
UPDATE storage.buckets
SET
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic'
  ]
WHERE id = 'room-scan-thumbnails';

-- Broaden the existing "users can upload their own scans" path check so the
-- new bundle files under e.g. `worldmap/{userId}/...`, `mesh/{userId}/...`,
-- `photos/{userId}/...`, and `bundle/{userId}/...` are all reachable without
-- requiring a new policy per folder root. We rely on the second path segment
-- being the userId — the same convention existing USDZ uploads already use
-- (see 00031_create_storage_buckets.sql).

DROP POLICY IF EXISTS "Users can upload their own scans" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own scans" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own scans" ON storage.objects;

CREATE POLICY "Users can upload their own scan artifacts"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'room-scans'
  AND auth.uid()::text = (storage.foldername(name))[2]
);

CREATE POLICY "Users can read their own scan artifacts"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'room-scans'
  AND auth.uid()::text = (storage.foldername(name))[2]
);

CREATE POLICY "Users can update their own scan artifacts"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'room-scans'
  AND auth.uid()::text = (storage.foldername(name))[2]
);

CREATE POLICY "Users can delete their own scan artifacts"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'room-scans'
  AND auth.uid()::text = (storage.foldername(name))[2]
);

-- Designers with an active room_scan_association can read the owner's
-- artifacts. The path layout is `{artifactType}/{userId}/{roomId}/...` — we
-- look up whether the current auth.uid() has an association that grants
-- access to any scan under that userId + roomId.
CREATE POLICY "Designers can read shared scan artifacts"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'room-scans'
  AND EXISTS (
    SELECT 1
    FROM room_scan_associations rsa
    JOIN room_scans rs ON rs.id = rsa.scan_id
    WHERE rsa.designer_id = auth.uid()
      AND rsa.status = 'active'
      AND (rsa.expires_at IS NULL OR rsa.expires_at > NOW())
      AND rsa.access_level IN ('full', 'preview')
      AND rs.user_id::text = (storage.foldername(name))[2]
      AND rs.room_id::text = (storage.foldername(name))[3]
  )
);

-- ═══════════════════════════════════════════════════════════════════════════
-- BACKFILL existing rows to schema v1 so the version column is meaningful
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE room_scans
SET scan_schema_version = 1
WHERE scan_schema_version IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- VIEW: room_scans_v2
-- Narrow projection for clients that only want advanced-bundle scans.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW room_scans_v2 AS
SELECT
  rs.id,
  rs.user_id,
  rs.room_id,
  rs.project_id,
  rs.name,
  rs.room_type,
  rs.dimensions,
  rs.floor_area,
  rs.features,
  rs.furniture_detected,
  rs.style_signals,
  rs.suggested_styles,
  rs.scan_data,
  rs.thumbnail_url,
  rs.model_url,
  rs.hero_frame_url,
  rs.hero_frame_score,
  rs.captured_room_json_url,
  rs.world_map_url,
  rs.mesh_url,
  rs.depth_archive_url,
  rs.scan_bundle_url,
  rs.scan_schema_version,
  rs.device_model,
  rs.os_version,
  rs.has_lidar,
  rs.scan_bundle_size_bytes,
  rs.multi_room_builder_id,
  rs.capture_environment,
  rs.image_count,
  rs.average_image_quality,
  rs.coverage_percentage,
  rs.quality_grade,
  rs.status,
  rs.scanned_at,
  rs.created_at
FROM room_scans rs
WHERE rs.scan_schema_version >= 2;

GRANT SELECT ON room_scans_v2 TO authenticated;

COMMENT ON VIEW room_scans_v2 IS 'Advanced-bundle scans only (schema v2+); includes parametric + worldmap + mesh URLs';
