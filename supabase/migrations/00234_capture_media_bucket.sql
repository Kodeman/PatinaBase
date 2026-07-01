-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00234: capture-media storage bucket
--
-- PRIVATE bucket for Patina Field Capture media (photos, voice notes, the
-- capture media manifest). Unlike product-images (00057, public), field
-- capture media is private to the capturing designer — objects are namespaced
-- under a top-level folder equal to the owner's auth.uid(), and all four
-- object policies gate on (storage.foldername(name))[1] = auth.uid()::text.
--
-- Layout convention (enforced by policy, expected by the iOS uploader):
--   capture-media/<auth.uid()>/<client_capture_id>/<artifact>
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'capture-media',
  'capture-media',
  false,
  524288000, -- 500MB
  ARRAY[
    'image/heic',
    'image/jpeg',
    'image/png',
    'image/webp',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac',
    'audio/wav',
    'application/json',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ─── Owner-scoped object policies ──────────────────────────────────────────

CREATE POLICY "Capture media owner read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'capture-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Capture media owner upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'capture-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Capture media owner update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'capture-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Capture media owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'capture-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

COMMIT;
