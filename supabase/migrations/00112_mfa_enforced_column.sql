-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: profiles.mfa_enforced
-- Description: Per-user toggle that, when true, requires the user to complete
--              MFA enrollment + AAL2 sign-in before reaching any protected
--              admin route. Enforcement is performed at the admin portal
--              middleware layer (Supabase Auth's built-in factors list +
--              AAL claims). Default false; super_admins toggle this on a
--              per-user basis.
--
--              Phase 2 will add role-level enforcement via roles.requires_mfa.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mfa_enforced boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.mfa_enforced IS
  'When true, the admin portal middleware redirects this user to MFA enrollment if they have no verified factor or are signed in at AAL1.';

CREATE INDEX IF NOT EXISTS idx_profiles_mfa_enforced
  ON public.profiles(mfa_enforced)
  WHERE mfa_enforced = true;
