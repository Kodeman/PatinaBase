-- ═══════════════════════════════════════════════════════════════════════════
-- 00582 — Studio co-members reach the Discovery section (row + folio)
--
-- Lineage: 00224 (client_discovery, and the discovery-folio legs it added to
-- project_documents — all owner-only) → 00315 (co-membership helpers) → 00316
-- (the shared-workspace widening that reached designer_clients, leads,
-- client_decisions and the designer_clients-parented child fleet) → 00399
-- (is_design_studio_comember) → 00425 (the same widening for the PROPOSAL
-- folio legs on project_documents) → this file.
--
-- Reconciles: 00316 widened the designer domain table by table and did not
-- enumerate `client_discovery` — the table 00224 had added, denormalizing
-- `designer_id` onto it for "the simplest RLS". The omission is load-bearing in
-- production. A studio co-member opening a colleague's Discovery engagement
-- cannot SELECT the existing row (the engagement itself is visible, via 00316's
-- designer_clients_studio_rw), so the Discovery section reads empty and
-- auto-upserts a prefill carrying the engagement owner's designer_id, which the
-- owner-only WITH CHECK then rejects:
--   new row violates row-level security policy for table "client_discovery"
--
-- The same omission runs through the discovery FOLIO legs on
-- project_documents: 00224 keyed them on `dc.designer_id = auth.uid()` exactly,
-- while 00425 widened the proposal-folio legs on the SAME table to
-- is_design_studio_comember. This file brings the discovery legs to the shape
-- their proposal siblings already have.
--
-- Two different helpers, deliberately — each table matches the neighbour a
-- reader will compare it against:
--   • client_discovery uses is_studio_comember (00315), the helper
--     designer_clients_studio_rw (00316) uses, so an engagement and its
--     discovery row admit exactly the same people. A row visible on one and
--     invisible on the other is the bug being fixed.
--   • the project_documents legs use is_design_studio_comember (00399), the
--     helper the proposal-folio legs on that table already use (00425), so one
--     table does not carry two different co-membership tests for one verb.
-- Both helpers admit the owner themselves (p_owner = auth.uid()), so no access
-- that worked before is withdrawn.
--
-- Additive only: 00224's owner policy on client_discovery stays; the narrower
-- "Designers view discovery folio" SELECT leg stays (permissive policies OR, so
-- it can only admit a subset of the widened FOR ALL leg); no client/homeowner
-- leg is touched. The storage.objects discovery-folio leg (00224:165) is NOT
-- widened here — it is outside the reported failure.
--
-- No GRANT/REVOKE (policies only) → no seed/00-legacy-grants.sql regeneration.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── client_discovery — the studio leg (00224's owner policy stays) ─────────
DROP POLICY IF EXISTS client_discovery_studio_rw ON public.client_discovery;
CREATE POLICY client_discovery_studio_rw ON public.client_discovery
  FOR ALL TO authenticated
  USING (public.is_studio_comember(designer_id))
  WITH CHECK (public.is_studio_comember(designer_id));

-- ─── project_documents — the discovery folio, regrafted whole ──────────────
-- 00224 is the only prior definition of either name; these are their heads.
DROP POLICY IF EXISTS "Designers manage discovery folio" ON public.project_documents;
CREATE POLICY "Designers manage discovery folio"
  ON public.project_documents FOR ALL TO authenticated
  USING (
    designer_client_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.designer_clients dc
      WHERE dc.id = project_documents.designer_client_id
        AND public.is_design_studio_comember(dc.designer_id)
    )
  )
  WITH CHECK (
    designer_client_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.designer_clients dc
      WHERE dc.id = project_documents.designer_client_id
        AND public.is_design_studio_comember(dc.designer_id)
    )
  );

DROP POLICY IF EXISTS "Designers view discovery folio" ON public.project_documents;
CREATE POLICY "Designers view discovery folio"
  ON public.project_documents FOR SELECT TO authenticated
  USING (
    designer_client_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.designer_clients dc
      WHERE dc.id = project_documents.designer_client_id
        AND public.is_design_studio_comember(dc.designer_id)
    )
  );

COMMENT ON POLICY client_discovery_studio_rw ON public.client_discovery IS
  '00582: studio co-members of the engagement''s designer read and write the Discovery row, matching designer_clients_studio_rw (00316) so the engagement and its discovery capture admit the same people.';
