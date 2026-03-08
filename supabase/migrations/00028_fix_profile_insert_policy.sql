-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Fix Profile Insert Policy
-- Description: Fix RLS policy for profile creation during auth signup
-- The original policy checked auth.uid() = id, which fails during signup
-- because the session isn't established yet when the trigger runs.
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop the problematic INSERT policy
DROP POLICY IF EXISTS "Profiles are created by trigger" ON profiles;

-- Create a new policy that allows service role inserts (for the trigger)
-- The trigger runs with SECURITY DEFINER which bypasses RLS, but we also
-- need a policy for manual profile creation if needed
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (
    -- Allow if user is authenticated and creating their own profile
    auth.uid() = id
    -- OR allow if called from trigger/service role (auth.uid() may be null during signup)
    OR auth.uid() IS NULL
  );

-- Also ensure the trigger function properly handles conflicts
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
    updated_at = NOW();
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail user creation
  RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
