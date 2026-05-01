-- Migration: 00116_comms_attachments_bucket.sql
-- Private attachments bucket for in-app messaging. Files live under
-- comms-attachments/{thread_id}/{message_id_or_uuid}/{filename}.
-- RLS: only thread participants can read; only authenticated users can upload
-- to threads they actively participate in. Soft-delete on comms_messages
-- handles message deletion; storage objects are immutable.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comms-attachments',
  'comms-attachments',
  false,
  26214400, -- 25 MB per file (matches in-app messaging PRD §3)
  NULL -- accept any mime; downstream apps decide what to render
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Thread participants can read attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'comms-attachments'
    AND EXISTS (
      SELECT 1 FROM public.comms_thread_participants p
      WHERE p.thread_id = ((storage.foldername(name))[1])::uuid
        AND p.profile_id = auth.uid()
    )
  );

CREATE POLICY "Active participants can upload attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'comms-attachments'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.comms_thread_participants p
      WHERE p.thread_id = ((storage.foldername(name))[1])::uuid
        AND p.profile_id = auth.uid()
        AND p.left_at IS NULL
    )
  );

-- No update/delete policies: messages are immutable via soft-delete on
-- comms_messages (deleted_at). Storage objects are append-only.
