-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Allow Designers to Create Client Profiles
-- Description: Add RLS policy for designers to create homeowner profiles
-- ═══════════════════════════════════════════════════════════════════════════

-- Allow authenticated users (designers) to create profiles for homeowners
-- This enables the "Add Client" feature where designers can invite/add clients
CREATE POLICY "Designers can create homeowner profiles" ON profiles
  FOR INSERT
  WITH CHECK (
    -- User must be authenticated
    auth.uid() IS NOT NULL
    -- Can only create homeowner role profiles (not designers/admins)
    AND role = 'homeowner'
  );

-- Allow designers to update client profiles they manage
-- (Linked through designer_clients table)
CREATE POLICY "Designers can update their client profiles" ON profiles
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM designer_clients dc
      WHERE dc.client_id = profiles.id
      AND dc.designer_id = auth.uid()
    )
  );
