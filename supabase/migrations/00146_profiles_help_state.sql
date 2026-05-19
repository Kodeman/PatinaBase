-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Profiles Help State (Sprint 4 / Task S4-1)
-- Description: Add help_state JSONB column to public.profiles so the Help &
--   Guidance System persists tour completions, abandonments, and feature
--   announcement dismissals cross-device. Previously each surface stored its
--   own state in browser localStorage / iOS UserDefaults — a designer who
--   skipped the welcome tour on the iPhone could still get ambushed on the
--   laptop the next morning. With this column the "Dismissed means dismissed"
--   rule from spec §4.7 holds across devices.
--
--   localStorage / UserDefaults remain the anonymous / offline fallback so
--   pre-signup or air-gapped sessions still get one-shot semantics.
--
-- Shape (JSONB):
--   {
--     "tours": {
--       "<tourId>": {
--         "completed":  boolean | undefined,
--         "abandoned":  boolean | undefined,
--         "launched":   boolean | undefined,  // iOS only — distinguishes
--                                              // first-launch from resumed.
--         "atStep":     integer | undefined,
--         "completedAt": ISO-8601 string | undefined,
--         "abandonedAt": ISO-8601 string | undefined
--       }
--     },
--     "featureAnnouncements": {
--       "<featureKey>": {
--         "dismissedAt": ISO-8601 string
--       }
--     }
--   }
--
-- RLS: profiles already has "Users can update own profile" (auth.uid() = id)
--   from migration 00013_profiles_table.sql, which covers writes. SELECT is
--   public on profiles by design (directory + search), so any data placed in
--   help_state should be treated as semi-public (no PII beyond per-user UX
--   state). The shape above is metadata only — no message bodies, no PII.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS help_state JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.help_state IS
  'Help & Guidance System cross-device state — tour completions, abandonments, feature-announcement dismissals. Shape: { tours: { <tourId>: { completed, abandoned, launched, atStep, completedAt, abandonedAt } }, featureAnnouncements: { <featureKey>: { dismissedAt } } }. Wire format owned by @patina/help-system. RLS inherits the existing profiles policies (read-anyone, write-self).';
