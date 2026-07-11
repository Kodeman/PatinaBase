-- ═══════════════════════════════════════════════════════════════════════════
-- 00287 — Fix designer read of shared scan storage artifacts
--
-- The 00077 policy "Designers can read shared scan artifacts" required the 3rd
-- path segment to equal room_scans.room_id. But the iOS uploader writes the
-- SCAN id as segment [3] ({artifactType}/{userId}/{scanId}/…), and room_id is
-- NULL for client scans (rooms.id == scan id only for brand-new rooms). Result:
-- a designer with an active/full association can read the scan ROW + images but
-- gets 400 on every storage object — the headline scan never renders.
--
-- Fix: match segment [3] against room_scans.id (what uploads actually write),
-- OR the legacy room_id (keeps pre-existing room-id-laid objects readable).
-- Segment [2] (owner uid) and the association predicate are unchanged from 00077.
--
-- ⚠ Also fixes a latent 00077 bug: the object path was read as
--   storage.foldername(name), but `name` (unqualified) binds to the INNER
--   room_scans.name in the EXISTS subquery (room_scans has a `name` column too),
--   not the storage.objects path — so the folder segments were garbage and the
--   policy never matched. We qualify it as storage.objects.name.
--
-- Policy swap only — no new grants, so the legacy-grants seed is untouched.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Designers can read shared scan artifacts" ON storage.objects;

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
      AND rs.user_id::text = (storage.foldername(storage.objects.name))[2]
      AND (
        rs.id::text = (storage.foldername(storage.objects.name))[3]
        OR (rs.room_id IS NOT NULL AND rs.room_id::text = (storage.foldername(storage.objects.name))[3])
      )
  )
);
