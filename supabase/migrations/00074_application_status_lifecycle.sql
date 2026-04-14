-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Application Status Lifecycle
-- Description: Extends status vocabulary to include waitlisted, onboarding,
-- and active — matching the Founding Circle PRD lifecycle:
--   pending → in_review → approved → onboarding → active
--                       ↘ waitlisted
--                       ↘ rejected
--                       ↘ archived (admin hygiene)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE founding_designer_applications
  DROP CONSTRAINT IF EXISTS founding_designer_applications_status_check;

ALTER TABLE founding_designer_applications
  ADD CONSTRAINT founding_designer_applications_status_check
  CHECK (status IN (
    'pending', 'in_review', 'approved', 'waitlisted', 'rejected',
    'onboarding', 'active', 'archived'
  ));

ALTER TABLE maker_applications
  DROP CONSTRAINT IF EXISTS maker_applications_status_check;

ALTER TABLE maker_applications
  ADD CONSTRAINT maker_applications_status_check
  CHECK (status IN (
    'pending', 'in_review', 'approved', 'waitlisted', 'rejected',
    'onboarding', 'active', 'archived'
  ));
