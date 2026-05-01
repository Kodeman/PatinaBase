-- Migration: 00115_avatars_bucket.sql
-- Public-read avatars bucket. Authenticated users can manage objects under
-- avatars/{auth.uid()}/* only.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152, -- 2 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Avatar images are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Match either flat naming ({uid}.ext, used by designer-portal) or nested
-- ({uid}/file.ext) so both portals' upload paths are supported by the same bucket.
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR split_part(name, '.', 1) = auth.uid()::text
    )
  );

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR split_part(name, '.', 1) = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR split_part(name, '.', 1) = auth.uid()::text
    )
  );
