-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Add is_designer to Profiles
-- Description: Adds a boolean is_designer column for easy designer searches
-- The iOS app queries profiles with .eq("is_designer", true) for designer search
-- ═══════════════════════════════════════════════════════════════════════════

-- Add is_designer column to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_designer BOOLEAN DEFAULT false;

-- Create partial index for efficient designer lookups
CREATE INDEX IF NOT EXISTS idx_profiles_is_designer
ON profiles(is_designer)
WHERE is_designer = true;

-- Update existing designers based on role
-- This ensures any users with role='designer' have the flag set
UPDATE profiles
SET is_designer = true
WHERE role = 'designer' AND (is_designer IS NULL OR is_designer = false);

-- Add comment for documentation
COMMENT ON COLUMN profiles.is_designer IS 'Boolean flag for designer accounts, enables efficient search filtering';
