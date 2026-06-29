-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00232: Products — field-capture origin columns
--
-- Adds capture-provenance columns to products so a row created from the
-- Patina Field Capture iOS app can be traced back to its originating
-- field_captures inbox row, alongside the existing web-extension / portal /
-- manual / import provenance. Additive only — does NOT touch source_url
-- (already nullable since 00060; URL-less field-capture rows are expected).
--
-- The field_captures table itself (and the products.field_capture_id FK) is
-- created in 00233, after the target table exists.
--
-- Backend workstream for the "Patina Field Capture" iOS app (branch
-- capture/foundation). Companion migrations: 00233 (inbox table + FK + RLS),
-- 00234 (capture-media storage bucket), 00235 (commit/route/dismiss RPCs).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS capture_source      TEXT,
  ADD COLUMN IF NOT EXISTS capture_provenance  JSONB,
  ADD COLUMN IF NOT EXISTS field_capture_id    UUID;

-- Allowed capture-origin vocabulary. NULL is permitted (legacy/unattributed
-- rows). New attributions use one of the five known surfaces.
ALTER TABLE products
  ADD CONSTRAINT products_capture_source_check
    CHECK (
      capture_source IS NULL
      OR capture_source IN ('web_extension', 'portal', 'field_capture', 'manual', 'import')
    );

-- Soft guard: a field-captured product must be a personal-layer row with an
-- owner. NOT VALID — existing rows are not re-checked (none have
-- capture_source set yet), but every new INSERT/UPDATE is enforced. This is a
-- belt-and-suspenders companion to products_personal_requires_owner (00152);
-- it intentionally does NOT require source_url (field captures have no URL).
ALTER TABLE products
  ADD CONSTRAINT products_field_capture_requires_source
    CHECK (
      capture_source IS DISTINCT FROM 'field_capture'
      OR (layer = 'personal' AND owner_user_id IS NOT NULL)
    )
    NOT VALID;

-- Reverse lookup capture → product.
CREATE INDEX IF NOT EXISTS idx_products_field_capture
  ON products(field_capture_id)
  WHERE field_capture_id IS NOT NULL;

COMMENT ON COLUMN products.capture_source IS
  'Origin surface of this product row: web_extension | portal | field_capture | manual | import. NULL for legacy/unattributed rows.';
COMMENT ON COLUMN products.capture_provenance IS
  'Free-form JSONB provenance bundle copied from the originating capture (device, venue, guesses, etc.). For field_capture rows this mirrors field_captures.provenance.';
COMMENT ON COLUMN products.field_capture_id IS
  'Back-reference to the field_captures inbox row this product was committed from. FK added in 00233. NULL for non-field-capture origins.';

COMMIT;
