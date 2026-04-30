-- Fix infinite recursion in project_team_members SELECT policy.
-- The policy added in 00084_project_management_mvp.sql ("Team members can view
-- project membership") references project_team_members from inside its own
-- USING clause, so PostgREST/psql trips error 42P17 on every SELECT.
--
-- Solution mirrors 00068_fix_org_members_rls_recursion.sql: introduce a
-- SECURITY DEFINER helper that bypasses RLS to perform the membership check,
-- then rewrite the policy to call it.

CREATE OR REPLACE FUNCTION is_project_team_member(
  _project_id UUID,
  _user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_team_members
    WHERE project_id = _project_id
      AND user_id = _user_id
      AND removed_at IS NULL
  );
$$;

DROP POLICY IF EXISTS "Team members can view project membership" ON project_team_members;

CREATE POLICY "Team members can view project membership"
  ON project_team_members FOR SELECT
  USING (
    is_project_team_member(project_id)
  );
