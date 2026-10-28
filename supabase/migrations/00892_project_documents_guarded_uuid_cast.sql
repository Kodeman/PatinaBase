-- ═══════════════════════════════════════════════════════════════════════════
-- 00892 · project-documents storage policies stop raising on a non-uuid first
-- folder (SQ-2342)
--
-- THE DEFECT. Every authenticated storage.objects policy on the
-- project-documents bucket casts the object's first folder straight to uuid:
--   ((storage.foldername(storage.objects.name))[1])::uuid
-- RLS quals run as a security barrier ahead of the caller's own filters, so a
-- designer's list of `<project uuid>/` evaluates the SELECT policies against
-- EVERY object in the bucket. One object whose first folder is not a uuid
-- (the service-role fulfillment writers put `fulfillment/...` here by design;
-- Strata holds two such objects) raises
--   ERROR 22P02: invalid input syntax for type uuid: "fulfillment"
-- and the whole listing fails for every authenticated reader — designer,
-- co-member, team member and client alike.
--
-- THE FIX. Each cast becomes
--   CASE WHEN pg_input_is_valid(<first folder>, 'uuid') THEN <first folder>::uuid END
-- pg_input_is_valid accepts exactly what the cast accepts, so every name the
-- old policies admitted is admitted unchanged; a malformed first folder now
-- yields NULL, matches no row, and the object is simply not visible (and not
-- writable) to authenticated callers instead of raising. Actors, commands,
-- roles, the co-member tenancy helpers and the client_visible gate are
-- otherwise byte-for-byte the current heads:
--   "Project members can read documents"          00584 §16
--   "Designers upload/update/delete project documents" 00584 §15
--   "Designers manage discovery folio objects"     00584 §1
--   "Designers manage proposal folio objects"      00425
--   "Clients read flagged proposal folio objects"  00252
-- service_acceptance_evidence_client_read (00889) has no cast and is untouched.
--
-- No INSERT tightening is needed: the old WITH CHECKs already refused a
-- non-uuid first folder (by raising); the guarded form refuses it as an RLS
-- violation. Non-uuid prefixes arrive only through service_role writers
-- (fulfillment-po, fulfillment-evidence, the admin POD route), which bypass
-- RLS and are unchanged. No data is moved or deleted.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Project members can read documents" ON storage.objects;
CREATE POLICY "Project members can read documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND (
      -- lead designer, her studio co-members, or an active team member
      EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = CASE WHEN pg_input_is_valid((storage.foldername(storage.objects.name))[1], 'uuid')
                          THEN ((storage.foldername(storage.objects.name))[1])::uuid END
          AND (p.designer_id = auth.uid() OR public.is_studio_comember(p.designer_id))
      )
      OR public.is_project_team_member(
           CASE WHEN pg_input_is_valid((storage.foldername(storage.objects.name))[1], 'uuid')
                THEN ((storage.foldername(storage.objects.name))[1])::uuid END)
      -- the client: only files flagged client_visible (R24)
      OR EXISTS (
        SELECT 1
        FROM public.projects p
        JOIN public.project_documents pd
          ON pd.project_id = p.id
         AND pd.storage_path = storage.objects.name
         AND pd.client_visible = true
        WHERE p.id = CASE WHEN pg_input_is_valid((storage.foldername(storage.objects.name))[1], 'uuid')
                          THEN ((storage.foldername(storage.objects.name))[1])::uuid END
          AND p.client_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Designers upload project documents" ON storage.objects;
CREATE POLICY "Designers upload project documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = CASE WHEN pg_input_is_valid((storage.foldername(storage.objects.name))[1], 'uuid')
                        THEN ((storage.foldername(storage.objects.name))[1])::uuid END
        AND public.is_studio_comember(p.designer_id)
    )
  );

DROP POLICY IF EXISTS "Designers update project documents" ON storage.objects;
CREATE POLICY "Designers update project documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = CASE WHEN pg_input_is_valid((storage.foldername(storage.objects.name))[1], 'uuid')
                        THEN ((storage.foldername(storage.objects.name))[1])::uuid END
        AND public.is_studio_comember(p.designer_id)
    )
  );

DROP POLICY IF EXISTS "Designers delete project documents" ON storage.objects;
CREATE POLICY "Designers delete project documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = CASE WHEN pg_input_is_valid((storage.foldername(storage.objects.name))[1], 'uuid')
                        THEN ((storage.foldername(storage.objects.name))[1])::uuid END
        AND public.is_studio_comember(p.designer_id)
    )
  );

DROP POLICY IF EXISTS "Designers manage discovery folio objects" ON storage.objects;
CREATE POLICY "Designers manage discovery folio objects"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.designer_clients dc
      WHERE dc.id = CASE WHEN pg_input_is_valid((storage.foldername(storage.objects.name))[1], 'uuid')
                         THEN ((storage.foldername(storage.objects.name))[1])::uuid END
        AND public.is_design_studio_comember(dc.designer_id)
    )
  )
  WITH CHECK (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.designer_clients dc
      WHERE dc.id = CASE WHEN pg_input_is_valid((storage.foldername(storage.objects.name))[1], 'uuid')
                         THEN ((storage.foldername(storage.objects.name))[1])::uuid END
        AND public.is_design_studio_comember(dc.designer_id)
    )
  );

DROP POLICY IF EXISTS "Designers manage proposal folio objects" ON storage.objects;
CREATE POLICY "Designers manage proposal folio objects"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.proposals pr
      WHERE pr.id = CASE WHEN pg_input_is_valid((storage.foldername(storage.objects.name))[1], 'uuid')
                         THEN ((storage.foldername(storage.objects.name))[1])::uuid END
        AND public.is_design_studio_comember(pr.designer_id)
    )
  )
  WITH CHECK (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.proposals pr
      WHERE pr.id = CASE WHEN pg_input_is_valid((storage.foldername(storage.objects.name))[1], 'uuid')
                         THEN ((storage.foldername(storage.objects.name))[1])::uuid END
        AND public.is_design_studio_comember(pr.designer_id)
    )
  );

DROP POLICY IF EXISTS "Clients read flagged proposal folio objects" ON storage.objects;
CREATE POLICY "Clients read flagged proposal folio objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1
      FROM public.proposals pr
      JOIN public.project_documents pd
        ON pd.proposal_id = pr.id
       AND pd.storage_path = storage.objects.name
       AND pd.client_visible = true
      WHERE pr.id = CASE WHEN pg_input_is_valid((storage.foldername(storage.objects.name))[1], 'uuid')
                         THEN ((storage.foldername(storage.objects.name))[1])::uuid END
        AND pr.client_id = auth.uid()
    )
  );
