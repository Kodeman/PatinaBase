-- ═══════════════════════════════════════════════════════════════════════════
-- 00430 — Qualify storage.objects.name in the project-documents policies
--
-- THE BUG. Every project-scoped policy on the project-documents bucket asks the
-- same question: "is the uuid in the first path segment a project this caller
-- may touch?" It was written like this (00170:33-42, and the same shape three
-- more times):
--
--   EXISTS (SELECT 1 FROM public.projects p
--           WHERE p.id = ((storage.foldername(name))[1])::uuid
--             AND p.designer_id = auth.uid())
--
-- `name` is unqualified, and it is inside a subquery whose FROM is
-- public.projects. Name resolution works from the innermost scope outward, so
-- `name` binds to projects.name — the PROJECT'S NAME — and never reaches
-- storage.objects.name at all. Postgres does not warn; it just resolves it, and
-- pg_policies deparses the result back as `storage.foldername(p.name)`, which
-- is where this was finally caught.
--
-- WHAT THAT MEANT. storage.foldername('Ashford Residence') is `{}` — the
-- function splits on '/' and drops the last segment, so a value with no slash
-- yields an empty array. `{}[1]` is NULL, `p.id = NULL` is NULL, the EXISTS is
-- false for every row, and the policy denies everything. Since 00170 the
-- project leg of this bucket has been dead: no authenticated designer could
-- upload, update, delete or read a project-prefixed object through RLS.
--
-- It went unnoticed for two reasons. The Folio upload path swallows storage
-- errors, so a failed upload looked like a slow one. And the read policy has a
-- second leg — public.is_project_team_member(((storage.foldername(name))[1])) —
-- which sits at the POLICY's top level where storage.objects is the only
-- relation in scope. That reference resolves correctly, so team members could
-- still read, which is precisely the sort of partial success that hides a bug.
-- It surfaced on the Plan Room upload walk (00429), where the storage write is
-- a precondition the RPC refuses to proceed without.
--
-- THE FIX. Qualify every reference. Nothing else changes: same legs, same
-- roles (these four carry no TO clause, so PUBLIC, as they always have), same
-- commands. Each policy is re-created from its live head verbatim except for
-- the qualification —
--
--   Project members can read documents ....... 00170 → 00203 → 00430
--   Designers upload project documents ....... 00170 → 00430
--   Designers update project documents ....... 00170 → 00430
--   Designers delete project documents ....... 00170 → 00430
--
-- The bucket's other three policies are NOT touched and are NOT affected: the
-- discovery leg (00224) resolves through designer_clients, and the two proposal
-- legs (00252, head 00425) through proposals and project_documents. None of
-- those three tables has a `name` column, so their unqualified references fall
-- through to storage.objects.name and have always been correct. They are left
-- alone deliberately — but they are correct by accident of the column lists
-- they happen to join, and adding a `name` column to any of those tables would
-- break them the same silent way. Qualify on sight.
--
-- No GRANT/REVOKE here — policies only — so seed/00-legacy-grants.sql does not
-- need regenerating.
-- ═══════════════════════════════════════════════════════════════════════════

-- Read: lead designer or active team member sees every file; the client sees
-- only files flagged client_visible (the 00203 narrowing).
DROP POLICY IF EXISTS "Project members can read documents" ON storage.objects;
CREATE POLICY "Project members can read documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-documents'
    AND (
      -- lead designer or active team member: every file
      EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = ((storage.foldername(storage.objects.name))[1])::uuid
          AND p.designer_id = auth.uid()
      )
      OR public.is_project_team_member(
           ((storage.foldername(storage.objects.name))[1])::uuid)
      -- the client: only files flagged client_visible (R24)
      OR EXISTS (
        SELECT 1
        FROM public.projects p
        JOIN public.project_documents pd
          ON pd.project_id = p.id
         AND pd.storage_path = storage.objects.name
         AND pd.client_visible = true
        WHERE p.id = ((storage.foldername(storage.objects.name))[1])::uuid
          AND p.client_id = auth.uid()
      )
    )
  );

-- Upload / update / delete: lead designer of the owning project only.
DROP POLICY IF EXISTS "Designers upload project documents" ON storage.objects;
CREATE POLICY "Designers upload project documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = ((storage.foldername(storage.objects.name))[1])::uuid
        AND p.designer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Designers update project documents" ON storage.objects;
CREATE POLICY "Designers update project documents"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = ((storage.foldername(storage.objects.name))[1])::uuid
        AND p.designer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Designers delete project documents" ON storage.objects;
CREATE POLICY "Designers delete project documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = ((storage.foldername(storage.objects.name))[1])::uuid
        AND p.designer_id = auth.uid()
    )
  );
