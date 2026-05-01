-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Add FK vendor_reviews.designer_id → profiles(id)
-- ═══════════════════════════════════════════════════════════════════════════
-- The vendor_reviews table stores designer_id but had no FK to profiles, so
-- PostgREST couldn't resolve a relationship for embedded selects. The hook
-- previously embedded a non-existent `designers` table; fixing the hook to
-- embed `profiles` requires this FK to exist.

ALTER TABLE vendor_reviews
  ADD CONSTRAINT vendor_reviews_designer_id_fkey
  FOREIGN KEY (designer_id) REFERENCES profiles(id) ON DELETE CASCADE;
