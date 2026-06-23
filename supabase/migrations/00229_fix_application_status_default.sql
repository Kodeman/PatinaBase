-- ═══════════════════════════════════════════════════════════════════════════
-- 00229 — fix_application_status_default: 'new' → 'pending' initial state
--
-- With the lifecycle values now present (00228), repoint both application
-- tables' status default from the out-of-vocab 'new' (which the 00074 CHECK
-- forbids and the admin "pending" queue doesn't recognise) to the lifecycle's
-- initial state 'pending', and remap any rows still carrying 'new'. After this,
-- the marketing site's /api/designers-apply and /api/makers-apply inserts (which
-- rely on the column default) succeed. Separate from 00228 so the freshly added
-- 'pending' value is usable. Idempotent / additive (D7).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE founding_designer_applications
  ALTER COLUMN status SET DEFAULT 'pending'::application_review_status;

ALTER TABLE maker_applications
  ALTER COLUMN status SET DEFAULT 'pending'::application_review_status;

UPDATE founding_designer_applications
  SET status = 'pending'::application_review_status, updated_at = NOW()
  WHERE status::text = 'new';

UPDATE maker_applications
  SET status = 'pending'::application_review_status, updated_at = NOW()
  WHERE status::text = 'new';
