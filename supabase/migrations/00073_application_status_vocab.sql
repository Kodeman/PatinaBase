-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Expand application status vocabulary
-- Description: The legacy CHECK constraints on founding_designer_applications
-- and maker_applications only allowed pending/reviewed/accepted/declined.
-- The new admin UI uses pending/in_review/approved/rejected/archived. This
-- migration remaps legacy rows and replaces the constraint.
-- ═══════════════════════════════════════════════════════════════════════════

-- Designer applications -------------------------------------------------------

ALTER TABLE founding_designer_applications
  DROP CONSTRAINT IF EXISTS founding_designer_applications_status_check;

UPDATE founding_designer_applications
SET status = (CASE status::text
  WHEN 'reviewed' THEN 'in_review'
  WHEN 'accepted' THEN 'approved'
  WHEN 'declined' THEN 'rejected'
  ELSE status::text
END)::application_review_status
WHERE status::text IN ('reviewed', 'accepted', 'declined');

ALTER TABLE founding_designer_applications
  ADD CONSTRAINT founding_designer_applications_status_check
  CHECK (status::text IN ('pending', 'in_review', 'approved', 'rejected', 'archived'));

-- Maker applications ----------------------------------------------------------

ALTER TABLE maker_applications
  DROP CONSTRAINT IF EXISTS maker_applications_status_check;

UPDATE maker_applications
SET status = (CASE status::text
  WHEN 'reviewed' THEN 'in_review'
  WHEN 'accepted' THEN 'approved'
  WHEN 'declined' THEN 'rejected'
  ELSE status::text
END)::application_review_status
WHERE status::text IN ('reviewed', 'accepted', 'declined');

ALTER TABLE maker_applications
  ADD CONSTRAINT maker_applications_status_check
  CHECK (status::text IN ('pending', 'in_review', 'approved', 'rejected', 'archived'));
