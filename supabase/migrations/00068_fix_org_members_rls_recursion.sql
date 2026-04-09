-- Fix infinite recursion in organization_members RLS policies
-- The admin/owner policies query organization_members to check authorization,
-- which triggers the SELECT policies again, causing infinite recursion.
-- Solution: Use a SECURITY DEFINER function to bypass RLS for the admin check.

-- Create a helper function that checks org admin/owner status without RLS
CREATE OR REPLACE FUNCTION is_org_admin_or_owner(
  _organization_id UUID,
  _user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = _organization_id
    AND user_id = _user_id
    AND role IN ('owner', 'admin')
    AND status = 'active'
  );
$$;

-- Drop the recursive policies
DROP POLICY IF EXISTS "Org admins can view all members" ON organization_members;
DROP POLICY IF EXISTS "Org owners can insert members" ON organization_members;
DROP POLICY IF EXISTS "Org admins can update members" ON organization_members;
DROP POLICY IF EXISTS "Org admins can delete members" ON organization_members;

-- Recreate policies using the SECURITY DEFINER helper function
CREATE POLICY "Org admins can view all members" ON organization_members
  FOR SELECT USING (
    is_org_admin_or_owner(organization_id)
  );

CREATE POLICY "Org owners can insert members" ON organization_members
  FOR INSERT WITH CHECK (
    -- Either creating self as owner (during org creation)
    (user_id = auth.uid() AND role = 'owner')
    OR
    -- Or admin adding members
    is_org_admin_or_owner(organization_id)
  );

CREATE POLICY "Org admins can update members" ON organization_members
  FOR UPDATE USING (
    is_org_admin_or_owner(organization_id)
  );

CREATE POLICY "Org admins can delete members" ON organization_members
  FOR DELETE USING (
    is_org_admin_or_owner(organization_id)
  );
