-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Add full_name to profiles
-- Description: Add full_name column to profiles table for client management
-- ═══════════════════════════════════════════════════════════════════════════

-- Add full_name column (separate from display_name for user-facing name)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Create index for searching by name
CREATE INDEX IF NOT EXISTS idx_profiles_full_name ON profiles(full_name);

-- Update existing profiles to copy display_name to full_name if display_name exists
UPDATE profiles SET full_name = display_name WHERE full_name IS NULL AND display_name IS NOT NULL;
