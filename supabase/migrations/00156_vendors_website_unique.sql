-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00156: vendors.website case-insensitive UNIQUE index
--
-- Locks in the race-safe vendor resolution path called out in PRD §2.13
-- (Sprint 2 S2.8). The non-unique companion index from migration 00152
-- is dropped and replaced. With this constraint in place:
--
--   • Two concurrent captures of the same vendor domain converge —
--     the second INSERT raises 23505 and resolveVendor() falls back
--     to the SELECT path it already implements.
--   • The dev seed (supabase/seed/vendors.sql) was de-duplicated in
--     the same change so the constraint applies to a clean dataset.
--     Placeholder rows that previously shared a website now store
--     NULL; the WHERE clause keeps the constraint scoped so NULL
--     rows coexist freely.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP INDEX IF EXISTS idx_vendors_website_lower;

CREATE UNIQUE INDEX idx_vendors_website_lower
  ON vendors(lower(website))
  WHERE website IS NOT NULL;

COMMENT ON INDEX idx_vendors_website_lower IS
  'Case-insensitive UNIQUE on vendor website. Enables ON CONFLICT race recovery in resolveVendor(). NULL website rows are allowed in unlimited quantity.';

COMMIT;
