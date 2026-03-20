-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Product Images Storage Bucket
-- Description: Creates the product-images storage bucket referenced by the
--              iOS app's APIConfiguration.StorageBucket
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  52428800, -- 50MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- STORAGE POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

-- Public read access
CREATE POLICY "Product images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

-- Authenticated users can upload
CREATE POLICY "Authenticated users can upload product images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'product-images');

-- Users can update their own uploads
CREATE POLICY "Users can update their own product images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Users can delete their own uploads
CREATE POLICY "Users can delete their own product images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text);
