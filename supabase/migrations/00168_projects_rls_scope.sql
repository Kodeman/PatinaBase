-- AP-SEC1: Scope the projects-table RLS.
--
-- The projects table shipped with a single wide-open policy
-- ("Allow authenticated access to projects", cmd = ALL, USING (true)), which
-- let ANY authenticated user SELECT / INSERT / UPDATE / DELETE ANY project —
-- a designer could read and modify another designer's projects, and a client
-- could too. This replaces it with ownership-scoped policies that mirror the
-- already-correct policies on project_rooms / project_ffe_items.
--
-- Safe because:
--   * activate_project_v2 / activate_proposal_as_project are SECURITY DEFINER
--     and bypass RLS for their inserts (verified via pg_proc.prosecdef).
--   * is_project_team_member() is SECURITY DEFINER (00087), so referencing it
--     here does NOT re-introduce the projects <-> project_team_members
--     recursion that 00087 fixed.
--   * service_role retains full access via an explicit bypass policy, matching
--     the pattern used elsewhere in the schema.

DROP POLICY IF EXISTS "Allow authenticated access to projects" ON public.projects;

-- service_role / server-side (admin portal, edge functions) — full access.
CREATE POLICY "Service role full access to projects"
  ON public.projects FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- SELECT: the lead designer, the project's client, or an active team member.
CREATE POLICY "Project participants can view projects"
  ON public.projects FOR SELECT
  USING (
    designer_id = auth.uid()
    OR client_id = auth.uid()
    OR is_project_team_member(id)
  );

-- INSERT: only as the lead designer. (Activation RPCs are SECURITY DEFINER and
-- bypass this; service_role is covered by the policy above.)
CREATE POLICY "Lead designer can create projects"
  ON public.projects FOR INSERT
  WITH CHECK (designer_id = auth.uid());

-- UPDATE: lead designer only (edit, status changes, completion, bulk archive).
CREATE POLICY "Lead designer can update projects"
  ON public.projects FOR UPDATE
  USING (designer_id = auth.uid())
  WITH CHECK (designer_id = auth.uid());

-- DELETE: lead designer only.
CREATE POLICY "Lead designer can delete projects"
  ON public.projects FOR DELETE
  USING (designer_id = auth.uid());
