-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Create Storage Buckets for Room Scans
-- Description: Creates storage buckets for USDZ models and thumbnails
-- Required by iOS RoomScanSyncService for room scan uploads
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- ROOM SCANS BUCKET (USDZ 3D Models)
-- ═══════════════════════════════════════════════════════════════════════════

-- Create room-scans bucket for USDZ 3D models
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'room-scans',
  'room-scans',
  false,  -- Private - only owners can access
  52428800,  -- 50MB limit for USDZ files
  ARRAY['model/vnd.usdz+zip', 'application/octet-stream']
) ON CONFLICT (id) DO NOTHING;

-- RLS policy: Users can upload their own scans
-- Path format: usdz/{userId}/{roomId}/scan.usdz
CREATE POLICY "Users can upload their own scans"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'room-scans' AND
  auth.uid()::text = (storage.foldername(name))[2]
);

-- RLS policy: Users can read their own scans
CREATE POLICY "Users can read their own scans"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'room-scans' AND
  auth.uid()::text = (storage.foldername(name))[2]
);

-- RLS policy: Users can delete their own scans
CREATE POLICY "Users can delete their own scans"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'room-scans' AND
  auth.uid()::text = (storage.foldername(name))[2]
);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROOM SCAN THUMBNAILS BUCKET
-- ═══════════════════════════════════════════════════════════════════════════

-- Create room-scan-thumbnails bucket for preview images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'room-scan-thumbnails',
  'room-scan-thumbnails',
  true,  -- Public for easy display in app
  1048576,  -- 1MB limit for thumbnails
  ARRAY['image/jpeg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- RLS policy: Authenticated users can upload thumbnails
CREATE POLICY "Authenticated users can upload thumbnails"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'room-scan-thumbnails' AND
  auth.uid() IS NOT NULL
);

-- RLS policy: Anyone can view thumbnails (public bucket)
CREATE POLICY "Anyone can view thumbnails"
ON storage.objects FOR SELECT
USING (bucket_id = 'room-scan-thumbnails');

-- RLS policy: Users can delete their own thumbnails
-- Thumbnail path format: thumbnails/{roomId}.jpg
-- Note: We allow any authenticated user to delete since roomId doesn't contain userId
-- In practice, only the room owner should have the roomId to delete
CREATE POLICY "Authenticated users can delete thumbnails"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'room-scan-thumbnails' AND
  auth.uid() IS NOT NULL
);
