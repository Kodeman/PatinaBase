-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Migrate Existing Users to New Role System
-- Description: Maps profiles.role to user_roles table for existing users
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATE EXISTING USERS
-- Maps existing profiles.role to new user_roles table:
--   'designer' -> 'independent_designer'
--   'homeowner' -> 'app_user'
--   'admin' -> 'super_admin'
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO user_roles (user_id, role_id, granted_at)
SELECT
  p.id,
  CASE p.role
    WHEN 'designer' THEN (SELECT id FROM roles WHERE name = 'independent_designer')
    WHEN 'homeowner' THEN (SELECT id FROM roles WHERE name = 'app_user')
    WHEN 'admin' THEN (SELECT id FROM roles WHERE name = 'super_admin')
    ELSE (SELECT id FROM roles WHERE name = 'app_user')
  END,
  p.created_at
FROM profiles p
WHERE p.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id
  )
ON CONFLICT (user_id, role_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATE TRIGGER: Auto-assign role on new user signup
-- ═══════════════════════════════════════════════════════════════════════════

-- Extend handle_new_user to also create user_role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_default_role_id UUID;
BEGIN
  -- Insert into profiles (existing behavior)
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;

  -- Get the app_user role ID (default for new signups)
  SELECT id INTO v_default_role_id FROM roles WHERE name = 'app_user';

  -- Assign default role to new user
  IF v_default_role_id IS NOT NULL THEN
    INSERT INTO user_roles (user_id, role_id)
    VALUES (NEW.id, v_default_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- HELPER: Grant role to user (for admin use)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION grant_role_to_user(
  p_user_id UUID,
  p_role_name VARCHAR,
  p_granted_by UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_role_id UUID;
BEGIN
  -- Get role ID
  SELECT id INTO v_role_id FROM roles WHERE name = p_role_name AND is_assignable = TRUE;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Role % not found or not assignable', p_role_name;
  END IF;

  -- Insert role assignment
  INSERT INTO user_roles (user_id, role_id, granted_by)
  VALUES (p_user_id, v_role_id, p_granted_by)
  ON CONFLICT (user_id, role_id) DO NOTHING;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- HELPER: Revoke role from user (for admin use)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION revoke_role_from_user(
  p_user_id UUID,
  p_role_name VARCHAR
)
RETURNS BOOLEAN AS $$
DECLARE
  v_role_id UUID;
BEGIN
  -- Get role ID
  SELECT id INTO v_role_id FROM roles WHERE name = p_role_name;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Role % not found', p_role_name;
  END IF;

  -- Delete role assignment
  DELETE FROM user_roles
  WHERE user_id = p_user_id AND role_id = v_role_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTE: profiles.role column is preserved for backward compatibility
-- It can be deprecated in a future migration once all code uses user_roles
-- ═══════════════════════════════════════════════════════════════════════════
