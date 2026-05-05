-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Backfill user_roles for existing users
-- Description: Ensure every auth.users has at least one user_roles entry,
--              derived from the legacy profiles.role text column. Required
--              so unified portal/extension/iOS auth can rely on the modern
--              user_roles + roles.domain model without falling back to the
--              legacy column.
-- Idempotent: only inserts where (user_id, role_id) does not already exist.
-- ═══════════════════════════════════════════════════════════════════════════

-- Map: profiles.role text → roles.name
--   'admin'     → 'super_admin'        (admin domain)
--   'designer'  → 'independent_designer' (designer domain)
--   'homeowner' → 'app_user'            (consumer domain)
--   anything else (NULL, unknown) → 'app_user' (safe default)

WITH role_lookup AS (
  SELECT
    name,
    id
  FROM roles
  WHERE name IN ('super_admin', 'independent_designer', 'app_user')
),
mapped AS (
  SELECT
    p.id AS user_id,
    CASE
      WHEN p.role = 'admin'     THEN (SELECT id FROM role_lookup WHERE name = 'super_admin')
      WHEN p.role = 'designer'  THEN (SELECT id FROM role_lookup WHERE name = 'independent_designer')
      WHEN p.role = 'homeowner' THEN (SELECT id FROM role_lookup WHERE name = 'app_user')
      ELSE                            (SELECT id FROM role_lookup WHERE name = 'app_user')
    END AS role_id
  FROM profiles p
  WHERE NOT EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id
  )
)
INSERT INTO user_roles (user_id, role_id)
SELECT user_id, role_id
FROM mapped
WHERE role_id IS NOT NULL
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Also catch any auth.users rows that somehow lack a profile entry
-- (shouldn't happen given the trigger in 00013, but defensive).
INSERT INTO profiles (id, email)
SELECT u.id, u.email
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- And give those newly backfilled profiles a default app_user role
INSERT INTO user_roles (user_id, role_id)
SELECT
  p.id,
  (SELECT id FROM roles WHERE name = 'app_user')
FROM profiles p
WHERE NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id)
ON CONFLICT (user_id, role_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER: keep new signups in sync with a default user_roles row
-- ═══════════════════════════════════════════════════════════════════════════
-- The trigger in 00013 (handle_new_user) creates a profile but no role.
-- Extend it: every new auth.users → profiles → user_roles with the legacy
-- profiles.role mapped to a canonical role. Replaces the function in place.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_default_role_id UUID;
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;

  -- Default new signups to 'app_user' (consumer). Role can be elevated later
  -- by an admin or by org membership flow.
  SELECT id INTO v_default_role_id FROM public.roles WHERE name = 'app_user' LIMIT 1;
  IF v_default_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (NEW.id, v_default_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- EXPLICIT SUPER ADMIN GRANT
-- Ensure kody@kochaver.com is the production super_admin even if no row
-- exists yet in user_roles for that user. Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user_id UUID;
  v_role_id UUID;
  v_admin_email CONSTANT TEXT := 'kody@kochaver.com';
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_admin_email) LIMIT 1;
  SELECT id INTO v_role_id FROM public.roles WHERE name = 'super_admin' LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Skipping super_admin grant: % not found in auth.users', v_admin_email;
    RETURN;
  END IF;
  IF v_role_id IS NULL THEN
    RAISE NOTICE 'Skipping super_admin grant: super_admin role missing from roles table';
    RETURN;
  END IF;

  -- Ensure profile exists (handle_new_user trigger handles new users; this
  -- catches the rare case where the trigger missed an old user).
  INSERT INTO public.profiles (id, email)
  VALUES (v_user_id, v_admin_email)
  ON CONFLICT (id) DO NOTHING;

  -- Grant super_admin (idempotent via unique constraint on user_roles).
  INSERT INTO public.user_roles (user_id, role_id)
  VALUES (v_user_id, v_role_id)
  ON CONFLICT (user_id, role_id) DO NOTHING;

  -- Also reflect in the legacy profiles.role column for any old code paths
  -- that still branch on it.
  UPDATE public.profiles SET role = 'admin' WHERE id = v_user_id AND role IS DISTINCT FROM 'admin';
END $$;
