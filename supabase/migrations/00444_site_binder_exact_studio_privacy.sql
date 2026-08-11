-- =====================================================================================
-- 00444 — Exact design-studio privacy for immutable Site Binder evidence
--
-- Lineage: 00374 created site_binder_entries, its authenticated SELECT policy,
-- and the security-invoker site_binder_current view. 00443 narrowed the four
-- upstream Site Request read policies and checked author rail but intentionally
-- left this direct project-keyed evidence policy unchanged.
--
-- Binder payloads freeze guidance, configuration, delivery payloads, dimensions,
-- and private media provenance. A shared contractor/manufacturer organization
-- must not confer raw Binder access. The view already inherits base-table RLS
-- through security_invoker=true, so only the base policy needs restatement.
-- =====================================================================================

DROP POLICY IF EXISTS site_binder_designer_read
  ON public.site_binder_entries;
CREATE POLICY site_binder_designer_read
  ON public.site_binder_entries FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.projects AS project
    WHERE project.id = site_binder_entries.project_id
      AND public.is_design_studio_comember(project.designer_id)
  ));
