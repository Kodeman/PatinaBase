-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Website Lead-Capture Attribution Columns
-- Description: Additive columns the marketing site (PatinaWebsite) now persists
--   via its signup routes, so the managed schema matches what the API writes.
--     waitlist:                       gclid, fbclid, channel  (paid-click IDs + channel grouping)
--     maker_applications:             lead_attribution (jsonb), posthog_distinct_id
--     founding_designer_applications: lead_attribution (jsonb), posthog_distinct_id
--
--   lead_attribution is the unified attribution snapshot the application routes
--   build (utm_*, referrer, gclid/fbclid, channel, first_touch, last_touch).
--   posthog_distinct_id mirrors waitlist.posthog_distinct_id so an applicant's
--   pre-application browsing stitches to the same PostHog person. Additive only (D7).
-- ═══════════════════════════════════════════════════════════════════════════

-- Paid-click IDs + computed channel grouping for waitlist (founding) signups.
ALTER TABLE waitlist
  ADD COLUMN IF NOT EXISTS gclid TEXT,
  ADD COLUMN IF NOT EXISTS fbclid TEXT,
  ADD COLUMN IF NOT EXISTS channel TEXT;

-- Unified attribution snapshot + PostHog identity link on application rows.
ALTER TABLE maker_applications
  ADD COLUMN IF NOT EXISTS lead_attribution JSONB,
  ADD COLUMN IF NOT EXISTS posthog_distinct_id TEXT;

ALTER TABLE founding_designer_applications
  ADD COLUMN IF NOT EXISTS lead_attribution JSONB,
  ADD COLUMN IF NOT EXISTS posthog_distinct_id TEXT;

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES  (identity-stitch lookups, mirror waitlist.idx_waitlist_posthog_id)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_maker_applications_posthog_id
  ON maker_applications(posthog_distinct_id);
CREATE INDEX IF NOT EXISTS idx_founding_designer_applications_posthog_id
  ON founding_designer_applications(posthog_distinct_id);
