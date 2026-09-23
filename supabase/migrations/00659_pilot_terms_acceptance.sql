-- ═══════════════════════════════════════════════════════════════════════════
-- 00659 — Record a designer's acceptance of the free 90-day pilot terms
-- Lineage: no function is redefined. profiles column history for the same
--   "stamp when the member agreed to something once" shape: 00618
--   (time_autostart_disclosed_at). This file only adds two columns.
-- Reconciles: nothing.
--
-- Why: the studio-hook program (Deploy 2, row P2b) puts the pilot terms on the
--   referral path. `designer-invite` lands a new designer at
--   /auth/callback?next=/desk, which until now showed no terms and stored no
--   acceptance. The designer portal interposes one acceptance step there and
--   stamps it here.
--
-- Shape: two nullable columns on profiles, no new table. Acceptance is a single
--   fact about one person, it happens at most once per terms version, and it is
--   read on the sign-in leg where a second table would mean a second round
--   trip. NULL is the whole "has not accepted" state — there is no default to
--   backfill and nothing to migrate: every existing profile is correctly
--   un-accepted, and the portal's gate additionally skips anyone who already
--   holds an active studio membership, so no member of an existing studio is
--   ever interrupted by the step.
--
-- Version string: the portal writes '2026-09-free-90' (the free, 90-day terms
--   published at /pilot-terms). The column is free text rather than an enum so
--   a later revision of the terms is a new string, not a migration.
--
-- Grants: none added. 00555:844 grants SELECT, INSERT, UPDATE on
--   public.profiles to authenticated at TABLE level, not per column, so both
--   columns are reachable by the member through the existing "Users can update
--   own profile" policy (00021, ratcheted in 00555) and by nobody else.
--   Because this file adds no GRANT/REVOKE, seed/00-legacy-grants.sql does not
--   need regenerating.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pilot_terms_accepted_at timestamptz;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pilot_terms_version text;

COMMENT ON COLUMN public.profiles.pilot_terms_accepted_at IS
  'P2b (00659): when this designer accepted the pilot terms shown on the '
  'referral path. NULL = never accepted, which is the state of every profile '
  'that predates this column. Written by the member on her own profile through '
  'the "Users can update own profile" policy; nobody else''s stamp is '
  'reachable.';
COMMENT ON COLUMN public.profiles.pilot_terms_version IS
  'P2b (00659): which published pilot terms were accepted — ''2026-09-free-90'' '
  'for the free, 90-day terms at /pilot-terms. Free text, not an enum, so a '
  'later revision of the terms is a new string rather than a migration. NULL '
  'whenever pilot_terms_accepted_at is NULL.';

-- ── Probe the objects, not the ledger ──────────────────────────────────────
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'pilot_terms_accepted_at'
      AND data_type = 'timestamp with time zone'
      AND is_nullable = 'YES'
      AND column_default IS NULL),
    '00659: pilot_terms_accepted_at must be a NULLABLE timestamptz with no '
    'default — NULL is the "has not accepted" state, and any default would '
    'stamp every existing profile as having agreed to terms it never saw';
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'pilot_terms_version'
      AND data_type = 'text'
      AND is_nullable = 'YES'
      AND column_default IS NULL),
    '00659: pilot_terms_version must be NULLABLE text with no default';
END $$;
