-- ═══════════════════════════════════════════════════════════════════════════
-- 00256 — Private bucket backing feedback.screenshot_path (00255)
--
-- The capture sheet optionally grabs the screen as it was when the sheet opened
-- (R7.2.4, §8) and stores it here. Files live under
-- feedback-screenshots/{author_uid}/{feedback_id}.png. RLS mirrors the feedback
-- table's posture: the author manages her own folder; the builder (super_admin)
-- reads all (so a triaged note's screenshot is visible during review).
--
-- Additive only (D7): INSERT ... ON CONFLICT DO NOTHING + DROP POLICY IF EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'feedback-screenshots',
  'feedback-screenshots',
  false,
  10485760,               -- 10 MB per shot (a PNG of one screen)
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Read: the author of the folder (first path segment = her uid), or a builder.
DROP POLICY IF EXISTS "Feedback authors read own screenshots" ON storage.objects;
CREATE POLICY "Feedback authors read own screenshots"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'feedback-screenshots'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.user_has_role(auth.uid(), 'super_admin')
    )
  );

-- Upload: the author, into her OWN folder only.
DROP POLICY IF EXISTS "Feedback authors upload own screenshots" ON storage.objects;
CREATE POLICY "Feedback authors upload own screenshots"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'feedback-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update / delete: the author, her own folder only.
DROP POLICY IF EXISTS "Feedback authors update own screenshots" ON storage.objects;
CREATE POLICY "Feedback authors update own screenshots"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'feedback-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Feedback authors delete own screenshots" ON storage.objects;
CREATE POLICY "Feedback authors delete own screenshots"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'feedback-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
