-- Migration: 00170_project_documents_bucket.sql
-- Private bucket backing public.project_documents (00169). Files live under
-- project-documents/{project_id}/{filename}. RLS mirrors the project_documents
-- table: the lead designer manages; clients and active team members read.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-documents',
  'project-documents',
  false,
  52428800, -- 50 MB per file
  NULL -- accept any mime; the app decides what to render
)
ON CONFLICT (id) DO NOTHING;

-- Read: lead designer, primary client, or active team member of the project
-- named in the first path segment.
CREATE POLICY "Project members can read documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-documents'
    AND (
      EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = ((storage.foldername(name))[1])::uuid
          AND (p.designer_id = auth.uid() OR p.client_id = auth.uid())
      )
      OR public.is_project_team_member(((storage.foldername(name))[1])::uuid)
    )
  );

-- Upload / update / delete: lead designer of the owning project only.
CREATE POLICY "Designers upload project documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = ((storage.foldername(name))[1])::uuid
        AND p.designer_id = auth.uid()
    )
  );

CREATE POLICY "Designers update project documents"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = ((storage.foldername(name))[1])::uuid
        AND p.designer_id = auth.uid()
    )
  );

CREATE POLICY "Designers delete project documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = ((storage.foldername(name))[1])::uuid
        AND p.designer_id = auth.uid()
    )
  );
