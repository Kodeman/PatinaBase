-- Migration: 00099_proposal_assets_bucket.sql
-- Storage bucket for proposal assets uploaded from the section editor
-- (mood board images, floor plans). Public-read so they render in client
-- previews and PDF exports without per-request signed URLs. Authenticated
-- write only.
--
-- Layout convention: proposal-assets/{proposalId}/{filename}
-- The folder check is keyed off the proposal's designer_id rather than
-- the uploader's auth.uid() so studio collaborators can also upload.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'proposal-assets',
  'proposal-assets',
  true,
  20971520, -- 20MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Proposal assets are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'proposal-assets');

CREATE POLICY "Designers can upload proposal assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'proposal-assets'
    AND EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.designer_id = auth.uid()
    )
  );

CREATE POLICY "Designers can replace their proposal assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'proposal-assets'
    AND EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.designer_id = auth.uid()
    )
  );

CREATE POLICY "Designers can delete their proposal assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'proposal-assets'
    AND EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.designer_id = auth.uid()
    )
  );
